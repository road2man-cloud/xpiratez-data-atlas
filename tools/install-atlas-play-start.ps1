param(
  [string]$GameRoot = 'C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez',
  [string]$SourceSave = '',
  [string]$GuideUrl = 'https://road2man-cloud.github.io/xpiratez-data-atlas/soldiers/modern/?careerClass=ordinary&routeStatus=complete#originMaxima',
  [switch]$NoLaunch
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $GameRoot).Path
$saves = Join-Path $root 'user\piratez'
$start = Join-Path $root 'XPZ_LATEST_INTEGRATED_START.cmd'
$guide = Join-Path $root 'XPZ_ATLAS_PLAY_GUIDE.url'
$launch = Join-Path $root 'XPZ_ATLAS_PLAY_START.cmd'
if (!(Test-Path -LiteralPath $start -PathType Leaf)) { throw 'Integrated game launcher missing' }
if ((Test-Path -LiteralPath $guide) -or (Test-Path -LiteralPath $launch)) { throw 'Atlas helpers already installed; refusing overwrite' }
if (!$SourceSave) {
  $SourceSave = (Get-ChildItem -LiteralPath $saves -Filter '*.sav' -File |
    Where-Object { $_.Name -notlike 'ATLAS_PLAYTEST_*' } |
    Sort-Object LastWriteTime -Descending |
    Where-Object { ((Get-Content -LiteralPath $_.FullName -Encoding UTF8 -TotalCount 16) -join [Environment]::NewLine) -notmatch '(?m)^mission:' } |
    Select-Object -First 1).FullName
}
if (!$SourceSave) { throw 'No strategic save found' }
$source = (Resolve-Path -LiteralPath $SourceSave).Path
if ([IO.Path]::GetDirectoryName($source) -ne $saves) { throw 'Source must belong to the game save directory' }
$utf8 = New-Object System.Text.UTF8Encoding($false,$true)
$original = [IO.File]::ReadAllBytes($source)
$text = $utf8.GetString($original)
$boundary = [regex]::Match($text,'(?m)^---\r?$')
if (!$boundary.Success) { throw 'Save header separator missing' }
$header = $text.Substring(0,$boundary.Index)
if ($header -match '(?m)^mission:' -or $header -notmatch 'piratez ver: v\.o2\b' -or $header -notmatch 'version:\s*Extended 8\.7\.1') { throw 'Expected compatible non-battle save' }
$body = $text.Substring($boundary.Index)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dest = Join-Path $saves ('ATLAS_PLAYTEST_'+$stamp+'.sav')
$newHeader = [regex]::Replace($header,'(?m)^name:[^\r\n]*','name: "ATLAS PLAYTEST '+$stamp+' (copy)"')
if ($newHeader -eq $header) { throw 'Save name not found' }
$bytes = $utf8.GetBytes($newHeader+$body)
$f = [IO.File]::Open($dest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try { $f.Write($bytes,0,$bytes.Length) } finally { $f.Dispose() }
$roundtrip = $utf8.GetString([IO.File]::ReadAllBytes($dest))
$split = [regex]::Match($roundtrip,'(?m)^---\r?$')
if (!$split.Success -or $roundtrip.Substring($split.Index) -cne $body) { throw 'Copied save body differs' }
$sha = [Security.Cryptography.SHA256]::Create()
try {
 if ([Convert]::ToBase64String($sha.ComputeHash([IO.File]::ReadAllBytes($source))) -ne [Convert]::ToBase64String($sha.ComputeHash($original))) { throw 'Source changed while copying' }
} finally { $sha.Dispose() }
[IO.File]::WriteAllText($guide,(@('[InternetShortcut]',('URL='+$GuideUrl),'') -join [Environment]::NewLine),[Text.Encoding]::ASCII)
$cmd = @'
@echo off
setlocal
cd /d "%~dp0"
start "" "%~dp0XPZ_ATLAS_PLAY_GUIDE.url"
powershell.exe -NoProfile -Command "$root=(Get-Location).Path; $p=Get-Process openxcom* -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0 -and $_.Path -and $_.Path.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)} | Select-Object -First 1; if($p){[void](New-Object -ComObject WScript.Shell).AppActivate($p.Id)}else{Start-Process -FilePath (Join-Path $root 'XPZ_LATEST_INTEGRATED_START.cmd') -WorkingDirectory $root}"
exit /b %ERRORLEVEL%
'@
[IO.File]::WriteAllText($launch,$cmd,[Text.Encoding]::ASCII)
$result = [ordered]@{source=$source;testSave=$dest;bodyUnchanged=$true;sourceUnchanged=$true;launcher=$launch;guide=$guide;gameStarted=$false;gameAlreadyRunning=$false;activated=$false}
if (!$NoLaunch) {
 $p = Get-Process openxcom* -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0 -and $_.Path -and $_.Path.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)} | Select-Object -First 1
 if ($p) { $result.gameAlreadyRunning=$true; $result.activated=(New-Object -ComObject WScript.Shell).AppActivate($p.Id) }
 else { Start-Process -FilePath $start -WorkingDirectory $root; $result.gameStarted=$true }
}
$result | ConvertTo-Json -Compress
