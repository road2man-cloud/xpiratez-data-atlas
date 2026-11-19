"""Native X-Piratez cumulative-release guard and safe Windows installer.

Audit: validates executable lineage, archive member identity, and patch source
contracts. Activate: atomically installs an audited binary and updates the
game's latest launcher without touching save games.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys


class ReleaseError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as src:
        for block in iter(lambda: src.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def archive_members(path: Path) -> dict[str, str]:
    """GNU/BSD ar object-name to content SHA-256 map, rejecting duplicates."""
    data = path.read_bytes()
    if not data.startswith(b"!<arch>\n"):
        raise ReleaseError(f"Invalid ar magic: {path}")
    pos, names, out = 8, b"", {}
    while pos < len(data):
        if pos + 60 > len(data):
            raise ReleaseError(f"Truncated ar header: {path}")
        head = data[pos:pos + 60]
        if head[58:60] != bytes((96, 10)):
            raise ReleaseError(f"Invalid ar header terminator: {path}")
        pos += 60
        raw_name = head[:16].decode("ascii").strip()
        try:
            size = int(head[48:58].strip())
        except ValueError as exc:
            raise ReleaseError(f"Invalid ar member length: {path}") from exc
        if size < 0 or pos + size > len(data):
            raise ReleaseError(f"Truncated ar member: {path}")
        blob = data[pos:pos + size]
        pos += size + (size % 2)
        if raw_name == "//":
            names = blob
            continue
        if raw_name in {"/", "/SYM64/", "__.SYMDEF", "__.SYMDEF SORTED"}:
            continue
        if raw_name.startswith("/") and raw_name[1:].isdigit():
            offset = int(raw_name[1:])
            if offset >= len(names):
                raise ReleaseError(f"Invalid ar long-name reference: {path}")
            name = names[offset:].split(b"/\n", 1)[0].decode("utf-8")
        elif raw_name.startswith("#1/"):
            n = int(raw_name[3:])
            if n > len(blob):
                raise ReleaseError(f"Invalid ar BSD name: {path}")
            name = blob[:n].decode("utf-8")
            blob = blob[n:]
        else:
            name = raw_name.rstrip("/")
        if name in out:
            raise ReleaseError(f"Duplicate ar object: {name}")
        out[name] = hashlib.sha256(blob).hexdigest().upper()
    return out


def read_manifest(path: Path) -> dict:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    required = (
        "release_id", "parent_exe", "parent_exe_sha256",
        "parent_archive", "output_archive", "output_exe",
        "object_count", "expected_changed_objects", "source_contracts",
        "install_dir", "launcher_name", "expected_active_launcher"
    )
    missing = [name for name in required if name not in manifest]
    if missing:
        raise ReleaseError(f"Missing manifest keys: {missing}")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{2,90}", manifest["release_id"]):
        raise ReleaseError("Unsafe release_id")
    if not isinstance(manifest["source_contracts"], list) or not manifest["source_contracts"]:
        raise ReleaseError("A release must declare at least one source feature contract")
    if not isinstance(manifest["expected_changed_objects"], list):
        raise ReleaseError("expected_changed_objects must be a list")
    launcher_name = manifest["launcher_name"]
    if Path(launcher_name).name != launcher_name or not launcher_name.endswith(".cmd"):
        raise ReleaseError("Unsafe launcher_name")
    return manifest


def audit(spec: dict) -> dict:
    paths = {
        k: Path(spec[k]) for k in (
            "parent_exe", "parent_archive", "output_archive", "output_exe"
        )
    }
    for key, path in paths.items():
        if not path.is_file():
            raise ReleaseError(f"Missing {key}: {path}")
    parent_sha = sha256(paths["parent_exe"])
    if parent_sha != spec["parent_exe_sha256"].upper():
        raise ReleaseError("Parent executable hash mismatch")
    exe_hash = sha256(paths["output_exe"])
    if spec.get("expected_output_sha256") and exe_hash != spec["expected_output_sha256"].upper():
        raise ReleaseError("Output executable hash mismatch")
    parent = archive_members(paths["parent_archive"])
    current = archive_members(paths["output_archive"])
    target = int(spec["object_count"])
    if len(parent) != target or len(current) != target:
        raise ReleaseError(f"Archive objects changed: {len(parent)} -> {len(current)}; expected {target}")
    if list(parent) != list(current):
        raise ReleaseError("Archive member names or link order changed")
    changed = sorted(name for name in parent if parent[name] != current[name])
    expected = sorted(set(spec["expected_changed_objects"]))
    if changed != expected:
        raise ReleaseError(f"Unexpected archive diff: expected {expected}, got {changed}")
    features = {}
    for contract in spec["source_contracts"]:
        name, path = contract["name"], Path(contract["path"])
        if not path.is_file():
            raise ReleaseError(f"Missing feature source {name}: {path}")
        content = path.read_text(encoding="utf-8")
        missing = [s for s in contract["contains"] if s not in content]
        forbidden = [s for s in contract.get("not_contains", []) if s in content]
        if missing or forbidden:
            raise ReleaseError(f"Missing feature {name}, absent={missing}, forbidden={forbidden}")
        features[name] = {"passed": True, "tokens": len(contract["contains"])}
    return {
        "release_id": spec["release_id"],
        "result": "PASS",
        "checked_utc": datetime.now(timezone.utc).isoformat(),
        "parent_exe_sha256": parent_sha,
        "exe_sha256": exe_hash,
        "archive_members": len(current),
        "unchanged_objects": len(current) - len(changed),
        "changed_objects": changed,
        "features": features,
        "gameplay_verified": False,
    }


def atomic_text(path: Path, content: str) -> None:
    staging = path.with_name(path.name + f".pending.{os.getpid()}")
    try:
        staging.write_bytes(content.encode("ascii"))
        os.replace(staging, path)
    finally:
        if staging.exists():
            staging.unlink()


def activate(spec: dict, report: dict) -> dict:
    """Audited EXE installation with old live launcher lease and backup."""
    game = Path(spec["install_dir"])
    if not game.is_dir():
        raise ReleaseError("Game install directory missing")
    latest = game / "XPZ_LATEST_INTEGRATED.cmd"
    if not latest.is_file():
        raise ReleaseError("Latest launcher missing")
    old_bytes = latest.read_bytes()
    old = old_bytes.decode("ascii")
    if spec["expected_active_launcher"] not in old:
        raise ReleaseError("Live launcher no longer points to expected predecessor")
    if spec.get("expected_active_sha256") and sha256(latest) != spec["expected_active_sha256"].upper():
        raise ReleaseError("Live launcher SHA changed")
    build_exe = Path(spec["output_exe"])
    target = game / build_exe.name
    expected = report["exe_sha256"]
    if target.exists() and sha256(target) != expected:
        raise ReleaseError("Target EXE exists with different bytes")
    launcher = game / spec["launcher_name"]
    launch_script = (
        '@echo off\r\ncd /d "%~dp0"\r\n'
        f'start "" "%~dp0{build_exe.name}"\r\n'
    )
    if launcher.exists() and launcher.read_bytes() != launch_script.encode("ascii"):
        raise ReleaseError("Target launcher collision")
    backup = game / f"XPZ_LATEST_INTEGRATED.before_{spec['release_id']}.cmd"
    if backup.exists() and backup.read_bytes() != old_bytes:
        raise ReleaseError("Predecessor launcher backup collision")
    if not target.exists():
        tmp = target.with_name(target.name + f".pending.{os.getpid()}")
        try:
            shutil.copyfile(build_exe, tmp)
            if sha256(tmp) != expected:
                raise ReleaseError("Staged executable hash mismatch")
            os.replace(tmp, target)
        finally:
            if tmp.exists():
                tmp.unlink()
    if not launcher.exists():
        atomic_text(launcher, launch_script)
    if not backup.exists():
        atomic_text(backup, old)
    if latest.read_bytes() != old_bytes:
        raise ReleaseError("Launcher changed while staging release")
    active = (
        '@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n'
        f'call "%~dp0{spec["launcher_name"]}" %*\r\n'
        'exit /b %ERRORLEVEL%\r\n'
    )
    atomic_text(latest, active)
    if sha256(target) != expected:
        raise ReleaseError("Installed EXE hash mismatch")
    return {**report, "installed_exe": str(target), "launcher": str(latest), "backup": str(backup)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("audit", "activate"))
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    try:
        spec = read_manifest(args.manifest)
        result = audit(spec)
        if args.action == "activate":
            result = activate(spec, result)
        receipt = args.manifest.with_suffix("." + args.action + ".receipt.json")
        receipt.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except (ReleaseError, OSError, ValueError, KeyError, UnicodeError) as exc:
        print(f"RELEASE BLOCKED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
