# R183 — Two-handed weapon-aware grenade TU HUD

Date: 2026-11-20  
Parent native build: R182 ALLPATCH GRENADE STOW  
New native build: R183 ALLPATCH GRENADE TWOHAND

## Actual production
- Installed EXE: C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R183_ALLPATCH_GRENADE_TWOHAND.exe
- EXE size: 27,535,420 bytes
- SHA-256: E1A549A5347A37BF7FC601742B04A52CE8ACEAEC7F1EDDA09489AB3D89207037
- Cumulative archive: build/objects_r183_cumulative_grenade_twohand.a
- Parent archive: R182 objects_r182_cumulative_grenade_stow.a
- 413 total object members; 411 inherited byte-identically
- Changed objects: InventoryState.cpp.obj and main.cpp.obj
- Windows compiler/linker: MinGW g++, successful
- Standalone native label/hand clear cases: 21 PASS
- Feature preservation checks: 36 PASS
- Signed-off release-manager audit: PASS, including permanent InventoryState/TransferItemsState feature contracts
- Latest launch entrypoint now points to XPZ_R183_ALLPATCH_START.cmd
- Previous launcher backed up to XPZ_LATEST_INTEGRATED.before_R183-grenade-twohand-20261120.cmd
- Old R182 EXE and all .sav files remain unchanged.

## Implemented behavior
R182 could report a zero-cost empty hand even when the other hand was equipped
with a weapon that blocks both hands. R183 checks the logical occupancy from
the opposite hand and includes the cost of removing that blocking item before
retrieving the grenade.

- If the selected hand is free but the opposite-hand weapon blocks both hands,
  plan one legal move of the opposite-hand weapon to an actual fitting storage
  slot or to ground; add move TU + retrieve TU + prime TU + throw TU.
- If a selected hand is occupied normally, clear it as before.
- If both selected and opposite hands need separate moves, the one-clear preview
  marks that candidate unavailable instead of under-reporting TU.
- If the grenade itself is a both-hands blocking item, the opposite-hand item
  must also be cleared.
- Stowing uses native inventory geometry / overlap checks, and ground dropping
  is an alternative when the unit has an actual map tile.
- Compressed HUD captions retain **P**(prime) and **T**(throw) numbers rather
  than displaying only an opaque total TU.

This is a READ-ONLY tactical inventory tooltip estimate; it never auto-moves
the soldier's weapons and does not change grenade action execution mechanics.

## Remaining limitations
- No actual 3D/2D GUI play session was conducted for R183, and the net TU
  spent by a real sequence of moves and throw was not independently observed.
- Two distinct blocked items needing two separate moves are conservatively
  labelled unavailable in the one-clear preview. This does not prove the
  gameplay actions themselves are impossible.
- For extremely large TU digits, the narrowest fallback may still clip in the
  66px text panel, but it preserves the P/T labels.

## Reproduction
Source: D:\daphne_auto\XPZ_R183_GIT_WORKTREE_20261120\experiments\openxcom-native\r183-grenade-twohand
Build script: build_r183.ps1. Already-produced EXE causes the script to stop
to prevent silently overwriting the release.
Feature gate: feature_gate_r183.py
C++ tests: tests/grenade_tu_label_test.cpp
Local release manager manifest/receipt:
D:\daphne_auto\XPZ_ALLPATCH_AUDITS_20261120\R183_LOCAL_MANIFEST.json
