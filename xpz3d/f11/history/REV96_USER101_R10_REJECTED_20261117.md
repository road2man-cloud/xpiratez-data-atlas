# F11 r10 posterior native-body void bridge — REJECTED

Date: 2026-11-17. Canonical user 101-face trim remains unchanged.

## Actual files
- Generator: `scripts/build_rev96_user101_r10_body_bridge.cjs`
- GLB: `models/r21AO-F11-user101-posterior-body-bridge-r10.glb`
- Source: accepted-experimental r9 `r21AO-F11-user101-posterior-tucked-closure-r9.glb`
- New GLB SHA256: `bd80af6b7c92b3620ddae26db20f395e1fdece317b7dc0b2c238fb068b9dd371`
- +19 triangles (3,604 -> 3,623), 63 Bones and 370 garment faces.
- 16 pose/view/wire images produced by `render_rev96_r10_perineum.cjs`.

## Why rejected
The posterior native body boundary path `29-174-306-214-216-215` to `29-296-75-78-76` is a much wider region than the perineal patch. The generated zipper bridge creates a horizontal skin sail in under and posterior 55-degree views, obscuring much of the lower torso. At some angles it reproduces the earlier r8 flap problem.

**Do not promote to latest candidate.** r9 remains the latest experimentally usable GLB:
`r21AO-F11-user101-posterior-tucked-closure-r9.glb` (SHA256 `d221a17073541c02284246a438314e55352b823a9ca3fe007b8c370ad7f58f54`).

## Required next real edit
The native body edge must be locally split/retriangulated and welded to a *bounded medial perineal contour*, not bridged across the entire lateral torso boundary. At 0/25/40/55 degrees reject long outside-skin fans and any return of user-deleted 101 original triangles. The large pre-existing aperture is still not physically sealed; stop treating it as a simple polygon hole.

Only after a continuous skin edge has been established should low-poly reduction resume.
