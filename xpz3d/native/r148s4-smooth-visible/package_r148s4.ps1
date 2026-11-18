$ErrorActionPreference='Stop'
$root='D:\daphne_auto\XPZ3D_R148S4_NATIVE_SMOOTH_20261119'
$prev='D:\daphne_auto\XPZ_R148_HUD_TERRAIN_F11_20261119\R148S3_PAIRED_LOCAL_CANDIDATE'
$stage=Join-Path $root 'R148S4_PAIRED_LOCAL_CANDIDATE'
$s2root=Join-Path $stage 's2-native'
$s2file=Join-Path $root 's2\Game-r148s4-smooth-XPZ3D-IGScene.exe'
$oxfile=Join-Path $prev 'oxce-runtime\openxcom.exe'
$oldS2='CE8BD1026E194982DFDE217F7679C5A5EDA3594EDD87FC6BEF0C138C65628AEF'
$oxSHA='EE84D0C5A2A727A3D5DFC7E50D0FC3A850A472DC4824208F7474FC8335F54101'
if(!(Test-Path $s2file) -or !(Test-Path $oxfile)){throw 'MISSING_R148S4_INPUT_EXECUTABLE'}
$s2SHA=(Get-FileHash $s2file -Algorithm SHA256).Hash
if($s2SHA -eq $oldS2 -or (Get-FileHash $oxfile -Algorithm SHA256).Hash -ne $oxSHA){throw 'PARENT_HASH_MISMATCH'}
New-Item -ItemType Directory -Force -Path $stage,(Join-Path $s2root 'assets')|Out-Null
if(!(Test-Path (Join-Path $stage 'oxce-runtime'))){
 Copy-Item -LiteralPath (Join-Path $prev 'oxce-runtime') -Destination (Join-Path $stage 'oxce-runtime') -Recurse
}
Copy-Item $oxfile (Join-Path $stage 'oxce-runtime\openxcom.exe') -Force
Copy-Item $s2file (Join-Path $s2root 'Game-r148s4-smooth-XPZ3D-IGScene.exe') -Force
foreach($n in @('f11_r34q.skin','f11_r34x.skin','f11_r34q.manifest.json','f11_r34x.manifest.json')){
 Copy-Item -LiteralPath (Join-Path $root ('s2\assets\'+$n)) -Destination (Join-Path $s2root ('assets\'+$n)) -Force
}
$py=Get-Content -LiteralPath (Join-Path $prev 's2-native\run_r147_skin_live_view.py') -Raw
$py=$py.Replace('Game-r147-skin-XPZ3D-IGScene.exe','Game-r148s4-smooth-XPZ3D-IGScene.exe')
$py=$py.Replace($oldS2.ToLowerInvariant(),$s2SHA.ToLowerInvariant())
foreach($pair in @(
 @('R137_RESET_S2_START_SUCCESS.json','R148S4_S2_START_SUCCESS.json'),
 @('R137_RESET_live_view_start_error.txt','R148S4_S2_START_ERROR.txt'),
 @('R137_RESET_S2_CHILD_STDOUT.log','R148S4_S2_CHILD_STDOUT.log'),
 @('R137_RESET_S2_CHILD_STDERR.log','R148S4_S2_CHILD_STDERR.log'),
 @('R137_RESET_S2_RENDER_FRAME.log','R148S4_S2_RENDER_FRAME.log'),
 @('R137_RESET_CAMERA_APPLIED.log','R148S4_CAMERA_APPLIED.log')
)){$py=$py.Replace($pair[0],$pair[1])}
if(!$py.Contains($s2SHA.ToLowerInvariant())){throw 'S2_LAUNCHER_SHA_NOT_PATCHED'}
[IO.File]::WriteAllText((Join-Path $s2root 'run_r148s4_smooth_live_view.py'),$py,[Text.UTF8Encoding]::new($false))
$view=Get-Content -LiteralPath (Join-Path $prev 'SHOW_XPZ3D_VIEW_ONLY.ps1') -Raw
$view=$view.Replace('Game-r147-skin-XPZ3D-IGScene.exe','Game-r148s4-smooth-XPZ3D-IGScene.exe')
$view=$view.Replace('R148S3_VIEWFIX_RECEIPT.json','R148S4_VIEWFIX_RECEIPT.json')
$view=$view.Replace('xpz3d.r148s3.viewfix.sealed_mouse_window/v1','xpz3d.r148s4.viewfix.sealed_mouse_window/v1')
$anchor="if("+ '$handle' + " -eq [IntPtr]::Zero){throw 'VIEWFIX_S2_CREATED_NO_TOP_LEVEL_RENDER_WINDOW'}"
$replacement=@'
for($attempt=0;$handle -eq [IntPtr]::Zero -and $attempt -lt 32;++$attempt){
 Start-Sleep -Milliseconds 250
 $handle=[XPZ3DViewOnlyWindow]::FindWindowForPid([uint32]$target)
}
if($handle -eq [IntPtr]::Zero){throw 'VIEWFIX_S2_CREATED_NO_TOP_LEVEL_RENDER_WINDOW'}
'@
if(!$view.Contains($anchor)){throw 'VIEWFIX_NO_WINDOW_RETRY_ANCHOR'}
$view=$view.Replace($anchor,$replacement.Trim())
[IO.File]::WriteAllText((Join-Path $stage 'SHOW_XPZ3D_VIEW_ONLY.ps1'),$view,[Text.UTF8Encoding]::new($false))
$launch=Get-Content -LiteralPath (Join-Path $prev 'RUN_R148S3_3D_PAIR.ps1') -Raw
$launch=$launch.Replace('Game-r147-skin-XPZ3D-IGScene.exe','Game-r148s4-smooth-XPZ3D-IGScene.exe')
$launch=$launch.Replace('run_r147_skin_live_view.py','run_r148s4_smooth_live_view.py')
$launch=$launch.Replace($oldS2,$s2SHA)
$launch=$launch.Replace('R148S3_PAIR_LAUNCH_RECEIPT.json','R148S4_PAIR_LAUNCH_RECEIPT.json')
$launch=$launch.Replace('r148s3.fullpatch_f11_skin_terrain_pair','r148s4.fullpatch_f11_skin_smooth_pair')
# Preserve the existing viewer, instead of allowing simultaneous S2 to fight
# over the global Direct3D fixture runtime or Windows cursor.
$anchor='$matchS2=Get-CimInstance Win32_Process'
$guard=@'
$otherS2=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
 Where-Object { $_.SessionId -eq $session -and
                $_.Name -like 'Game-*-XPZ3D-IGScene.exe' -and
                $_.ExecutablePath -ne $s2Exe })
if($otherS2.Count -gt 0){
 throw 'R148S4_ANOTHER_S2_ALREADY_RUNNING_CLOSE_OLD_VIEWER_FIRST'
}
'@
if(!$launch.Contains($anchor)){throw 'LAUNCHER_S2_GUARD_ANCHOR'}
$launch=$launch.Replace($anchor,$guard.Trim()+[Environment]::NewLine+$anchor)
if(!$launch.Contains($s2SHA) -or !$launch.Contains('run_r148s4_smooth_live_view.py')){throw 'R148S4_LAUNCHER_PATCH_MISSING'}
[IO.File]::WriteAllText((Join-Path $stage 'RUN_R148S4_3D_PAIR.ps1'),$launch,[Text.UTF8Encoding]::new($false))
$cmdGame=@'
@echo off
setlocal
title XPZ3D R148S4: X-Piratez plus visible 3D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_R148S4_3D_PAIR.ps1" -Mode paired -CopySave "8______.sav"
if errorlevel 1 (echo XPZ3D failed. Review output. & pause & exit /b 1)
echo XPZ3D paired 3D viewport requested. & pause
endlocal
'@
$cmdView=@'
@echo off
setlocal
title XPZ3D R148S4: 3D window only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_R148S4_3D_PAIR.ps1" -Mode s2
if errorlevel 1 (echo XPZ3D failed. Review output. & pause & exit /b 1)
echo XPZ3D 3D viewport requested. & pause
endlocal
'@
$cmdShow=@'
@echo off
setlocal
title XPZ3D R148S4: show safe 3D window
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SHOW_XPZ3D_VIEW_ONLY.ps1"
if errorlevel 1 (echo No existing mouse-safe S2 window. & pause & exit /b 1)
echo Native 3D window revealed. & pause
endlocal
'@
[IO.File]::WriteAllText((Join-Path $stage 'START_XPZ3D_R148S4_GAME_AND_3D.cmd'),$cmdGame,[Text.Encoding]::ASCII)
[IO.File]::WriteAllText((Join-Path $stage 'START_XPZ3D_R148S4_3D_ONLY.cmd'),$cmdView,[Text.Encoding]::ASCII)
[IO.File]::WriteAllText((Join-Path $stage 'SHOW_XPZ3D_R148S4_WINDOW.cmd'),$cmdShow,[Text.Encoding]::ASCII)
$receipt=[ordered]@{
 schema='xpz3d.r148s4.smooth_visible_pair/v1'
 oxce='R148S3 cumulative allpatch, unchanged'
 oxce_sha256=$oxSHA
 s2='R148S4 F11 63-bone skinned native IGScene'
 s2_sha256=$s2SHA
 s2_size=(Get-Item $s2file).Length
 position_interpolation_ms=190
 facing_interpolation_ms=150
 mesh_refresh_min_ms=55
 mouse_protection='R23R input seal retained; viewfix SW_SHOWNOACTIVATE only'
 live_gameplay_verified=$false
 previous_exe_and_saves_preserved=$true
}
$receipt|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'R148S4_BUILD_RECEIPT.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $root 'R148S4_BUILD_RECEIPT.json') -Destination (Join-Path $stage 'R148S4_BUILD_RECEIPT.json') -Force
$readme=@'
XPZ3D R148S4 F11 SMOOTH + VISIBLE VIEWFIX
2026-11-19

R148S4 modifies the actual native S2 3D renderer:
- Original R147 F11 63 bone weighted CPU skinning is preserved.
- 190ms smoothstep interpolation of OXCE actor tile positions.
- 150ms shortest-path 8-way facing rotation interpolation.
- Large teleports or cross-level jumps snap to their actual position.
- Up to ~18Hz mesh refresh while moving; no idle mesh uploads.
- Original R148S3 cumulative allpatch OXCE untouched.

For interactive Windows desktop use:
1. START_XPZ3D_R148S4_GAME_AND_3D.cmd - isolated OXCE and S2 simultaneously
2. START_XPZ3D_R148S4_3D_ONLY.cmd - attach native S2 to already active R148S3
3. SHOW_XPZ3D_R148S4_WINDOW.cmd - reveal an existing hidden S2 (no input focus)

No mouse, keyboard or OS cursor injection. Sealed passive S2 startup is kept.
The safe window script now waits up to 8s for the hidden render HWND.
S2 and OXCE still run as two windows; direct in-game 3D toggle is not done.
This is a local native paired candidate, not a standalone game installer.
Live 3D scene successful display is NOT claimed from compilation alone.
Old EXEs, project source GLBs and official saves remain untouched.
'@
[IO.File]::WriteAllText((Join-Path $stage 'README_R148S4_KO.md'),$readme,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $root 'README_R148S4_KO.md'),$readme,[Text.UTF8Encoding]::new($false))
$zip=Join-Path $root 'XPZ3D_R148S4_SMOOTH_VISIBLE_PAIRED_20261119.zip'
$srcZip=Join-Path $root 'XPZ3D_R148S4_SMOOTH_SOURCE_EXE_20261119.zip'
$inputs=@((Join-Path $stage 'oxce-runtime'),(Join-Path $stage 's2-native'))
$inputs+=@('RUN_R148S4_3D_PAIR.ps1','SHOW_XPZ3D_VIEW_ONLY.ps1','START_XPZ3D_R148S4_GAME_AND_3D.cmd','START_XPZ3D_R148S4_3D_ONLY.cmd','SHOW_XPZ3D_R148S4_WINDOW.cmd','README_R148S4_KO.md','R148S4_BUILD_RECEIPT.json')|ForEach-Object{Join-Path $stage $_}
Compress-Archive -LiteralPath $inputs -DestinationPath $zip -Force -ErrorAction Stop
$sourceInputs=@('XPZ3DF11SkinR147.h','iMissionBase-r136.cpp','XPZ3DActorGpuR143.h','XPZ3DActorWireR143.h','build_r148s4_s2.py','Game-r148s4-smooth-XPZ3D-IGScene.exe')|ForEach-Object{Join-Path (Join-Path $root 's2') $_}
$sourceInputs+=@('prepare_r148s4.ps1','package_r148s4.ps1','R148S4_BUILD_RECEIPT.json','README_R148S4_KO.md')|ForEach-Object{Join-Path $root $_}
Compress-Archive -LiteralPath $sourceInputs -DestinationPath $srcZip -Force -ErrorAction Stop
foreach($f in @($zip,$srcZip)){
 Write-Output ('R148S4_PACKAGE='+$f)
 Write-Output ('SIZE='+(Get-Item -LiteralPath $f).Length)
 Write-Output ('SHA256='+(Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash)
}
