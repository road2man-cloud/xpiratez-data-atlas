# XPZ3D R36KT — geometry-detail preservation pipeline (work in progress)

## Verified state — 2026-11-27

- Prior R36KS files were inspected at commit `7352b2396b974939f4e9d9193bbd05d4839c6b4a` (branch lineage, **not assumed to exist on main**).
- R36KS: 2,100 triangles, 63 joints, 1024/512 GLBs and nine-pose comparison; prior R36KS report claims 425,120 / 309,636 bytes.
- R36KS source explicitly preserves existing 5 embedded texture images and material data; it does **not** reconstruct high-poly detail.
- R36KT adds `bake_r36kt.py`, a Blender 4.x tangent-space normal-map bake, and does not yet include baked assets.
- No actual S2/S3 engine test or deployed R36KT model is claimed.

## Why an external high-poly reference is mandatory

A 6,000-to-2,100 triangle reduction removes roughly 3,900 triangles (65%). A normal map can restore **lighting microdetail** but cannot recreate silhouettes, gaps or articulation geometry. Neither 6,000-triangle reference geometry nor a trustworthy high-poly displacement bake source was verified in this production step. No synthetic 'recovered' details are invented.

## Production command

```bash
blender -b -t 4 --python bake_r36kt.py -- \
  --low R36KS_F11_MULTI_POSE_HIP_1024_2100TRI.glb \
  --high F11_6000TRI_reference.glb \
  --pairs pairs.json --resolution 1024 --ray-distance 0.012 \
  --out R36KT_F11_DETAIL_1024.glb
```

`pairs.json` must enumerate exact names after glTF import (names may get Blender suffixes when the two scenes overlap):

```json
[
  {"low":"Body", "high":"Body_high"}
]
```

Use only empirically matched pairs. For 512 output repeat with 512 GLB and `--resolution 512`. The bake emits PNG normal maps, a modified GLB and a provenance JSON containing SHA-256 hashes, counts and original references.

## Priorities and fail conditions

1. Retrieve a version-matched ~6,000 triangle **source mesh** and document its hash/coordinate system. Reject mismatched scale, origin and topology correspondence.
2. Import source R36KS GLB from its verified historical branch and run this script in Blender 4.x with explicit matching object pairs.
3. Compare mesh count, 63-bone skin, animation/deformation, texture colors and UV map integrity after Blender GLB export. Blender GLB roundtrip can change tangents, sampling, material names, or bone transforms.
4. Inspect both arm spread and thigh spread in the target renderer before declaring usable.
5. If high-poly source is unavailable, improve geometry where needed but label detail restoration as **unresolved**, not complete.

A baked normal does not replace the deleted silhouette geometry. Retain targeted topology where the lost triangles were needed for moving edges or joints. Avoid brightening skin or regenerating authored base color.

## Current limitations

This is **source-code production only**. No actual R36KT GLB or texture was generated during this turn, because the high-poly reference was not retrieved and Blender execution was not available against the branch asset. The script is not yet runtime-validated and its output must not be treated as engine-ready.
