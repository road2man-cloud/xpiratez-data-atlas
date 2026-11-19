<#
.SYNOPSIS
  Fail-closed build and promotion of an X-Piratez native ALLPATCH release.
.DESCRIPTION
  Runs an optional build, verifies archive and source contracts, and only
  when -Activate is specified switches the installed latest launcher.
  Never kills games or edits save files.
.EXAMPLE
  .\build_release.ps1 -Manifest D:\releases\R180.json -BuildScript D:\work\build_r180.ps1
.EXAMPLE
  .\build_release.ps1 -Manifest D:\releases\R180.json -Activate
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Manifest,
    [string]$BuildScript = '',
    [string]$Python = 'python',
    [switch]$Activate
)
$ErrorActionPreference = 'Stop'
$manager = Join-Path $PSScriptRoot 'release_manager.py'
if (!(Test-Path -LiteralPath $manager)) { throw 'RELEASE_MANAGER_MISSING' }
if (!(Test-Path -LiteralPath $Manifest)) { throw 'RELEASE_MANIFEST_MISSING' }

if ($BuildScript) {
    if (!(Test-Path -LiteralPath $BuildScript)) { throw 'BUILD_SCRIPT_MISSING' }
    & $BuildScript
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "NATIVE_BUILD_FAILED=$LASTEXITCODE" }
}
& $Python $manager audit $Manifest
if ($LASTEXITCODE -ne 0) { throw "RELEASE_AUDIT_FAILED=$LASTEXITCODE" }
if ($Activate) {
    & $Python $manager activate $Manifest
    if ($LASTEXITCODE -ne 0) { throw "RELEASE_ACTIVATION_FAILED=$LASTEXITCODE" }
    Write-Output 'RELEASE_ACTIVATED'
} else {
    Write-Output 'RELEASE_AUDITED_ONLY'
}
