# Start the original Nival Silent Storm S2 engine with the R36HW N5 static packet.
# This script only works from an interactive Windows desktop session.
# Deliberately does not modify original engine source, .sav, .db or original Game.exe.
[CmdletBinding()]
param(
    [switch]$Launch,
    [ValidateSet('0','1','2','3')][string]$CameraPreset='3'
)
$ErrorActionPreference='Stop'
$base='D:\daphne_auto\_xpz3d_launch_integration_20261117'
$stage=Join-Path $base 'r138j-hw-n4-native-20261128'
$root='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102'
$exe=Join-Path $stage 'Game-r138j-native-R36HW-N4.exe'
$packet=Join-Path $stage 'R36HW_N5_STATIC_XPZC.bin'
$runtime=Join-Path $root 'stage35-r23p-live-private-runtime-20261107\runtime'
$act=Join-Path $root 'stage36-r24ac-mission-flip-capture-20261110\R24AC_ACTIVATION_REAL_GAME_CAPTURE.json'
$bm=Join-Path $root 'stage36-r24bm-native-loft-collision-20261110'
$source=Join-Path $root 'stage35-r23n-f11-small-save-20261107\scene\source-snapshot.sav'
$state=Join-Path $bm 'r24bm-original-intact.s2state'
$manifest=Join-Path $bm 'R24BM_NATIVE_SOURCE_LOFT_COLLISION_MANIFEST.json'
$expectedPacket='ef2f059134920c694d030621d1dba8d1c8bae7a92fe19a6361d150d8a5fcd64b'
$expectedExe='0c5be39e30351fcca3823748f649c5b5797c73ccdd1a874d46cc958cc31a75b2'
foreach($p in @($exe,$packet,$runtime,$act,$bm,$state,$source,$manifest)){if(-not(Test-Path -LiteralPath $p)){throw "Native S2 dependency not present: $p"}}
function Hash([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
if((Hash $exe) -ne $expectedExe){throw 'R138J isolated native EXE hash mismatch'}
if((Hash $packet) -ne $expectedPacket){throw 'R138K N5 native packet hash mismatch'}
$bytes=[IO.File]::ReadAllBytes($packet)
if($bytes.Length -le 32 -or [Text.Encoding]::ASCII.GetString($bytes,0,4) -ne 'XPZC' -or [BitConverter]::ToUInt32($bytes,8) -ne 10 -or [BitConverter]::ToUInt32($bytes,12) -ne 2080){throw 'N5 native 2080 triangle packet invalid'}
$cfg=Get-Content -LiteralPath $act -Raw -Encoding UTF8|ConvertFrom-Json
$col=Get-Content -LiteralPath $manifest -Raw -Encoding UTF8|ConvertFrom-Json
$collision=Join-Path $bm $col.variants.intact.file
if(-not(Test-Path -LiteralPath $collision)){throw "Source LOFT collision missing: $collision"}
$session=[Diagnostics.Process]::GetCurrentProcess().SessionId
$receipt=[ordered]@{
  schema='xpz3d.r138k.launch_preflight/v1'
  utc=[DateTime]::UtcNow.ToString('o')
  exe=$exe
  exeSha256=$expectedExe
  packet=$packet
  packetSha256=$expectedPacket
  triangles=2080
  materialMode='static native CMemObject; GLB UV/normal textures not in this packet'
  desktopSession=$session
  interactive=$session -ne 0
  originalS2FilesUntouched=$true
  nativeProcessStarted=$false
  realS2FrameObserved=$false
}
$receiptPath=Join-Path $stage 'R138K_NATIVE_LAUNCH_RECEIPT.json'
if(-not $Launch){
 $receipt|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $receiptPath -Encoding UTF8
 Write-Output ($receipt|ConvertTo-Json -Compress)
 return
}
if($session -eq 0){throw 'Cannot start a genuine visible S2 window in Session 0. Run this launcher in the logged-in interactive desktop session.'}
$psi=New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName=$exe
$psi.WorkingDirectory=$runtime
$psi.Arguments='-windowed -nosound -640 -harness -cfg stage35-r23p-map1.cfg'
$psi.UseShellExecute=$false
$psi.CreateNoWindow=$false
foreach($prop in $cfg.environment.PSObject.Properties){$psi.EnvironmentVariables[$prop.Name]=[string]$prop.Value}
$overrides=@{
 'XPZ3D_STAGE35_R23Z_STATE_PATH'=$state
 'XPZ3D_STAGE35_R23Z_OBSERVED_SAVE_PATH'=$source
 'XPZ3D_STAGE36_R24DT_RENDER_PREVIEW_ONLY'='0'
 'XPZ3D_STAGE36_R24DY_LIVE_SOURCE_ACTORS'='1'
 'XPZ3D_STAGE36_R24DW_EARLY_FRAME_CAPTURE'='0'
 'XPZ3D_STAGE36_R24DX_SOURCE_SCENE_PRESENT'='1'
 'XPZ3D_STAGE36_R24AV_NATIVE_UNIT_BRIDGE'='1'
 'XPZ3D_STAGE36_R24AV_MAX_UNITS'='11'
 'XPZ3D_STAGE36_R24AV_IMPORT_ENEMIES'='0'
 'XPZ3D_STAGE36_R24AV_NATIVE_SEAMS'='1'
 'XPZ3D_STAGE36_R24AW_BATCH_MOVE'='1'
 'XPZ3D_STAGE36_R24AW_ISSUE_NATIVE_MOVE'='0'
 'XPZ3D_STAGE36_R24AL_VISUAL_ONLY_NO_UNIT_DEPLOY'='0'
 'XPZ3D_STAGE36_R24AO_LARGE_NATIVE_S2_VB'='1'
 'XPZ3D_STAGE36_R24AP_REAL_S2_CAMERA_CENTER'='1'
 'XPZ3D_STAGE36_R24AP_CAMERA_PRESET'=$CameraPreset
 'XPZ3D_STAGE36_R24AS_LEVEL_RAISED_GROUND'='1'
 'XPZ3D_STAGE36_R24AS_PCK_ALPHA_GUTTER'='1'
 'XPZ3D_STAGE36_R24AT_CONTINUOUS_ORIGINAL_GROUND'='1'
 'XPZ3D_STAGE36_R24AU_SOURCE_PCK_STEEL'='1'
 'XPZ3D_STAGE36_R24AK_VISUAL_ONLY_SOURCE98_FALLBACK'='1'
 'XPZ3D_STAGE36_R24S_ENABLE'='0'
 'XPZ3D_STAGE36_R24S_FEATHER_ENABLE'='0'
 'XPZ3D_STAGE36_R24BK_SOURCE_MCD_BRIDGE'='1'
 'XPZ3D_STAGE36_R24BL_DIE_VARIANTS'='1'
 'XPZ3D_STAGE36_R24BM_REAL_LOFT_COLLISION'='1'
 'XPZ3D_STAGE36_R24BM_CURRENT_SAVE_SHA'=(Hash $source)
 'XPZ3D_STAGE36_R24BM_COLLISION_SNAPSHOT_FROZEN'='1'
 'XPZ3D_STAGE36_R24BM_DIRTY_PATCH_ENABLE'='0'
 'XPZ3D_STAGE36_R24BN_LIVE_HOT_SWAP'='1'
 'XPZ3D_STAGE36_R24BN_LIVE_DIRTY_PATCH'='1'
 'XPZ3D_STAGE36_R24BN_NATIVE_HOT_SWAP'='1'
 'XPZ3D_STAGE25_NATIVE_MAP'='1'
 'XPZ3D_STAGE26_MESH_PATH'=$collision
 'XPZ3D_STAGE26_COLLISION_PATH'=$collision
 'XPZ3D_STAGE35_R23L_SPLIT_HULLS'='0'
 'XPZ3D_STAGE35_R23L_SURFACE_VISION'='1'
 'XPZ3D_STAGE35_R23N_FAST_WELD'='1'
 'XPZ3D_STAGE31_NAV_PROFILE'='1'
 'XPZ3D_STAGE31_CACHE_IMPORT_PRECALC'='1'
 'XPZ3D_STAGE35_R23R_INPUT_SEAL'='1'
 'XPZ3D_STAGE35_R23P_HEADLESS_PASSIVE'='1'
 'XPZ3D_STAGE36_R24AC_CAPTURE_ONCE'='0'
 'XPZ3D_PASSIVE_HARNESS'='1'
 'XPZ3D_WINDOWED_SMOKE'='1'
 'XPZ3D_FREE_MOUSE'='1'
 'XPZ3D_COARSE_NAV_GRID'='1'
 'XPZ3D_HARNESS_SESSION'='R138K_N5_STATIC_SOURCE_SAFE'
 'XPZ3D_R138E_PREVIEW_CHARACTER'='1'
 'XPZ3D_R138E_CHARACTER_MESH_PATH'=$packet
 'XPZ3D_R138E_CHARACTER_TRACE'=(Join-Path $stage 'R138K_CHARACTER_TRACE.log')
 'XPZ3D_R138_DISABLE_TERRAIN'='0'
 'XPZ3D_OXCE_LIVE_S2_CAMERA'='1'
 'XPZ3D_S2_CAMERA_SMOOTH_MS'='70'
 'XPZ3D_R137_FRAME_TRACE'=(Join-Path $stage 'R138K_S2_RENDER_FRAME.log')
 'PATH'=$runtime+';'+[Environment]::GetEnvironmentVariable('PATH','Process')
}
foreach($k in $overrides.Keys){$psi.EnvironmentVariables[$k]=[string]$overrides[$k]}
$process=[Diagnostics.Process]::Start($psi)
Start-Sleep -Milliseconds 1200
if($process.HasExited){throw "Native S2 failed before visible scene startup; exit $($process.ExitCode)"}
$receipt.nativeProcessStarted=$true
$receipt.pid=$process.Id
$receipt.realS2FrameObserved=$false
$receipt|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $receiptPath -Encoding UTF8
Write-Output ($receipt|ConvertTo-Json -Compress)
