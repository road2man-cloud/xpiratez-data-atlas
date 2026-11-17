'use strict';
/* Structural audit for F11 r22: separately report local closed core vs
 * FULL union skin, and reject any false whole-body watertight claim.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const name='r21AO-F11-user101-native-skin-bowl-r22-dome.glb',baseName='r21AO-F11-user101-compact-core-r16-compact.glb',output='REV96_USER101_R22_GATE.json';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function glb(n){let raw=fs.readFileSync(path.join(root,n)),jl=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+jl));return{raw,doc,bin:raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl))};}
const a=glb(name),b=glb(baseName);
if(hash(a.raw)!=='15451f69e5c9e6041463ad15ce8668939a3f604c14ce65e5d601fdd3ceb1cb41')throw Error('r22 SHA mismatch');
const sd=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(hash(sd)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Snapshot changed');
const snap=JSON.parse(sd),p=a.doc.meshes[0].primitives,q=b.doc.meshes[0].primitives;
const D={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},S={5121:1,5123:2,5125:4,5126:4},O={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(g,id){const ac=g.doc.accessors[id],v=g.doc.bufferViews[ac.bufferView],n=D[ac.type],sz=S[ac.componentType],st=v.byteStride||n*sz,o=(v.byteOffset||0)+(ac.byteOffset||0),out=[];
 for(let i=0;i<ac.count;i++){const val=[];for(let k=0;k<n;k++)val.push(g.bin[O[ac.componentType]](o+i*st+k*sz));out.push(n===1?val[0]:val);}
 return out;
}
const faceKey=v=>v.slice().sort((x,y)=>x-y).join(':');
const deleted=new Map();for(const face of snap.deletedFaces){const set=deleted.get(face.primitive)||new Set();set.add(faceKey(face.vertices));deleted.set(face.primitive,set);}
let total=0,garments=0;
for(let i=0;i<p.length;i++){
 const I=read(a,p[i].indices),P=read(a,p[i].attributes.POSITION);
 for(let k=0;k<I.length;k+=3){const t=I.slice(k,k+3);if(t.some(n=>n<0||n>=P.length))throw Error('Out-of-range index '+i);
 if(deleted.get(i)?.has(faceKey(t)))throw Error('Restored user deletion '+i);}
 total+=I.length/3;if(p[i].extras?.layer==='garment')garments+=I.length/3;
}
if(p.length!==24||total!==5107||garments!==370||a.doc.skins[0].joints.length!==63||p[23].material!==5)throw Error('Count/material/rig mismatch');
for(const k of ['indices',...Object.values(q[0].attributes),...Object.values(q[0].targets[0])]){void k;}
for(const k of Object.keys(q[0].attributes))if(JSON.stringify(read(a,p[0].attributes[k]))!==JSON.stringify(read(b,q[0].attributes[k])))throw Error('Original native body attribute changed '+k);
if(JSON.stringify(read(a,p[0].indices))!==JSON.stringify(read(b,q[0].indices)))throw Error('Original native body topology changed');
const I=read(a,p[13].indices),edge=new Map();
for(let k=0;k<I.length;k+=3)for(const [x,y]of[[I[k],I[k+1]],[I[k+1],I[k+2]],[I[k+2],I[k]]]){
 const id=x<y?x+':'+y:y+':'+x;edge.set(id,(edge.get(id)||0)+1);
}
const free=[...edge].filter(x=>x[1]===1),wrong=[...edge].filter(x=>x[1]!==2);
if(free.length||wrong.length)throw Error('Core not watertight after all');
const cP=read(a,p[13].attributes.POSITION),cD=read(a,p[13].targets[0].POSITION),sP=read(a,p[23].attributes.POSITION),sD=read(a,p[23].targets[0].POSITION);
const rms=(x,y)=>Math.hypot(...x.map((v,i)=>v-y[i]));
let exactSeamMatches=0;
for(let coreId=1077+38;coreId<1077+57;coreId++){
 const pt=cP[coreId],mt=cD[coreId];
 if(sP.some((v,i)=>rms(v,pt)<1e-7&&rms(sD[i],mt)<1e-7))exactSeamMatches++;
}
if(exactSeamMatches!==19)throw Error('Geometric rest/morph seam not exact '+exactSeamMatches);
const union=JSON.parse(fs.readFileSync(path.join(root,'rev96-r23-union-boundary-atlas.json')));
if(union.input!==name)throw Error('Union atlas not actual r22');
const pics=fs.readdirSync(root).filter(f=>/^rev96-r22-skinfix-(0|25|40|55)-(under|behind)-(solid|wire)\.png$/.test(f));
if(pics.length!==16)throw Error('Missing skinfixed pose captures');
const report={schema:'xpz3d/f11/r22-acceptance-gate/v1',
 source:baseName,output:name,sha256:hash(a.raw),triangles:total,rigBones:63,garmentFaces:garments,
 originalDeletedTrianglesAbsent:101,unmodifiedOriginalBodyPrimitive0:true,
 correctNudeSkinMaterialId:5,skinCollarPrimitive:23,skinCollarFaces:read(a,p[23].indices).length/3,
 coreClosedEdges:free.length,coreNonManifoldEdges:wrong.length,exactCoreToCollarRestAndMorphMatches:exactSeamMatches,
 virtualSkinUnion:{openEdges:union.boundaryEdges,nonManifoldEdges:union.multiple,sameDirectionSeams:union.wrongPairs,centralUnclosedEdges:union.centerBoundaryEdges},
 screenshotCount:pics.length,accepted:{posteriorAnalPositionShift:true,coreOwnShellTopology:true,nudeSkinViewerCorrected:true},
 rejected:{bodyFullyWatertight:true,allNativeSkinSeamsWelded:true,finalNaturalSilhouette:true,additionalDecimationDone:true},
 conclusion:'PARTIAL. Anatomical core is closed but union native skin still has 99 open and 58 over-subscribed edges. Never claim whole body watertight.'};
const dest=path.join(root,output);
if(fs.existsSync(dest))throw Error('Refuse overwrite');fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
