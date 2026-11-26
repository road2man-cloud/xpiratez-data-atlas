# XPZ3D F11 — R36KS multi-pose hip transition

**Date**: 2026-11-27  
**Parent model**: `R36KR_F11_POSE_AWARE_HIP_{1024,512}_2100TRI.glb`  
**Authoritative skin/facial reference**: original F11 sprite + R36HW dark-tone material; do not brighten by ACES/PBR preview.

## Actual production

- 2 production GLBs: `R36KS_F11_MULTI_POSE_HIP_{1024,512}_2100TRI.glb`
- 2,100 triangles, 63 bones, original material and five embedded texture images unchanged.
- Only leg primitives 10 (left-side coordinate) and 11 (right-side coordinate): POSITION, NORMAL and WEIGHTS_0 changed. Face, hair, hands, torso, shoulder, indices, UVs, JOINTS_0, inverse bind matrices, materials and original texture bytes preserved.
- R36KR top-thigh vertices had up to three duplicate Hip influence slots (e.g. JOINTS_0 `[0,3,0,0]`). On upper rings, these weights are folded into one effective Hip weight with one Thigh weight; joint indices remain unchanged. Weighted deformations are optimized with the exact glTF inverse-bind and node matrices.
- A bounded optimization adjusts 6 rim anchors per leg over nine synthetic thigh-spread angles -32° to +32°. Displacements are shared with proximal sub-ring vertices with narrow falloff to avoid a sudden ridge. This is **not topology welding**.

### Quantitative improvement (model coordinates, not mm)

| Leg primitive | R36KR mean of nine pose gaps | R36KS mean | Reduction |
|---|---:|---:|---:|
| 10 | 0.004611 | 0.003106 | 32.6% |
| 11 | 0.004644 | 0.003126 | 32.7% |

The mean and maximum gap improved for all 18 side/pose comparisons in `output/R36KS_POSE_COMPARISON.json`. The metric is distance from selected six leg rim vertices to nearest torso triangle within the selected body region, **not a global no-intersection guarantee**.

## Reproduce from the GitHub working branch

1. Clone `road2man-cloud/xpiratez-data-atlas`, checkout `xpz3d/r36kp-handoff-20261127` (or use the content from a subsequent merge).
2. `cd experimental/xpz3d/f11/r36ks`
3. `python -m pip install -r requirements.txt`
4. `python build_r36ks.py --source-dir ../r36kr --output-dir ./output`

The script requires exact R36KR source SHA-256, and rejects a different source. `build_preview_package.py` regenerates the offline HTML dashboard from available rendered images and model reports; renderer usage:

```bash
python render_r36ks.py ./output/R36KS_F11_MULTI_POSE_HIP_1024_2100TRI.glb ./preview/R36KS_FRONT_6.png --yaw 0 --spread 6
python render_r36ks.py ./output/R36KS_F11_MULTI_POSE_HIP_1024_2100TRI.glb ./preview/R36KS_OBLIQUE_32.png --yaw 38 --spread 32
```

To regenerate comparison images, render the corresponding R36KR GLB with the same yaw/spread settings. Run `python build_preview_package.py` when all four full-body PNGs are present.

Open `preview/index.html` locally (file:// works) to switch poses or inspect hip details without any CDN or web server.

## SHA-256 and files

See `MANIFEST_R36KS.json`, generated from actual files. `output/R36KS_{1024,512}_BUILD_REPORT.json` includes build output SHA-256, changed vertices, and per-angle before/after distance.

## Non-final / known limitations

- No actual S2/S3 game engine installation or animation execution occurred. The pose improvement is from the source GLB's skeletal matrices with CPU LBS simulation.
- The torso and legs are still separate primitives, i.e. **not watertight**; no physical vertex sharing or triangle bridge was introduced.
- This work does **not** assert deformation integrity across arbitrary combat animations, UV seam disappearance at every camera angle, or end-user final skin tone approval. Lighting in our software preview is for comparison, not a color standard.
- Next practical work: test in the real engine using matched pose captures; consider topology-level bridging with an explicit triangle budget only if it beats this stable model in actual scenes.
