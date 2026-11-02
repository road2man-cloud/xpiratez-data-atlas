# X-Piratez 3D — Experimental native Linux program

This directory belongs to the **existing X-Piratez Data Atlas**. It is not a second, competing ruleset.

**Canonical data:** `../../public/reference/items.json`, X-Piratez v.o2 / 2.1, OXCE 8.7.1, Git blob `75e96cc753f78dbd51a813a0bccdf38dedac6486`. Source revision pin and validation claims: [Experiment 04](../../docs/xpiratez-3d/EXPERIMENT_04_LINUX.md).

## Currently committed here

- `tools/export_2_1_declarations.py`: pins and validates the 2.1 Atlas JSON source (exact-file Git blob SHA1, or exact 9-row fixture SHA256), exports nine direct item fields as a TSV. This cannot produce actual effective combat values.
- `tools/test_reference_import.py`: regression tests with invalid versions, records and fake metadata; changes to the fixture are rejected by its exact SHA256.
- `testdata/atlas_2_1_direct_excerpt.json`: 9 actual direct declarations *excerpted from* the existing Atlas, **not a replacement canonical database**.

The **full** independently written native C++ test program for Experiments 01–04 remains in the ChatGPT delivery ZIP (`X-Piratez-3D-Linux-Experiments-01-to-04.zip`, SHA256 `fcd99e04dc86c375d0378b4b47453a36841a9afb6b2af8b8199025e1c9d82808`). This GitHub directory does **not yet** contain that full native code. Do not claim it can build or run the engine from this directory alone.

## Reusing the repository's original indexed fields

From a checkout of the entire **existing** repository, the Python-only converter can be executed without third-party dependencies:

```sh
python3 experiments/xpiratez3d/tools/export_2_1_declarations.py \
  --source public/reference/items.json \
  --output /tmp/xpiratez3d-direct-declarations.tsv
python3 experiments/xpiratez3d/tools/test_reference_import.py
```

The result is a **direct declaration reference**, not a game-resolved weapon/ammo stats file. Unknown direct power (including the Minigun / Assault Cannon fixture records) is written as `UNKNOWN`, never zero.

For full native build instructions and explicit non-verified portions, consult [Experiment 04](../../docs/xpiratez-3d/EXPERIMENT_04_LINUX.md). [Issue #49](../../issues/49) is the active first runnable tactical chamber gate.

## Safety of the existing site

The new files live only in `experiments/` and `docs/` and do not replace the existing website's public data or build commands. **The website's complete CI test suite was not run from this tool environment**; native prototype tests are reported separately.

## Development direction adopted 2026-11-02: optional Silent Storm 3D battlescape

The **primary deliverable** is a playable optional X-Piratez 3D tactical mode backed by a legally usable Silent Storm-derived engine, **not** bit-for-bit or outcome parity with OXCE. OXCE continues to own geoscape, base management, research, manufacturing, soldier progression, mission generation, authoritative campaign saves and post-battle resolution. The 3D engine owns 3D combat execution, collision, movement, cover, destruction and tactical AI.

- Keep the original OXCE 2D tactical mode available; unsupported 3D mission rules must be diagnosed and can fall back to 2D before battle begins.
- Reuse X-Piratez 2.1 rules and OXCE formulas where sensible, but explicitly classify each mechanic as **original / adapted / replaced / not implemented**. OXCE instrumentation and paired-combat comparison are optional diagnostic tools, never a parity release gate.
- Exchange battle-start and battle-result records with immutable campaign, battle, soldier and item identifiers plus an explicit schema version; no direct 3D-engine writes to OXCE saves. Validate mission conditions, inventory conservation, survivor/captive handling, one-time application and safe rollback before authoritative OXCE commit.
- First vertical slice: OXCE mission selection -> engine-launched 3D scene with real X-Piratez units/gear -> movement, attack, damage and local terrain destruction -> structured battle result -> OXCE campaign continuation. Preserve a reproducible test seed/log for debugging without requiring 2D/3D outcomes to match.
- Prioritize **source provenance, actual engine boot, and licensing feasibility** before claiming Silent Storm integration. A stand-alone voxel/ballistics prototype is not proof that the Silent Storm engine runs. Separate verified compilations, runtime evidence, mock contracts and untested designs.
- Do not assume publicly available Nival source, OXCE code or X-Piratez assets may be combined or redistributed; audit each license and asset permission separately before importing.

Detailed execution gates and compatibility ledger: [2026-11-02 direction and vertical slice](../../docs/xpiratez-3d/3D_BATTLESCAPE_DIRECTION_2026-11-02.md).

## Current actual-engine milestone (2026-11-02, Stage 11)

[Stage 11: Windows Win32 engine + optional XPZ visual receiver build](./stage11/README.md) verifies that the actual Silent Storm Reconstruction engine compiles and links, and that **an isolated engine source copy** with the existing `XPZVisualFeed` builds into an x86 `Game.exe` (6,612,480 bytes; SHA-256 `4CC906591EB76001DAB5B9CBEF27D8C276080E7BE61182E7103A9FB23CE5B41C`). The 4/4 Microsoft x86 parser smoke tests pass on synthetic feed data. A pinned-source, patch-only and no-overwrite Windows reproduction script is checked in. **No game runtime boot, world-object spawning, 3D combat or campaign result integration has been demonstrated.** Steam game assets were not installed on the inspected machine. The proprietary engine itself and Steam assets are not included in this repository.

## Real Windows engine build and link proof (Stage 11, 2026-11-02)

The actual Win32/x86 `Silent-Storm-Reconstruction` C++ `Game.exe` now builds with MSVC 19.44 / VS 2022 and CMake 3.31.10. A **separate** source copy with this repository's pre-existing `stage06/ss/XPZVisualFeed.cpp` linked into the real `Game` target also builds successfully (6,612,480-byte executable; SHA-256 `4CC906591EB76001DAB5B9CBEF27D8C276080E7BE61182E7103A9FB23CE5B41C`; clean incremental rebuild exit 0). Win32 parser smoke tests pass 2/2. This is **actual engine code linkage**, not an actual rendered game session, spawned X-Piratez unit, or authoritative campaign bridge. The Steam game asset files were not found in the connected machine's installed libraries. [Stage 11 reproducible patch, build script, negative tests and evidence](stage11/README.md).
