# X-Piratez 3D — Stage 25: real S2 120×120 / 160×160, ten-deck tactical scene

**Date:** 2026-11-02 KST. Builds on [Stage 24 real OXCE battle bridge](../stage24/README.md). Continues inside the existing X-Piratez Data Atlas: no new parallel data project, no change to the OXCE campaign executable or user saves. This stage is a **native Silent Storm engine runtime**, not synthetic projected art.

## Real result

S2 Win32/x86 Release `Game.exe` was built using the installed MSVC 19.44 / VS 2022 and launched against **user-owned GOG Silent Storm resources in an isolated runtime copy**. Both variants exited successfully after actual native game session execution:

| Actual engine fact | 120 × 120 | 160 × 160 |
|---|---|---|
| Native `CPathNetwork::CreateLayersGroup` requested | 120 × 120 | 160 × 160 |
| Path-cell physical horizontal footprint (0.625m) | 75 × 75m | 100 × 100m |
| Native terrain builder backing array (8m-aligned) | 80 × 80m | 104 × 104m |
| S2 3D renderer `CMemObject` meshes | 50 | 50 |
| Decks / floor slab geometry | 10 / 10 | 10 / 10 |
| Load-bearing pillar objects | 40 | 40 |
| Actual native AI collision/vision/weapon hull registrations | 50 | 50 |
| Native `CWorld::AddUnitInGame` (temporary GOG person 730) | 1 added | 1 added |
| Native `CMission` state reached | **PASS** | **PASS** |
| Session cleanup / cursor release | **PASS** | **PASS** |

Decks begin at z=0 with 2.5m spacing and the highest slab is at 22.5m. The ten decks are displayed through the original S2 renderer and linked into the original `CAIMap` AI/shot/vision hull pipeline, not emulated by an offline WebGL test.

**Critical caveat (updated 23:49 KST):** Native floor path nodes **have now been verified at one representative point on all 10 decks** in both map sizes; the test point on all 10 decks also supports a standing pose and one horizontal `TT_MOVE` edge. Actual ground-level movement of one native S2 actor was independently verified. This does **not** establish connected stairs/ladders, real actor movement on decks 2–10, whole-floor coverage, physical collision response, high-floor line-of-sight or projectiles, penetration, destruction or AI performance. No genuine X-Piratez geometry, character, rifle or strategic result handoff was tested. The actor is native GOG S2 persona 730.

## Stage 25-B/C — Native movement and floor-nav regression (23:49 KST)

A real native regression test uncovered a **hardcoded 8-floor clamp** in `Main/aiPassCalcer.cpp` independent of the expanded `N_MAX_FLOORS`: `if ( nFloorIndex > 7 ) nFloorIndex = 7;`. Before the fix, 11 layers existed but only the first 8 floors were valid at the tested point (`floor_mask=255`), despite 10 registered collision decks and 50 meshes. The Stage25 fork now saturates against `N_MAX_FLOORS - 1`. Its original WindowProbe source remains unchanged.

A rebuilt **Win32 native S2** `Game.exe` with SHA-256 `627CCE6F1FD25645B3389541455102F9C7166EBF634E9A8C009E9FB7E8F5D6FF` completed actual GOG game sessions for 120×120 (23:48 KST) and 160×160 (23:49 KST). Both sessions reported `layers=11`, `valid_layers=10`, `floor_mask=1023`, `stand_mask=1023`, `adjacent_edge_mask=1023`, `routes_verified=0`. They also independently verified actual ground actor movement from (0,8) to (3,8): native path accepted, real grid and 3D position changed, actor arrived with no pending path or movement, and the process and cursor were cleaned up.

The layer probe uses (56,56), inside the 20×20m tower. `stand_mask` verifies the standing-pose passability result at this coordinate. `adjacent_edge_mask` verifies the native `TT_MOVE` transition from (56,56) to (57,56) *within the same floor*. These are representative **horizontal path graph checks**, not evidence that a soldier traversed the tenth floor or can ascend between floors.

| Native verification | Pre-fix | Fixed 120×120 | Fixed 160×160 |
|---|---:|---:|---:|
| Valid floor destinations | 8/10 (`0x0FF`) | **10/10 (`0x3FF`)** | **10/10 (`0x3FF`)** |
| Standing-pose passability | not tested | **10/10** | **10/10** |
| Native adjacent `TT_MOVE` edges | not tested | **10/10** | **10/10** |
| Actual spawned actor ground movement | earlier PASS | **PASS** | **PASS** |
| Actual 1→10 floor route / high-deck actor movement | NOT VERIFIED | **NOT VERIFIED** | **NOT VERIFIED** |

The evidence is retained separately, including a **failed hypothesis** before the clamp repair: [pre-fix 120](evidence/clamp-before-120/receipt.json), [fixed 120 after clamp](evidence/nav-fixed-120/receipt.json), [fixed 160 after clamp](evidence/nav-fixed-160/receipt.json), [final 120 actor+standing+edge](evidence/native-deck-edge-120/receipt.json), and [final 160 actor+standing+edge](evidence/native-deck-edge-160/receipt.json). Each directory archives its own original driver, S2 native movement/deckscan, map, unit insertion, interface and world logs, with no licensed GOG assets or binary executables.

## Independent evidence verifier and falsification

Run `python experiments/xpiratez3d/stage25/verify-native-deck-evidence.py --self-test` from the Atlas repository root (no S2 runtime required). The verifier compares the historical failing eight-floor clamp with both final native passes, checks executable hash labels/consistent session PID and command ACK, actual renderer and AI hull traces, per-layer heights/passability/standing/TT_MOVE, real spawned-actor 3D displacement and AP expenditure, and clean exit. Eight deliberate in-memory forged-evidence cases must be rejected. It **does not** cryptographically authenticate the original executable binary, which stays on the user's machine, and it does not validate an untested vertical route.

## Root cause of first native crash and fix

The initial native test crashed immediately after first-floor hull creation with Win32 `0xC0000005`. Injecting `IAIVisitor::AddHull()` directly from `CWorld::CreateDefault` was invalid: `COrdinarySyncDst::RegisterBase` requires `pStuff` set by a live `IVisObj` visitation. The corrected implementation **creates `CStage25CollisionTower` as an `IVisObj` and `IDynamicObject`, links it through `CSyncSrcBind<IVisObj>::Link(pShow,this)`, retains its lifetime in `miscObjects`, then lets the normal `pAIMap->Sync()` invoke `Visit(IAIVisitor*)`**. The original map/AI pipeline then recorded 50 true hulls, synchronized and reached native mission state. Source regression: first crash and both success cases are retained locally; only success logs are mirrored under `evidence/`.

## Modified S2 engine paths (baseline and follow-up patches)

[Baseline engine patch](s2-native-120x120x10.patch) applies on the user's existing `Silent-Storm-XPZWindowProbe` source copy and changes six files:

- `Main/aiGrid.h`: 12 floor slots in the test engine (was 8); height interpolation envelope 40m (was 25m).
- `Main/RPGVision.cpp`: 32×32×8 vision chunk array (was ×4), nominal 40m height; not a proof of high-floor LOS.
- `Main/wExplTracker.cpp`: 0x40×0x40×16 explosion volume; extends global Z-voxel clamp to 0xfe (0.2m cells), nominal 51.2m high; high-floor blast effect unverified.
- `Main/wMain.cpp`: opt-in native path network `120×120` or `160×160`, properly aligned S2 terrain backing, synced procedural collision hull source and real AI-map integration; logs exact stages of setup.
- `Main/iMissionInternal.h`: temporary owner of generated S2 renderer mesh objects.
- `Main/iMission.cpp`: opt-in independent map creation instead of the preexisting tutorial world, 10 real S2 deck render meshes, requested camera cut range and source-stage logging.

The [follow-up patch](s2-native-stage25-floor-nav-followup.patch) changes **two additional files** and must be applied *after* the baseline patch: `Main/aiPassCalcer.cpp` (fixes eight-floor slot saturation) and `Main/iMain.cpp` (isolated read-only high-floor `deckscan` plus reuse of existing Stage23 movement). `git apply --check` succeeded against the original WindowProbe checkout. The live Stage25 fork already includes both patches.

Original game process/mission path with Stage25 flags **unset** remains unchanged in this isolated Stage25 source. All actual Game binaries, GOG `game.db`, data and purchased resources remain **local only**, not in the Atlas Git repository.

## Reproduce locally

Source: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\Silent-Storm-XPZStage25`

Built engine: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-stage25-win32\Release\Game.exe`

Isolated runtime: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-smoke-stage-002`

To rebuild, run the [single native S2 build script](build-native-stage25.ps1). To launch the actual S2 GOG test runtime:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\experiments\xpiratez3d\stage25\windows-native-large-map-smoke.ps1 -Size 120 -WithHulls -SpawnActor -MoveActor -DeckScan

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\experiments\xpiratez3d\stage25\windows-native-large-map-smoke.ps1 -Size 160 -WithHulls -SpawnActor -MoveActor -DeckScan
```

Run native S2 graphics tests in the **logged-in interactive Windows desktop session (road4, session 1)**. A separate attempt using the service account in noninteractive session 0 timed out before the engine's READY signal; it was **not** a valid graphics regression. Use `-LeaveOpen` only when inspecting a live scene; otherwise the command exits and releases the mouse. `-MoveActor` checks actual native accepted orders, grid/world position displacement, arrival and animation settled. `-DeckScan` checks standing destinations and local edges, and explicitly fails on a non-10/10 destination mask. No original OXCE campaign save is changed.

Original first pass build: `Game.exe` SHA-256 `AA220903D3D383CCE7294B01F2CB3883FB709E45A6859513FB16CC8B9A2CDC74` (20:31/20:34 KST). **Latest tested build (23:48/23:49 KST):** SHA-256 `627CCE6F1FD25645B3389541455102F9C7166EBF634E9A8C009E9FB7E8F5D6FF`.

Captured evidence:
- [120 × 120 actual engine run](evidence/120/receipt.json) + [world/geometry logs](evidence/120/xpz_stage25_map.log) and [native actor insertion](evidence/120/xpz_native_units.log).
- [160 × 160 actual engine run](evidence/160/receipt.json) + [world/geometry logs](evidence/160/xpz_stage25_map.log) and [native actor insertion](evidence/160/xpz_native_units.log).

## Status ledger / falsification gates

| Capability | Current status | What is needed next |
|---|---|---|
| 120² and 160² S2 native scene creation | **Actual engine execution — PASS** | Load genuine mission geometry rather than the tower |
| 10 floor slabs + 40 columns in native rendering | **Actual engine execution — PASS** | Check camera cutoff at all decks with real texture/material |
| Native 50 hulls in AI-map Sync | **Actual engine execution — PASS** | Real physical collision/occlusion probes at deck 10 |
| 12-slot floor envelope, 10-floor destination/standing/local edge | **Native engine — PASS at one tower point on all 10 floors** | Test real actor deployment/movement on decks 2–10, then entire floor coverage and reserved slots |
| 40m vision / 51.2m explosion extents | **Source/build confirmed** | Cross-floor line tracing and explosion effect on upper levels |
| Native S2 person spawned on both scales | **Actual engine execution — PASS** | Spawn X-Piratez entities at correct positions with correct gear/stats |
| Full vertical routes 1→10 and post-destruction recalculation | **Not implemented; only same-floor horizontal edges verified** | Construct stairs/ladders and prove real actor ascent/descent, then destruction invalidation |
| Full floor mask for render/pick/camera | **Not resolved** | `Main/GMatShare.h` has `N_MIN_FLOOR=-3`, `N_MAX_FLOOR=4` and `Main/GScene.h` `N_MASK_FLOORS=0x0fff`. High bits are shared with other flags; don't naïvely change mask to 0xffff |
| Actual X-Piratez MAP/MCD/LOFT→native 3D mesh | **Not implemented** | Parse one genuine X-Piratez terrain with spatial structure and hulls; then scale |
| Representative photoreal 3D soldier and one rifle | **Not implemented** | Generate and rig suitable native assets, hand attachment and muzzle hit origin |
| 3D combat outcome → OXCE campaign continuation | **Not implemented** | Schema/mapping for kills, wounded, loot, objectives, stages and authoritative OXCE-side result commit |

The project objective is a playable 3D **mode**, not parity with OXCE's original tactical outcomes. Native S2 movement/AP/pathfinding are adopted as the engine base; tests should concentrate on new scene integration rather than repeatedly establishing known original engine behavior. Until the 3D result contract is complete, keep using the normal OXCE 2D campaign for real saves.
