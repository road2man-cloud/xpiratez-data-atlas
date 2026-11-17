# XPZ3D F11 rev96 USER101 — r17~r19 posterior anal relocation and local shell closure

Date: 2026-11-17. **All three versions are experimental. No body-complete / visual-acceptance claim.**

## User request
Move the anal depression posteriorly, blend the native central anatomy smoothly into the surrounding torso skin, and eliminate the interior-visible open geometry with a **closed surface**. Preserve the manual user-deleted 101 polygons and original native data.

## Actual implementation and results
- Source: `models/r21AO-F11-user101-compact-core-r16-compact.glb`, SHA256 `a18be59deed4a611d31abd0cb4e58e03c504dc8026724f2853739f235cd873e9`.
- Manual trim JSON SHA256 `624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5`; 101 deleted original triangles, 106 controls, 754 manual position entries.
- Central native anatomy primitive **13** from r16 had one continuous **85-edge open boundary**. Other primitives including torso 0 also have multiple independent open boundary loops.

### r17: first actual closed anatomical shell
- Generating source: `scripts/build_rev96_user101_r17_closed_core.cjs`.
- Output `models/r21AO-F11-user101-pelvic-closed-shell-r17-tucked.glb` SHA256 `da86bb0f056fa5166d3c54d8962e1a770382c9ac97afea1bdc153e6a834a8db9` (5,191 triangles).
- Alternative `r17-subtle.glb` SHA256 `9ffa3eaf3b982c3432dd54129afa1e13e58ca714ed3d6803ad64432260f430f4`.
- Moved the ring-based anal depression from core Y **-0.0347158 to +0.0008213** (delta +0.0355371 in GLB world space) by reassigning 8 outer rim points, 8 inset ring points and blind inner floor, with copied target morph and skin attributes.
- Integrated r16 core surface extended rearward using 19-column curved loft toward native body rim, 216 additional bridge triangles, then generated matching inward-facing shell/backing and closed sidewalls.
- **Core topology result: 0 free edges, 0 edges of multiplicity !=2**. 63 bones, 370 garment faces, original 101 deleted face IDs all still absent.
- Pose capture at 0°/25°/40°/55° x under/rear x solid/wire, 16 images. r17 visually **failed as full solution**: the long posterior bridge appears as an unnatural hanging plane again. Do not promote as user-approved.

### r18: shorter **closed** shell
- Source `scripts/build_rev96_user101_r18_compact_closed.cjs`.
- `models/r21AO-F11-user101-compact-closed-core-r18-round.glb` SHA256 `12214153e46ba5f07d2c4848a9574112b3ecdbf3b98c4cde6ff7414607a21e9c`.
- `models/r21AO-F11-user101-compact-closed-core-r18-short.glb` SHA256 `e715189588af02cc1b84dab0c4cc422beb52ba65d560d803f140cd93e86a39e3`.
- 5,039 triangles, reduced bridge from 6 to 4 rows, endpoint to 55%/38% of body rim distance. Core = 0 open edges and 0 nonmanifold edges. No true native torso weld. 16 pose images produced.
- Visual: shorter bridge, but end remains flat and unsupported.

### r19: end curvature improved, **best experimental core-only candidate**
- Source `scripts/build_rev96_user101_r19_rounded_core.cjs`.
- `models/r21AO-F11-user101-rounded-closed-core-r19-tapered.glb` SHA256 `86177cb79c08a087ceffec0a55fdf025c8d91ed59611e5dbd5cd1804b64af19d`.
- `models/r21AO-F11-user101-rounded-closed-core-r19-gentle.glb` SHA256 `a9db014405ba4e44ad8de04c8f17da6e23e9574f686a80caf4d96491905402da`.
- 5,039 triangles. Curved rear terminal contour with lateral taper, rounder end, anal Y shift +0.0355371 retained.
- 0 core free edges / 0 nonmanifold edges and no reappearance of originally deleted 101 user faces. The original authored central core vertices are unchanged. 63 bones, clothing 370 faces.
- 16 rendered screenshots at 0/25/40/55 degrees; r19 rounded end improves r18 rectangular edge, **but is still not a natural torso/anatomy connection**. Source torso remains independently open.

## Critical distinction — only LOCAL closure achieved
The newly generated central anatomy primitive 13 is a **closed two-manifold skin shell**, but native torso primitive 0 and other skin layer primitives remain partly open. Core and torso are separate glTF primitives, the rear edge is NOT truly cross-index-welded, and the body can still expose interior. Underlying shell normals and skinning need pose/intersection examination beyond geometric counts.

**Do not claim full watertight body or natural silhouette.** The user requested this; it is a remaining acceptance blocker.

## Higher-quality continuation instructions
1. Treat the user screenshot r13 and current r19 55° screenshots as negative/partial examples; the r17 long bridge is a rejected architecture.
2. Work on **native torso primitive 0 retopology itself**, especially the cut rim near center Y 0.03~0.12, rather than inventing a stretched rectangle connecting two distant parallel loops.
3. Build a short, shape-constrained *surrounding-body local tissue transition* and match material/UV/morph/skin where it connects to the compact central closed core.
4. Do not alter the 101 manually deleted original triangles, and do not flatten, cap or restore manually removed hanging strips.
5. Completion criteria: 0 unintended open edges on all locally connected native skin after union; zero large protruding panels in 0/25/40/55°, and visually continuous anatomical contour, plus no garment-as-skin reuse.
6. Defer polygon reduction until after these closure and silhouette criteria are met. Keep versions as separate GLBs, and archive failed test variants rather than overwrite.

## Reproducible artifacts
- `scripts/build_rev96_user101_r17_closed_core.cjs`, `r18_compact_closed.cjs`, `r19_rounded_core.cjs`
- `tests/REV96_USER101_R17_TUCKED.json`, `R17_SUBTLE.json`, `R18_ROUND.json`, `R18_SHORT.json`, `R19_TAPERED.json`, `R19_GENTLE.json`
- `tests/render_rev96_r17_core.cjs`, `r18_closed.cjs`, `r19_rounded.cjs`, pose render reports.
- `review/review-rev96-user101-r17.html` through `r19.html`; matching JS.
- `review/captures/rev96-r17-*.png`, `rev96-r18-*.png`, `rev96-r19-*.png` (16 each).
- Local browser `http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r19.html`

**State: experimental / structural partial success / visual acceptance not met.**
