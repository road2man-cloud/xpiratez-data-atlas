$ErrorActionPreference='Stop'
$base='D:\daphne_auto\XPZ3D_R148S4_NATIVE_SMOOTH_20261119'
$root='D:\daphne_auto\XPZ3D_R148S5_SOLID_TERRAIN_20261119'
$s2=Join-Path $root 's2'
New-Item -ItemType Directory -Force -Path $s2,(Join-Path $s2 'assets') | Out-Null
Get-ChildItem -LiteralPath (Join-Path $base 's2') -Filter '*.h' -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $s2 $_.Name)
}
Copy-Item -LiteralPath (Join-Path $base 's2\iMissionBase-r136.cpp') -Destination (Join-Path $s2 'iMissionBase-r136.cpp')
foreach($n in @('f11_r34q.skin','f11_r34x.skin','f11_r34q.manifest.json','f11_r34x.manifest.json')){
 Copy-Item -LiteralPath (Join-Path $base ('s2\assets\'+$n)) -Destination (Join-Path $s2 ('assets\'+$n))
}
$build=Get-Content -LiteralPath (Join-Path $base 's2\build_r148s4_s2.py') -Raw
$build=$build.Replace('r148s4-smooth','r148s5-solid').Replace('R148S4_S2_BUILD_RECEIPT','R148S5_S2_BUILD_RECEIPT')
$build=$build.Replace('r148s4.reset_r136_terrain_actors_interpolated','r148s5.reset_r136_terrain_solid_actors')
[IO.File]::WriteAllText((Join-Path $s2 'build_r148s5_s2.py'),$build,[Text.UTF8Encoding]::new($false))
$game=Join-Path $base 'R148S4_PAIRED_LOCAL_CANDIDATE\oxce-runtime\openxcom.exe'
$sha=(Get-FileHash -LiteralPath $game -Algorithm SHA256).Hash
if($sha -ne 'EE84D0C5A2A727A3D5DFC7E50D0FC3A850A472DC4824208F7474FC8335F54101'){throw ('OXCE_PARENT_MISMATCH '+$sha)}
Write-Output 'R148S5_SOURCE_STAGED'
Write-Output ('CUMULATIVE_OXCE_PARENT_SHA256='+$sha)
