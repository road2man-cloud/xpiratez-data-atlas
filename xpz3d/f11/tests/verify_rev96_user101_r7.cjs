'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const canon='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5',
baseSha='f53a8d5af9000593aaa681c11038bb641950cae62810511784e05a0fc5d07cd7';
const ss=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(ss)!==canon)throw Error('Changed snapshot');
const deleted=JSON.parse(ss).deletedFaces,forbidden=new Map();
for(const f of deleted){if(!forbidden.has(f.primitive))forbidden.set(f.primitive,new Set());forbidden.get(f.primitive).add(f.vertices.slice().sort((a,b)=>a-b).join(':'));}
function glb(file){
 const bytes=fs.readFileSync(path.join(root,file)),n=bytes.readUInt32LE(12);
 const j=JSON.parse(bytes.toString('utf8',20,20+n)),bin=bytes.subarray(28+n,28+n+bytes.readUInt32LE(20+n));
 return {bytes,doc:j,bin};
}
const sizes={5121:1,5123:2,5125:4,5126:4},reader={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function accessor(g,index){
 const a=g.doc.accessors[index],v=g.doc.bufferViews[a.bufferView],count=dims[a.type],sz=sizes[a.componentType],stride=v.byteStride||count*sz,offset=(v.byteOffset||0)+(a.byteOffset||0),out=[];
 if(!sz||!count)throw Error('Bad accessor');
 for(let k=0;k<a.count;k++){
  const row=[];for(let j=0;j<count;j++)row.push(g.bin[reader[a.componentType]](offset+k*stride+j*sz));
  out.push(count===1?row[0]:row);
 }return out;
}
const base=glb('r21AO-F11-user-trim-rev96-base.glb');
if(sha(base.bytes)!==baseSha||base.doc.meshes[0].primitives.length!==22)throw Error('Base GLB source changed');
const prim0=base.doc.meshes[0].primitives;
const from=prim0.map(p=>accessor(base,p.indices));
const user=JSON.parse(ss);
const reports=[];
for(const [mode,tris,removed]of [['lowpoly',3522,140],['soft',3554,108]]){
 const filename='r21AO-F11-user101-perineum-'+mode+'-r7.glb',f=glb(filename),ps=f.doc.meshes[0].primitives,man=JSON.parse(fs.readFileSync(path.join(root,'rev96-user101-perineum-'+mode+'-r7-manifest.json'),'utf8'));
 if(f.doc.skins[0].joints.length!==63||ps.length!==23||f.doc.extras.userSnapshotSha256!==canon)throw Error('Rig/metadata change '+mode);
 let num=0,cloth=0,totalV=0;
 for(let pi=0;pi<ps.length;pi++){
  const p=ps[pi],ind=accessor(f,p.indices),P=accessor(f,p.attributes.POSITION),M=accessor(f,p.targets[0].POSITION);
  const weights=accessor(f,p.attributes.WEIGHTS_0),joints=accessor(f,p.attributes.JOINTS_0);
  const forbiddenSet=forbidden.get(pi);
  for(let k=0;k<ind.length;k+=3){
   if(ind.slice(k,k+3).some(id=>id<0||id>=P.length))throw Error('Invalid triangle vertex '+mode+':'+pi+':'+k/3);
   if(forbiddenSet?.has(ind.slice(k,k+3).sort((a,b)=>a-b).join(':')))throw Error('User-deleted triangle restored '+pi+':'+k/3);
  }
  if(pi!==13&&pi!==22&&ind.join(',')!==from[pi].join(','))throw Error('Unexpected native face modifications: '+mode+':'+pi);
  if(pi<22&&P.length!==accessor(base,prim0[pi].attributes.POSITION).length)throw Error('Original vertices changed count');
  if(pi<22){
    const before=accessor(base,prim0[pi].attributes.POSITION),delta=accessor(base,prim0[pi].targets[0].POSITION);
    for(let id=0;id<P.length;id++)for(let d=0;d<3;d++)if(Math.abs(P[id][d]-before[id][d])>1e-6||Math.abs(M[id][d]-delta[id][d])>1e-6)throw Error('Manual vertex source changed '+mode+':'+pi+':'+id);
  }
  for(let id=0;id<P.length;id++){
   if(!P[id].every(Number.isFinite)||!M[id].every(Number.isFinite))throw Error('Nonfinite geometry '+mode+':'+pi+':'+id);
   if(weights[id].some(v=>!Number.isFinite(v)||v<0)||Math.abs(weights[id].reduce((a,b)=>a+b,0)-1)>.003)throw Error('Bad skin weights '+mode+':'+pi+':'+id);
   if(joints[id].some(x=>x<0||x>=63))throw Error('Bad bone index '+mode+':'+pi+':'+id);
  }
  if(p.extras?.layer==='garment')cloth+=ind.length/3;
  if(pi===22&&p.extras?.blindCavity!==true)throw Error('No anatomical cavity mesh');
  num+=ind.length/3;totalV+=P.length;
 }
 if(num!==tris||cloth!==370||man.anatomyReduction!==removed||man.perinealFacesAdded!==116||man.degenerateFaces!==0)throw Error('Unexpected reduced / rebuilt triangle counts '+mode);
 reports.push({kind:mode,file:filename,sha256:sha(f.bytes),faces:num,original101DeletionsAbsence:true,canonical754VertexEditsUnchanged:true,reducedCoreFaces:removed,addedPerineumFaces:116,numberOfPrimitives:ps.length,bones:63,garment:cloth,analInset:true});
}
const render=JSON.parse(fs.readFileSync(path.join(root,'rev96-r7-render-report.json'),'utf8'));
if(render.errors.length||render.captures.length!==16||render.captures.some(p=>!fs.existsSync(path.join(root,p))))throw Error('Pose capture incomplete');
const doc={schema:'xpz3d-f11/rev96-user101-r7-verification',date:'2026-11-17',status:'structurally-verified-visually-experimental',
baselineSha256:baseSha,userSnapshotSha256:canon,userDeletedFaces:101,controls:106,positions:754,
reports,render:{captures:16,errors:render.errors.length,poses:[0,25,40,55]},
limitations:['The separate perineal primitive is geometrically draped along existing skin edges; true edge welding into native primitive 0 is not yet implemented','Appearance and model silhouette require additional artistic refinement','No native game deployment']};
fs.writeFileSync(path.join(root,'REV96_USER101_R7_CHECK.json'),JSON.stringify(doc,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(doc,null,2));
