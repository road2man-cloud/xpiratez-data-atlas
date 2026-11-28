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

## Second implementation: continuous V11 mesh

`source/build_continuous.cjs` builds `output/R36HW_V11_BODY_NCENTER_CONTINUOUS.glb` directly from the pinned V11 COMPACT GLB and N21's central primitive. It retains **all original 2,100 V11 triangles**, index topology, 63-joint skin and V11 full-body silhouette. It samples only the central relief (Y depth) from N21 onto original V11 vertices, with capped moves and triangle-orientation guards. V11's own skin material and colors replace the textile appearance.

The first `build.cjs` file remains an **experimental N21 patch-primitive** variant. The continuous variant is preferable for topology safety because no V11 center faces are excised; its limitation is that anatomical detail cannot exceed available V11 vertex density. The patch-primitive variant contains higher-density N21 central triangles but carries unwelded open boundaries.

Both outputs are distinct and are published by the same GitHub Actions workflow. Neither is art-accepted or native-S2-rendered yet. This does NOT restore N-series full-body shapes.
