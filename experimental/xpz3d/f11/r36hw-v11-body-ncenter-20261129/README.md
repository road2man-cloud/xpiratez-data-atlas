# R36HW V11 BODY + N-series center (corrected lineage)

## Authoritative body source
**V11 COMPACT** from immutable commit `bde014a9f29ab4751bbe63394164b5d633c9af3b`. This exact GLB is the entire output basis: mesh, coordinates, rig, face, hair, limbs, torso, pose weights, V11 contour.

**Anatomical center only:** R36HW N21 primitive 3 (derived from N19). No N-series body, limbs, torso or head are used.

N20/N21 whole-body outputs are **not** the body baseline. N21 is read only as a central reference patch.

## What the first corrective build does
- V11 garment-derived body primitive 5 is kept as V11 geometry, but switched to skin material 8 and V11 existing skin-color palette.
- V11 front-center fabric triangles are excised locally; N21 center triangles within that central window are added as a distinct skinned primitive.
- Model rig stays V11 63 joints. Triangle budget maximum 2,100.
- Source in `source/build.cjs`; GitHub Actions `xpz3d-v11-body-ncenter.yml`.

**Known incomplete:** The N21 replacement is a mesh patch and not yet welded at the perimeter, so this is an intermediate construction build, not an art-approved exposed-body final asset. The V11 garment-derived geometry outside the patch remains unchanged; anatomical skin detailing and native S2 render are not completed.

## Output
`output/R36HW_V11_BODY_NCENTER.glb`; diagnostics `reports/build.json`.
