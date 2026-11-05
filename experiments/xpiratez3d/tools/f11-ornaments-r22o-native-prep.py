#!/usr/bin/env python3
"""Private r22-O additive art test engine: one hash-allowlist replacement.

Use a verified source-built r21E S2 engine; alter only its embedded expected
texture SHA-256 literal so it can load a new face/garment-preserving atlas.
Do NOT rebuild shared source or overwrite any other worker's executable.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(r"D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102")
SHA = lambda b: hashlib.sha256(b).hexdigest()


def require(ok, message):
    if not ok:
        raise RuntimeError("F11_R22O_ENGINE_REJECT: "+message)


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--art", type=Path,
                   default=ROOT/"stage32i-art-r22o-collab-native-f11")
    a.add_argument("--engine", type=Path,
                   default=ROOT/"stage32i-r21e-native-engine")
    a.add_argument("--dest", type=Path,
                   default=ROOT/"stage32i-r22o-collab-native-engine")
    o = a.parse_args()
    require(not o.dest.exists(), "Private engine already exists")
    artfiles = list(o.art.glob("source-f11-*-manifest.json"))
    require(len(artfiles) == 1, "One private F11 patch manifest required")
    art = json.loads(artfiles[0].read_text(encoding="utf-8-sig"))
    base = json.loads((o.engine/"engine-build-receipt.json").read_text())
    source = Path(base["executable"])
    original = source.read_bytes()
    require(SHA(original) == base["sha256"], "Source-built engine mismatch")
    require(art["r22Ornaments"]["newVertices"] == 0 and
            art["r22Ornaments"]["newTriangles"] == 0,
            "Invalid source topology or budget")
    require(base["nativeMeshSHA256"] == art["export"]["native"]["sha256"] and
            base["nativeUVSHA256"] == art["export"]["uv"]["sha256"],
            "Cannot load a changed S2 vertex buffer in a texture-only test")
    old = base["atlasSHA256"].encode("ascii")
    new = art["export"]["atlas"]["sha256"].encode("ascii")
    require(len(old) == len(new) == 64, "Incorrect SHA text lengths")
    require(original.count(old) == 1 and original.count(new) == 0,
            "Pinned atlas SHA must occur exactly once in known-good engine")
    target = original.replace(old, new)
    # Bytes outside this one literal are demonstrably unchanged.
    first = original.index(old)
    require(target[:first] == original[:first] and
            target[first+64:] == original[first+64:],
            "Invalid engine diff outside hash allowlist")
    o.dest.mkdir(parents=True)
    exe = o.dest/"XPZ3D_F11_r22o_ADDON_DIAGNOSTIC.exe"
    exe.write_bytes(target)
    receipt = {
        "schema": "xpz3d.stage32i.r22o.one-texture-sha-isolated-diagnostic.v1",
        "basedOnEngine": str(source),
        "compiledFromSourceBase": bool(base["compiledFromSource"]),
        "nativeTestExecutable": str(exe),
        "baselineEngineSha256": SHA(original),
        "diagnosticEngineSha256": SHA(target),
        "onlyAsciiDataHashChanged": True,
        "patchedOffset": first,
        "changedBytesMax": 64,
        "originalEngineUntouched": SHA(source.read_bytes()) == base["sha256"],
        "nativeMeshSHA256": art["export"]["native"]["sha256"],
        "nativeUVSHA256": art["export"]["uv"]["sha256"],
        "originalAtlasSHA256": base["atlasSHA256"],
        "patchedAtlasSHA256": art["export"]["atlas"]["sha256"],
        "notInstallableGamePatch": True
    }
    (o.dest/"engine-test-receipt.json").write_text(
        json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
