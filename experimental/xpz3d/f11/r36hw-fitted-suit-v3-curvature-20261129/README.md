# R36HW athletic compression outfit V3

Selective interior-edge refinement of the actual V2 GLB. Only shoulder, arm, lower-leg, outer-thigh and training-footwear regions are eligible. Each selected edge splits both incident faces, using a bounded curvature offset, interpolated normalized top-four joint weights, interpolated normals and colors/UVs. Existing geometric boundaries and all original vertex positions remain unchanged. Opaque matte sand textile, explicit flat seam, coordinated footwear. No explicit anatomical details added.

- 82 new garment vertices; 2100 triangles (budget 2100); 63 joints preserved.
- Build: `node experimental/xpz3d/f11/r36hw-fitted-suit-v3-curvature-20261129/source/build.cjs`.
- Model: `output/R36HW_F11_ATHLETIC_SUIT_V3.glb`.
- Report: `reports/build.json`.
- Existing disconnected garment topology and seams remain; no native S2 or visual animation acceptance.
