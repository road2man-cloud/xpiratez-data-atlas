# R36KT — linear-to-sRGB donor pigment correction (experimental candidate)

GLTF `pbrMetallicRoughness.baseColorFactor` is linear RGB, not sRGB bytes. Earlier R36KR interpreted the donor's core material [0.7,0.47,0.36] directly as sRGB and therefore darkened it. R36KT correctly encodes that linear source color to 8-bit sRGB [218,182,162], feathers it across visible central skin, and changes local emission and occlusion texels without adding polygons.

- `output/R36KT_F11_SOURCE_SKIN_2088TRI.glb`: stronger donor pigment.
- `output/R36KT_F11_SOFT_SKIN_2088TRI.glb`: softer donor pigment.
- `source/r36kt_pigment_spread.cjs`: producer; source R36KS and R36KP donor.
- `preview/index.html`: direct pairwise comparison (interactive).
- `output/PRODUCTION_REPORT.json`: actual affected texels.

**Known regression:** The stronger variant can show pale streaks on some upper thigh triangles due to the emissive/atlas mapping. The anatomical recess still looks very dark; texture-only modifications cannot paint empty 3D space. This version is explicitly an experimental source color study and is **not approved as a final F11 game asset**. Prefer R36KP/R36KS when stable geometry is more important, and correct local UV/light leakage before release. Real engine render not tested.
