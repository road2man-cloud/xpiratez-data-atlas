# R36HW N3: curvature continuity and original shell retouch

- Uses the **original** R36HW binary and verifies its SHA-256. No R36JB body is loaded.
- Distributes a bounded relief over original lower-front vertices, rather than moving only triangle centroids. Subdivision is ranked by local curvature benefit and capped by the 2,100 triangle limit.
- Updates the **NORMAL** accessor with a smooth derivative of the displaced surface and adds region-specific **COLOR_0** variation. The reference image itself is not projected, embedded, or used as a texture.
- Slims existing R36HW jacket, boot and glove shells slightly; keeps original geometry identities and skinning but **does not claim completed undressing** or hidden-skin reconstruction.
- The original face and hair primitives are not changed; the original GLB BIN chunk remains unchanged and is extended with new attributes.
- Output is a geometric development candidate. The latest native S2 version still needs actual material/skin loading, capture and artistic review.

Run from the repository root:

```bash
node experimental/xpz3d/f11/r36hw-n3-curvature-20261128/source/build_r36hw_n3.cjs
```

Expected output: `output/R36HW_N3_CURVATURE.glb` and `reports/R36HW_N3_CURVATURE.json`.

The previous N2 emitted 2,016 triangles; N3 may use additional available polygons within budget. Exact values are defined by its generated report, not by the code comments.