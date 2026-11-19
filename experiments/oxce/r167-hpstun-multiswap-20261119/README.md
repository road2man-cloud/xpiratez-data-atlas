# R167 — Cumulative HP/Stun + Multi-slot Quickdraw, 2026-11-19

This branch builds from the verified R166 *quickdraw-swap* archive, which itself derives from R165 movement TU / R164B inventory UI / R160B grenade and bandage lineage. It intentionally does not replace the default EXE or saves.

## Actual changes

- Automatic prebattle quickdraw promotion now supports a useful weapon overlapping **2–6 lower-priority items**. It snapshots candidate and all blockers, moves blockers into legal inventory pockets, and commits only when the desired quickdraw cell fits without overlap. A failed move restores all original slot IDs and XY positions.
- Retains the R166 one-victim direct swap and fallback move.
- Rebuilds `InventoryState.cpp` against the R159 HP/stun-separated `CombatPowerHud.h`, avoiding the obsolete HP+stun combined formula that survived in an earlier R164B build.
- Rebuilds `main.cpp` for an unambiguous `R167-QUICKDRAW-MULTISWAP-HPSTUN-R165-CUMULATIVE` title.
- Preserves the parent `Map.cpp.obj` unchanged, retaining R165 WALK/FLY TU display.
- Prebattle buttons remain `전원자동`, `전원해제`, `低` (low-TU firearm mode), and weapon > grenade > magazine quickdraw priority.

## Build and provenance

- Parent EXE SHA256: `80EB21B23BAA787F7474DF207BB0244F98164E1CF7969741D218094242AD0BB3`
- New EXE SHA256: `50E924D39D654794947C243821EC919BF4025A99A874150042AC79BACB8920B3`
- Size: 27,487,367 bytes. 413 archive entries (411 unique filenames), original entry order unchanged. Rebuilt objects: `InventoryState.cpp.obj`, `main.cpp.obj`. `Map.cpp.obj` retained byte-identically.
- Installed executable: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R167_ALLPATCH_HPSTUN_MULTISWAP.exe`
- Dedicated launcher: `XPZ_R167_ALLPATCH_HPSTUN_MULTISWAP_START.cmd`.
- Compilation and link successful; runtime gameplay behavior not personally tested. No claim of all prior experimental branches (notably live S2 3D telemetry) being present.

When making R168+, keep this source and `CombatPowerHud.h` together. Rebuilding InventoryState against the old baseline header silently reintroduces wrong HP/Stun scoring.
