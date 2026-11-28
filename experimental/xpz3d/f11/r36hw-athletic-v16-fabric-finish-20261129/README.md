# R36HW F11 V16 — opaque ochre sportswear finish

Derived from V14 blob `b824e5ec3d9564950909037a5f0ba2533593b8d3`. Retains the 2,100 triangles, 63 joints, geometry, rig, UVs, skin and identity assets. Replaces the garment normal image with a deterministic 512x512 RGB microfinish and adjusts only garment vertex RGB plus opaque material parameters. Darker collar, sleeve cuffs and lower-leg/ankle trim provide recognizable garment boundaries. No anatomical detail added.

- Model: output/R36HW_F11_ATHLETIC_SUIT_V16_FINISH.glb
- Texture: output/athletic-normal-v16.png
- Builder: source/build.cjs
- Build report: reports/build.json

Reproduce: `node source/build.cjs /path/to/V14.glb` (Node.js, no dependencies). The builder checks the source Git blob hash, decodes its own PNG for exact pixel roundtrip and asserts unchanged geometry/rig/accessors and all unrelated buffer views.

This is standard GLB, not native S2. Source sprite color calibration, independent Node execution, actual rendering and game integration remain unverified. No user PC execution used.
