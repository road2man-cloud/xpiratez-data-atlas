# R36LC - world-space UV gutter production

Based on real R36LB source and GLB from local pinned commit 42514903828cb464a67be0320187cf16c4e48c22.
No change to triangle budget, source rig or inherited R36LB center sculpt.
Changes: true closest-point projection of each gutter texel to triangle;
evaluates same bind-space palette for baseColor and ORM around every UV island;
preserves normal + relief from donor high-poly via nearest safe interior texel.
R36LB source and output are retained. Node.js only (no Windows Python).

Source: source/bake_atlas.cjs and source/build_floor.cjs.
Data: output/balanced/*.glb, output/stable/*.glb, output/balanced/textures/*.png.
QA: output/R36LC_SEAM_METRICS.json compares edge discontinuities to R36LB.
Limit: independent UV island tangent spaces and true geometric dark cavities remain.
S2 game engine integration not verified.

