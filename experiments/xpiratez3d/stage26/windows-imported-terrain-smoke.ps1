# Stage26 acceptance: ONLY a real X-Piratez MCD/LOFT converted map in native S2.
# The test deliberately rejects the old synthetic Stage25 tower as evidence.
param(
  [string]$Runtime='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-smoke-stage-002',
  [string]$BuildExe='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\build-xpz-stage25-win32\Release\Game.exe',
  [string]$MeshPath='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage26\real-oxce-map-region\xpz3d-terrain-v1.meshbin',
  [string]$ManifestPath='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage26\real-oxce-map-region\terrain-manifest.json',
  [string]$CollisionPath='',
  [string]$CollisionManifestPath='',
  [ValidateSet(120,160)][int]$Size=120,
  [switch]$SpawnPrototype,
  [switch]$LeaveOpen
)
$ErrorActionPreference='Stop'
$session='s26'+[Guid]::NewGuid().ToString('N').Substring(0,14)
$evidence=Join-Path $Runtime ('stage26-evidence-'+$session)
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
$exe=Join-Path $Runtime 'XPZ3D_Stage26.exe'
$inbox=Join-Path $Runtime '_harness_cmd.txt'
$ack=Join-Path $Runtime '_saveload.log'
$stack=Join-Path $Runtime '_xpz_interface_stack.log'
$map=Join-Path $Runtime '_xpz_stage25_map.log'
$unitLog=Join-Path $Runtime '_xpz_native_units.log'
$script:seq=0;$game=$null;$passed=$false;$reason='not-started'
function Log([string]$str){
  $text=[DateTimeOffset]::Now.ToString('O')+' '+$str
  $text|Out-File (Join-Path $evidence 'driver.log') -Encoding UTF8 -Append
  Write-Output $text
}
function Read-Live([string]$p){
  if(-not(Test-Path -LiteralPath $p)){return ''}
  $stream=$null;$reader=$null
  try{
    $stream=[IO.FileStream]::new($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,
      ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $reader=[IO.StreamReader]::new($stream)
    return $reader.ReadToEnd()
  }catch{return ''}finally{if($reader){$reader.Dispose()}elseif($stream){$stream.Dispose()}}
}
function Until([scriptblock]$predicate,[int]$secs){
  $until=(Get-Date).AddSeconds($secs)
  while((Get-Date)-lt $until){
    if(& $predicate){return $true}
    if($game){$game.Refresh();if($game.HasExited){return $false}}
    Start-Sleep -Milliseconds 240
  }
  return [bool](& $predicate)
}
function Top {
  $rows=@(((Read-Live $stack)-split '[\r\n]+')|Where-Object {$_ -match '^event=\S+ depth=\d+ top='})
  if($rows.Count -eq 0){return ''}
  return [string]$rows[-1]
}
function Send([string]$command){
  $script:seq++
  if(Test-Path -LiteralPath $inbox){throw 'Occupied command inbox'}
  $tmp=Join-Path $Runtime ('.s26_'+$session+'_'+$script:seq+'.tmp')
  [IO.File]::WriteAllText($tmp,('seq '+$script:seq+' session '+$session+' '+$command+[Environment]::NewLine),[Text.Encoding]::ASCII)
  [IO.File]::Move($tmp,$inbox)
  $prefix='[harness] ACK session='+$session+' seq='+$script:seq+' pid='+$game.Id+' '
  if(-not(Until {(Read-Live $ack).Contains($prefix)} 16)){throw ('Command not ACKed '+$command)}
  $dispatch='[harness] DISPATCH session='+$session+' seq='+$script:seq+' '
  if(-not(Until {(Read-Live $ack).Contains($dispatch)} 16)){throw ('Command not dispatched '+$command)}
  Log ('COMMAND '+$command)
}
try{
  if(-not(Test-Path -LiteralPath $BuildExe)){throw 'Missing native x86 build'}
  if(-not(Test-Path -LiteralPath $MeshPath)){throw 'Missing real OXCE geometry'}
  if(-not(Test-Path -LiteralPath $ManifestPath)){throw 'Missing geometry manifest'}
  if(-not(Test-Path -LiteralPath (Join-Path $Runtime 'game.db'))){throw 'Not an isolated authorized GOG runtime'}
  $manifest=Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  $realHash=(Get-FileHash -LiteralPath $MeshPath -Algorithm SHA256).Hash
  $schemaOk=([string]$manifest.schema -eq 'xpz3d.oxce-terrain-mesh.v1')
  $sizeOk=([int]$manifest.conversion.s2Grid[0] -eq [int]$Size)
  $hashOk=([string]$manifest.binary.sha256 -eq $realHash)
  if(-not($schemaOk -and $sizeOk -and $hashOk)){
    throw ('Geometry validation failed: schema='+$schemaOk+' grid='+$sizeOk+' sha='+$hashOk+' size='+$Size)
  }
  if($manifest.source.battleId -ne '71c6d7292d67a5db8e58c3283b2a1522'){
    throw 'This regression is pinned to a different generated X-Piratez battle'
  }
  $expectedCollision=[int]$manifest.counts.chunkMeshes
  $collisionProxy=$false
  if($CollisionPath){
    if(-not $CollisionManifestPath){throw 'A collision source needs its manifest'}
    if(-not(Test-Path $CollisionPath) -or -not(Test-Path $CollisionManifestPath)){
      throw 'Missing actual LOFT-based collision proxy/manifest'
    }
    $proxyMeta=Get-Content $CollisionManifestPath -Raw | ConvertFrom-Json
    if($proxyMeta.schema -ne 'xpz3d.oxce-terrain-collision-proxy.v1' -or
      $proxyMeta.source.saveSha256 -ne $manifest.source.saveSha256 -or
      $proxyMeta.source.battleId -ne $manifest.source.battleId -or
      ($proxyMeta.conversion.region -join ',') -ne ($manifest.conversion.region -join ',') -or
      [int]$proxyMeta.conversion.s2Grid[0] -ne $Size -or
      $proxyMeta.binary.sha256 -ne (Get-FileHash $CollisionPath -Algorithm SHA256).Hash){
      throw 'Collision proxy does not match original X-Piratez map/source dimensions/hash'
    }
    $collisionProxy=$true
    $expectedCollision=[int]$proxyMeta.counts.coarseCollisionMeshes
  }
  $foreign=@(Get-CimInstance Win32_Process|Where-Object{
    $_.Name -match '^(Game|XPZ3D_.+)\.exe$' -and $_.ExecutablePath -like ($Runtime+'\*')
  })
  if($foreign.Count){throw 'Isolated runtime occupied; preserving existing game process'}
  foreach($n in @('_harness_cmd.txt','_saveload.log','_console.log',
    '_xpz_interface_stack.log','_xpz_world_steps.log','_xpz_native_units.log',
    '_xpz_stage25_map.log','_xpz_stage23_move.log')){
    $p=Join-Path $Runtime $n
    if(Test-Path -LiteralPath $p){Move-Item $p (Join-Path $evidence ('previous-'+$n)) -ErrorAction Stop}
  }
  Copy-Item $BuildExe $exe -Force
  $buildHash=(Get-FileHash $exe -Algorithm SHA256).Hash
  $env:XPZ3D_HARNESS_SESSION=$session
  $env:XPZ3D_FREE_MOUSE='1'
  $env:XPZ3D_WINDOWED_SMOKE='1'
  $env:XPZ3D_HINT_CLOSE_TEST='1'
  $env:XPZ3D_TUTORIAL_SMOKE='1'
  $env:XPZ3D_INTERFACE_STACK_DIAG='1'
  $env:XPZ3D_WORLD_STEP_DIAG='1'
  $env:XPZ3D_NATIVE_SPAWN_DIAG='1'
  $env:XPZ3D_SPAWN_TEST_EVENT='0'
  $env:XPZ3D_STAGE25_NATIVE_MAP='1'
  $env:XPZ3D_STAGE25_SIZE160=$(if($Size -eq 160){'1'}else{'0'})
  $env:XPZ3D_STAGE25_NATIVE_HULLS='0'
  $env:XPZ3D_STAGE26_MESH_PATH=$MeshPath
  $env:XPZ3D_STAGE26_COLLISION_PATH=$CollisionPath
  $game=Start-Process -FilePath $exe -WorkingDirectory $Runtime -ArgumentList @(
    '-harness','-windowed','-nosound','-cfg','xpz-start-no-video.cfg') -PassThru
  Log ('ENGINE_PID='+$game.Id+' BUILD_SHA='+$buildHash+' REAL_OXCE_SHA='+$manifest.source.saveSha256)
  if(-not(Until {(Read-Live $ack).Contains(('[harness] READY session='+$session+' pid='+$game.Id))} 90)){
    throw 'S2 native import bootstrap failed'
  }
  if(-not(Until {(Top) -match 'CMainMenuInterface'} 25)){throw 'No native main menu'}
  Send 'console mainmenu'
  Send 'console xpz3d_tutorial_smoke'
  if(-not(Until {(Top) -match 'CMission|CShowHintInterface'} 135)){throw 'Imported X-Piratez world did not enter mission'}
  for($i=0;$i -lt 24;$i++){
    $top=Top
    if($top -match 'CShowHintInterface'){
      Send 'console xpz3d_dismiss_hint'
      if(-not(Until {(Top) -notmatch 'CShowHintInterface'} 10)){throw 'Tutorial overlay not dismissed'}
      continue
    }
    if($top -match 'top=class NGame::CMission '){break}
    Start-Sleep -Milliseconds 300
  }
  if((Top) -notmatch 'top=class NGame::CMission '){throw 'Native imported 3D mission not topmost'}
  $terrain=Read-Live $map
  $expected=[int]$manifest.counts.chunkMeshes
  if(-not($terrain.Contains('event=native_nav_coloured size='+$Size+' '))){throw 'Native S2 nav init failed'}
  if(-not($terrain.Contains('event=xpz_terrain_collision_source_loaded success=1 meshes='+$expectedCollision))){
    throw 'Real MCD+LOFT collision source not loaded'
  }
  if(-not($terrain.Contains('event=xpz_terrain_collision_hulls_registered count='+$expectedCollision+' requested='+$expectedCollision))){
    throw 'Real map registered fewer S2 AI collision meshes than converter exported'
  }
  if(-not($terrain.Contains('event=xpz_terrain_native_renderer_loaded success=1 meshes='+$expected))){
    throw 'Real map not created as native 3D render meshes'
  }
  if($terrain.Contains('event=native_3d_tower_created')){throw 'Synthetic tower contaminated actual mission geometry'}
  if($SpawnPrototype){
    $before=([regex]::Matches((Read-Live $unitLog),'event=world_add_completed ')).Count
    Send 'console summonunit 730'
    if(-not(Until {([regex]::Matches((Read-Live $unitLog),'event=world_add_completed ')).Count -gt $before} 25)){
      throw 'Native temporary model could not be inserted into imported map'
    }
    Log 'PROTOTYPE_S2_UNIT_ONLY_NOT_XPIRATEZ_MODEL'
  }
  $receipt=[ordered]@{
    schema='xpz3d.stage26.native-real-terrain.v1'
    result='PASS_REAL_OXCE_TERRAIN_RENDER_AND_HULL_REGISTRATION'
    sourceBattleId=$manifest.source.battleId
    sourceSaveSha256=$manifest.source.saveSha256
    s2BuildSha256=$buildHash
    sourceMapSize=$manifest.source.mapSize
    convertedRegion=$manifest.conversion.region
    convertedPartial=[bool]$manifest.conversion.partial
    originalMcdShapes=$manifest.counts.uniqueMcdShapes
    nativeGeometryMeshes=$expected
    nativeCollisionHulls=$expectedCollision
    collisionHullApproximation=[bool]$collisionProxy
    nativeWorldAndMissionReached=$true
    originalXpiratezUnitModelImported=$false
    originalXpiratezWeaponModelImported=$false
    originalUnitAtSourcePositionVerified=$false
    importedBattleMovementVerified=$false
    importedBattleShotsOrDestructionVerified=$false
    exactSpriteTexturingCompleted=$false
    originalSaveTouched=$false
  }
  [IO.File]::WriteAllText((Join-Path $evidence 'receipt.json'),($receipt|ConvertTo-Json -Depth 10),
    (New-Object System.Text.UTF8Encoding($false)))
  Log ('PASS_REAL_OXCE_TERRAIN meshes='+$expected+' collisions='+$expectedCollision+' approximate='+$collisionProxy+' region='+($manifest.conversion.region -join ','))
  $passed=$true
}catch{
  $reason=$_.Exception.Message
  Log ('FAIL '+$reason)
  Log ('FAIL_AT '+$_.InvocationInfo.PositionMessage)
}finally{
  if($game -and $passed -and $LeaveOpen){Log ('ENGINE_LEFT_OPEN pid='+$game.Id)}
  elseif($game){
    try{
      $game.Refresh()
      if(-not $game.HasExited){
        try{Send 'quit'}catch{Log ('CLEANUP_QUIT_UNAVAILABLE '+$_.Exception.Message)}
        if(-not $game.WaitForExit(6000)){
          Stop-Process -Id $game.Id -Force -ErrorAction SilentlyContinue
          Log ('OWN_PROCESS_STOPPED pid='+$game.Id)
        }
      }
    }catch{Log ('CLEANUP '+$_.Exception.Message)}
  }
  if(-not ($passed -and $LeaveOpen)){
    try{
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class XPZ3DStage26Mouse {
 [DllImport("user32.dll")] public static extern bool ClipCursor(IntPtr region);
}
'@
      [XPZ3DStage26Mouse]::ClipCursor([IntPtr]::Zero)|Out-Null
      Log 'MOUSE_RELEASED'
    }catch{Log ('MOUSE_CLEANUP_ERROR '+$_.Exception.Message)}
  }
  foreach($n in @('_saveload.log','_console.log','_xpz_interface_stack.log',
     '_xpz_world_steps.log','_xpz_native_units.log','_xpz_stage25_map.log')){
    $p=Join-Path $Runtime $n
    if(Test-Path $p){Copy-Item -LiteralPath $p -Destination (Join-Path $evidence $n) -Force -ErrorAction SilentlyContinue}
  }
  Log ('FINAL='+$(if($passed){'PASS'}else{'FAIL'}))
  Log ('EVIDENCE='+$evidence)
}
if(-not $passed){exit 1}
