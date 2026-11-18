# XPZ3D R143 ACTOR STREAM ??isolated native pair
Date: 2026-11-19 KST

## Actual changes
- OXCE R142 cumulative engine: publishes authoritative unit roster at up to 12.5Hz.
- 128-unit snapshot. Includes actual tile position, terrain-adjusted foot height, OXCE unit height, team, facing and kneel state.
- Fog rule: all player units, only currently visible hostile/neutral units; dead/out units omitted.
- R143 S2 native IGScene: draws oriented 3D proxy silhouettes, separates friend/hostile/neutral color, never draws selected first-person unit.
- Existing R136 camera, R142 discovered terrain mesh and R140 minigun/HMS remain in their respective cumulative lineage.

## Running
- Runtime is a local candidate; it relies on the shared r135 installed test data and S2 model fixture paths.
- Use RUN_R143_ACTOR_PAIR.ps1 in an INTERACTIVE Windows desktop, with an isolated save CopySave matching source user/piratez.
- The launcher copies the save into isolated-user; it never edits the original source save.
- Does not launch from a headless Session 0.

## Incomplete
- Native EXEs successfully compiled and linked, but live in-game actor appearance not asserted.
- Actors are directional proxy geometry, not F11 GLB mesh/63-bone rig.
- Floors and walls still use schematic tile geometry, not full MCD/LOFT.
- This is a paired local candidate, not a standalone commercial installer.
- GitHub preservation is separate from this local build.