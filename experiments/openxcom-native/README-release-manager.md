# Native ALLPATCH release manager

This tool turns a cumulative OpenXcom patch archive into an auditable, safely
deployable release. It addresses a recurring problem: copying 413 inherited
objects cannot prove that historically promised features still exist.

## New working artifacts

- release_manager.py — validates the prior binary SHA-256, both ar archives,
  the exact object-level change set, named source contracts and new binary.
- build_release.ps1 — optional native-build integration and gated deployment.
- release_manager_test.py — executable regression cases with synthetic archives
  and a disposable game folder.

All tools run locally. They do not require the network or GitHub authentication.

## Required release manifest

Use absolute Windows paths in the generated per-release manifest. Do not
commit a machine-specific manifest containing private installation locations.

{
  "release_id": "R180-example",
  "parent_exe": "D:\\builds\\openxcom_R179.exe",
  "parent_exe_sha256": "sha256-of-existing-R179-exe",
  "parent_archive": "D:\\builds\\objects_r179.a",
  "output_archive": "D:\\builds\\objects_r180.a",
  "output_exe": "D:\\builds\\openxcom_R180.exe",
  "expected_output_sha256": "sha256-of-built-R180-exe",
  "object_count": 413,
  "expected_changed_objects": [
    "InventoryState.cpp.obj", "main.cpp.obj"
  ],
  "source_contracts": [
    {
      "name": "grenade-TU-display",
      "path": "D:\\work\\R180\\src\\Battlescape\\InventoryState.cpp",
      "contains": ["BA_PRIME", "BA_THROW"],
      "not_contains": ["LEGACY_GRENADE_HUD"]
    },
    {
      "name": "craft-only-reciprocal-transfer",
      "path": "D:\\work\\R180\\src\\Basescape\\TransferItemsState.cpp",
      "contains": [
        "assigned->setCraft(0)",
        "exchangeBlockReason",
        "r148SearchState"
      ]
    }
  ],
  "install_dir": "C:\\Game\\X-Piratez",
  "launcher_name": "XPZ_R180_ALLPATCH_START.cmd",
  "expected_active_launcher": "XPZ_R179_ALLPATCH_START.cmd",
  "expected_active_sha256": "sha256-of-existing-XPZ_LATEST_INTEGRATED.cmd"
}

The example checksum fields are placeholders. Supply the real SHA-256 values
before running. An absent or mismatched checksum blocks the release.

## Commands

First build and audit without activating:

    powershell -NoProfile -File build_release.ps1 -Manifest R180.json -BuildScript D:\work\build_r180.ps1 -Python C:\Python311\python.exe

After reviewing the audit receipt, deploy only the audited executable:

    powershell -NoProfile -File build_release.ps1 -Manifest R180.json -Activate -Python C:\Python311\python.exe

Or use Python directly:

    python release_manager.py audit R180.json
    python release_manager.py activate R180.json

Auditing produces a JSON receipt beside the manifest. Activation also creates
one. Neither command starts or terminates a game process.

## Safety invariants

1. Prior executable hash must equal the pinned parent hash.
2. Archive members and their names must be preserved in a cumulative release.
3. Only the explicitly listed changed object hashes are allowed.
4. Feature source contracts must be present; missing markers block activation.
5. An unexpected change to the active launcher, destination EXE or backup
   prevents the latest pointer from switching.
6. The target EXE is written via a temporary file and checked with SHA-256.
7. The old latest launcher is backed up, and saves remain untouched.
8. Source checks are a gate, **not** a substitute for real gameplay tests.

## Real R178 pilot

The manager was run in **audit-only mode** against the actual R177 and R178
Windows native build archives. Result: PASS; 413 archive members, 411 unchanged,
two expected changed members (InventoryState.cpp.obj and main.cpp.obj). It also
checked grenade TU, one-shot AutoAll exclusion, craft-only exchange, R148
transfer search and the title. No installed executable or launcher was modified
by this audit.

The active game installation may be updated independently by other developers.
Always re-check expected_active_launcher (and ideally pin its SHA) immediately
before activating a new build. Never silently roll back an existing newer
release just because an older archive passes its audits.

## Contribution workflow

Keep patches in a separate Git branch/worktree. Commit the precise source,
script, feature-contract manifest template and receipts. Do not stage another
worker's uncommitted files. Publish a branch only after authenticating a GitHub
connection and confirming that its parent commit is correct.
