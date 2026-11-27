# R36KP Skin Texture Lab — 2026-11-27

This is an **isolated derivative workbench**. The existing `../r36kp` baseline and other workers' existing `r36kt` pipeline must not be overwritten. The experiment keeps the R36HW original face/hair (968 triangles) and an R36KP closed body skin (1,120 triangles). All published low-poly variants render **2,088 / 2,100** triangles; their GLB embeds 2048² textures.

## Work produced

| Stage | Produced GLBs | Data change |
|---|---:|---|
| R36KQ | 2 | Per-island normal-map mean rebalance; no mesh change |
| R36KR | 1 | Source 6,044-triangle pelvic-surface projection onto body color, normal, ORM and localized emission |
| R36KS | 2 | Move 10 unique anterior-body positions, consistently across their UV duplicates; no triangle change |
| R36KT | 2 | Correct glTF *linear* baseColorFactor -> sRGB texture encoding, with wider donor-pigment falloff; **experimental** |

Sources, reports, complete GLB results, and browser comparison captures are in each stage directory. See their individual README files for limitations. Original source meshes and original skin/hair are in `../r36kp/reference/`.

**Do not mark final**. Browser evidence showed the original black recess was **not eliminated**, because part of it is actual negative space between the thighs or self-shadowed geometry; textures cannot render over absent geometry. The R36KT stronger pigment candidate can cause pale thigh streaks and must not replace the stable R36KP release. A new **connected center surface with reallocated triangles** (still <= 2,100 total) is required to genuinely fix that view. R36KP is the safer geometric reference until that replacement is produced. Do not claim lossless anatomy or actual Silent Storm engine integration.

## Local dashboard

From this directory:

```sh
node serve.cjs
```

Open `http://127.0.0.1:9402/r36kp-texture-lab-20261127/index.html`. Each stage has an interactive Three.js comparison dashboard. Use R36KT to inspect the pigment transfer and its regression; use R36KS to review shape reflow and R36KQ for normal-map comparisons.

Windows users can double-click `OPEN_TEXTURE_LAB.cmd` if Node.js is installed. These files are a local testbench, not a game-engine model mod.
