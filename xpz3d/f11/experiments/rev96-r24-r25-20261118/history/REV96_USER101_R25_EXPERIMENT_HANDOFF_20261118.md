# XPZ3D F11 rev96 r25 candidate experiment — handoff (2026-11-18)

## Results

Most useful working baseline stays **r24 Ellipse Soft v3**
`r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v3.glb`
SHA256 `ed99fb2df29767fff3258a6267ddc395b6e5b177eebc9676de7f1c5485bced7a`.

This version independently constructed 20mm posterior blind anal reposition, separate anal/vaginal cavities, a median perineal crease, and preserved r23 virtual connected pelvic topology. Posterior 20mm is actual GLB model displacement, not only requested parameter. 63 bones, garment 370, source manual 101 absent. See `REV96_USER101_R24_ACCEPTANCE.json`.

The current session additionally generated 5 local r24 experiments and 2 r25 independent GLBs without overwriting the shared baseline. Their hashes, generated geometry, and disposition are stored in `REV96_USER101_R25_EXPERIMENT_DISPOSITION.json`.

## Actual new r25 builds

- `build_rev96_user101_r25_lateral_skin_fairing.cjs` (builds both models directly from immutable r23-lbsweld)
- `r21AO-F11-user101-native-retopo-r25-lateral-gentle-v1.glb` SHA256 `569cac800e88ba5e59cfb74123ae83cc2f6c674c8384470aeab29c9a9bb8140f`
- `r21AO-F11-user101-native-retopo-r25-lateral-sculpt-v1.glb` SHA256 `639dabeef4d6383d6590bc325e98a8a1a7e849a0f82f003004c5372b81de5d3b`
- WebGL review `review-rev96-user101-r25.html` with existing r24 baseline comparison and 16 captures `rev96-r25-gentle-canonical-{0|25|40|55}-{under|behind}-{solid|wire}.png`.

### Geometry output

Both produce 4,680 triangles, preserve core 908 source sculpt vertices, 112 fixed skin border anchors, native torso, 63 bone skeleton, independent garment 370, and r24 anal center +20mm. Core 123 and skin 268 interior vertices adjusted, both rest pose and morph shape are noninverted.

The NEW broad lateral fairing produced maximum interior offsets of just ~0.00075 and ~0.00083 GLB units. The safety backtracking decreased requested displacement factors to 0.116 and 0.075 to avoid inverted triangles in the morphed mesh. Resulting 55° renders were nearly visually identical to r24. **Do not promote these r25 candidates**; they are a measured example that pushing vertices of the old 38/35 boundary radial fans does not fix the broad wing silhouette.

## Next real modification

Rather than continue more tiny vertex displacement variations, rebuild **large bilateral 38/35-edge fan closure** in local skin primitive 23 into a longitudinal banded, bounded patch. New topological connectivity may be required. Start from r24 Ellipse Soft v3 and physically preserve original manually deleted faces, core original 908 vertices, 63-bone skinning, material boundaries, the original torso and garment 370.

Prefer **overcoverage to an open hole** per user. A few removable redundant skin faces are less costly than missing/overlapping anatomy, but avoid large free-floating planar wings. Build two independent variants with perineal frontal/back AP curvature and medial G1-tangent blending, show 55° under/behind real and wire comparison, and avoid marking numerical seal as visual acceptance.

Separate **actual model creation / pose seams / local closure / full-body closure / visual acceptance**.

Remote GitHub push still cannot be assumed without checking remote commit; local commits are not proof of remote preservation.
