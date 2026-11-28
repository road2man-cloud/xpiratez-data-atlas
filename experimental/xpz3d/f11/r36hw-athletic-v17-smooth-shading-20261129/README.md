# R36HW F11 V17 smooth shading

Actual GLB built from V16 blob `fdb982500bed8f9773f62516b5f4b0323812aba3`. Adjusts garment normals toward angle-weighted face normals, with a conservative 12-degree cap and open-edge, contact, sharp-crease protection. Existing tangent directions are reprojected with handedness preserved. The opaque sportswear, positions, triangles, skeleton, weights, UVs, all textures and JSON are unchanged. No anatomical changes.

- output/R36HW_F11_ATHLETIC_SUIT_V17_SHADING.glb
- source/build.cjs
- reports/build.json

Reproduce: `node source/build.cjs /path/to/V16.glb`. Report metrics are geometry-derived shading proxies, not native S2 rendering or visual quality proof. No S2 conversion, actual render, independent Node rerun or main merge performed.
