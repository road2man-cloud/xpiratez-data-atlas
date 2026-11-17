$ErrorActionPreference='Stop'
$root='D:\daphne_auto\F11-r21AO-rev96-user-trim-20261117'
$web='D:\daphne_auto\F11_Web_Review_ghpages_20261105\f11\r21al'
$release=Join-Path $root 'release-r24-posterior-anatomy-20261118'
$zip=Join-Path $root 'XPZ3D_F11_REV96_R24_POSTERIOR_ANATOMY_20261118.zip'
if((Test-Path $release) -or (Test-Path $zip)){throw 'Refuse to overwrite prior release'}
New-Item -ItemType Directory -Path $release | Out-Null
New-Item -ItemType Directory -Path (Join-Path $release 'captures') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $release 'qa') | Out-Null
function Cp($from,$to) {
 if(!(Test-Path -LiteralPath $from)){throw "Missing package source $from"}
 if(Test-Path -LiteralPath $to){throw "Collision $to"}
 Copy-Item -LiteralPath $from -Destination $to
}
$models=@(
'r21AO-F11-user101-native-skin-bowl-r22-dome.glb',
'r21AO-F11-user101-native-retopo-r23-lbsweld.glb',
'r21AO-F11-user101-native-retopo-r24-posterior-cleft-gentle.glb',
'r21AO-F11-user101-native-retopo-r24-posterior-cleft-sculpt.glb',
'r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v2.glb',
'r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-wide-v2.glb',
'r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v3.glb',
'r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-wide-v3.glb')
foreach($name in $models){ Cp (Join-Path $root $name) (Join-Path $release $name) }
foreach($name in @('review-rev96-user101-r24.html','viewer-rev96-user101-r24.js','pose_skinning.js')){
 Cp (Join-Path $web $name) (Join-Path $release $name)
}
foreach($name in @('build_rev96_user101_r24_posterior_cleft.cjs','build_rev96_user101_r24_posterior_ellipse_v2.cjs','build_rev96_user101_r24_posterior_ellipse_v3.cjs','verify_rev96_user101_r24_anatomy.cjs','audit_rev96_r24_soft_v3_pose.cjs','inspect_rev96_r24_soft_v3_union.cjs','rev95-user-trim-101faces-20261116T152807Z.json','REV96_USER101_R24_HANDOFF_20261118.md')){
 Cp (Join-Path $root $name) (Join-Path $release $name)
}
Get-ChildItem $root -File | Where-Object {$_.Name -match '^(REV96_USER101_R24_|rev96-r24-soft-v3-union-boundary\.json)' -and $_.Extension -eq '.json'} | ForEach-Object {Cp $_.FullName (Join-Path (Join-Path $release 'qa') $_.Name)}
Get-ChildItem $root -File -Filter 'rev96-r24-soft-v3-canonical-*.png' | ForEach-Object {Cp $_.FullName (Join-Path (Join-Path $release 'captures') $_.Name)}
$cmd=@'
@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
 start "XPZ3D R24 Server" /min py -3 -m http.server 8874 --bind 127.0.0.1
) else (
 start "XPZ3D R24 Server" /min python -m http.server 8874 --bind 127.0.0.1
)
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8874/review-rev96-user101-r24.html"
'@
[IO.File]::WriteAllText((Join-Path $release 'start_review.cmd'),$cmd,(New-Object System.Text.UTF8Encoding($false)))
$files=Get-ChildItem $release -Recurse -File | ForEach-Object{
 [pscustomobject]@{file=$_.FullName.Substring($release.Length+1).Replace('\','/');size=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$manifest=[ordered]@{schema='xpz3d/f11/r24-standalone-release/v1';creationUTC=(Get-Date).ToUniversalTime().ToString('o');bestModel='r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v3.glb';quality='local-geometry-improved_visual-acceptance-pending';fileCount=$files.Count;files=$files}
$manifestPath=Join-Path $root 'REV96_USER101_R24_RELEASE_MANIFEST.json'
if(Test-Path $manifestPath){throw 'Refuse manifest overwrite'}
$manifest|ConvertTo-Json -Depth 8|Out-File -LiteralPath $manifestPath -Encoding utf8
Cp $manifestPath (Join-Path $release 'REV96_USER101_R24_RELEASE_MANIFEST.json')
Compress-Archive -Path (Join-Path $release '*') -DestinationPath $zip -CompressionLevel Optimal
[pscustomobject]@{release=$zip;sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item $zip).Length;contents=((Get-ChildItem $release -File -Recurse|Measure-Object).Count);models=$models.Count} | ConvertTo-Json -Compress
