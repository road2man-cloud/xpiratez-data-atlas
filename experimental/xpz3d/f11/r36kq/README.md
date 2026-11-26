# R36KQ — produced from supplied R36KP 1024/512 GLBs

2026-11-27 production notes. This derivative is **NOT** the older R36KK seam-v3.

The user-supplied artifact `XPZ3D_R36KP_GITHUB_HANDOFF_BUNDLE_20261127.zip` contained the exact source binaries:

- 1024: `R36KP_F11_MEDIAL_HIP_BLEND_1024_2100TRI.glb`, SHA256 `285d9c17848992231da5ffc10ebc6d807b52da1e577c64147bb5408a53584829`
- 512: `R36KP_F11_MEDIAL_HIP_BLEND_512_2100TRI.glb`, SHA256 `1a89353c3a2b15cf1e0073be2c72c2b962bd263622b3288e1f678c39e6112c04`

## New local output

- `R36KQ_F11_HIP_TRANSITION_1024_2100TRI.glb` (430848 bytes), SHA256 `25950c044d6ee59a32552432be8cbf191fb0b5f3120ab032e3e9b54e0a8f87c4`
- `R36KQ_F11_HIP_TRANSITION_512_2100TRI.glb` (315364 bytes), SHA256 `bd67abee6c0220c6767b9af6071ebba612870f886bcf869973af574e4440f41f`

The outputs are built by `build_r36kq.py` against the exact source GLBs, modifying **POSITION and NORMAL only** in left and right leg primitives 10/11. Inputs preserve skin textures (original dark R36HW-derived tone), protected face/hair/hands, UV, indices, joints/weights and 63-bone rig. Triangles remain 2100.

Mean selected ring gap left: 0.00882460 → 0.00749345. Right: 0.00744981 → 0.00646235 (model units). This is an actual geometric derivation, not a topology weld or an S2/S3 in-game result.

## Remote delivery status

This README is uploaded, but **R36KP original model binaries and R36KQ final binaries have not been uploaded to this GitHub branch in this session**. The user-supplied original ZIP is locally accessible to the ChatGPT artifact environment, and the produced 1.5 MB R36KQ bundle can be downloaded there. Do not mark the remote handoff complete without checking both GLB blobs.

The separate `r36kp/seam_v3` files refer to the **older R36KK** derivative and are not replacements for R36KP/R36KQ.

## Next steps

Transfer the two exact R36KP source binaries and both R36KQ output binaries, reports and `build_r36kq.py` to `experimental/xpz3d/f11/r36kq`. Prefer the original signed SHA-256 over filenames. Continue selective seam refinement and pose tests without changing protected facial/material primitives. Game engine integration and full topology welding remain open.
