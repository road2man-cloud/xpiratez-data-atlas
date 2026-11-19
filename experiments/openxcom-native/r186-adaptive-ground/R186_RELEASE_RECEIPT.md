# R186 — Adaptive ground inventory paths for grenade TU HUD

Date: 2026-11-20 (Asia/Seoul)  
Parent: R185 GROUND GRID, commit 4330f1b  
Release: R186 GRENADE ADAPTIVE GROUND

## Actually produced and installed

- EXE: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R186_ALLPATCH_GRENADE_ADAPTIVE_GROUND.exe`
- Size: **27,541,975 bytes**
- SHA-256: `8C50FF78E7CC3CD744F432F795E2E61492F03F072E1D76E764BDB7ECF8E8A286`
- Archive: `build/objects_r186_cumulative_adaptive_ground.a`
- Archive membership: 413 cumulative objects; 411 identical to R185; changed `InventoryState.cpp.obj` and `main.cpp.obj`
- Live launcher: `XPZ_LATEST_INTEGRATED.cmd` now points to `XPZ_R186_ALLPATCH_START.cmd`.
- Previous launcher backup: `XPZ_LATEST_INTEGRATED.before_R186-grenade-adaptive-ground-20261120.cmd`
- Prior EXEs and original save files preserved.

## Actual source improvements

The R185 grenade TU planner enumerated ground inventory candidates from page 0
up to a fixed maximum of 6 pages, resulting in missing possible locations
for modded or heavily occupied ground inventories. R186 replaces that linear,
fixed-range search with two non-overlapping windows:

1. The first two pages for short-range, easy-to-reach placements.
2. The first two pages after the farthest currently occupied ground item's
   right edge, even when that edge is far beyond page 6.

The independent `GroundScan.h` helper encapsulates this search and a
per-page accepted-candidate budget (4 placements per page by default).
The 413-object native inventory source now uses the helper, avoids processing
the ground section twice if it appears in `getInvsList()`, and passes the
resulting non-overlapping storage/drop candidates to the R184 two-item
clearance planner.

The change affects an **informational hover TU preview**; it never moves
items automatically or modifies the game's action TU execution logic.

## Actual checks performed

- Native MinGW C++ compile/link: SUCCESS
- R184-derived grenade tooltip/dual-item path C++ tests: **16 PASS**
- New `ground_scan_test.cpp` adaptive page and candidate-budget tests: **13 PASS**
- Native inherited patch gate including the new ground tests: **44 PASS**
- Release manager: parent EXE hash, 413-object names/ordering/hashes,
  persistent InventoryState + TransferItemsState contracts: **PASS**
- Native release file installed and launcher switched with old launcher
  preserved: **PASS**

## Known limitations

- No real in-game mouse-operated inventory session or actual TU spending
  comparison was performed; runtime behavior may differ.
- The planner caps accepted *candidate positions* per page, not accessible
  ground pages. It scans only the early and far-tail windows by design, not
  every fragmented occupied page in between.
- Ground source currently ignores extremely large transient X coordinates
  (>=100000) when determining the farthest occupied item; this protects
  hover performance but may need adjustment for unusually large mod states.
- This source-level preservation gate alone does not prove every old UI
  feature works in a real gameplay scenario.

## Reproduction

Source:
`D:\daphne_auto\XPZ_R186_GIT_WORKTREE_20261120\experiments\openxcom-native\r186-adaptive-ground`

- `build_r186.ps1`: C++ compilation, link, both C++ test suites, feature gate.
- `feature_gate_r186.py`: inherited 413-object contract.
- `tests/grenade_tu_label_test.cpp`: existing grenade planner cases.
- `tests/ground_scan_test.cpp`: new adaptive-ground cases.
- Release manager receipt:
`D:\daphne_auto\XPZ_ALLPATCH_AUDITS_20261120\R186_LOCAL_MANIFEST.activate.receipt.json`
