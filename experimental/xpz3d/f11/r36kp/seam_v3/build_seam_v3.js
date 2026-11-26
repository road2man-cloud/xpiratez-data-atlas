#!/usr/bin/env node
/**
 * R36KK seam-v3 (NOT a reconstruction of R36KP).
 * Select boundary-ring hip/leg join vertices by point-to-triangle surface gap,
 * blend gently into the next ring, preserve all head/hair/torso/rig/UV/texture data.
 * Usage: node build_seam_v3.js BASE_1024.glb OUTPUT_1024.glb
 */
'use strict';
const fs=require('fs'), path=require('path'),crypto=require('crypto');
const sourceFile=process.argv[2],outFile=process.argv[3];
if(!sourceFile||!outFile)throw Error('Usage: node build_seam_v3.js source.glb output.glb');
const src=fs.readFileSync(sourceFile),b=Buffer.from(src),jl=b.readUInt32LE(12);
if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length) throw Error('Invalid GLB v2');
const gltf=JSON.parse(b.subarray(20,20+jl).toString('utf8')),base=20+jl+8,p=gltf.meshes[0].primitives;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const minus=(a,c)=>a.map((v,i)=>v-c[i]),plus=(a,c)=>a.map((v,i)=>v+c[i]),times=(a,t)=>a.map(v=>v*t);
const dot=(a,c)=>a.reduce((t,x,i)=>t+x*c[i],0),length=v=>Math.hypot(...v),distance=(a,c)=>length(minus(a,c));
function accessor(id){
 const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3}[a.type];
 const stride={5126:4,5123:2}[a.componentType];
 if(!n||!stride||v.byteStride)throw Error('Unsupported layout: '+id);
 const off=base+(v.byteOffset||0)+(a.byteOffset||0);
 return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>{
  const o=off+i*n*stride+k*stride;
  return a.componentType===5126?b.readFloatLE(o):b.readUInt16LE(o);
 }));
}
function writeVec3(id,positions){
 const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],off=base+(v.byteOffset||0)+(a.byteOffset||0);
 if(a.componentType!==5126||a.type!=='VEC3')throw Error('VEC3 float required');
 positions.forEach((x,i)=>x.forEach((n,k)=>b.writeFloatLE(n,off+i*12+k*4)));
}
function closestPoint(P,A,B,C){
 // Robust closest point on triangle (Ericson, Real-Time Collision Detection).
 const ab=minus(B,A),ac=minus(C,A),ap=minus(P,A),d1=dot(ab,ap),d2=dot(ac,ap);
 if(d1<=0&&d2<=0)return A;
 const bp=minus(P,B),d3=dot(ab,bp),d4=dot(ac,bp);
 if(d3>=0&&d4<=d3)return B;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return plus(A,times(ab,d1/(d1-d3)));
 const cp=minus(P,C),d5=dot(ab,cp),d6=dot(ac,cp);
 if(d6>=0&&d5<=d6)return C;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return plus(A,times(ac,d2/(d2-d6)));
 const va=d3*d6-d5*d4;
 if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return plus(B,times(minus(C,B),(d4-d3)/((d4-d3)+(d5-d6))));
 const denom=1/(va+vb+vc);
 return plus(plus(A,times(ab,vb*denom)),times(ac,vc*denom));
}
function cross(a,c){return [a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]]}
function normalize(a){let m=length(a);return m>1e-12?times(a,1/m):[0,0,1]}
const torsoPos=accessor(p[7].attributes.POSITION),torsoNormal=accessor(p[7].attributes.NORMAL);
const torsoInd=accessor(p[7].indices).flat(),torsoFaces=[];
for(let i=0;i<torsoInd.length;i+=3)torsoFaces.push(torsoInd.slice(i,i+3));
function nearestTorso(q){
 let best=null;
 for(let fi=0;fi<torsoFaces.length;fi++){
  const f=torsoFaces[fi],q2=closestPoint(q,...f.map(i=>torsoPos[i])),d=distance(q,q2);
  if(!best||d<best.gap){
   best={gap:d,target:q2,face:fi,normal:normalize(f.map(i=>torsoNormal[i]).reduce((s,v)=>plus(s,v),[0,0,0]))};
  }
 }
 return best;
}
function boundarySet(indices){
 const edges=new Map();
 for(let k=0;k<indices.length;k+=3){
  const f=indices.slice(k,k+3);
  for(let j=0;j<3;j++){
   const e=[f[j],f[(j+1)%3]].sort((a,c)=>a-c),key=e.join(':');
   edges.set(key,(edges.get(key)||0)+1);
  }
 }
 const out=new Set();
 for(const [k,n] of edges)if(n===1)k.split(':').forEach(x=>out.add(+x));
 return out;
}
const sides=[];
for(let pi of [10,11]){
 const prim=p[pi],orig=accessor(prim.attributes.POSITION),normal=accessor(prim.attributes.NORMAL);
 const idx=accessor(prim.indices).flat(),bound=boundarySet(idx),points=orig.map(v=>v.slice());
 const seed=[];
 for(const i of bound){
  const pos=orig[i];
  if(pos[2]<0.948||pos[2]>0.975||Math.abs(pos[0])<0.07)continue;
  const near=nearestTorso(pos);
  if(near.gap<0.0045||near.gap>0.029)continue;
  const magnitude=Math.min(0.0036,0.35*(near.gap-0.0045));
  seed.push({i,pos,target:near.target,gap:near.gap,delta:times(minus(near.target,pos),magnitude/near.gap),normal:near.normal});
 }
 const deltas=points.map(()=>[0,0,0]);
 // Group split-normal duplicates at the same 3D position, maintaining coincident geometry.
 for(let i=0;i<orig.length;i++){
  const pt=orig[i],sameSeed=seed.find(s=>distance(pt,s.pos)<0.00001);
  if(sameSeed){deltas[i]=sameSeed.delta.slice();continue;}
  if(pt[2]>=0.892&&pt[2]<=0.946){
   const candidates=seed.filter(s=>Math.hypot(pt[0]-s.pos[0],pt[1]-s.pos[1])<0.025);
   if(candidates.length){
    const s=candidates.sort((a,c)=>Math.hypot(pt[0]-a.pos[0],pt[1]-a.pos[1])-Math.hypot(pt[0]-c.pos[0],pt[1]-c.pos[1]))[0];
    const scale=0.28*Math.exp(-Math.pow((pt[2]-0.9165)/0.028,2));
    deltas[i]=times(s.delta,scale);
   }
  }
 }
 sides.push({pi,orig,points,normal,idx,seed,deltas,attrs:prim.attributes});
}
// Keep the original bilateral symmetry where corresponding vertices exist.
const [left,right]=sides;
let mirrorPairs=0;
for(let i=0;i<left.orig.length;i++){
 const v=left.orig[i];
 const jr=right.orig.findIndex(q=>Math.abs(v[0]+q[0])<1e-5&&Math.abs(v[1]-q[1])<1e-5&&Math.abs(v[2]-q[2])<1e-5);
 if(jr<0)continue;
 const a=left.deltas[i],c=right.deltas[jr];
 const blended=[(a[0]-c[0])/2,(a[1]+c[1])/2,(a[2]+c[2])/2];
 left.deltas[i]=blended;
 right.deltas[jr]=[-blended[0],blended[1],blended[2]];
 mirrorPairs++;
}
const report={name:path.basename(outFile),kind:'R36KK derivative (not R36KP)',source:path.basename(sourceFile),
 sourceSha256:sha(src),protectedPrimitiveRange:'0..9',skinMaterialsAndImages:'byte-identical to source',
 method:'triangle-surface rim proximity, limited displacement, second-ring falloff, normal recompute blending',
 settings:{minTopZ:0.948,maxTopZ:0.975,minGap:0.0045,maxGap:0.029,maxStep:0.0036,secondRingFactor:0.28,normalMix:0.32},mirrorPairs,changes:[]};
for(const side of sides){
 const {orig,points,normal,idx,deltas,seed,attrs,pi}=side;
 for(let i=0;i<orig.length;i++)points[i]=plus(points[i],deltas[i]);
 // Preserve original normal convention and blend a limited amount of the new vertex normals.
 let sums=normal.map(()=>[0,0,0]);
 for(let i=0;i<idx.length;i+=3){
  const [a,c,d]=idx.slice(i,i+3),faceNormal=cross(minus(points[c],points[a]),minus(points[d],points[a]));
  for(let k of [a,c,d])sums[k]=plus(sums[k],faceNormal);
 }
 const newNormal=normal.map((n,i)=>{
  const delta=length(deltas[i]);
  if(delta<0.00000001)return n;
  const geometric=normalize(sums[i]);
  if(dot(geometric,n)<0.50)return n;
  return normalize(plus(times(n,0.68),times(geometric,0.32)));
 });
 writeVec3(attrs.POSITION,points);
 writeVec3(attrs.NORMAL,newNormal);
 const startAvg=seed.length?seed.reduce((sum,x)=>sum+x.gap,0)/seed.length:null;
 const endAvg=seed.length?seed.reduce((sum,x)=>sum+nearestTorso(points[x.i]).gap,0)/seed.length:null;
 report.changes.push({primitive:pi,seedVertices:seed.length,changedVertices:deltas.filter(x=>length(x)>1e-8).length,
  meanSurfaceGapBefore:startAvg,meanSurfaceGapAfter:endAvg,
  maxDisplacement:Math.max(...deltas.map(length)),seedIndices:seed.map(x=>x.i)});
}
if(b.length!==src.length)throw Error('Unexpected GLB length');
fs.writeFileSync(outFile,b);
report.bytes=b.length;
report.sha256=sha(b);
report.triangles=p.reduce((n,x)=>n+gltf.accessors[x.indices].count/3,0);
report.bones=gltf.skins[0].joints.length;
report.protectedByteRangesEqual=Array.from({length:10},(_,i)=>i).every(i=>{
 const attrs=[...Object.values(p[i].attributes),p[i].indices];
 return attrs.every(id=>{
  const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],s=base+(v.byteOffset||0)+(a.byteOffset||0),l=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4})[a.type]*({5126:4,5123:2,5121:1})[a.componentType]*a.count;
  return src.subarray(s,s+l).equals(b.subarray(s,s+l));
 });
});
fs.writeFileSync(outFile+'.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
