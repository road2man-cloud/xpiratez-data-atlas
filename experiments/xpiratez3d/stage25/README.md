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

**Critical caveat:** `CreateLayersGroup(120,120)`, 50 registered hulls and a spawned actor do **not** prove that all 10 decks have traversable floor path nodes, connected stairs/ladders, physically tested collision, line-of-sight occlusion, penetration, destruction or reasonable AI performance. These capabilities remain explicitly **UNVERIFIED/NOT IMPLEMENTED**. The world can hold 10 separate collision decks, but floor-to-floor routes have not been built. This stage did not use real X-Piratez geometry, character models, weapons or campaign result handoff. The character is only the native S2 GOG model 730.

## Root cause of first native crash and fix

The initial native test crashed immediately after first-floor hull creation with Win32 `0xC0000005`. Injecting `IAIVisitor::AddHull()` directly from `CWorld::CreateDefault` was invalid: `COrdinarySyncDst::RegisterBase` requires `pStuff` set by a live `IVisObj` visitation. The corrected implementation **creates `CStage25CollisionTower` as an `IVisObj` and `IDynamicObject`, links it through `CSyncSrcBind<IVisObj>::Link(pShow,this)`, retains its lifetime in `miscObjects`, then lets the normal `pAIMap->Sync()` invoke `Visit(IAIVisitor*)`**. The original map/AI pipeline then recorded 50 true hulls, synchronized and reached native mission state. Source regression: first crash and both success cases are retained locally; only success logs are mirrored under `evidence/`.

## Modified S2 engine paths (one isolated, re-applicable patch)

[Native engine patch](s2-native-120x120x10.patch) applies on the user's existing `Silent-Storm-XPZWindowProbe` source copy. Exact production modifications are in only six files:

- `Main/aiGrid.h`: 12 floor slots in the test engine (was 8); height interpolation envelope 40m (was 25m).
- `Main/RPGVision.cpp`: 32×32×8 vision chunk array (was ×4), nominal 40m height; not a proof of high-floor LOS.
- `Main/wExplTracker.cpp`: 0x40×0x40×16 explosion volume; extends global Z-voxel clamp to 0xfe (0.2m cells), nominal 51.2m high; high-floor blast effect unverified.
- `Main/wMain.cpp`: opt-in native path network `120×120` or `160×160`, properly aligned S2 terrain backing, synced procedural collision hull source and real AI-map integration; logs exact stages of setup.
- `Main/iMissionInternal.h`: temporary owner of generated S2 renderer mesh objects.
- `Main/iMission.cpp`: opt-in independent map creation instead of the preexisting tutorial world, 10 real S2 deck render meshes, camera cut range and source-stage logging.

Original game process/mission path with Stage25 flags **unset** remains unchanged in this isolated Stage25 source. All actual Game binaries, GOG `game.db`, data and purchased resources remain **local only**, not in the Atlas Git repository.

## Reproduce locally

Source: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\Silent-Storm-XPZStage25`

Built engine: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-stage25-win32\Release\Game.exe`

Isolated runtime: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-smoke-stage-002`

To rebuild, run the [single native S2 build script](build-native-stage25.ps1). To launch the actual S2 GOG test runtime:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\experiments\xpiratez3d\stage25\windows-native-large-map-smoke.ps1 -Size 120 -WithHulls -SpawnActor

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\experiments\xpiratez3d\stage25\windows-native-large-map-smoke.ps1 -Size 160 -WithHulls -SpawnActor
```

Use `-LeaveOpen` only when wanting to inspect a still-running actual tactical scene; otherwise the command exits and releases the mouse. The harness uses session-scoped command ACK, no reuse of an occupied game process, and creates separate evidence directories. It must not write original OXCE campaign saves.

Native build at the end: `Game.exe` SHA-256 `AA220903D3D383CCE7294B01F2CB3883FB709E45A6859513FB16CC8B9A2CDC74` (actual tested 2026-11-02 20:31 and 20:34 KST).

Captured evidence:
- [120 × 120 actual engine run](evidence/120/receipt.json) + [world/geometry logs](evidence/120/xpz_stage25_map.log) and [native actor insertion](evidence/120/xpz_native_units.log).
- [160 × 160 actual engine run](evidence/160/receipt.json) + [world/geometry logs](evidence/160/xpz_stage25_map.log) and [native actor insertion](evidence/160/xpz_native_units.log).

## Status ledger / falsification gates

| Capability | Current status | What is needed next |
|---|---|---|
| 120² and 160² S2 native scene creation | **Actual engine execution — PASS** | Load genuine mission geometry rather than the tower |
| 10 floor slabs + 40 columns in native rendering | **Actual engine execution — PASS** | Check camera cutoff at all decks with real texture/material |
| Native 50 hulls in AI-map Sync | **Actual engine execution — PASS** | Real physical collision/occlusion probes at deck 10 |
| 12-slot floor envelope | **Source/build confirmed** | Actual reachable path nodes on levels 9–11 |
| 40m vision / 51.2m explosion extents | **Source/build confirmed** | Cross-floor line tracing and explosion effect on upper levels |
| Native S2 person spawned on both scales | **Actual engine execution — PASS** | Spawn X-Piratez entities at correct positions with correct gear/stats |
| 10-floor path + vertical transitions | **Not implemented** | Stairs/ladders/elevator connections; correct AI movement graph |
| Full floor mask for render/pick/camera | **Not resolved** | `Main/GMatShare.h` has `N_MIN_FLOOR=-3`, `N_MAX_FLOOR=4` and `Main/GScene.h` `N_MASK_FLOORS=0x0fff`. High bits are shared with other flags; don't naïvely change mask to 0xffff |
| Actual X-Piratez MAP/MCD/LOFT→native 3D mesh | **Not implemented** | Parse one genuine X-Piratez terrain with spatial structure and hulls; then scale |
| Representative photoreal 3D soldier and one rifle | **Not implemented** | Generate and rig suitable native assets, hand attachment and muzzle hit origin |
| 3D combat outcome → OXCE campaign continuation | **Not implemented** | Schema/mapping for kills, wounded, loot, objectives, stages and authoritative OXCE-side result commit |

The project objective is a playable 3D **mode**, not parity with OXCE's original tactical outcomes. Native S2 movement/AP/pathfinding are adopted as the engine base; tests should concentrate on new scene integration rather than repeatedly establishing known original engine behavior. Until the 3D result contract is complete, keep using the normal OXCE 2D campaign for real saves.
