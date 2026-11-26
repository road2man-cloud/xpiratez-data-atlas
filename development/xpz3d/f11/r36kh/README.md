# XPZ3D F11 R36KH — R36HW-face-locked 2,100△ exterior

**Status:** Cloud-produced game-exterior prototype. The GLB, renders, source Python and offline dashboard were produced in the ChatGPT container on 2026-11-27. This branch records the version and its source constraints without modifying the public game-data atlas.

## Provenance

- Base: R36KG F11 game exterior; SHA-256 `7d4058152fec3dcfed90dd170a0302f92e91eaf1d079e32912e92e9ba7a9c1f7`
- Authoritative identity/face: R36HW lineage, 644 face triangles, 294 hair triangles; protected eyes, hairpin, and hands remain unchanged.
- Final model: `R36KH_F11_SMOOTH_EXTERIOR_2100TRI.glb`
- Output SHA-256: `ed55a2f8ae3bc2c28e6c542fdf9afe9a32f1b0d77a127387cb4944c6f53cd615`
- Total: **2,100 triangles**, **63 bones**.
- Improved: 10 existing front-pelvis cells were contour-regularized to avoid high-frequency spikes; another 54 upper-torso/waist positions were reshaped without changing triangle count.
- Normals recomputed; source skin and triangle indices preserved.

## Accurate scope

The R36JB high-resolution 6,044-triangle anatomy donor is **not yet embedded** in the 2,100-triangle game GLB. Only low-poly external surface landmarks from the preceding R36KG baseline informed this R36KH continuation. This is not a final detailed anatomical recreation. Separate shoulder and upper-thigh junctions and runtime S2/S3 integration remain unfinished.

## Publication status

This GitHub branch includes development notes/metrics. **The binary GLB, PNG renders, full builder and HTML dashboard were packaged as `XPZ3D_R36KH_F11_2100TRI_REFINED_20261127.zip` in ChatGPT artifact storage, but were not uploaded through GitHub in this commit.** Do not infer that they are accessible from this repository.

The full package contains: `R36KH_F11_SMOOTH_EXTERIOR_2100TRI.glb`, `R36KG_F11_GAME_2100TRI.glb`, `build_r36kh.py`, `R36KH_BUILD_REPORT.json`, `R36KH_FRONT.png`, `R36KH_OBLIQUE.png`, `R36KH_SIDE.png`, `R36KH_BEFORE_AFTER.png`, `R36KH_OFFLINE_DASHBOARD.html`, `README_R36KH.md`, and `body500_F11_pir.gif`.

This directory is reserved for review and future GitHub binary publication; do not overwrite game atlas ruleset data.
