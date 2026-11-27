# R36KQ — normal-map rebalancing, 2,088 triangles

Two produced GLB files retain the exact R36KP 2,088-triangle geometry, atlas UVs, skin, and color texture. The source problem was strong triangle-island average tangent-normal slopes; de-biasing reduces large shading discontinuities while preserving part of the source-derived high-frequency map.

- Balanced candidate: `output/R36KQ_F11_BALANCED_NORMAL_2088TRI.glb`
- Detail-emphasis candidate: `output/R36KQ_F11_DETAIL_NORMAL_2088TRI.glb`
- Browser comparison: `preview/index.html` (served by `../../r36kp/preview/serve.cjs` or the F11 parent HTTP server).
- Generator: `source/normal_rebalance.cjs`; `source/glb_io.cjs` is retained for reproducibility.
- Source: `../../r36kp/output/R36KP_2088_ATTACHED_FINAL.glb`

This stage modifies only PNG normal-map data and GLB extras, not geometric shapes. The black pelvis cavity and low-polygon silhouettes are not fixed in R36KQ; this is an intermediate. Windows Chrome WebGL renderer loaded both models at 2,088 triangles and 6 draw calls. Game engine integration not tested.
