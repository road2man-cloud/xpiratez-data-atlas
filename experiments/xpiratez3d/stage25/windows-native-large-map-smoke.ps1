# Stage 25: native S2 120x120/160x160 terrain + 10-deck rendering probe.
# Only isolated test runtime, never user-owned campaign saves or game installation.
param(
 [string]$Runtime='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-smoke-stage-002',
 [string]$BuildExe='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-stage25-win32\Release\Game.exe',
 [ValidateSet(120,160)][int]$Size=120,
 [switch]$WithHulls,
 [switch]$SpawnActor,
 [switch]$LeaveOpen
)
$ErrorActionPreference='Stop'
$session='s25'+[Guid]::NewGuid().ToString('N').Substring(0,14)
$evidence=Join-Path $Runtime ('stage25-evidence-'+$session+'-'+$Size)
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$exe=Join-Path $Runtime 'XPZ3D_Stage25.exe'
$inbox=Join-Path $Runtime '_harness_cmd.txt'
$ack=Join-Path $Runtime '_saveload.log'
$stack=Join-Path $Runtime '_xpz_interface_stack.log'
$mapLog=Join-Path $Runtime '_xpz_stage25_map.log'
$script:seq=0;$game=$null;$completed=$false;$reason='not-started'
function Log([string]$msg){
 $line=([DateTimeOffset]::Now.ToString('O')+' '+$msg)
 $line | Out-File -FilePath (Join-Path $evidence 'driver.log') -Append -Encoding UTF8
 Write-Output $line
}
function Read-Live([string]$file){
 if(-not(Test-Path -LiteralPath $file)){return ''}
 $f=$null;$r=$null
 try{
  $f=[IO.FileStream]::new($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,
    ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
  $r=[IO.StreamReader]::new($f)
  return $r.ReadToEnd()
 }catch{return ''}finally{if($r){$r.Dispose()}elseif($f){$f.Dispose()}}
}
function Until([scriptblock]$cond,[int]$secs){
 $end=(Get-Date).AddSeconds($secs)
 while((Get-Date)-lt $end){
  if(& $cond){return $true}
  if($game){$game.Refresh();if($game.HasExited){return $false}}
  Start-Sleep -Milliseconds 180
 }
 return [bool](& $cond)
}
function Top {
 $rows=@(((Read-Live $stack)-split '[\r\n]+') | Where-Object {$_ -match '^event=\S+ depth=\d+ top='})
 if($rows.Count -lt 1){return ''}
 return [string]$rows[-1]
}
function Send([string]$cmd){
 $script:seq++
 $n=$script:seq
 if(Test-Path -LiteralPath $inbox){throw 'Command inbox occupied'}
 $tmp=Join-Path $Runtime ('.stage25_'+$session+'_'+$n+'.tmp')
 [IO.File]::WriteAllText($tmp,('seq '+$n+' session '+$session+' '+$cmd+[Environment]::NewLine),
    [Text.Encoding]::ASCII)
 [IO.File]::Move($tmp,$inbox)
 $prefix=('[harness] ACK session='+$session+' seq='+$n+' pid='+$game.Id+' ')
 if(-not(Until {(Read-Live $ack).Contains($prefix)} 12)){throw 'ACK timeout '+$cmd}
 $p=('[harness] DISPATCH session='+$session+' seq='+$n+' ')
 if(-not(Until {(Read-Live $ack).Contains($p)} 12)){throw 'DISPATCH timeout '+$cmd}
 Log ('CMD '+$cmd)
}
try{
 if(-not(Test-Path -LiteralPath $BuildExe)){throw 'Stage25 Game.exe absent'}
 if(-not(Test-Path -LiteralPath (Join-Path $Runtime 'game.db'))){throw 'No isolated GOG game.db'}
 $foreign=@(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^(Game|XPZ3D_.+)\.exe$' -and $_.ExecutablePath -like ($Runtime+'\*')
 })
 if($foreign.Count -gt 0){throw 'Test runtime occupied; preserving foreign process'}
 foreach($name in @('_harness_cmd.txt','_saveload.log','_console.log',
   '_xpz_interface_stack.log','_xpz_world_steps.log','_xpz_native_units.log',
   '_xpz_stage23_move.log','_xpz_stage25_map.log')){
  $old=Join-Path $Runtime $name
  if(Test-Path -LiteralPath $old){Move-Item -LiteralPath $old -Destination (Join-Path $evidence ('old'+$name)) -ErrorAction Stop}
 }
 Copy-Item -LiteralPath $BuildExe -Destination $exe -Force
 $exeHash=(Get-FileHash $exe -Algorithm SHA256).Hash
 $env:XPZ3D_STAGE25_NATIVE_MAP='1'
 $env:XPZ3D_STAGE25_NATIVE_HULLS=$(if($WithHulls){'1'}else{'0'})
 $env:XPZ3D_STAGE25_SIZE160= if($Size -eq 160){'1'}else{'0'}
 $env:XPZ3D_HARNESS_SESSION=$session
 $env:XPZ3D_FREE_MOUSE='1'
 $env:XPZ3D_WINDOWED_SMOKE='1'
 $env:XPZ3D_HINT_CLOSE_TEST='1'
 $env:XPZ3D_TUTORIAL_SMOKE='1'
 $env:XPZ3D_INTERFACE_STACK_DIAG='1'
 $env:XPZ3D_WORLD_STEP_DIAG='1'
 $env:XPZ3D_NATIVE_SPAWN_DIAG='1'
 $env:XPZ3D_SPAWN_TEST_EVENT='0'
 $game=Start-Process -FilePath $exe -WorkingDirectory $Runtime -ArgumentList @(
   '-harness','-windowed','-nosound','-cfg','xpz-start-no-video.cfg') -PassThru
 Log ('NATIVE_ENGINE_STARTED pid='+$game.Id+' size='+$Size+' hash='+$exeHash)
 if(-not(Until {(Read-Live $ack).Contains(('[harness] READY session='+$session+' pid='+$game.Id))} 65)){
  throw 'Engine bootstrap failed'
 }
 if(-not(Until {(Top) -match 'CMainMenuInterface'} 20)){throw 'Main menu not reached'}
 Send 'console mainmenu'
 Send 'console xpz3d_tutorial_smoke'
 if(-not(Until {(Top) -match 'CMission|CShowHintInterface'} 85)){throw 'Mission did not load'}
 for($i=0;$i -lt 15;$i++){
  $top=Top
  if($top -match 'CShowHintInterface'){
   Send 'console xpz3d_dismiss_hint'
   if(-not(Until {(Top) -notmatch 'CShowHintInterface'} 8)){throw 'Tutorial hint did not close'}
   continue
  }
  if($top -match 'top=class NGame::CMission '){break}
  Start-Sleep -Milliseconds 250
 }
 if((Top) -notmatch 'top=class NGame::CMission '){throw 'Native CMission never became top state'}
 $mapText=Read-Live $mapLog
 if(-not($mapText.Contains(('event=native_nav_begin size='+$Size+' ')))){throw 'Native nav construction not observed'}
 if(-not($mapText.Contains(('event=native_nav_coloured size='+$Size+' ')))){throw 'Native colouring not finished'}
 if(-not($mapText.Contains('event=native_3d_tower_created levels=10 meshes=50'))){throw 'Native S2 renderer ten-deck geometry not created'}
 $expectedHulls=$(if($WithHulls){50}else{0})
 if(-not($mapText.Contains(('event=native_hulls_registered decks=10 count='+$expectedHulls)))){throw 'Stage25 collision hull count not observed'}
 if($SpawnActor){
  $unitLog=Join-Path $Runtime '_xpz_native_units.log'
  $beforeCount=@(([regex]::Matches((Read-Live $unitLog),'event=world_add_completed '))).Count
  Send 'console summonunit 730'
  if(-not(Until { ([regex]::Matches((Read-Live $unitLog),'event=world_add_completed ')).Count -gt $beforeCount } 20)){
   throw 'Actual native actor did not spawn on large map'
  }
  Log 'NATIVE_ACTOR_SPAWNED_ON_LARGE_MAP'
 }
 $receipt=[ordered]@{
  schema='xpz3d.stage25.engine-run.v1';result='PASS_NATIVE_SCENE_AND_NAV_SETUP'
  session=$session;engineSha256=$exeHash;nativeWorldExecuted=$true
  navigationRequested=@($Size,$Size);floorSlotsCompiled=12
  navigationExtentMeters=@($(if($Size -eq 120){75}else{100}),$(if($Size -eq 120){75}else{100}))
  backingTerrainMeters=$(if($Size -eq 120){80}else{104})
  towerLevelsRendered=10;nivalMeshObjectsCreated=50;nativeAIHullRegistrations=$expectedHulls
  spawnedNativeActor=[bool]$SpawnActor.IsPresent
  nativeCameraMissionReached=$true
  pathToDeck10Verified=$false;highFloorCollisionAPIRegistered=[bool]$WithHulls.IsPresent
  physicalCollisionTested=$false
  highFloorVisibilityOcclusionVerified=$false;crossFloorShotVerified=$false
  highFloorExplosionVerified=$false
  scope='Real GOG Silent Storm process and real native S2 scene generation, not a complete high-floor battle.'
 }
 $out=Join-Path $evidence 'receipt.json'
 [IO.File]::WriteAllText($out,($receipt|ConvertTo-Json -Depth 15),
    (New-Object System.Text.UTF8Encoding($false)))
 $completed=$true
 Log ('PASS_NATIVE_SCENE_AND_NAV_SETUP size='+$Size+' meshes=50')
}catch{
 $reason=$_.Exception.Message
 Log ('FAIL '+$reason)
}finally{
 if($game -and $completed -and $LeaveOpen){
  Log ('ENGINE_LEFT_OPEN pid='+$game.Id+' (mouse must remain free)')
 }elseif($game){
  try{
   $game.Refresh()
   if(-not $game.HasExited){
    try{Send 'quit'}catch{Log ('CLEANUP_QUIT_FAIL '+$_.Exception.Message)}
    if(-not $game.WaitForExit(5000)){
     Stop-Process -Id $game.Id -Force -ErrorAction SilentlyContinue
     Log ('OWN_ENGINE_TERMINATED pid='+$game.Id)
    }
   }
  }catch{Log ('CLEANUP_ERROR '+$_.Exception.Message)}
 }
 if(-not ($completed -and $LeaveOpen)){
  try{
   Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class XPZStage25Clip {
 [DllImport("user32.dll")] public static extern bool ClipCursor(IntPtr rect);
}
'@
   [XPZStage25Clip]::ClipCursor([IntPtr]::Zero)|Out-Null
   Log 'CURSOR_RELEASED'
  }catch{Log ('CURSOR_RELEASE_ERROR '+$_.Exception.Message)}
 }
 foreach($name in @('_saveload.log','_console.log','_xpz_interface_stack.log',
  '_xpz_world_steps.log','_xpz_native_units.log','_xpz_stage25_map.log')){
  $live=Join-Path $Runtime $name
  if(Test-Path $live){Copy-Item -LiteralPath $live -Destination (Join-Path $evidence $name) -Force -ErrorAction SilentlyContinue}
 }
 Log ('FINAL='+$(if($completed){'PASS_NATIVE_SCENE_AND_NAV_SETUP'}else{'FAIL'}))
}
if(-not $completed){exit 1}
