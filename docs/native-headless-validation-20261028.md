# Native OXCE headless validation — 2026-10-28

## What was replaced

PR #39 removed the numerical surrogate and its old entry point from `tools/headless-simulator`. The original surrogate branch was also deleted. Historical Git commits were not rewritten. The supported implementation now compiles the original OXCE 8.7.1 source with the authoritative RC18 development source overlay and a native input/checkpoint adapter. There is no approximate fallback.

## Actual validation environment

Execution was performed inside the GPT Linux x86_64 container, not the user's Windows game installation. GitHub Actions only compiled the engine and packaged runtime libraries; private campaigns were not uploaded to or run in CI.

Validated code commit: `196ab7dc174e0283e7c443f097ff1c9a7b241d84`.

- Original source tree SHA-256: `a64bb1a2956fb946e44930b1c97437d7fe10ce130029622bf67f332a87d75d4a`
- Patched source archive SHA-256: `4319b0ee922adf9b97ecdc8984b881a6b351b60ca5f3ea921839fb4c30aa02fb`
- Native binary SHA-256: `db60328ce7bae87272b6ffb23e9526cf9afceb5e82d67ec0ba456541c17edaa1`
- Native Linux build run: `40619712731`; artifact: `12787565578`.
- Offline runtime run: `40619712541`; artifact: `12785954551`.

## Observed results

1. Fifteen adapter/source-integrity tests passed. These are not fifteen battle simulations.
2. A private tactical save loaded and was saved again by the original native engine. The complete parsed initial battle state and saved RNG matched the input. The input file's SHA-256 remained unchanged.
3. Native kneel and turn commands completed in a smoke test: the selected unit's TU changed 102 → 98 → 94.
4. A native bow shot completed in a separate smoke test: TU changed 184 → 159, ammunition 16 → 15, and the native RNG advanced. This is command-path validation, not a tactical recommendation.
5. Two early end-turn runs timed out because a native turn announcement required acknowledgement. A one-key diagnostic established that the original AI had run and the turn could complete. The production fix invokes only the still-active `NextTurnState::close()` handler after original initialization and think; it does not bypass environmental conditions or reinforcements.
6. With the fix, two separate native processes replayed the same end-turn plan from the same save and RNG, returned to player turn 2, and produced five checkpoints each. Both processes completed without diagnostic key injection.
7. Their final RNG, unit positions, health, TU, ammunition, AI data, terrain and all other parsed save values matched **except 23 frame-related fields**: `battleGame.animFrame` and `LAST_HIT_FRAME` / `HITFX_SHF_LAST_HIT_FRAME` tags on 11 units. The strict whole-snapshot comparator therefore correctly returned **`nativeReplayIdentical: false`**. These differences were not deleted from snapshots or silently ignored to turn the test green. In the inspected mod, those tag references are in `HitFX-basic.rul`'s hit-effect bookkeeping and sprite recoloring.

## Certification boundary

This validates native loading, action dispatch and one enemy-turn replay, with matching non-frame serialized values in two runs. It does **not** certify byte-identical full replay, all possible scripts/mods, equivalence to the user's Windows executable or rendered GUI, complete-mission victory, or thousands of tactical trials.

`parityCertified` and `battleVictoryCertified` remain false. The full resource loader/UI objects are still present. This is not yet an asset-minimal loader that works with a save and MCD/LOFT alone. Missing resources or unsupported commands must fail, never fall back to a surrogate.

Private saves, game resources and detailed private checkpoints are not included in this public repository. Raw evidence was retained in the GPT workspace for delivery to the user.
