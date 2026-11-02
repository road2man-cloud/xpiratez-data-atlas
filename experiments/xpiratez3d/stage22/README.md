# Stage 22 — Native GOG tutorial spawn verification (2026-11-02)

**Result: `NATIVE_SPAWN_PASS` (real x86 Silent Storm engine, no mock).**

This stage extends the existing `xpiratez-data-atlas/experiments/xpiratez3d` work. It does **not** create a replacement rules database, publish the purchased GOG assets, modify any OXCE save, or implement X-Piratez 3D combat.

## Proven in the isolated GOG runtime

- **Built engine:** `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-windowprobe-win32\Release\Game.exe`
- **Engine SHA-256:** `78B078FEEEEC72378B10249122E8ACD079DAAE27A03CEDD45B0D5ADD91349EA5`
- **Runtime:** `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-smoke-stage-002` (only an isolated copy).
- **Successful run session:** `s2266bff2b170ad49f593`, PID 6604 (interactive Windows session 1), 2026-11-02 13:58 KST.
- **Full run evidence** is in [evidence/](evidence/) and the original trace snapshots in the isolated runtime's `stage22-evidence-s2266bff2b170ad49f593` directory.

| Gate | Engine-observed result |
| --- | --- |
| Win32 build | VS2022/MSVC Release, CMake `--build ... --config Release --target Game --parallel 2`, exit 0 |
| Startup | `READY session=... pid=6604` |
| Command receipt | `ACK` and `DISPATCH` for each normal command |
| Duplicate transport | Replayed sequence 1 explicitly ignored |
| Stale transport | Wrong session rejected; no tutorial transition |
| Tutorial | `CMission` loaded, then first native `CShowHintInterface` appeared |
| Hint chain | Two real hint interfaces dismissed via their native mission UI event and modal close; two `pop_interface` events observed |
| World advancement **after hints** | `CWorld::Segment` count 50 -> 90, later 130 -> 170; `world_update scene_time` 1906 -> 3906 -> 5906 -> 7906 |
| Native spawn 1 | `CWorld::AddUnitInGame` world 6 -> 7, player 1 -> 2, actor `1CB82A28` |
| Native spawn 2 | `CWorld::AddUnitInGame` world 7 -> 8, player 2 -> 3, distinct actor `1CB84068` |
| Invalid-ID negative control | `summonunit 999999` produced no additional `world_add_completed` |
| Safety / cleanup | `XPZ3D_FREE_MOUSE=1`; explicit `ClipCursor(NULL)` in `finally`, isolated test process exited |

The first smoke run used the original `start.cfg` intro sequence and timed out at the menu gate; it was correctly recorded as FAIL (no false PASS). A corrected run set `-cfg xpz-start-no-video.cfg`. A second corrected run initially proved native spawn **before** the hint, which is not proof of hint recovery; the final recorded run explicitly waited for the first hint, dismissed two hints and verified the *post-hint* world before spawning.

## Actual engine change

In the isolated source checkout:

`D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\Silent-Storm-XPZWindowProbe\Game\Main.cpp`

- Fixed incorrectly double-escaped newline processing and ACK traces found in the previous in-tree command channel.
- Added an explicit per-run `XPZ3D_HARNESS_SESSION`, monotone sequence number, per-command `ACK` and `DISPATCH`, duplicate and stale-session rejection, and the boot-ready record.
- Incoming commands are produced with temporary-file creation and atomic same-directory rename. A command is **never retried** after an ambiguous ACK or side effect.
- Left the existing test-only hint dismissal implementation intact (it notifies Lua `WaitForUI` via `CCmdInterfaceEvent`, not merely stack-pop).
- Did not change `CWorld::AddUnitInGame` behavior or the normal summon route; `XPZ3D_SPAWN_TEST_EVENT=0`.
- The [source diff](engine-game-main-working-diff.patch) is the **current working-tree diff for `Game/Main.cpp` against the engine fork's tracked baseline**, and therefore also shows the pre-existing `XPZVisualFeed` wiring. It is *not* a pure, independently applicable Stage 21 -> Stage 22 delta. Check context and `git apply --check` before using it; the separately maintained engine checkout is not replaced by the atlas.

## Reproduce on the authorized Windows computer

Run from the Atlas repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\experiments\xpiratez3d\stage22\windows-native-spawn-smoke.ps1
python .\experiments\xpiratez3d\stage22\verify-evidence.py
```

The second command verifies the *captured* logs independently; it does not run or replace the actual-engine smoke.

The bounded script uses the existing isolated GOG runtime, the compiled engine in the existing build folder, and the existing `xpz-start-no-video.cfg` (`mainmenu`). It first ensures no game process is running from that isolated runtime. It archives existing diagnostic files, then copies **only the rebuilt executable** into that same isolated runtime under `XPZ3D_Stage22.exe`. It does not overwrite the purchased `game.exe`. Each run has a unique session token and evidence directory.

The script enforces: READY timeout, ACK/dispatch timeout, no blind retry, duplicate/stale negative controls, real initial hint appearance, bounded native hint pops, sustained post-hint world segments, two exact +1 spawns with different objects, invalid-ID negative control, exact-PID cleanup and cursor release. A failed gate returns nonzero. No silent success is permitted.

## Scope limits and next work

**Stage 22 is complete for the exact tested native-spawn gate.** Real movement, pathfinding, AP, aiming, damage, terrain destruction, X-Piratez unit data mapping, bidirectional OXCE battle results, and 2D/3D mode selection are **not yet implemented/verified**. Those are Stage 23 onwards. The runtime pointer is evidence of a distinct instance in this process, **not a persistent cross-save actor ID**.

Git ancestry note: the previous Stage 21 source and tests are reachable in local Git object `ade4ac3` on a diverged development line, not in current `main` history. Current main also has unrelated soldier-atlas edits in progress and untracked Stage 12 files; avoid a blanket merge or checkout that could overwrite them. This Stage 22 folder can be committed independently while preserving that work; merge the diverged history only after checking file-level conflicts.
