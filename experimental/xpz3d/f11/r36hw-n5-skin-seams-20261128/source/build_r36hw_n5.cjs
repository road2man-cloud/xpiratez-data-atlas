#!/usr/bin/env node
'use strict';
/*
  R36HW-N5 — source-preserving seam patch and exposed-skin UV integration.
  Source is N4 (itself derived from R36HW); no R36JB import and no picture projection.
  Repair visible-source jacket lower edge only. Closed garment shells remain explicit debt.
*/
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const srcFile=process.argv[2]||path.resolve(__dirname,'../../r36hw-n4-skin-material-20261128/output/R36HW_N4_SKIN_DETAIL.glb');
const outFile=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N5_SEAM_LINK.glb');
const reportFile=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N5_SEAM_LINK.json');
const expected='82e085bd91e8e48d2d6e6794047b54d39d47c2abe5940c184e12c45a25114482';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const src=fs.readFileSync(srcFile);
if(sha(src)!==expected)throw Error('Expected exactly approved N4 source GLB: '+sha(src));
if(src.toString('ascii',0,4)!=='glTF'||src.readUInt32LE(4)!==2||src.readUInt32LE(8)!==src.length)throw Error('Malformed GLB');
const jl=src.readUInt32LE(12),g=JSON.parse(src.toString('utf8',20,20+jl));
const binOffset=20+jl,bl=src.readUInt32LE(binOffset);
if(src.toString('ascii',binOffset+4,binOffset+8)!=='BIN\0')throw Error('No embedded BIN');
const originalBin=src.subarray(binOffset+8,binOffset+8+bl);
if(g.skins?.[0]?.joints?.length!==63)throw Error('63-joint HW rig not found');
const mesh=g.meshes?.[0];
if(!mesh||mesh.primitives.length!==9)throw Error('N4 9 primitive topology expected');
const skinMaterial=g.materials.findIndex(m=>m.name==='R36HW_N4_procedural_skin_shells');
if(skinMaterial<0)throw Error('Procedural N4 material unavailable');
const before=mesh.primitives.reduce((n,p)=>n+g.accessors[p.indices].count/3,0);
if(before!==2076)throw Error('Original triangle count mismatch');
const comps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},typeSize={5121:1,5123:2,5125:4,5126:4};
function accessor(id){
 const ac=g.accessors[id],v=g.bufferViews[ac.bufferView];
 if(ac.sparse)throw Error('Sparse accessor unsupported');
 const n=comps[ac.type],size=typeSize[ac.componentType],stride=v.byteStride||n*size,first=(v.byteOffset||0)+(ac.byteOffset||0);
 const list=[];for(let i=0;i<ac.count;i++){
  const cur=[];for(let j=0;j<n;j++){const k=first+i*stride+j*size;
   cur.push(ac.componentType===5126?originalBin.readFloatLE(k):ac.componentType===5125?originalBin.readUInt32LE(k):ac.componentType===5123?originalBin.readUInt16LE(k):originalBin.readUInt8(k));
  }list.push(cur);
 }return list;
}
const jacket=mesh.primitives[2],skin=mesh.primitives[6];
const skinPos=accessor(skin.attributes.POSITION),skinNorm=accessor(skin.attributes.NORMAL),skinJoints=accessor(skin.attributes.JOINTS_0),skinWeights=accessor(skin.attributes.WEIGHTS_0);
const coatPos=accessor(jacket.attributes.POSITION),coatNorm=accessor(jacket.attributes.NORMAL),coatJoints=accessor(jacket.attributes.JOINTS_0),coatWeights=accessor(jacket.attributes.WEIGHTS_0),coatIndices=accessor(jacket.indices).map(r=>r[0]);
const pristineFace=JSON.stringify(mesh.primitives[0]),pristineHair=JSON.stringify(mesh.primitives[1]);
const buffers=[Buffer.from(originalBin)];
function size(){return buffers.reduce((s,b)=>s+b.length,0)}
function align(){const rem=size()%4;if(rem)buffers.push(Buffer.alloc(4-rem))}
function addAttr(values,ty,componentType,normalized=false,target=34962){
 align();const offset=size(),dim=comps[ty],width=typeSize[componentType],bytes=Buffer.alloc(values.length*dim*width);
 for(let i=0;i<values.length;i++)for(let k=0;k<dim;k++){
  const v=values[i][k],off=(i*dim+k)*width;
  if(componentType===5126)bytes.writeFloatLE(v,off);
  else if(componentType===5123)bytes.writeUInt16LE(Math.round(v),off);
  else if(componentType===5125)bytes.writeUInt32LE(Math.round(v),off);
  else bytes.writeUInt8(Math.round(Math.max(0,Math.min(255,v))),off);
 }
 buffers.push(bytes);
 const view=g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target})-1;
 const meta={bufferView:view,componentType,count:values.length,type:ty};
 if(normalized)meta.normalized=true;
 if(ty==='VEC3'&&componentType===5126&&values.length){meta.min=[0,1,2].map(k=>Math.min(...values.map(x=>x[k])));meta.max=[0,1,2].map(k=>Math.max(...values.map(x=>x[k])))}
 return g.accessors.push(meta)-1;
}
// Stable UVs on the *original exposed skin*; repeatable fine-grain only,
// independent of any provided anatomical photo.
function skinUV(v){
 const x=v[0],y=v[1],z=v[2];
 if(Math.abs(x)>.32){return [((z*1.75+y*.54)%1+1)%1,((Math.abs(x)*1.8+y*.36)%1+1)%1]}
 return [((x*1.65+y*.82+.5)%1+1)%1,((z*1.2+.15)%1+1)%1];
}
const bodyUV=skinPos.map(skinUV);
if(skin.attributes.TEXCOORD_0!==undefined)throw Error('Exposed HW skin already has UV: refuse overwrite');
skin.attributes.TEXCOORD_0=addAttr(bodyUV,'VEC2',5126);
skin.material=skinMaterial;
const edgeTable=new Map();
for(let k=0;k<coatIndices.length;k+=3)for(const [a,b] of [[coatIndices[k],coatIndices[k+1]],[coatIndices[k+1],coatIndices[k+2]],[coatIndices[k+2],coatIndices[k]]]){
 const key=Math.min(a,b)+':'+Math.max(a,b);const existing=edgeTable.get(key)||{a,b,count:0};existing.count++;edgeTable.set(key,existing);
}
function nearestSkin(v){
 let id=-1,dist=Infinity;
 for(let i=0;i<skinPos.length;i++){
  const p=skinPos[i],d=Math.hypot(p[0]-v[0],p[1]-v[1],p[2]-v[2]);
  if(d<dist){id=i;dist=d}
 }
 return {id,dist};
}
function keyPos(p){return p.map(n=>Math.round(n*10000)).join('/')}
const unique=new Set(),seams=[],maxTri=24;
for(const e of edgeTable.values()){
 if(e.count!==1)continue;
 const a=coatPos[e.a],b=coatPos[e.b];
 if(!(a[2]>1.193&&a[2]<1.235&&b[2]>1.193&&b[2]<1.235))continue;
 const key=[keyPos(a),keyPos(b)].sort().join(':');
 if(unique.has(key))continue;
 unique.add(key);
 const as=nearestSkin(a),bs=nearestSkin(b);
 if(as.dist>.037||bs.dist>.037||as.id===bs.id)continue;
 seams.push({coat:[e.a,e.b],skin:[as.id,bs.id],distances:[as.dist,bs.dist]});
}
if(seams.length<2||seams.length>12||seams.length*2>maxTri)throw Error('Unexpected original jacket seam topology: '+seams.length);
const patch={POSITION:[],NORMAL:[],JOINTS_0:[],WEIGHTS_0:[],COLOR_0:[],TEXCOORD_0:[]},newIndices=[];
function length(v){return Math.hypot(...v)||1}
function pushVertex(p,n,j,w){
 patch.POSITION.push([...p]);patch.NORMAL.push(n.map(k=>k/length(n)));
 patch.JOINTS_0.push([...j]);patch.WEIGHTS_0.push([...w]);
 patch.COLOR_0.push([255,255,255,255]);patch.TEXCOORD_0.push(skinUV(p));
}
for(const s of seams){
 const [a,b]=s.coat,[c,d]=s.skin,idx=patch.POSITION.length;
 pushVertex(coatPos[a],coatNorm[a],coatJoints[a],coatWeights[a]);
 pushVertex(coatPos[b],coatNorm[b],coatJoints[b],coatWeights[b]);
 pushVertex(skinPos[d],skinNorm[d],skinJoints[d],skinWeights[d]);
 pushVertex(skinPos[c],skinNorm[c],skinJoints[c],skinWeights[c]);
 newIndices.push(idx,idx+1,idx+2,idx,idx+2,idx+3);
}
if(newIndices.length===0||before+newIndices.length/3>2100)throw Error('Missing seam patch or overflow');
const seamMaterial=JSON.parse(JSON.stringify(g.materials[skinMaterial]));seamMaterial.name='R36HW_N5_bridge_skin';seamMaterial.doubleSided=true;
const mid=g.materials.push(seamMaterial)-1;
const attrs={};for(const [name,values] of Object.entries(patch)){
 attrs[name]=addAttr(values,name==='POSITION'||name==='NORMAL'?'VEC3':name==='TEXCOORD_0'?'VEC2':'VEC4',name==='JOINTS_0'?5123:name==='COLOR_0'?5121:5126,name==='COLOR_0');
}
const idxId=addAttr(newIndices.map(v=>[v]),'SCALAR',5123,false,34963);
g.accessors[idxId].min=[Math.min(...newIndices)];g.accessors[idxId].max=[Math.max(...newIndices)];
mesh.primitives.push({attributes:attrs,indices:idxId,material:mid,mode:4,extras:{name:'HW N5 original skin seam bridge',source:'N4 jacket boundary and N4 original exposed skin',triangles:newIndices.length/3}});
if(pristineFace!==JSON.stringify(mesh.primitives[0])||pristineHair!==JSON.stringify(mesh.primitives[1]))throw Error('Protected facial geometry modified');
align();const bin=Buffer.concat(buffers);g.buffers[0].byteLength=bin.length;
const text=Buffer.from(JSON.stringify(g),'utf8'),json=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(json);
const output=Buffer.alloc(20+json.length+8+bin.length);output.write('glTF',0,'ascii');output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(json.length,12);output.write('JSON',16,'ascii');json.copy(output,20);
const off=20+json.length;output.writeUInt32LE(bin.length,off);output.write('BIN\0',off+4,'ascii');bin.copy(output,off+8);
fs.mkdirSync(path.dirname(outFile),{recursive:true});fs.mkdirSync(path.dirname(reportFile),{recursive:true});
fs.writeFileSync(outFile,output);
const stats={stage:'N5 actual HW skin material alignment and boundary gap bridging',inputSha256:sha(src),outputSha256:sha(output),inputTriangles:before,newTriangles:before+newIndices.length/3,skinJointCount:63,originalFacePreserved:true,originalHairPreserved:true,exposedSkinVerticesTextured:bodyUV.length,addedSeamTriangles:newIndices.length/3,addedSeamVertices:patch.POSITION.length,sourceSeamEdges:seams.length,sourceSeamPairs:seams.map(s=>({jacket:s.coat,skin:s.skin,distances:s.distances})),newPrimitiveCount:mesh.primitives.length,originalBinBytes:originalBin.length,outputBinBytes:bin.length,remainingTriangleBudget:2100-(before+newIndices.length/3),limitations:['Closed trousers, boots and gloves remain original garment-topology shells','Only the safely identifiable jacket-to-skin seam is bridged','No certified fully undressed topology or dynamic skinning','S2 native frame not yet captured','Single reference image is not used as a texture']};
fs.writeFileSync(reportFile,JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify({outFile,reportFile,triangles:stats.newTriangles,seamTriangles:stats.addedSeamTriangles,sha256:stats.outputSha256}));
