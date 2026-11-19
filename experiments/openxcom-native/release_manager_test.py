"""Local-only tests for the native ALLPATCH release manager."""
from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

import release_manager as release


def synthetic_ar(path: Path, objects: dict[str, bytes]) -> None:
    parts = [b"!<arch>\n"]
    for name, data in objects.items():
        name_bytes = name.encode("utf-8")
        tag = f"#1/{len(name_bytes)}"
        payload = name_bytes + data
        header = (
            f"{tag:<16}{'0':<12}{'0':<6}{'0':<6}"
            f"{'100644':<8}{len(payload):<10}"
        ).encode("ascii") + bytes((96, 10))
        assert len(header) == 60
        parts.append(header + payload + (b"\n" if len(payload) % 2 else b""))
    path.write_bytes(b"".join(parts))


class ReleaseManagerTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory(prefix="xpz-release-test-")
        self.addCleanup(self.dir.cleanup)
        self.root = Path(self.dir.name)
        self.base_exe = self.root / "prior.exe"
        self.base_exe.write_bytes(b"prior-exe-durable-binary")
        self.exe = self.root / "patched.exe"
        self.exe.write_bytes(b"new-binary")
        self.old_archive = self.root / "prior.a"
        self.new_archive = self.root / "current.a"
        self.obj_old = {
            "InventoryState.cpp.obj": b"old inventory",
            "TransferItemsState.cpp.obj": b"unchanged craft exchange",
            "main.cpp.obj": b"old title"
        }
        self.obj_new = {
            **self.obj_old,
            "InventoryState.cpp.obj": b"new grenade TU",
            "main.cpp.obj": b"new title"
        }
        synthetic_ar(self.old_archive, self.obj_old)
        synthetic_ar(self.new_archive, self.obj_new)
        self.source = self.root / "InventoryState.cpp"
        self.source.write_text("grenade_tu BA_PRIME BA_THROW single_shot_exclusion", encoding="utf-8")
        self.game = self.root / "game"
        self.game.mkdir()
        self.original_latest = (
            '@echo off\r\ncall "%~dp0XPZ_R177_ALLPATCH_START.cmd" %*\r\n'
        )
        (self.game / "XPZ_LATEST_INTEGRATED.cmd").write_bytes(
            self.original_latest.encode("ascii")
        )
        (self.game / "slot1.sav").write_bytes(b"preserved-save")
        self.manifest = {
            "release_id": "R178-test",
            "parent_exe": str(self.base_exe),
            "parent_exe_sha256": release.sha256(self.base_exe),
            "parent_archive": str(self.old_archive),
            "output_archive": str(self.new_archive),
            "output_exe": str(self.exe),
            "expected_output_sha256": release.sha256(self.exe),
            "object_count": 3,
            "expected_changed_objects": ["InventoryState.cpp.obj", "main.cpp.obj"],
            "source_contracts": [{
                "name": "grenade-tus-and-oneshot",
                "path": str(self.source),
                "contains": ["BA_PRIME", "BA_THROW", "single_shot_exclusion"],
                "not_contains": ["removed_old_feature"],
            }],
            "install_dir": str(self.game),
            "launcher_name": "XPZ_R178_TEST_START.cmd",
            "expected_active_launcher": "XPZ_R177_ALLPATCH_START.cmd",
            "expected_active_sha256": release.sha256(self.game / "XPZ_LATEST_INTEGRATED.cmd")
        }

    def cumulative_fixture(self):
        """Upgrade a three-object test to the real 413-object release contract."""
        extras = {f"unused-{i:03}.cpp.obj": b"inherited" for i in range(410)}
        synthetic_ar(self.old_archive, {**self.obj_old, **extras})
        synthetic_ar(self.new_archive, {**self.obj_new, **extras})
        self.manifest["object_count"] = 413
        self.source.write_text(
            "choice.rule->getClipSize() == 1 usableOwnedFrag r164LowTuMode "
            "leftHandOccupied getActionTUs(BA_PRIME, item) "
            "getActionTUs(BA_THROW, item) BA_PRIME BA_THROW "
            "single_shot_exclusion", encoding="utf-8"
        )
        transfer = self.root / "TransferItemsState.cpp"
        transfer.write_text(
            "assigned->setCraft(0) exchangeBlockReason r148SearchState "
            "r138ApplyColumnSort queueCraftExchange", encoding="utf-8"
        )
        self.manifest["source_contracts"].append({
            "name": "craft-transaction", "path": str(transfer),
            "contains": ["exchangeBlockReason"]
        })

    def test_cumulative_413_rejects_omitted_mandatory_source(self):
        self.cumulative_fixture()
        self.manifest["source_contracts"].pop()
        with self.assertRaisesRegex(release.ReleaseError, "Persistent feature contract"):
            release.audit(self.manifest)

    def test_cumulative_413_rejects_removed_grenade_tu_even_if_manifest_omits_it(self):
        self.cumulative_fixture()
        self.source.write_text(
            "single_shot_exclusion BA_PRIME BA_THROW", encoding="utf-8"
        )
        with self.assertRaisesRegex(release.ReleaseError, "Persistent features lost"):
            release.audit(self.manifest)

    def test_cumulative_413_permanent_contracts_are_reported(self):
        self.cumulative_fixture()
        result = release.audit(self.manifest)
        self.assertTrue(result["permanent_features"]["InventoryState.cpp"]["passed"])
        self.assertTrue(result["permanent_features"]["TransferItemsState.cpp"]["passed"])

    def test_audit_contains_actual_changed_members(self):
        report = release.audit(self.manifest)
        self.assertEqual(report["result"], "PASS")
        self.assertEqual(report["changed_objects"], [
            "InventoryState.cpp.obj", "main.cpp.obj"
        ])
        self.assertEqual(report["unchanged_objects"], 1)

    def test_tampered_parent_executable_is_rejected(self):
        self.base_exe.write_bytes(b"somebody replaced parent exe")
        with self.assertRaisesRegex(release.ReleaseError, "Parent executable"):
            release.audit(self.manifest)

    def test_missing_feature_token_is_rejected(self):
        self.source.write_text("BA_PRIME BA_THROW", encoding="utf-8")
        with self.assertRaisesRegex(release.ReleaseError, "Missing feature"):
            release.audit(self.manifest)

    def test_unexpected_changed_object_rejected(self):
        self.obj_new["TransferItemsState.cpp.obj"] = b"lost exchange patch"
        synthetic_ar(self.new_archive, self.obj_new)
        with self.assertRaisesRegex(release.ReleaseError, "Unexpected archive diff"):
            release.audit(self.manifest)

    def test_archive_link_order_change_rejected(self):
        synthetic_ar(self.new_archive, dict(reversed(list(self.obj_new.items()))))
        with self.assertRaisesRegex(release.ReleaseError, "link order changed"):
            release.audit(self.manifest)

    def test_duplicate_archive_object_rejected(self):
        synthetic_ar(self.new_archive, {"a": b"one", "b": b"two"})
        # A specifically crafted duplicate requires writing the same member twice.
        header = f"{'#1/1':<16}{'0':<12}{'0':<6}{'0':<6}{'100644':<8}{2:<10}".encode() + bytes((96, 10))
        self.new_archive.write_bytes(b"!<arch>\n" + header + b"a1" + header + b"a2")
        with self.assertRaisesRegex(release.ReleaseError, "Duplicate ar object"):
            release.archive_members(self.new_archive)

    def test_activation_cannot_override_newer_latest(self):
        report = release.audit(self.manifest)
        (self.game / "XPZ_LATEST_INTEGRATED.cmd").write_bytes(
            b"@echo off\r\ncall XPZ_R179_START.cmd\r\n"
        )
        with self.assertRaisesRegex(release.ReleaseError, "Live launcher"):
            release.activate(self.manifest, report)
        self.assertFalse((self.game / self.exe.name).exists())

    def test_successful_activation_preserves_saves_and_old_latest(self):
        report = release.audit(self.manifest)
        result = release.activate(self.manifest, report)
        installed = self.game / self.exe.name
        self.assertEqual(release.sha256(installed), report["exe_sha256"])
        self.assertEqual((self.game / "slot1.sav").read_bytes(), b"preserved-save")
        self.assertIn("XPZ_R178_TEST_START.cmd", (self.game / "XPZ_LATEST_INTEGRATED.cmd").read_text())
        self.assertEqual(
            (self.game / "XPZ_LATEST_INTEGRATED.before_R178-test.cmd").read_bytes(),
            self.original_latest.encode("ascii")
        )
        self.assertEqual(str(installed), result["installed_exe"])

    def test_existing_conflicting_executable_rejected(self):
        (self.game / self.exe.name).write_bytes(b"occupied")
        report = release.audit(self.manifest)
        with self.assertRaisesRegex(release.ReleaseError, "different bytes"):
            release.activate(self.manifest, report)


if __name__ == "__main__":
    unittest.main(verbosity=2)
