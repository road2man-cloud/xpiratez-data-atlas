# Stage25 isolated native Visual Studio Win32 build (no original game files).
$ErrorActionPreference='Stop'
$root='D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102'
$cmake='D:\daphne_auto\tools\cmake\cmake-3.31.6-windows-x86_64\bin\cmake.exe'
$source=Join-Path $root 'Silent-Storm-XPZStage25'
$build=Join-Path $root 'build-xpz-stage25-win32'
$logDir=Join-Path $root 'battle-bridge\stage25'
New-Item -ItemType Directory -Force -Path $logDir|Out-Null
$stamp=[DateTimeOffset]::Now.ToString('yyyyMMddTHHmmss')
$log=Join-Path $logDir ('build-'+$stamp+'.log')
$report=Join-Path $logDir ('build-'+$stamp+'.json')
& $cmake -S $source -B $build -G 'Visual Studio 17 2022' -A Win32 *> $log
if($LASTEXITCODE -ne 0){throw 'Stage25 cmake configure failed; see '+$log}
& $cmake --build $build --config Release --target Game --parallel 10 *>> $log
$code=$LASTEXITCODE
$result=[ordered]@{
 schema='xpz3d.stage25.build.v1'
 completedAt=[DateTimeOffset]::Now.ToString('O')
 exitCode=$code
 sourcePath=$source
 buildPath=$build
 log=$log
 compiled=$false
}
$exe=Join-Path $build 'Release\Game.exe'
if($code -eq 0 -and (Test-Path $exe)){
 $result.compiled=$true
 $result.exe=$exe
 $result.exeSha256=(Get-FileHash $exe -Algorithm SHA256).Hash
 $result.exeBytes=(Get-Item $exe).Length
}
$json=$result|ConvertTo-Json
[IO.File]::WriteAllText($report,$json,(New-Object System.Text.UTF8Encoding($false)))
Write-Output $json
if($code -ne 0){exit $code}
