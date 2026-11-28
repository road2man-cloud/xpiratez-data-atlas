# V25 — neutral stance GLB

V24-based default joint pose: lowered arms, slightly flexed elbows/knees, small stance widening, and mean ankle-height correction. This is a pose-only GLB variant, not a rebind or geometry rewrite. Original binary buffer, inverse binds, all meshes, textures and opaque clothing remain identical. CPU linear blend skinning computes the reported pose bounds and joint positions in model-local Z-up. Viewer must support glTF skins. No visual collision test, render, native S2 execution or sprite-match claim.

Rebuild: `node source/build.cjs /path/to/V24.glb`.
