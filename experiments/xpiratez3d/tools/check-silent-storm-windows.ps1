# Read-only Silent Storm Reconstruction build preflight. PowerShell 5.1+.
# Does not install software, download code, or modify Steam content.
$ErrorActionPreference = 'Continue'
function Probe($name, $ok, $detail) {
  [pscustomobject]@{Check=$name; Pass=[bool]$ok; Detail=[string]$detail}
}
$results = @()
$cm = Get-Command cmake.exe -ErrorAction SilentlyContinue
if (-not $cm) {
  foreach ($candidate in @('C:\Program Files\CMake\bin\cmake.exe','C:\Program Files (x86)\Microsoft Visual Studio\Installer\cmake.exe')) {
    if (Test-Path $candidate) { $cm = Get-Item $candidate; break }
  }
}
$cmVersion = if ($cm) { (& $cm.Source --version 2>&1 | Select-Object -First 1) } else { 'NOT_FOUND' }
$cmOk = $false
if ($cmVersion -match 'cmake version (\d+)\.(\d+)') {
  $cmOk = ([int]$Matches[1] -gt 3 -or ([int]$Matches[1] -eq 3 -and [int]$Matches[2] -ge 21))
}
$results += Probe 'cmake>=3.21' $cmOk $cmVersion
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$vsPath = $null
if (Test-Path $vswhere) {
  $vsPath = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1)
}
$vcOk = $false
$vcDetail = 'VS2022+ x86 toolchain not detected'
if ($vsPath) {
  $msvc = Join-Path $vsPath 'VC\Auxiliary\Build\vcvars32.bat'
  $year = if ($vsPath -match 'Visual Studio\\(\d{4})') { [int]$Matches[1] } else { 0 }
  $vcOk = ($year -ge 2022 -and (Test-Path $msvc))
  $vcDetail = "$vsPath; vcvars32=$([bool](Test-Path $msvc))"
}
$results += Probe 'VS2022+ MSVC x86' $vcOk $vcDetail
$libraryFile = 'C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf'
$roots = @('C:\Program Files (x86)\Steam')
if (Test-Path $libraryFile) {
  $roots += (Get-Content -LiteralPath $libraryFile | ForEach-Object {
    if ($_ -match '"path"\s+"([^"]+)"') { $Matches[1] -replace '\\\\','\' }
  })
}
$roots = @($roots | Where-Object { $_ } | Select-Object -Unique)
$found = @()
foreach ($root in $roots) {
  $apps = Join-Path $root 'steamapps'
  if (-not (Test-Path $apps)) { continue }
  $manifest = Get-ChildItem -LiteralPath $apps -Filter 'appmanifest_*.acf' -ErrorAction SilentlyContinue
  foreach ($f in $manifest) {
    $raw = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($raw -notmatch '"name"\s+"Silent Storm"') { continue }
    if ($raw -match '"installdir"\s+"([^"]+)"') {
      $install = Join-Path (Join-Path $apps 'common') $Matches[1]
      if (Test-Path $install) { $found += $install }
    }
  }
}
$results += Probe 'Installed Steam game data' ($found.Count -gt 0) ($(if($found.Count){$found -join '; '}else{'No installed Silent Storm app manifest and directory in registered libraries'}))
$git = Get-Command git.exe -ErrorAction SilentlyContinue
$results += Probe 'git' ([bool]$git) ($(if($git){$git.Source}else{'NOT_FOUND'}))
$results | Format-Table -AutoSize | Out-String -Width 230 | Write-Output
if (-not $cmOk -or -not $vcOk -or $found.Count -eq 0) { exit 2 }
exit 0
