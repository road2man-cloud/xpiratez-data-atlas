# R22-O addon art: separate test runtime, no shared checkout/source edits.
param(
  [string]$Root = 'D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102',
  [string]$Repo = 'D:\daphne_auto\xpiratez-data-atlas',
  [string]$Art = 'D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\stage32i-art-r22p-collab-native-f11',
  [string]$EngineReceipt = 'D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\stage32i-r22p-collab-native-engine\engine-test-receipt.json',
  [string]$Runtime = 'D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102\gog-runtime-f11-r22p-collab-native',
  [switch]$PortraitQA
)
$ErrorActionPreference='Stop'
$baseEngine = $EngineReceipt
$receipt = Get-Content -LiteralPath $baseEngine -Raw | ConvertFrom-Json
$manifestFile = Get-ChildItem -LiteralPath $Art -Filter 'source-f11-*-manifest.json' | Select-Object -First 1
if(-not $manifestFile){throw 'No art manifest'}
$m = Get-Content -LiteralPath $manifestFile.FullName -Raw | ConvertFrom-Json
if($m.artwork.vertices -ne 1553 -or $m.artwork.triangles -ne 2410 -or $m.r22Ornaments.newVertices -ne 0 -or $m.r22Ornaments.newTriangles -ne 0){throw 'Fixed S2 budget exceeded'}
if((Get-FileHash -LiteralPath $receipt.nativeTestExecutable -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.diagnosticEngineSha256){throw 'Diagnostic game changed'}
foreach($key in @('native','uv','atlas','skin')){
  $f = Join-Path $Art $m.export.$key.name
  if((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant() -ne $m.export.$key.sha256){throw ('Asset checksum mismatch '+$key)}
}
if($m.export.native.sha256 -ne $receipt.nativeMeshSHA256 -or $m.export.uv.sha256 -ne $receipt.nativeUVSHA256 -or $m.export.atlas.sha256 -ne $receipt.patchedAtlasSHA256){throw 'Engine/asset hashes mismatch'}
if(Test-Path -LiteralPath $Runtime){throw 'Private runtime already exists; never overwrite previous workers'}
$ref = Join-Path $Root 'gog-runtime-smoke-stage31c-isolated'
$actor = Join-Path $Root 'stage32g-delivery'
$terrain = Join-Path $Root 'battle-bridge\stage32b-native-full-crash40-r9'
$save = Join-Path $actor 'source-snapshot.sav'
$saveSHA='9cae906d79ad9f509412dc19804afd3e80ae7e566e19de5699d9747af0e98f55'
if((Get-FileHash -LiteralPath $save -Algorithm SHA256).Hash.ToLowerInvariant() -ne $saveSHA){throw 'Original campaign save changed'}
New-Item -ItemType Directory -Path $Runtime | Out-Null
foreach($n in @('res','Mod','AlwaysCritical','APForInventoryUsage','HeadshotShouldKill','ImprovedBackstab')){
  $from=Join-Path $ref $n
  if(Test-Path -LiteralPath $from){New-Item -ItemType Junction -Path (Join-Path $Runtime $n) -Target $from | Out-Null}
}
foreach($n in @('cfg','scripts')){
  Copy-Item -LiteralPath (Join-Path $ref $n) -Destination (Join-Path $Runtime $n) -Recurse
}
foreach($f in Get-ChildItem -LiteralPath $ref -File){
  if($f.Name -match '^(game|XPZ3D_.*)\.exe$' -or $f.Name.StartsWith('_') -or $f.Name.EndsWith('.log') -or $f.Name.EndsWith('.tmp')){continue}
  Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $Runtime $f.Name)
}
foreach($e in Get-ChildItem Env: | Where-Object {$_.Name -like 'XPZ3D_STAGE32I_*' -or $_.Name -like 'XPZ3D_STAGE32H_*'}){
  [Environment]::SetEnvironmentVariable($e.Name,'0','Process')
}
foreach($flag in @('XPZ3D_STAGE31_NAV_PROFILE','XPZ3D_STAGE31_CACHE_IMPORT_PRECALC','XPZ3D_STAGE32H_NATIVE_SKIN','XPZ3D_STAGE32I_ORIGINAL_SKIN_R20','XPZ3D_STAGE32I_FACE_CAMERA','XPZ3D_STAGE32I_ART_MATERIALS','XPZ3D_STAGE32I_BUMP','XPZ3D_STAGE32H_ACTION_PROBE_R3E')){
  [Environment]::SetEnvironmentVariable($flag,'1','Process')
}
if($PortraitQA){
  $env:XPZ3D_STAGE32I_PORTRAIT_QA_R19='1'
  $env:XPZ3D_STAGE32I_QA_RENDER_WIDTH='1600'
  $env:XPZ3D_STAGE32I_QA_RENDER_HEIGHT='1200'
  $env:XPZ3D_STAGE32I_QA_AMBIENT='0.14'
  $env:XPZ3D_STAGE32I_QA_KEY='0.18'
}
$env:XPZ3D_STAGE32I_NATIVE_CLIP_QA_R19V='1'
$env:XPZ3D_STAGE32I_DIFFUSE_PATH = Join-Path $Art $m.export.atlas.name
$env:XPZ3D_STAGE32H_SKIN_PATH = Join-Path $Art $m.export.skin.name
$args=@{
  Runtime=$Runtime
  BuildExe=$receipt.nativeTestExecutable
  SourceSave=$save
  MeshPath=(Join-Path $terrain 'xpz3d-terrain-v1.meshbin')
  ManifestPath=(Join-Path $terrain 'terrain-manifest.json')
  CollisionPath=(Join-Path $terrain 'xpz3d-collision-proxy-v1.meshbin')
  CollisionManifestPath=(Join-Path $terrain 'collision-proxy-manifest.json')
  VisualSkinManifest=(Join-Path $terrain 'visual-skin-manifest.json')
  GridX=40
  GridY=40
  SourceRosterPlan=(Join-Path $actor 'stage32e-player-visual-prototypes.json')
  SourceActorArtManifest=$manifestFile.FullName
  SpawnPrototype=$true
  VerifySourceArtMovement=$true
  CaptureSourceArtCloseUps=$true
  HideSourceStockActor=$true
  ActionProbeR3E=$true
  VisualSMGAnimR3F=$true
  MissionTimeoutSeconds=240
}
& (Join-Path $Repo 'experiments\xpiratez3d\stage30\windows-source-unit-visual-smg-r3f.ps1') @args
if($LASTEXITCODE){throw ('Native visual smoke rejected code '+$LASTEXITCODE)}
if((Get-FileHash -LiteralPath $save -Algorithm SHA256).Hash.ToLowerInvariant() -ne $saveSHA){throw 'Source game save altered'}
Write-Output ('R22O_NATIVE_VISUAL_SMOKE_COMPLETE='+$Runtime)
