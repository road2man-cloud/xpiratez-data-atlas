# R36HW Athletic V21 — N19 detail in the existing suit's normal atlas

V21 builds on the **actual V20 GLB**, keeping its continuous V14 athletic suit mesh (3,214 triangles), rig, UV charts, color and warm-ochre opaque material unchanged. It decodes the existing 512×512 fabric normal atlas, projects only high-frequency N19 relief into its matching UV charts, and embeds a combined tangent-space normal atlas in the GLB. The old atlas remains embedded and untouched. It uses soft 3D spatial fades and protects UV regions overlapping other garment triangles. **No added panties, mesh panels, waistband, clothing material, or donor anatomy.**

Outputs: `output/R36HW_F11_ATHLETIC_SUIT_V21_N19_NORMAL_DETAIL.glb`, `output/R36HW_V21_N19_NORMAL_ATLAS.png` and `reports/build.json`.

Rebuild requires only Node.js (built-in zlib). The source N19 data is read through N20's preserved center primitive 3. Native S2 render/pose-based artistic acceptance remains pending.
