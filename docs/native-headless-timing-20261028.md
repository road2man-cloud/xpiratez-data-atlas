# Original OXCE headless timing reproducibility investigation — 2026-10-28

## Genuine GPT Linux replay evidence

Baseline native OXCE binary SHA-256: `db60328ce7bae87272b6ffb23e9526cf9afceb5e82d67ec0ba456541c17edaa1`. This was compiled from the preserved original OXCE 8.7.1 source with RC18 overlay and the existing no-render adapter, not a numerical surrogate.

- The user-supplied `17.sav` loaded and advanced from player turn 1 to player turn 2 using the original OXCE AI and the action list `observe; end_turn; observe; stop`.
- Independently launched replays B and C completed the plan with five native checkpoints each.
- Every parsed save value at the final checkpoint matched except 23 fields: `battleGame.animFrame` and 22 `LAST_HIT_FRAME` / `HITFX_SHF_LAST_HIT_FRAME` tags on the 11 allied units.
- In B, `battleGame.animFrame` was 413 and the 22 tag values were 412. In C, both frame and tags were 411. All other parsed values, AI state, terrain, units, inventory, RNG, and damage matched. Whole-save SHA-256 differed, so strict comparison **failed**, correctly.
- X-Piratez's `HitFX-basic.rul` reads `battle_game.getAnimFrame` within damage/hit-effect bookkeeping. The timing differences must not simply be ignored as harmless visual metadata.

## Candidate fix

A separate, version-fingerprinted `deterministic-clock.mjs` build patch modifies only the original engine's **native-headless scheduling**: `src/Engine/Timer.cpp`, `src/Engine/Timer.h`, and the previously headless-hooked `src/Engine/Game.cpp`. In headless mode `Timer::slowTick()` uses 16ms of virtual time per native event-loop iteration, adjusted by the existing gameSlowSpeed. Rendering and its wall-clock delay remain unchanged in ordinary GUI mode.

No replacement attack model, pathfinder, ballistics or AI exists. Core files `AIModule.cpp`, `TileEngine.cpp`, `RNG.cpp`, `Pathfinding.cpp`, `BattleUnit.cpp`, `BattleItem.cpp` remain byte-identical to the locked source archive. A patch receipt with SHA-256 fingerprints is packaged with the new binary.

## Test gates

1. 26 integrity/adapter/evidence-validator tests pass after the follow-up verifier changes. Some use explicitly synthetic fixtures; no native combat executes in these tests. These tests do **not** prove battle victory.
2. The new Linux native build must compile successfully.
3. With the exact same `17.sav`, config and saved RNG, run at least two separate native processes. Compare full serializations and all checkpoints, **without removing or masking animation tags**.
4. If the strict comparator still fails, retain failure. Fix the underlying scheduling or state semantics before claiming determinism.
5. Run actual combat actions (movement, firing, reaction fire) and compare the GUI under the same RNG before certifying parity. A stable headless build is not automatically identical to the user's installed GUI build.

## Follow-up verification status

- The full Linux native build of `494ad2b04dad14b5f72c7966e0a2aa02b81498c6` succeeded in Actions run `40631715028`; artifact `12792765413` is 5,989,896 bytes. This is compile/package evidence, not replay evidence.
- A subsequent attempt to run the new binary in the GPT environment was blocked because both container and Python execution calls returned a `ClientError`. No Windows or CI battle simulation was substituted. **The deterministic-clock build has not yet completed a new actual replay comparison in this follow-up.**
- Added `verify-native-replays.mjs`: repeated original native processes, identical RNG/plan/config, complete raw snapshot rehashing, native-event consistency, and checks that game resource bytes remain unchanged. Repetitions are 2–20 for repeatability checks, not statistical tactical evaluation.
- Added runtime/display identity comparisons and launcher checks against the pinned source archive; the build artifact also carries the matching runner scripts. Failed or incomplete requests remain failures in `verification.json`.
- Keep this work experimental until the full native checkpoint-byte equality gate passes on actual GPT Linux runs. Do not merge it as a certified exact engine or present tactical success probabilities from it.

No individual campaign save or private battle-state snapshot is committed to the public repository.
