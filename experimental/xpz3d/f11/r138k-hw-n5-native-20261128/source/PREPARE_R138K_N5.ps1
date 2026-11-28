# R138K: stage the built R138J S2 diagnostic executable with the N5 native packet.
# Only operates on separate r138k test directory; never writes to the original S2 engine/runtime.
$ErrorActionPreference='Stop'
$base='D:\daphne_auto\_xpz3d_launch_integration_20261117'
$previous=Join-Path $base 'r138j-hw-n4-native-20261128'
$dest=Join-Path $base 'r138k-hw-n5-native-20261128'
$nativeSource=Join-Path $previous 'Game-r138j-native-R36HW-N4.exe'
$packet='R36HW_N5_STATIC_XPZC.bin'
$expectedSHA='ef2f059134920c694d030621d1dba8d1c8bae7a92fe19a6361d150d8a5fcd64b'
$packetURL='https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/main/experimental/xpz3d/f11/r138k-hw-n5-native-20261128/output/R36HW_N5_STATIC_XPZC.bin'
if(-not (Test-Path $nativeSource)){throw 'R138J isolated native build missing; run PREPARE_R138J_NATIVE.ps1 first'}
$previousReceipt=Join-Path $previous 'R138J_BUILD_RECEIPT.json'
if(-not(Test-Path $previousReceipt)){throw 'R138J build receipt missing'}
$prior=Get-Content -LiteralPath $previousReceipt -Raw|ConvertFrom-Json
$actual=(Get-FileHash -LiteralPath $nativeSource -Algorithm SHA256).Hash.ToLowerInvariant()
if($actual -ne $prior.nativeExeSha256){throw 'Previously built native binary SHA mismatch'}
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$packetPath=Join-Path $dest $packet
Invoke-WebRequest -Uri $packetURL -UseBasicParsing -OutFile $packetPath -TimeoutSec 30
$readSHA=(Get-FileHash -LiteralPath $packetPath -Algorithm SHA256).Hash.ToLowerInvariant()
if($readSHA -ne $expectedSHA){throw "N5 native packet SHA mismatch: $readSHA"}
$buffer=[IO.File]::ReadAllBytes($packetPath)
if([Text.Encoding]::ASCII.GetString($buffer,0,4) -ne 'XPZC' -or [BitConverter]::ToUInt32($buffer,8) -ne 10 -or [BitConverter]::ToUInt32($buffer,12) -ne 2080){throw 'Invalid 10-group, 2080-triangle N5 header'}
$exe=Join-Path $dest 'Game-r138k-native-R36HW-N5.exe'
Copy-Item -LiteralPath $nativeSource -Destination $exe -Force
$receipt=[ordered]@{
 schema='xpz3d.r138k.native_n5_staging/v1'
 model='R36HW N5 skinned GLB, S2 static bind pose'
 nativeExe=$exe
 nativeExeSha256=(Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant()
 nativeS2Input=$packetPath
 inputSHA256=$readSHA
 triangles=2080
 groups=10
 modelSkeletonJoints=63
 originalEngineUntouched=$true
 dynamicS2SkeletonImplemented=$false
 nativeUVAndNormalMapImplemented=$false
 originalR138JCompiledBinaryReused=$true
 nativeWindowRenderedAndCaptured=$false
}
$receipt|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $dest 'R138K_STAGE_RECEIPT.json') -Encoding UTF8
$receipt|ConvertTo-Json -Compress
