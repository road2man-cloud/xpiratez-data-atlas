# XPZ3D F11 rev96 r8 -> r9, 2026-11-17
**Preserve historical input; do not overwrite.**
Canonical 101-face user deletion snapshot SHA256: `624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5`.
Canonical 3546-face GLB SHA256: `f53a8d5af9000593aaa681c11038bb641950cae62810511784e05a0fc5d07cd7`.

## Actual geometry results
| Output | Triangles | New perineum open edges | SHA256 | Result |
|---|---:|---:|---|---|
| r7 lowpoly | 3522 | 26 | 147a5eafb3ba1a9394b020eaadd9356f902e139779e0aa5793566e7c095b0170 | older baseline |
| r8 rounded closure | 3604 | 0 | 45fab33142a02145a74340d422f2b04d2238f2ca9177498e7503e5465a87893e | **rejected**: giant posterior sail |
| r9 tucked closure | 3604 | 0 | d221a17073541c02284246a438314e55352b823a9ca3fe007b8c370ad7f58f54 | **experimental candidate**: r8 sail reduced |

### Work performed
- Recovered and examined actual stored r7 GLB, not a guessed model. Built `build_rev96_user101_r8_closure.cjs` and `build_rev96_user101_r9_closure.cjs`.
- Analyzed union-of-neighboring skin primitives and exact rest/open55 pose boundary geometry. Found newly created perineal primitive 22 had 26 exposed edges.
- r8 closed all 26 perineal border edges with a folded under-surface ring plus cap, and built 6 small closure triangles at four independent lateral pinhole loops.
- r8 visually **failed**, with a vast flat flap. Retained as rejected input to r9, not final.
- r9 instead blends only 32% toward medial native body anchors, keeps original user-cut anterior rim, and tucks the rear cap deeper. See `review/captures/rev96-r9-*.png`.
- r9 structural report: `tests/REV96_USER101_R9_CHECK.json`. All 101 originally deleted triangle triples remain absent, all native positions unchanged, 63 bones, 370 clothing faces, 16 new screenshots, WebGL JS errors 0.

### Explicit limitations
- **NOT all skin wounds closed.** The large pre-existing multi-primitive pelvic cut boundary remains (84-edge union loop). It includes anatomical structures and must NOT be blindly filled, as this risks undoing the user's manual deletion.
- New r9 perineum (primitive 22) is watertight **within itself**; native posterior torso primitive 0 is still a separate topology, not physically welded, although geometrically approached.
- 4 local pinholes are covered by a separate 24th skinned primitive; their caps are not welded to the source indexed mesh.
- No further polygon reduction has been attempted. The user's priority remains **close local skin first, reduce polygons second**.
- r9 rear shape is improved relative to r8 but still looks like a narrow joined strip, not a finished rounded transition. No user approval or game deployment.

### Next implementation requirements
1. Correctly split the native posterior torso rim at the matching r9 perineal edge anchors while preserving morph/skin and original 101 deleted triangles. Validate opposite-directed shared boundary edges across skin primitives for rest/55 poses.
2. For large non-anatomical open areas, classify actual outer boundary edges vs intended central opening using `analyze_rev96_r8_skin_union.cjs` and `rev96-r8-boundary-atlas.json`; never close entire 84-edge union loop blindly.
3. Once no local unintended holes remain and 0/25/40/55 silhouettes are good, run conservative decimation **after closure**, not before.
4. Keep all generated GLBs and compare snapshots GitHub-committed on F11 dedicated branch.
