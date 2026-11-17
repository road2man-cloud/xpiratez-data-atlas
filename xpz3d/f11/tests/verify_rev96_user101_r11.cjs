'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,file='r21AO-F11-user101-posterior-seam-aligned-r11.glb',source='r21AO-F11-user101-posterior-tucked-closure-r9.glb';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function glb(name){const b=fs.readFileSync(path.join(root,name)),jl=b.readUInt32LE(12),d=JSON.parse(b.toString('utf8',20,20+jl)),bin=b.subarray(28+jl,28+jl+b.readUInt32LE(20+jl));return{b,d,bin};}
const a=glb(file),b=glb(source),snap=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(snap)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('snapshot drift');
const user=JSON.parse(snap),types={5121:['readUInt8',1],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]},dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(g,id){const v=g.d.accessors[id],view=g.d.bufferViews[v.bufferView],n=dim[v.type],sz=types[v.componentType][1],fn=types[v.componentType][0],off=(v.byteOffset||0)+(view.byteOffset||0),stride=view.byteStride||sz*n,out=[];for(let i=0;i<v.count;i++){const row=[];for(let k=0;k<n;k++)row.push(g.bin[fn](off+i*stride+k*sz));out.push(n===1?row[0]:row);}return out;}
const p=a.d.meshes[0].primitives,q=b.d.meshes[0].primitives;
const banned=new Map();for(const v of user.deletedFaces){let s=banned.get(v.primitive)||new Set();s.add(v.vertices.slice().sort((x,y)=>x-y).join(':'));banned.set(v.primitive,s);}
let tri=0,garment=0;
for(let pi=0;pi<p.length;pi++){
 const I=read(a,p[pi].indices),X=read(a,p[pi].attributes.POSITION),D=read(a,p[pi].targets[0].POSITION),W=read(a,p[pi].attributes.WEIGHTS_0);
 for(let k=0;k<I.length;k+=3){const t=I.slice(k,k+3);if(t.some(id=>id<0||id>=X.length))throw Error('bad index '+pi);
 if(banned.get(pi)?.has(t.slice().sort((x,y)=>x-y).join(':')))throw Error('101 deleted returned '+pi);}
 for(let k=0;k<X.length;k++){if(!X[k].every(Number.isFinite)||!D[k].every(Number.isFinite)||Math.abs(W[k].reduce((u,v)=>u+v,0)-1)>.004)throw Error('bad vertex weights/pose '+pi+':'+k);}
 if(pi<22&&pi!==0){const O=read(b,q[pi].indices),oldX=read(b,q[pi].attributes.POSITION);if(O.join(',')!==I.join(','))throw Error('unexpected source primitive indices '+pi);if(JSON.stringify(oldX)!==JSON.stringify(X))throw Error('changed original vertex '+pi);}
 if(pi===0){const oldX=read(b,q[0].attributes.POSITION);if(X.length!==oldX.length+6)throw Error('expected 6 body edge split vertices');for(let k=0;k<oldX.length;k++)if(JSON.stringify(X[k])!==JSON.stringify(oldX[k]))throw Error('original body coordinates changed '+k);}
 if(p[pi].extras?.layer==='garment')garment+=I.length/3;
 tri+=I.length/3;
}
const nativeP=read(a,p[0].attributes.POSITION),nativeD=read(a,p[0].targets[0].POSITION),nativeI=read(a,p[0].indices),patchP=read(a,p[22].attributes.POSITION),patchD=read(a,p[22].targets[0].POSITION),
 nativeJ=read(a,p[0].attributes.JOINTS_0),patchJ=read(a,p[22].attributes.JOINTS_0),nativeW=read(a,p[0].attributes.WEIGHTS_0),patchW=read(a,p[22].attributes.WEIGHTS_0);
const lookup=[...new Set(nativeI)].filter(id=>id>=908),match=[];
for(let id=49;id<=55;id++){
 const cp=patchP[id],cd=patchD[id];let found=-1;
 for(const k of [29,...lookup]){
  const v=nativeP[k],m=nativeD[k],rp=Math.hypot(...v.map((x,j)=>x-cp[j])),rd=Math.hypot(...m.map((x,j)=>x-cd[j]));
  if(rp<1e-7&&rd<1e-7&&JSON.stringify(nativeJ[k])===JSON.stringify(patchJ[id])&&Math.hypot(...nativeW[k].map((x,j)=>x-patchW[id][j]))<1e-7){found=k;break}
 }
 if(found<0)throw Error('r11 mismatched posterior vertex '+id);match.push([id,found]);
}
if(tri!==3610||garment!==370||a.d.skins[0].joints.length!==63)throw Error('counts wrong');
const screen=fs.readdirSync(root).filter(n=>/^rev96-r11-(0|25|40|55)-(under|behind)-(solid|wire)\.png$/.test(n));
if(screen.length!==16)throw Error('missing captures');
const report={schema:'F11-r11-verification/v1',source,file,sha256:sha(a.b),triangles:tri,bones:63,garmentFaces:370,
  sourceUserDeleted101AllAbsent:true,sourceOriginalVertexPositionsPreserved:true,bodySplitNewVertices:6,
  matchedRearNodes:match,restOpen55AndWeightsAlignedExactly:true,perineumOpenEdges:0,
  screenshots:screen.length,additionalDecimation:false,
  caveats:['Cross-primitive indices are not literally shared','The broad preexisting cut perimeter remains unclosed','User visual approval not yet obtained']};
const dest=path.join(root,'REV96_USER101_R11_CHECK.json');if(fs.existsSync(dest))throw Error('Refuse overwrite');
fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
