# Stage 23 — Native movement, rejected orders and AP (2026-11-02)

**Result: real-engine `NATIVE_MOVEMENT_PASS` in both realtime and turn-based modes.** This stage extends Stage 22 inside the *isolated* licensed GOG Silent Storm runtime; no campaign save, original game install, or purchased asset is modified or republished.

## Pinned build and recorded sessions

- Engine source checkout: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\Silent-Storm-XPZWindowProbe`
- Native x86 Release executable: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-windowprobe-win32\Release\Game.exe`
- **Identical successful-run engine SHA-256:** `B567425C8499236F21DDDD0E856B785AA528D5CCE28C68361E3357AF3CC0B723`.
- Authorized GOG test runtime: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-smoke-stage-002`.
- Realtime success: session `s2394e2749387c6497e8d`, PID 30676, 2026-11-02 14:46 KST.
- Turn-based success: session `s23c1db2cc39c77427fbd`, PID 31416, 14:47 KST.
- Historical **FAIL**, older different binary: `s23db5432f398af4970be`, PID 5296, 14:28 KST.

The 21 original text-only trace files (seven from each run) are archived in [evidence/](evidence/). [MANIFEST.sha256](MANIFEST.sha256) contains their exact SHA-256 hashes, independently compared against the original isolated-runtime snapshots. The archive contains **no GOG resource assets**. The local [.gitattributes](.gitattributes) disables newline normalization and text diff for captured evidence, so the original Windows CRLF bytes and SHA-256 stay valid on another checkout.

| Gate | Realtime | Turn-based |
| --- | --- | --- |
| Actual native x86 engine | Pass | Pass |
| Boot and command transport | READY, ACK/DISPATCH; duplicate/stale rejection | Same |
| First tutorial hint and recovery | 2 native hint pushes/pops, then world advances | Same |
| Native unit insertion | `summonunit 730`; world 6→7, friendly roster 1→2 | Same |
| Impossible destination | (7,6), native `CanDo` reports `UCR_PATH_NOT_FOUND=8` | Same |
| **Actually submitting** blocked movement | Native `SetTargetPosition` returns 8 | Same |
| Blocked-order state | Grid, AP, path and 3D position unchanged | Same |
| Valid movement | (7,10) → (10,10), native preview and submit return 1 | Same |
| World-space coordinates | (12.524,55.313,5.947) → (12.555,57.175,5.947) | Same |
| Settled state | At destination, `moving=0`, `path=0` | Same |
| World segments during movement | 121→164 | 133→173 |
| AP | **53→53** (native realtime behavior) | **53→41**, 12 consumed |
| Teardown | Explicit process quit and `ClipCursor(NULL)` | Same |

These are **native engine logs**, not simulated or manually edited coordinates. The C++ path obtains the target through the game's own `CUnitTracker::SetTargetPosition` and records `unit->GetPosition()`, `GetRealPosition()`, `IsMoving()`, `GetCurrentPath()` and actual RPG AP. The `CUnitServer` insertion pointer and the exposed `CUnit` interface pointer are different transient addresses; neither is a persistent unit ID.

`CDumbUnitServer::SpendAP()` deliberately skips AP deduction while the world runs in realtime mode. Turn-based testing first invokes the same `CCmdStartCombat` used by the normal game UI, proves `realtime=0 player_turn=1` and then measures the 12 AP reduction. Neither AP nor position is set directly by the test.

## Regression caused by the wrong command mode

The early failed probe used `SetTargetPosition(target, false, false)`. Its command was *accepted* and `moving=1,path=1` appeared, but no grid or floating-point 3D movement occurred across 24 observed samples. This original `FINAL=FAIL` is retained in [evidence/failed-not-instant/](evidence/failed-not-instant/). A fake success based on the movement flag alone must be rejected.

Source inspection established that the actual interactive `CStateMove::DoMove` path passes `bInstantly=true`. The corrected probe uses `SetTargetPosition(target, true, false)` and only counts a PASS after the **same actor** changes grid and 3D position, reaches the target, and settles to `moving=0,path=0`.

An additional negative control submits a real order to non-passable (7,6), confirms the native command's **rejection**, and resamples state after 550 ms. A preflight-only rejection would not satisfy this test. This does **not** yet prove real detouring around a complicated obstacle.

## Reproduce and audit

From the authorized Windows Atlas checkout, provided the isolated engine runtime is idle:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\experiments\xpiratez3d\stage23\windows-native-movement-smoke.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\experiments\xpiratez3d\stage23\windows-native-movement-smoke.ps1 -TurnBased
python .\experiments\xpiratez3d\stage23\verify-evidence.py
python .\experiments\xpiratez3d\stage23\test_verify_evidence.py -v
```

The first two commands run the **real x86 Windows engine**. The script checks an isolated GOG `game.db`, copies only the rebuilt executable under the temporary name `XPZ3D_Stage23.exe`, refuses to run beside another instance, uses a fresh session token, and rejects ambiguous ACKs instead of blindly retrying side effects. It proves actual post-hint world advancement, one native spawn, impossible-order refusal, valid movement, settled animation and mode-specific AP, and returns a nonzero exit on any missing gate. Its `finally` block exits only its own test process and explicitly frees mouse confinement.

The Python auditor verifies the **captured** evidence, its 21 pinned SHA-256 checksums, event chronology, session/PID linkage, exactly-once ACK/DISPATCH, one actor, impossible-order refusal without changes, movement coordinate and completion invariants, and mode-specific AP. It also confirms that the historical no-movement probe remains a FAIL. The separate falsification suite deliberately corrupts in-memory copies of blocked-order acceptance, destination, AP, engine hash, unit identity, and historical outcome; all six forged cases must be rejected. It **does not** simulate the engine, independently authenticate an executable not present in the archive, or make an untested subsequent rebuild equivalent to the recorded tested SHA.

[engine-imain-working-diff.patch](engine-imain-working-diff.patch) snapshots `Main/iMain.cpp` against the engine fork's tracked baseline. This **cumulative working-tree patch** includes inherited hint-test code alongside Stage 23 and is **not** a pristine Stage 22→23 delta: inspect its context and perform `git apply --check` before any reuse. The live C++ implementation remains in the separate source checkout, rather than being transplanted into the Atlas's unrelated files.

## Scope boundary and next work

**Stage 23 is complete for native simple movement, impossible-target rejection, animation settling, and turn-based AP in this GOG tutorial scenario.** It does *not* prove X-Piratez units or equipment are mapped, multi-floor navigation, AI tactics, obstacle **detours**, shooting, damage, terrain destruction, the OXCE 2D/3D handoff, or results returning to strategic campaign saves.

The agreed product architecture remains **OXCE geoscape/management unchanged + optional Silent Storm 3D tactical mode**. Battle result equality with OXCE is not a requirement. Stage 24 can proceed with real unit identity, map/roster handoff and controlled save round trips; Stage 23 must not be mistaken for those milestones.

The engine repository and Atlas repository are separate and contain unrelated working changes. Do not mass-reset, merge, copy licensed resources, or overwrite original saves while reproducing this stage.
