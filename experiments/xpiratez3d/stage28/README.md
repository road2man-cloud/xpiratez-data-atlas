# Stage 28 — native variable-size X-Piratez map conversion (2026-11-03)

Priority: real 40x40, 50x50, 60x60 OXCE terrain, consistent scale and units; 10-floor tower deferred.

## Implemented

- Stage26 existing `convert-terrain.mjs` and `collision-proxy.mjs` now accept native source map dimensions instead of hardcoded 60x60, retaining 1.25m per source tile / native 0.625m path cell.
- `--grid W,H` allows independently padded grids; `--scale` compatibility now means padding rather than stretching. Terrain render vertices, collision proxies and provisional unit centers share the same origin offset.
- Source Battle ID is now bound to the Stage24 manifest even without explicit `--battle`.
- Existing Stage25 S2 source `Main/wMain.cpp` accepts opt-in `XPZ3D_STAGE28_NAV_X` and `XPZ3D_STAGE28_NAV_Y`, constructs rectangular native path network, and independently rounds physical terrain backing in X/Y to 8m.
- Existing `Main/XPZ3DImportedTerrain.h` no longer rejects all non-60x60 source sizes; validates nav X/Y and fixed 1.25m tile pitch when Stage28 variables present.
- `windows-native-map-sizes-smoke.ps1` isolates native executable and GOG assets, checks source hashes, independently verifies requested nav dimensions and terrain backing and separate visual/collision native logs. Script parser PASS. **No native smoke PASS yet.**

## Actual local conversions (offline, real saves)

| Source save | Map | Native nav | Full visual meshes | Full source-derived collision proxy meshes | Building crop region | Crop visual meshes | Crop collision meshes |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: |
| 5.sav | 40x40x9 | 80x80 | 202 | 145 | 27,27,12,12 | 47 | 32 |
| 2____.sav | 50x50x9 | 100x100 | 394 | 158 | 19,30,12,12 | 47 | 17 |
| 8____.sav | 60x60x9 | 120x120 | 619 | 338 | 32,47,12,12 | 96 | 62 |

Detailed per-battle binaries/manifests: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage28\` (local proprietary derived assets, not committed). All three read the user's real saved map, installed MCD/LOFT and local ruleset. Rendering uses placeholder color, collision proxy is approximate; original per-object destruction, doors/windows LOS and native S2 unit spawn/combat remain unverified.

Native engine build **pending**: isolated build directory `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-stage28-win32`. CMake configuration succeeded; attempted full Win32 compilation exceeded execution window. No `Release/Game.exe` existed at last inspection. Do not claim native run or combat.

## Acceptance and next commands

After an actual successful native Win32 build:
```powershell
$cmake='D:\daphne_auto\tools\cmake\cmake-3.31.6-windows-x86_64\bin\cmake.exe'
& $cmake --build 'D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-stage28-win32' --config Release --target Game --parallel 7
```

Then in the **interactive logged-in desktop session** (not Windows service session 0), from Atlas checkout:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File experiments/xpiratez3d/stage28/windows-native-map-sizes-smoke.ps1 -GridX 80 -GridY 80 -MeshPath D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage28\crash40-crop\xpz3d-terrain-v1.meshbin -ManifestPath D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage28\crash40-crop\terrain-manifest.json -CollisionPath D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage28\crash40-crop\xpz3d-collision-proxy-v1.meshbin -CollisionManifestPath D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage28\crash40-crop\collision-proxy-manifest.json
```

Repeat with 100x100 barn and 120x120 village fixtures. Do not accept logs with the wrong source dimensions, nav grid, terrain backing or source hash. A loaded mesh and approximate hull do not prove correct line-of-sight, physical collision, destructibility, actor movement or campaign handoff.

No production R47 binary, save, or GOG licensed asset is changed by the source conversion tools; engine source edits are restricted to the existing experimental Stage25 fork.
