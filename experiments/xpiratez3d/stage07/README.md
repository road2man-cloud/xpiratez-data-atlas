# Stage 07 — OXCE damage-application voxels to 3D display

**2026-11-01 — Code and portable tests completed; real game engine build/execution NOT completed.**

The user's planned architecture remains OXCE Geoscape/base economy/research/units/TU/RNG/gameplay rules and campaign save + a separately authorized Silent Storm 3D battlescape. The 3D visualizer receives observations only; it cannot become the authority for combat or campaign save writes.

## Original source evidence and isolated overlay

Real authorized RC18 `TileEngine::hit(..., Position center, ...)` contains the already-calculated **damage-application voxel center**, the original `voxelCheck` part, randomized damage, terrain final damage and `terrainChanged` flag. These should NOT be mistaken for the entire projectile path, missed shots, confirmed map destruction in Nival or a verified 3D hit mesh. The hook is after original damage and visibility/gravity processing, and does not reroll or replace the native formulas.

The optional C++14 observer (`native/NativeImpactTrace.h`) is off unless `XPZ_NATIVE_IMPACT_TRACE=1` and stores at most 65,536 events with explicit overflow; original `ReplayDriver::observe()` can drain events only after its native checkpoint. A new `XPZ3D3` wire format adds typed `I` messages; the existing Stage06 receiver now accepts both v2 and v3. **No second surrogate battle engine or duplicate rules database** is introduced.

The source patch generator (`tools/apply_impact_overlay.py`) was actually executed in an isolated directory on the authorized Windows machine with **both original inputs unchanged**, verified by SHA256:

| Original | Input SHA-256 |
|---|---|
| RC18 `src/Battlescape/TileEngine.cpp` | `ec9943f60e20f5675f6ddcbe9132ef85088ebe911643502c45c3e0ff13320aed` |
| `tools/headless-simulator/native/ReplayDriver.h` | `9ecb50f3bcc527728aea7c8d81bdbe993bcd3c7632031960bb15bb5d85398901` |

The **generated overlays** were saved under `D:\daphne_auto\XPZ3D_STAGE07_ISOLATED_OVERLAY_20261101` (not applied to installed OXCE):

| New source copy | Output SHA-256 |
|---|---|
| `TileEngine.cpp` | `63fd60222d4c3c4b8e510ea369df367d88796dc5711aa4203d018211d4667054` |
| `ReplayDriver.h` | `c34f607c122462de224e4bb2501d378c2633eba5be7974cb5f6da599e05ddc7d` |
| `NativeImpactTrace.h` | `630e26220c204f409729c0905f75f6b505fafb2d6f5472d54f9025d235105d08` |

**This does NOT mean the original native OXCE or Silent Storm game was compiled or run.** The former `source.lock.json` adapter hash will change and MUST be re-pinned for any experimental engine build; previous native runner identities must not be reused.

## Test proof

- **20/20 Linux Stage07 tests** passed: original hit source anchors; strictly opt-in C++ recorder; compiled C++ log emission -> JSON -> read-only XPZ3D3 -> compiled C++ receiver; malformed/fake evidence rejected; file/snapshot ownership preserved.
- Existing **19/19 Stage06 tests** continue to pass with the extended receiver.
- Standalone native queue test passed including opt-in guard, concurrent recording and fail-closed overflow behavior.
- A **synthetic** visual feed and 3D marker preview are packaged separately; they are not a screenshot or log from a running original game. The sample `(99,37,9)` voxel is mapped to `(99/16,37/16,9/24)` OXCE-tile coordinates only; this is NOT calibrated to Silent Storm world coordinates.

## Reproduce (Linux)

From `experiments/xpiratez3d/stage07`, with the sibling `../stage06` present:

```sh
python3 -m unittest discover -s tests -v
c++ -std=c++14 -Wall -Wextra -Werror -pedantic -pthread \
  -I native native/impact_queue_test.cpp -o /tmp/xpz3d-impact-queue
/tmp/xpz3d-impact-queue
```

To generate an isolated research overlay against **authorized source copies**:

```sh
python3 tools/apply_impact_overlay.py \
  --tile-engine /path/to/OXCE/src/Battlescape/TileEngine.cpp \
  --replay-driver /path/to/ReplayDriver.h \
  --output /new/empty/overlay
```

The three stages `native impact -> validated transport -> renderer` are separate contracts. Never silently replace a requested aim with an actual hit, or equate 3D voxel carving with OXCE map data destruction.

## Unresolved / next acceptance gate

1. Explicitly integrate the overlay into a **new version-pinned native OXCE build** without altering game calculations, then replay a **real battle** and assert actual `TileEngine::hit` voxel output.
2. Compare full native checkpoints and RNG/input identity against an uninstrumented control with the same fixed clock; if different, reject parity. The observer is opt-in so the default path remains unchanged.
3. Calibrate between OXCE voxel grid and Nival 3D coordinates, create real `NGScene::IGameView` unit/impact objects, and test with an authorized **Win32** Reconstruction build and original game resources.
4. Validate battle completion and OXCE Geoscape return without modifying existing campaign saves.
5. Obtain permission/legal review before combining GPL OXCE and Nival source, distributing original art, or describing this as a shippable hybrid engine. Nival license is noncommercial and revocable.

Detailed historic records: [stage06](../stage06/README.md), [project charter](../../../docs/xpiratez-3d/PROJECT_CHARTER.md), [original native runner](../../../tools/headless-simulator/README.md).
