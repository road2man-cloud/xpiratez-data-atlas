# X-Piratez 3D Battlescape — Stage 24: real campaign-to-native-scene bridge

Date: 2026-11-02 (KST). **Goal: keep OXCE geoscape/base/research/campaign state, optionally enter an independent Silent Storm 3D tactical scene.** Stop re-verifying native Silent Storm movement/pathfinding/AP; those are existing engine features.

## Delivered as working local code

1. **Actual OXCE battle roster exporter**: `bridge.mjs export --save <absolute>.sav --out <absolute>.json` reads a native multi-document OXCE 8.7.1 `.sav` from an already generated tactical battle. It retains original source bytes, hashes them, parses a private sanitized text copy (OXCE may include literal C0 status tokens in UI strings), and writes a battle ID + mission + units + item ownership. No changes to source saves.
2. **Real GOG native world actor import**: `windows-3d-roster-preview.ps1 -Battle <battle-start.json> [-LeaveOpen]` launches the actual x86 Silent Storm game in an isolated GOG test directory and creates a new world actor per eligible friendly X-Piratez unit. Each created actor is mapped to its original unit ID, name, armor rule, native stats and item IDs in `roster-import.json`. `-LeaveOpen` permits interactive examination. The **model is temporary Nival prototype 730**; no claimed conversion of models, items, abilities or positioning yet.
3. **One-step local launcher**: `start-from-save.ps1 [-Save file.sav] [-LeaveOpen]` does both operations, archiving any temporary OXCE `_xpz3d_bridge_*.sav` in the isolated bridge directory after successful export.
4. **OXCE source seam**: `oxce-briefing-preview.patch` adds an opt-in `3D Preview` button to `BriefingState`. The Win32 button appears only with `XPZ3D_BRIDGE_LAUNCHER` environment variable, snapshots the currently generated full OXCE battle via `SavedGame::save`, and invokes the PowerShell bridge without touching the original `OK`/2D path. It is an **optional preview**, not a real 2D replacement yet.
5. **Result shape reserved**: `bridge.mjs validate` accepts a v1 result only when every original actor and original inventory ID is accounted for, hashes match and statuses have sensible values. It outputs a *structural validation receipt only*. No campaign result writer is included, no fabricated mission outcome, and no invented 3D map parity.

## Native evidence, without mock results

Source save (user's local X-Piratez campaign; never committed):

`C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\user\piratez\4__.sav`

- OXCE version: Extended 8.7.1.
- Mission: `STR_UFO_CRASH_RECOVERY`, turn 3, map 60 × 60 × 7.
- Units: **44** (11 player, 33 hostile), inventory items: **410**.
- SHA-256 original save: `d05dc06ed3c3048fbea17002eb2da41e64a1d1226065ebf11658e4aca71fd1d4`.
- Stable battle ID: `71c6d7292d67a5db8e58c3283b2a1522`.
- Manifest saved only locally at: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage24\battle-start.json`.
- Actual GOG engine run: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage24\import-b242c29cc184ef14c49\`. Engine logged **11/11** `CWorld::AddUnitInGame` completions after the tutorial modals, each mapped to a distinct in-process actor pointer. Local `roster-import.json` receipt says `ROSTER_BRIDGE_PASS`. Process closed; cursor released.
- Real X-Piratez names in the mapping include Satanic Eel, Hestia Plainhill, Gray Gremlin; names and stats are currently in the **receipt**, not yet set on the Nival actors.

OXCE isolated Preview source and build (user game unchanged):

- Isolated OXCE source: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\oxce-stage24-briefing`
- Separate CMake/MinGW Release build: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\oxce-stage24-build\bin\openxcom.exe`; **compile/link PASS**.
- Side-by-side executable: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\OpenXcomEx_XPZ3D_Preview.exe`.
- SHA-256: `A1926A32C583D3D08643B7C1EB54ED2E813C443252F3B7877B5B314B7460106E`.
- Original running `OpenXcomEx_R47_TECHTREE_KILLS.exe` was not overwritten, stopped or modified. This preview was compiled from the **R43/RC87 source snapshot**, so it must not be treated as the current R47 production binary.
- Patch applies cleanly via `git apply --check` to the R43/RC87 source snapshot. Its source edits are not inserted into the production game.

## Local launch points

In `C:\Dioxine_XPiratez_o2.1\XPZ3D_BattleMode\`:

- `Run X-Piratez with 3D Preview.cmd` — launches the independent OXCE preview executable with the button exposed. At a normal mission briefing choose **3D Preview**. The underlying normal 2D `OK` option remains available.
- `Start XPiratez 3D Battle Preview.cmd` — quick standalone 3D preview from latest `user\piratez\*.sav`, or pass the path of another full tactical save.

**Important:** The preview OXCE executable loads the current user profile, but is based on an earlier code snapshot. Do **not overwrite campaign saves from the preview executable**. Use save copies; keep playing campaigns in the normal R47 executable. The new optional button's complete UI mouse-click-to-3D lifecycle has not yet been manually exercised (compile succeeds; the underlying standalone exporter and 3D import succeed separately). No production update.

## Next real integration milestones, not engine-revalidation tasks

- Replace the temporary Nival soldier 730 with actual **X-Piratez unit identity and native-stats projection** (define explicit conversions, ranges, unsupported fields; do not silently truncate).
- Convert battle terrain `mapdatasets` and tile data into a live 3D scene using legal user-supplied assets, reconcile coordinate spaces and spawn points.
- Import **both factions**, weapons, ammo and equipment; wire AI for actual 3D opposition.
- Return structured battle outcomes to OXCE **only after** mapping kills, injuries, loot, mission objectives, stage transitions, and save-bound RNG/campaign consequences; do not fake success or write into saves directly.
- Update the preview UI patch onto current R47 production source in a dedicated feature branch, never overwriting a running executable.
- Respect Nival noncommercial code/asset rights and OXCE GPL. These private local prototype builds and user-owned assets are not redistributed.

These milestones are integration work, not repeat examinations of the native engine's ordinary movement algorithms.
