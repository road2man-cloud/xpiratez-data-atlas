#!/usr/bin/env node
'use strict';
/*
 * R36HW N16: reorient existing edges in the connected N12 pelvic center.
 * No additional polygons, no overlay mesh, no full-body editing.
 * Remove severe radial skinny fans via conservative manifold edge flips.
 * All 63 skin joints, original vertex indices, UV, textures remain in place.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const SRC=process.argv[2]||path.resolve(__dirname,'../../r36hw-n15-center-continuity-20261129/output/R36HW_N15_CENTER_CONTINUITY.glb');
const OUTPUT=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N16_RETESS_CENTER.glb');
const REPORT=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N16_RETESS_CENTER.json');
const EXPECTED='7e151c13a8011c334c1b22f73dcccaba3420098bef7812417b9b4e564a0cd05b';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const src=fs.readFileSync(SRC);
if(sha(src)!==EXPECTED)throw Error('N12 base hash mismatch '+sha(src));
if(src.toString('ascii',0,4)!=='glTF'||src.readUInt32LE(4)!==2)throw Error('Not GLB2');
const jl=src.readUInt32LE(12),j=JSON.parse(src.toString('utf8',20,20+jl)),off=20+jl;
if(src.toString('ascii',off+4,off+8)!=='BIN\0')throw Error('GLB BIN missing');
const oldBin=src.subarray(off+8,off+8+src.readUInt32LE(off));
const comps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},bytes={5121:1,5123:2,5125:4,5126:4};
function read(id){
 const a=j.accessors[id],b=j.bufferViews[a.bufferView],n=comps[a.type],w=bytes[a.componentType],stride=b.byteStride||n*w,base=(b.byteOffset||0)+(a.byteOffset||0);
 const ret=[];for(let i=0;i<a.count;i++){const row=[];for(let k=0;k<n;k++){
  const p=base+i*stride+k*w;row.push(a.componentType===5126?oldBin.readFloatLE(p):a.componentType===5123?oldBin.readUInt16LE(p):a.componentType===5125?oldBin.readUInt32LE(p):oldBin.readUInt8(p));
 }ret.push(row)}return ret;
}
const prim=j.meshes[0].primitives[3],pos=read(prim.attributes.POSITION),norm=read(prim.attributes.NORMAL),indices=read(prim.indices).map(v=>v[0]),triangles=[];
for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3));
const total=j.meshes[0].primitives.reduce((s,p)=>s+j.accessors[p.indices].count/3,0);
if(total!==2099||j.skins[0].joints.length!==63||pos.length!==240)throw Error('Unexpected base properties');
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),len=a=>Math.hypot(...a);
function quality(face){
 const [a,b,c]=face.map(i=>pos[i]),ab=len(sub(a,b)),bc=len(sub(b,c)),ca=len(sub(c,a)),area=len(cross(sub(b,a),sub(c,a)))/2;
 return 4*Math.sqrt(3)*area/(ab*ab+bc*bc+ca*ca||1);
}
function normal(face){const [a,b,c]=face.map(i=>pos[i]);return cross(sub(b,a),sub(c,a))}
function orient2(a,b,c){const pa=pos[a],pb=pos[b],pc=pos[c];return (pb[0]-pa[0])*(pc[2]-pa[2])-(pb[2]-pa[2])*(pc[0]-pa[0])}
function local(face){const c=[0,1,2].map(k=>face.reduce((s,i)=>s+pos[i][k],0)/3);
 return Math.abs(c[0])<.099&&c[2]>.837&&c[2]<.969&&c[1]<-.038;
}
function links(){
 const m=new Map();
 for(let t=0;t<triangles.length;t++){
  const f=triangles[t];
  for(let i=0;i<3;i++){
   const a=f[i],b=f[(i+1)%3],c=f[(i+2)%3],key=a<b?a+','+b:b+','+a;
   if(!m.has(key))m.set(key,[]);
   m.get(key).push({t,a,b,c});
  }
 }return m;
}
let history=[],passes=0;let originalQuality=triangles.filter(local).map(quality);
const count=(arr,limit)=>arr.filter(v=>v<limit).length;
for(let pass=0;pass<80;pass++){
 const edges=links();let best=null;
 for(const [key,list] of edges){
  if(list.length!==2)continue;
  const [x,y]=list;
  if(x.a!==y.b||x.b!==y.a||x.c===y.c)continue;
  const F=triangles[x.t],G=triangles[y.t];
  if(!local(F)||!local(G))continue;
  const [a,b,c,d]=[x.a,x.b,x.c,y.c];
  if(Math.max(Math.abs(pos[c][0]),Math.abs(pos[d][0]))>.122)continue;
  const s1=orient2(a,b,c),s2=orient2(a,b,d),s3=orient2(c,d,a),s4=orient2(c,d,b);
  if(s1*s2>=0||s3*s4>=0)continue; // convex quadrilateral in the screen-projected ROI
  const before=Math.min(quality(F),quality(G));
  const attempts=[
   [[c,d,b],[d,c,a]],
   [[d,c,b],[c,d,a]]
  ];
  for(const t of attempts){
   const [fn,gn]=t;
   const n0=normal(F),n1=normal(G),nn0=normal(fn),nn1=normal(gn);
   if(dot(n0,nn0)<=.72*len(n0)*len(nn0)||dot(n1,nn1)<=.72*len(n1)*len(nn1))continue;
   const q0=quality(fn),q1=quality(gn),after=Math.min(q0,q1);
   if(after<before+.018||after<.09)continue;
   const gain=after-before;
   if(!best||gain>best.gain)best={F:x.t,G:y.t,old:[F,G],new:[fn,gn],gain,before,after,edge:key};
  }
 }
 if(!best)break;
 triangles[best.F]=best.new[0];triangles[best.G]=best.new[1];
 history.push({triangles:[best.F,best.G],oldEdge:best.edge,qualityBefore:best.before,qualityAfter:best.after});
 passes++;
}
// Recompute vertex normals only in touched area; preserve front/back orientation.
// Unmodified regions retain their original normals.
const changed=new Set(history.flatMap(h=>h.triangles));
const normalSum=pos.map(()=>[0,0,0]);
for(const face of triangles){const n=normal(face);for(const i of face)for(let k=0;k<3;k++)normalSum[i][k]+=n[k]}
const updatedVertices=new Set(history.flatMap(h=>h.triangles.flatMap(t=>triangles[t])));
const unit=a=>{const s=len(a)||1;return a.map(v=>v/s)};
let alteredNormalCount=0;
const newNormals=norm.map((v,i)=>{
 if(!updatedVertices.has(i))return v;
 let n=unit(normalSum[i]),ref=unit(v);if(dot(n,ref)<0)n=n.map(x=>-x);
 alteredNormalCount++;return unit(n.map((x,k)=>x*.89+ref[k]*.11));
});
const outIndex=triangles.flat();
const indexBytes=Buffer.alloc(outIndex.length*2);for(let i=0;i<outIndex.length;i++)indexBytes.writeUInt16LE(outIndex[i],i*2);
const normalsBytes=Buffer.alloc(newNormals.length*12);for(let i=0;i<newNormals.length;i++)for(let k=0;k<3;k++)normalsBytes.writeFloatLE(newNormals[i][k],i*12+k*4);
let extra=[Buffer.from(oldBin)];function size(){return extra.reduce((s,b)=>s+b.length,0)}
function append(b,type,component,count,target){
 if(size()%4)extra.push(Buffer.alloc(4-size()%4));
 const begin=size();extra.push(b);
 const view=j.bufferViews.push({buffer:0,byteOffset:begin,byteLength:b.length,target})-1;
 const a={bufferView:view,componentType:component,count,type};if(type==='SCALAR'){a.min=[0];a.max=[Math.max(...outIndex)]}
 return j.accessors.push(a)-1;
}
prim.indices=append(indexBytes,'SCALAR',5123,outIndex.length,34963);
prim.attributes.NORMAL=append(normalsBytes,'VEC3',5126,newNormals.length,34962);
prim.extras={...prim.extras,stage:'N16_CENTRAL_EDGE_REPAIR_KEEPING_ORIGINAL_3D_RIM',edgeFlips:history.length};
if(size()%4)extra.push(Buffer.alloc(4-size()%4));
const bin=Buffer.concat(extra);j.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(j)),pad=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(pad);
const out=Buffer.alloc(20+pad.length+8+bin.length),bh=20+pad.length;out.write('glTF',0);
out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(pad.length,12);
out.write('JSON',16);pad.copy(out,20);out.writeUInt32LE(bin.length,bh);out.write('BIN\0',bh+4,'ascii');bin.copy(out,bh+8);
fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});fs.mkdirSync(path.dirname(REPORT),{recursive:true});fs.writeFileSync(OUTPUT,out);
const newQuality=triangles.filter(local).map(quality);
const result={stage:'N16 original-3D-constrained edge optimization; preserve N15 boundary and attributes',inputSHA256:sha(src),outputSHA256:sha(out),triangles:total,regionFaces:originalQuality.length,edgeFlips:history.length,changedNormals:alteredNormalCount,sourcePositionAccessorUnchanged:true,originalSkinWeightsUnchanged:true,sourceFaceAndHairUnchanged:true,skinJoints:63,centerTopologyMode:'edge flips on source N15 3D mesh; not planar polygon replacement',originalRegionQualityMin:Math.min(...originalQuality),newRegionQualityMin:Math.min(...newQuality),originalRegionSkinnyCount:count(originalQuality,.3),newRegionSkinnyCount:count(newQuality,.3),history,limitations:['No native S2 rendering','N11-derived clothing-origin pelvic shell still present','Reoriented topology helps some face quality but does not reconstruct all anatomical creases']};
fs.writeFileSync(REPORT,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({file:OUTPUT,triangles:total,edgeFlips:history.length,oldLowQuality:result.originalRegionSkinnyCount,newLowQuality:result.newRegionSkinnyCount,sha256:result.outputSHA256}));
