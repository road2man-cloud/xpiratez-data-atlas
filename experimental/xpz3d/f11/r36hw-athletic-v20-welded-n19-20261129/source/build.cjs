#!/usr/bin/env node
'use strict';
// Integrated N19-derived textile relief on V14. No second overlay and no donor body mesh.
const fs=require('node:fs'),path=require('node:path');
const {load,extract,values,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const [v14File,n20File,outFile]=process.argv.slice(2);
if(!outFile)throw Error('usage: node build.cjs V14.glb N20.glb OUTPUT.glb');
const src=load(v14File),donor=load(n20File),builder=new Builder(src);
const mesh=builder.g.meshes[0],clothIndex=mesh.primitives.findIndex(p=>p.material===18);
if(clothIndex<0)throw Error('V14 material 18 absent');
const primitive=mesh.primitives[clothIndex],cloth=extract(src,0,clothIndex),center=extract(donor,0,3);
if(cloth.positions.length!==706||cloth.indices.length!==3096||center.positions.length<100||src.g.skins[0].joints.length!==63||src.g.materials[18].alphaMode!=='OPAQUE')throw Error('unexpected source topology');
const P=cloth.positions.map(v=>v.slice()),N=cloth.normals.map(v=>v.slice()),UV=cloth.uvs.map(v=>v.slice());
const C=cloth.colors.map(v=>v.slice()),J=cloth.joints.map(v=>v.slice()),W=cloth.weights.map(v=>v.slice());
const tangents=primitive.attributes.TANGENT==null?null:values(src,primitive.attributes.TANGENT);
const T=tangents?tangents.map(v=>v.slice()):null;
const Q=center.positions,QC=center.colors;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),unit=a=>mul(a,1/(Math.hypot(...a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const lum=a=>.2126*a[0]+.7152*a[1]+.0722*a[2],L=QC?QC.map(lum):null,lumAvg=L?L.reduce((s,v)=>s+v,0)/L.length:0,lumStd=L?Math.sqrt(L.reduce((s,v)=>s+(v-lumAvg)**2,0)/L.length):0;
const minX=Math.min(...Q.map(p=>p[0])),maxX=Math.max(...Q.map(p=>p[0])),minZ=Math.min(...Q.map(p=>p[2])),maxZ=Math.max(...Q.map(p=>p[2]));
function sample(p){
 const near=[];
 for(let i=0;i<Q.length;i++){let q=Q[i],d=Math.hypot(q[0]-p[0],q[2]-p[2]);if(near.length<7){near.push([d,i]);near.sort((a,b)=>a[0]-b[0]);}else if(d<near[6][0]){near[6]=[d,i];near.sort((a,b)=>a[0]-b[0]);}}
 let wsum=0,ysum=0,lsum=0;
 for(const [dist,i] of near){let w=1/((dist+.006)**2);wsum+=w;ysum+=Q[i][1]*w;if(L)lsum+=L[i]*w;}
 return {y:ysum/wsum,brightness:L?lsum/wsum:0,dist:near[0][0]};
}
const faces=Array.from({length:cloth.indices.length/3},(_,i)=>cloth.indices.slice(i*3,i*3+3));
const avg=ids=>[0,1,2].map(k=>ids.reduce((s,id)=>s+cloth.positions[id][k],0)/3);
const chosen=faces.map(ids=>{let p=avg(ids);return p[0]>=minX-.015&&p[0]<=maxX+.015&&p[2]>=minZ-.015&&p[2]<=maxZ+.015&&sample(p).dist<.065;});
const count=chosen.filter(Boolean).length;
if(count<50)throw Error('N19 center region missing: '+count);
let offset=0;for(let i=0;i<faces.length;i++)if(chosen[i]){let p=avg(faces[i]);offset+=p[1]-sample(p).y;}offset/=count;
// Mark split edges across original positional UV seams to keep all adjacent faces watertight.
const poskey=p=>p.map(v=>Math.round(v*100000)).join(',');
const edgekey=(a,b)=>{let p=poskey(cloth.positions[a]),q=poskey(cloth.positions[b]);return p<q?p+'|'+q:q+'|'+p;};
const edgeSet=new Set(),used=new Array(P.length).fill(0),selectedCount=new Array(P.length).fill(0);
for(let f=0;f<faces.length;f++){
 const ids=faces[f];for(const id of ids){used[id]++;if(chosen[f])selectedCount[id]++;}
 if(chosen[f])for(let k=0;k<3;k++)edgeSet.add(edgekey(ids[k],ids[(k+1)%3]));
}
const influence=used.map((n,i)=>selectedCount[i]/Math.max(1,n)),mids=new Map();
function midpoint(a,b){
 let key=Math.min(a,b)+':'+Math.max(a,b);if(mids.has(key))return mids.get(key);
 let id=P.length,mix=(x,y)=>x.map((v,k)=>(v+y[k])*.5);
 P.push(mix(P[a],P[b]));N.push(unit(mix(N[a],N[b])));UV.push(mix(UV[a],UV[b]));C.push(mix(C[a],C[b]));
 const weightMap=new Map();for(const srcId of [a,b])for(let k=0;k<4;k++){let bone=J[srcId][k];weightMap.set(bone,(weightMap.get(bone)||0)+W[srcId][k]*.5);}
 let bones=[...weightMap].sort((x,y)=>y[1]-x[1]).slice(0,4),s=bones.reduce((a,c)=>a+c[1],0)||1;
 while(bones.length<4)bones.push([0,0]);
 J.push(bones.map(v=>v[0]));W.push(bones.map(v=>v[1]/s));
 if(T)T.push(unit(mix(T[a].slice(0,3),T[b].slice(0,3))).concat(T[a][3]));
 influence.push((influence[a]+influence[b])*.5);mids.set(key,id);return id;
}
let indices=[];
for(const ids of faces){
 let triangles=[ids.slice()];
 for(let k=0;k<3;k++){
  const a=ids[k],b=ids[(k+1)%3];if(!edgeSet.has(edgekey(a,b)))continue;
  const m=midpoint(a,b),updated=[];
  for(const tri of triangles){
   let split=false;
   for(let t=0;t<3;t++){
    let u=tri[t],v=tri[(t+1)%3],w=tri[(t+2)%3];
    if((u===a&&v===b)||(u===b&&v===a)){updated.push([u,m,w],[m,v,w]);split=true;break;}
   }
   if(!split)updated.push(tri);
  }
  triangles=updated;
 }
 for(const tri of triangles)indices.push(...tri);
}
// Adaptive second-pass detail: all triangle edges are propagated to neighbors,
// including duplicated UV seams, so no jagged T-junctions are introduced.
const distance=(a,b)=>Math.hypot(...sub(a,b));
const spatialEdge=(a,b)=>{
 const x=poskey(P[a]),y=poskey(P[b]);
 return x<y?x+'|'+y:y+'|'+x;
};
const firstPassTriangles=indices.length/3;
let fineFaces=0,refineEdgeCount=0;
{
 const currentFaces=Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3));
 const refineEdges=new Set();
 for(const ids of currentFaces){
  const p=[0,1,2].map(k=>ids.reduce((sum,id)=>sum+P[id][k],0)/3);
  const within=p[0]>minX+.015&&p[0]<maxX-.015&&p[2]>minZ+.015&&p[2]<maxZ-.015;
  if(!within||sample(p).dist>.078)continue;
  const edges=[[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]];
  let marked=0;
  for(const [a,b] of edges){
   if(distance(P[a],P[b])>.023){refineEdges.add(spatialEdge(a,b));marked++;}
  }
  if(marked)fineFaces++;
 }
 refineEdgeCount=refineEdges.size;
 const newIndices=[];
 for(const ids of currentFaces){
  let parts=[ids.slice()];
  for(let k=0;k<3;k++){
   const a=ids[k],b=ids[(k+1)%3];
   if(!refineEdges.has(spatialEdge(a,b)))continue;
   const m=midpoint(a,b),next=[];
   for(const tri of parts){
    let done=false;
    for(let t=0;t<3;t++){
     const u=tri[t],v=tri[(t+1)%3],w=tri[(t+2)%3];
     if((u===a&&v===b)||(u===b&&v===a)){
      next.push([u,m,w],[m,v,w]);done=true;break;
     }
    }
    if(!done)next.push(tri);
   }
   parts=next;
  }
  for(const tri of parts)newIndices.push(...tri);
 }
 indices=newIndices;
}
// Seam-coherent fabric: coincident UV vertices receive identical displacement.
const grouped=new Map();
for(let i=0;i<P.length;i++){const key=poskey(P[i]);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(i);}
const fade=v=>{v=clamp(v,0,1);return v*v*(3-2*v);};
const strengthByVertex=new Array(P.length).fill(0);
let moved=0,shiftSum=0,shiftMax=0,toned=0,toneMax=0,toneSquares=0,uvWeldGroups=0,uvWeldedVertices=0;
for(const members of grouped.values()){
 const p=members.reduce((a,id)=>add(a,P[id]),[0,0,0]).map(v=>v/members.length);
 const n=unit(members.reduce((a,id)=>add(a,N[id]),[0,0,0]));
 const d=sample(p),edge=Math.min((p[0]-minX)/.06,(maxX-p[0])/.06,(p[2]-minZ)/.065,(maxZ-p[2])/.065);
 const strength=fade(edge)*fade((.095-d.dist)/.07);
 for(const id of members)strengthByVertex[id]=strength;
 if(members.length>1){uvWeldGroups++;uvWeldedVertices+=members.length;}
 if(strength<.00001)continue;
 const ring=r=>[sample([p[0]+r,p[1],p[2]]),sample([p[0]-r,p[1],p[2]]),sample([p[0],p[1],p[2]+r]),sample([p[0],p[1],p[2]-r])];
 const near=ring(.022),far=ring(.046);
 const avg=(a,key)=>a.reduce((v,q)=>v+q[key],0)/a.length;
 const ridge=.80*(d.y-avg(near,'y'))+.20*(avg(near,'y')-avg(far,'y'));
 const shift=clamp(ridge*n[1]*.76,-.0045,.0052)*strength;
 if(Math.abs(shift)>.000005){
  const p1=add(p,mul(n,shift));
  for(const id of members){P[id]=p1.slice();moved++;}
  shiftMax=Math.max(shiftMax,Math.abs(shift));shiftSum+=Math.abs(shift)*members.length;
 }
 if(L){
  const pigment=.80*(d.brightness-avg(near,'brightness'))+.20*(avg(near,'brightness')-avg(far,'brightness'));
  const contrast=clamp(pigment*3.2,-.045,.045),tone=1+strength*contrast;
  if(Math.abs(tone-1)>.00008){
   for(const id of members){for(let k=0;k<3;k++)C[id][k]=clamp(C[id][k]*tone,0,1);toned++;toneSquares+=(tone-1)**2;}
   toneMax=Math.max(toneMax,Math.abs(tone-1));
  }
 }
}
if(!toned||!moved)throw Error('V20 generated no measurable fabric pattern and relief');
let uvSeamMaxError=0;
for(const members of grouped.values())if(members.length>1){
 for(const id of members)uvSeamMaxError=Math.max(uvSeamMaxError,Math.hypot(...sub(P[id],P[members[0]])));
}
if(uvSeamMaxError>2e-7)throw Error('V20 UV seam geometric split detected: '+uvSeamMaxError);
const normalAcc=new Map();
for(let i=0;i<indices.length;i+=3){
 const a=indices[i],b=indices[i+1],c=indices[i+2];
 let faceN=cross(sub(P[b],P[a]),sub(P[c],P[a]));
 if(dot(faceN,N[a])<0)faceN=mul(faceN,-1);
 for(const id of [a,b,c]){const key=poskey(P[id]);normalAcc.set(key,add(normalAcc.get(key)||[0,0,0],faceN));}
}
let seamNormalUpdates=0;
for(const members of grouped.values()){
 const strength=members.reduce((v,id)=>v+strengthByVertex[id],0)/members.length;
 const blend=.72*fade(strength);if(blend<.0001)continue;
 const old=unit(members.reduce((v,id)=>add(v,N[id]),[0,0,0]));
 const smooth=unit(normalAcc.get(poskey(P[members[0]]))||old);
 const normal=unit(add(mul(old,1-blend),mul(smooth,blend)));
 for(const id of members){
  N[id]=normal.slice();seamNormalUpdates++;
  if(T){let tangent=T[id].slice(0,3);tangent=unit(sub(tangent,mul(normal,dot(tangent,normal))));T[id]=[...tangent,T[id][3]];}
 }
}
const attr={POSITION:builder.addAccessor(P,'VEC3',5126,34962),NORMAL:builder.addAccessor(N,'VEC3',5126,34962),JOINTS_0:builder.addAccessor(J,'VEC4',5123,34962),WEIGHTS_0:builder.addAccessor(W,'VEC4',5126,34962),COLOR_0:builder.addAccessor(C,C[0].length===3?'VEC3':'VEC4',5126,34962),TEXCOORD_0:builder.addAccessor(UV,'VEC2',5126,34962)};
if(T)attr.TANGENT=builder.addAccessor(T,'VEC4',5126,34962);
primitive.attributes=attr;primitive.indices=builder.addAccessor(indices,'SCALAR',5123,34963);
primitive.extras={...(primitive.extras||{}),n19WeldedTextileDetail:'Local relief and high-frequency textile contrast, no added garment section'};
builder.g.asset.generator='R36HW Athletic V20 integrated N19 textile relief';
builder.g.extras={...(builder.g.extras||{}),athleticSuitV20:{base:'V14',donor:'N19 center via N20',connectedGarment:true,opaque:true,donorMeshCopied:false}};
const triangles=mesh.primitives.reduce((s,p)=>s+builder.g.accessors[p.indices].count/3,0);
if(triangles<=2100||triangles>6000)throw Error('unexpected triangle count '+triangles);
fs.mkdirSync(path.dirname(outFile),{recursive:true});const saved=builder.save(outFile);
const report={baseSha256:src.sha,donorSha256:donor.sha,originalTotalTriangles:2100,totalTriangles:triangles,addedTriangles:triangles-2100,firstPassGarmentTriangles:firstPassTriangles,adaptiveFaces:fineFaces,adaptiveMarkedEdges:refineEdgeCount,sourceGarmentFaces:faces.length,selectedCenterFaces:count,splitUniqueEdges:mids.size,outputGarmentVertices:P.length,originalGarmentVertices:cloth.positions.length,donorCenterVertices:Q.length,donorVertexColorAvailable:!!L,donorVertexColorStandardDeviation:lumStd,affectedPositions:moved,meanMoveMeters:moved?shiftSum/moved:0,maxMoveMeters:shiftMax,modifiedColorVertices:toned,maxToneDeviation:toneMax,multiScaleDonorTransfer:true,uvWeldGroups,uvWeldedVertices,uvSeamMaxError,seamNormalUpdates,spatialWeldedDisplacement:true,originalV14GarmentMaterialPreserved:true,originalV14GarmentBaseColorPreserved:true,vertexColorHighPassOnly:true,toneRms:Math.sqrt(toneSquares/Math.max(toned,1)),noAddedClothingPanel:true,originalOtherPrimitivesPreserved:true,originalRigJoints:63,secondOverlay:false,donorMeshCopied:false,opaque:true,outputSHA256:saved.sha,outputBytes:saved.bytes,nativeS2Rendered:false,visualAcceptance:false};
const reportFile=path.resolve(path.dirname(outFile),'../reports/build.json');
fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
