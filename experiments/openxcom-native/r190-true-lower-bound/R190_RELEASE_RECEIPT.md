# R190 — Candidate-independent theoretical TU lower bound

Date: 2026-11-21 (KST)
Parent: R189, Git commit `ecaa238`

## Actual produced artifacts

- Windows EXE: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R190_ALLPATCH_GRENADE_TRUE_LOWER_BOUND.exe`
- Dedicated launcher: `XPZ_R190_ALLPATCH_START.cmd`
- EXE length: **27,544,383 bytes**
- SHA256: `C028C6E1E95C72A2903BA41E23051AEF5313E2C44E9202671F03E65ED5BC9D58`
- Archive: `build/objects_r190_cumulative_true_lower_bound.a`
- Cumulative 413 objects, 411 byte-identical to parent R189; updated `InventoryState.cpp.obj` and `main.cpp.obj`.

### Important concurrent development handling

Another user's Windows game process `openxcom_R202_ALLPATCH_ASSAULT_HUD_PAGING.exe` was already running at R190 deployment time.
R190 was therefore installed **side by side**. The shared launcher `XPZ_LATEST_INTEGRATED.cmd` was NOT changed,
and the R202 process was NOT interrupted. Previous native EXEs and game saves remain untouched.
R190 should not be described as a globally latest integrated version.

## Actual implementation

R189 used only the four initially sampled positions for each hand item to calculate a lower bound.
When those positions omitted a cheaper inventory section, R189 could incorrectly stop early
after finding a valid but expensive route.

R190 introduces `theoreticalMoveMin` in `InventoryState.cpp` to derive an optimistic move TU
minimum across *all* rules-permitted inventory sections, and across the ground section when
a real tile and a geometrically fitting item are available. It intentionally ignores
occupancy and collision to avoid overestimating the lower bound. This includes permitted
sections missing from sampled candidates, then conditionally performs R188's bounded
32-position/page expanded ground search if the fast route exceeds the theoretical lower bound.

The independent `r190NeedsExpandedClearSearch` helper also conservatively expands when
the section-wide cost is unknown or cannot safely be summed.

## Actual test/build evidence

- MinGW Windows C++ compilation and linking: SUCCESS.
- Previous grenade planner tests: **16 PASS**.
- Ground search and fallback tests: **26 PASS**.
- R189 and R190 lower-bound tests: **19 PASS**.
- Source/inherited patch gate: **55 PASS**.
- Release manager audit: parent hash, 413-member archive, 411 unchanged members,
  persistent inventory and craft-exchange feature contracts: PASS.
- Installed EXE SHA256 verified against build output, dedicated launcher created.
- Shared latest launcher hash checked unchanged at installation time.

## Remaining limitations

- The source-wide section cost is a lower bound, not a complete search or proof
  that a given route can be executed with the calculated costs.
- Expanded search remains restricted to 32 ground candidates per page within
  chosen early/tail windows. Global optimality is NOT guaranteed.
- Interactive in-game inventory movement and deducted TU were not observed.
- No gameplay or save/load session was performed.

## Reproduction

Source: `D:\daphne_auto\XPZ_R190_GIT_WORKTREE_20261121\experiments\openxcom-native\r190-true-lower-bound`
Build: `build_r190.ps1`
Contract gate: `feature_gate_r190.py`
Standalone tests: `tests/grenade_tu_label_test.cpp`, `tests/ground_scan_test.cpp`,
`tests/optimality_test.cpp`
Release manifest: `D:\daphne_auto\XPZ_ALLPATCH_AUDITS_20261120\R190_LOCAL_MANIFEST.json`
