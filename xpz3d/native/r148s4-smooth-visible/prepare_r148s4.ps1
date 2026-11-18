$ErrorActionPreference='Stop'
$root='D:\daphne_auto\XPZ3D_R148S4_NATIVE_SMOOTH_20261119'
$prior='D:\daphne_auto\XPZ_R147_F11_SKINNING_20261119'
$parent='D:\daphne_auto\XPZ_R148_HUD_TERRAIN_F11_20261119\R148S3_PAIRED_LOCAL_CANDIDATE'
$s2=Join-Path $root 's2'
$assets=Join-Path $s2 'assets'
New-Item -ItemType Directory -Force -Path $root,$s2,$assets | Out-Null
$src=Join-Path $prior 's2'
Get-ChildItem -LiteralPath $src -Filter '*.h' -File | ForEach-Object {
 Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $s2 $_.Name)
}
Copy-Item -LiteralPath (Join-Path $src 'iMissionBase-r136.cpp') -Destination (Join-Path $s2 'iMissionBase-r136.cpp')
$build=Get-Content -LiteralPath (Join-Path $src 'build_r147_s2.py') -Raw
$build=$build.Replace('r147-skin','r148s4-smooth')
$build=$build.Replace('R147_S2_BUILD_RECEIPT','R148S4_S2_BUILD_RECEIPT')
$build=$build.Replace('r147.reset_r136_terrain_actors_skinned','r148s4.reset_r136_terrain_actors_interpolated')
[IO.File]::WriteAllText((Join-Path $s2 'build_r148s4_s2.py'),$build,[Text.UTF8Encoding]::new($false))
foreach($name in @('f11_r34q.skin','f11_r34x.skin','f11_r34q.manifest.json','f11_r34x.manifest.json')){
 Copy-Item -LiteralPath (Join-Path $prior ('assets\'+$name)) -Destination (Join-Path $assets $name)
}
$game=Join-Path $parent 'oxce-runtime\openxcom.exe'
if(!(Test-Path -LiteralPath $game)){throw 'R148S3_PACKAGED_OXCE_NOT_FOUND'}
$sha=(Get-FileHash -LiteralPath $game -Algorithm SHA256).Hash
if($sha -ne 'EE84D0C5A2A727A3D5DFC7E50D0FC3A850A472DC4824208F7474FC8335F54101'){
 throw ('R148S3_OXCE_SHA_MISMATCH '+$sha)
}
Write-Output 'R148S4_S2_SOURCES_PREPARED'
Write-Output ('PARENT_OXCE_SHA='+$sha)
