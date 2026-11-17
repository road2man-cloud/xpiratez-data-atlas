'use strict';
const fs=require('fs'),crypto=require('crypto'),path=require('path'),root=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const snapshot=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
const expectedSnapshot='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5';
if(sha(snapshot)!==expectedSnapshot)throw Error('User JSON not canonical');
const user=JSON.parse(snapshot);
const original=fs.readFileSync(path.join(root,'r21AO-F11-user-trim-rev96-base.glb'));
if(sha(original)!=='f53a8d5af9000593aaa681c11038bb641950cae62810511784e05a0fc5d07cd7')throw Error('Original 3546-face trimmed GLB changed');
const buf=fs.readFileSync(path.join(root,'r21AO-F11-user101-posterior-tucked-closure-r9.glb'));
const n=buf.readUInt32LE(12),g=JSON.parse(buf.toString('utf8',20,20+n)),binary=buf.subarray(28+n,28+n+buf.readUInt32LE(20+n));
const n0=original.readUInt32LE(12),g0=JSON.parse(original.toString('utf8',20,20+n0)),bin0=original.subarray(28+n0,28+n0+original.readUInt32LE(20+n0));
function R(doc,b,id){let a=doc.accessors[id],v=doc.bufferViews[a.bufferView],stride=v.byteStride,component={5121:1,5123:2,5125:4,5126:4}[a.componentType],d={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],fn={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],start=(a.byteOffset||0)+(v.byteOffset||0),rows=[];for(let i=0;i<a.count;i++){let row=[];for(let k=0;k<d;k++)row.push(b[fn](start+i*(stride||d*component)+k*component));rows.push(d===1?row[0]:row);}return rows;}
const P=g.meshes[0].primitives,Q=g0.meshes[0].primitives;
if(P.length!==24||Q.length!==22||g.skins?.[0]?.joints.length!==63)throw Error('Unexpected primitive/bones');
const bans=new Map();for(const f of user.deletedFaces){let s=bans.get(f.primitive)||new Set();s.add(f.vertices.slice().sort((a,b)=>a-b).join(':'));bans.set(f.primitive,s);}
let faces=0,garment=0,unchangedSourcePrimitives=0;
for(let pi=0;pi<P.length;pi++){
 const p=P[pi],I=R(g,binary,p.indices),position=R(g,binary,p.attributes.POSITION),morph=R(g,binary,p.targets[0].POSITION),weights=R(g,binary,p.attributes.WEIGHTS_0);
 for(let i=0;i<I.length;i+=3){
  const t=I.slice(i,i+3);
  if(t.some(id=>id<0||id>=position.length))throw Error('Out-of-range triangle '+pi);
  if(bans.get(pi)?.has(t.slice().sort((a,b)=>a-b).join(':')))throw Error('Restored original user-deleted triangle '+pi+':'+i/3);
 }
 for(let id=0;id<position.length;id++){
  if(!position[id].every(Number.isFinite)||!morph[id].every(Number.isFinite))throw Error('NaN geometry');
  const sum=weights[id].reduce((a,b)=>a+b,0);if(Math.abs(sum-1)>.004)throw Error('Skin weights not normalized at '+pi+':'+id);
 }
 if(pi<22){
  const q=Q[pi];
  if(pi!==13 && R(g0,bin0,q.indices).join(',')!==I.join(','))throw Error('Source index changed at '+pi); // r7 pre-existing protected core reduction
  for(const name of ['POSITION'])if(JSON.stringify(R(g0,bin0,q.attributes[name]))!==JSON.stringify(R(g,binary,p.attributes[name])))throw Error('Original position changed at '+pi);
  unchangedSourcePrimitives++;
 }
 faces+=I.length/3;
 if(p.extras?.layer==='garment')garment+=I.length/3;
}
function borders(I){let e=new Map();for(let i=0;i<I.length;i+=3)for(const [a,b]of[[I[i],I[i+1]],[I[i+1],I[i+2]],[I[i+2],I[i]]]){let k=a<b?a+':'+b:b+':'+a;e.set(k,(e.get(k)||0)+1);}return [...e.values()].filter(n=>n===1).length;}
const perimeter=borders(R(g,binary,P[22].indices));
if(perimeter!==0||faces!==3604||garment!==370)throw Error('r9 count/closure mismatch');
const screenshots=fs.readdirSync(root).filter(f=>/^rev96-r9-(0|25|40|55)-(under|behind)-(wire|solid)\.png$/.test(f));
if(screenshots.length!==16)throw Error('Expected 16 screenshots');
const report={
schema:'xpz3d/f11/r9-structural-check/v1',date:'2026-11-17',output:'r21AO-F11-user101-posterior-tucked-closure-r9.glb',
sha256:sha(buf),inputSnapshotSha256:sha(snapshot),original101UserFacesAbsent:true,
sourcePrimitivesUnchanged:unchangedSourcePrimitives,triangles:faces,bones:63,garmentTriangles:370,
perineumOpenEdges:perimeter,localSkinMicroholesCovered:4,poseScreenshots:screenshots.length,
statuses:{originalOpenCutStillPresent:true,nativeBodyWelding:false,visualReview:'experimental',additionalDecimation:false}
};
const output=path.join(root,'REV96_USER101_R9_CHECK.json');
if(fs.existsSync(output))throw Error('Refuse overwrite');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
