# X-Piratez 3D — Experiment 02: Irregular Breach (2026-11-01)

**State:** Independently compiled and executed on GPT Linux, reproducible prototype passed. This is **not** a Nival Silent Storm build and **not** X-Piratez/OXCE canonical ballistics.

**Source of truth:** [Project charter](./PROJECT_CHARTER.md) and the existing X-Piratez 2.1 / OXCE 8.7.1 rule/data references in this repository. No duplicate canonical rule database was created.

## Native implementation

Built with GNU C++17 using a closed-triangle-mesh rasterization approach. The scene contains an irregular seven-sided floor, a six-sided elevated landing, a pitched roof, an oblique wall whose top slopes in height, an angled stone support and a steel pier. Geometry is **not** limited to aligned boxes.

A triangle point-in-solid parity test generates occupancy on a 96 × 80 × 48 grid with 0.125 m cells. Local spherical removal changes **only** cells belonging to the angled wall, then changes the world revision 1 → 2. Ray/vision queries and a body-clearance-aware ground route use the same updated state.

An independent triangle-ray intersection routine was compared with the voxel ray implementation for 140 deterministic rays per native run; the ray target IDs matched and the largest *observed* hit-distance deviation was 0.0676694 m. This is a **sampled result, not a global error bound**.

## Executed and verified results

| Test | Native result |
|---|---|
| Assertions | **19 / 19 PASS** |
| Native replay | **100 / 100 identical occupancy hashes / metrics** |
| Original wall occupancy | 4,314 cells |
| Remaining wall occupancy | 3,340 cells |
| Removed cells | **974 (~1.902344 m³ of discretized volume)** |
| Ray | angled wall blocks → a spherical opening clears ray |
| Full-height standing navigation | blocked → open; **22 nodes** |
| Second-floor vertical collision | remains blocked by slab |
| Roof, slab, steel pier | unchanged |
| Repeated identical spherical removal | no further changes, revision stays 2 |
| Independently exported GLB | two 3D scenes, successfully re-opened |
| Post-export geometry QA | source triangle meshes unchanged, reconstructed occupancy surfaces closed, volume consistent |
| CTest | first shot + irregular breach **both passed** |
| Package clean extraction | successfully rebuilt and both tests passed |

The rendered damaged-wall mesh was reconstructed by marching cubes from the **actual C++ saved voxel occupancy**. The screenshot is not merely an artist's impression.

### Reproduction

The complete source, CMake files, compiled Linux executables, state snapshots, offscreen VTK render scripts, PNG/GIF/GLB artifacts and SHA-256 checks are contained in the ZIP delivered in the corresponding ChatGPT project conversation:

- File name: `X-Piratez-3D-First-Shot-and-Irregular-Breach-Linux.zip`
- ZIP SHA-256: `6644ccd6137e2f231557970e628cba8981b369552b36996d419000966f2cf32b`
- Native command: `./run_linux.sh`
- Render commands: `python3 render_irregular.py && python3 check_irregular.py`
- Full check JSON: `output/irregular/irregular_report.json`

**Storage status:** This document records the measured result; the full source ZIP is in the conversation download, **not yet committed to the GitHub repository**. It must be added to version control in a follow-on step before the project relies on it as a durable source artifact. Do not assume the ZIP exists in GitHub.

## Falsification boundaries

This is a voxel-cell carving operation, **not** a structural stress/fracture/collapse simulation. The new navigation supports one ground level with sampled body clearance, not continuous 3D pathfinding or stair/flight traversal. The OXCE canonical rules (TU, accuracy, damage, penetration, material properties, armor, and status updates) are **not implemented or verified** in this experiment. The 140 ray tests avoid edge/grazing cases, so comprehensive corner-case testing is still required. Scene models are independently generated geometry and do not contain copyrighted original game data.

## Next gate

1. Commit the full tested source package into this **existing** repository in a scoped project path, excluding compiled/large output files and preserving the web build.
2. Replace the simplified blast mask with tagged wall materials and per-triangle/per-voxel deformation contracts, and test corner/grazing rays.
3. Build the deterministic OXCE rules adapter from a pinned real OXCE source version, with formal comparisons between original and adapted hit/damage calculations.
4. Keep Nival code purely for research until explicit rights and compatibility are resolved.
