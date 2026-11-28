#!/usr/bin/env node
'use strict';
/*
 * R36HW N18: LOCAL FRONT VISIBLE-SURFACE RESTORATION.
 *
 * N17 leaves a very wide 25-45 mm inset at Z .84-.88, causing a large,
 * shorts-like void rather than a small anatomical depression. N18 reconstructs
 * this existing surface into a narrower rounded fold using actual POSITION
 * changes on the original integrated pelvic primitive. No separate objects,
 * photo pixels, R36JB replacement, or full-body rebuilding.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder,values}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n17-skin-field-20261129/output/R36HW_N17_CENTER_DEPTH.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N18_FRONT_SKIN_RESTORED.glb');
const reportFile=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N18_FRONT_SKIN_RESTORED.json');
const expected='56af097238c2b562f98330648b2e8a9782c64b3cef4e7320f2c9a03e38029e6f';
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const q=load(input);if(q.sha!==expected)throw Error('Unexpected R36HW N17 source: '+q.sha);
if(q.g.skins[0].joints.length!==63)throw Error('Source rig has changed');
const src=q.g.meshes[0].primitives[3],m=extract(q,0,3);
const P=m.positions.map(v=>v.slice()),before=P.map(v=>v.slice()),F=Array.from({length:m.indices.length/3},(_,i)=>m.indices.slice(i*3,i*3+3));
const all=q.g.meshes[0].primitives.reduce((s,p)=>s+q.g.accessors[p.indices].count/3,0);
if(all!==2099||F.length!==363||P.length!==240)throw Error('Unexpected N17 pelvic mesh layout');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
const gauss=(x,s)=>Math.exp(-.5*(x/s)**2);
const edges=new Map(),neighbor=Array.from({length:P.length},()=>new Set()),incident=Array.from({length:P.length},()=>[]);
for(let t=0;t<F.length;t++){
 const [a,b,c]=F[t];
 for(const i of [a,b,c])incident[i].push(t);
 for(const [u,v] of [[a,b],[b,c],[c,a]]){
  neighbor[u].add(v);neighbor[v].add(u);
  const k=u<v?u+','+v:v+','+u;edges.set(k,(edges.get(k)||0)+1);
 }
}
const locked=new Set([...edges].filter(([k,v])=>v===1).flatMap(([k])=>k.split(',').map(Number)));
if(locked.size!==45)throw Error('Boundary change in N17: '+locked.size);
// Observed from 180x168 face-ID map of actual N17 primitive:
// center depth -0.0448 at z .87 vs surrounding skin around -0.089,
// and center -0.054 at z .84 vs surrounding -0.09. Fix by reshaping
// the *front-facing mesh*, not shader normals or a decal.
function targetShape(p){
 const [x,y,z]=p;
 const nearCenter=Math.exp(-.5*((x+.003)/.041)**2);
 const outer=1-smooth((Math.abs(x)-.042)/.060);
 const bottom=smooth((z-.816)/.049),top=1-smooth((z-.954)/.061);
 const zWindow=bottom*top;
 const front=1-smooth((y+.053)/.072);
 const gate=nearCenter*outer*zWindow*front;
 if(gate<.001)return {gate:0,target:y};
 // Smooth restored skin support at 0.84-0.94; anchored at the actual
 // nearby untouched surface measured from the visible triangle scan.
 const surround=-.089+.008*smooth((z-.855)/.135);
 // A shallow asymmetric relief with a narrow central groove and
 // smooth raised adjacent edges; no invented absolute photo depth.
 const offset=-.007+.008*Math.sin((z-.85)*12.5);
 const groove=.0090*gauss((x-offset)/.011,1)*gauss((z-.898)/.062,1);
 const upper=.0024*gauss((x-offset+.005)/.014,1)*gauss((z-.937)/.025,1);
 const left=-.0029*gauss((x-offset+.027)/.013,1)*gauss((z-.894)/.064,1);
 const right=-.0031*gauss((x-offset-.024)/.013,1)*gauss((z-.882)/.060,1);
 const end=.0018*gauss((x-.004)/.018,1)*gauss((z-.855)/.028,1);
 const desired=surround+groove+upper+left+right+end;
 const shift=clamp((desired-y)*gate,-.051,.014);
 return {gate,target:y+shift,shift,desired};
}
const candidates=[],target=P.map(v=>v.slice());
for(let i=0;i<P.length;i++){
 if(locked.has(i))continue;
 const shape=targetShape(before[i]);
 if(shape.gate<.001||neighbor[i].size<3)continue;
 const old=before[i];
 target[i][1]=shape.target;
 // Shift only the center 3D surface toward a smooth curve, without
 // altering unrelated limb and torso positions.
 const local=smooth((old[2]-.822)/.060)*(1-smooth((old[2]-.965)/.025));
 const channel=(1-smooth((Math.abs(old[0])-.013)/.065))*local*shape.gate;
 target[i][0]+=clamp((-0.006+0.007*Math.sin((old[2]-.85)*15)-old[0])*.14*channel,-.0035,.0035);
 target[i][2]+=clamp(.0024*Math.sin(old[0]*34)*channel,-.0018,.0018);
 candidates.push(i);
}
if(candidates.length<25)throw Error('No meaningful central visible vertices: '+candidates.length);
const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const originalNormals=F.map(f=>{const [a,b,c]=f.map(i=>before[i]);return cross(sub(b,a),sub(c,a))});
function faceSafety(f){
 const [a,b,c]=F[f].map(i=>P[i]),n=cross(sub(b,a),sub(c,a)),ref=originalNormals[f];
 const length=norm(n),refLength=norm(ref),cos=dot(n,ref)/(length*refLength||1);
 return {area:length*.5,cos};
}
function safeAround(i){
 for(const f of incident[i]){
  const {area,cos}=faceSafety(f);
  if(area<1e-10||cos<.11)return false;
 }
 return true;
}
// Controlled incremental Gauss-Seidel deformation. Scale each vertex's
// movement independently if its neighboring triangles would invert.
let operations=0,failed=0;
const sorted=candidates.slice().sort((a,b)=>{
 const A=targetShape(before[a]),B=targetShape(before[b]);
 return B.gate-A.gate;
});
for(let pass=0;pass<16;pass++){
 for(const i of sorted){
  const current=P[i].slice(),delta=target[i].map((v,k)=>v-current[k]);
  if(norm(delta)<1e-7)continue;
  let success=false;
  for(let scale=1;scale>=1/1024;scale*=.5){
   const next=current.map((v,k)=>v+delta[k]*scale);
   P[i]=next;
   if(safeAround(i)){success=true;operations++;break}
  }
  if(!success){P[i]=current;failed++}
 }
}
let maxDelta=0,changed=0,mean=0;
for(let i=0;i<P.length;i++){
 const delta=norm(sub(P[i],before[i]));maxDelta=Math.max(maxDelta,delta);
 if(delta>1e-5){changed++;mean+=delta}
 if(locked.has(i)&&delta>1e-9)throw Error('Boundary vertex changed');
}
if(changed<20)throw Error('Center local resurface was ineffective: '+changed);
// More nuanced normals derived from the updated geometry.
// The other 9 original primitives retain all their source data.
const normals=m.normals.map(x=>x.slice()),sums=P.map(()=>[0,0,0]);
for(const f of F){const [a,b,c]=f.map(i=>P[i]),n=cross(sub(b,a),sub(c,a));for(const i of f)for(let k=0;k<3;k++)sums[i][k]+=n[k]}
function unit(a){const n=norm(a)||1;return a.map(v=>v/n)}
const changedSet=new Set([...candidates,...candidates.flatMap(i=>[...neighbor[i]])]);
for(const i of changedSet){
 if(locked.has(i))continue;
 let n=unit(sums[i]),old=unit(normals[i]);if(dot(n,old)<0)n=n.map(x=>-x);
 const weight=.92*targetShape(before[i]).gate;
 normals[i]=unit(n.map((v,k)=>v*weight+old[k]*(1-weight)));
}
const builder=new Builder(q);
const primitive=builder.g.meshes[0].primitives[3];
primitive.attributes.POSITION=builder.addAccessor(P,'VEC3',5126,34962);
primitive.attributes.NORMAL=builder.addAccessor(normals,'VEC3',5126,34962);
primitive.extras={...primitive.extras,stage:'N18_ATTACHED_VISIBLE_SKIN_SURFACE_RESTORATION',centerMoved:true,origin:'N17 original HW lineage',photoProjected:false};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(reportFile),{recursive:true});
const saved=builder.save(output),maxAreaErr=Math.min(...F.map((_,i)=>faceSafety(i).area));
const audit={version:'R36HW N18',inputSHA256:q.sha,outputSHA256:saved.sha,trianglesBefore:all,trianglesAfter:all,pelvisTriangles:F.length,pelvisVertices:P.length,rigJoints:q.g.skins[0].joints.length,boundaryLocked:locked.size,candidates:candidates.length,changedVertices:changed,meanVertexMoveMeters:mean/Math.max(changed,1),maxVertexMoveMeters:maxDelta,operations,failedIncrementAttempts:failed,minFaceAreaSqMeters:maxAreaErr,sourceFaceHairUnmodified:true,sourceUVAndBoneWeightsUnmodified:true,otherPrimitivesUntouched:true,imageProjected:false,previewApproved:false,nativeS2Rendered:false,limitations:['Central silhouette and photo similarity not yet artist approved','Inherited former shorts geometry and open waist/leg seams still remain','Model uses no extracted depth from a single perspective photo']};
fs.writeFileSync(reportFile,JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({output,sha:saved.sha,changed,maximumMove:maxDelta,meanMove:audit.meanVertexMoveMeters,operations,failed,triangles:all}));
