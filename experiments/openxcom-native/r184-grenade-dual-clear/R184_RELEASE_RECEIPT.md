# R184 — Two-step grenade hand-clearance release

Date: 2026-11-20. Parent release: R183 (commit 640d33a).

## Actual native release
- Installed Windows EXE: C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R184_ALLPATCH_GRENADE_DUAL_CLEAR.exe
- EXE size: 27,539,581 bytes
- EXE SHA-256: 63EF3423DE6FC82E000DEBE6D284AEBE89CABE95F16A7EA07BEDA3DB9E4E047B
- Archive: build/objects_r184_cumulative_grenade_dual_clear.a (413 objects)
- 411 objects byte-identical to R183; changed InventoryState.cpp.obj and main.cpp.obj.
- Shared launcher XPZ_LATEST_INTEGRATED.cmd -> XPZ_R184_ALLPATCH_START.cmd.
- Prior launcher backup: XPZ_LATEST_INTEGRATED.before_R184-grenade-dual-clear-20261120.cmd.
- Prior R183 and older EXEs, and all original .sav files, preserved.

## Implemented native C++ changes
R183 marked grenade paths requiring two separately cleared hand items unavailable.
R184 enumerates actual stow and ground positions for each hand-held item, checks
the inventory grid and existing occupied rectangles, and combines two feasible
moves only if their planned rectangles do not overlap. It minimizes combined TU,
preferring stored gear over dropped gear at equal TU. The display distinguishes
two stows, a mixed stow/drop, or two drops, and includes retrieval, primer,
throw and total TU. Tight HUD labels retain the P/T action costs.
Only the hover prediction is changed. No actual items are automatically moved.

## Build and regression results
- Windows MinGW C++ native compilation/link: SUCCESS.
- Standalone C++ two-move path and label tests: 16 PASS.
- Native inherited-feature gate: 38 PASS.
- Release manager archive and parent EXE audit: PASS.
- Executable deployment and shared CMD switch: PASS.

## Limitations
- GUI gameplay and actual paid TU for an in-game two-item clearance not measured.
- Runtime effects of sequential inventory reshuffling may impose more restrictions.
- Source/archives tests do not prove every UI/gameplay scenario.

## Reproduction
Source: D:\daphne_auto\XPZ_R184_GIT_WORKTREE_20261120\experiments\openxcom-native\r184-grenade-dual-clear
Build: build_r184.ps1
Source feature gate: feature_gate_r184.py
Standalone cases: tests/grenade_tu_label_test.cpp
Release manifest: D:\daphne_auto\XPZ_ALLPATCH_AUDITS_20261120\R184_LOCAL_MANIFEST.json
Never overwrite the installed EXE when a production file exists.
