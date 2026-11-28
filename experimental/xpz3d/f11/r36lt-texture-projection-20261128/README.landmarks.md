# R36LT image-landmark UV projection (alternative implementation)

This is a separate image pixel projection path from `source/build_r36lt.cjs` (which uses 3D-space region bounds). Both preserve the R36LS meshes, normals, UVs and skin.

`source/build_r36lt_texture.cjs` uses three corresponding landmark points on the supplied PNG and the existing body UV to align pixels. It only changes the base-color PNG, inside actual UV triangles. It does not synthesize shading or claim a finished anatomical result.

```bash
node source/build_r36lt_texture.cjs SOURCE_R36LS.glb AUTHORIZED_DETAIL_RGBA.png config.landmarks.example.json OUTPUT_DIRECTORY
```

Replace the illustrative landmark coordinates with model-verified UV locations. The reference image has not been aligned to the GLB; no final GLB or engine preview has been produced by this path. The user-provided reference remains outside GitHub unless separately authorized.
