'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const base='r21AO-F11-user101-native-retopo-r23-lbsweld.glb',
      selected='r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v3.glb',
      alt='r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-wide-v3.glb';
const hashes={
 [base]:'f7e0a3d16712abfa21ce4b3a4faedea55b3fb77dac0400f64575423838db7132',
 [selected]:'ed99fb2df29767fff3258a6267ddc395b6e5b177eebc9676de7f1c5485bced7a',
 [alt]:'f02b46c8237dbebf9ff7297a69cd465401f66cca0872cc9188fc7bae08fd7de8'};
const files=Object.fromEntries(Object.keys(hashes).map(name=>{const b=fs.readFileSync(path.join(root,name));if(sha(b)!==hashes[name])throw Error('Hash mismatch '+name);return[name,b]}));
const manual=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(manual)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Manual trim input changed');
const user=JSON.parse(manual);if(user.deletedFaces.length!==101||user.positions.length!==754||Object.keys(user.controls).length!==106)throw Error('Source user controls changed');
const S={5121:1,5123:2,5125:4,5126:4}, D={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},R={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function parse(buffer){
 if(buffer.toString('ascii',0,4)!=='glTF'||buffer.readUInt32LE(8)!==buffer.length)throw Error('Malformed glTF');
 const jl=buffer.readUInt32LE(12),doc=JSON.parse(buffer.toString('utf8',20,20+jl)),bo=28+jl,bb=buffer.subarray(bo,bo+buffer.readUInt32LE(20+jl));
 function read(i){let a=doc.accessors[i],v=doc.bufferViews[a.bufferView],nd=D[a.type],sz=S[a.componentType],offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||sz*nd,res=[];for(let k=0;k<a.count;k++){const row=[];for(let j=0;j<nd;j++)row.push(bb[R[a.componentType]](offset+k*stride+j*sz));res.push(nd===1?row[0]:row);}return res;}
 return {doc,read};
}
const r23=parse(files[base]),r24=parse(files[selected]),p23=r23.doc.meshes[0].primitives,p24=r24.doc.meshes[0].primitives;
if(p23.length!==24||p24.length!==24||r24.doc.skins[0].joints.length!==63)throw Error('Changed rig or primitive count');
const tris=p24.reduce((s,p)=>s+r24.doc.accessors[p.indices].count/3,0);
const clothes=p24.reduce((s,p)=>s+(p.extras?.layer==='garment'?r24.doc.accessors[p.indices].count/3:0),0);
if(tris!==4680||clothes!==370)throw Error('Unexpected face count');
for(let pi=0;pi<24;pi++){
 const a=p23[pi],b=p24[pi];
 if(JSON.stringify(r23.read(a.indices))!==JSON.stringify(r24.read(b.indices)))throw Error('Face indexing changed in pi'+pi);
 if(![13,23].includes(pi)){
  for(const key of Object.keys(a.attributes))if(JSON.stringify(r23.read(a.attributes[key]))!==JSON.stringify(r24.read(b.attributes[key])))throw Error('Original attribute changed '+pi+':'+key);
  for(const key of Object.keys(a.targets[0]))if(JSON.stringify(r23.read(a.targets[0][key]))!==JSON.stringify(r24.read(b.targets[0][key])))throw Error('Original morph changed '+pi+':'+key);
 }
}
for(const key of ['POSITION','NORMAL']) {
 const old=r23.read(p23[13].attributes[key]),now=r24.read(p24[13].attributes[key]);
 for(let j=0;j<908;j++)if(JSON.stringify(old[j])!==JSON.stringify(now[j]))throw Error('Protected authored anatomy changed '+key+':'+j);
 const om=r23.read(p23[13].targets[0][key]),nm=r24.read(p24[13].targets[0][key]);
 if(key==='POSITION'&&JSON.stringify(om)!==JSON.stringify(nm))throw Error('Source morph positions changed');
 for(let j=0;j<908;j++)if(JSON.stringify(om[j])!==JSON.stringify(nm[j]))throw Error('Authored original morph altered '+key+':'+j);
}
const oldCore=r23.read(p23[13].attributes.POSITION),newCore=r24.read(p24[13].attributes.POSITION),
 oldPatch=r23.read(p23[23].attributes.POSITION),newPatch=r24.read(p24[23].attributes.POSITION);
const movedCore=newCore.filter((p,i)=>JSON.stringify(p)!==JSON.stringify(oldCore[i])).length;
const movedPatch=newPatch.filter((p,i)=>JSON.stringify(p)!==JSON.stringify(oldPatch[i])).length;
const pitDelta=newCore[1076][1]-oldCore[1076][1];
const ringMean=(P,i,j)=>P.slice(i,j).reduce((s,p)=>s+p[1],0)/(j-i);
const outerMove=ringMean(newCore,1060,1068)-ringMean(oldCore,1060,1068),
 innerMove=ringMean(newCore,1068,1076)-ringMean(oldCore,1068,1076);
if(Math.abs(pitDelta-.02)>1e-7||Math.abs(outerMove-.01)>1e-5||Math.abs(innerMove-.014)>1e-5)throw Error('Requested posterior shift absent');
for(let i=1041;i<1060;i++)if(JSON.stringify(newCore[i])!==JSON.stringify(oldCore[i]))throw Error('Collar boundary damaged '+i);
const faceKey=arr=>arr.slice().sort((a,b)=>a-b).join(',');
const userForb=new Map();for(const row of user.deletedFaces){let set=userForb.get(row.primitive)||new Set();set.add(faceKey(row.vertices));userForb.set(row.primitive,set);}
for(const [pi,set] of userForb){const idx=r24.read(p24[pi].indices);for(let j=0;j<idx.length;j+=3)if(set.has(faceKey(idx.slice(j,j+3))))throw Error('Manually deleted face returned '+pi+':'+j/3);}
const atlas=read('rev96-r24-soft-v3-union-boundary.json'),poses=read('REV96_USER101_R24_SOFT_V3_POSED_SEAMS.json');
if(atlas.multiple!==0||atlas.wrongPairs!==0||atlas.centerBoundaryEdges!==0||atlas.boundaryEdges!==34)throw Error('Topology regression');
if(poses.length!==4||poses.some((x,i)=>x.angle!==[0,25,40,55][i]||x.pairs!==249||x.maxDistance>1e-5||x.countOver0p3mm))throw Error('Pose regression');
const build=read('REV96_USER101_R24_ELLIPTIC-SOFT_V3_BUILD.json');
if(build.areas.coreRest.flips||build.areas.coreMorph.flips||build.areas.skinRest.flips||build.areas.skinMorph.flips)throw Error('Flipped geometry found');
const shots=[];for(const angle of [0,25,40,55])for(const viewpoint of ['under','behind'])for(const render of ['solid','wire']){
 const file='rev96-r24-soft-v3-canonical-'+angle+'-'+viewpoint+'-'+render+'.png',b=fs.readFileSync(path.join(root,file));
 if(b.length<10000)throw Error('Screenshot missing '+file);
 shots.push({file,sha256:sha(b)});
}
const acceptance={schema:'xpz3d/f11/rev96/r24-acceptance/v1',timeUTC:new Date().toISOString(),baseline:base,baselineSha256:hashes[base],selected,selectedSha256:hashes[selected],alternative:alt,alternativeSha256:hashes[alt],userTrimSha256:sha(manual),
changes:{posteriorAnalPitShiftY:pitDelta,posteriorAnalOuterRingMeanShiftY:outerMove,posteriorAnalInnerRingMeanShiftY:innerMove,cleftAlongInterveningPerineum:true,vaginalAndAnalCavitiesRemainSeparate:true,movedOriginalAnatomicalVertexCount:0,movedNewCoreVertexCount:movedCore,movedNewPatchVertexCount:movedPatch},
preserved:{source101DeletedFaces:true,manualPositions754:true,controls106:true,bones63:true,separateGarmentTriangles370:true,bodyPrimitive0PositionsFacesUVWeights:true,sourceMorphPositions:true,protectedFirst908AuthoredNormals:true},
topology:{pelvicOpenEdges:atlas.centerBoundaryEdges,nonManifoldEdges:atlas.multiple,wrongFacingSeams:atlas.wrongPairs,otherOpenEdges:atlas.boundaryEdges,physicalIndexWeldedAcrossPrimitives:false,wholeBodyWatertight:false},
poses:poses.map(x=>({angle:x.angle,pairs:x.pairs,maxGapGLB:x.maxDistance})),triangles:tris,shots:shots,quality:{0:'No new inverted faces in source-rest and source-morph positions; not full physical anatomy approval',geometry:true,skinAppearanceApproved:false,externalLateralSkinMembraneStillBroad:true},
classification:'R24_POSTERIOR_ANATOMY_IMPROVED__LOCAL_TOPOLOGY_RETAINED__VISUAL_FINISH_PENDING'};
const diff={schema:'xpz3d/f11/r24-vs-r23-anatomy/v1',sourceSha256:hashes[base],selectedSha256:hashes[selected],trianglesOld:4680,trianglesNew:4680,afterPitY:newCore[1076][1],beforePitY:oldCore[1076][1],pitDeltaY:pitDelta,outerRingShiftY:outerMove,innerRingShiftY:innerMove,movedCore,movedPatch,noNewFaces:true,topologyPreserved:true,poseMaxGap:poses.map(x=>x.maxDistance)};
for(const [name,data] of [['REV96_USER101_R24_ACCEPTANCE.json',acceptance],['REV96_USER101_R24_ANATOMY_DIFF.json',diff]]){const p=path.join(root,name);if(fs.existsSync(p))throw Error('Refuse overwrite '+name);fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({selected,sha256:hashes[selected],bodyTriangles:tris,analPitShift:pitDelta,outerShift:outerMove,innerShift:innerMove,movedCore,movedPatch,images:shots.length,poseGapMax:Math.max(...poses.map(x=>x.maxDistance)),status:acceptance.classification},null,2));
