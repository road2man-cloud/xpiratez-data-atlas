# X-Piratez 3D — Universal conversion contract (2026-11-03)

**Priority reset:** the goal is the existing Stage24/25/26 X-Piratez-to-Silent-Storm 3D battle mode. Build maps, terrain/props, real units and weapons first. Preserve the earlier 10-floor result as an edge-case regression, **not a critical-path milestone**. Do not create a competing final game/project or modify user campaign saves.

## Source-to-S2 conversion, three independent contracts

**1. Physical scale:** every object in one scene uses the SAME coordinate transform: source map dimensions, 16×16×24 OXCE voxels per tile, chosen metres per tile, floor height, optional Y-axis inversion, source local anchor, and native grid padding. Use **1.25m per OXCE XY tile and 2.5m per source Z level as an initial hypothesis**, not a confirmed final art scale. S2's current native path grid cell remains 0.625m; this means exactly 2×2 native cells per source tile. A source 2×2 unit spans 4×4 native cells before its actual native collision profile is resolved. Exact collision and actor placement must be tested in-engine.

**2. Tactical semantics:** OXCE saved tile components [floor, westWall, northWall, object], source dataset/MCD record IDs and effective ruleset metadata, LOFT collision voxel occupancy, native collision/LOS/projectiles, door/window/open/destruction state and S2 nav links. The stable identity of an object is (battleId, tileX, tileY, tileZ, partSlot), not its mutable MCD type. Renderer material-batching may combine objects, but collision and destruction must be traceable to independent source objects.

**3. Visual art:** polygon models with modern materials, LOD, rigging and native animation, separate from tactical geometry. It is permissible for a re-authored visual model to span multiple native movement cells. A source sprite or LOFT voxel is evidence for shape and interaction, **not** a demand to make one visual polygon mesh per OXCE tile. The same stable source object ID binds art, tactical proxy, dynamic state, and future OXCE battle outcome.

Never infer unknown units, colliders, door logic or damage semantics solely from sprite pixels. The S2 native model origin, direction-code mapping, body heights, weapon attachment/muzzle and model scale require direct checks.

## Ratios: size is not resolution

| OXCE map | Proposed S2 path grid | Physical XY map extent |
|---|---|---|
| 40×40×9 (real local battle) | 80×80 | 50×50m |
| 50×50×9 (real local battle) | 100×100 | 62.5×62.5m |
| 60×60×7 (real Stage24 crash) | 120×120 | 75×75m |
| 60×60×9 (real village defense) | 120×120 | 75×75m |
| 80×60×N (synthetic rectangular case) | 160×120 | 100×75m |

The old 60×60 -> 160×160 preview fills 100×100m and therefore expands a source tile from 1.25m to about 1.667m: **33.3% more width for every door, wall, room, prop and large unit**. It does not simply provide finer movement resolution. If native 160×160 is needed without changing original size, allocate 20 unplayable border nav cells on each side around 120×120 content, maintaining 75×75m content. Changing S2 cell pitch for genuine finer sampling is a **different native engine change**.

Source tile center with 2×2 native cells falls between 4 path-cell centers. A 1×1 actor therefore has 4 nearest candidate S2 cells rather than one automatically rounded location. A 2×2 OXCE actor has an intended footprint center different from its source tile's anchor and 16 candidate S2 cells. Only the actual S2 native passability/floor/occupancy test may select the cell/pose/path layer. The native SPathPlace horizontal fields are 8-bit; the planner fails if the required grid exceeds 255 per axis instead of truncating.

**Pending native integration:** Stage25/26 C++ CreateDefault still sets a square grid 120 or 160 and an 8m-aligned terrain-backed array. Stage26 makeScene currently explicitly allows only 60×60 and its scale option stretches source physical space. Implement independent X/Y source dimensions and grid sizes driven by a validated manifest. Tests of a pure coordinate planner are NOT evidence of native 80×80, 100×100, rectangular map or original unit spawning.

## Real installed-source evidence (read only)

A scan of 60 existing campaign saves found **18 distinct generated-battle tile payload layouts**, with map dimensions 40×40×9, 50×50×7, 50×50×9, 60×60×7 and 60×60×9. 39 saves did not have an active generated battle. No non-square native save was found in this sample, so rectangular testing is currently synthetic.

Four real battle manifests were audited for projection and footprint-bounds compatibility:

| Source mission | Source dimensions | Units projected | Invalid bounds | Explicit size-2 armor actors |
|---|---|---|---|---|
| UFO crash, 4__.sav | 60×60×7 | 44 | 0 | 3 |
| UFO crash, 5.sav | 40×40×9 | 17 | 0 | 1 |
| Barn, 2____.sav | 50×50×9 | 23 | 0 | 1 |
| Loknar village defense, 8____.sav | 60×60×9 | 25 | 0 | 6 |

**109/109 planned source actor coordinates passed**, but zero of these 109 actors have been physically placed at the newly projected positions in a native S2 test. This is only coordinate/size validation. The original Stage24 60×60×7 map has 39 actors at floor 0 and 5 at floor 1; the upper-floor showcase is not the critical path.

The installed mod ruleset scan examined 16 local .rul files / **1,652 armor definitions**. The original 44-unit crash mission directly declares size 2 for a Hyena Rider and two 14mm truck turret actors. The other 41 actor armor rules have no directly observed size, so **OXCE default/inheritance is unresolved**, not assumed to mean 1×1. Even when OXCE tile footprint is known, native S2 model/collider/animation is separately pending.

Two real tactical map terrain-part inventories (source tile records, not custom render art):

| Battle | Saved tile records | Nonempty source MCD parts | North+west walls | Floor parts | Object parts |
|---|---:|---:|---:|---:|---:|
| Snow crash | 4,859 | 5,844 | 103 | 3,924 | 1,817 |
| Village defense | 5,153 | 6,463 | 1,017 | 4,658 | 788 |

Source component accounting for the existing Stage26 full **offline** crash conversion: 5,844 referenced = 5,807 rendered part instances + 37 skipped empty-LOFT part instances + zero flagged opened-door exclusions. Accounting matches; the 37 need semantic investigation, and effective MCD ruleset overrides are not yet applied. The latest known Stage26 **native** GOG smoke covers only a cropped 16×16 source region: 36 renderer meshes and 27 **approximate** AI collision hulls successfully registered and an actual S2 mission reached. Collision correctness, per-source-part destruction, actual imported unit placement, real firefight and full-map native load remain unverified. Do not count 36 renderer meshes as 36 exact collision entities.

## Components now implemented in the existing Atlas

- tools/spatial-contract.mjs: variable map dimensions; constant native 0.625m cell step; explicit XY tile pitch, Z pitch and orientation; native grid padding; tile↔world and voxel→world; 1×1 and 2×2 actor footprints; stable per-part identity that survives MCD changes; reject fractional native cells/tile.
- tools/audit-battle-space.mjs: read-only real Stage24 manifest or generated battle save audit, optional installed armor ruleset and Stage26 manifest validation. For 160 map comparisons it distinguishes scene stretch from native padding.
- tools/audit-armor-footprints.mjs: read-only installed X-Piratez .rul direct-size extractor with source line provenance, conflict handling and no invented default.
- tools/audit-terrain-parts.mjs: reuses existing Stage24/26 decoders to count all saved tile slots and stable part identities, check Stage26 render accounting, and keep immutable original objects separate from changing MCD definitions.
- tools/scan-battle-map-diversity.mjs: inspect user save metadata without changing or exporting their contents.
- tools/test-spatial-contract.mjs, test-armor-footprints.mjs, test-terrain-parts.mjs: pure deterministic regression suite (including deliberate bad boundaries, contradictory ruleset sizes and lost source parts).

Run regression tests from the existing Atlas root:

    node --test experiments/xpiratez3d/tools/test-spatial-contract.mjs experiments/xpiratez3d/tools/test-armor-footprints.mjs experiments/xpiratez3d/tools/test-terrain-parts.mjs

Optional local audits, read-only:

    node experiments/xpiratez3d/tools/audit-battle-space.mjs --save <local-generated-battle.sav> --ruleset-dir <local-Piratez-Ruleset>
    node experiments/xpiratez3d/tools/audit-terrain-parts.mjs --save <local-generated-battle.sav> --battle <matching-stage24.json> --terrain <matching-stage26.json>
    node experiments/xpiratez3d/tools/scan-battle-map-diversity.mjs <local-save-directory>

The tools do not publish proprietary ruleset text, GOG models, source save content or game binaries.

## Next acceptance gates (ordered by common-case value)

1. **Native arbitrary-size maps**: replace the Stage26 hardcoded 60×60 and Stage25/26 native fixed square 120/160 with the shared validated dimensions. Native-boot and terrain-load 40×40→80×80, 50×50→100×100, 60×60→120×120 and a genuinely rectangular source when available. Reject nonuniform stretch, missing 8m terrain backing and silent 8-bit coordinate overflow.
2. **Buildings and doors before a tower**: use the actual village defense with 1,017 wall components, plus a barn. Match MCD floor/walls/objects, real closed/open door and window visibility, projectile collision and independent destructibility. If damaging one source wall destroys all walls merged into the same render-material chunk, FAIL. Visual geometry may be modernized without changing tactical identity.
3. **Both factions and sizes**: resolve OXCE effective armor size including inheritance/defaults, identity and unit movement, actor native spawn position/floor/facing, model proportions, seat/mount/turret setup and collision. Do not claim that 109 computed candidate positions equal 109 native spawns. If one original actor ID or its source footprint is silently lost, FAIL.
4. **Actual first combined 3D firefight**: one correctly converted source map plus native actor, rifle and target; verify movement, cover, LOS, projectile origin, hit/penetration and destructible props. Only after these pass, validate result mappings to OXCE without touching current campaign saves.
5. **Performance/variability**: static map, urban village, forest/aircraft wreckage, vehicles and air units; instrument load time, RAM and AI response. Later include rare 10+ floor cases as additional coverage, not as the basic conversion milestone.

**Isolation:** leave the other agent's active Stage26 working files untouched; do not modify production R47 or user saves; preserve previous Stage24/25 evidence; do not push the diverged Atlas main without a separate integration decision.
