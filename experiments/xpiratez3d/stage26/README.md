# X-Piratez 3D — Stage 26: actual source terrain, source art and imported-map acceptance

**Development principle (updated by user): do not spend the milestone verifying Silent Storm alone.** A valid combat demonstration must use a **real X-Piratez battle map and real X-Piratez unit/equipment identities**. A successful empty native scene, ten-deck tower or S2 prototype-person movement is not the result. This is an **optional S2 tactical mode**, keeping the OXCE strategy/campaign/save engine intact.

## Source-of-truth and protection

- Actual battle save (private, read-only): `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\user\piratez\4__.sav`.
- Existing Stage24 bridge: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage24\battle-start.json`.
- Actual source save SHA256: `d05dc06ed3c3048fbea17002eb2da41e64a1d1226065ebf11658e4aca71fd1d4`.
- Real mission: `STR_UFO_CRASH_RECOVERY`, battleID `71c6d7292d67a5db8e58c3283b2a1522`, size **60×60×7**, 44 actors (11 player, 33 hostile), 410 item instances.
- Actual MCD/LOFT/PCK art read from legally installed X-Piratez local mod folder. Neither source sprites, original MCDs, LOFT data, GOG assets nor original save are copied into the Atlas Git repository.
- All generated **private** converted binary meshes, source-art contact boards, manifests and native test evidence remain beneath `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage26` and the pre-existing isolated `gog-runtime-smoke-stage-002`.

## Native *imported X-Piratez* results, not synthetic S2 tests

| Actual-source milestone | What was established |
| --- | --- |
| Decode real OXCE saved binary tiles | 4,859 true tile records, 11 terrain datasets; real MCD part references preserved |
| Convert whole original 60×60×7 map to native-ready polygons | **Generated**: 253 unique MCD shapes, 389 detail meshes, 233,452 vertices, 116,726 triangles; **not yet native loaded** |
| Convert 16×16 actual portion | 58 unique shapes, 36 visual meshes, 10,300 triangles |
| Initial 16×16 native test **with high-detail AI hulls** | **FAIL**: 36 detailed hulls registered but S2 `UpdateColouring` did not complete; log/evidence retained |
| Generate separate **source-derived approximate** 16×16 navigation hulls | 27 nav/AI meshes, 1,728 triangles, derived from real MCD LOFT surfaces and OXCE walkTU, NOT invented tower cubes |
| **16×16 visual + collision proxy native S2 mission** | **PASS**: 36 full visual meshes and 27 coarse hulls registered, navigation initialization returned, actual `CMission` reached, original tower excluded; session `s26d411ebfc0b2a45` |
| Initial tiny actual 4×4 area | **PASS**: 4 original-source meshes and 4 matching native hulls, actual `CMission`, original tower excluded; session `s26d11f0f31314e4f` |
| 60×60 source-derived coarse collision | **Generated**: 241 collision meshes and 16,548 triangles; full mission with this source not yet executed |

Tested updated native engine SHA256 for the successful 16×16 test:
`387D219782B5F4DE1EF593620C1AF8E8BD34B4F8038A44271934DE7CA2855BD6`.

The native S2 test executable is
`D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-stage25-win32\Release\Game.exe`.

### Code (same project, no second final project)

- [convert-terrain.mjs](convert-terrain.mjs) — reads actual OXCE YAML/binary tiles, original MCD 62-byte terrain records and LOFT 16×16×12 bit shapes, greedy meshes exposed original voxel surfaces and writes a compact native geometry stream `XPZ3D26A`. Exact original sprite texturing is **not** done; flat colors are marked as placeholders.
- [collision-proxy.mjs](collision-proxy.mjs) — separate movement-oriented approximation: merges contiguous real floor tiles and blocks impassable objects where original MCD walk TU equals 255. It does **not** preserve window apertures, full foliage occlusion or correct penetration, and is not sufficient for final combat.
- [graphics-catalog.mjs](graphics-catalog.mjs) — joins 44 source actors and 410 source items to installed `Piratez.rul`, `Piratez_Armors.rul`, `Piratez_Resources.rul`, `Piratez_Wardrobe.rul` and other local ruleset fragments. Resolves `spriteSheet`, armor `layersDefinition`, `typeSingle/fileSingle` art references and `BIGOBS.PCK`, `FLOOROB.PCK`, `HANDOB.PCK` indices to **actual local image files with hashes**; does not copy pixels into Git. Ruleset overlay ordering and exact animation/body variant need additional confirmation.
- [build-reference-board.py](build-reference-board.py) — composes a **local, licensed, nonredistributable** source-art sheet for the first actual soldier/weapons; labels it explicitly not a native 3D mesh.
- [windows-imported-terrain-smoke.ps1](windows-imported-terrain-smoke.ps1) — actual Win32/GOG `CMission` smoke with source/battle hash checks and two independent source-derived visual/collision counts. Refuses false positives from the original test tower. Preserves original saves, refuses occupied runtime, cleans up its own process and releases mouse capture.
- [test-converters.mjs](test-converters.mjs) — adversarial full/empty/single-column LOFT, orientation and binary format checks.

S2 stage26 import code is located in the existing experimental engine fork, **not a new standalone 3D project**:

- `Silent-Storm-XPZStage25/Main/XPZ3DImportedTerrain.h` — size-checked native `CMemObject::Create` loader for real source-derived geometry. The exact header's source-only recovery copy is maintained as [XPZ3DImportedTerrain.h](XPZ3DImportedTerrain.h) in this Stage26 folder; the working engine is still the existing Stage25 fork.
- `Main/wMain.cpp` — opt-in original-source AI hull visitor, using separate `XPZ3D_STAGE26_COLLISION_PATH` when set. No altered campaign/save path.
- `Main/iMission.cpp` and `iMissionInternal.h` — imported `pScene->CreateMesh` geometry ownership and rendering; no fake tower when actual source map supplied.

## Quantified actual X-Piratez graphics workload

- Original battle: **13 distinct armor/appearance rules** used by 44 units, and **83 distinct inventory item rules** used by 410 item instances. All 13 armor rules and 83 item rules were located in installed rule files.
- Armor layering can be substantial: actual `STR_TAC_VEST_UC` / `STR_HYENA_RIDER_ARMOR_UC` definitions enumerate up to **120 original sprite variants**; this is **not** a requirement to create 120 separate 3D bodies. Design modular anatomical rig, materials and components and connect the original appearance parameters to variants.
- Starting target from real battle: soldier **unit 56, Gray Gremlin**, armor `STR_TAC_VEST_UC`, original grid position **(25,16,0)**, right-hand weapon rule `STR_SMG_10MM`. The Stage24 bridge alone does not preserve full visual identity, **but the original linked geoscape Soldier record does**. Verified `gender=1`, `look=2`, `lookVariant=8`, battle recolor pairs `[[96,163],[144,246]]`. OXCE's actual `Soldier::getArmorLayers` mask expression resolves **`F34`** with no fallback; this key exists in `Piratez_Armors.rul`.
- Its source armor sheet is `PIR_1.PCK` from installed `Resources/Sprites/PIR_1.png` (512×720, 32×40 frame cell). Its **actual `F34`** armor layering includes `F34_NUDE`, `PANTIES_HCUT_BLACK`, `HOLSTER`, `FINGERLESS_GLOVES`, `SCOUT_MAIN`, `TAC_VEST`, `HEAD_F34` (7 nonempty layers). Weapon rule includes big/hand/floor references and native ballistic parameters. A second unit wearing the same `STR_TAC_VEST_UC` has **a different confirmed `F11` appearance**; do not conflate the two or create a second unrelated skeleton.
- First private art worklist JSON is `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage26\graphics-asset-worklist.json`.
- First private image references for the future actual actor and gun:
  `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage26\artwork-private\unit-56-original-art-reference.png` and `unit-56-art-reference.json`. **Eleven** verified original-art references linked and the actual `F34` source layers selected; the original face/hair recolor remains to be mapped into PBR materials. This is a **reference sheet only**, not 3D geometry; not distributable.

### Next product acceptance gates (do not collapse these into a synthetic S2 demo)

1. Use the now resolved source unit 56 **`F34`** armor appearance, original recolor pairs and actual `STR_SMG_10MM` identity. Make **real 3D body meshes** for its armor and a 3D `STR_SMG_10MM` gun, with authorable materials, shared skeleton, grip/left-hand sockets, muzzle origin, walk/shoot animations and engine collision parts.
2. Load the real converted mission around source tile (25,16,0), spawn the imported character with source-driven equipment and source-grid placement, and prove native grid + world position **really change** as it follows its path. Native temporary GOG persona 730 is NOT enough.
3. Confirm actual terrain collision/LOS/ballistics/destruction at precisely identified original map coordinates; replace approximate movement hulls with semantics-preserving collision/visibility/penetration proxies.
4. Integrate all 60×60×7 current source map and 44 actors/410 items, then expand generality to other true original maps, including any with 10+ floors. A 12-floor native engine envelope is not itself proof that such maps work.
5. Finally connect native mission results to authoritative OXCE strategic saves. Do not modify original saves during development.

### Repeatable commands (authorized Windows/installed game only)

Run from the existing `D:\daphne_auto\xpiratez-data-atlas` checkout in the **interactive desktop session**, not a Windows session-0 service:

```powershell
node experiments/xpiratez3d/stage26/test-converters.mjs

node experiments/xpiratez3d/stage26/graphics-catalog.mjs --battle D:/daphne_auto/XPZ3D_ENGINE_BUILD_20261102/battle-bridge/stage24/battle-start.json --save C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/piratez/4__.sav --game-root C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez --out D:/daphne_auto/XPZ3D_ENGINE_BUILD_20261102/battle-bridge/stage26/graphics-asset-worklist.json

node experiments/xpiratez3d/stage26/convert-terrain.mjs --save C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/piratez/4__.sav --battle D:/daphne_auto/XPZ3D_ENGINE_BUILD_20261102/battle-bridge/stage24/battle-start.json --game-root C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez --out D:/daphne_auto/XPZ3D_ENGINE_BUILD_20261102/battle-bridge/stage26/real-oxce-map-region --region 8,42,16,16 --scale 120

node experiments/xpiratez3d/stage26/collision-proxy.mjs --save C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/piratez/4__.sav --battle D:/daphne_auto/XPZ3D_ENGINE_BUILD_20261102/battle-bridge/stage24/battle-start.json --game-root C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez --out D:/daphne_auto/XPZ3D_ENGINE_BUILD_20261102/battle-bridge/stage26/real-oxce-map-region --region 8,42,16,16 --scale 120

powershell.exe -NoProfile -ExecutionPolicy Bypass -File experiments/xpiratez3d/stage26/windows-imported-terrain-smoke.ps1 -Size 120 -CollisionPath D:/daphne_auto/XPZ3D_ENGINE_BUILD_20261102/battle-bridge/stage26/real-oxce-map-region/xpz3d-collision-proxy-v1.meshbin -CollisionManifestPath D:/daphne_auto/XPZ3D_ENGINE_BUILD_20261102/battle-bridge/stage26/real-oxce-map-region/collision-proxy-manifest.json
```

The example `-SpawnPrototype` is deliberately **not** a pass for an imported character: it only inserts unmodified native S2 persona 730, marked `originalXpiratezUnitModelImported=false`.

**As of this stage:** real X-Piratez scene geometry generation and a real 16×16 imported-map native loading test have passed. The complete artistic reconstruction, source-unit movement, X-Piratez combat and strategic handoff remain incomplete. Do not report a playable X-Piratez 3D battle mode.
