# Stage 08 — Identical-input OXCE native control/observer engine pair

**Status: implementation and CI verification under way (2026-11-01).** This is **not** a report of actual X-Piratez combat having been executed. The original Nival Silent Storm runtime is not involved at this stage.

User-requested architecture remains unchanged: OXCE controls the Geoscape, campaigns, units, research, manufacturing, money, saves and native combat rules; Silent Storm is the prospective 3D **visual/spatial** battlescape, subject to an independent rights and compatibility gate.

## What changes in Stage 08

- `build-paired.mjs`: uses the existing **locked original OXCE full C++ source** and existing real `build-native.mjs` to compile a control build; clones its disposable source tree and uses the Stage07 source-anchored overlay to compile a second version with only telemetry instrumentation. Build the source snapshots **without original game resources**. Includes separate binary SHA-256, original source/tree hashes, original baseline driver hash, observer patch hashes, default-off status and clock adapter policy.
- `native-pair.test.mjs`: synthetic contract/negative tests only, not battles.
- `run-paired.mjs`: optional **real native Linux battle** runner for an authorized data installation and actual save. It calls the existing original `runNative` twice, uses **fixed-clock mode**, no forced RNG change unless explicitly given, and sets `XPZ_NATIVE_IMPACT_TRACE=1` ONLY for the observer process. The existing original runner performs full native checkpoint writes.
- `compare-paired.mjs`: different executable/driver hashes are **expected**. They are allowed only with a pinned observer patch. A comparison requires otherwise identical source archive, fixed clock, save, plan, config, seed, all checkpoints and complete original OXCE native snapshots. Missing real hit events, changed RNG or changed full snapshot hashes are failures; no field filtering or smoothing.
- [GitHub Actions](../../../.github/workflows/xpiratez3d-stage08-oxce-binary-pair.yml) compiles actual original OXCE control and observed binaries on **Ubuntu 22.04**, then publishes temporary artifacts containing **no game data or private saves**. The CI steps do **not** execute combat; only a separate actual run with authorized data can test that.

## Reproduce: source-verified dual C++ compilation

Required: Linux, Node 22+, CMake, C++17, Python 3, SDL 1.2 development headers and the untouched `tools/headless-simulator/native/oxce-source.tar.gz` snapshot. The existing original sources/locks are used as-is; they are **not regenerated** for the observed build.

```sh
node --test experiments/xpiratez3d/stage08/native-pair.test.mjs
node experiments/xpiratez3d/stage08/build-paired.mjs /tmp/new-oxce-stage08-pair 2
```

Expect the first compiled executable at `/tmp/new-oxce-stage08-pair/control/bundle/oxce-native` and the second at `/tmp/new-oxce-stage08-pair/observer/bundle/oxce-native`. The controlling evidence is `binary-pair.json` and both `native-build.json` manifests; do **not** claim a native battle was run merely from compiling the binaries.

## Reproduce: only if actual authorized game data and save are available on **Linux**

Run with a plan actually containing a valid, equipped original OXCE `fire UNIT_ID ITEM_ID snap|aimed|auto X Y Z` command. The complete original `17.sav` (or other user-selected save), original X-Piratez game files and mod resources are needed. The user-supplied source installation is **not overwritten**, and no installed Windows game is launched.

```sh
node experiments/xpiratez3d/stage08/run-paired.mjs \
 --build /tmp/new-oxce-stage08-pair \
 --data /path/to/real/Dioxine_XPiratez \
 --user /path/to/real/Dioxine_XPiratez/user \
 --config /path/to/real/Dioxine_XPiratez/user/options.cfg \
 --save /path/to/real/17.sav \
 --plan /path/to/pinned-fire.actions \
 --out /tmp/new-oxce-stage08-real-battle
```

For archived original SDL runtime libraries, add `--runtime /path/to/verified-runtime-bundle`. For virtual X, add `--xvfb`. Initial results are experimental only. No fallback to approximated damage formulas.

If the native engine fails, the complete save contents change, the original driver reports an error, the native checkpoint SHA or RNG diverges, the scene cannot be loaded, the action is rejected or **no actual OXCE `TileEngine::hit` event is recorded**, the test must fail. This is **not a Silent Storm 3D scene** yet.

## Counterexamples that invalidate the hypothesis

- The observer requires modifying `TileEngine` damage/RNG logic rather than passively reading the computed values.
- A full original OXCE save has different serialized bytes with the observer on, using equivalent fixed-clock inputs.
- An observed hit cannot be traced to a source-authenticated `TileEngine::hit` call.
- Recorded OXCE hit voxels cannot be mapped consistently into a Nival scene with the corresponding geometry and occlusion (this must be tested later using **real** 3D objects).
- The legal rights do not permit the desired source or assets combination.

**Legal caveat:** Nival Silent Storm's source publication is noncommercial/revocable. It is not equivalent to the OpenXcom/OXCE GPL license or permission to distribute a linked or combined game. Keep the OXCE original code and Nival code separate until rights are cleared; this stage contains **no Nival code or art**.

See [Stage 07](../stage07/README.md) and [Original OXCE headless runner](../../../tools/headless-simulator/README.md).
