# R36HW F11 V22 — N19 textile microrelief refinement

This version **keeps the completed V21 GLB geometry, rig, vertex colors, normal scale, V14 opaque ochre athletic garment and V20 welded UV seams unchanged**. Instead of adding any underwear/panel or subdivision, it refines the previously embedded V21 N19 normal atlas against its embedded original V20 fabric normal atlas.

A 3x3 bilateral mask only smooths N19-induced tangent-normal differences on occupied texture pixels, protects neighboring UV charts, blends 78% of the donor variation and limits normal change relative to the original fabric to **16 degrees before quantization**. The original baked V21 and V20 normal textures remain embedded as archival references; only the garment's normal texture index points to the new atlas.

Node.js only, no Python or image-generation substitute. Outputs:
- `output/R36HW_F11_ATHLETIC_SUIT_V22_N19_REFINED.glb`
- `output/R36HW_F11_V22_REFINED_N19_NORMAL.png`
- `reports/build.json`

This is an algorithmic surface refinement. Native S2 rendering and actual artistic acceptance are **not** claimed.
