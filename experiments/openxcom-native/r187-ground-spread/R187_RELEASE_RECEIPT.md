# R187 — spatially distinct ground placement candidates for grenade TU HUD

Date: 2026-11-20 (Asia/Seoul)  
Parent: R186 ADAPTIVE GROUND, commit `1d13426`  
Release: R187 GRENADE GROUND SPREAD

## Actual release artifacts

- Installed EXE: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R187_ALLPATCH_GRENADE_GROUND_SPREAD.exe`
- Size: **27,542,999 bytes**
- SHA-256: `D3CAB85B9458A19A89F1D99C2D259245677EED1037AA83DE46297A5BCC184668`
- Archive: `build/objects_r187_cumulative_ground_spread.a`
- 413 cumulative object members; **411 byte-identical** to R186.
- Changed objects: `InventoryState.cpp.obj`, `main.cpp.obj`
- Shared launcher `XPZ_LATEST_INTEGRATED.cmd` now points to `XPZ_R187_ALLPATCH_START.cmd`.
- Original launcher saved as `XPZ_LATEST_INTEGRATED.before_R187-grenade-ground-spread-20261120.cmd`.
- Prior native EXEs and original .sav files preserved.

## Implementation improvement

In R186, each ground page contributed up to four candidates in scan order.
On empty ground, that was usually x=0,y=0..3; for a 2x3 or 3x3 weapon
these rectangles substantially overlap. The two-weapon route planner could
then mistakenly conclude that two separate legal placements are unavailable.

R187 collects a **spatially disjoint set** of up to four choices per page,
using the actual rectangular width and height of each held weapon.
The `R187GroundPageBudget` accepts a candidate only when it does not
overlap previously accepted rectangles in the same page. Adjacent, separate
columns or rows are preferred over equivalent overlapping candidates.
The R186 adaptive early/tail window search and all prior grenade and craft
exchange code are retained.

## Actual production evidence

- Windows MinGW native C++ compile/link: PASS.
- Existing grenade two-item C++ tests: **16 PASS**.
- New ground diversity, rectangle, page-boundary tests: **20 PASS**.
- Full inherited feature gate, including native test launches: **46 PASS**.
- Release manager ancestor hash, archive member order and source contracts: PASS.
- Installed EXE hash matches build output and latest launcher points to R187.

## Limitations

This is a non-mutating informational HUD preview. It does not move items or
confirm the TU actually deducted during battlescape actions. The ground
candidate count remains bounded per page, and two windows of ground pages
are searched (early and after last occupied item), not every gap between them.
A real game UI session has not been completed.

## Reproduction

Source: `D:\daphne_auto\XPZ_R187_GIT_WORKTREE_20261120\experiments\openxcom-native\r187-ground-spread`
- Native build script: `build_r187.ps1`
- Inherited feature gate: `feature_gate_r187.py`
- Independent tests: `tests/grenade_tu_label_test.cpp` and `tests/ground_scan_test.cpp`
- Release manager receipt:
  `D:\daphne_auto\XPZ_ALLPATCH_AUDITS_20261120\R187_LOCAL_MANIFEST.activate.receipt.json`
