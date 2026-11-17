# XPZ3D F11 rev96 — user screenshot quality escalation, r15/r16 (2026-11-17)

## Why the previous output was unacceptable
The user provided a browser screenshot with r13 selected, where the central anatomy continuation is a long hanging planar strip and the visible body has an unfinished open shell. Rendered flatness and silhouette are NOT acceptable regardless of triangle count, zero degeneracy or normals.

## Actual executed work
1. Inspected original r13 GLB `r21AO-F11-user101-core-rounded-fairing-r13.glb` and the central/torso outer boundaries. Generated `rev96-r15-pelvic-edges.png` from actual native core / body / lateral skin boundary edges, with XY, YZ, XZ views. Analysis: the 21-node source anatomical core runs from Y~ -0.07 and the rear body rim is Y~+0.12. The long loft spans about 0.19 in model units, causing the anatomical strip silhouette.
2. Created r15 arch and inset variants (`build_rev96_user101_r15_anatomy_saddle.cjs`), both 3,896 faces, preserving 101 user-deleted triangle triples, 63 bones and 370 clothing triangles. Rendered 16 pose/view screenshots for arch. **Rejected as improvement**: remains a long unnatural strip even when recessed in Z. r15 source models kept for record.
3. Created r16 compact and short variants (`build_rev96_user101_r16_compact_core.cjs`), each **3,752 triangles**. The long bridge now ends at only 55% or 43% of the original body-rim distance, and surface rows went from 12 to 8, with the anal pit shifted inside this shortened native core continuation. Both are actual generated GLBs.
4. Rendered 16 pose/solid-wire screenshots of r16 compact at 0/25/40/55 degrees. The dangling strip is visibly shorter relative to r13, however its back end is sharply cut and disconnected from surrounding body skin. Not accepted or user-approved.

## New files
- `models/r21AO-F11-user101-anatomy-saddle-r15-arch.glb`, SHA256 `0f2fa75a4116d26579dba74dd321cf84c99908c6005af79c443604b8aa17d68d`
- `models/r21AO-F11-user101-anatomy-saddle-r15-inset.glb`, SHA256 `1151db3df6b9cbcdd1472fefcf4d5d5b54ad82b34b86534e9eac3f243216040d`
- `models/r21AO-F11-user101-compact-core-r16-compact.glb`, SHA256 `a18be59deed4a611d31abd0cb4e58e03c504dc8026724f2853739f235cd873e9`
- `models/r21AO-F11-user101-compact-core-r16-short.glb`, SHA256 `c9b294e10e97a1ce973c54e9c4f5cd74081f6b47570c61bcf966acd1944eaf46`
- `scripts/build_rev96_user101_r15_anatomy_saddle.cjs`
- `scripts/build_rev96_user101_r16_compact_core.cjs`
- `scripts/render_rev96_r15_pelvic_topology.cjs`
- `scripts/r15_render_existing_svg.cjs`
- `review/review-rev96-user101-r15.html`, `review/viewer-rev96-user101-r15.js`
- `review/review-rev96-user101-r16.html`, `review/viewer-rev96-user101-r16.js`
- `review/captures/rev96-r15-arch-*.png` and `rev96-r16-*.png` (16 each)
- `review/captures/rev96-r15-pelvic-edges.png`
- `tests/REV96_USER101_ANATOMY_SADDLE_R15_ARCH.json`, `REV96_USER101_ANATOMY_SADDLE_R15_INSET.json`
- `tests/REV96_USER101_COMPACT_CORE_R16_COMPACT.json`, `REV96_USER101_COMPACT_CORE_R16_SHORT.json`

## Completion distinctions
- **Completed**: GLBs produced; source generators; 101 deleted faces protected, 63-bone rig and 370-face garment preserved; r16 shorter silhouette than r13; 4 leg-angle screenshot evidence produced.
- **Not completed**: Natural anatomical quality; true local body/core manifold welding; the large body hole that exposed its inside; final polygon reduction. r16 does not connect posterior edge to native body and may leave a hole. Do not present r16 as solved.

## Required next actual work
1. Keep r13 and user101 canonical trim immutable. Do not reintroduce the user's manually deleted underside string/strip.
2. From r16 compact determine exact short posterior boundary contour. Model an adjacent *body primitive 0 local skin patch* that deforms into the anatomical continuation in a small region, rather than filling the whole pelvic aperture.
3. Topologically weld in the native body index graph where possible; preserve skinned material semantics, POS/morph and normals at 0/25/40/55; test for unwanted holes and visual body interiors. Only accept if the silhouette from the user's screenshot camera angle is genuinely improved.
4. Decimation is deferred until closure and silhouette pass.

Local viewer: `http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r16.html`
