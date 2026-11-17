# XPZ3D F11 rev96 USER101 — r20–r22 natural perineum and native skin correction
Date: 2026-11-17. **Best new visual experiment: r22 dome, SKINFIX viewer only. Not whole-body closed.**

## User request
Make a natural closed pelvis/perineum and remove the unusual inverse curve. Preserve all manually removed original polygons. Visual quality, not numeric closed-core assertions, is the primary acceptance criterion.

## Source truth
- Source r16 compact: `r21AO-F11-user101-compact-core-r16-compact.glb` SHA256 `a18be59deed4a611d31abd0cb4e58e03c504dc8026724f2853739f235cd873e9`.
- User trim JSON SHA256 `624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5`, 101 faces removed, 106 controls, 754 positions.
- Source r19 was closed only inside primitive 13. Torso remains partly open. Prior r17–r19 models are immutable.
- Core (pi13) original edges examined alongside real torso (pi0), left/right skin pi17/18, pelvic pi21, local closure pi22.

## Actual geometry work (new GLBs, no prior overwrite)
**r20**: `scripts/build_rev96_user101_r20_native_collar.cjs`
- GLBs: `models/r21AO-F11-user101-bodygrown-core-r20-fitted.glb` SHA256 `bbde78ac7faa504590f480e130023c750fd2f9445a65556cf1dd675e5e6afd35`
- `models/r21AO-F11-user101-bodygrown-core-r20-soft.glb` SHA256 `99810f1d021916d2175c030161a9bc335b8bdb89df8a01793567a7d0f2d5c016`.
- Native body pi0 grew 144 new local collar triangles; anatomical pi13 contributed 108 front-side bridge triangles; 19 coordinates/morph positions matched. Core shell itself remained closed. Inverse Z kinks in the last 3 generated core rows locally raised to monotone transition; original authored 908 central positions preserved.
- 5,107 faces, 63 bones, garment 370.
- Visual: rear patch black and badly shaded. Retained diagnostic, not accepted.

**r21**: `scripts/build_rev96_user101_r21_pelvic_bowl.cjs`
- GLBs: `models/r21AO-F11-user101-pelvic-bowl-r21-dome.glb` SHA256 `f587abb02f558f732868419c115687adfb81ce78c73ef170dfec19ea0aa7b015`.
- `models/r21AO-F11-user101-pelvic-bowl-r21-gentle.glb` SHA256 `fb951966df73b70b014922627ce4c6877ae08ef47d3968629fd03198978044be`.
- Increased transverse saddle width and controlled convex belly surface, recomputed body grown normals from actual triangles in rest and 55° to replace source-interpolated normals (which deviated ~70°). 5,107 faces.
- Still black in 55° rear view: renderer material classifier was not reading the new nude-skin primitive correctly (diagnosed next).

**r22**: `scripts/build_rev96_user101_r22_native_nude_bowl.cjs`
- GLBs: `models/r21AO-F11-user101-native-skin-bowl-r22-dome.glb` SHA256 `15451f69e5c9e6041463ad15ce8668939a3f604c14ce65e5d601fdd3ceb1cb41`.
- `models/r21AO-F11-user101-native-skin-bowl-r22-gentle.glb` SHA256 `a333eb4f32af586b23e6e9386d5ae21c3ef5a1396d63b51479c84fb4f4ce8669`.
- Collars were moved from face/hair-textured original body primitive 0 into own skinned original nude-skin material 5 primitive 23 (144 faces). Original body primitive 0 byte-level accessor/geometry retained. Bone mapping and 55° morph transferred. Matching 19 spatial/morph seam coordinates between core and collar remain.
- The original review viewer only classified a few `extras.type` strings, so this new skin primitive was rendered by the wrong atlas. A **new corrected review-only** file `review-rev96-user101-r22-skinfix.html` and `viewer-rev96-user101-r22-skinfix.js` now treats `r22-grown-native-nude-pelvic-skin` as a nude-skin surface. GLBs unchanged.
- The corrected 16 pose screenshot suite under `review/captures/rev96-r22-skinfix-*.png` proves the previously black patch renders the proper skin tone. The bowl is still geometrically too detached/elongated to accept as complete.

## Quantified acceptance gate, DO NOT MISREPRESENT
`tests/verify_rev96_user101_r22_gate.cjs` and `tests/REV96_USER101_R22_GATE.json` read actual GLBs, not only generator status:
- 5,107 triangles, 63 bones, 370 separate garment triangles, original manually deleted 101 triangles remain absent.
- Original pi0 positions/indices unchanged.
- Native nude skin material 5 assigned to new collar primitive 23; 144 faces.
- Closed internal core pi13: **0 free edges, 0 nonmanifold edges**.
- Core-collar 19 rest/55 morph point pairs match geometrically.
- **Whole virtual skin union is still NOT closed:** 99 free edges, 58 edges with >2 incident faces, 8 same-orientation overlapping seams; 51 open edges around central pelvic ROI. In particular, the closed core backing shell overlaps some other existing skin material boundaries. This is a material/topological design issue not solved by lighting.
- 16 renders each for r20, r21, r22 standard plus 16 corrected r22 skinfix; 0 WebGL JS errors in pose capture.
- User quality acceptance **NOT achieved**. Full-body closed and naturally welded skin **incomplete**.

## Recommended next real construction
1. Start with **r22 dome GLB + corrected skinfix viewer** for material-aware visual evidence. Retain user trim original 101 exactly.
2. At native skin union virtual edges, classify the 99 open and 58 multiply occupied edges by anatomical ROI. Do not blindly bridge 116-edge wide pelvic hole or restore deleted hanging strips; r8, r10 and r14 proved that fails.
3. Refactor inner backing shell and native-skin collar as one consistent local outer/inner topology. Remove duplicate core sidewalls at shared seams and build an inner return path to native body, so virtual edge incident count becomes exactly 2 and actual undesired pelvic boundary edges vanish.
4. Shape from native body surface, not a 0.1-unit long unsupported strip. Validate frontal, posterior, under 0/25/40/55 and rest/55 morph, silhouette, face crossings; compare screenshot to user r13 reference.
5. Polygon reduction is still deferred; only after genuinely natural closed native skin system is built.

## Review location
Local `http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r22-skinfix.html`. The plain r22 viewer has deliberately been retained as failed rendering evidence.
