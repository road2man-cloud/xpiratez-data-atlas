# R36KP — F11 2,088-triangle posterior/superior attached anatomy

## Deliverable (2026-11-27)

This snapshot is an *editor/game candidate*, **not** a verified Silent Storm/XPZ runtime asset. The R36HW head/hair/eye/hardware primitives are preserved exactly (968 triangles). The body is one closed indexed mesh (1,120 triangles) including a restrained pelvic surface relief; no separate floating anatomical mesh is rendered.

| Component | Runtime triangles |
|---|---:|
| R36HW face, hair, eyes, hardware | 968 |
| Continuous skinned body, including center | 1,120 |
| Detached central mesh | 0 |
| **Runtime visible total** | **2,088** |
| Budget | 2,100 |

The donor R36JB source contains 12,896 body triangles and 6,044 central-anatomy triangles, held as **authoring-only** high-poly references. The source center is shifted **posterior +0.020 in source +Y** and **superior +0.026 in source +Z**, then projected into the original body surface. A maximum 0.006 local positional relief is applied to a small number of eligible front-body vertices, after 120 pelvic edge splits on a closed 880-triangle body. No new disconnected anatomy overlay remains. The body mesh is indexed and has zero boundary/nonmanifold edges in this static mesh. Skin weights use the existing donor 63-joint rig; real game animation deformation has not been proven.

## Files

- `output/R36KP_2088_ATTACHED_FINAL.glb`: 2,088-triangle final candidate, embedded 2048×2048 color/normal/ORM textures, fixed atlas gutters.
- `preview/index.html`: interactive comparison dashboard, loads source models and viewer modules **locally** via HTTP.
- `preview/vendor/`: bundled Three.js, GLTFLoader and OrbitControls; no CDN dependency.
- `reference/R36HW_F11_CLOTHED.glb`: R36HW exact face/hair reference source.
- `reference/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb`: original high-density body/anatomy donor.
- `reference/R36KO_R36HW_HEAD_R36JB_BODY_CORE.glb`: editor-only high-poly comparison (not production budget).
- `source/build_r36kp.cjs`, `surface_weld.cjs`, `surface_patch.cjs`, `mesh_qem.cjs`, `bake_atlas.cjs`, `glb_io.cjs`, `repair_atlas_r36kp.cjs`: reproducible pipeline.
- `output/GEOMETRY_REPORT.json`, `output/PRODUCTION_REPORT.json`, `output/R36KO_2100_SEAMFIX_REPORT.json`: measurement and binary repair records.
- `captures/`: actual browser captures for full-body, pelvis and comparison views.

Run **from this directory**:

```sh
node preview/serve.cjs
# open http://127.0.0.1:9399/preview/index.html
node source/build_r36kp.cjs reference/R36HW_F11_CLOTHED.glb reference/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb output/another_build --atlas=2048
node source/repair_atlas_r36kp.cjs output/another_build/R36KP_2088_CONTINUOUS.glb output/another_build/R36KP_2088_ATTACHED_SEAMFIX.glb
```

**Important cautions**: The reduction is not visually lossless. Body remains faceted at close view; baked normals and high-poly reference do not restore missing silhouette. There is no separately rendered center or topologically welded donor fragment; instead the relief is embedded in one watertight body. This is deliberate to avoid floating islands and breaches. The 2048 normal and color maps were baked from high-poly body; the detailed core is used to guide limited body surface displacement, not to reproduce all 6,044 triangles as geometry. The source skin coloration is an approximation, not color-certified to the original 2D sprite. The game-engine material pipeline is not yet certified.

**Evidence**: Chrome WebGL scene successfully drew 2,088 triangles in 6 calls with GPU error 0. No engine binary integration has been attempted. If future edits exceed 2,100 triangles, introduce open body boundaries or detached core geometry, or claim fully lossless details without side-by-side proof, reject them as regression.
