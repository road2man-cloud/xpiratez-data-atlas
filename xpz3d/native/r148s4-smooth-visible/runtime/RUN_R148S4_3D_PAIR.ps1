param([ValidateSet('paired','s2')][string]$Mode='paired',[string]$CopySave='8______.sav')
$ErrorActionPreference='Stop'
$stage=Split-Path -Parent $MyInvocation.MyCommand.Path
$session=[System.Diagnostics.Process]::GetCurrentProcess().SessionId
if($session -lt 1){throw "R148S3 AllPatch F11 skinned candidate requires Windows interactive Session 1+, observed $session"}
if($CopySave -notmatch '^[^\\/:*?"<>|]+\.sav$'){throw 'Invalid save filename'}
$py='C:\Users\road4\AppData\Local\Programs\Python\Python311\python.exe'
$oxExe=Join-Path $stage 'oxce-runtime\openxcom.exe'
$s2Exe=Join-Path $stage 's2-native\Game-r148s4-smooth-XPZ3D-IGScene.exe'
$s2Launch=Join-Path $stage 's2-native\run_r148s4_smooth_live_view.py'
$original='D:\daphne_auto\_xpz3d_launch_integration_20261117\r135-battle-camera-20261117\paired-runtime'
$sourceUser=Join-Path $original 'user'
$data=Join-Path $original 'data'
$user=Join-Path $stage 'isolated-user'
$expectedOx='EE84D0C5A2A727A3D5DFC7E50D0FC3A850A472DC4824208F7474FC8335F54101'
$expectedS2='FD3CC01EBA66770768C4EB497A9581D40EA3B15721A09A99D43AB06F5100870E'
if(!(Test-Path $py) -or !(Test-Path $oxExe) -or !(Test-Path $s2Exe) -or !(Test-Path $s2Launch)){throw 'Missing executable or launcher'}
if((Get-FileHash $oxExe -Algorithm SHA256).Hash -ne $expectedOx -or (Get-FileHash $s2Exe -Algorithm SHA256).Hash -ne $expectedS2){throw 'R148S3 AllPatch F11 skinned candidate EXE hash mismatch'}
if($Mode -eq 'paired'){
  $save=Join-Path $sourceUser ('piratez\'+$CopySave)
  if(!(Test-Path $save) -or !(Test-Path (Join-Path $data 'UFO'))){throw 'Missing isolated test save or installed game data'}
  New-Item -ItemType Directory -Force -Path (Join-Path $user 'piratez') | Out-Null
  if(!(Test-Path (Join-Path $user ('piratez\'+$CopySave)))){Copy-Item $save (Join-Path $user ('piratez\'+$CopySave))}
  if(!(Test-Path (Join-Path $user 'options.cfg')) -and (Test-Path (Join-Path $sourceUser 'options.cfg'))){Copy-Item (Join-Path $sourceUser 'options.cfg') $user}
  if(!(Test-Path (Join-Path $user 'mods'))){New-Item -ItemType Junction -Path (Join-Path $user 'mods') -Target (Join-Path $sourceUser 'mods') | Out-Null}
}
$env:XPZ3D_R136_ALLOW_SESSION0_DIAGNOSTIC='0'
$env:XPZ3D_S2_CAMERA_SMOOTH_MS='70'
if(-not $env:XPZ3D_R147_F11_SKIN){
  $env:XPZ3D_R147_F11_SKIN=Join-Path $stage 's2-native\assets\f11_r34q.skin'
}
if(-not (Test-Path -LiteralPath $env:XPZ3D_R147_F11_SKIN)){
  throw 'R147_F11_NATIVE_ASSET_MISSING'
}
$otherS2=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
 Where-Object { $_.SessionId -eq $session -and
                $_.Name -like 'Game-*-XPZ3D-IGScene.exe' -and
                $_.ExecutablePath -ne $s2Exe })
if($otherS2.Count -gt 0){
 throw 'R148S4_ANOTHER_S2_ALREADY_RUNNING_CLOSE_OLD_VIEWER_FIRST'
}
$matchS2=Get-CimInstance Win32_Process -Filter "name='Game-r148s4-smooth-XPZ3D-IGScene.exe'" -ErrorAction SilentlyContinue | Where-Object {$_.SessionId -eq $session -and $_.ExecutablePath -eq $s2Exe}
if(@($matchS2).Count -gt 1){throw 'Ambiguous S2 processes'}
$s2Pid=$null
if($matchS2){$s2Pid=@($matchS2)[0].ProcessId}
else {
  Start-Process -FilePath $py -ArgumentList ('"'+$s2Launch+'"') -WorkingDirectory (Join-Path $stage 's2-native') -WindowStyle Hidden | Out-Null
  for($i=0;$i -lt 24 -and !$s2Pid;$i++){
    Start-Sleep -Milliseconds 500
    $found=Get-CimInstance Win32_Process -Filter "name='Game-r148s4-smooth-XPZ3D-IGScene.exe'" -ErrorAction SilentlyContinue | Where-Object {$_.SessionId -eq $session -and $_.ExecutablePath -eq $s2Exe}
    if($found){$s2Pid=@($found)[0].ProcessId}
  }
}
$oxPid=$null
if($Mode -eq 'paired' -and $s2Pid){
  $existing=Get-CimInstance Win32_Process -Filter "name='openxcom.exe'" -ErrorAction SilentlyContinue | Where-Object {$_.SessionId -eq $session -and $_.ExecutablePath -eq $oxExe}
  if(@($existing).Count -gt 1){throw 'Ambiguous OXCE processes'}
  if($existing){$oxPid=@($existing)[0].ProcessId}
  else {$args='-data "'+$data+'" -user "'+$user+'" -cfg "'+$user+'" -master piratez -load "'+$CopySave+'"';$p=Start-Process -FilePath $oxExe -ArgumentList $args -WorkingDirectory (Join-Path $stage 'oxce-runtime') -PassThru;$oxPid=$p.Id}
}
$receipt=[ordered]@{schema='xpz3d.r148s4.fullpatch_f11_skin_smooth_pair/v1';sessionId=$session;mode=$Mode;oxcePid=$oxPid;s2Pid=$s2Pid;oxceSHA=$expectedOx;s2SHA=$expectedS2;sourceSaveIsolated=$true;actualGameplayTested=$false}
$receipt|ConvertTo-Json -Depth 5|Set-Content (Join-Path $stage 'R148S4_PAIR_LAUNCH_RECEIPT.json') -Encoding UTF8
$receipt|ConvertTo-Json -Depth 5
if(!$s2Pid){throw 'R148S3_S2_PROCESS_NOT_STARTED'}
# The native r23R safety gate intentionally creates a HIDDEN, mouse-sealed
# renderer. R148S3 ViewFix reveals only that exact already-running window.
# It never removes cursor/DirectInput protections or activates the window.
$reveal=Join-Path $stage 'SHOW_XPZ3D_VIEW_ONLY.ps1'
if(!(Test-Path -LiteralPath $reveal)){throw 'R148S3_VIEWFIX_SCRIPT_MISSING'}
& $reveal -S2Pid $s2Pid
if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw ('R148S3_VIEWFIX_FAILED '+$LASTEXITCODE)}
