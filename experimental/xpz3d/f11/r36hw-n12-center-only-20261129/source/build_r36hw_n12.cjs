#!/usr/bin/env node
'use strict';
/*
 * R36HW N12 — attached CENTER-ONLY 3D sculpt of N11 pelvic primitive.
 *
 * This is NOT an image generator, photo texture, separate floating decal,
 * replacement R36JB body, or full-body remodel.
 * Original pelvis faces are subdivided IN PLACE (triangle-centroid 1 -> 3),
 * using shared original triangle vertices, UVs and 63-bone skin weights.
 *
 * Form is authored from 14 image-observed qualitative crease landmarks, with
 * finite smooth 3D displacement. A single photo does not establish metric depth.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const FILE=process.argv[2]||path.resolve(__dirname,'../../r36hw-n11-surface-relax-20261129/output/R36HW_N11_SKIN_RELAX.glb');
const DEST=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N12_CENTER_ATTACHED.glb');
const REPORT=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N12_CENTER_ATTACHED.json');
const expected='9f99e92f93bdc5f74b0d1df1d66b3f34cbf3cb188c19537faeb51c3cdf6fe2ba';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const src=fs.readFileSync(FILE);
if(sha(src)!==expected)throw Error('N11 source hash mismatch: '+sha(src));
if(src.toString('ascii',0,4)!=='glTF'||src.readUInt32LE(4)!==2||src.readUInt32LE(8)!==src.length)throw Error('Bad GLB');
const jl=src.readUInt32LE(12),gl=JSON.parse(src.toString('utf8',20,20+jl)),chunkAt=20+jl;
if(src.toString('ascii',chunkAt+4,chunkAt+8)!=='BIN\0')throw Error('Missing BIN');
const sourceBin=src.subarray(chunkAt+8,chunkAt+8+src.readUInt32LE(chunkAt));
const dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},bytes={5121:1,5123:2,5125:4,5126:4};
function unpack(id){
 const a=gl.accessors[id],v=gl.bufferViews[a.bufferView];
 if(!a||!v||a.sparse)throw Error('Sparse/missing accessor '+id);
 const n=dims[a.type],w=bytes[a.componentType],stride=v.byteStride||n*w,off=(v.byteOffset||0)+(a.byteOffset||0),result=[];
 for(let i=0;i<a.count;i++){let row=[];for(let k=0;k<n;k++){
  const p=off+i*stride+k*w;
  if(p+w>sourceBin.length)throw Error('GLB accessor out of bounds');
  row.push(a.componentType===5126?sourceBin.readFloatLE(p):a.componentType===5125?sourceBin.readUInt32LE(p):a.componentType===5123?sourceBin.readUInt16LE(p):sourceBin.readUInt8(p));
 }result.push(row)}return result;
}
const primitives=gl.meshes[0].primitives;
if(gl.meshes.length!==1||primitives.length!==10||gl.skins[0].joints.length!==63)throw Error('Unexpected GLB structure');
const totalBefore=primitives.reduce((n,p)=>n+gl.accessors[p.indices].count/3,0);
if(totalBefore!==1985)throw Error('Unexpected source budget');
const target=primitives[3],a=target.attributes;
const position=unpack(a.POSITION),origPos=position.map(v=>v.slice()),origNormals=unpack(a.NORMAL);
const normals=origNormals.map(v=>v.slice()),uv=unpack(a.TEXCOORD_0);
const joints=unpack(a.JOINTS_0),weights=unpack(a.WEIGHTS_0),color=unpack(a.COLOR_0),oldIndex=unpack(target.indices).flat();
if(position.length!==183||oldIndex.length!==249*3)throw Error('N11 pelvis topology changed');
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
const gauss=(x,s)=>Math.exp(-.5*(x/s)**2);
// IMAGE INSPIRED ONLY: hand-selected qualitative creases and relative depths,
// not a height map from the photographed pixels. Units: meters.
const landmarks=[
 {x:-.011,z:.943,d:.0026,sx:.014,sz:.019}, // upper narrow seam
 {x:-.007,z:.917,d:.0056,sx:.012,sz:.028}, // central deepened crease
 {x: .002,z:.885,d:.0068,sx:.011,sz:.026}, // asymmetric middle recess
 {x: .006,z:.859,d:.0033,sx:.012,sz:.019}, // tapered lower shadow
 {x:-.028,z:.932,d:-.0025,sx:.014,sz:.028}, // left upper curved ridge
 {x:-.030,z:.895,d:-.0047,sx:.012,sz:.031}, // left outer lip
 {x:-.019,z:.869,d:-.0026,sx:.011,sz:.020}, // lower-left raised fold
 {x: .017,z:.932,d:-.0019,sx:.011,sz:.025}, // right upper small lip
 {x: .031,z:.905,d:-.0038,sx:.014,sz:.035}, // right outer curved lip
 {x: .023,z:.879,d:-.0040,sx:.013,sz:.026}, // lower-right ridge
 {x:-.004,z:.855,d:.0021,sx:.013,sz:.017}, // inferior asymmetric inset
 {x:-.012,z:.843,d:-.0016,sx:.020,sz:.016}, // lower connecting lip
 {x:-.053,z:.889,d:-.0005,sx:.016,sz:.041}, // left skin transition
 {x: .054,z:.886,d:-.0003,sx:.016,sz:.040}  // right skin transition
];
function roiMask(p){
 const [x,y,z]=p;
 const flank=1-smooth((Math.abs(x)-.047)/.057);
 const lower=smooth((z-.824)/.036),upper=1-smooth((z-.956)/.037);
 const front=1-smooth((y+.067)/.075);
 return clamp(flank*lower*upper*front);
}
function relief(p){
 const m=roiMask(p);if(m<=0)return 0;
 let v=0;
 for(const r of landmarks)v+=r.d*gauss(p[0]-r.x,r.sx)*gauss(p[2]-r.z,r.sz);
 // Recess >0 moves toward pelvis interior (+Y); ridge <0 protrudes (-Y).
 return clamp(v*m,-.0075,.0090);
}
// Preserve all source open-boundary indices to avoid new seams to original skin.
const edges=new Map();
for(let t=0;t<oldIndex.length;t+=3){
 const [i,j,k]=oldIndex.slice(t,t+3);
 for(const [q,r] of [[i,j],[j,k],[k,i]]){
  const s=q<r?q+','+r:r+','+q;edges.set(s,(edges.get(s)||0)+1);
 }
}
const boundary=new Set([...edges].filter(([_,n])=>n===1).flatMap(([s])=>s.split(',').map(Number)));
const adjacency=Array.from({length:position.length},()=>new Set());
for(let t=0;t<oldIndex.length;t+=3){
 const [i,j,k]=oldIndex.slice(t,t+3);
 for(const [q,r] of [[i,j],[j,k],[k,i]]){adjacency[q].add(r);adjacency[r].add(q)}
}
// Remove only spiky Y from prior N11 interpolation inside central ROI.
// Work from source geometry, constrain total position displacement to <=10 mm.
let smoothed=0;
for(let iteration=0;iteration<2;iteration++){
 const y=position.map(p=>p[1]);
 for(let i=0;i<position.length;i++){
  const p=position[i],m=roiMask(p);
  if(boundary.has(i)||m<.04||adjacency[i].size<3)continue;
  let sw=0,average=0;
  for(const j of adjacency[i]){
   const q=position[j],dx=(q[0]-p[0])/.072,dz=(q[2]-p[2])/.075,w=Math.exp(-.5*(dx*dx+dz*dz));
   sw+=w;average+=q[1]*w;
  }
  if(sw>0){const delta=clamp((average/sw-p[1])*.28*m,-.003,.003);
   y[i]+=delta;smoothed++;
  }
 }
 for(let i=0;i<position.length;i++)position[i][1]=y[i];
}
const relaxedBeforeRelief=position.map(p=>p.slice()),displacements=[];
for(let i=0;i<position.length;i++){
 if(boundary.has(i))continue;
 const delta=relief(relaxedBeforeRelief[i]);
 const current=position[i],drift=current[1]-origPos[i][1];
 const total=clamp(drift+delta,-.0095,.0095);
 current[1]=origPos[i][1]+total;
 if(Math.abs(total)>1e-7)displacements.push({vertex:i,offsetMeters:total});
}
// Refinement: rank local front triangles. Split a FACE by its centroid only.
// This creates NO T-junctions or floating overlay: shared original edges remain
// untouched, while the newly inserted vertex is in the same original primitive.
const selectable=[];
const center=ids=>[0,1,2].map(k=>ids.reduce((s,i)=>s+relaxedBeforeRelief[i][k],0)/3);
for(let t=0;t<oldIndex.length/3;t++){
 const ids=oldIndex.slice(3*t,3*t+3),c=center(ids);
 if(Math.abs(c[0])>.107||c[1]>-.024||c[2]<.833||c[2]>.972)continue;
 const score=roiMask(c)*(.25+.8*gauss(c[0],.060)*gauss(c[2]-.897,.058))
  +95*Math.abs(relief(c)-ids.reduce((s,i)=>s+relief(relaxedBeforeRelief[i]),0)/3);
 selectable.push({t,ids,c,score});
}
const selected=selectable.sort((a,b)=>b.score-a.score||a.t-b.t).slice(0,55).sort((a,b)=>a.t-b.t);
if(selected.length<35||selected.length>55)throw Error('Central ROI unsuitable for local subdivision: '+selected.length);
const lookup=new Map(selected.map(x=>[x.t,x])),newIndices=[];
function average(rows,ids){return Array.from({length:rows[0].length},(_,k)=>ids.reduce((s,id)=>s+rows[id][k],0)/3)}
function jointBlend(ids){
 const sum=new Map();
 for(const id of ids)for(let b=0;b<4;b++){
  const joint=joints[id][b],w=weights[id][b]/3;
  sum.set(joint,(sum.get(joint)||0)+w);
 }
 const entries=[...sum].sort((a,b)=>b[1]-a[1]).slice(0,4),total=entries.reduce((s,e)=>s+e[1],0)||1;
 return {
  joints:Array.from({length:4},(_,j)=>entries[j]?.[0]||0),
  weights:Array.from({length:4},(_,j)=>(entries[j]?.[1]||0)/total)
 };
}
const centroidReport=[];
for(let t=0;t<oldIndex.length/3;t++){
 const ids=oldIndex.slice(3*t,3*t+3);
 if(!lookup.has(t)){newIndices.push(...ids);continue;}
 const c0=center(ids),q=position.length;
 const sample=relief(c0),mean=ids.reduce((s,i)=>s+relief(relaxedBeforeRelief[i]),0)/3;
 const baseY=ids.reduce((s,i)=>s+relaxedBeforeRelief[i][1],0)/3;
 const p=[c0[0],baseY+sample,c0[2]];
 const n0=average(origNormals,ids),blend=jointBlend(ids);
 position.push(p);normals.push(n0);uv.push(average(uv,ids));
 joints.push(blend.joints);weights.push(blend.weights);color.push(average(color,ids));
 newIndices.push(ids[0],ids[1],q,ids[1],ids[2],q,ids[2],ids[0],q);
 centroidReport.push({sourceTriangle:t,newVertex:q,centroidX:+c0[0].toFixed(5),centroidZ:+c0[2].toFixed(5),targetDepthMm:+(sample*1000).toFixed(3),residualMm:+((sample-mean)*1000).toFixed(3)});
}
const actualTriangleCount=totalBefore+2*selected.length;
if(actualTriangleCount>2100)throw Error('2100 triangle budget exceeded '+actualTriangleCount);
// Smooth weighted normals on actual re-triangulated curved mesh.
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function unit(v){const n=Math.hypot(...v)||1;return v.map(x=>x/n)}
const accumulate=position.map(()=>[0,0,0]);let minArea=Infinity,zeroTriangles=0;
for(let i=0;i<newIndices.length;i+=3){
 const ids=newIndices.slice(i,i+3),a=position[ids[0]],b=position[ids[1]],c=position[ids[2]];
 const n=cross(b.map((q,k)=>q-a[k]),c.map((q,k)=>q-a[k])),area=Math.hypot(...n)*.5;
 minArea=Math.min(minArea,area);if(area<1e-10)zeroTriangles++;
 for(const id of ids)for(let k=0;k<3;k++)accumulate[id][k]+=n[k];
}
if(zeroTriangles>0)throw Error('Degenerate triangle created '+zeroTriangles);
const adjustedNormals=accumulate.map((sum,i)=>{
 let n=unit(sum),ref=unit(normals[i]);
 if(n.reduce((s,x,k)=>s+x*ref[k],0)<0)n=n.map(x=>-x);
 const mix=roiMask(position[i])*.88;
 return unit(n.map((x,k)=>x*mix+ref[k]*(1-mix)));
});
const binary=[Buffer.from(sourceBin)];
function length(){return binary.reduce((n,x)=>n+x.length,0)}
function align(){if(length()%4)binary.push(Buffer.alloc(4-length()%4))}
function add(rows,oldId,targetHint){
 align();const original=gl.accessors[oldId],component=original.componentType,type=original.type;
 const n=dims[type],s=bytes[component],data=Buffer.alloc(rows.length*n*s);
 for(let i=0;i<rows.length;i++)for(let j=0;j<n;j++){
  const v=rows[i][j],at=(i*n+j)*s;
  if(!Number.isFinite(v))throw Error('Non-finite vertex data');
  if(component===5126)data.writeFloatLE(v,at);
  else if(component===5125)data.writeUInt32LE(Math.round(v),at);
  else if(component===5123)data.writeUInt16LE(Math.round(v),at);
  else data.writeUInt8(Math.round(clamp(v,0,255)),at);
 }
 const off=length();binary.push(data);
 const view=gl.bufferViews.push({buffer:0,byteOffset:off,byteLength:data.length,target:targetHint})-1;
 const ac={bufferView:view,componentType:component,count:rows.length,type};
 if(original.normalized)ac.normalized=true;
 if(type==='VEC3'&&component===5126){ac.min=[0,1,2].map(k=>Math.min(...rows.map(v=>v[k])));ac.max=[0,1,2].map(k=>Math.max(...rows.map(v=>v[k])))}
 return gl.accessors.push(ac)-1;
}
const oldAttr={...a};
for(const [key,arr] of Object.entries({POSITION:position,NORMAL:adjustedNormals,TEXCOORD_0:uv,JOINTS_0:joints,WEIGHTS_0:weights,COLOR_0:color})){
 a[key]=add(arr,oldAttr[key],34962);
}
target.indices=add(newIndices.map(i=>[i]),target.indices,34963);
const indexAccessor=gl.accessors[target.indices];indexAccessor.min=[0];indexAccessor.max=[position.length-1];
target.extras={...target.extras,stage:'R36HW_N12_INTEGRATED_CENTER_ONLY',localTriangleSplits:selected.length,referenceMethod:'qualitative 14-landmark front-fold field, never photo pasted',nonFloating:true,sourcePelvisPrimitiveReused:true};
align();const bin=Buffer.concat(binary);gl.buffers[0].byteLength=bin.length;
const txt=Buffer.from(JSON.stringify(gl)),padded=Buffer.alloc(Math.ceil(txt.length/4)*4,32);txt.copy(padded);
const out=Buffer.alloc(20+padded.length+8+bin.length),outOff=20+padded.length;
out.write('glTF',0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.write('JSON',16);padded.copy(out,20);
out.writeUInt32LE(bin.length,outOff);out.write('BIN\0',outOff+4,'ascii');bin.copy(out,outOff+8);
fs.mkdirSync(path.dirname(DEST),{recursive:true});fs.mkdirSync(path.dirname(REPORT),{recursive:true});fs.writeFileSync(DEST,out);
const maxDelta=position.slice(0,origPos.length).reduce((m,v,i)=>Math.max(m,Math.hypot(...v.map((x,k)=>x-origPos[i][k]))),0);
const report={stage:'N12 centered attached 3D sculpt, no full-body remodeling',inputSHA256:sha(src),outputSHA256:sha(out),trianglesBefore:totalBefore,trianglesAfter:actualTriangleCount,regionTrianglesSplit:selected.length,regionTrianglesAdded:selected.length*2,regionCentroidVertices:selected.length,originalPelvisVertices:origPos.length,newPelvisVertices:position.length,boundaryVerticesHeld:boundary.size,modifiedOriginalVertices:displacements.length,maxOriginalVertexMovementMeters:maxDelta,minTriangleAreaSqMeters:minArea,centralSurfaceRemainsOriginalPrimitive:true,localSkinWeightInterpolation:true,sourceFaceHairUnmodified:true,skinJoints:63,referenceLandmarks:landmarks.length,referencePhotoEmbedded:false,realNativeS2Render:false,visualApproval:false,limitations:['A single angled image cannot establish absolute anatomical depth','The underlying N11 clothing-derived side silhouette and unwelded seams remain','This is a localized functional mesh iteration, not an artist-approved final anatomy','No native S2 PBR rendering or real-time bone motion'],detailVertices:centroidReport};
fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:DEST,triangles:actualTriangleCount,selected:selected.length,modified:displacements.length,boundaryHeld:boundary.size,sha256:report.outputSHA256}));
