# Stage 10 — Isolated Windows native OXCE CMake dependency repair (2026-11-02)

**Evidence levels:** Dependency configuration succeeded; canonical Windows control C++ build was still running during this update. Neither original shot recording, paired full-save parity, Nival runtime execution nor any integrated 3D tactical game has been demonstrated.

## Source and ownership
Retain canonical OXCE strategy, Geoscape, economy, research, soldiers, battle damage/RNG and campaign save. The observer is non-authoritative read-only telemetry; Silent Storm remains a prospective authorized 3D renderer, not compiled or attached in this experiment.

Original X-Piratez installation and original save files were not changed. The Windows build was isolated under `D:\daphne_auto\XPZ3D_NATIVE_PAIR_WIN_20261101\`; control and observer original source trees were produced from the pinned archive (`4319b0ee922adf9b97ecdc8984b881a6b351b60ca5f3ea921839fb4c30aa02fb`) and Stage07 patch. SHA/source manifest validation passed before CMake configuration.

## Diagnosed failure and resolution

Windows CMake with MinGW 14.3.0 initially halted in `FindPkgConfig.cmake`: `pkg-config tool not found`. Inspection of **original** CMakeLists.txt showed a supported alternative: when `NOT UNIX AND IS_DIRECTORY ${DEPS_DIR}`, it includes `${DEPS_DIR}/include/SDL`, links `${DEPS_DIR}/lib/x64` and sets `SDL`, `SDL_image`, `SDL_mixer`, and `SDL_gfx` libraries without pkg-config.

Created an **isolated dependency bundle**, using previously installed authentic SDL 1.2.15 development headers/import libs plus upstream SDL_image / SDL_mixer / SDL_gfx public 1.2 headers and import libraries generated from existing local runtime DLLs. No manual imitation of interfaces or altered OXCE formulas. SDL component headers were sourced from:

- SDL_image branch SDL-1.2, pinned upstream `2ffb2e3e1eba037897164e3ac6c67570d8bccd79`, `SDL_image.h` blob `23ce91f8dfed023c110ee8fed2dd095c5ad19239`
- SDL_mixer branch SDL-1.2, pinned upstream `16407659fd7a3af53171d6561fd7681593591509`, `SDL_mixer.h` blob `d24bd4abe3ebac0e14c62b8f847c8e3a90049ff4`
- SDL_gfx `SDL_gfxPrimitives.h`, pinned upstream `4cc9485e8b36fab6126ee390c5746bbe16dcd3e6`, blob `f32a64a6e13f7d2bfe41a5f6e4d6d86590406a75`

The existing OXCE script `experiments/xpiratez3d/stage09/windows-pair.mjs` now explicitly sets `-DDEPS_DIR` to the isolated directory. The *two* native OXCE CMake configure phases (control + observer) **both passed** and generated build files. This one-line change was committed to the existing repository in commit `3c99d72`. The original SDL dependency artifacts are installed **only in the isolated machine workspace**, not part of the game or published ZIP.

## Verification limitations

- An earlier Windows attempt at downloading SDL_image upstream directly timed out. The independently pinned upstream headers and preexisting DLLs allowed the documented local dependency workaround.
- A native compilation was initiated. The tool call timed out/disconnected from its command output; a subsequent process check confirmed multiple real `cc1plus` jobs and native control object files were being produced. Completion/link was **not yet confirmed** in this record.
- The canonical Linux paired binaries from Stage08 had previously compiled, were downloaded and passed native `-version`/`-help` startup tests, but no actual replay against real game data was performed there.
- Old Windows native smoke had `FIRE_PROJECTILE_NOT_PROVEN_BY_ORIGINAL_RNG` in separate evidence. That test is not a verified hit.

## Acceptance gate

1. Compile and link the isolated Win64 control and observer OXCE executables with matching original source/clock and a pinned explicit Stage07 observer patch.
2. Run the **same genuine combat save and legal fire command** through both, without changing the original installation or save.
3. Confirm a real native `TileEngine::hit` event in the observer output, compare complete original serialized battle snapshots and RNG, and fail closed on differences or missing impacts.
4. Only after source permissions and runtime availability are resolved, bind hit coordinates and unit state to genuine Silent Storm objects.
