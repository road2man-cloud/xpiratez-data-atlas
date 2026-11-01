# Experiment 03 — Pinned OXCE terrain-damage subset + 3D material gate (2026-11-01)

**Status:** Executed on GPT Linux (independent C++17), 1,640 assertions passed; original three CTest targets all green. Not full OXCE/X-Piratez simulation parity.

## Executed scenario

- Fixed canonical source **MeridianOXC/OpenXcom** at revision `f0134ef8065799c7723953d64b565f7832bfd782`.
- Reviewed `src/Mod/RuleDamageType.cpp`, `src/Engine/RNG.cpp`, `src/Battlescape/TileEngine.cpp`, `src/Savegame/Tile.cpp`.
- Ported **a restricted independent branch** of OXCE's damage randomization, tile-hit damage method 1/2, `ToTile`, `RandomTile`, `TileDamageLimit`, and terrain destruction threshold (`tileDamage >= terrainArmor`).
- Deterministic xorshift64* RNG reproduces the pinned `RNG.cpp` algorithm; explicit seeds and integer inclusive modulo were tested.
- Synthetic scenario: `power=120`, `RandomType=flat`, `TileDamageMethod=2`, `ToTile=0.5`, yielding **60 terrain damage**.
- Synthetic material thresholds: **brick armor 42** (destroyable), **steel armor 110** (survives).
- On successful brick threshold, the experiment applies a *new, explicitly non-OXCE* cylindrical notch policy to the existing oblique triangular wall's occupancy field. The 3D wall loses **108 occupied voxels**, from **4,314 to 4,206**.
- World revision increments **1 -> 2**, subsequent 3D ray passes through gap, distant intact wall still blocks, second-floor slab still blocks vertical shot.

The bullet striking and destroying a tile part in actual OXCE is **not** a claim that the same projectile continues through the resulting hole. This experiment confirms the **next** ray can pass through the newly altered 3D field.

## Validation

- 1,640 independent C++ assertions in the new test, including fixed-seed reproducibility and multiple damage randomization branches.
- 3/3 CTest targets pass after `./run_linux.sh` (original first-shot + irregular-breach + new material-breach).
- Existing project `src/irregular_breach.cpp` refactored to reuse `src/irregular_world.hpp`, unchanged earlier stage outcomes.
- Reproducible package delivered in the corresponding ChatGPT session: **`X-Piratez-3D-Linux-Experiments-01-to-03.zip`**, SHA-256 **`ffa7642b67bb666832eac7b43551457cdf79a06dd38df218cd35f5fd54389e03`**.
- Inside package: `src/material_breach.cpp`, `src/irregular_world.hpp`, updated `CMakeLists.txt`, updated `run_linux.sh`, test result `output/material/material_report.json`.
- The zip is available in the conversation artifacts, **not yet committed as executable source in GitHub**.

## Source references

- [OXCE `RuleDamageType.cpp`](https://github.com/MeridianOXC/OpenXcom/blob/f0134ef8065799c7723953d64b565f7832bfd782/src/Mod/RuleDamageType.cpp) (random damage; tile roll; final tile damage)
- [OXCE `RNG.cpp`](https://github.com/MeridianOXC/OpenXcom/blob/f0134ef8065799c7723953d64b565f7832bfd782/src/Engine/RNG.cpp) (xorshift64*; inclusive integer range)
- [OXCE `TileEngine.cpp`](https://github.com/MeridianOXC/OpenXcom/blob/f0134ef8065799c7723953d64b565f7832bfd782/src/Battlescape/TileEngine.cpp) (`hit`, damage calculation, terrain update)
- [OXCE `Tile.cpp`](https://github.com/MeridianOXC/OpenXcom/blob/f0134ef8065799c7723953d64b565f7832bfd782/src/Savegame/Tile.cpp) (`Tile::damage` >= test)

## Limitations / falsification

This does **not** prove byte-identical comparison with a running original OXCE binary; the comparisons are based on independently ported source branches, not linked engine execution. It omits real X-Piratez 2.1 mod rules and weapon/item inheritance, Lua/scripts, many combat types, unit armor/health, per-weapon TU/accuracy, full blast propagation, collateral destruction and immediate projectile continuation rules.

The cylindrical notch is a **new proposed spatial policy**, not the original OXCE destruction behavior. Material armor values are artificial fixtures, not game data. Do not treat the 3D prototype as the original game engine. Future source commit and end-to-end canonical test remain pending.
