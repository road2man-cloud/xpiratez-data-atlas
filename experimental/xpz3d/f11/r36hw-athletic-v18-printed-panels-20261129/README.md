# R36HW F11 V18 — printed ochre sportswear

Actual V17-derived opaque GLB. A new 512x512 RGB base-color texture is UV-baked from geometric apparel print elements: continuous chest chevron, waist seam, small geometric mid-torso insignia and side panels. The reference sprite palette is used for warm ochre hue inspiration, not as a skin texture or photometric calibration. Original geometry, skeleton, vertex colors, UVs, normal map and all original binary bytes remain intact.

- output/R36HW_F11_ATHLETIC_SUIT_V18_PRINT.glb
- output/athletic-basecolor-v18.png
- source/build.cjs
- reports/build.json

Reproduce with `node source/build.cjs /path/to/V17.glb`. Exact source blob guard, PNG pixel decode roundtrip and original-data retention assertions included. Standard GLB only: native S2, independent Node rerun, visual render and game application remain unverified.
