# V13 BODY + N21 CENTER

Authoritative entire-body model is **R36HW F11 V13 Warm Ochre**, pinned to commit `8c68b4ddde2696674a533216c20bbb62d46242d3`. Exact V13 GLB geometry is the only source for silhouette, torso, limbs, face, hair, original 63-joint rig and weights. **N19/N20/N21 full-body geometry must never be used.** N21 contributes center anatomy only, from primitive 3.

Two Node.js build profiles:
- `source/build_continuous.cjs`: V13 intact 2,100-triangle surface, localized N21 center depth transfer onto V13 vertices; no seam cutting. Output `R36HW_V13_BODY_NCENTER_CONTINUOUS.glb`.
- `source/build_patch.cjs`: V13 body with central faces locally replaced by N21 center triangles, subject to 2,100 triangle budget; still an open/unwelded seam prototype. Output `R36HW_V13_BODY_NCENTER_PATCH.glb`.

Workflow: `.github/workflows/xpz3d-v13-body-ncenter.yml`. Source models are fetched in the GitHub Actions runner; no user-PC Python execution.

**Not final art**: V13's clothing-derived geometry is still the base. Both use V13 skin material instead of V13 warm-ochre textile material on the body; V13's exact warm-ochre outfit palette cannot be retained simultaneously with an unclothed surface. Textures, center connection and native S2 posed rendering require further artwork. N-series body silhouette is excluded by design.
