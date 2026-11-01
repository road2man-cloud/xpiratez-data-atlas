# X-Piratez 3D — Experiment 04: Real 2.1 direct item declarations (2026-11-01)

**Status:** GPT Linux C++17 rebuilt and executed, including a clean extraction from the delivered ZIP. **The integration is real for *item metadata provenance*, not yet for effective X-Piratez ballistics.**

Related authoritative source: this repository's `public/reference/items.json` (X-Piratez v.o2 / 2.1 and OXCE 8.7.1), pinned at Git blob SHA1 `75e96cc753f78dbd51a813a0bccdf38dedac6486`. The underlying `Piratez.rul` hash cited by the index is `ac42ed92d3f86f8414e5a1451dc207b0f3eee9e15bac0b949e93371e172b32f6`. **That hash was copied from the Atlas provenance metadata; the source `.rul` was not independently rehashed in this Linux turn.**

## Implemented and executed

The native experiment references *nine real, directly declared* item entries in the existing Atlas index.

| Item | Directly declared power | Directly declared damage type | Important limitation |
|---|---:|---:|---|
| Fatty / `STR_GATLING_LASER` | 44 | 4 | Not proven effective ammo/equipment damage |
| Flechette Multicannon / `STR_FLECHETTE_CANNON` | 40 | 16 | Not proven effective ammo/equipment damage |
| Boring Pistol / `STR_BORING_PISTOL` | 30 | 16 | Not proven effective ammo/equipment damage |
| Stun Baton / `STR_STUN_BATON` | 22 | 12 | Melee mode differs from gun ballistics |
| Minigun / `STR_MINIGUN` | **UNDECLARED** | **UNDECLARED** | Effective statistics are unknown, **not zero** |
| Assault Cannon / `STR_PIR_CANNON` | **UNDECLARED** | **UNDECLARED** | Effective statistics are unknown, **not zero** |

**All nine individual rows** appear in the archived 2.1 direct-field reference; seven have declared power, two do not. The nine-row fixture is a reproducible **excerpt**; it does not replace the source index of 306 explicit training-mode declarations or the full resolved game Ruleset.

A Python exporter checks schema, exact version and source hash **and now validates the whole input file**: SHA256 for the nine-row fixture (`c45b246bd235d2879f48b6e8a34398e52e6d030f2e09667f524c86cb334ccb4e`) or Git blob SHA1 for the full official snapshot (`75e96cc753f78dbd51a813a0bccdf38dedac6486`). It preserves missing values as `UNKNOWN` and fails closed for invalid or unexpected source data. Import negatives include an attempted forged minigun direct power of zero.

## Native demonstration and results

**Executed** on Linux in C++17: `xpiratez3d_reference_bridge`, with the already tested polygon-to-voxel geometry code from the previous experiments.

- `44/44` new native C++ assertions passed.
- Pinned X-Piratez 2.1 declaration for Fatty: *direct* `power=44, damageType=4`.
- **Hypothetical combat-only assumptions**: `RandomType=3` (flat), `TileDamageMethod=2`, `ToTile=0.5`, synthetic brick armor 20, synthetic steel armor 110. These have **not** been verified as effective game values for this weapon or terrain.
- Under **those assumptions only**, the restricted OXCE-formula-derived C++ calculation yields tile damage 22; the experimental geometric carve deletes 108 voxels from a sloped wall, and the **subsequent** ray passes through the hole.
- `STR_MINIGUN` and `STR_PIR_CANNON` are rejected for conditional testing rather than silently treated as power zero.
- 4 deterministic repeats of the modified voxel world returned the same occupancy hash.
- All existing experiments remain passing: **5/5 CTest entries**, comprising **4 C++ experimental executables + Python provenance guards**. A clean ZIP extraction was rebuilt and retested successfully.
- 3D render of earlier stage 02 remained valid: polygon/voxel-geometry QA and GLB round-trip passed.

**Confirmed full-game OXCE/X-Piratez combat outcomes: 0.** The canonical end-to-end hit, ammo, damage scripts, weapon mode, actual MCD terrain armor, TU, stun, health/armor, damage resistances, and projectile continuation have **not** been reproduced.

## Reproduction and archival

The complete tested Linux source + build files, test fixture, scripts, reports and rendered 3D artifacts were delivered in the ChatGPT conversation as:

- `X-Piratez-3D-Linux-Experiments-01-to-04.zip`
- SHA-256 `fcd99e04dc86c375d0378b4b47453a36841a9afb6b2af8b8199025e1c9d82808`
- Execute `./run_linux.sh` after extraction on a Linux system with CMake, Ninja, GCC/Clang and Python 3.
- Optional full Atlas input: `XPIRATEZ_ATLAS_ITEMS_JSON=/path/to/public/reference/items.json ./run_linux.sh`.

In this repository, the importer, negative guard tests, and pinned nine-row fixture are committed under `experiments/xpiratez3d/`. **Full tested native C++ sources are currently in the conversation ZIP, not yet committed to this repository.** Do not represent this documentation commit as a source-code commit.

The original Silent Storm engine was **not executed** and none of its proprietary source code or game assets are in the prototype.

## Next falsifiable gate

1. Preserve all independently tested C++ source files in the existing project's version control, keeping its website build unaffected.
2. Load **effective** 2.1 combat data: item inheritance, actual ammunition selection, mode/weapon changes, global settings, damage alterations and scripts.
3. Verify terrain MCD/armor rules against actual installed 2.1 files; do not use the test brick/steel values.
4. Compare exactly matching inputs with a real OXCE binary or a properly linked canonical harness; report mismatches separately from intentional new 3D fracture rules.
