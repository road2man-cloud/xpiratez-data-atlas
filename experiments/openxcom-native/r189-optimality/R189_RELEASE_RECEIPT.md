# R189 — Grenade TU route lower-bound improvement

Date: 2026-11-21 (KST)
Parent: R188 GRENADE ROUTE FALLBACK, commit `8a90b97`

## Actual production artifacts

- Installed Windows EXE: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R189_ALLPATCH_GRENADE_OPTIMALITY.exe`
- Size: **27,543,626 bytes**
- SHA-256: `D436DC2CE91438065DE05D7D4E3794DEB3174C2DB2635BE9DAB41C38368F814D`
- Archive: `build/objects_r189_cumulative_optimality.a`
- Members: 413; 411 byte-identical to R188.
- Changed objects: `InventoryState.cpp.obj` and `main.cpp.obj`.
- Shared launcher `XPZ_LATEST_INTEGRATED.cmd` switched to `XPZ_R189_ALLPATCH_START.cmd`.
- Previous launcher backed up as `XPZ_LATEST_INTEGRATED.before_R189-grenade-optimality-20261121.cmd`.
- R188 executable and game saves preserved.

## Actual code changes

R188 expanded the two-item grenade clearance candidates only when the four-choice fast
search found no valid path. This could miss lower-cost options when a fast valid plan
had unnecessary high TU cost.

R189 computes an admissible lower bound by minimizing each item independently and
summing their nonnegative move costs. If a fast valid plan costs more than that bound,
it also considers the bounded 32-per-ground-page expanded alternatives. If the
fast cost equals that bound, the costly fallback is skipped. All pairwise overlap
checks remain in `r184BestClearPlan`; route display still includes clearing,
retrieval, prime and throw TU.

The feature is a nonmutating inventory hover preview, not an auto-equipment action.

## Actual checks

- MinGW Windows C++ native compile and link: PASS.
- Prior grenade 2-item route tests: **16 PASS**.
- Ground search and fallback tests: **26 PASS**.
- Newly added lower bound/valid-but-suboptimal cases: **13 PASS**.
- Inherited native source/functionality gate: **53 PASS**.
- Release manager parent EXE SHA, archive hashes/order, persistent patch contracts: PASS.
- Installed executable SHA and launcher update: PASS.

## Limitations

- This improves search inside selected inventory/ground candidate sets; it is not a
  mathematical guarantee of the global minimum across every possible position.
- Actual in-game tooltip rendering and TU spending were not independently
  confirmed by interactive play.
- Source-level and object-level integrity checks do not prove every existing
  game feature is runtime-correct.

## Reproduction

Source: `D:\daphne_auto\XPZ_R189_GIT_WORKTREE_20261121\experiments\openxcom-native\r189-optimality`
Build: `build_r189.ps1`
Gate: `feature_gate_r189.py`
Native cases: `tests/grenade_tu_label_test.cpp`, `tests/ground_scan_test.cpp`,
`tests/optimality_test.cpp`
Local deployment receipt:
`D:\daphne_auto\XPZ_ALLPATCH_AUDITS_20261120\R189_LOCAL_MANIFEST.activate.receipt.json`
