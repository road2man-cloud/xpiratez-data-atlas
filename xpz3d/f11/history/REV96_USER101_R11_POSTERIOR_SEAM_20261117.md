# XPZ3D F11 rev96 r11 — Native posterior edge subdivision and perineum alignment

**Date:** 2026-11-17. Latest experimentally usable artifact. Do NOT treat as all skin closed.

## Original and integrity protection
- Canonical manually authored 101 deleted triangles: `source/rev95-user-trim-101faces-20261116T152807Z.json` SHA256 `624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5`.
- Canonical rev96 trim base: `models/r21AO-F11-user-trim-rev96-base.glb` = 3,546 triangles.
- Start from `models/r21AO-F11-user101-posterior-tucked-closure-r9.glb` (3,604 triangles), not rejected r8 or r10.

## Actual new geometry
- r10 tried a 19-triangle broad body bridge and **failed visually** as a large horizontal skin sail. It is preserved as a rejected artifact, not promoted.
- r11 edited **actual body primitive 0**, splitting precisely two posterior body triangles:
  - `29-174-302` and `29-28-296`
  - inserted six interpolated vertices 908..913, resulting in +6 native torso triangles.
- Matched seven r9 posterior groin boundary vertices [49,50,51,52,53,54,55] exactly to [908,909,910,29,911,912,913], including rest position, 55-degree morph delta, LBS joints and weights.
- Gently propagated displacement one/two rows into perineum, adjusted folded under-skin cap around the moved boundary, and recomputed perineum normals in rest and open55 poses.
- No large bridging panel was added. No further polygon reduction performed.
- Actual output: `models/r21AO-F11-user101-posterior-seam-aligned-r11.glb`, **3,610 triangles**, SHA256 `c0109fca67137623db40afcfea0b37d6669b92fe704a59511bd1e8778acb13c5`.

## Verified
- Original manual deletion 101 triangle index triples remain absent.
- Existing authored body vertices (original 908) and original 754 edits unchanged.
- 63 bones; separate 370-clothing triangles unchanged.
- Perineum primitive 22 free border edges 0; seven rear points rest/open55/skin influences exactly match.
- Screenshots: `review/captures/rev96-r11-*.png`, 0,25,40,55 degrees × under/rear × solid/wire, 16 images, WebGL JS errors 0.
- Verified by `tests/verify_rev96_user101_r11.cjs`; report `tests/REV96_USER101_R11_CHECK.json`.
- Local viewer `http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r11.html`.

## Explicitly incomplete
- Although r11 matches all rear boundary attributes at the seven points, glTF **body and perineum remain separate material primitives**, so this is geometric alignment, not literal shared-index topology weld.
- A wider legacy body/central/side-skin cut boundary remains open. Blind capping would restore deleted strings or cover anatomical openings.
- More local edge welding and soft transition into existing surrounding skin is necessary before any extra polygon decimation. Do not repeat broad panel solutions r8/r10.
- No native game integration and no end-user approval.
