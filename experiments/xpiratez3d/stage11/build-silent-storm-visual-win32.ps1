# Reproducible local-only proof that the existing XPZVisualFeed links into the
# real Silent Storm Reconstruction Game target. DOES NOT start the game.
# Requires separately licensed Silent Storm source and VS 2022 x86 tools.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SourceCheckout,
  [Parameter(Mandatory = $true)][string]$DestinationCheckout,
  [Parameter(Mandatory = $true)][string]$BuildDirectory,
  [Parameter(Mandatory = $true)][string]$CMakeExe,
  [string]$ExpectedSourceCommit = 'f5b5b620d4b251d7548b36134ae16d3abe4457e5',
  [switch]$ConfigureOnly
)
$ErrorActionPreference = 'Stop'
function Require($condition, $description) {
  if (-not $condition) { throw $description }
}
function RunNative([string]$name, [string[]]$arguments) {
  # Native tools sometimes write harmless progress to stderr (Git clone, MSBuild).
  $before=$ErrorActionPreference
  $ErrorActionPreference='Continue'
  try {
    & $name @arguments
    $code=$LASTEXITCODE
  } finally { $ErrorActionPreference=$before }
  if ($code -ne 0) { throw "$name failed (exit $code)" }
}
Require (Test-Path -LiteralPath (Join-Path $SourceCheckout '.git')) 'Existing source Git checkout not found'
Require (Test-Path -LiteralPath (Join-Path $SourceCheckout 'CMakeLists.txt')) 'Missing real Silent Storm CMakeLists.txt'
Require (Test-Path -LiteralPath $CMakeExe) 'CMake executable not found'
Require (-not (Test-Path -LiteralPath $DestinationCheckout)) 'Destination exists; refuse overwrite or reuse'
Require (-not (Test-Path -LiteralPath $BuildDirectory)) 'Build directory exists; refuse overwrite or reuse'
$sha = ((& git -C $SourceCheckout rev-parse HEAD) | Select-Object -First 1).Trim()
Require ($sha -eq $ExpectedSourceCommit) "Source commit mismatch: $sha"
Require (-not ((& git -C $SourceCheckout status --porcelain) | Select-Object -First 1)) 'Source checkout is dirty; refuse to clone as reference'
$patch = Join-Path $PSScriptRoot 'silent-storm-xpzvisual.patch'
$from = Join-Path $PSScriptRoot '..\stage06\ss'
foreach ($file in @('XPZVisualFeed.h','XPZVisualFeed.cpp')) {
  Require (Test-Path -LiteralPath (Join-Path $from $file)) "Missing canonical $file"
}
# Git clone creates a separate developer source copy; the original source is untouched.
RunNative 'git' @('clone','--no-hardlinks','--single-branch','--branch','develop',$SourceCheckout,$DestinationCheckout)
RunNative 'git' @('-C',$DestinationCheckout,'apply','--check',$patch)
RunNative 'git' @('-C',$DestinationCheckout,'apply',$patch)
foreach ($file in @('XPZVisualFeed.h','XPZVisualFeed.cpp')) {
  $source = Join-Path $from $file
  $destination = Join-Path (Join-Path $DestinationCheckout 'Game') $file
  Copy-Item -LiteralPath $source -Destination $destination -ErrorAction Stop
  $expectedHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
  $actualHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
  Require ($expectedHash -eq $actualHash) "Copied feed differs: $file"
}
Write-Output ('SOURCE_COMMIT=' + $sha)
Write-Output ('INTEGRATION_PATCH=' + (Get-FileHash -LiteralPath $patch -Algorithm SHA256).Hash)
Write-Output 'COPIED_FEED_FILES_SHA256=VERIFIED'
RunNative $CMakeExe @('-S',$DestinationCheckout,'-B',$BuildDirectory,'-G','Visual Studio 17 2022','-A','Win32')
if ($ConfigureOnly) { Write-Output 'CONFIGURE_PASS=1'; exit 0 }
RunNative $CMakeExe @('--build',$BuildDirectory,'--config','Release','--target','Game','--parallel','1')
$exe = Join-Path $BuildDirectory 'Release\Game.exe'
Require (Test-Path -LiteralPath $exe) 'Build returned success but Game.exe missing'
Write-Output ('GAME_EXE=' + $exe)
Write-Output ('GAME_EXE_SHA256=' + (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash)
Write-Output ('GAME_EXE_BYTES=' + (Get-Item -LiteralPath $exe).Length)
Write-Output 'COMPILED_REAL_SILENT_STORM_WITH_READ_ONLY_FEED=1'
Write-Output 'GAME_RUNTIME_OR_3D_BATTLE_VERIFIED=0'
