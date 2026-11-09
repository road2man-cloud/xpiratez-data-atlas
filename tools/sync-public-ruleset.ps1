# Refresh the public read-only ruleset snapshot from the installed X-Piratez ruleset.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/sync-public-ruleset.ps1
#        powershell -NoProfile -ExecutionPolicy Bypass -File tools/sync-public-ruleset.ps1 -Commit
# This script NEVER modifies the installed game ruleset or pushes to the remote.
[CmdletBinding()]
param(
  [string]$Source = 'C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\user\mods\Piratez\Ruleset\Piratez.rul',
  [switch]$Commit
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $repo 'public\ruleset'
if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
  throw "Source missing: $Source"
}
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$target = Join-Path $destination 'Piratez.rul'
$sourceHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash.ToLowerInvariant()
$targetHash = if (Test-Path -LiteralPath $target) { (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() } else { '' }
if ($sourceHash -ne $targetHash) {
  Copy-Item -LiteralPath $Source -Destination $target -Force
}
$file = Get-Item -LiteralPath $Source
$manifestPath = Join-Path $destination 'manifest.json'
$manifest = [ordered]@{
  file = 'Piratez.rul'
  bytes = $file.Length
  sha256 = $sourceHash
  sourceModifiedUtc = $file.LastWriteTimeUtc.ToString('o')
  mode = 'read-only snapshot'
}
# Update only when source or metadata changed; avoid needless deployments.
$json = $manifest | ConvertTo-Json
$existing = if (Test-Path $manifestPath) { Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 } else { '' }
$existingObj = try { $existing | ConvertFrom-Json } catch { $null }
if (-not $existingObj -or $existingObj.sha256 -ne $sourceHash -or $existingObj.bytes -ne $file.Length -or $existingObj.sourceModifiedUtc -ne $manifest.sourceModifiedUtc) {
  [System.IO.File]::WriteAllText($manifestPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}
$copiedHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
if ($copiedHash -ne $sourceHash) { throw "Copy integrity check failed" }
Write-Output "RULESET_SYNC_OK sha256=$sourceHash bytes=$($file.Length) path=$target"
if ($Commit) {
  $paths = @('public/ruleset/Piratez.rul','public/ruleset/manifest.json','public/ruleset/index.html')
  & git -C $repo add -- $paths
  if ($LASTEXITCODE -ne 0) { throw 'git add failed' }
  & git -C $repo diff --cached --quiet -- $paths
  if ($LASTEXITCODE -eq 1) {
    & git -C $repo commit -m 'Sync public X-Piratez ruleset snapshot' -- $paths
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed' }
  } elseif ($LASTEXITCODE -ne 0) {
    throw 'git diff failed'
  }
  Write-Output 'To publish, push the committed main branch; the pages workflow deploys public/.'
}
