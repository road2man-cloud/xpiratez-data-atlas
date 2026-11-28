# R138J N4 native S2 isolated build installer.
# Run from a trusted Windows console. Uses only local existing S2 source/toolchain.
# It NEVER modifies or redistributes original engine source, libs, or executables.
$ErrorActionPreference='Stop'
$source='D:\daphne_auto\_xpz3d_launch_integration_20261117\r138e-s2-character'
$dest='D:\daphne_auto\_xpz3d_launch_integration_20261117\r138j-hw-n4-native-20261128'
$packetUrl='https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/main/experimental/xpz3d/f11/r138j-hw-native-adapter-20261128/output/R36HW_N4_STATIC_XPZC.bin'
$packetSHA='31b1c7e62573413fc3ef3a8ea9511954c2ecc315ced754d837ce204d111f9ad5'
$inputs=@('iMissionBase-r138e.cpp','XPZ3DS2CharacterR138E.h','BUILD_R138E_NATIVE.ps1')
foreach($name in $inputs){if(-not(Test-Path (Join-Path $source $name))){throw "Source missing: $name"}}
New-Item -ItemType Directory -Path $dest -Force|Out-Null
foreach($name in $inputs){Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $dest $name) -Force}
$packet=Join-Path $dest 'R36HW_N4_STATIC_XPZC.bin'
Invoke-WebRequest -Uri $packetUrl -UseBasicParsing -OutFile $packet
$sha=(Get-FileHash -LiteralPath $packet -Algorithm SHA256).Hash.ToLowerInvariant()
if($sha -ne $packetSHA){throw "Native input packet hash mismatch: $sha"}
$hpath=Join-Path $dest 'XPZ3DS2CharacterR138E.h'
$header=[IO.File]::ReadAllText($hpath)
$before1='hdr.triangles!=2100'
$before2='nsum==2100'
if(-not $header.Contains($before1) -or -not $header.Contains($before2)){throw 'Unrecognized native header; no unreviewed automatic patch'}
$header=$header.Replace($before1,'(hdr.triangles<1||hdr.triangles>2100)')
$header=$header.Replace($before2,'nsum==hdr.triangles')
[IO.File]::WriteAllText($hpath,$header,(New-Object System.Text.UTF8Encoding($false)))
$buildPath=Join-Path $dest 'BUILD_R138E_NATIVE.ps1'
$build=[IO.File]::ReadAllText($buildPath)
if(-not $build.Contains('Game-r138f-native-R36MK-idle.exe')){throw 'Unexpected native build script'}
$build=$build.Replace('Game-r138f-native-R36MK-idle.exe','Game-r138j-native-R36HW-N4.exe')
$build=$build.Replace("version='R138E'","version='R138J'")
$build=$build.Replace("modelSource='R36MK 2100 triangles'","modelSource='R36HW N4 2076 triangles'")
[IO.File]::WriteAllText($buildPath,$build,(New-Object System.Text.UTF8Encoding($false)))
& $buildPath
if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw "Native compile/link exit code: $LASTEXITCODE"}
$exe=Join-Path $dest 'Game-r138j-native-R36HW-N4.exe'
if(-not(Test-Path $exe)){throw 'Native game binary not produced'}
$receipt=[ordered]@{
  schema='xpz3d.r138j.hw_native_build/v1'
  model='R36HW N4'
  packetPath=$packet
  packetSHA256=$packetSHA
  packetTriangles=2076
  nativeExe=$exe
  nativeExeSha256=(Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant()
  nativeExeBytes=(Get-Item $exe).Length
  sourceEngineOriginalsUntouched=$true
  dynamicSkeletonImplemented=$false
  uvNormalMapImplemented=$false
  actualNativeS2RenderVerified=$false
}
$receipt|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $dest 'R138J_BUILD_RECEIPT.json') -Encoding UTF8
$receipt|ConvertTo-Json -Compress
