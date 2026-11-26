# XPZ3D F11 — R36KO: R36HW original non-clothing materials, recessed central low-poly skin

**Actual production**: 2026-11-27 (KST) in ChatGPT's internal container. This is an experimental F11 model branch, not a modification to X-Piratez research/game rulesets.

## Actual GLBs

| File | Triangles | Bones | Bytes | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `R36KO_F11_HW_MATERIAL_LOCK_RECESSED_1024_2100TRI.glb` | 2,100 | 63 | 416,536 | `60258bcc845e4063710dd20872f8df12cbe97f493f235885d9ec11adf4ad2ba4` |
| `R36KO_F11_HW_MATERIAL_LOCK_RECESSED_512_2100TRI.glb` | 2,100 | 63 | 304,976 | `dbc17138a9674fbbe03f95aa0d153e65fd7f30d464b6a00a77a74246771b21cf` |

**Full artifact archive:** `XPZ3D_R36KO_HW_MATERIAL_LOCK_2100TRI_20261127.zip`, **36 distinct entries**, SHA-256 `20fb80dc5673ada2beef5a7c28cda86e49f0328131a1c0eafb6538e969fb0ace`.

These GLB / PNG / ZIP binaries were produced and packaged in the conversation's internal file artifacts. **They are NOT committed to this GitHub branch**; only the Markdown and JSON development records are in GitHub.

## Original R36HW asset fidelity

Source `R36HW_F11_CLOTHED.glb` SHA-256 `a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732`.

Source primitive -> output primitive: face `0->0`, hair `1->1`, hairpin `7->3`, source bare skin `8->4`, eye white `11->5`, eyes `12->6`. Source vertex positions, normals, `COLOR_0`, bone indices, skin weights, UVs, triangle indices, and material semantics are copied exactly.

**Important factual finding:** The **R36HW face has no image texture**. Its native shading is composed of `COLOR_0` vertex colors and the original `face` PBR material. Do not invent a supposed missing face PNG or procedurally retexture the face. The hair and eyes do use actual PNG textures, which were imported with byte-identical images and original sampler settings:
- Hair PNG SHA-256: `b42b7007abdae3b2c404ef5a...` (39,664 bytes).
- Eye PNG SHA-256: `f89623b8fe7aea7046ad1405...` (12,339 bytes).

The original hair and eye PNGs were already byte-identical in R36KN, so the R36KO reimport is a strict provenance/immutability guard, not proof that R36KN had lost those textures. Some undesirable appearance may be caused by software renderer lighting/geometry rather than absent source texture.

## Actual new geometry and texture changes

- Keep the existing **40-triangle** central, non-explicit external skin patch; move patch vertices **posterior +Y up to 0.027** and **superior +Z up to 0.020** model units with anchored upper boundary vertices.
- Modify ONLY the clothing-replacement torso/body skin maps: localized, smooth albedo/normal/ORM shading at lower center; blending of upper chest/neck skin tone toward native R36HW face skin to avoid artificial seams.
- No extra triangles and no new bones. Face, hair, eyes, hairpin, existing exposed skin, rig joints and bind matrices remain immutable.
- Identical software renderer under identical viewing conditions produced an RGB difference of **0 across 26,550 pixels** of the core face/hair crop between R36HW and R36KO. This does **not** substitute for engine or all-pose validation.

## Scope and remaining limitations

- Does not include the 6,044-triangle R36JB high-density edit mesh. Central patch is a non-explicit low-poly external approximation only.
- Hip/thigh and shoulder joints are not fully topologically welded. Full-pose deformation and S2/S3 engine integration not verified.
- Software renders of actual GLB data are included in ZIP. Chromium navigation in the container was blocked by administrator for both file and localhost URLs; interactive offline HTML dashboard therefore remains **browser-unverified** here.
- Original garment geometry, clothes and straps were intentionally not restored; their surfaces are replaced by the evolving nude exterior. Original non-clothing parts are protected.

## Source and artifact package

The package contains `build_r36ko.py`, `build_dashboard_r36ko.py`, `glb_io_r36kj.py`, `compact_gltf.py`, `build_r36kk.py`, `render_r36kj.py`, R36HW source and R36KN source GLBs, R36KO outputs, embedded map PNGs, offline dashboard, comparison software renders, SHA manifests and reports.

GitHub branch contains provenance records only. This directory is under `experimental/xpz3d/f11/r36ko/` and does not modify the repository's official mainline game-data files.
