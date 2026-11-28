# R36HW F11 V21 — sleeve and shin mesh relaxation

Static V19-based opaque outfit variant. Tangential relaxation of the existing sleeve and shin vertices improves local triangle quality while retaining the original triangle budget, skinning, UVs, textures and material. Positions of the torso and pelvis and the garment's terminal cuffs remain unchanged. No intimate anatomical markings are added. V20 motion kit is separate and is not embedded in this static variant.

- output/R36HW_F11_ATHLETIC_SUIT_V21_LIMBS.glb
- source/build.cjs
- reports/build.json

Reproduce with `node source/build.cjs /path/to/V19.glb`. Includes original hash and geometry guards. Triangle quality is a geometric proxy, not proof of improved rendered appearance. Native S2, actual rendering and independent Node rerun are untested.
