'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),dir=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const source='r21AO-F11-user101-native-skin-bowl-r22-dome.glb',candidate='r21AO-F11-user101-native-retopo-r23-lbsweld.glb';
const r22=fs.readFileSync(path.join(dir,source)),r23=fs.readFileSync(path.join(dir,candidate));
if(sha(r22)!=='15451f69e5c9e6041463ad15ce8668939a3f604c14ce65e5d601fdd3ceb1cb41')throw Error('Unexpected source');
if(sha(r23)!=='f7e0a3d16712abfa21ce4b3a4faedea55b3fb77dac0400f64575423838db7132')throw Error('Unexpected candidate');
const trim=read('rev95-user-trim-101faces-20261116T152807Z.json');
if(sha(fs.readFileSync(path.join(dir,'rev95-user-trim-101faces-20261116T152807Z.json')))!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Trim source changed');
function glb(b){
 if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(8)!==b.length)throw Error('Invalid GLB magic/length');
 const n=b.readUInt32LE(12),doc=JSON.parse(b.toString('utf8',20,20+n)),binOffset=20+n,bin=b.subarray(binOffset+8,binOffset+8+b.readUInt32LE(binOffset)),ndim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},size={5121:1,5123:2,5125:4,5126:4},fn={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
 function get(i){const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],dim=ndim[a.type],sz=size[a.componentType],stride=v.byteStride||dim*sz,offset=(v.byteOffset||0)+(a.byteOffset||0),rows=[];
  for(let j=0;j<a.count;j++){let r=[];for(let k=0;k<dim;k++)r.push(bin[fn[a.componentType]](offset+j*stride+k*sz));rows.push(dim===1?r[0]:r);}
  return rows;}
 return{doc,get};
}
const A=glb(r22),B=glb(r23),pa=A.doc.meshes[0].primitives,pb=B.doc.meshes[0].primitives;
const getP=(p,g,k)=>g.get(p.attributes[k]),getM=(p,g,k)=>g.get(p.targets[0][k]);
if(pb.length!==24||B.doc.skins[0].joints.length!==63)throw Error('GLB geometry/skeleton count mismatch');
function exactRows(a,b,k,exceptions=new Set()){
 if(a.length!==b.length)throw Error(k+' length mismatch');
 let delta=[];
 for(let i=0;i<a.length;i++)if(JSON.stringify(a[i])!==JSON.stringify(b[i])){if(!exceptions.has(i))throw Error(k+' unexpected modification at '+i);delta.push(i);}
 return delta;
}
const p0Old=pa[0],p0New=pb[0];
exactRows(A.get(p0Old.indices),B.get(p0New.indices),'body indices');
for(const k of Object.keys(p0Old.attributes))if(k!=='WEIGHTS_0')exactRows(getP(p0Old,A,k),getP(p0New,B,k),'body attr '+k);
for(const k of Object.keys(p0Old.targets[0]))exactRows(getM(p0Old,A,k),getM(p0New,B,k),'body morph '+k);
const adjusted=exactRows(getP(p0Old,A,'WEIGHTS_0'),getP(p0New,B,'WEIGHTS_0'),'body blend weights',new Set([76,83,215,222])).sort((a,b)=>a-b);
if(adjusted.join(',')!=='76,83,215,222')throw Error('Expected exactly 4 UV split weight modifications');
for(const k of ['POSITION'])for(let i=0;i<908;i++){
 if(JSON.stringify(getP(pa[13],A,k)[i])!==JSON.stringify(getP(pb[13],B,k)[i]))throw Error('Protected core '+i);
 if(JSON.stringify(getM(pa[13],A,k)[i])!==JSON.stringify(getM(pb[13],B,k)[i]))throw Error('Protected sculpt morph '+i);
}
const forbidden=(a)=>a.slice().sort((x,y)=>x-y).join(',');
for(const primitive of [13,18]){
 const sourceFaces=new Set(trim.deletedFaces.filter(f=>f.primitive===primitive).map(f=>forbidden(f.vertices)));
 const indexes=B.get(pb[primitive].indices);
 for(let i=0;i<indexes.length;i+=3)if(sourceFaces.has(forbidden(indexes.slice(i,i+3))))throw Error('User-deleted face reintroduced '+primitive+':'+i/3);
}
const garment=pb.reduce((s,p)=>s+(p.extras?.layer==='garment'?B.doc.accessors[p.indices].count/3:0),0),count=pb.reduce((s,p)=>s+B.doc.accessors[p.indices].count/3,0);
if(garment!==370||count!==4680)throw Error('Unexpected garment/total triangles');
if(B.doc.extras.wholeBodyWatertight!==false||B.doc.extras.coreOwnShellTopologyClosed!==false||B.doc.extras.crossPrimitiveIndexWelded!==false||B.doc.extras.centralCoreTrueManifoldClosed===true)throw Error('Untruthful inherited metadata');
const oldGate=read('REV96_USER101_R22_GATE.json'),atlas=read('rev96-r23-union-boundary-lbsweld.json'),pose=read('REV96_USER101_R23_POSED_SEAM_AUDIT_LBSWELD.json'),build=read('REV96_USER101_R23_BUILD_LBSWELD.json'),render=read('rev96-r23-lbsweld-render-report.json');
const changed={openEdges:[oldGate.virtualSkinUnion.openEdges,atlas.boundaryEdges],pelvicOpen:[oldGate.virtualSkinUnion.centralUnclosedEdges,atlas.centerBoundaryEdges],multiple:[oldGate.virtualSkinUnion.nonManifoldEdges,atlas.multiple],wrongDirection:[oldGate.virtualSkinUnion.sameDirectionSeams,atlas.wrongPairs]};
if(JSON.stringify(changed)!==JSON.stringify({openEdges:[99,34],pelvicOpen:[51,0],multiple:[58,0],wrongDirection:[8,0]}))throw Error('Unexpected boundary regression');
if(pose.length!==4||pose.some((r,i)=>r.angle!==[0,25,40,55][i]||r.maxDistance!==0||r.countOver0p3mm!==0||r.pairs!==249))throw Error('Actual posed seam mismatch');
if(render.captures?.length!==16||render.errors.length)throw Error('Incomplete pose screenshots');
const imgs=[];for(const angle of [0,25,40,55])for(const viewpoint of ['under','behind'])for(const mode of ['solid','wire']){const name='rev96-r23-lbsweld-'+angle+'-'+viewpoint+'-'+mode+'.png',file=path.join(dir,name);if(!fs.existsSync(file)||fs.statSync(file).size<10000)throw Error('Missing actual screenshot '+name);imgs.push({file:name,sha256:sha(fs.readFileSync(file))});}
const diff={schema:'xpz3d/f11/rev96/r23-boundary-diff/v1',from:{file:source,sha256:sha(r22),triangles:5107},to:{file:candidate,sha256:sha(r23),triangles:4680},virtualSkinUnion:{...changed,roi:[0,13,17,18,21,22,23],outOfPelvis:[48,34],materialIndexWeldedAcrossPrimitives:false},deletions:{source101Protected:101,reintroduced:0},originalBody:{positionsAndFacesIdentical:true,uvSplitWeightVerticesAdjusted:adjusted},pose:{angles:[0,25,40,55],pairsEach:249,maxDistanceEach:[0,0,0,0]},note:'Virtual skin union is position+morph welded. Not GLB index welding. 34 other apertures remain. Original independent core backing removed intentionally.'};
const acceptance={schema:'xpz3d/f11/rev96/r23-acceptance/v1',createdUTC:new Date().toISOString(),selectedCandidate:candidate,sha256:sha(r23),sourceSHA256:sha(r22),manualTrimSHA256:'624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5',generatedGLB:true,triangles:4680,bones:63,garmentFaces:370,deletedFacesReintroduced:0,manualPositionsProtected:754,
geometricTopology:{pelvicOpenEdges:0,multipleEdges:0,wrongDirectionEdges:0,otherOpenEdges:34},
virtualSeamPose:{angles:[0,25,40,55],pairsPerAngle:249,maxDistancePerAngle:pose.map(x=>x.maxDistance)},
patchQuality:{restMinArea:build.restQuality.min,posedMinArea:build.morphQuality.min,degenerateFaces:0},
nativeBody:{positionsAndTopologyUntouched:true,uvSplitSkinningWeightsChangedAt:adjusted},
crossPrimitiveIndexWelding:false,closedAnatomicalInnerShellPreserved:false,closedLocalSkinVirtualUnion:true,closedWholeBody:false,
visualReview:{screenshots:imgs,sideMembraneStillTooBroad:true,reverseCurvatureImprovedRelativeToR19:true,finalNaturalSilhouetteAccepted:false,notes:'Geometric locality of repaired lateral surfaces remains overly broad and relatively planar, especially 55° under/behind. Candidate preserved for next constrained ribbon/G1 re-topology iteration; do not claim a natural finished body.'},
qualityGates:{geometryLocal:true,poseSeams:true,deletedUserFaces:true,rig:true,garments:true,visualSilhouette:false,fullBodyClosure:false},
finalClassification:'LOCAL_TOPOLOGY_ACCEPTED__VISUAL_CANDIDATE_REJECTED'};
for(const [name,data] of [['REV96_USER101_R23_BOUNDARY_DIFF.json',diff],['REV96_USER101_R23_ACCEPTANCE.json',acceptance]]){fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({selected:candidate,sha:sha(r23),triangles:count,poseMax:pose.map(x=>x.maxDistance),images:imgs.length,originalWeightEdits:adjusted,classification:acceptance.finalClassification},null,2));
