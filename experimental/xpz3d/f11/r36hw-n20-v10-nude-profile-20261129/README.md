# R36HW N20 — V10 body profile with N19 center

## Source lineage
- N19 center/base: `r36hw-n19-lower-skin-bridge-20261129/output/R36HW_N19_LOWER_SKIN_BRIDGE.glb`
- V9 close-fit: `r36hw-athletic-v9-close-fit-20261129/output/R36HW_F11_ATHLETIC_SUIT_V9_CLOSE_FIT.glb`
- V10 contour: `r36hw-athletic-v10-contours-20261129/output/R36HW_F11_ATHLETIC_SUIT_V10_CONTOURS.glb`, anchored to commit `a7f16d91f4631ea43c5318a4f890c01d26f8a48e`

## N20 implementation
The N19 anatomical GLB is the output base. A bounded, weighted nearest-neighbor transfer of *V9-to-V10* position differences modifies only N19 skin primitive 6. N19 pelvis/central-anatomy primitive 3, skeleton, face and hair remain unchanged. The clothing primitive from V10 is never added to output. This is a **conservative first implementation**, not a direct transposition of clothed silhouettes onto exposed skin. No image-generation step is involved.

- Source: `source/build.cjs`
- Expected output: `output/R36HW_N20_V10_BODY_N19_CENTER.glb`
- Machine audit: `reports/build.json`
- GitHub Actions: `.github/workflows/xpz3d-r36hw-n20-v10-body.yml`

## Rebuild
```sh
node experimental/xpz3d/f11/r36hw-n20-v10-nude-profile-20261129/source/build.cjs \
  experimental/xpz3d/f11/r36hw-n19-lower-skin-bridge-20261129/output/R36HW_N19_LOWER_SKIN_BRIDGE.glb \
  experimental/xpz3d/f11/r36hw-athletic-v9-close-fit-20261129/output/R36HW_F11_ATHLETIC_SUIT_V9_CLOSE_FIT.glb \
  experimental/xpz3d/f11/r36hw-athletic-v10-contours-20261129/output/R36HW_F11_ATHLETIC_SUIT_V10_CONTOURS.glb \
  experimental/xpz3d/f11/r36hw-n20-v10-nude-profile-20261129/output/R36HW_N20_V10_BODY_N19_CENTER.glb
```

## Pending
A model-quality acceptance decision requires native S2 rendering and posed checks. N19's inherited V-shaped lower gap and garment-like center silhouette remain unresolved. N20 does not claim a welded or completely remeshed anatomy. The V10 garment has 2,100 triangles while the N19 exposed-body model has 2,099; the target is the original N19 budget.
