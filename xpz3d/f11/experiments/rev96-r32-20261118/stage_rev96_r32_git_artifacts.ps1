# Preserve XPZ3D F11 rev96 r32 source, GLB, reports and actual renders.
$ErrorActionPreference='Stop'
$src='D:\daphne_auto\F11-r21AO-rev96-user-trim-20261117'
$dst='D:\daphne_auto\F11-r21AO-rev96-github-publish-20261117\xpz3d\f11\experiments\rev96-r32-20261118'
$models=@(
 'r21AO-F11-user101-integrated-oval-r31f-physically-welded-convex.glb',
 'r21AO-F11-user101-integrated-oval-r32a-unfolded-convex-seam.glb',
 'r21AO-F11-user101-integrated-oval-r32b-wide-tangent-seam.glb',
 'r21AO-F11-user101-integrated-oval-r32c-welded-tangent-support-ring.glb',
 'r21AO-F11-user101-integrated-oval-r32d-broad-convex-fairing.glb',
 'r21AO-F11-user101-integrated-oval-r32e-constrained-convex-fairing.glb'
)
$builds=@(
 'build_rev96_user101_r32a_unfolded_convex_seam.cjs',
 'build_rev96_user101_r32b_wide_tangent_seam.cjs',
 'build_rev96_user101_r32c_welded_tangent_support_ring.cjs',
 'build_rev96_user101_r32d_broad_convex_fairing.cjs',
 'build_rev96_user101_r32e_constrained_convex_fairing.cjs'
)
$renders=@(
 'render_rev96_r32a_unfolded_convex.cjs',
 'render_rev96_r32b_wide_tangent.cjs',
 'render_rev96_r32c_support_ring.cjs',
 'render_rev96_r32d_broad_convex.cjs',
 'render_rev96_r32e_constrained_convex.cjs'
)
$stems=@(
 'rev96-r32a-unfolded-convex',
 'rev96-r32b-wide-tangent',
 'rev96-r32c-support-ring',
 'rev96-r32d-convex-fairing',
 'rev96-r32e-constrained-convex'
)
$files=@(
 'rev95-user-trim-101faces-20261116T152807Z.json',
 'REV96_USER101_R32_SELECTION.json',
 'review-rev96-user101-r32.html',
 'stage_rev96_r32_git_artifacts.ps1',
 'probe_rev96_r32_seam_orientation.cjs',
 'probe_rev96_r32a_seam_orientation.cjs'
)+$models+$builds+$renders
foreach($version in 'A','B','C','D','E'){$files+="REV96_USER101_R32${version}_BUILD.json"}
foreach($stem in $stems){
 $files+="$stem-canonical-render-report.json"
 foreach($angle in @(0,25,40,55)){
  foreach($view in @('under','behind')){
   foreach($style in @('solid','wire')){
    $files+="$stem-canonical-$angle-$view-$style.png"
   }
  }
 }
}
$files=@($files|Select-Object -Unique)
foreach($name in $files){
 $from=Join-Path $src $name
 if(-not (Test-Path -LiteralPath $from -PathType Leaf)){throw "Source is missing $name"}
}
New-Item -ItemType Directory -Path $dst -Force | Out-Null
$records=@()
foreach($name in $files){
 $from=Join-Path $src $name;$to=Join-Path $dst $name
 $hash=(Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash.ToLowerInvariant()
 if(Test-Path -LiteralPath $to){
  if((Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash){throw "Existing file collision: $name"}
 }else{Copy-Item -LiteralPath $from -Destination $to}
 $records += [ordered]@{name=$name;sha256=$hash;bytes=(Get-Item -LiteralPath $to).Length}
}
$manifest=[ordered]@{
 schema='xpz3d/f11/rev96/r32-artifacts-v1'
 selected='r32c'
 visualCandidate='r32e'
 rejected=@('r32d')
 curvature='convex downward'
 fileCount=$records.Count
 files=$records
 protected=@('101 deleted authored faces','754 manually edited positions','106 controls','529 authored faces','63 bones','370 garment triangles')
 pending=@('Full posterior oval aesthetic approval','Wing-like body panel cleanup','Complete closed manifold','In-game animation evaluation')
}
$manifestPath=Join-Path $dst 'REV96_R32_ARTIFACT_MANIFEST.json'
$json=$manifest | ConvertTo-Json -Depth 7
if(Test-Path -LiteralPath $manifestPath){
 $old=(Get-Content -Raw -LiteralPath $manifestPath).Trim()
 if($old -ne $json.Trim()){throw 'Manifest changed externally, refusing overwrite'}
}else{[System.IO.File]::WriteAllText($manifestPath,$json,[System.Text.UTF8Encoding]::new($false))}
Write-Output "STAGED $($records.Count) ARTIFACTS"
Write-Output "DEST $dst"
Write-Output "MODEL SHA256 $((Get-FileHash -LiteralPath (Join-Path $dst 'r21AO-F11-user101-integrated-oval-r32c-welded-tangent-support-ring.glb') -Algorithm SHA256).Hash.ToLowerInvariant())"
