# R207 R190 grenade path integration into R206 cumulative build

Date: 2026-11-22 KST

## Parent and scope
- Parent native archive: R206 `objects_r206_cumulative_mission_intel_cqc_hud.a` (413 members).
- Parent EXE SHA256: `803435190380E1138147494AE44818DED35E8C4F96E50100909507379A33D351`.
- R190 source: `feat/xpz-r190-global-lower-bound-20261121`, commit `f5a608162ddfe4793091b1582c9318ee36059a6c`.
- This branch retains R206 source and binary objects while selectively porting R190 functionality into `InventoryState.cpp` and relevant header files.
- New version is R207 rather than reusing R204 (already occupied by the CQC firing warning development).

## Actual native changes
- Keep R206 `InventoryState.cpp` as baseline, preserving post-R203 AutoAll, equipment reservation/medical wear and residual grenade loading.
- Port R190's page-aware `legalPlacements` with per-page budget and 32-position expanded candidate search.
- Port the optimistic movement-cost lower bound and conditional expanded two-hand clearance planning.
- Port R190 `GrenadeTuLabel.h` and `GroundScan.h`.
- Update `main.cpp` title to R207.
- Rebuild only `InventoryState.cpp` and `main.cpp`, while retaining all other 411 object files from R206.

## Native build outcome
- Native Windows C++ compile: PASS
- Link: PASS
- Archive objects: 413
- EXE: `openxcom_R207_ALLPATCH_GRENADE_INTEGRATED.exe`
- EXE size: 27,627,072 bytes
- SHA256: `0931AE5675E073597DAED96D925E3257C9FA8E5733AB53C89A5956D4FC005CD0`
- Installed in `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez`, copy hash matched.
- Dedicated launcher: `XPZ_R207_ALLPATCH_START.cmd`.
- Common launcher, old EXEs and saves left unchanged.

## Limits
- Build and link success, not in-game verification.
- Exact TU deductions, runtime inventory layouts, and warning HUD must be exercised in-game.
- Full proof of global shortest operation sequence is not claimed.
- Repro script requires the same pre-existing MinGW toolchain and local archived R206 object library and include paths.
