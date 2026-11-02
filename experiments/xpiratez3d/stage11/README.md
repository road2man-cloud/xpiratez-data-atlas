# Stage 11 — Actual Silent Storm Windows engine + XPZ visual receiver build (2026-11-02)

**Verified milestone:** A real 32-bit Windows `Game.exe` was compiled and linked from `met-nikita/Silent-Storm-Reconstruction`, then compiled and linked again in an **isolated local source clone** with the existing Stage06 `XPZVisualFeed.cpp/.h` inserted into the genuine Game target and `XPZVisual::PollWin32()` called from the genuine frame loop. The second executable is **not a working X-Piratez 3D battle or even a verified game boot**: no Silent Storm Steam game assets were found on this host and no X-Piratez unit was spawned as a 3D object.

## Source and build provenance

- Nival engine reconstruction: `met-nikita/Silent-Storm-Reconstruction`, `develop` commit **`f5b5b620d4b251d7548b36134ae16d3abe4457e5`**. Clean reference source checkout under `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\Silent-Storm-Reconstruction`.
- Existing X-Piratez Atlas: `experiments/xpiratez3d/stage06/ss/XPZVisualFeed.cpp` and `.h`; **do not copy a second canonical rule database**.
- Isolated local modified source checkout: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\Silent-Storm-XPZVisual`, built independently in `build-xpzvisual-win32`.
- Toolchain: Microsoft VS 2022 Build Tools 17.14, MSVC x86 19.44.35229, Windows SDK 10.0.26100.0, CMake 3.31.10, Release / Win32.
- Actual engine configured with CMake `-G "Visual Studio 17 2022" -A Win32`. Its Game target compiled and linked.
- Original unmodified Game target also compiled and linked. Separate build trees are preserved.
- Actual isolated integrated binary: `D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpzvisual-win32\Release\Game.exe`.
- **Integrated binary:** 6,612,480 bytes, SHA-256 **`4CC906591EB76001DAB5B9CBEF27D8C276080E7BE61182E7103A9FB23CE5B41C`**.
- Microsoft `dumpbin /headers`: `14C machine (x86)`, Windows GUI subsystem. `XPZVisualFeed.obj`: 138,976 bytes, with external MSVC symbols for `Parse`, `PollWin32`, `CurrentScene`.
- Log `xpzvisual-repair-stdout.txt` ends in `Game.vcxproj -> ...\Release\Game.exe`; associated stderr file was empty. Runtime game boot was **not performed**.

## Build incident and repair (retain as regression guidance)

Multiple overlapped CMake/MSBuild invocations initially competed for the **same** integrated build directory. A parallel MSBuild worker exited with `MSB4166`, leaving a 0-byte `Main.dir\Release\aiVoxelRender.obj`; a later linker attempt failed with `LNK1136` on that exact file. All competing build processes were stopped. **Only that verified 0-byte generated object** was removed. An isolated single-job build then completed with `Game.exe` produced. No upstream source file was repaired or claimed faulty. The new reproducibility script defaults to `--parallel 1` and refuses existing source or build destinations to avoid accidental overwrites.

## Files committed in this stage

- `silent-storm-xpzvisual.patch`: the minimal source hook, separate from proprietary Nival source distribution. Applies only when anchors match, via `git apply --check`.
- `build-silent-storm-visual-win32.ps1`: checks pinned source revision and clean state; clones to a **new empty destination**; verifies patch; copies the **existing** visual receiver byte-for-byte; configures Win32 CMake; optionally builds Game. Refuses overwriting/reusing existing directories.
- `test-visual-feed-win32.ps1`: compiles the identical Stage06 parser using actual Microsoft x86 C++ tools and runs one valid and three invalid synthetic test frames; no Steam files or personal saves are read.
- `testdata/synthetic-visual-feed-v2.txt`: synthetic frame with fake unit IDs 21 and 39; **not a real game result**, with header hashes that are format examples rather than authenticated replay provenance.

## Reproduction (PowerShell on a machine with VS2022 + CMake)

From the existing Atlas checkout:

```powershell
$base = 'D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102'
$stage = 'D:\daphne_auto\xpiratez-data-atlas\experiments\xpiratez3d\stage11'
& "$stage\test-visual-feed-win32.ps1" -BuildTools "$base\vs2022-buildtools"
# Use fresh paths only. The script intentionally refuses existing directories.
& "$stage\build-silent-storm-visual-win32.ps1" `
  -SourceCheckout "$base\Silent-Storm-Reconstruction" `
  -DestinationCheckout "$base\Silent-Storm-XPZVisual-NEW" `
  -BuildDirectory "$base\build-xpzvisual-NEW" `
  -CMakeExe "$base\cmake-extract\cmake-3.31.10-windows-x86_64\bin\cmake.exe"
```

The script's `-ConfigureOnly` branch was **actually smoke tested** against a new temporary local clone: patch SHA-256 `8754C95B2FDC2243BA4524D5EFA4F55955D327AFAEB30A48DF8F242ED8267525`, feed file copy hashes verified, CMake Win32 configured successfully. Its full-build branch was not independently rerun, but **equivalent hand-integrated sources were built with the compiler and linker** as evidenced above.

## Parser acceptance

Microsoft x86 C++ compilation of Stage06 `XPZVisualFeed.cpp` + `visual_feed_test.cpp` succeeded. The synthetic smoke test passed **4/4**: accepted valid full frame, rejected invalid header, rejected duplicate unit ID, rejected unclosed frame. All failures correctly returned the negative-test rejection code. These are **standalone parser tests**, not a running Silent Storm game's feed ingestion. Source `XPZ3D_VISUAL_FEED` remains opt-in; it only parses and stores snapshots and writes debug logging. **Nothing moves/appears in the game world yet.**

## Native 3D world-unit creation path (source-verified, not runtime-verified)

The pinned real engine already contains a useful **actual world-object spawning route**, so a separate fake object simulator is unnecessary. The following chain was traced in the checked-out source; it has not yet been exercised in a running Steam scene:

1. `Game/Main.cpp` (lines ~201, 338): `-harness` enables `g_bHarnessLog`. Once per frame, `HarnessPoll()` consumes `_harness_cmd.txt` from the current working directory; a `console <command>` line is passed to `ProcessCommand`.
2. `Main/iMission.cpp` (lines ~158, 3190-3205): `CMission` registers `summonunit`. The handler validates a **native Nival character database ID** through `NDb::GetPers` and runs `GetActivePlayer()->AddUnit(NRPG::CreateMerc(pPers))`. An invalid ID is rejected; it does not invent a model.
3. `Main/PlayerTracker.cpp` (lines ~58-64): `CPlayerTracker::AddUnit` obtains the active player's deployment spot and enqueues `NWorld::CCmdAddUnit`.
4. `Main/wMain.cpp` (lines ~2566-2569 and ~710-722): the real world command dispatcher consumes `CCmdAddUnit`, calls `AddUnitInGame`, and places the game object on a passable tile with position and visibility updates.

A future **engine runtime** smoke can therefore start the game with `-harness` in an **isolated staging copy of legally installed Steam assets**, load a genuine mission, send `console summonunit <valid-native-persona-id>`, and observe actual before/after world-unit counts and a captured scene. This test requires an initialized mission, valid game database/model and working path network. It must **not** be called an X-Piratez unit yet: the next substantial job is a version-pinned X-Piratez acquisition-profile/stats/equipment to Silent Storm native persona/model conversion. The 3D engine remains responsible for subsequent combat results.

## Blocking integration gate: Steam game resources and world objects

The accessible host's Steam manifests (24 files across registered C:, E:, and G: libraries at inspection) did not contain an installed Silent Storm application; adjacent retail `fmod.dll`, `LifeStudioHeadAPI.dll`, `GDPFile.dll`, and `binkw32.dll` were likewise absent from the build output. An owned Steam license alone does not provide runtime files. No working 3D game boot is claimed.

**Next gates:** (1) locally install legally owned Steam edition, without altering original files; (2) launch a separately named integrated binary using an isolated copy/working directory containing permitted game files; verify screenshot/log/camera; (3) map parsed `Scene.units` to actual Silent Storm world entities and coordinates, starting with one test unit, movement and fire; (4) keep OXCE campaign transfer conditional on a validated bidirectional protocol. The previous OXCE-2D combat parity gate remains retired.

**Licensing:** Nival noncommercial/revocable permission and the game asset license need separate review; never commit the original engine's source or Steam assets into this public Atlas.
