#!/usr/bin/env node
'use strict';
/*
 * R36HW N19: LOCAL FRONT VISIBLE-SURFACE RESTORATION.
 *
 * N17 leaves a very wide 25-45 mm inset at Z .84-.88, causing a large,
 * shorts-like void rather than a small anatomical depression. N18 reconstructs
 * this existing surface into a narrower rounded fold using actual POSITION
 * changes on the original integrated pelvic primitive. No separate objects,
 * photo pixels, R36JB replacement, or full-body rebuilding.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder,values}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n18-visible-resurface-20261129/output/R36HW_N18_FRONT_SKIN_RESTORED.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N19_LOWER_SKIN_BRIDGE.glb');
const reportFile=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N19_LOWER_SKIN_BRIDGE.json');
const expected='cbf436a41905d1278697ad1520b8000318ea1130485ed1c325d87341483516a9';
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const q=load(input);if(q.sha!==expected)throw Error('Unexpected R36HW N18 source: '+q.sha);
if(q.g.skins[0].joints.length!==63)throw Error('Source rig has changed');
const src=q.g.meshes[0].primitives[3],m=extract(q,0,3);
const P=m.positions.map(v=>v.slice()),before=P.map(v=>v.slice()),F=Array.from({length:m.indices.length/3},(_,i)=>m.indices.slice(i*3,i*3+3));
const all=q.g.meshes[0].primitives.reduce((s,p)=>s+q.g.accessors[p.indices].count/3,0);
if(all!==2099||F.length!==363||P.length!==240)throw Error('Unexpected N18 pelvic mesh layout');
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
// N19: lower pelvis-to-real-bare-leg alignment on ORIGINAL GLB coordinates.
// This operates directly on primitive 3. Primitive 6 is reference-only.
const skin=extract(q,0,6),skinPositions=skin.positions,skinIds=skin.indices;
const skinRanges=q.g.meshes[0].primitives[6].extras?.ranges||[];
const legNames=['L leg below shorts','R leg below shorts'];
const legRims=legNames.map(name=>{
 const r=skinRanges.find(z=>z.name===name);
 if(!r)throw Error('Missing original leg region '+name);
 const ids=[...new Set(skinIds.slice(r.startTriangle*3,(r.startTriangle+r.triangles)*3))];
 const centerX=name.startsWith('L')?.0899:-.0899,centerY=-.031;
 const ring=ids.map(i=>({id:i,p:skinPositions[i]})).filter(z=>Math.abs(z.p[2]-.815)<.0015);
 if(ring.length!==8)throw Error('Leg ring expected 8 vertices: '+name+'/'+ring.length);
 return {name,center:[centerX,centerY],ring:ring.sort((a,b)=>Math.atan2(a.p[1]-centerY,a.p[0]-centerX)-Math.atan2(b.p[1]-centerY,b.p[0]-centerX))};
});
function rimTarget(point,rim){
 const [cx,cy]=rim.center,ang=Math.atan2(point[1]-cy,point[0]-cx);
 const ordered=rim.ring.map(r=>({a:Math.atan2(r.p[1]-cy,r.p[0]-cx),p:r.p}));let t=ang;
 while(t<ordered[0].a)t+=2*Math.PI;
 for(let i=0;i<ordered.length;i++){
  const A=ordered[i],B=i===ordered.length-1?{a:ordered[0].a+2*Math.PI,p:ordered[0].p}:ordered[i+1];
  if(t>=A.a-1e-7&&t<=B.a+1e-7){const frac=clamp((t-A.a)/(B.a-A.a));return A.p.map((v,k)=>v*(1-frac)+B.p[k]*frac)}
 }
 throw Error('Could not interpolate real leg ring');
}
const allBoundary=[...locked],lowerBoundary=allBoundary.filter(i=>before[i][2]<.835);
if(lowerBoundary.length<23||lowerBoundary.length>32)throw Error('Unexpected lower perimeter count '+lowerBoundary.length);
let seamMoved=0,seamMoveMax=0,initialMeanGap=0,finalMeanGap=0;
const seamTargets=[];
for(const i of lowerBoundary){
 const p=before[i],rim=p[0]>=0?legRims[0]:legRims[1],t=rimTarget(p,rim);
 const raw=Math.hypot(p[0]-t[0],p[1]-t[1]);
 initialMeanGap+=raw;
 // Projection toward the source leg contour; do not collapse 20-30mm gaps.
 const diff=[t[0]-P[i][0],t[1]-P[i][1],0],dist=Math.hypot(...diff);
 const factor=dist>.0085?.0085/dist:1;
 seamTargets.push({i,rim,raw,target:P[i].map((v,k)=>v+diff[k]*factor)});
}
// Preserve the N18 upper boundary; lower boundary is now an explicitly
// movable ring. Never cut or add a separate cap or create floating shells.
for(const {i,target} of seamTargets){
 const starting=P[i].slice(),delta=target.map((v,k)=>v-P[i][k]);let did=false;
 for(let scale=1;scale>=1/1024;scale*=.5){
  P[i]=starting.map((v,k)=>v+delta[k]*scale);
  if(safeAround(i)){did=true;break;}
 }
 if(!did)P[i]=starting;
 const moved=norm(sub(P[i],starting));if(moved>1e-7){seamMoved++;seamMoveMax=Math.max(seamMoveMax,moved)}
 const rim=before[i][0]>=0?legRims[0]:legRims[1],goal=rimTarget(before[i],rim);
 finalMeanGap+=Math.hypot(P[i][0]-goal[0],P[i][1]-goal[1]);
}
// Soften the V-shaped cavern just above the limb ring. This is native
// vertex geometry, not a shader. Keep the central narrow fold at z>.88.
let lowSurfaceMoved=0;
const lowCandidates=P.map((pt,i)=>i).filter(i=>!locked.has(i)&&before[i][2]>.816&&before[i][2]<.893&&Math.abs(before[i][0])<.125&&before[i][1]<.005);
for(let pass=0;pass<7;pass++)for(const i of lowCandidates){
 const p=P[i],z=p[2],x=p[0],y=p[1],vertical=smooth((z-.82)/.03)*(1-smooth((z-.871)/.031));
 const channel=(1-smooth((Math.abs(x)-.048)/.080))*vertical*(1-smooth((y+.035)/.07));
 if(channel<.001)continue;
 // Pull dark broad interior forward toward neighboring inner-thigh skin;
 // taper at the physical leg opening to avoid new arbitrary hems.
 const targetY=-.079+.004*smooth((z-.84)/.05);
 const shift=clamp((targetY-y)*channel*.12,-.0032,.0032);
 if(Math.abs(shift)<1e-7)continue;
 const old=P[i].slice();let ok=false;
 for(let scale=1;scale>=1/256;scale*=.5){
  P[i]=[old[0],old[1]+shift*scale,old[2]];
  if(safeAround(i)){ok=true;break}
 }
 if(!ok)P[i]=old;else lowSurfaceMoved++;
}
initialMeanGap/=Math.max(1,seamTargets.length);finalMeanGap/=Math.max(1,seamTargets.length);

let maxDelta=0,changed=0,mean=0;
for(let i=0;i<P.length;i++){
 const delta=norm(sub(P[i],before[i]));maxDelta=Math.max(maxDelta,delta);
 if(delta>1e-5){changed++;mean+=delta}
 if(locked.has(i)&&before[i][2]>.835&&delta>1e-9)throw Error('Upper perimeter vertex changed');
}
if(changed<20)throw Error('Center local resurface was ineffective: '+changed);
// More nuanced normals derived from the updated geometry.
// The other 9 original primitives retain all their source data.
const normals=m.normals.map(x=>x.slice()),sums=P.map(()=>[0,0,0]);
for(const f of F){const [a,b,c]=f.map(i=>P[i]),n=cross(sub(b,a),sub(c,a));for(const i of f)for(let k=0;k<3;k++)sums[i][k]+=n[k]}
function unit(a){const n=norm(a)||1;return a.map(v=>v/n)}
const changedSet=new Set([...candidates,...lowCandidates,...lowerBoundary,...candidates.flatMap(i=>[...neighbor[i]]),...lowCandidates.flatMap(i=>[...neighbor[i]]),...lowerBoundary.flatMap(i=>[...neighbor[i]])]);
for(const i of changedSet){
 if(locked.has(i)&&before[i][2]>.835)continue;
 let n=unit(sums[i]),old=unit(normals[i]);if(dot(n,old)<0)n=n.map(x=>-x);
 const weight=Math.max(.92*targetShape(before[i]).gate,.8*smooth((before[i][2]-.815)/.06)*(1-smooth((before[i][2]-.88)/.06)));
 normals[i]=unit(n.map((v,k)=>v*weight+old[k]*(1-weight)));
}
const builder=new Builder(q);
const primitive=builder.g.meshes[0].primitives[3];
primitive.attributes.POSITION=builder.addAccessor(P,'VEC3',5126,34962);
primitive.attributes.NORMAL=builder.addAccessor(normals,'VEC3',5126,34962);
primitive.extras={...primitive.extras,stage:'N19_BOUNDED_LOWER_SKIN_SEAM_FIT',centerMoved:true,origin:'N17 original HW lineage',photoProjected:false};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(reportFile),{recursive:true});
const saved=builder.save(output),maxAreaErr=Math.min(...F.map((_,i)=>faceSafety(i).area));
const audit={version:'R36HW N19',inputSHA256:q.sha,outputSHA256:saved.sha,trianglesBefore:all,trianglesAfter:all,pelvisTriangles:F.length,pelvisVertices:P.length,rigJoints:q.g.skins[0].joints.length,boundaryCount:locked.size,upperBoundaryLocked:locked.size-lowerBoundary.length,lowerBoundaryCandidates:lowerBoundary.length,lowerBoundaryMoved:seamMoved,maxSeamMoveMeters:seamMoveMax,meanLegGapBeforeMeters:initialMeanGap,meanLegGapAfterMeters:finalMeanGap,lowerSurfaceMoves:lowSurfaceMoved,candidates:candidates.length,changedVertices:changed,meanVertexMoveMeters:mean/Math.max(changed,1),maxVertexMoveMeters:maxDelta,operations,failedIncrementAttempts:failed,minFaceAreaSqMeters:maxAreaErr,sourceFaceHairUnmodified:true,sourceUVAndBoneWeightsUnmodified:true,otherPrimitivesUntouched:true,imageProjected:false,previewApproved:false,nativeS2Rendered:false,limitations:['N19 lower seam is fitted geometrically but NOT welded to separate leg primitive','Inherited former shorts geometry and open waist/leg seams still remain','Model uses no extracted depth from a single perspective photo']};
fs.writeFileSync(reportFile,JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({output,sha:saved.sha,changed,maximumMove:maxDelta,meanMove:audit.meanVertexMoveMeters,operations,failed,triangles:all}));
