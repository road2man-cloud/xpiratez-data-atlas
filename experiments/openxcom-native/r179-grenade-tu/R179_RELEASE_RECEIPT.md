# R179 — grenade TU budget HUD

Date: 2026-11-20

## Produced artifacts

- Baseline: R178 `openxcom_R178_ALLPATCH_GRENADE_STATE_TU.exe` (SHA-256 `1BDFFBB7104388F7B5CD6A5E0710A53BE7CB2054AC4ED0360293DD7DBBEE95C9`)
- New executable: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R179_ALLPATCH_GRENADE_TU_BUDGET.exe`
- Built executable: `build/openxcom_R179_ALLPATCH_GRENADE_TU_BUDGET.exe`
- Size: **27,532,776 bytes**
- SHA-256: `BFA1E14D5494B980E1A9DF7FAF92A36BAC04129A29D148AB1B892BD17F469514`
- Cumulative native archive: `build/objects_r179_cumulative_grenade_tu_budget.a`; 413 members
- Compared with R178: only `InventoryState.cpp.obj` and `main.cpp.obj` changed. Other 411 members have identical SHA-256.
- The installer created `XPZ_R179_ALLPATCH_START.cmd` and repointed `XPZ_LATEST_INTEGRATED.cmd`, with a rollback copy `XPZ_LATEST_INTEGRATED.before_R179_20261120.cmd`.

## Actual source improvements

- `InventoryState.cpp` now shows the selected soldier's grenade PRIME, THROW and total action TU costs.
- Prepared grenades avoid counting PRIME twice (`BattleItem::getFuseTimer() >= 0`).
- In tactical inventory only (`_tu`), an insufficient current TU budget displays both the required TU and the remaining TU, with `!`.
- The prebattle loadout screen intentionally does **not** produce false low-TU warnings.
- `GrenadeTuLabel.h` adds an independent two-line label formatter with three fit strategies: full Korean, compact Korean and ASCII fallback, selected by the actual `Text::getTextWidth()` vs panel width.
- No retrieval TU from backpack-to-hand is included in the prime + throw total; this is specifically an **action-only** estimate.
- Existing full-auto one-shot ammunition exclusion, frag grenade priorities, low-TU and both-hands auto-equip, reciprocal craft-only exchange, search/sort and exchange capacity logic are inherited.

## Checks and scope

- Native MinGW compilation and link passed.
- `tests/grenade_tu_label_test.cpp`: 10 independent C++ cases passed.
- `feature_gate_r179.py`: 23 feature-contract and artifact checks passed.
- Game UI font rendering, actual live TU consumption, ship arrival and save/load were **not** manually play-tested. The checks above are not a substitute for full gameplay regression.

## Rebuild and provenance

Use `build_r179.ps1` from this directory on the configured Windows build environment. It uses a SHA-pinned R178 parent archive/EXE, rejects an existing R179 output path, compiles, links, runs the C++ label test and then runs the feature gate.

The repository uses a feature worktree, not the user's dirty main checkout. Only `experiments/openxcom-native/r179-grenade-tu` should be staged for this commit.
