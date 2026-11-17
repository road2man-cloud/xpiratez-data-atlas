'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const hash=n=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const candidate='r21AO-F11-user101-integrated-oval-r26-unified-skin-v2.glb';
const input='r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v3.glb';
if(hash(candidate)!=='08e37ff8fa981ad9f23807e090f477cdf7d97c1bfd50027f59e87b249fd6cbc3')throw Error('Unexpected r26 v2 SHA');
const build=read('REV96_USER101_R26_SMOOTHED_GENTLE_BUILD.json'),material=read('REV96_USER101_R26_UNIFIED_SKIN_V2_BUILD.json'),union=read('rev96-r26-unified-v2-union-boundary.json'),pose=read('REV96_USER101_R26_UNIFIED_V2_POSED_SEAMS.json'),render=read('rev96-r26-unified-v2-canonical-render-report.json'),trim='rev95-user-trim-101faces-20261116T152807Z.json';
const status={};
if(union.multiple||union.wrongPairs||union.centerBoundaryEdges||union.boundaryEdges!==34)throw Error('Topological regression');
if(pose.length!==4||pose.some((p,i)=>p.angle!==[0,25,40,55][i]||p.maxDistance>1e-5||p.countOver0p3mm!==0||p.pairs!==236))throw Error('Pose seams regression');
if(render.captures?.length!==16||render.errors?.length)throw Error('Render incomplete');
const excluded=[];
for(const [name,kind]of[['oval-gentle','fan subdivision with overaccentuated faceting'],['oval-shaded-gentle','shading smoother but radial fan still visible'],['oval-shaded-strong','same fan constraint; effective sculpt attenuated'],['ribbon-gentle','longitudinal ribbon; stretched lateral wing / spider web'],['ribbon-strong','longitudinal ribbon; near-degenerate rest triangles'],['smoothed-strong','more aggressive curvature but full oval still unclear']]){
 const file='r21AO-F11-user101-integrated-oval-r26-'+name+'.glb';if(fs.existsSync(path.join(root,file)))excluded.push({file,sha256:hash(file),reason:kind});
}
const images=[];
for(const ang of [0,25,40,55])for(const view of ['under','behind'])for(const mode of ['solid','wire']){
 const f='rev96-r26-unified-v2-canonical-'+ang+'-'+view+'-'+mode+'.png';
 if(!fs.existsSync(path.join(root,f)))throw Error('Missing '+f);
 images.push({file:f,sha256:hash(f)});
}
const accept={
 schema:'xpz3d/f11/rev96/r26-acceptance/v1',createdUTC:new Date().toISOString(),
 input:{file:input,sha256:hash(input)},manual:{file:trim,sha256:hash(trim),deletedFaces:101,authoredControlCount:106,sculptPositions:754},
 currentCandidate:{file:candidate,sha256:hash(candidate),selection:'retopology-build candidate, not final anthropomorphic silhouette',status:'LOCAL_MESH_UNIFIED__VISUAL_APPROVAL_PENDING'},
 implementation:{movedGeneratedCoreFacesToUnifiedSkin:392,originalSkirtFacesMovedToUnifiedSkin:682,physicallyIndexWeldedCoreToSkinVertices:22,
   authoredCoreFacesLeftSeparate:529,originalArtistAnatomyVerticesPreserved:908,smoothedInteriorVertices:build.smoothedOriginalInteriorVertices,skinMaterialIndex:5,
   nativeBodyUnaffected:true,bones:material.boneCount,independentGarmentFaces:material.individualGarmentFaces,triangleCount:material.triangles,
   separateAuthoredCoreMaterialIndex:5,physicalWeldingWithAuthoredCoreAcrossMaterialBoundary:false,physicalWeldingWithBodyAcrossMaterialBoundary:false},
 geometricGates:{pelvicOpenEdges:union.centerBoundaryEdges,nonManifoldEdges:union.multiple,wrongDirectionEdges:union.wrongPairs,otherBodyOpenEdges:union.boundaryEdges,
   posteriorAnalShiftPreservedGLB:.020,sourceManualFaceRestored:0},
 runtimePose:{angles:pose.map(x=>x.angle),measuredPairsPerAngle:pose.map(x=>x.pairs),maxGapGLB:pose.map(x=>x.maxDistance)},
 screenshots:images,abandonedExperimentalVariants:excluded,
 appearance:{materialMismatchReduced:true,facetedAppearanceReduced:true,leftRightBroadMembranesRemain:true,
 doubleUBasinNaturalOvalCompleted:false,posteriorSmallUProminent:false,bodyTransitionG1Certified:false,visualUserApproval:false},
 conclusions:'The r26 v2 deliverable is a real GLB with physical joint index connectivity and unified skin materials, but user-requested naturally joined big/small U outline is not yet achieved. Do not call it finished.',
 nextTask:'Redo original 529-face authored core boundary and two broad 38/35-edge generated skin zones as a single geometric patch while preserving explicit manually sculpted 754 positions and 101 deletions; favor extra closure skin rather than holes; require 55-degree under/behind visual gate.'
};
for(const [p,obj]of [['REV96_USER101_R26_ACCEPTANCE.json',accept]])fs.writeFileSync(path.join(root,p),JSON.stringify(obj,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({currentCandidate:accept.currentCandidate,implementation:accept.implementation,topology:accept.geometricGates,pose:accept.runtimePose,images:images.length,experiments:excluded.length},null,2));
