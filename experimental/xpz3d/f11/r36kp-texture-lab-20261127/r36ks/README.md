# R36KS — central-body geometric reflow, original triangle budget retained

Starts from R36KR (already containing source-derived 2048 textures), then moves a small set of shared body vertices toward the translated donor center reference; preserves the GLB UV, 63-joint skin, head/hair and 2,088 drawn triangles. Ten unique positions were modified consistently for their shared UV-duplicate vertices; no new disconnected core mesh. Face orientation and indices preserved.

- `output/R36KS_F11_RELIEF_2088TRI.glb`: stronger local relief adjustment.
- `output/R36KS_F11_MILD_RELIEF_2088TRI.glb`: smaller adjustment.
- `output/PRODUCTION_REPORT.json`: adjustment statistics.
- `source/r36ks_surface_reflow.cjs`: reproducible production script, with local helper dependencies.
- `preview/index.html`: compare candidate with earlier R36KR and the original high-poly reference.

This method changes a limited number of positions and **does not fill** the negative-space gap. It is not a completed anatomical replacement. The center remains darker than requested in the WebGL preview; do not claim user acceptance or game integration.
