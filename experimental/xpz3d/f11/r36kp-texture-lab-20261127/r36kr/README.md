# R36KR — high-density pelvic-source texture transfer (experimental)

Generated from R36KQ balanced GLB and the R36KP high-density anatomical reference. References 6,044 source-center triangles, sampled as a 2.5D frontmost surface after the same posterior +0.020 and superior +0.026 offsets. Transferred the donor material color, height-derived normal differences, local occlusion correction and a limited center-only emission mask to the existing 2048 UV atlas.

- Final candidate: `output/R36KR_F11_HIGH_POLY_DETAIL_2088TRI.glb`
- Color/normal/ORM/emissive/height/mask 2048 PNGs: `output/`
- Generator: `source/transfer_source_detail.cjs`, requires local `source/glb_io.cjs`, `source/mesh_qem.cjs`
- Preview: `preview/index.html` (shared Three.js runtime from R36KP)
- Donor reference: `../../r36kp/reference/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb`

Important: this version assumes the authored donor baseColorFactor numbers are directly sRGB pigment; subsequent R36KT corrects that glTF color-space mismatch. R36KR has no additional geometry and cannot fill the physical negative-space gap between thighs. Browser rendering worked, but local source lighting shadow remains; this is a production **candidate**, not visually complete.
