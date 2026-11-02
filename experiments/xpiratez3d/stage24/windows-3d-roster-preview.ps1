# XPZ3D Stage24: import real X-Piratez campaign identities into live 3D scene.
# No original game files or campaign saves are overwritten. This is a first
# playable handoff preview: model #730 is explicitly a TEMPORARY Nival actor.
param(
  [Parameter(Mandatory=$true)][string]$Battle,
  [string]$Runtime='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-smoke-stage-002',
  [string]$Engine='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-windowprobe-win32\Release\Game.exe',
  [int]$MaxActors=11,
  [switch]$LeaveOpen
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent (Resolve-Path -LiteralPath $Battle)
$request=Get-Content -LiteralPath $Battle -Raw -Encoding UTF8 | ConvertFrom-Json
if ($request.schema -ne 'xpz3d.battle-start.v1' -or $request.battleId -notmatch '^[0-9a-f]{32}$') {
 throw 'Expected a real Stage24 battle-start.v1 request'
}
if ($request.counts.units -ne @($request.units).Count -or $request.counts.items -ne @($request.items).Count) {
 throw 'Incomplete battle request'
}
if ($MaxActors -le 0 -or $MaxActors -gt 256) {throw 'MaxActors range is 1..256'}
$selected=@($request.units | Where-Object { $_.faction -eq 0 -and $_.status -eq 0 -and $_.vital.health -gt 0 -and $_.tile.Count -eq 3 } | Select-Object -First $MaxActors)
if ($selected.Count -eq 0) { throw 'No eligible player units in the source battle' }
$session='b24'+[guid]::NewGuid().ToString('N').Substring(0,16)
$evidence=Join-Path $root ('import-'+$session)
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$script:sequence=0
$inbox=Join-Path $Runtime '_harness_cmd.txt'
$ack=Join-Path $Runtime '_saveload.log'
$stack=Join-Path $Runtime '_xpz_interface_stack.log'
$unitLog=Join-Path $Runtime '_xpz_native_units.log'
$exe=Join-Path $Runtime 'XPZ3D_BattleBridge.exe'
$game=$null
$completed=$false
$mapping=@()
function Read-Log([string]$file){
 if(-not(Test-Path -LiteralPath $file)){return ''}
 $stream=$null;$reader=$null
 try{
  $stream=[IO.FileStream]::new($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,
    ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
  $reader=[IO.StreamReader]::new($stream)
  return $reader.ReadToEnd()
 }catch{return ''}finally{
  if($reader){$reader.Dispose()}elseif($stream){$stream.Dispose()}
 }
}
function Log([string]$line){
 $s=([DateTimeOffset]::Now.ToString('O')+' '+$line)
 $s | Out-File -LiteralPath (Join-Path $evidence 'driver.log') -Encoding UTF8 -Append
 Write-Output $s
}
function Until([scriptblock]$probe,[int]$seconds){
 $end=Get-Date
 $end=$end.AddSeconds($seconds)
 while((Get-Date) -lt $end){
  if(& $probe){return $true}
  Start-Sleep -Milliseconds 170
 }
 return [bool](& $probe)
}
function Command([string]$command){
 $script:sequence++
 $seq=$script:sequence
 if(Test-Path -LiteralPath $inbox){throw 'Command inbox occupied; refusing overwrite'}
 $tmp=Join-Path $Runtime ('_harness_cmd.'+$session+'.tmp')
 [IO.File]::WriteAllText($tmp,('seq '+$seq+' session '+$session+' '+$command+[Environment]::NewLine),
  [Text.Encoding]::ASCII)
 [IO.File]::Move($tmp,$inbox)
 $success=('['+'harness'+'] ACK session='+$session+' seq='+$seq+' pid='+$game.Id+' ')
 if(-not(Until { (Read-Log $ack).Contains($success) } 12)){
  throw ('NO_ACK seq='+$seq+' (not retried)')
 }
 $dispatched=('[harness] DISPATCH session='+$session+' seq='+$seq+' ')
 if(-not(Until { (Read-Log $ack).Contains($dispatched) } 12)){
  throw ('NO_DISPATCH seq='+$seq+' (not retried)')
 }
 Log ('COMMAND_ACCEPTED seq='+$seq+' '+$command)
}
function Top {
 $rows=@(((Read-Log $stack)-split '[\r\n]+') | Where-Object {$_ -match '^event=\S+ depth=\d+ top='})
 if($rows.Count -eq 0){return ''}
 return [string]$rows[-1]
}
function NativeAdds {
 return @(((Read-Log $unitLog)-split '[\r\n]+') | Where-Object {$_ -match '^event=world_add_completed '})
}
try{
 if(-not(Test-Path -LiteralPath $Engine)){throw 'Engine Release binary not found'}
 if(-not(Test-Path -LiteralPath (Join-Path $Runtime 'game.db'))){throw 'GOG isolated runtime missing game.db'}
 $other=@(Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -like ($Runtime+'\*') -and $_.Name -match '^(Game|XPZ3D_.+)\.exe$'
 })
 if($other.Count -gt 0){throw 'Isolated engine runtime already running; will not interrupt it'}
 foreach($f in @('_harness_cmd.txt','_saveload.log','_console.log','_xpz_interface_stack.log',
    '_xpz_world_steps.log','_xpz_native_units.log','_xpz_stage23_move.log')){
   $p=Join-Path $Runtime $f
   if(Test-Path -LiteralPath $p){Move-Item -LiteralPath $p -Destination (Join-Path $evidence ('prior-'+$f)) -ErrorAction Stop}
 }
 Copy-Item -LiteralPath $Engine -Destination $exe -Force
 $env:XPZ3D_HARNESS_SESSION=$session
 $env:XPZ3D_FREE_MOUSE='1'
 $env:XPZ3D_WINDOWED_SMOKE='1'
 $env:XPZ3D_HINT_CLOSE_TEST='1'
 $env:XPZ3D_TUTORIAL_SMOKE='1'
 $env:XPZ3D_INTERFACE_STACK_DIAG='1'
 $env:XPZ3D_NATIVE_SPAWN_DIAG='1'
 $env:XPZ3D_SPAWN_TEST_EVENT='0'
 $game=Start-Process -FilePath $exe -WorkingDirectory $Runtime -ArgumentList @('-harness','-windowed',
   '-nosound','-cfg','xpz-start-no-video.cfg') -PassThru
 Log ('ENGINE_STARTED pid='+$game.Id+' session='+$session+' battleId='+$request.battleId)
 $ready=('[harness] READY session='+$session+' pid='+$game.Id)
 if(-not(Until {(Read-Log $ack).Contains($ready)} 70)){throw 'Engine did not boot'}
 if(-not(Until {(Top) -match 'CMainMenuInterface'} 25)){throw 'No main menu'}
 Command 'console mainmenu'
 Command 'console xpz3d_tutorial_smoke'
 if(-not(Until {(Top) -match 'CShowHintInterface'} 75)){throw '3D tactical map not loaded'}
 for($i=0;$i -lt 12;$i++){
  $t=Top
  if($t -match 'CShowHintInterface'){
   Command 'console xpz3d_dismiss_hint'
   if(-not(Until {(Top) -notmatch 'CShowHintInterface'} 8)){throw 'Hint modal did not close'}
   Start-Sleep -Milliseconds 450
   continue
  }
  if($t -match 'CMission'){break}
  Start-Sleep -Milliseconds 300
 }
 if((Top) -notmatch 'top=class NGame::CMission '){throw 'Native 3D mission not active'}
 $count=0
 foreach($source in $selected){
  $before=@(NativeAdds).Count
  Command 'console summonunit 730'
  if(-not(Until {@(NativeAdds).Count -ge ($before+1)} 8)){
   throw ('Native actor not added for X-Piratez unitId='+$source.unitId)
  }
  $add=@(NativeAdds)[$before]
  $m=[regex]::Match($add,'world_before=(\d+) world_after=(\d+) player_before=(\d+) player_after=(\d+) actor_ptr=(\S+)')
  if(-not $m.Success -or ([int]$m.Groups[2].Value)-ne ([int]$m.Groups[1].Value+1) -or
    ([int]$m.Groups[4].Value)-ne ([int]$m.Groups[3].Value+1)){
   throw ('Bad Nival actor registration for unitId='+$source.unitId)
  }
  $mapping+= [ordered]@{
   oxceUnitId=[int]$source.unitId; oxceName=$source.name;
   oxceUnitRule=$source.unitRule; oxceArmorRule=$source.armorRule;
   oxceInventoryItemIds=@($source.itemIds);
   oxceStats=$source.stats; oxceVitals=$source.vital;
   nivalRuntimeActor=$m.Groups[5].Value;nivalPrototype=730;
   identityMapped=$true;statsAppliedTo3D=$false;artAppliedTo3D=$false;
  }
  $count++
  Log ('ROSTER_IMPORTED '+$count+'/'+$selected.Count+' unitId='+$source.unitId+
    ' actor='+$m.Groups[5].Value+' name='+$source.name)
 }
 $receipt=[ordered]@{
  schema='xpz3d.roster-import.v1';battleId=$request.battleId;
  sourceSha256=$request.origin.sourceSha256;session=$session;
  nativeEngineSha256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash;
  actorCount=$mapping.Count;originalUnits=$request.counts.units;
  originalItems=$request.counts.items;nativeMap='SILENT_STORM_TUTORIAL_PLACEHOLDER';
  actorPrototype=730;imported=$mapping;
  bridgeStatus='ROSTER_IDENTITY_IMPORTED_TO_NATIVE_3D';
  campaignCommitPerformed=$false;
 }
 $temp=Join-Path $evidence 'roster-import.tmp'
 $destination=Join-Path $evidence 'roster-import.json'
 [IO.File]::WriteAllText($temp,($receipt|ConvertTo-Json -Depth 30),
   (New-Object System.Text.UTF8Encoding $false))
 [IO.File]::Move($temp,$destination)
 $completed=$true
 Log ('ROSTER_BRIDGE_PASS '+$mapping.Count+' native actors with real X-Piratez identities')
}catch{
 Log ('ROSTER_BRIDGE_FAIL '+$_.Exception.Message)
}finally{
 if($game -and ($completed -and $LeaveOpen)){
  Log ('ENGINE_LEFT_OPEN pid='+$game.Id+' (free mouse; use normal close to exit)')
 }elseif($game){
  try{
   $game.Refresh()
   if(-not $game.HasExited){
    try{Command 'quit'}catch{Log ('CLEANUP_QUIT_ACK_UNAVAILABLE '+$_.Exception.Message)}
    if(-not $game.WaitForExit(6000)){
     Stop-Process -Id $game.Id -Force -ErrorAction SilentlyContinue
     Log ('OWN_ENGINE_STOPPED pid='+$game.Id)
    }
   }
  }catch{Log ('CLEANUP_ERROR '+$_.Exception.Message)}
 }
 if(-not ($completed -and $LeaveOpen)){
  try{
   Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class XPZ24Clip {
  [DllImport("user32.dll")] public static extern bool ClipCursor(IntPtr rect);
}
'@ -ErrorAction Stop
   [XPZ24Clip]::ClipCursor([IntPtr]::Zero)|Out-Null
   Log 'CURSOR_RELEASED'
  }catch{Log ('CURSOR_RELEASE_ERROR '+$_.Exception.Message)}
 }
 foreach($f in @('_saveload.log','_console.log','_xpz_interface_stack.log','_xpz_native_units.log')){
  $src=Join-Path $Runtime $f
  if(Test-Path -LiteralPath $src){Copy-Item -LiteralPath $src -Destination (Join-Path $evidence $f) -Force}
 }
 Log ('FINAL='+$(if($completed){'ROSTER_BRIDGE_PASS'}else{'FAIL'}))
}
if(-not $completed){exit 1}
