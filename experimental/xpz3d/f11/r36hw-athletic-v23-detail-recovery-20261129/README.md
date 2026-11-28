# R36HW Athletic V23 — recover N19 fine surface detail without adding clothing

V23 is built directly from the completed **V22 opaque V14-based athletic outfit**. It combines the three already embedded normal maps: original V20 fabric (texture 3), raw N19-transferred V21 normal map (texture 4), and gently smoothed V22 normal map (texture 5).

A 5×5 edge-aware, UV-neighborhood filter extracts only the **high-spatial-frequency residual** of N19. It restores 36% of that residual over V22's restrained baseline, attenuates sparse texture edges and caps the difference relative to original cloth to 19° before PNG quantization. This avoids the broad, hard-edged dark region that previously looked like underwear while recovering fine cloth surface detail.

No material tone changes, no extra garments or panties, no additional topology, no copied anatomy. V14-based 63-joint opaque garment and V20 welded seam geometry remain unchanged.

Generated assets:
- output/R36HW_F11_ATHLETIC_SUIT_V23_N19_MICRODETAIL.glb
- output/R36HW_F11_V23_N19_DETAIL_NORMAL.png
- output/R36HW_F11_V23_CHANGE_MAP.png (technical difference diagnostic, **not a clothing texture**)
- reports/build.json

The V23 appearance is not yet native-S2 visually approved. Build requires only Node.js with built-in zlib.
