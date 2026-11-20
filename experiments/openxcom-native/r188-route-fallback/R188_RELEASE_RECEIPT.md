# R188 — Bounded alternative-path search for grenade TU preview

Date: 2026-11-20 (KST)
Parent: R187 GROUND SPREAD, commit `2e888a8`
Release: R188 GRENADE ROUTE FALLBACK

## Actually produced

- Installed EXE: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R188_ALLPATCH_GRENADE_ROUTE_FALLBACK.exe`
- Size: **27,543,626 bytes**
- SHA-256: `8B0A1515A1E1117E8CF3282BBE825F29817B0C63506C925B567919977E1AEDBB`
- Cumulative archive: `build/objects_r188_cumulative_route_fallback.a`
- Members: 413; 411 byte-identical from R187.
- Replaced member bodies: `InventoryState.cpp.obj`, `main.cpp.obj`.
- Shared launcher: `XPZ_LATEST_INTEGRATED.cmd` now points to `XPZ_R188_ALLPATCH_START.cmd`.
- Preserved prior launcher: `XPZ_LATEST_INTEGRATED.before_R188-grenade-route-fallback-20261120.cmd`.
- Prior releases, saves and any running game processes were not overwritten or terminated.

## Implemented improvement

R187's ground chooser retained four non-overlapping placements per page. This
is fast, but with two differently sized hand-held items, the initial
placements can be individually legal while no cross-item pair fits, even if
another legal packing arrangement exists.

R188 keeps R187's fast four-choice pass. **Only when the two-move plan is
invalid**, it tries a bounded expanded set (32 candidates per ground page).
The expanded set deliberately allows alternative locations for the same item
to overlap one another because only one will actually be selected. The
two-item route planner still rejects collisions between the chosen placements
for distinct items. No actual item movement is executed by the tooltip.

## Actual test and release evidence

- Native Windows MinGW C++ compile/link: PASS.
- Existing grenade TU/dual-move tests: **16 PASS**.
- Ground page, spatial choice and expanded fallback tests: **26 PASS**.
- Inherited source contract and build gate: **49 PASS**.
- Release manager SHA, archive link order, permanent feature contracts: PASS.
- Game directory installation and latest launcher update: PASS.

## Remaining limitations

- The expanded search only occurs when no fast two-item path exists. It does
  not prove global minimum TU when the fast path is already valid.
- Expanded choices are capped at 32 per ground page and adaptive ground
  windows still select early/tail pages. Every possible combination of
  intermediate pages is not enumerated.
- The UI only displays a TU prediction and does not automatically stow,
  drop, prime or throw. Real tactical TU spending remains unverified.

## Reproduction

Source: `D:\daphne_auto\XPZ_R188_GIT_WORKTREE_20261120\experiments\openxcom-native\r188-route-fallback`
Build: `build_r188.ps1`
Source gate: `feature_gate_r188.py`
Tests: `tests/grenade_tu_label_test.cpp`, `tests/ground_scan_test.cpp`
Release receipt: `D:\daphne_auto\XPZ_ALLPATCH_AUDITS_20261120\R188_LOCAL_MANIFEST.activate.receipt.json`
