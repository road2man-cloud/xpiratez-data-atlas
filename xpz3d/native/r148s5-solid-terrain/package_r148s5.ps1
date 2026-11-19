$ErrorActionPreference='Stop'
$root='D:\daphne_auto\XPZ3D_R148S5_SOLID_TERRAIN_20261119'
$prev='D:\daphne_auto\XPZ_R148_HUD_TERRAIN_F11_20261119\R148S3_PAIRED_LOCAL_CANDIDATE'
$stage=Join-Path $root 'R148S5_PAIRED_LOCAL_CANDIDATE'
$s2root=Join-Path $stage 's2-native'
$s2file=Join-Path $root 's2\Game-r148s5-solid-XPZ3D-IGScene.exe'
$oxfile=Join-Path $prev 'oxce-runtime\openxcom.exe'
$oldS2='CE8BD1026E194982DFDE217F7679C5A5EDA3594EDD87FC6BEF0C138C65628AEF'
$oxSHA='EE84D0C5A2A727A3D5DFC7E50D0FC3A850A472DC4824208F7474FC8335F54101'
if(!(Test-Path $s2file) -or !(Test-Path $oxfile)){throw 'MISSING_R148S5_INPUT_EXECUTABLE'}
$s2SHA=(Get-FileHash $s2file -Algorithm SHA256).Hash
if($s2SHA -eq $oldS2 -or (Get-FileHash $oxfile -Algorithm SHA256).Hash -ne $oxSHA){throw 'PARENT_HASH_MISMATCH'}
New-Item -ItemType Directory -Force -Path $stage,(Join-Path $s2root 'assets')|Out-Null
if(!(Test-Path (Join-Path $stage 'oxce-runtime'))){
 Copy-Item -LiteralPath (Join-Path $prev 'oxce-runtime') -Destination (Join-Path $stage 'oxce-runtime') -Recurse
}
Copy-Item $oxfile (Join-Path $stage 'oxce-runtime\openxcom.exe') -Force
Copy-Item $s2file (Join-Path $s2root 'Game-r148s5-solid-XPZ3D-IGScene.exe') -Force
foreach($n in @('f11_r34q.skin','f11_r34x.skin','f11_r34q.manifest.json','f11_r34x.manifest.json')){
 Copy-Item -LiteralPath (Join-Path $root ('s2\assets\'+$n)) -Destination (Join-Path $s2root ('assets\'+$n)) -Force
}
$py=Get-Content -LiteralPath (Join-Path $prev 's2-native\run_r147_skin_live_view.py') -Raw
$py=$py.Replace('Game-r147-skin-XPZ3D-IGScene.exe','Game-r148s5-solid-XPZ3D-IGScene.exe')
$py=$py.Replace($oldS2.ToLowerInvariant(),$s2SHA.ToLowerInvariant())
foreach($pair in @(
 @('R137_RESET_S2_START_SUCCESS.json','R148S5_S2_START_SUCCESS.json'),
 @('R137_RESET_live_view_start_error.txt','R148S5_S2_START_ERROR.txt'),
 @('R137_RESET_S2_CHILD_STDOUT.log','R148S5_S2_CHILD_STDOUT.log'),
 @('R137_RESET_S2_CHILD_STDERR.log','R148S5_S2_CHILD_STDERR.log'),
 @('R137_RESET_S2_RENDER_FRAME.log','R148S5_S2_RENDER_FRAME.log'),
 @('R137_RESET_CAMERA_APPLIED.log','R148S5_CAMERA_APPLIED.log')
)){$py=$py.Replace($pair[0],$pair[1])}
if(!$py.Contains($s2SHA.ToLowerInvariant())){throw 'S2_LAUNCHER_SHA_NOT_PATCHED'}
[IO.File]::WriteAllText((Join-Path $s2root 'run_r148s5_solid_live_view.py'),$py,[Text.UTF8Encoding]::new($false))
$view=Get-Content -LiteralPath (Join-Path $prev 'SHOW_XPZ3D_VIEW_ONLY.ps1') -Raw
$view=$view.Replace('Game-r147-skin-XPZ3D-IGScene.exe','Game-r148s5-solid-XPZ3D-IGScene.exe')
$view=$view.Replace('R148S3_VIEWFIX_RECEIPT.json','R148S5_VIEWFIX_RECEIPT.json')
$view=$view.Replace('xpz3d.r148s3.viewfix.sealed_mouse_window/v1','xpz3d.r148s5.viewfix.sealed_mouse_window/v1')
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
$launch=$launch.Replace('Game-r147-skin-XPZ3D-IGScene.exe','Game-r148s5-solid-XPZ3D-IGScene.exe')
$launch=$launch.Replace('run_r147_skin_live_view.py','run_r148s5_solid_live_view.py')
$launch=$launch.Replace($oldS2,$s2SHA)
$launch=$launch.Replace('R148S3_PAIR_LAUNCH_RECEIPT.json','R148S5_PAIR_LAUNCH_RECEIPT.json')
$launch=$launch.Replace('R148S3 AllPatch F11 skinned candidate','R148S5 Solid Terrain F11 candidate')
$launch=$launch.Replace('R148S3_S2_PROCESS_NOT_STARTED','R148S5_S2_PROCESS_NOT_STARTED')
$launch=$launch.Replace('R148S3_VIEWFIX_SCRIPT_MISSING','R148S5_VIEWFIX_SCRIPT_MISSING')
$launch=$launch.Replace('R148S3_VIEWFIX_FAILED','R148S5_VIEWFIX_FAILED')
$launch=$launch.Replace('r148s3.fullpatch_f11_skin_terrain_pair','r148s5.fullpatch_f11_skin_solid_pair')
# Preserve the existing viewer, instead of allowing simultaneous S2 to fight
# over the global Direct3D fixture runtime or Windows cursor.
$anchor='$matchS2=Get-CimInstance Win32_Process'
$guard=@'
$otherS2=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
 Where-Object { $_.SessionId -eq $session -and
                $_.Name -like 'Game-*-XPZ3D-IGScene.exe' -and
                $_.ExecutablePath -ne $s2Exe })
if($otherS2.Count -gt 0){
 throw 'R148S5_ANOTHER_S2_ALREADY_RUNNING_CLOSE_OLD_VIEWER_FIRST'
}
'@
if(!$launch.Contains($anchor)){throw 'LAUNCHER_S2_GUARD_ANCHOR'}
$launch=$launch.Replace($anchor,$guard.Trim()+[Environment]::NewLine+$anchor)
if(!$launch.Contains($s2SHA) -or !$launch.Contains('run_r148s5_solid_live_view.py')){throw 'R148S5_LAUNCHER_PATCH_MISSING'}
[IO.File]::WriteAllText((Join-Path $stage 'RUN_R148S5_3D_PAIR.ps1'),$launch,[Text.UTF8Encoding]::new($false))
$cmdGame=@'
@echo off
setlocal
title XPZ3D R148S5: X-Piratez plus visible 3D
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_R148S5_3D_PAIR.ps1" -Mode paired -CopySave "8______.sav"
if errorlevel 1 (echo XPZ3D failed. Review output. & pause & exit /b 1)
echo XPZ3D paired 3D viewport requested. & pause
endlocal
'@
$cmdView=@'
@echo off
setlocal
title XPZ3D R148S5: 3D window only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_R148S5_3D_PAIR.ps1" -Mode s2
if errorlevel 1 (echo XPZ3D failed. Review output. & pause & exit /b 1)
echo XPZ3D 3D viewport requested. & pause
endlocal
'@
$cmdShow=@'
@echo off
setlocal
title XPZ3D R148S5: show safe 3D window
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SHOW_XPZ3D_VIEW_ONLY.ps1"
if errorlevel 1 (echo No existing mouse-safe S2 window. & pause & exit /b 1)
echo Native 3D window revealed. & pause
endlocal
'@
[IO.File]::WriteAllText((Join-Path $stage 'START_XPZ3D_R148S5_GAME_AND_3D.cmd'),$cmdGame,[Text.Encoding]::ASCII)
[IO.File]::WriteAllText((Join-Path $stage 'START_XPZ3D_R148S5_3D_ONLY.cmd'),$cmdView,[Text.Encoding]::ASCII)
[IO.File]::WriteAllText((Join-Path $stage 'SHOW_XPZ3D_R148S5_WINDOW.cmd'),$cmdShow,[Text.Encoding]::ASCII)
$rootCmd=@'
@echo off
setlocal
title XPZ3D R148S5 - One click X-Piratez and 3D
call "%~dp0R148S5_PAIRED_LOCAL_CANDIDATE\START_XPZ3D_R148S5_GAME_AND_3D.cmd"
endlocal
'@
[IO.File]::WriteAllText((Join-Path $root 'START_XPZ3D_R148S5_3D.cmd'),$rootCmd,[Text.Encoding]::ASCII)
$receipt=[ordered]@{
 schema='xpz3d.r148s5.solid_visible_pair/v1'
 oxce='R148S3 cumulative allpatch, unchanged'
 oxce_sha256=$oxSHA
 s2='R148S5 F11 63-bone skinned native IGScene'
 s2_sha256=$s2SHA
 s2_size=(Get-Item $s2file).Length
 position_interpolation_ms=190
 facing_interpolation_ms=150
 mesh_refresh_min_ms=55
 terrain_floor='closed thin slabs with thickness'
 terrain_walls='six-faced solid west/north wall segments with open-door suppression'
 terrain_objects='discovered OXCE object cells visualized as deterministic 3D volume proxies'
 geometry_uses_true_LOFT=$false
 mouse_protection='R23R input seal retained; viewfix SW_SHOWNOACTIVATE only'
 live_gameplay_verified=$false
 previous_exe_and_saves_preserved=$true
}
$receipt|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'R148S5_BUILD_RECEIPT.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $root 'R148S5_BUILD_RECEIPT.json') -Destination (Join-Path $stage 'R148S5_BUILD_RECEIPT.json') -Force
$readme=@'
# XPZ3D R148S5 - 입체 전술 지형 + F11 63본 애니메이션
기준일: 2026-11-19

## 실행 방법
1. 이 폴더의 상위 경로에 있는 START_XPZ3D_R148S5_3D.cmd를 더블클릭합니다.
2. 실행 후보 폴더 안에서는 START_XPZ3D_R148S5_GAME_AND_3D.cmd를 사용할 수 있습니다.
3. 기존 R148S3 게임이 이미 실행 중이라면 START_XPZ3D_R148S5_3D_ONLY.cmd를 사용합니다.
4. S2 프로세스는 있지만 창이 없다면 SHOW_XPZ3D_R148S5_WINDOW.cmd를 실행합니다.

주의: 일반 openxcom.exe만 실행하면 기존 2D 화면이 나오는 것이 정상입니다.
3D 렌더러는 아직 별도 S2 창에서 실행됩니다. 테스트용 복제 세이브를 사용하며
원본 게임 설치파일과 사용자 세이브는 덮어쓰지 않습니다.

## R148S5 신규 개발 내용
- 실제 OXCE에서 발견한 바닥을 두께 있는 6면체 슬래브로 변환합니다.
- 서쪽·북쪽 벽을 단순 평면 대신 두께가 있는 입체 메시로 생성합니다.
- 열려 있는 문은 게임의 원본 상태 플래그에 따라 보이지 않도록 합니다.
- 기존에 생략됐던 OBJECT 타일을 독립적인 입체 오브젝트로 표시합니다.
- 바닥·벽·오브젝트를 서로 다른 S2 GPU 메시와 재질로 구분합니다.
- R148S4의 190ms 위치 보간, 150ms 방향 회전, F11 63본 가중치 스키닝을 유지합니다.
- OXCE R148S3 누적 엔진(EXE)은 그대로 사용하며 HUD·전투 판정을 수정하지 않습니다.

## 중요한 한계
오브젝트의 위치·존재·발견 여부와 MCD 번호는 실제 게임 데이터입니다.
하지만 메시의 모양과 높이는 아직 MCD/LOFT 원본에서 복원한 것이 아닌
임시 3D 대체 형상입니다. 따라서 실제 오브젝트 크기, 파괴 형상,
원본 텍스처·재질·시야 가림 판정과 일치한다고 주장하지 않습니다.

기존 R23R 마우스 보호 장치는 유지합니다. 창 표시 스크립트는 이미 실행한
안전 봉인 S2 프로세스를 SW_SHOWNOACTIVATE로 표시할 뿐, 키보드·마우스를
가로채거나 전역 커서 위치를 변경하지 않습니다.

S2의 네이티브 EXE 컴파일·링크 및 ZIP 생성은 완료했습니다. 사용자
데스크톱에서 게임 화면과 실제 3D 렌더가 정상 표시되는지는 별도 확인 사항입니다.
'@
[IO.File]::WriteAllText((Join-Path $stage 'README_R148S5_KO.md'),$readme,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $root 'README_R148S5_KO.md'),$readme,[Text.UTF8Encoding]::new($false))
$zip=Join-Path $root 'XPZ3D_R148S5_SOLID_VISIBLE_PAIRED_20261119.zip'
$srcZip=Join-Path $root 'XPZ3D_R148S5_SOLID_SOURCE_EXE_20261119.zip'
$inputs=@((Join-Path $stage 'oxce-runtime'),(Join-Path $stage 's2-native'))
$inputs+=@('RUN_R148S5_3D_PAIR.ps1','SHOW_XPZ3D_VIEW_ONLY.ps1','START_XPZ3D_R148S5_GAME_AND_3D.cmd','START_XPZ3D_R148S5_3D_ONLY.cmd','SHOW_XPZ3D_R148S5_WINDOW.cmd','README_R148S5_KO.md','R148S5_BUILD_RECEIPT.json')|ForEach-Object{Join-Path $stage $_}
Compress-Archive -LiteralPath $inputs -DestinationPath $zip -Force -ErrorAction Stop
$sourceInputs=@('XPZ3DF11SkinR147.h','iMissionBase-r136.cpp','XPZ3DActorGpuR143.h','XPZ3DActorWireR143.h','XPZ3DTerrainVisualMeshR137.h','XPZ3DTerrainGpuOverlayR137.h','build_r148s5_s2.py','Game-r148s5-solid-XPZ3D-IGScene.exe')|ForEach-Object{Join-Path (Join-Path $root 's2') $_}
$sourceInputs+=@('prepare_r148s5.ps1','package_r148s5.ps1','R148S5_BUILD_RECEIPT.json','README_R148S5_KO.md','START_XPZ3D_R148S5_3D.cmd')|ForEach-Object{Join-Path $root $_}
Compress-Archive -LiteralPath $sourceInputs -DestinationPath $srcZip -Force -ErrorAction Stop
foreach($f in @($zip,$srcZip)){
 Write-Output ('R148S5_PACKAGE='+$f)
 Write-Output ('SIZE='+(Get-Item -LiteralPath $f).Length)
 Write-Output ('SHA256='+(Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash)
}
