# R36KY — POT compatibility alternative
2026-11-27. Input: R36KX commit 545eebdf54aa1bb1fcf6a8320a289e3086090ae8.
This is texture-layout compatibility work, not a new character or high-poly recovery.

## Outputs
[1024 GLB](output/R36KY_F11_POT_COMPAT_1024_2100TRI.glb?raw=1)
[512 GLB](output/R36KY_F11_POT_COMPAT_512_2100TRI.glb?raw=1)
[Complete reproducible bundle](R36KY_COMPLETE_BUNDLE.zip?raw=1)

Both outputs contain 2100 triangles, 2047 vertices and 63 bones, exactly as R36KX. All eleven embedded images have power-of-two width and height. The prior three NPOT images are eliminated. All 70 repair patch rectangles retain their full original pixels and gutters. Six original images remain byte-identical. The eye atlas is padded from 192x96 to 256x128 by edge extension, preserving every original pixel; its UV is adjusted. The body and hair normal maps are split into base and patch pages. Hair repeat-S sampling is retained for the base page, and the dedicated patch page uses clamp. Other material parameters, all existing triangle-corner attributes except affected UVs, rig hierarchy and inverse-bind matrices are retained. The input face mapping is checked for exact coverage.

| Metric | R36KX | R36KY |
|---|---:|---:|
| Primitives | 12 | 15 |
| Materials | 10 | 12 |
| Images | 9 | 11 |
| 1024 GLB bytes | 920228 | 923808 |
| 512 GLB bytes | 574660 | 577956 |
| 1024 RGBA8 image bytes without mips (estimate) | 22634496 | 23003136 |
| 512 RGBA8 image bytes without mips (estimate) | 6447104 | 6488064 |

Deterministic base-level bilinear comparisons had maximum RGB byte difference 0.000358 (float32 UV rounding). This is not a claim of identical rendered pixels or generated mipmaps. The additional three primitives may incur additional draw calls. This is an alternative compatibility profile, not a universal replacement for R36KX. Actual S2/S3 import, renderer NPOT handling, FPS, GPU memory and animations remain untested. No game installation directory was modified. No high-poly mesh was recovered. Original R36KX remains the lower-draw-count alternative.

## Build
Python 3 with numpy and Pillow. Run python prepare_r36ky.py only if inputs are missing; then python build_r36ky.py. The build pins both GLBs and patch metadata hashes. Run python publish_r36ky.py to package, or explicitly pass --publish with authenticated gh to publish under a new append-only path. Build reports are under output. Input receipts and manifest record provenance. Working directory C:\mnt\data\r36ky_work was used because DNS resolution for GitHub failed in the internal container.
