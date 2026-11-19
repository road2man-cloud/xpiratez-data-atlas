# R178 — Grenade prime/throw TU state-aware HUD

Date: 2026-11-20

## Actual produced build
- Source location: `D:\daphne_auto\XPZ_R178_GIT_WORKTREE_20261120\experiments\openxcom-native\r178-grenade-tu`
- Installed executable: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R178_ALLPATCH_GRENADE_STATE_TU.exe`
- SHA-256: `1BDFFBB7104388F7B5CD6A5E0710A53BE7CB2054AC4ED0360293DD7DBBEE95C9`
- File size: 27,533,978 bytes
- Parent R177 EXE SHA-256: `F80897A5560B21D30A00A53C5CE0518867F321291E1E8A09A2DF82729386C6DB`
- Cumulative archive: `build/objects_r178_cumulative_grenade_state_tu.a` with 413 members; 411 byte-identical to R177. Only `InventoryState.cpp.obj` and `main.cpp.obj` have changed hashes.
- Build: native MinGW C++ compile and link succeeded; feature gate: 18/18 passed.

## Improvements
- Inventory grenade/proximity-grenade mouseover computes the selected unit's BA_PRIME and BA_THROW TUs.
- FuseTimer >= 0 means the grenade is prepared: no additional prime TU is charged in displayed remaining total.
- Two-line summary displays prime, throw, combined total TU. Displays preparation-completed state.
- Automatically abbreviates text when the 66-pixel ammo panel would overflow, with ASCII fallback for long numbers.
- Legacy inventory auto-all one-shot special-ammo exclusion and reciprocal craft-only exchange code retained in archive and source.
- `XPZ_LATEST_INTEGRATED.cmd` redirected to R178; prior R177 launcher preserved as `XPZ_LATEST_INTEGRATED.before_R178_20261120.cmd`.

## Validation limits
Only compilation, archive hash comparison, source-level feature gate and deployment SHA-256 were verified. Game UI font rendering, save/load, and actual in-game action-TU matching were not play-tested. Do not label those as completed.

## Rebuild/deploy
Execute `build_r178.ps1` only after checking the parent R177 archive and EXE hashes and the output EXE path is not already in use. The script fails on an existing EXE rather than overwriting it. Install to a new R178 filename; never replace historical versions or user saves. Rebuild references absolute Windows paths and must be adapted for a different build host.
