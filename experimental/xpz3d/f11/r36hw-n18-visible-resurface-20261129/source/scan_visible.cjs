#!/usr/bin/env node
'use strict';
// Source-GLB geometry scan used to drive actual N18 surface replacement.
// This is not a rendered image or a photo heightmap.
const fs=require('fs'),path=require('path');
const {load,extract}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const input=process.argv[2],output=process.argv[3];
const q=load(input),p=extract(q,0,3),P=p.positions,idx=p.indices,faces=[];
const W=180,H=168,loX=-.15,hiX=.15,loZ=.802,hiZ=1.035;
const faceCount=idx.length/3;
for(let i=0;i<faceCount;i++)faces.push(idx.slice(i*3,i*3+3));
const sampled=new Int32Array(W*H).fill(-1),depth=new Float32Array(W*H).fill(-Infinity),weightedY=new Float32Array(W*H).fill(Infinity);
const xy=pt=>[(pt[0]-loX)/(hiX-loX)*(W-1),(pt[2]-loZ)/(hiZ-loZ)*(H-1)];
const center=ids=>[0,1,2].map(k=>ids.reduce((s,i)=>s+P[i][k],0)/3);
for(let t=0;t<faces.length;t++){
 const f=faces[t],proj=f.map(i=>xy(P[i])),xs=proj.map(p=>p[0]),ys=proj.map(p=>p[1]);
 const a=Math.max(0,Math.floor(Math.min(...xs))),b=Math.min(W-1,Math.ceil(Math.max(...xs)));
 const c=Math.max(0,Math.floor(Math.min(...ys))),d=Math.min(H-1,Math.ceil(Math.max(...ys)));
 const D=(proj[1][1]-proj[2][1])*(proj[0][0]-proj[2][0])+(proj[2][0]-proj[1][0])*(proj[0][1]-proj[2][1]);
 if(Math.abs(D)<1e-8)continue;
 for(let y=c;y<=d;y++)for(let x=a;x<=b;x++){
  const u=((proj[1][1]-proj[2][1])*(x+.5-proj[2][0])+(proj[2][0]-proj[1][0])*(y+.5-proj[2][1]))/D;
  const v=((proj[2][1]-proj[0][1])*(x+.5-proj[2][0])+(proj[0][0]-proj[2][0])*(y+.5-proj[2][1]))/D;
  const w=1-u-v;
  if(Math.min(u,v,w)<0)continue;
  const pt=f.map(i=>P[i]);const py=u*pt[0][1]+v*pt[1][1]+w*pt[2][1];
  const zz=u*pt[0][2]+v*pt[1][2]+w*pt[2][2];
  const z=-py+.12*zz,at=y*W+x;
  if(z>depth[at]){depth[at]=z;sampled[at]=t;weightedY[at]=py}
 }
}
let visible=new Map(),byBand=[],samples=[];
for(let i=0;i<sampled.length;i++){
 const t=sampled[i];if(t<0)continue;
 visible.set(t,(visible.get(t)||0)+1);
}
for(const z of [.84,.87,.90,.93,.96,.99,1.02]){
 const line=[];
 for(const x of [-.12,-.09,-.06,-.03,0,.03,.06,.09,.12]){
  const col=Math.round((x-loX)/(hiX-loX)*(W-1)),row=Math.round((z-loZ)/(hiZ-loZ)*(H-1)),at=row*W+col;
  const face=sampled[at];line.push({x,y:face<0?null:+weightedY[at].toFixed(4),face});
 }
 byBand.push({z,line});
}
const ranking=[...visible].sort((a,b)=>b[1]-a[1]).map(([t,pixels])=>{
 const f=faces[t],c=center(f),front=c[1]<-.02&&c[2]>.81&&c[2]<1.04;
 return {t,pixels,ids:f,center:c.map(v=>+v.toFixed(5)),front};
});
const boundary=new Map();for(const f of faces)for(const [a,b] of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]){
 const key=a<b?a+','+b:b+','+a;boundary.set(key,(boundary.get(key)||0)+1);
}
const bound=[...boundary].filter(([k,v])=>v===1).map(([k])=>k.split(',').map(Number));
const anchorIds=[...new Set(bound.flat())],summary={inputSHA:q.sha,triangleCount:faces.length,vertexCount:P.length,visibleFaces:visible.size,boundaryEdgeCount:bound.length,boundaryVertices:anchorIds.length,byBand,visibleRanking:ranking.slice(0,130),anchorPositions:anchorIds.map(i=>({i,p:P[i].map(v=>+v.toFixed(5))})),otherFrontVertexPositions:P.map((p,i)=>({i,p})).filter(({p})=>Math.abs(p[0])<.125&&p[2]>.825&&p[2]<.999&&p[1]<-.03).map(o=>({i:o.i,p:o.p.map(v=>+v.toFixed(5))})).slice(0,120)};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({input:q.sha,visible:visible.size,top:ranking.slice(0,12),bands:byBand,boundaries:bound.length}));
