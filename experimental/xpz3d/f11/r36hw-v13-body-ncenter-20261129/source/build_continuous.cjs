#!/usr/bin/env node
'use strict';
// Continuous V13 body variant: original full-body surface is never cut.
// Only narrow center relief is sampled from N21; no N-series torso/limb coordinates.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load,extract,values,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const [vfile,nfile,outfile]=process.argv.slice(2);
if(!outfile)throw Error('usage: build_continuous.cjs V13.glb N21.glb out.glb');
const V=load(vfile),N=load(nfile),g=V.g,b=new Builder(V);
const sha=crypto.createHash('sha1').update('blob '+V.raw.length+'\0').update(V.raw).digest('hex');
if(sha!=='b48db6db2cdf0bdc40ba684550125a339167a2c6')throw Error('V13 pinned source mismatch');
if(g.skins[0].joints.length!==63||N.g.skins[0].joints.length!==63)throw Error('unexpected skeleton');
const M=extract(V,0,5),SK=extract(V,0,2),C=extract(N,0,3),p=b.g.meshes[0].primitives[5];
if(M.positions.length!==706||C.positions.length!==240||p.material!==18)throw Error('unexpected input topology');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const cross=(a,c)=>[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]];
const sub=(a,c)=>a.map((v,k)=>v-c[k]),dot=(a,c)=>a.reduce((v,x,k)=>v+x*c[k],0),norm=a=>Math.hypot(...a);
const unit=a=>{const n=norm(a)||1;return a.map(v=>v/n)};
const P=M.positions.map(v=>v.slice()),O=M.positions.map(v=>v.slice());
const faces=Array.from({length:M.indices.length/3},(_,i)=>M.indices.slice(i*3,i*3+3)),incident=P.map(()=>[]),ring=P.map(()=>new Set()),normal0=[];
for(let i=0;i<faces.length;i++){
 const f=faces[i];normal0.push(cross(sub(O[f[1]],O[f[0]]),sub(O[f[2]],O[f[0]])));
 for(const id of f)incident[id].push(i);
 for(const [a,c] of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]){ring[a].add(c);ring[c].add(a)}
}
function safe(i){return incident[i].every(t=>{
 const f=faces[t],n=cross(sub(P[f[1]],P[f[0]]),sub(P[f[2]],P[f[0]])),ref=normal0[t];
 return norm(n)>1e-9&&dot(n,ref)/(norm(n)*norm(ref)||1)>.65;
})}
// Use original N21 central surface as a continuous sampled Y(x,z) heightfield.
// No N21 vertices or faces become full-body mesh components.
const samples=[];
for(let i=0;i<C.positions.length;i++){
 const a=C.positions[i];
 if(Math.abs(a[0])<.13&&a[2]>.795&&a[2]<1.028&&a[1]<-.020)samples.push(a);
}
if(samples.length<16)throw Error('center reference unexpectedly sparse');
function sample(x,z){
 const l=samples.map(p=>({p,d:Math.hypot((p[0]-x),1.15*(p[2]-z))})).sort((a,c)=>a.d-c.d).slice(0,6);
 if(l[0].d>.077)return null;
 let y=0,w=0;for(const {p,d} of l){let q=1/(d+.004)**2;w+=q;y+=q*p[1]}
 return y/w;
}
let changed=0,maxDelta=0,sum=0,protectedCount=0,rejected=0,matched=0;const touched=new Set();
for(let i=0;i<P.length;i++){
 const [x,y,z]=O[i],a=Math.abs(x);
 const gate=(1-smooth((a-.032)/.103))*smooth((z-.795)/.066)*(1-smooth((z-.965)/.078))*smooth((-y-.022)/.064);
 if(gate<.003){protectedCount++;continue}
 const py=sample(x,z);if(py===null)continue;matched++;
 const delta=clamp((py-y)*gate*.82,-.014,.014);
 if(Math.abs(delta)<1e-5)continue;
 const old=P[i].slice();let ok=false;
 for(let q=1;q>=1/512;q/=2){
  P[i]=[x,y+q*delta,z];
  if(safe(i)){ok=true;break}
 }
 if(!ok){P[i]=old;rejected++;continue}
 let moved=Math.abs(P[i][1]-y);
 if(moved>1e-6){changed++;sum+=moved;maxDelta=Math.max(maxDelta,moved);touched.add(i)}
}
if(changed<1)throw Error('No central surface change from N21: candidates '+matched);
let sums=P.map(()=>[0,0,0]);
for(const f of faces){
 const n=cross(sub(P[f[1]],P[f[0]]),sub(P[f[2]],P[f[0]]));
 for(const i of f)for(let k=0;k<3;k++)sums[i][k]+=n[k];
}
const Ns=M.normals.map(x=>x.slice()),affected=new Set([...touched,...[...touched].flatMap(i=>[...ring[i]])]);
for(const i of affected){
 let old=unit(Ns[i]),now=unit(sums[i]);if(dot(now,old)<0)now=now.map(x=>-x);
 Ns[i]=unit(now.map((v,k)=>.8*v+.2*old[k]));
}
// V13's own exposed skin color is the ONLY palette reference.
const palette=SK.colors;
if(!palette||!palette.length)throw Error('V13 skin colors absent');
const median=[0,1,2].map(k=>palette.map(p=>p[k]).sort((a,c)=>a-c)[Math.floor(palette.length/2)]);
const colors=P.map(pos=>{
 let best=Infinity,source=null;
 for(let j=0;j<SK.positions.length;j++){
  const d=norm(sub(pos,SK.positions[j]));
  if(d<best){best=d;source=palette[j]}
 }
 return [0,1,2].map(k=>clamp(best<.12?.48*source[k]+.52*median[k]:median[k],0,1)).concat(1);
});
p.material=8;
p.attributes.POSITION=b.addAccessor(P,'VEC3',5126,34962);
p.attributes.NORMAL=b.addAccessor(Ns,'VEC3',5126,34962);
p.attributes.COLOR_0=b.addAccessor(colors,'VEC4',5126,34962);
delete p.attributes.TANGENT;
delete p.attributes.TEXCOORD_0;
p.extras={...p.extras,profile:'V13_NCENTER_CONTINUOUS',V13Base:'bde014a9',centerSource:'N21 center primitive only'};
b.g.asset.generator='R36HW V13 body continuous / N21 center relief';
b.g.extras={...b.g.extras,V13NCenterContinuous:{bodySource:'V13 warm-ochre',centerSource:'N21 primitive3',fullyV13Triangles:true,artApproved:false}};
if(b.g.meshes[0].primitives.reduce((s,p)=>s+b.g.accessors[p.indices].count/3,0)!==2100)throw Error('triangle budget lost');
if(b.g.skins[0].joints.length!==63)throw Error('rig lost');
fs.mkdirSync(path.dirname(outfile),{recursive:true});
const result=b.save(outfile);
const report={modelBaseGitCommit:'8c68b4ddde2696674a533216c20bbb62d46242d3',NCenterSource:'N21 primitive 3 only',V13ClothColorRemoved:true,V13SkinMaterialApplied:true,name:'V13_NCENTER_CONTINUOUS',sourceV13GitBlob:sha,V13SHA256:V.sha,N21SHA256:N.sha,outputSHA256:result.sha,outputBytes:result.bytes,triangles:2100,rigJoints:63,bodySource:'V13 warm-ochre',NSeriesBodyCopied:false,centerPrimitive:'N21 3 reference field only',centerMatchedVertices:matched,displacedVertices:changed,protectedUnchangedVertices:protectedCount,guardRejectedVertices:rejected,maxDisplacementMeters:maxDelta,meanDisplacementMeters:sum/changed,topologyCut:false,openPatchCreated:false,originalV13BodyIndicesExactlyPreserved:true,limitations:['V13 garment-derived silhouette not a complete anatomical retopology','N center relief sampled to existing V13 vertices; limited by local mesh resolution','S2 renderer and posed anatomy not verified']};
const reportFile=path.resolve(path.dirname(outfile),'../reports/continuous.json');fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
