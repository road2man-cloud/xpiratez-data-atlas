# XPZ3D F11 rev96 r31: copy real model and source artifacts to Git checkout without overwriting previous work
$ErrorActionPreference='Stop'
$src='D:\daphne_auto\F11-r21AO-rev96-user-trim-20261117'
$dst='D:\daphne_auto\F11-r21AO-rev96-github-publish-20261117\xpz3d\f11\experiments\rev96-r31-convex-weld-20261118'
$models=@(
 'r21AO-F11-user101-integrated-oval-r31a-curved-lateral-skin-retopo.glb',
 'r21AO-F11-user101-integrated-oval-r31b-thick-posterior-tissue.glb',
 'r21AO-F11-user101-integrated-oval-r31c-convex-g1-seam-fairing.glb',
 'r21AO-F11-user101-integrated-oval-r31d-convex-seam-collar.glb',
 'r21AO-F11-user101-integrated-oval-r31e-smooth-convex-surface.glb',
 'r21AO-F11-user101-integrated-oval-r31f-physically-welded-convex.glb',
 'r21AO-F11-user101-integrated-oval-r31g-welded-convex-fairing.glb'
)
$files=@(
 'rev95-user-trim-101faces-20261116T152807Z.json',
 'REV96_USER101_R31_SELECTION.json',
 'review-rev96-user101-r31.html',
 'stage_rev96_r31_git_artifacts.ps1'
)+$models
$builds=@(
 'build_rev96_user101_r31a_curved_lateral_skin_retopo.cjs',
 'build_rev96_user101_r31b_thick_posterior_tissue.cjs',
 'build_rev96_user101_r31c_convex_g1_seam_fairing.cjs',
 'build_rev96_user101_r31d_convex_seam_collar.cjs',
 'build_rev96_user101_r31e_smooth_convex_surface.cjs',
 'build_rev96_user101_r31f_physical_seam_weld.cjs',
 'build_rev96_user101_r31g_welded_convex_fairing.cjs'
)
$renders=@(
 'render_rev96_r31a_curved_lateral.cjs',
 'render_rev96_r31b_thick_posterior.cjs',
 'render_rev96_r31c_convex_g1.cjs',
 'render_rev96_r31d_convex_collar.cjs',
 'render_rev96_r31e_smooth_convex.cjs',
 'render_rev96_r31f_welded_convex.cjs',
 'render_rev96_r31g_welded_convex.cjs'
)
$stems=@(
 'rev96-r31a-curved-lateral',
 'rev96-r31b-thick-posterior',
 'rev96-r31c-convex-g1',
 'rev96-r31d-convex-collar',
 'rev96-r31e-smooth-convex',
 'rev96-r31f-welded-convex',
 'rev96-r31g-welded-convex'
)
$files+=$builds+$renders
foreach($version in 'A','B','C','D','E','F','G'){$files+="REV96_USER101_R31${version}_BUILD.json"}
foreach($stem in $stems){$files+="$stem-canonical-render-report.json"}
foreach($stem in $stems){
 $angles=if($stem -match 'r31(f|g)-'){@(0,25,40,55)}else{@(55)}
 foreach($angle in $angles){
  foreach($view in @('under','behind')){
   $styles=if($stem -match 'r31(f|g)-'){@('solid','wire')}else{@('solid')}
   foreach($style in $styles){
     $files+="$stem-canonical-$angle-$view-$style.png"
   }
  }
 }
}
$files=@($files|Select-Object -Unique)
foreach($name in $files){if(-not (Test-Path -LiteralPath (Join-Path $src $name) -PathType Leaf)){throw "Missing source $name"}}
New-Item -ItemType Directory -Path $dst -Force|Out-Null
$record=@()
foreach($name in $files){
 $from=Join-Path $src $name;$to=Join-Path $dst $name
 $hash=(Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash.ToLowerInvariant()
 if(Test-Path -LiteralPath $to){
   if((Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash){throw "Refuse overwrite $name"}
 }else{Copy-Item -LiteralPath $from -Destination $to}
 $record+=[ordered]@{name=$name;sha256=$hash;bytes=(Get-Item -LiteralPath $to).Length}
}
$manifest=[ordered]@{schema='xpz3d/f11/rev96/r31-artifacts-v1';correctedCurvature='convex';baseline='r31f';experimental='r31g';files=$record;protected=@('101 manual deleted faces','754 manual sculpt positions','106 controls','529 original authored faces','63 bones','370 garment faces');status='actual CJS GLB and image capture files, not final visual acceptance'}
$manifestPath=Join-Path $dst 'REV96_R31_ARTIFACT_MANIFEST.json'
$serialized=$manifest|ConvertTo-Json -Depth 7
if(Test-Path -LiteralPath $manifestPath){
 if((Get-Content -Raw -LiteralPath $manifestPath).Trim() -ne $serialized.Trim()){throw 'Refuse manifest overwrite'}
}else{[System.IO.File]::WriteAllText($manifestPath,$serialized,[System.Text.UTF8Encoding]::new($false))}
Write-Output "STAGED $($files.Count) FILES"
Write-Output "DEST $dst"
Write-Output "BASELINE SHA256 $((Get-FileHash -LiteralPath (Join-Path $dst 'r21AO-F11-user101-integrated-oval-r31f-physically-welded-convex.glb') -Algorithm SHA256).Hash.ToLowerInvariant())"
