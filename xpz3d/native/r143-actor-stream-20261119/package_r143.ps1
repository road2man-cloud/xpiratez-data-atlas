$ErrorActionPreference='Stop'
$root='D:\daphne_auto\XPZ_R143_ACTOR_STREAM_20261119'
$previous='D:\daphne_auto\XPZ_R137_R136_CUMULATIVE_RESET_20261118\release\R137_RESET_PAIRED_LOCAL_CANDIDATE'
$stage=Join-Path $root 'R143_PAIRED_LOCAL_CANDIDATE'
$ox=Join-Path $root 'oxce\build\openxcom_R143_R142_CUMULATIVE_ACTORS.exe'
$s2=Join-Path $root 's2\Game-r143-actors-XPZ3D-IGScene.exe'
if(-not (Test-Path -LiteralPath $ox) -or -not (Test-Path -LiteralPath $s2)){throw 'R143_BUILD_OUTPUT_MISSING'}
$shaOx=(Get-FileHash -LiteralPath $ox -Algorithm SHA256).Hash
$shaS2=(Get-FileHash -LiteralPath $s2 -Algorithm SHA256).Hash
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$runtime=Join-Path $stage 'oxce-runtime'
if(-not (Test-Path -LiteralPath $runtime)){
 Copy-Item -LiteralPath (Join-Path $previous 'oxce-runtime') -Destination $runtime -Recurse -ErrorAction Stop
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage 's2-native') | Out-Null
Copy-Item -LiteralPath $ox -Destination (Join-Path $runtime 'openxcom.exe') -Force
Copy-Item -LiteralPath $s2 -Destination (Join-Path $stage 's2-native\Game-r143-actors-XPZ3D-IGScene.exe') -Force
$launchPy=Get-Content -LiteralPath (Join-Path $previous 's2-native\run_r137_reset_live_view.py') -Raw
$launchPy=$launchPy.Replace('Game-r137-reset-r136-XPZ3D-IGScene.exe','Game-r143-actors-XPZ3D-IGScene.exe')
[IO.File]::WriteAllText((Join-Path $stage 's2-native\run_r143_actors_live_view.py'),$launchPy,[Text.UTF8Encoding]::new($false))
$launch=Get-Content -LiteralPath (Join-Path $previous 'RUN_R137_RESET_DESKTOP_PAIR.ps1') -Raw
$launch=$launch.Replace('Game-r137-reset-r136-XPZ3D-IGScene.exe','Game-r143-actors-XPZ3D-IGScene.exe')
$launch=$launch.Replace('run_r137_reset_live_view.py','run_r143_actors_live_view.py')
$launch=$launch.Replace('C1AB6A810C55C093F588C7AA3AECD162CAA62E397ED78FE87F9207E005542FA2',$shaOx)
$launch=$launch.Replace('9993637E95AEB2DDC37C2C03496DC6E13BE6E68DB1293EF3FAB8632F435CAC7E',$shaS2)
$launch=$launch.Replace('R137_RESET_LAUNCH_RECEIPT.json','R143_PAIR_LAUNCH_RECEIPT.json')
$launch=$launch.Replace('xpz3d.r137.reset_r136_cumulative_pair/v1','xpz3d.r143.r142_terrain_actor_pair/v1')
$launch=$launch.Replace('R137 reset','R143 actor candidate')
[IO.File]::WriteAllText((Join-Path $stage 'RUN_R143_ACTOR_PAIR.ps1'),$launch,[Text.UTF8Encoding]::new($false))
$receipt=[ordered]@{
 version='R143 ACTOR STREAM'
 oxce_parent='R142 terrain cumulative (R140 HUD, R136 camera)'
 oxce_exe=$ox
 oxce_sha256=$shaOx
 oxce_size=(Get-Item -LiteralPath $ox).Length
 s2_parent='R142 S2 terrain + R136 camera'
 s2_exe=$s2
 s2_sha256=$shaS2
 s2_size=(Get-Item -LiteralPath $s2).Length
 new_oxce_stream='Local\XPZ3D_OXCE_ACTORS_R143'
 actor_snapshot_capacity=128
 stream_rate_hz=12.5
 visibility='player units and currently visible hostile/neutral units only'
 renderer='native S2 Direct3D IGScene directional proxy meshes'
 full_F11_GLB_rig_connected=$false
 actual_MCD_LOFT_geometry=$false
 live_gameplay_verified=$false
 existing_game_and_saves_modified=$false
}
$receipt|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $root 'R143_BUILD_RECEIPT.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $root 'R143_BUILD_RECEIPT.json') -Destination (Join-Path $stage 'R143_BUILD_RECEIPT.json') -Force
$readme=@'
# XPZ3D R143 ACTOR STREAM — isolated native pair
Date: 2026-11-19 KST

## Actual changes
- OXCE R142 cumulative engine: publishes authoritative unit roster at up to 12.5Hz.
- 128-unit snapshot. Includes actual tile position, terrain-adjusted foot height, OXCE unit height, team, facing and kneel state.
- Fog rule: all player units, only currently visible hostile/neutral units; dead/out units omitted.
- R143 S2 native IGScene: draws oriented 3D proxy silhouettes, separates friend/hostile/neutral color, never draws selected first-person unit.
- Existing R136 camera, R142 discovered terrain mesh and R140 minigun/HMS remain in their respective cumulative lineage.

## Running
- Runtime is a local candidate; it relies on the shared r135 installed test data and S2 model fixture paths.
- Use RUN_R143_ACTOR_PAIR.ps1 in an INTERACTIVE Windows desktop, with an isolated save CopySave matching source user/piratez.
- The launcher copies the save into isolated-user; it never edits the original source save.
- Does not launch from a headless Session 0.

## Incomplete
- Native EXEs successfully compiled and linked, but live in-game actor appearance not asserted.
- Actors are directional proxy geometry, not F11 GLB mesh/63-bone rig.
- Floors and walls still use schematic tile geometry, not full MCD/LOFT.
- This is a paired local candidate, not a standalone commercial installer.
- GitHub preservation is separate from this local build.
'@
[IO.File]::WriteAllText((Join-Path $stage 'README_R143_KO.md'),$readme,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $root 'README_R143_KO.md'),$readme,[Text.UTF8Encoding]::new($false))
$pairZip=Join-Path $root 'XPZ3D_R143_ACTOR_PAIRED_LOCAL_CANDIDATE_20261119.zip'
Compress-Archive -LiteralPath (Join-Path $stage 'oxce-runtime'),(Join-Path $stage 's2-native'),(Join-Path $stage 'RUN_R143_ACTOR_PAIR.ps1'),(Join-Path $stage 'README_R143_KO.md'),(Join-Path $stage 'R143_BUILD_RECEIPT.json') -DestinationPath $pairZip -Force
$sourceZip=Join-Path $root 'XPZ3D_R143_ACTOR_SOURCE_EXE_20261119.zip'
Compress-Archive -LiteralPath (Join-Path $root 'oxce'),(Join-Path $root 's2'),(Join-Path $root 'XPZ3DActorWireR143.h'),(Join-Path $root 'XPZ3DOXCEActorProducerR143.h'),(Join-Path $root 'XPZ3DActorGpuR143.h'),(Join-Path $root 'prepare_r143.ps1'),(Join-Path $root 'build_r143.ps1'),(Join-Path $root 'package_r143.ps1'),(Join-Path $root 'README_R143_KO.md'),(Join-Path $root 'R143_BUILD_RECEIPT.json') -DestinationPath $sourceZip -Force
foreach($zip in @($pairZip,$sourceZip)){
 Write-Output ('OUTPUT='+$zip)
 Write-Output ('SIZE='+(Get-Item -LiteralPath $zip).Length)
 Write-Output ('SHA256='+(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash)
}
