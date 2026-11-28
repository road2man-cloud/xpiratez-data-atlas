#!/usr/bin/env node
'use strict';
// N21: local lower central surface shaping on the completed N20 GLB.
// Retains N20 V10-derived body primitive and N19 rig, UV, face and hair.
const fs=require('node:fs'),path=require('node:path');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const [src,dst]=process.argv.slice(2);
if(!src||!dst)throw Error('usage: node build.cjs N20.glb N21.glb');
const q=load(src),g=q.g,pr=g.meshes[0].primitives;
const tris=()=>pr.reduce((s,p)=>s+g.accessors[p.indices].count/3,0);
if(tris()!==2099||g.skins[0].joints.length!==63)throw Error('Unexpected N20 model layout');
const pelvis=extract(q,0,3),skin=extract(q,0,6);
if(pelvis.positions.length!==240||pelvis.indices.length!==1089)throw Error('Unexpected central primitive topology');
const P=pelvis.positions.map(p=>p.slice()),orig=P.map(p=>p.slice());
const faces=Array.from({length:pelvis.indices.length/3},(_,i)=>pelvis.indices.slice(i*3,i*3+3));
const neighbors=P.map(()=>new Set()),incident=P.map(()=>[]),edges=new Map();
for(let i=0;i<faces.length;i++){
 const f=faces[i];
 for(const v of f)incident[v].push(i);
 for(const [a,b] of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]){
  neighbors[a].add(b);neighbors[b].add(a);
  const k=Math.min(a,b)+','+Math.max(a,b);edges.set(k,(edges.get(k)||0)+1);
 }
}
const locked=new Set([...edges].filter(x=>x[1]===1).flatMap(x=>x[0].split(',').map(Number)));
if(locked.size!==45)throw Error('Unexpected central perimeter topology');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((v,x,k)=>v+x*b[k],0),len=v=>Math.hypot(...v);
const normals0=faces.map(f=>cross(sub(orig[f[1]],orig[f[0]]),sub(orig[f[2]],orig[f[0]])));
const unit=v=>{const n=len(v)||1;return v.map(x=>x/n)};
const safe=v=>incident[v].every(fi=>{
 const f=faces[fi],n=cross(sub(P[f[1]],P[f[0]]),sub(P[f[2]],P[f[0]])),ref=normals0[fi];
 return len(n)>.000000002&&dot(n,ref)/(len(n)*len(ref)||1)>.22;
});
let changed=new Set(),totalMoved=0,maxMove=0,attempts=0;
const candidates=orig.map((p,i)=>i).filter(i=>!locked.has(i)&&Math.abs(orig[i][0])<.12&&orig[i][2]>.819&&orig[i][2]<.9&&orig[i][1]<.02&&neighbors[i].size>=3);
if(candidates.length<5)throw Error('No eligible lower-center vertices');
for(let pass=0;pass<9;pass++){
 for(const i of candidates){
  const [x,y,z]=orig[i];
  const vertical=smooth((z-.819)/.023)*(1-smooth((z-.876)/.026));
  const horizontal=1-smooth((Math.abs(x)-.036)/.080);
  const front=1-smooth((y+.037)/.065);
  const strength=vertical*horizontal*front;
  if(strength<.008)continue;
  // Keep the narrow upper midline and restore a broad, continuous lower
  // surface. The 1-ring median suppresses inherited elongated fabric ridges.
  const local=[...neighbors[i]].map(j=>P[j][1]).sort((a,b)=>a-b);
  const median=local[Math.floor(local.length/2)];
  const surround=-.079+.004*smooth((z-.84)/.05);
  const goal=.48*median+.52*surround;
  const step=clamp((goal-P[i][1])*.22*strength,-.0025,.0025);
  if(Math.abs(step)<.0000002)continue;
  const previous=P[i].slice();let ok=false;
  for(let s=1;s>=1/512;s/=2){
   P[i]=[previous[0],previous[1]+step*s,previous[2]];
   attempts++;
   if(safe(i)){ok=true;break}
  }
  if(!ok){P[i]=previous;continue}
  const move=Math.abs(P[i][1]-previous[1]);
  if(move>1e-7){changed.add(i);totalMoved+=move;maxMove=Math.max(maxMove,len(sub(P[i],orig[i])))}
 }
}
if(changed.size<5)throw Error('N21 lower-surface edit had no meaningful effect: '+changed.size);
// Recalculate normals only on center and preserve outward facing orientation.
const sums=P.map(()=>[0,0,0]);
for(const f of faces){const n=cross(sub(P[f[1]],P[f[0]]),sub(P[f[2]],P[f[0]]));for(const i of f)for(let k=0;k<3;k++)sums[i][k]+=n[k]}
const newNormals=pelvis.normals.map(n=>n.slice()),affected=new Set([...changed,...[...changed].flatMap(i=>[...neighbors[i]])]);
for(const i of affected){
 if(locked.has(i))continue;
 let n=unit(sums[i]),ref=unit(pelvis.normals[i]);if(dot(n,ref)<0)n=n.map(x=>-x);
 newNormals[i]=unit(n.map((v,k)=>.85*v+.15*ref[k]));
}
for(const i of locked)if(len(sub(P[i],orig[i]))>1e-9)throw Error('Seam boundary altered');
const builder=new Builder(q),p=builder.g.meshes[0].primitives[3];
p.attributes.POSITION=builder.addAccessor(P,'VEC3',5126,34962);
p.attributes.NORMAL=builder.addAccessor(newNormals,'VEC3',5126,34962);
p.extras={...p.extras,stage:'N21_LOWER_CENTER_LOCAL_SURFACE_RELIEF',boundaryPreserved:true};
builder.g.asset.generator='R36HW N21 V10 body N19 center local geometry refinement';
builder.g.extras={...builder.g.extras,r36hwN21:{source:'N20 V10 body / N19 center',localCenterRelief:true,nativeS2Acceptance:false}};
fs.mkdirSync(path.dirname(dst),{recursive:true});
const saved=builder.save(dst);
const audit={profile:'R36HW N21',inputSHA256:q.sha,outputSHA256:saved.sha,outputBytes:saved.bytes,triangles:tris(),rigJoints:63,centerPrimitive:3,centerTriangles:faces.length,boundaryLocked:locked.size,candidates:candidates.length,changedVertices:changed.size,maxDisplacementMeters:maxMove,accumulatedIterationMovementMeters:totalMoved,safetyAttempts:attempts,bodyPrimitive6Unmodified:true,UVAndBoneWeightsUnmodified:true,sourceFaceHairUnmodified:true,limitations:['Not a welded pelvis-to-leg topology','Inherited long-triangle garment silhouette may still be present','Requires native S2 render and posed visual review']};
const report=path.resolve(path.dirname(dst),'../reports/build.json');
fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(audit,null,2)+'\n');console.log(JSON.stringify(audit));
