# Experiment 06 — Native OXCE to Silent Storm reconstruction source seam (2026-11-01)

**Executed on GPT Linux:** 19/19 portable unit/integration tests PASS in the original package and again after clean ZIP extraction; independent C++14 visual-state receiver compiles with `-Wall -Wextra -Werror -pedantic` and consumes the fixture's three frames. **Not executed:** either original game with the patch; Windows build; real projectile impact; original OXCE .sav replay; actual Silent Storm scene entities.

## Strategic ownership

This experiment preserves the user's desired split: **OXCE / X-Piratez remains the sole authority for Geoscape, base management, manufacturing, research, finances, units, action and damage formulas, mission outcomes, original full save and gameplay RNG**. Silent Storm Reconstruction is targeted for 3D spatial/world representation, camera and eventually models/animation. The new preview is display-only and must NEVER modify a campaign save.

## Specific upstream source inspection (actual GitHub files)

The following anchors occurred **exactly once** in the inspected upstream sources:

| Source | Anchor | Observed Git blob |
|---|---|---|
| [OXCE native ReplayDriver.h](https://github.com/road2man-cloud/xpiratez-data-atlas/blob/main/tools/headless-simulator/native/ReplayDriver.h) | `pending = false; observe(game, "after_action");` | `322d48883ff393b7f12654d68c6df80cb0ffa9cf` |
| [Silent Storm Reconstruction Game/Main.cpp](https://github.com/met-nikita/Silent-Storm-Reconstruction/blob/develop/Game/Main.cpp) | `NHPTimer::UpdateHPTimerFrequency();` after `StepApp` | `20c3cda6ee944ee218a1293e5838f67dd82073e3` |
| [Silent Storm Reconstruction CMakeLists.txt](https://github.com/met-nikita/Silent-Storm-Reconstruction/blob/develop/CMakeLists.txt) | `target_link_options(Game PRIVATE /LARGEADDRESSAWARE)` | `64f80fbfee4cfa4c590bfb707fb17b3c785ab3c2` |

The opt-in overlay generator edits copies of those source files in a **new directory**, not installed originals. The Silent Storm extension is disabled unless `XPZ3D_VISUAL_FEED` points to a feed file.

## Delivered, with evidence

- C++14 `XPZVisualFeed` portable parser plus optional Win32 once-per-frame poll. It accepts full atomic snapshots containing current unit positions/health/TU and recent **requested aim targets only**; it rejects malformed frame sequences, unknown removals, duplicate IDs, bad numbers and incomplete frames.
- Python `export_visual_feed.py` transforms original native `native_ready`, `checkpoint` and *new opt-in* `xp3d_visual_fire` trace records into a display-only stream. Optionally verifies SHA256 for **actual** saved checkpoint files, without ever claiming these prove the trace's engine identity.
- Python `make_optin_patches.py` generates a source overlay for the original OXCE ReplayDriver and the Silent Storm Windows Game main-loop/CMake target. It does not copy Nival source into this project or alter the original game's formulas.
- **19/19 Linux tests** PASS, including C++14 compile/consume, trace formatting/identity and patch anchor tests.
- Clean extraction → C++14 strict rebuild → fixture stream load → PASS, 2 synthetic units, three frames, one requested aim; latest state of unit 21 TU=53 and unit 39 HP=28.
- Synthetic offscreen 3D test preview PNG + GLB contains two placeholder capsules and requested aim *not* a proven shot trajectory.

### Source archive

The complete tested source, tools, tests, executable reproduction instructions, and synthetic preview are in the ChatGPT conversation downloadable ZIP:

- `X-Piratez-3D-Stage06-Engine-Seam-Linux.zip`
- SHA256: `46b285e9d9200cffcb92b95ad492ed569c912a08a5273302a4c0eb25ccbb8a37`
- The ZIP remains a conversation artifact, while the tested C++ receiver, native-trace exporter, source overlay generator, and 19 portable regression tests are now **actually committed** at [experiments/xpiratez3d/stage06/](../../experiments/xpiratez3d/stage06/). Each committed core source/test file has been verified against the tested local Git blob SHA. The synthetic GLB/PNG output remains in the conversation ZIP, not the repository.
- Root commands after extraction: `python3 -m unittest discover -s tests -v`, `c++ -std=c++14 -Wall -Wextra -Werror -pedantic ss/XPZVisualFeed.cpp ss/visual_feed_test.cpp -o visual_feed_test`, `./visual_feed_test output/synthetic_visual.feed`.

## Critical limitations

- The present output is an action's **requested target**. It is **not** the actual projectile trajectory, hit voxel, material or terrain destruction event. This distinction is enforced in event names and tests.
- The 3D receiver currently **stores state in memory / logs changes**, not Nival in-world models. The GLB preview comes from an independent VTK/trimesh test, **not** Silent Storm's executable.
- Only the original source anchor lookup was performed against full GitHub code. Patch compile in the Windows MSVC Win32 target has **not** been executed; Linux tests apply the same anchors to minimal fixtures.
- The checked Windows machine had no discoverable MSVC `cl`, CMake on PATH or Silent Storm files in three common Steam paths. That is not an exhaustive disk search.
- Nival's [noncommercial revocable license](https://github.com/nival/Silent-Storm/blob/main/LICENSE.md) requires explicit rights assessment before code combination or any distribution. Separate processes do **not automatically** settle license issues.
- The external visual feed has hashes for consistency, not cryptographic identity attestation. Do not treat it as a verified native combat log without original binary/source provenance checks.

## Next falsifiable gate

1. Store the tested source files in this existing repo (a chat ZIP alone is not durable).
2. Build the permitted, patched **Win32** Silent Storm Reconstruction with the actual game resources; confirm a feed updates debug state within **that real process**.
3. Instrument original OXCE actual `TileEngine::hit` (opt-in, version-pin source hash) to emit **true** impact voxels, without changing native damage/RNG.
4. Bind visual state to Silent Storm `NGScene::IGameView` scene entities, with calibrated coordinate transform. Compare rendered positions against real OXCE unit state.
5. Re-run exact original-engine save/checkpoint comparisons and confirm strategy state untouched.

No imitation combat calculation or independent surrogate is acceptable as the authoritative replacement.
