'use strict';
/**
 * R36MI — fit physical control vertices newly allocated in R36MH to
 * editable, hand-estimated 2D contour curves.
 *
 * Original R36MG body is used only to identify WHICH vertices are genuinely
 * NEW. Input R36MH is retained as the geometry, UV and skinned material base.
 * Unlike a global Gaussian sculpt, only original R36MH split-center vertices
 * move; their UV seam copies move together and skin influences remain intact.
 *
 * Reorient the 2048 tangent-space normal texture using old/new interpolated
 * bind-space frames in every changed triangle. PBR color/ORM are unchanged.
 * The 2D landmarks do NOT provide metric depth.
 *
 * node build_r36mi.cjs R36MG.glb R36MH.glb OUTPUT_DIR [1.0]
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,values,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const landmarks=require('../../r36mc-landmark-sculpt-20261128/source/landmark_hypothesis.json');
const check=(v,s)=>{if(!v)throw Error(s)};
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(...a);
const unit=a=>{const n=len(a);return n>1e-12?mul(a,1/n):[0,0,1]};
const key=p=>p.map(x=>Math.round(x*1e5)).join(':');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

const b=landmarks.mapping.targetBindRegion,rect=landmarks.mapping.sourceRect;
const curves=landmarks.features.map(f=>({...f,worldPoints:f.points.map(p=>[
 b.xMin+(p[0]-rect.left)/(rect.right-rect.left)*(b.xMax-b.xMin),
 b.zTop-(p[1]-rect.top)/(rect.bottom-rect.top)*(b.zTop-b.zBottom)
])}));
function nearestCurve(p){
 let best={distance:Infinity,point:[p[0],p[2]],id:null,depth:0,width:.015};
 for(const f of curves)for(let i=1;i<f.worldPoints.length;i++){
  const a=f.worldPoints[i-1],z=f.worldPoints[i],v=sub(z,a);
  const t=clamp(dot(sub([p[0],p[2]],a),v)/Math.max(1e-12,dot(v,v)));
  const pt=add(a,mul(v,t)),d=len(sub([p[0],p[2]],pt));
  if(d<best.distance)best={distance:d,point:pt,id:f.id,depth:f.depth,width:f.width};
 }
 return best;
}
function groupMesh(mesh){
 const groups=new Map();
 mesh.positions.forEach((p,i)=>{
  const k=key(p);
  if(!groups.has(k))groups.set(k,{k,p:p.slice(),indices:[],faces:new Set()});
  groups.get(k).indices.push(i);
 });
 for(let f=0;f<mesh.indices.length;f+=3)
  for(const id of mesh.indices.slice(f,f+3))
    groups.get(key(mesh.positions[id])).faces.add(f/3);
 return groups;
}
function triangleStats(before,after,tri){
 const pa=tri.map(i=>before[i]),pb=tri.map(i=>after[i]);
 const n0=cross(sub(pa[1],pa[0]),sub(pa[2],pa[0]));
 const n1=cross(sub(pb[1],pb[0]),sub(pb[2],pb[0]));
 const a=len(n0),bb=len(n1);
 if(a<1e-11||bb<1e-11)return {normalDot:-1,areaRatio:0};
 return {normalDot:dot(n0,n1)/(a*bb),areaRatio:bb/a};
}
function sculpt(oldMesh,newMesh,scale){
 check(scale>=.1&&scale<=1.1,'strength must be 0.1..1.1');
 check(newMesh.indices.length===3396&&oldMesh.indices.length===3396,
  'expected the same 1132 triangle budget');
 const oldKeys=new Set(oldMesh.positions.map(key));
 const groups=groupMesh(newMesh);
 const moves=[];
 const original=newMesh.positions.map(p=>p.slice()),positions=original.map(p=>p.slice());
 const hitFaces=new Set();
 let eligible=0,rejected=0,rejectedShape=0;
 for(const g of groups.values()){
  const p=g.p;
  if(oldKeys.has(g.k)||g.faces.size!==3)continue;
  if(Math.abs(p[0])>.092||p[2]<.765||p[2]>.957||p[1]>-.033)continue;
  const c=nearestCurve(p);
  if(c.distance>.038)continue;
  eligible++;
  const fall=Math.exp(-.5*(c.distance/Math.max(.012,c.width*1.6))**2);
  let move=[clamp((c.point[0]-p[0])*.72*scale*fall,-.009,.009),
     clamp(c.depth*.39*scale*fall,-.0065,.0065),
     clamp((c.point[1]-p[2])*.72*scale*fall,-.009,.009)];
  // Original centroid is within its three neighboring faces; preserve
  // orientation and minimum triangle area after every proposed move.
  let accepted=false,step=1,quality=null,applied=null;
  for(let it=0;it<10;it++){
   const delta=mul(move,step),attempt=add(p,delta);
   for(const id of g.indices)positions[id]=attempt.slice();
   quality={minNormalDot:1,minAreaRatio:Infinity};
   for(const fi of g.faces){
    const ids=newMesh.indices.slice(fi*3,fi*3+3);
    const q=triangleStats(original,positions,ids);
    quality.minNormalDot=Math.min(quality.minNormalDot,q.normalDot);
    quality.minAreaRatio=Math.min(quality.minAreaRatio,q.areaRatio);
   }
   if(quality.minNormalDot>.77&&quality.minAreaRatio>.53){
    accepted=true;applied=delta;break;
   }
   step*=.65;
  }
  if(!accepted||len(applied)<2e-5){
   for(const id of g.indices)positions[id]=original[id].slice();
   rejected++;if(!accepted)rejectedShape++;
   continue;
  }
  const afterDistance=Math.hypot(p[0]+applied[0]-c.point[0],p[2]+applied[2]-c.point[1]);
  for(const fi of g.faces)hitFaces.add(fi);
  moves.push({oldPhysicalKey:g.k,source:[...p],sculpted:positions[g.indices[0]].slice(),
   curve:c.id,oldContourDistance:c.distance,newContourDistance:afterDistance,
   displacement:applied,UVSeamCopies:g.indices.length,
   minAreaRatio:quality.minAreaRatio,minFaceDot:quality.minNormalDot});
 }
 check(eligible>=4,'not enough R36MH newly split control vertices: '+eligible);
 check(moves.length>=4,'no viable contour-aligned position corrections: '+JSON.stringify({eligible,rejected,rejectedShape}));
 // Smooth shading only at vertices of faces affected by physical control moves.
 const affectedKeys=new Set();
 for(const f of hitFaces){
  const ids=newMesh.indices.slice(f*3,f*3+3);
  for(const id of ids)affectedKeys.add(key(original[id]));
 }
 const accumulation=new Map();
 for(let f=0;f<newMesh.indices.length;f+=3){
  const ids=newMesh.indices.slice(f,f+3),a=positions[ids[0]],v=positions[ids[1]],w=positions[ids[2]];
  const n=cross(sub(v,a),sub(w,a));
  for(const id of ids){
   const k=key(original[id]);
   accumulation.set(k,add(accumulation.get(k)||[0,0,0],n));
  }
 }
 const normals=newMesh.normals.map(n=>n.slice());
 const tangents=newMesh.tangents.map(t=>t.slice());
 let normalVertexEntries=0;
 for(let i=0;i<positions.length;i++){
  const k=key(original[i]);if(!affectedKeys.has(k))continue;
  const n0=unit(normals[i]),n1=unit(accumulation.get(k)||n0);
  const aligned=dot(n0,n1)<0?mul(n1,-1):n1;
  const n=unit(add(mul(n0,.23),mul(aligned,.77)));
  normals[i]=n;
  let t=sub(tangents[i].slice(0,3),mul(n,dot(n,tangents[i].slice(0,3))));
  if(len(t)<1e-8)t=cross(n,[1,0,0]);
  tangents[i]=[...unit(t),tangents[i][3]<0?-1:1];
  normalVertexEntries++;
 }
 let areaRatio=Infinity,normalDot=1;
 for(const f of hitFaces){
  const ids=newMesh.indices.slice(f*3,f*3+3);
  const q=triangleStats(original,positions,ids);
  areaRatio=Math.min(areaRatio,q.areaRatio);
  normalDot=Math.min(normalDot,q.normalDot);
 }
 check(areaRatio>.53&&normalDot>.77,'final geometry rejected');
 return {original,positions,oldNormals:newMesh.normals,oldTangents:newMesh.tangents,
  normals,tangents,hitFaces:[...hitFaces],moves,
  stats:{eligibleControlVertices:eligible,acceptedControlVertices:moves.length,
   rejectedControlVertices:rejected,UVSeamVertexEntriesMoved:moves.reduce((s,m)=>s+m.UVSeamCopies,0),
   updatedNormalVertexEntries:normalVertexEntries,affectedTriangles:hitFaces.size,
   minTriangleAreaRatio:areaRatio,minTriangleNormalDot:normalDot,
   meanBeforeContourDistance:moves.reduce((s,m)=>s+m.oldContourDistance,0)/moves.length,
   meanAfterContourDistance:moves.reduce((s,m)=>s+m.newContourDistance,0)/moves.length,
   maxPhysicalDisplacement:Math.max(...moves.map(m=>len(m.displacement)))}};
}
function interpolateFrame(normals,tangents,indices,w){
 let n=[0,0,0],t=[0,0,0],sign=0;
 for(let i=0;i<3;i++){
  n=add(n,mul(normals[indices[i]],w[i]));
  t=add(t,mul(tangents[indices[i]].slice(0,3),w[i]));
  sign+=tangents[indices[i]][3]*w[i];
 }
 n=unit(n);t=sub(t,mul(n,dot(n,t)));
 if(len(t)<1e-8)t=cross(n,[1,0,0]);t=unit(t);
 return {n,t,b:mul(unit(cross(n,t)),sign<0?-1:1)};
}
function toWorld(src,frame){
 const v=unit(src.map(x=>x/127.5-1));
 return unit(add(add(mul(frame.t,v[0]),mul(frame.b,v[1])),mul(frame.n,v[2])));
}
function toPixel(world,frame){
 const v=unit([dot(world,frame.t),dot(world,frame.b),dot(world,frame.n)]);
 return v.map(x=>Math.round(clamp((x*.5+.5)*255,0,255)));
}
function bary(uv,x,y){
 const [a,b,c]=uv;
 const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
 if(Math.abs(d)<1e-12)return null;
 const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d;
 const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d;
 return [u,v,1-u-v];
}
function reorientNormalAtlas(mesh,sculpt,oldImage){
 const w=oldImage.w,h=oldImage.h;check(w===2048&&h===2048,'expected 2048 image');
 const pixels=Buffer.from(oldImage.pix),visited=new Uint8Array(w*h);
 let affected=0,changed=0,total=0,max=0;
 for(const f of sculpt.hitFaces){
  const ids=mesh.indices.slice(3*f,3*f+3);
  const uv=ids.map(i=>[mesh.uvs[i][0]*w,(1-mesh.uvs[i][1])*h]);
  const x0=Math.max(0,Math.floor(Math.min(...uv.map(p=>p[0])))),
  x1=Math.min(w-1,Math.ceil(Math.max(...uv.map(p=>p[0]))));
  const y0=Math.max(0,Math.floor(Math.min(...uv.map(p=>p[1])))),
  y1=Math.min(h-1,Math.ceil(Math.max(...uv.map(p=>p[1]))));
  let used=false;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const weights=bary(uv,x+.5,y+.5);
   if(!weights||Math.min(...weights)<-1e-6)continue;
   const i=y*w+x;if(visited[i])continue;visited[i]=1;used=true;
   const k=4*i,original=[oldImage.pix[k],oldImage.pix[k+1],oldImage.pix[k+2]];
   const o=interpolateFrame(sculpt.oldNormals,sculpt.oldTangents,ids,weights);
   const n=interpolateFrame(sculpt.normals,sculpt.tangents,ids,weights);
   const sourceWorld=toWorld(original,o),micro=sub(sourceWorld,o.n);
   const adjusted=unit(add(n.n,mul(micro,.92)));
   const result=toPixel(adjusted,n);
   for(let q=0;q<3;q++){
    const change=Math.abs(result[q]-original[q]);
    total+=change;max=Math.max(change,max);pixels[k+q]=result[q];
   }
   if(result.some((z,j)=>z!==original[j]))changed++;
  }
  if(used)affected++;
 }
 check(changed>100,'normal-map reorientation did not change enough texture');
 return {image:pixels,stats:{changedNormalPixels:changed,
  affectedUVTriangleCount:affected,meanRGBChannelChange:total/(3*Math.max(1,changed)),
  maxRGBChannelChange:max}};
}
function embedded(q,textureIndex){
 const tex=q.g.textures[textureIndex],image=q.g.images[tex.source];
 check(image.mimeType==='image/png','expected embedded PNG');
 const view=q.g.bufferViews[image.bufferView],start=view.byteOffset||0;
 return decodePNG(q.bin.subarray(start,start+view.byteLength));
}
function body(q){
 const mi=q.g.meshes.findIndex(m=>(m.name||'').includes('R36KP_CONTINUOUS_SKIN'));
 check(mi>=0,'body mesh missing');
 const p=q.g.meshes[mi].primitives[0],mesh=extract(q,mi,0);
 check(p.attributes.TANGENT!=null,'TANGENT required for image normal transport');
 mesh.tangents=values(q,p.attributes.TANGENT);
 check(mesh.indices.length===3396,'body triangle budget changed');
 return {mi,p,mesh};
}
function build(previousFile,currentFile,outDir,scale=1){
 check(fs.existsSync(previousFile)&&fs.existsSync(currentFile),'input GLB missing');
 check(!fs.existsSync(outDir),'output exists; refusing overwrite');
 const oldQ=load(previousFile),q=load(currentFile);
 const old=body(oldQ),now=body(q);
 check(q.g.skins.some(s=>s.joints.length===63),'63-bone skin missing');
 let otherFaces=0;q.g.meshes.forEach((m,i)=>{
  if(i!==now.mi)for(const p of m.primitives)otherFaces+=q.g.accessors[p.indices].count/3;
 });
 check(otherFaces===968,'face/hair budget missing');
 const changed=sculpt(old.mesh,now.mesh,scale);
 const mat=q.g.materials[now.p.material],sourceN=embedded(q,mat.normalTexture.index);
 const normals=reorientNormalAtlas(now.mesh,changed,sourceN);
 fs.mkdirSync(outDir,{recursive:true});
 const builder=new Builder(q),target=builder.g.meshes[now.mi].primitives[0];
 target.attributes.POSITION=builder.addAccessor(changed.positions,'VEC3',5126,34962);
 target.attributes.NORMAL=builder.addAccessor(changed.normals,'VEC3',5126,34962);
 target.attributes.TANGENT=builder.addAccessor(changed.tangents,'VEC4',5126,34962);
 const data=encodePNG(normals.image,2048,2048);
 const mapFile='R36MI_CONTOUR_NORMAL_2048.png';
 fs.writeFileSync(path.join(outDir,mapFile),data);
 const updatedMat=JSON.parse(JSON.stringify(mat));
 updatedMat.name='R36MI_CONTROL_CURVES_SCULPT';
 updatedMat.normalTexture.index=builder.addTexture('R36MI_NORMAL',data);
 target.material=builder.g.materials.length;builder.g.materials.push(updatedMat);
 builder.g.asset.generator='R36MI contour-oriented real R36MH centroid controls with source image normal transport';
 const filename='R36MI_CONTOUR_2100_FULL.glb',out=builder.save(path.join(outDir,filename));
 const report={
  version:'R36MI',source:previousFile.split('/').pop(),sourceSha256:oldQ.sha,
  baseline:currentFile.split('/').pop(),baselineSha256:q.sha,
  output:filename,outputSha256:out.sha,outputBytes:out.bytes,
  bodyTriangles:1132,faceHairTriangles:968,totalTriangles:2100,bones:63,
  UVUnchanged:true,skinWeightsUnchanged:true,materialColorPreserved:true,
  topologyUnchangedFromR36MH:true,clayVisualApproved:false,S2EngineApproved:false,
  strength:scale,geometry:changed.stats,controls:changed.moves,
  normalTexture:{file:mapFile,sha256:sha(data),bytes:data.length,...normals.stats},
  note:'Only genuinely new R36MH physical control vertices move. Curves/depths are hand-estimated, not measured by photogrammetry'
 };
 fs.writeFileSync(path.join(outDir,'R36MI_CONTOUR.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output:filename,controls:changed.stats.acceptedControlVertices,
  affectedFaces:changed.stats.affectedTriangles,meanContourDistanceAfter:changed.stats.meanAfterContourDistance,
  normalPixels:normals.stats.changedNormalPixels,bytes:out.bytes}));
 return report;
}
if(require.main===module)try{
 const a=process.argv.slice(2);
 check(a.length>=3&&a.length<=4,'usage: node build_r36mi.cjs R36MG.glb R36MH.glb OUT_DIR [strength]');
 build(a[0],a[1],a[2],a[3]==null?1:Number(a[3]));
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={build,sculpt,nearestCurve,reorientNormalAtlas};
