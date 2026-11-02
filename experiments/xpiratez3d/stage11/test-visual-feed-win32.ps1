# Win32 smoke tests for the exact XPZVisualFeed.cpp used in Silent Storm Game.exe.
# Synthetic data only. Does not access Steam files or campaign saves.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$BuildTools,
 [switch]$KeepTestFiles
)
$ErrorActionPreference = 'Stop'
function RunFeed([string]$bin,[string]$path) {
  $prior=$ErrorActionPreference
  $ErrorActionPreference='Continue'
  try {
    $output=(& $bin $path 2>&1 | Out-String)
    return @{ Exit=$LASTEXITCODE; Output=$output }
  } finally { $ErrorActionPreference=$prior }
}
function Assert($ok,[string]$why){if(-not $ok){throw $why}}
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
$stage06=Join-Path $here '..\stage06\ss'
$src=Join-Path $stage06 'XPZVisualFeed.cpp'
$test=Join-Path $stage06 'visual_feed_test.cpp'
$valid=Join-Path $here 'testdata\synthetic-visual-feed-v2.txt'
$vc=Join-Path $BuildTools 'VC\Auxiliary\Build\vcvars32.bat'
foreach($p in @($src,$test,$valid,$vc)){Assert (Test-Path -LiteralPath $p) "Required input missing: $p"}
$dir=Join-Path $env:TEMP ('xpzvisual-x86-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$exe=Join-Path $dir 'visual-feed-test.exe'
try{
  $line="call `"$vc`" >nul && cl /nologo /EHsc /std:c++14 /W4 /Fe:`"$exe`" `"$src`" `"$test`""
  & $env:ComSpec /d /c $line
  Assert ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $exe)) 'Win32 visual feed parser failed compilation'
  $validResult=RunFeed $exe $valid
  Assert ($validResult.Exit -eq 0) "Valid synthetic feed rejected: $($validResult.Output)"
  Assert ($validResult.Output -match 'ACCEPTED visual-only seq=0') "Unexpected output: $($validResult.Output)"
  Assert ($validResult.Output -match 'units=2') "Expected two units: $($validResult.Output)"
  $original=[IO.File]::ReadAllText($valid)
  $badHeader=Join-Path $dir 'bad-header.feed'
  [IO.File]::WriteAllText($badHeader,$original.Replace('XPZ3D2','BADFEED'))
  $invalid=RunFeed $exe $badHeader
  Assert ($invalid.Exit -eq 3 -and $invalid.Output -match 'REJECTED') 'Invalid header was not rejected'
  $dupe=Join-Path $dir 'duplicate-unit.feed'
  $unit="U`t21`t0`t0`t1`t2`t0`t65`t38`t50`t0`t90"
  $dupeContent=$original.Replace($unit,$unit+"`n"+$unit)
  Assert ($dupeContent -ne $original) 'Synthetic fixture anchor missing'
  [IO.File]::WriteAllText($dupe,$dupeContent)
  $dupeOutput=RunFeed $exe $dupe
  Assert ($dupeOutput.Exit -eq 3 -and $dupeOutput.Output -match 'REJECTED') 'Duplicate unit identity was not rejected'
  $truncated=Join-Path $dir 'unclosed.feed'
  $unclosed=$original.Replace("E`t0", '')
  Assert ($unclosed -ne $original) 'Closing frame not found'
  [IO.File]::WriteAllText($truncated,$unclosed)
  $truncatedOutput=RunFeed $exe $truncated
  Assert ($truncatedOutput.Exit -eq 3 -and $truncatedOutput.Output -match 'REJECTED') 'Unclosed frame was not rejected'
  Write-Output ('X86_VISUAL_FEED_TEST_BINARY_SHA256='+(Get-FileHash $exe -Algorithm SHA256).Hash)
  Write-Output 'WIN32_VISUAL_FEED_TESTS=4/4 PASS'
  Write-Output 'REAL_SILENT_STORM_RUNTIME_TEST=NOT_ATTEMPTED'
}finally{if(-not $KeepTestFiles){Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue}}
# The last intentionally rejected sample exits 3; the overall test runner succeeded.
exit 0
