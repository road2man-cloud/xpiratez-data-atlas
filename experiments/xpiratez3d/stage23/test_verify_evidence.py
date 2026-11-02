#!/usr/bin/env python3
"""Tests that forged or incomplete Stage23 evidence fails closed.

Only mutates in-memory copies of archived text. Never edits original evidence.
"""
from __future__ import annotations

import importlib.util
import io
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
source = Path(__file__).resolve().parent / "verify-evidence.py"
spec = importlib.util.spec_from_file_location("stage23_auditor", source)
assert spec and spec.loader
auditor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)


class FailClosedEvidenceTests(unittest.TestCase):
    def reject(self, mode: str, filename: str, original: str, forged: str) -> None:
        contents = auditor.read(mode)
        self.assertIn(original, contents[filename])
        contents[filename] = contents[filename].replace(original, forged, 1)
        with patch.object(auditor, "read", return_value=contents):
            with redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit, msg=f"Did not reject {mode} {filename} tamper"):
                    if mode == "failed-not-instant":
                        auditor.verify_failed_control()
                    else:
                        auditor.verify(mode, mode == "turnbased")

    def test_blocked_real_order_not_rejected(self) -> None:
        self.reject("realtime", "_xpz_stage23_move.log",
                    "preview=8 result=8 same_tile=1", "preview=8 result=1 same_tile=1")

    def test_false_claimed_destination(self) -> None:
        self.reject("realtime", "_xpz_stage23_move.log",
                    "to=10,10 layer=11", "to=11,10 layer=11")

    def test_no_turnbased_ap_decrement(self) -> None:
        self.reject("turnbased", "_xpz_stage23_move.log", " ap=41 ", " ap=53 ")

    def test_wrong_engine_build(self) -> None:
        self.reject("realtime", "driver.log", auditor.EXPECTED_SHA256, "0" * 64)

    def test_fake_passing_historical_fail(self) -> None:
        self.reject("failed-not-instant", "result.txt",
                    "FINAL=FAIL", "FINAL=NATIVE_MOVEMENT_PASS")

    def test_actor_identity_switched(self) -> None:
        self.reject("turnbased", "_xpz_stage23_move.log",
                    "unit=1C7273C0 tile=10,10", "unit=FFFFFFFF tile=10,10")


if __name__ == "__main__":
    unittest.main()
