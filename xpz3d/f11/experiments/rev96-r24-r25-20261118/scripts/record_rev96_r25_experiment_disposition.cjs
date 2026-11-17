'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const src=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8')),sha=n=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex');
const rootModel='r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v3.glb';
const r24=src('REV96_USER101_R24_ACCEPTANCE.json'),newVariants=[
 ['r21AO-F11-user101-native-perineal-r24-soft.glb','REV96_USER101_R24_SOFT_BUILD.json','Local smooth anatomy experiment'],
 ['r21AO-F11-user101-native-perineal-r24-contour.glb','REV96_USER101_R24_CONTOUR_BUILD.json','High-curvature experiment; core moved with auto backoff'],
 ['r21AO-F11-user101-native-perineal-r24-contour-v2.glb','REV96_USER101_R24_CONTOUR-V2_BUILD.json','Backoff reduces posterior shift'],
 ['r21AO-F11-user101-native-perineal-r24-posterior-v3.glb','REV96_USER101_R24_POSTERIOR-V3_BUILD.json','Backoff reduces posterior shift'],
 ['r21AO-F11-user101-native-perineal-r24-midline-v4.glb','REV96_USER101_R24_MIDLINE-V4_BUILD.json','More pronounced central skin groove'],
 ['r21AO-F11-user101-native-retopo-r25-lateral-gentle-v1.glb','REV96_USER101_R25_LATERAL-GENTLE_V1_BUILD.json','Lateral skin fairing subtle 0.75mm max'],
 ['r21AO-F11-user101-native-retopo-r25-lateral-sculpt-v1.glb','REV96_USER101_R25_LATERAL-SCULPT_V1_BUILD.json','Lateral skin fairing auto-backoff, 0.83mm max']
];
const all=newVariants.map(([model,report,note])=>{
 const r=src(report),a=r.areas||r.quality||{};
 return {model,sha256:sha(model),source:'r23-lbsweld',note,triangles:r.createdGeometry?.triangles||4680,
  actualAnalShiftGLB:r.beforeAfter? r.beforeAfter.analCenterNew[1]-r.beforeAfter.analCenterOld[1]:r.analPit?.posteriorShift,
  coreScale:r.createdGeometry?.coreSculptScale,skinScale:r.lateralScale??r.createdGeometry?.patchFairingScale,
  changedCore:r.createdGeometry?.coreMoved??a.coreRest?.changedVertices,changedSkin:r.skinInteriorMoved??r.createdGeometry?.patchInteriorMoved,
  visualStatus:'experimental, not approved'};
});
const selected=sha(rootModel);if(selected!==r24.selectedSha256)throw Error('r24 approved baseline SHA mismatch');
const r25s=all.filter(x=>x.model.includes('r25-'));
const decision={
 schema:'xpz3d/f11/rev96/r25-disposition/v1',writtenUTC:new Date().toISOString(),baseline:{model:rootModel,sha256:selected,revision:'r24 ellipse soft v3',posteriorShiftGLB:r24.changes.posteriorAnalPitShiftY},
 userPreference:'Actual work, not repeated checks; user feedback-free self-directed iterations',
 observations:'r25 pushed 268 interior patch vertices but the wide bilateral membranes remain visually almost unchanged in 55-degree solid rear/under renders. Surface max shift limited to <0.001 GLB due pose normal inversion constraints. New shape has no new triangles. Original body walls and 112 skin patch boundary vertices were left unchanged.',
 r24AnatomyAlternatives:all.filter(x=>!x.model.includes('r25-')),r25Experiments:r25s,
 recommendedCurrentVisual:r24.selected,integratedGLB:'not_replaced',
 nextAction:'Full retopology of 38/35-edge left/right skin cavities: replace broad radial fan with longitudinal constrained bands following core/body normals. Keep user-trim 101, authored 908, pose seam 249 pairs and clothing 370. Do not increase decimation.',
 visuals:{r25Gentle:'rev96-r25-gentle-canonical-55-under-solid.png',r25Side:'rev96-r25-gentle-canonical-55-behind-solid.png'},
 classification:'EXPERIMENTAL_R25_NOT_VISUALLY_BETTER_THAN_R24_ELLIPSE_V3'};
fs.writeFileSync(path.join(root,'REV96_USER101_R25_EXPERIMENT_DISPOSITION.json'),JSON.stringify(decision,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({baseline:r24.selected,sha256:selected,r25Experiments:r25s,files:all.length},null,2));
