$ErrorActionPreference='Stop'
$root='D:\daphne_auto\XPZ_R147_F11_SKINNING_20261119'
$parent='D:\daphne_auto\XPZ_R144_F11_ACTOR_MESH_20261119'
$runtimeParent=Join-Path $parent 'R144_PAIRED_LOCAL_CANDIDATE'
$oxParent='D:\daphne_auto\XPZ_R143_ACTOR_STREAM_20261119'
$stage=Join-Path $root 'R147_PAIRED_LOCAL_CANDIDATE'
$s2Exe=Join-Path $root 's2\Game-r147-skin-XPZ3D-IGScene.exe'
$oxExe=Join-Path $oxParent 'oxce\build\openxcom_R143_R142_CUMULATIVE_ACTORS.exe'
if(!(Test-Path -LiteralPath $s2Exe) -or !(Test-Path -LiteralPath $oxExe)){throw 'R147_MISSING_NATIVE_EXECUTABLE'}
$hashS2=(Get-FileHash -LiteralPath $s2Exe -Algorithm SHA256).Hash
$hashOx=(Get-FileHash -LiteralPath $oxExe -Algorithm SHA256).Hash
$oldS2='10F5E2A432A7423DE2B1201532D4CB3BF4885DDE08EEFA317FDDA3AE3A01D16F'
$oldOx='C6D76F0F91B99BE507C9E29F353BFA21218C289D93C46FBE74B8D6278EBB657E'
New-Item -ItemType Directory -Force -Path $stage | Out-Null
if(!(Test-Path -LiteralPath (Join-Path $stage 'oxce-runtime'))){
 Copy-Item -LiteralPath (Join-Path $runtimeParent 'oxce-runtime') -Destination (Join-Path $stage 'oxce-runtime') -Recurse -ErrorAction Stop
}
$stageS2=Join-Path $stage 's2-native'
New-Item -ItemType Directory -Force -Path (Join-Path $stageS2 'assets') | Out-Null
Copy-Item -LiteralPath $oxExe -Destination (Join-Path $stage 'oxce-runtime\openxcom.exe') -Force
Copy-Item -LiteralPath $s2Exe -Destination (Join-Path $stageS2 'Game-r147-skin-XPZ3D-IGScene.exe') -Force
foreach($n in @('f11_r34q.skin','f11_r34x.skin','f11_r34q.manifest.json','f11_r34x.manifest.json')){
 $src=Join-Path $root ('assets\'+$n)
 if(!(Test-Path -LiteralPath $src)){throw ('R147_MISSING_SKIN_ASSET '+$n)}
 Copy-Item -LiteralPath $src -Destination (Join-Path $stageS2 ('assets\'+$n))
}
$launcherPy=Get-Content -Raw -LiteralPath (Join-Path $runtimeParent 's2-native\run_r144_f11_live_view.py')
$launcherPy=$launcherPy.Replace('Game-r144-f11-XPZ3D-IGScene.exe','Game-r147-skin-XPZ3D-IGScene.exe')
$launcherPy=$launcherPy.Replace('XPZ3D_R144_F11_MESH','XPZ3D_R147_F11_SKIN')
$launcherPy=$launcherPy.Replace('f11_r34q.mesh','f11_r34q.skin')
$launcherPy=$launcherPy.Replace($oldS2.ToLowerInvariant(),$hashS2.ToLowerInvariant())
if(!$launcherPy.Contains('XPZ3D_R147_F11_SKIN') -or !$launcherPy.Contains($hashS2.ToLowerInvariant())){throw 'R147_PY_LAUNCHER_PATCH_FAILED'}
[IO.File]::WriteAllText((Join-Path $stageS2 'run_r147_skin_live_view.py'),$launcherPy,[Text.UTF8Encoding]::new($false))
$launcher=Get-Content -Raw -LiteralPath (Join-Path $runtimeParent 'RUN_R144_F11_PAIR.ps1')
$launcher=$launcher.Replace('Game-r144-f11-XPZ3D-IGScene.exe','Game-r147-skin-XPZ3D-IGScene.exe')
$launcher=$launcher.Replace('run_r144_f11_live_view.py','run_r147_skin_live_view.py')
$launcher=$launcher.Replace('XPZ3D_R144_F11_MESH','XPZ3D_R147_F11_SKIN')
$launcher=$launcher.Replace('f11_r34q.mesh','f11_r34q.skin')
$launcher=$launcher.Replace($oldS2,$hashS2).Replace($oldOx,$hashOx)
$launcher=$launcher.Replace('R144_PAIR_LAUNCH_RECEIPT.json','R147_PAIR_LAUNCH_RECEIPT.json')
$launcher=$launcher.Replace('r144.f11_static_mesh_pair','r147.f11_skin_animation_pair')
$launcher=$launcher.Replace('R144 F11 mesh candidate','R147 F11 skinned candidate')
$launcher=$launcher.Replace('R144_F11_NATIVE_ASSET_MISSING','R147_F11_NATIVE_ASSET_MISSING')
if(!$launcher.Contains($hashS2) -or !$launcher.Contains('XPZ3D_R147_F11_SKIN')){throw 'R147_PAIR_LAUNCHER_PATCH_FAILED'}
[IO.File]::WriteAllText((Join-Path $stage 'RUN_R147_F11_SKIN_PAIR.ps1'),$launcher,[Text.UTF8Encoding]::new($false))
$readme=@'
# XPZ3D R147 F11 63-BONE LIVE SKINNING / 2026-11-19

## Production delivered
- New native S2 executable compiling original F11 GLB 63-bone, float4-weight CPU skinning into S2 IGScene triangle meshes.
- R144 static bind-pose upgraded to a procedurally joint-bent stance based on the REAL OXCE kneeled flag.
- Motion from actual OXCE tile changes initiates a short gait cycle; animated GPU rebuild rate bounded to 120ms.
- Three nearest eligible allied actors to the currently selected camera actor have F11 GLB geometry; other actors keep R143 proxies. Selected first-person actor is excluded from camera occlusion.
- R144 legacy native assets and EXE untouched. Original F11 GLB untouched.
- Default R34Q skin 6218 triangles, experimental R34X skin 6842 triangles. 63 glTF joints and original inverseBindMatrices are carried in BOTH formats. No decimation.

## Running (interactive Windows only)
RUN_R147_F11_SKIN_PAIR.ps1 is an isolated local paired candidate.
For R34X: set process environment XPZ3D_R147_F11_SKIN to full s2-native\assets\f11_r34x.skin.
Default is r34q. Do not run in Session 0. The run launcher creates isolated-user and copies the selected .sav; it does not alter original installed saves.
The S2 runtime still depends on already installed local XPZ3D Direct3D/S2 fixtures.

## Known constraints (not complete)
- This is real CPU skinning with 63 original glTF joints, and procedural animation of selected thigh/leg/arm joints. It is NOT imported authored game motion or full 63-bone animation clip playback.
- No original GLB UV textures/shader material fidelity, morph targets or LOD animation.
- OXCE executable here is R143 cumulative (R140 HUD + R142 terrain). Concurrent R145/R146 HUD recovery lines are NOT silently merged.
- Actual MCD/LOFT 3D geometry remains schematic.
- Native compile/link success does NOT establish live gameplay successful frame rendering.
- Existing original game, previous EXEs, source GLB and saves preserved.
'@
[IO.File]::WriteAllText((Join-Path $root 'README_R147_KO.md'),$readme,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $stage 'README_R147_KO.md'),$readme,[Text.UTF8Encoding]::new($false))
$rec=[ordered]@{
 schema='xpz3d.r147.f11_native_skin_weighted/v1'
 version='R147'
 build_date='2026-11-19'
 oxce_parent='R143 cumulative; R145/R146 separate development lines not merged'
 oxce_exe=$oxExe;oxce_sha256=$hashOx;oxce_size=(Get-Item -LiteralPath $oxExe).Length
 s2_exe=$s2Exe;s2_sha256=$hashS2;s2_size=(Get-Item -LiteralPath $s2Exe).Length
 skin_native_r34q=(Join-Path $root 'assets\f11_r34q.skin')
 skin_native_r34x=(Join-Path $root 'assets\f11_r34x.skin')
 skin_r34q_sha256=(Get-FileHash -LiteralPath (Join-Path $root 'assets\f11_r34q.skin') -Algorithm SHA256).Hash
 skin_r34x_sha256=(Get-FileHash -LiteralPath (Join-Path $root 'assets\f11_r34x.skin') -Algorithm SHA256).Hash
 bone_count=63;max_influences_per_vertex=4
 triangles_r34q=6218;triangles_r34x=6842
 max_active_f11_actors=3
 animation='procedural OXCE movement/stance; glTF 63-joint matrices and weights'
 actual_glTF_animation_clips_imported=$false
 actual_gameplay_verified=$false
 original_sources_and_saves_overwritten=$false
}
$rec|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $root 'R147_BUILD_RECEIPT.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $root 'R147_BUILD_RECEIPT.json') -Destination (Join-Path $stage 'R147_BUILD_RECEIPT.json') -Force
$runtimeZip=Join-Path $root 'XPZ3D_R147_F11_SKIN_PAIRED_LOCAL_20261119.zip'
Compress-Archive -LiteralPath (Join-Path $stage 'oxce-runtime'),(Join-Path $stage 's2-native'),(Join-Path $stage 'RUN_R147_F11_SKIN_PAIR.ps1'),(Join-Path $stage 'README_R147_KO.md'),(Join-Path $stage 'R147_BUILD_RECEIPT.json') -DestinationPath $runtimeZip -Force
$sourceZip=Join-Path $root 'XPZ3D_R147_F11_SKIN_SOURCE_EXE_20261119.zip'
Compress-Archive -LiteralPath (Join-Path $root 's2'),(Join-Path $root 'assets'),(Join-Path $root 'XPZ3DF11SkinR147.h'),(Join-Path $root 'build_skin_asset_r147.py'),(Join-Path $root 'build_f11_native_mesh_r144.py'),(Join-Path $root 'check_bind_pose_r147.py'),(Join-Path $root 'inspect_rig_r147.py'),(Join-Path $root 'package_r147.ps1'),(Join-Path $root 'README_R147_KO.md'),(Join-Path $root 'R147_BUILD_RECEIPT.json') -DestinationPath $sourceZip -Force
foreach($zip in @($runtimeZip,$sourceZip)){
 Write-Output ('OUTPUT='+$zip)
 Write-Output ('SIZE='+(Get-Item -LiteralPath $zip).Length)
 Write-Output ('SHA256='+(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash)
}
