'use strict';
/**
 * R36LZ: re-import a locally edited OBJ cage into full R36LY GLB,
 * preserving the original vertex topology, UVs, textures, skin and rig.
 * Requires R36LY_EDIT_CAGE.json so OBJ indices remain 1:1 with GLB.
 *
 * node import_cage_glb.cjs MODEL.glb CAGE.json EDITED.obj OUTPUT_DIR LABEL
 */
const fs=require('fs'),path=require('path');
const {load,extract,values,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {parseOBJ}=require('./refine_cage.cjs');
const assert=(cond,msg)=>{if(!cond)throw Error(msg)};
const vec=(a,b)=>a.map((v,j)=>v-b[j]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const magnitude=a=>Math.hypot(...a);
const normalize=v=>{const n=magnitude(v);return n<1e-10?[0,0,1]:v.map(x=>x/n)};
const key=p=>p.map(v=>Math.round(v*100000)).join(':');
const near=(a,b,eps=2e-6)=>magnitude(vec(a,b))<=eps;
function analyze(a,b,ids) {
 let minDot=1,minArea=Infinity,invalidNew=0,originalDegenerate=0;
 for(let f=0;f<ids.length;f+=3){
  const i=ids[f],j=ids[f+1],k=ids[f+2];
  const n0=cross(vec(a[j],a[i]),vec(a[k],a[i]));
  const n1=cross(vec(b[j],b[i]),vec(b[k],b[i]));
  const aa=magnitude(n0),bb=magnitude(n1);
  if(aa<1e-10){originalDegenerate++;continue;}
  if(bb<1e-10){invalidNew++;continue;}
  minDot=Math.min(minDot,dot(n0,n1)/(aa*bb));
  minArea=Math.min(minArea,bb/aa);
 }
 return {minTriangleNormalDot:minDot,minTriangleAreaRatio:minArea,
  newlyDegenerateTriangles:invalidNew,unchangedOriginalDegenerateTriangles:originalDegenerate};
}
function updateGeometry(mesh,source,ledger,editedObj) {
 const ids=mesh.indices,positions=mesh.positions,original=positions.map(p=>p.slice());
 assert(ledger.originalTriangleCount===1132&&ids.length===3396,'original triangle budget is wrong');
 assert(editedObj.vertices.length===ledger.vertices.length,'edited OBJ index count differs from ledger');
 assert(editedObj.faceRows.length===ledger.triangles.length,'edited OBJ face count differs from ledger');
 // Never infer vertex correspondence from coordinate proximity. Use validated index map.
 const groups=new Map(),allSourceGroups=new Map();
 positions.forEach((p,i)=>{const k=key(p);if(!allSourceGroups.has(k))allSourceGroups.set(k,[]);allSourceGroups.get(k).push(i);});
 for(const v of ledger.vertices) {
  const i=v.originalVertexIndex,vi=v.cageVertexIndex-1,point=editedObj.vertices[vi],base=v.sculptedPosition;
  assert(Number.isInteger(i)&&i>=0&&i<positions.length,'bad ledger source index');
  assert(near(positions[i],base,3e-6),'GLB source position differs from ledger');
  assert(near([point[0],point[2]],[base[0],base[2]],8e-6),'cage may change only Y under R36LZ contract');
  const dy=point[1]-base[1];
  assert(Math.abs(dy)<=.00126,'edited cage moved beyond per-vertex budget '+i+': '+dy);
  const k=key(base);
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push({index:i,dy});
 }
 for(let f=0;f<ledger.triangles.length;f++) {
  const idx=editedObj.faceRows[f].map(j=>ledger.vertices[j-1]?.originalVertexIndex);
  assert(idx.every((v,j)=>v===ledger.triangles[f].ids[j]),'OBJ face changed: '+f);
 }
 const result=original.map(p=>p.slice());
 const changed=new Set(),nearTouched=new Set();
 let groupsChanged=0,maxMove=0;
 for(const [k,points] of groups){
  let dy=points.reduce((sum,p)=>sum+p.dy,0)/points.length;
  assert(points.every(p=>Math.abs(p.dy-dy)<4e-7),'UV seam is discontinuous at '+k);
  if(Math.abs(dy)<5e-9)continue;
  groupsChanged++;maxMove=Math.max(maxMove,Math.abs(dy));
  const members=allSourceGroups.get(k);
  assert(members?.length,'OBJ vertex group not found in model');
  for(const id of members) { result[id][1]+=dy;changed.add(id); }
 }
 assert(groupsChanged>=20&&changed.size>=70,'no meaningful sculpt roundtrip detected');
 // Smooth normals with same physical-coordinate accumulator for UV-split vertices.
 const preNormals=mesh.normals,accumulator=new Map(),faceNeighbors=new Set();
 for(let f=0;f<ids.length;f+=3){
  const tri=ids.slice(f,f+3),a=result[tri[0]],b=result[tri[1]],c=result[tri[2]];
  const fn=cross(vec(b,a),vec(c,a));
  if(tri.some(id=>changed.has(id)))tri.forEach(id=>faceNeighbors.add(id));
  for(const id of tri){
   const k=key(original[id]),old=accumulator.get(k)||[0,0,0];
   accumulator.set(k,old.map((v,j)=>v+fn[j]));
  }
 }
 const updateKeys=new Set([...changed,...faceNeighbors].map(i=>key(original[i])));
 const newNormals=preNormals.map(v=>v.slice());
 let changedNormals=0;
 for(let i=0;i<positions.length;i++){
  if(!updateKeys.has(key(original[i])))continue;
  let fn=normalize(accumulator.get(key(original[i]))||preNormals[i]);
  const old=normalize(preNormals[i]);
  if(dot(old,fn)<0)fn=fn.map(v=>-v);
  const n=normalize(old.map((v,j)=>v*.23+fn[j]*.77));
  newNormals[i]=n;changedNormals++;
 }
 let newTangents=null;
 if(mesh.tangents){
  newTangents=mesh.tangents.map((t,i)=>{
   if(!updateKeys.has(key(original[i])))return t.slice();
   const n=newNormals[i],tv=t.slice(0,3),projection=dot(n,tv);
   let x=vec(tv,n.map(a=>a*projection));
   if(magnitude(x)<1e-9)x=cross(Math.abs(n[0])<.9?[1,0,0]:[0,1,0],n);
   return [...normalize(x),t[3]>=0?1:-1];
  });
 }
 const quality=analyze(original,result,ids);
 assert(!quality.newlyDegenerateTriangles&&quality.minTriangleNormalDot>.80,
  'inverted or folded geometry '+JSON.stringify(quality));
 assert(quality.minTriangleAreaRatio>.72,'triangle collapsed '+JSON.stringify(quality));
 assert(maxMove<.00126,'roundtrip displacement outside safe bounds');
 return {positions:result,normals:newNormals,tangents:newTangents,
  stats:{modifiedPhysicalGroups:groupsChanged,modifiedVertexEntries:changed.size,
   normalUpdatedVertices:changedNormals,maxAdditionalDisplacement:maxMove,
   retargetedTangents:!!newTangents,...quality}};
}
function build(modelPath,ledgerPath,objPath,outDir,label){
 assert(/^[A-Z0-9_]{3,45}$/.test(label),'invalid label');
 for(const p of [modelPath,ledgerPath,objPath])assert(fs.existsSync(p),'input missing '+p);
 assert(!fs.existsSync(outDir),'output already exists');
 const q=load(modelPath),ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8')),obj=parseOBJ(objPath);
 assert(ledger.sculptSHA256===q.sha,'ledger GLB sha mismatch');
 const mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 assert(mi>=0,'continuous skin not found');
 const prim=q.g.meshes[mi].primitives[0],mesh=extract(q,mi,0);
 assert(q.g.skins.some(s=>s.joints.length===63),'63-joint skin missing');
 let headHair=0;
 q.g.meshes.forEach((m,i)=>{if(i!==mi)for(const p of m.primitives)headHair+=q.g.accessors[p.indices].count/3;});
 assert(headHair===968,'face or hair triangles changed');
 mesh.tangents=prim.attributes.TANGENT==null?null:values(q,prim.attributes.TANGENT);
 const transformed=updateGeometry(mesh,q,ledger,obj);
 fs.mkdirSync(outDir,{recursive:true});
 const builder=new Builder(q),target=builder.g.meshes[mi].primitives[0];
 target.attributes.POSITION=builder.addAccessor(transformed.positions,'VEC3',5126,34962);
 target.attributes.NORMAL=builder.addAccessor(transformed.normals,'VEC3',5126,34962);
 if(transformed.tangents)target.attributes.TANGENT=builder.addAccessor(transformed.tangents,'VEC4',5126,34962);
 builder.g.asset.generator='R36LZ source-indexed OBJ 3D cage re-import into original skinned 2100 triangle GLB';
 const file='R36LZ_'+label+'_2100_FULL.glb';
 const out=builder.save(path.join(outDir,file));
 const report={version:'R36LZ',label,model:file,modelSHA256:out.sha,modelBytes:out.bytes,
  sourceSHA256:q.sha,originalOBJVertices:obj.vertices.length,cageTriangles:obj.faceRows.length,
  bodyTriangles:1132,headHairTriangles:968,wholeModelTriangles:2100,skinJoints:63,
  UVsAndTexturePreserved:true,weightsAndSkinPreserved:true,
  sameMeshPrimitiveIndex:true,sourceVertexIndicesRetained:true,
  ...transformed.stats,visualQA:'not run',engineQA:'not run'};
 fs.writeFileSync(path.join(outDir,'R36LZ_'+label+'.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({label,file,bytes:out.bytes,moved:report.modifiedVertexEntries,
  groups:report.modifiedPhysicalGroups,area:report.minTriangleAreaRatio,sha256:out.sha}));
 return report;
}
if(require.main===module)try{
 assert(process.argv.length===7,'usage: node import_cage_glb.cjs MODEL.glb CAGE.json EDITED.obj OUTPUT_DIR LABEL');
 build(...process.argv.slice(2));
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={build,updateGeometry,analyze};
