# Stage 24 one-step local X-Piratez -> real Silent Storm tactical preview.
# Nothing here edits or resumes an OXCE campaign. No purchased art is copied.
param(
 [string]$Save,
 [string]$UserSaveDir='C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\user\piratez',
 [string]$BridgeRoot='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\battle-bridge\stage24',
 [int]$MaxActors=11,
 [switch]$LeaveOpen
)
$ErrorActionPreference='Stop'
$sourceDir=Split-Path -Parent $MyInvocation.MyCommand.Path
$node=(Get-Command node.exe -ErrorAction Stop).Source
if(-not $Save){
 $latest=Get-ChildItem -LiteralPath $UserSaveDir -File -Filter '*.sav' |
   Where-Object { $_.Name -notlike '_xpz3d_bridge_*' } |
   Sort-Object LastWriteTime -Descending | Select-Object -First 1
 if(-not $latest){throw 'No OXCE save in the configured user folder'}
 $Save=$latest.FullName
}
if(-not(Test-Path -LiteralPath $Save)){throw ('Save not found: '+$Save)}
$src=(Resolve-Path -LiteralPath $Save).Path
$session=[guid]::NewGuid().ToString('N').Substring(0,14)
$directory=Join-Path $BridgeRoot ('battle-'+$session)
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$requestFile=Join-Path $directory 'battle-start.json'
$originalHash=(Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host ('OXCE source: '+$src)
& $node (Join-Path $sourceDir 'bridge.mjs') export --save $src --out $requestFile
if($LASTEXITCODE -ne 0) {
 throw 'This save cannot be converted to a live 3D battle. OXCE remains untouched.'
}
# If the save came from the future OXCE BriefingState hook, move only that
# generated temporary snapshot into the isolated bridge folder, preserving it.
if(([IO.Path]::GetFileName($src)).StartsWith('_xpz3d_bridge_',[StringComparison]::OrdinalIgnoreCase)){
 $archive=Join-Path $directory 'handoff-original.sav'
 Move-Item -LiteralPath $src -Destination $archive -ErrorAction Stop
 Write-Host ('OXCE handoff snapshot archived: '+$archive)
}
$runArguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',
  (Join-Path $sourceDir 'windows-3d-roster-preview.ps1'),'-Battle',$requestFile,
  '-MaxActors',[string]$MaxActors)
if($LeaveOpen){$runArguments+='-LeaveOpen'}
Write-Host ('Launch isolated 3D tactical scene with '+$MaxActors+' max campaign actors')
& powershell.exe @runArguments
if($LASTEXITCODE -ne 0){throw '3D engine roster import failed; original OXCE save was not modified'}
Write-Host ('3D import receipt: '+$directory)
