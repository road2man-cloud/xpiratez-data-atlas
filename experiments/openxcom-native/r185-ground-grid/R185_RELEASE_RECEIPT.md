# R185 — Grenade ground-grid TU route fix

Date: 2026-11-20 (KST)  
Parent: R184 GRENADE DUAL CLEAR, commit 82bfc33  
New release: R185 GRENADE GROUND GRID

## Produced native artifacts

- Windows EXE: C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R185_ALLPATCH_GRENADE_GROUND_GRID.exe
- Size: **27,541,975 bytes**
- SHA-256: `CB2316FE1CD877A3669C5FC1ED0D0ACB2ADD7341FA6E30600E606AAD0FE3B074`
- Cumulative archive: `build/objects_r185_cumulative_ground_grid.a`
- 413 object members. R184 compared: 411 identical, changed `InventoryState.cpp.obj` and `main.cpp.obj` only.
- Launcher: `XPZ_R185_ALLPATCH_START.cmd`
- Live `XPZ_LATEST_INTEGRATED.cmd` now points to R185.
- Previous launcher: `XPZ_LATEST_INTEGRATED.before_R185-grenade-ground-grid-20261120.cmd` preserved.

## Actual fix

The prior R184 grenade TU hand-clearing preview used `RuleInventory::getSlots()`
for all destinations, including `INV_GROUND`. The engine's ground inventory
does not provide a normal enumerated RuleSlot vector: it uses a paginated
rectangular grid. This caused legal ground drop candidates to disappear from
the TU planner, including dual-item stow/drop combinations.

R185 now distinguishes ordinary `INV_SLOT` enumerated cells from `INV_GROUND`.
For ground only, it constructs a multi-page grid using native RuleInventory
pixel offsets and SLOT_W/SLOT_H, considering existing ground item's farthest
occupied X coordinate. Valid placements are passed through native
`fitItemInSlot()`, checked against actual ground inventory items for overlap,
and combined with the two-item nonoverlap route planner.

- Candidate search is bounded to a maximum of six pages to keep inventory
  mouseovers responsive.
- For non-ground inventories, the previous exact slot enumeration is retained.
- The change is read-only UI cost estimation: it does not move equipment.
- All existing AutoAll exclusion, quickdraw, transfer/craft exchange code is
  retained.

## Actual build and release results

- Windows MinGW compilation and linking succeeded.
- R184-derived grenade label/path C++ tests: 16 PASS.
- Native feature contract checks: 39 PASS.
- Release manager parent SHA, 413-object archive, permanent contracts: PASS.
- Installer SHA verify and shared launcher activation: PASS.
- No original save data or earlier native EXEs were overwritten.

## Limitations / next engineering work

- UI gameplay verification and actual TU spend have not been performed.
- Ground candidates are bounded to six pages; unusual extended inventories
  may require a dynamically wider search.
- Hover preview uses the native fit/occupancy rules, but sequential movement
  side effects from actual gameplay may still differ from static prediction.
- The source-level feature gate cannot replace interactive game testing.

## Reproduction

Source: `D:\daphne_auto\XPZ_R185_GIT_WORKTREE_20261120\experiments\openxcom-native\r185-ground-grid`  
Build: `build_r185.ps1`  
Gate: `feature_gate_r185.py`  
C++ tests: `tests/grenade_tu_label_test.cpp`  
Release receipt: `D:\daphne_auto\XPZ_ALLPATCH_AUDITS_20261120\R185_LOCAL_MANIFEST.activate.receipt.json`
