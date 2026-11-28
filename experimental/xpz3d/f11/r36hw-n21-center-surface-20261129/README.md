# R36HW N21 — V10 body / N19 center, local lower surface
N21 starts from the **published N20 GLB**, preserving the V10-via-V9 body contour transfer. Its source is `source/build.cjs`. The N19 central primitive (3) receives a constrained local lower-surface edit only; the N20 body primitive (6) remains untouched. All 45 perimeter vertices of the center are locked, and candidate moves are rejected when incident face area or face orientation becomes unsafe. This is a real geometry edit, not a recoloring or a preview illustration.

Expected build output: `output/R36HW_N21_V10_BODY_LOCAL_CENTER.glb`
Audit: `reports/build.json`

Run on GitHub Actions workflow `xpz3d-r36hw-n21-center-relief.yml` on every production source update. The output GLB is committed to `main` on successful jobs.

**Limitations:** This version does not delete or replace the entire long-triangle lower fabric-like topology, does not weld primitive 3 to the leg primitive, and has not passed native S2 rendering. It is a local refinement, not a finished exposed-body sculpt.
