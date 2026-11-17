# XPZ3D F11 rev96 — r12, r13 and r14 actual geometry progress (2026-11-17)

## Objective
User reported r11 perineum as an unnaturally straight separate skin strip, quality mismatch with native central anatomy, plus open unfinished native body showing interior. **Do not fill the original user deleted 101 triangles.**

## Exact source and reproducibility
- r11 source: `models/r21AO-F11-user101-posterior-seam-aligned-r11.glb` SHA256 `c0109fca67137623db40afcfea0b37d6669b92fe704a59511bd1e8778acb13c5`
- Canonical deletion JSON: `source/rev95-user-trim-101faces-20261116T152807Z.json` SHA256 `624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5`
- No previous model overwritten.

## r12 — first actual integrated central anatomy (new GLB, experimental)
- `models/r21AO-F11-user101-core-extended-curved-r12.glb`
- SHA256: `05e6f971d34592d32c4008af5ee853f140a1891712f6705ac2f8f2a8f293e77c`
- Replaces primitive 22's 192-face separate perineal slab with an extension INSIDE original native central anatomical primitive **13**.
- Actual 21-vertex oriented user trim-side core edge `[340,535,565,568,342,539,503,330,505,506,510,332,515,549,346,584,553,347,552,554,348]` becomes an indexed shared edge, not a separate fake overlay.
- 19 columns x 12 post rows + inset anal blind cavity. 466 new core triangles; 245 new core vertices. Original torso rim subdivided by 12 faces / 12 vertices, 19 rear rim vertices geometrically matched.
- 3,896 triangles total. 63 bones, 370 garment faces preserved, 101 manually deleted user polygons absent. Rest and 55-degree new surface faces have zero numerical degeneracies.
- Rendered 16 screenshots 0°, 25°, 40°, 55° from below and rear in solid and wire modes; no JS errors.

## r13 — central-anatomy curved fairing (new GLB, **latest experimental candidate**)
- `models/r21AO-F11-user101-core-rounded-fairing-r13.glb`
- SHA256: `cb772e9fc8ecb4adca1c5dfd99af5c5fdcbcdc9125dcb4a9e8036ce57032ee1a`
- Adjusts X,Y,Z of 209 internal integrated anatomy vertices with a varying curved transverse profile and anatomically tapered 55-degree morph. Recalculates normals, moving blind anal inset together with adjacent tissue. The 21 original central edge vertices and 19 native posterior rim points remain unchanged.
- 3,896 triangles total. No added polygon count, no further reduction.
- 16 screenshots rendered, no JS errors. **The central extension is smoother than the old r11 separate strip but still visually too elongated in certain angles.** It is a partial geometry improvement, not user-approved.

## r14 — local posterior sidewall experiment (**REJECTED**)
- `models/r21AO-F11-user101-lateral-closure-r14.glb`
- SHA256: `904f3521ded8eae9b1f73091dd14b99c183147ee3496ceabf58eb7a8c8d5a996`
- Created actual +40 central primitive sidewall triangles (20 per side, +24 vertices), 3,936 triangles total; sampled actual original body boundary. The initial longer sidewall candidate was stopped when its longest triangle edge exceeded geometry quality bounds.
- The narrower r14 was successfully generated and rendered in 16 views (0°,25°,40°,55°, rear/below, solid/wire) but **visibly created two thin lateral membrane wings**, not convincing skin. DO NOT promote.
- Native body large unclosed cut still exists. No false claim of full manifold completion.

## Current limits and required next real geometry work
1. Work from the latest r13 integrated core, rather than prior r11 separate strip or r14 wings.
2. Distinguish original intended anatomical lumen/opening from exposed original torso rim by **actual mesh-edge and pose classification**; do not blanket-cap the pelvic aperture.
3. Do real *body primitive 0* local retopology around the remaining open skin-to-core boundary with a bounded sidewall cross-section, and normal/UV continuity. Avoid adding disjoint horizontal sails or lateral webbing; r8, r10 and r14 are recorded failed counterexamples.
4. The native body and skin are not universally watertight. Existing independent microclosure primitive 23 covers four small source pinholes, but isn't index-welded across material primitives.
5. Only reduce polygon count after full local surface continuity and intended anatomical openings are verified in 0°,25°,40°,55°.
6. User feedback was not supplied for these new outputs. Experimental vs accepted state must stay separate.

## Production files
- `scripts/build_rev96_user101_r12_core_continuation.cjs`
- `scripts/build_rev96_user101_r13_curved_fairing.cjs`
- `scripts/build_rev96_user101_r14_lateral_closure.cjs`
- `scripts/inspect_rev96_r12_source.cjs`
- `scripts/inspect_rev96_r13_body_transition.cjs`
- `tests/REV96_USER101_CORE_EXTENSION_R12.json`
- `tests/REV96_USER101_CORE_FAIRING_R13.json`
- `tests/REV96_USER101_LATERAL_R14.json`
- `review/captures/rev96-r{12,13,14}-*.png` (16 per revision)
