# X-Piratez 3D Battlescape — adopted development direction (2026-11-02)

## Decision
Build an **optional** Silent Storm-based 3D tactical mode for X-Piratez; retain the OXCE 2D battlescape and all OXCE campaign systems. The 3D engine is free to produce different hit, damage, geometry, AI and final combat results. Exact OXCE result parity is **not** a release gate.

## Ownership boundary
| Area | Authority |
|---|---|
| Geoscape, base, economy, research, manufacturing, recruitment, training | OXCE |
| Mission generation, strategic state, save and post-battle campaign commit | OXCE |
| Mission 3D representation, movement, LOS, collision, cover, destructibility, camera and tactical AI | Silent Storm-based runtime |
| Damage, armor, accuracy, TU, morale and statuses | Import OXCE/X-Piratez formulas where practical; otherwise documented adaptations |
| Unsupported missions and legacy tactical mode | Original OXCE 2D battlescape |
| Character/weapon/world art | License-cleared assets and conversion work; not part of the initial engine boot requirement |

## Build and runtime verification ladder
0. Confirm exact Silent Storm Reconstruction source, revision, build scripts, third-party dependencies, license and access to game-owned resources. **Block engine integration** if the code or necessary assets cannot be used legally.
1. Build the actual engine on supported Windows or other proven target. Report compiler, revision, linked dependencies, reproducible command and binary hash. **No independent stand-in counts as engine build.**
2. Launch engine with a minimal real 3D scene. Record logs/screenshots and confirm input/camera.
3. Spawn one real X-Piratez soldier and one real enemy from pinned, same-version data; verify identity, inventory, collision, move, fire, damage and destruction.
4. Exchange an OXCE battle-start record and a 3D battle-result record through a versioned adapter.
5. Apply the result once in OXCE, safely commit to a temporary campaign save, then return to geoscape; confirm no duplicate loot, items, soldiers, XP or research triggers.
6. Launch from the real OXCE tactical-mode selector; preserve default 2D mode and detect unsupported mission scripts before 3D transfer.

## Data contracts: first vertical slice
BattleStart must carry schemaVersion, battleId, campaignSnapshotId, missionId/rulesetRevision, map/mission conditions, faction and unit identities, soldier stats, persistent transformations, item instance IDs, quantities, ammunition, wounds/statuses and win/evacuation requirements.

BattleResult must carry matching battleId/snapshotId, rulesetRevision, outcome, per-unit persistent identity and health/alive/captive/evacuated state, inventory and ammunition deltas, recovered/consumed/destroyed loot, XP-relevant event summaries, campaign-critical mission flags and a deterministic processing receipt.

OXCE validates IDs, contract version, legal status changes, loot conservation and acceptance of mission results. OXCE is the **only** writer of the authoritative save; apply results transactionally with an idempotency key and rollback on error. A duplicate receipt must be rejected or return the recorded prior commit, never apply twice.

## Mechanic compatibility ledger (required for implementation)
For every mechanic record: source rule and version, implementation class (**original / adapted / replaced / not implemented**), justification, test evidence and supported mission types. Include accuracy, ballistics, TU, armor facings, damage types, stun, bleeding, morale, psi, melee, large units, special objectives, scripted spawns, captures and inventory.

Use source-code parity tests and original OXCE voxel instrumentation **only as secondary diagnostics**. Different combat outcomes are legitimate; missing core mechanics, broken state bridges, inconsistent ruleset revisions and corrupt campaign saves are not.

## Definition of done: first playable slice
A real 3D engine executable launches from an OXCE campaign battle, loads actual version-consistent X-Piratez unit/equipment data, supports move/fire/hit/destroy/finish, returns an auditable result, updates a non-destructively tested OXCE campaign and resumes geoscape. Demonstrate two modes remain selectable and show an unsupported-rule fallback.

## Evidence and current limitations
The earlier independent Linux prototype and OXCE build reports are **previously reported milestones**, not certification that Silent Storm itself runs. Current `main` experiment README notes that the original Experiments 01–04 native code is not fully committed in the experiment directory. Do not mark a gate complete without an actual checked-in implementation, reproducible build, runtime artifact or trace.

## Existing-project hygiene
Continue `road2man-cloud/xpiratez-data-atlas`, particularly `experiments/xpiratez3d/` and `docs/xpiratez-3d/`. Do not introduce a new canonical rules database. Keep the older site's mixed v.o1.1.1 dataset separate from pinned X-Piratez 2.1 / OXCE 8.7.1 data. Do not assume MIT licensing of the site applies to Nival source, OXCE or mod media.

## Next immediate engineering task
Inventory the currently accessible Silent Storm source and verify license/build prerequisites. Then add the smallest engine boot smoke test with explicit pass/fail evidence. Until it boots, any bridge or 3D-scene claim must be labeled prototype or mock.

## 2026-11-02: engine source and Windows host check (observed)

**Upstream reconstruction:** `met-nikita/Silent-Storm-Reconstruction`, branch `develop`. Its `README.en.md` (as read on 2026-11-02) reports a 2026-10-18 developer-confirmed build/run with Steam game assets and completion of an allied campaign. That is an **upstream report**, not a successful X-Piratez build or our runtime test. The upstream `CMakeLists.txt` explicitly rejects non-MSVC and non-32-bit toolchains. Requirements: Windows, Visual Studio 2022 or newer with C++ desktop workload, MSVC v143, Windows SDK 10, CMake 3.21+, and legally obtained Silent Storm game files to run. Optional DX SDK June 2010 affects only ShaderCompiler. MapEdit is specifically excluded from the normal build.

**Source links:** [Reconstruction instructions](https://github.com/met-nikita/Silent-Storm-Reconstruction/blob/develop/README.en.md), [Reconstruction CMake](https://github.com/met-nikita/Silent-Storm-Reconstruction/blob/develop/CMakeLists.txt), [Nival license](https://github.com/nival/Silent-Storm/blob/main/LICENSE.md).

**Connected Windows command probe:** On the accessible Windows host the Git executable resolved at `E:\\Program Files\\Git\\cmd\\git.exe`. Neither `cmake`, `msbuild`, nor `cl` resolved from the current PowerShell environment. A `C:\\Program Files (x86)\\Microsoft Visual Studio\\2019` directory exists, but this does not prove the required C++ workload. Neither `E:\\SteamLibrary\\steamapps\\common\\Silent Storm` nor `D:\\Games\\Silent Storm` exists; an alternate installation path has not been ruled out. The existing checkout directory `D:\\daphne_auto\\xpiratez-data-atlas` does exist. **No actual Silent Storm build or launch has been attempted or passed in this probe.**

**Gate status:** Source identified = PASS (metadata and instructions). Required modern Win32 build environment = NOT VERIFIED / known missing from PATH. Required proprietary game assets = NOT LOCATED in the probed locations. Actual Game.exe build = NOT RUN. Engine launch = NOT RUN. X-Piratez soldier spawn = NOT RUN. Do not promote a gate based on an upstream screenshot or a prior standalone Linux prototype.

**Next blocking actions:** (1) locate or legitimately install Silent Storm game assets; (2) provision VS2022+ x86 C++ tools and CMake 3.21+; (3) check out the reconstruction at a recorded commit; (4) execute `cmake -S . -B build -A Win32` then `cmake --build build --config Release`; (5) run a separate-named executable in the game directory, save a reproducible boot log and scene screenshot. Do not replace original Steam binaries or publish proprietary asset files.
