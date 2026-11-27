# R36KP Pelvic Skin Lab — 2026-11-28

**Status:** two newly generated GLB candidates, four WebGL side-by-side renders, and a shared 3D dashboard. This is **not** a final anatomically accurate game-engine model.

## The problem and the actual modification

In the original 2,088-triangle R36KP, anterior central skin near source Z=0.80–0.90 was strongly weighted to the left/right thigh bones (often 85–92%) instead of the Hip bone. When the thighs abducted, the center of the body was pulled apart and the already faceted pelvic recess became more pronounced.

The new Node.js authoring tool `source/pelvis_skin_anchor.cjs` smoothly raises **Hip (joint 0)** influence for central **anterior** skin and gradually returns to the original weights toward the lateral thighs, inferior/waist boundaries, and posterior surface. A group of UV-duplicated vertices at the same position shares identical weights, reducing skinning cracks without altering positions or topology.

Only the `JOINTS_0` and `WEIGHTS_0` binary accessors of the body mesh were changed.

| | Original R36KP | Soft (strength 0.50) | Balanced (strength 0.73) |
|---|---:|---:|---:|
| Whole character triangles | 2,088 | 2,088 | 2,088 |
| Body triangles | 1,120 | 1,120 | 1,120 |
| Face / hair / hardware triangles | 968 | 968 | 968 |
| Skeleton joints | 63 | 63 | 63 |
| Central sampled Hip weight, source Z≈0.85 | 0.160 | 0.408 | 0.522 |
| Central sampled thigh weight, source Z≈0.85 | 0.839 | 0.591 | 0.477 |
| Unique modified source positions | — | 171 | 171 |
| UV/render vertices modified | — | 1,026 | 1,026 |
| Color / normal / ORM texture | 2048² | unchanged | unchanged |

These sampled averages refer only to positions inside the weight-adjustment envelope, **not** the entire body.

### Actual skinning response at 35° abduction

Using the model's real Three.js 63-joint skin matrices and `SkinnedMesh.applyBoneTransform`, we followed **330 central anterior render vertices** (source |X|≤0.075, Z=0.82–0.98) through 0°, 18° and 35°. Average absolute world X position was:

| Pose | Original R36KP | Soft | Balanced |
|---|---:|---:|---:|
| 0° | 0.03148 | 0.03148 | 0.03148 |
| 18° | 0.05361 | 0.04524 | 0.04139 |
| 35° | 0.07586 | 0.05905 | 0.05131 |

Relative to the original at 35°, Soft reduces lateral drift **22.2%** and Balanced reduces it **32.4%**. This is a measured improvement in center-skin anchoring, **not** proof that a negative-space gap is eliminated. Raw measurements: `preview/POSE_METRICS_REPORT.json`.

## Files

- `output/R36KP_BALANCED_SKIN_2088TRI.glb` — stronger Hip anchoring; best candidate for controlled animation comparison
- `output/R36KP_SOFT_SKIN_2088TRI.glb` — conservative variant with smaller change
- `output/PRODUCTION_REPORT.json` — source SHA-256, byte sizes and detailed before/after height-zone averages
- `source/pelvis_skin_anchor.cjs` — reproducible, standalone Node.js reweighter (no Python)
- `source/glb_io.cjs` — low-level GLB accessor helper
- `preview/index.html` — synchronized GLB comparison with 0°, 18°, 35° thigh presets, original/soft/balanced/high-poly modes and full camera controls
- `preview/captures/` — 0° and 35° actual browser screenshots
- `preview/BROWSER_REPORT.json` — actual browser loader and GPU render results
- `preview/POSE_METRICS_REPORT.json`, `preview/pose_metrics.cjs` — 0°/18°/35° numerical skin-deformation measurements
- `preview/capture_skinlab.cjs` — repeatable Chrome CDP screenshot generator

All new candidate GLBs are about 3.41 MB and retain the R36KP original skin colors/normal textures. The baseline `../r36kp/output/R36KP_2088_ATTACHED_FINAL.glb` is **not** edited.

## Running locally

Serve the sibling F11 tree using the included local server:

```sh
node serve.cjs
# http://127.0.0.1:9403/r36kp-pelvis-skinlab-20261128/preview/index.html
```

The preview intentionally uses shared `../r36kp/preview/vendor/` Three.js and `../r36kp/preview/pose-spread.mjs`. All dependencies must be in the same checkout.

Rebuild to a **new** output directory (the producer rejects overwrite):

```sh
node source/pelvis_skin_anchor.cjs ../r36kp/output/R36KP_2088_ATTACHED_FINAL.glb regenerated
```

The producer and actual candidate GLB build were run with **Node.js** on the Windows machine containing the full original binary model; no local Python was used. The algorithm was first developed and tested with Node.js in the GPT container. The GPT container could not directly download the full GLB because external DNS was unavailable.

## Visual review and remaining limitations

The browser rendered both original and candidates with **2,088 triangles per model**, 6 draw calls per model, and WebGL error 0. At 35° abduction both knees separated as expected. The balanced candidate visibly reduces central lateral pulling relative to the original, but **the black cavity and sharp flat-shaded triangles remain**. Skinning cannot create a missing surface. These are experimental rig improvements, not a claim of lossless geometry or texture recovery. Further work should allocate some of the same 2,100 triangle budget to central geometry and ensure high-poly color/normal baking remains aligned with it, rather than merely painting over a hole.

**Promotion condition:** only replace the stable R36KP model when a real 0–35° pose comparison shows lower visible gaps *without new stretch, inverted triangles or UV cracks*. Game engine integration remains unverified.
