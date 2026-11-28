#!/usr/bin/env node
'use strict';
/* R36HW N16 local connected patch retopology. No full-body remodelling. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n15-center-continuity-20261129/output/R36HW_N15_CENTER_CONTINUITY.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N16_RETESS_CENTER.glb');
const reportFile=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N16_RETESS_CENTER.json');
const HASH='7e151c13a8011c334c1b22f73dcccaba3420098bef7812417b9b4e564a0cd05b';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const inputBin=fs.readFileSync(input);
if(sha(inputBin)!==HASH)throw Error('Unexpected original-HW lineage '+sha(inputBin));
if(inputBin.toString('ascii',0,4)!=='glTF'||inputBin.readUInt32LE(4)!==2||inputBin.readUInt32LE(8)!==inputBin.length)throw Error('Invalid GLB');
const jl=inputBin.readUInt32LE(12),g=JSON.parse(inputBin.toString('utf8',20,20+jl)),binAt=20+jl;
if(inputBin.toString('ascii',binAt+4,binAt+8)!=='BIN\0')throw Error('Missing BIN');
const bin=inputBin.subarray(binAt+8,binAt+8+inputBin.readUInt32LE(binAt));
const dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},bs={5121:1,5123:2,5125:4,5126:4};
function read(id){
 const a=g.accessors[id],view=g.bufferViews[a.bufferView];
 if(!a||!view||a.sparse)throw Error('Sparse or absent GLB accessor '+id);
 const n=dim[a.type],w=bs[a.componentType],offset=(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||n*w,rows=[];
 for(let i=0;i<a.count;i++){const row=[];for(let k=0;k<n;k++){
 const at=offset+i*stride+k*w;if(at+w>bin.length)throw Error('GLB buffer overrun');
 row.push(a.componentType===5126?bin.readFloatLE(at):a.componentType===5125?bin.readUInt32LE(at):a.componentType===5123?bin.readUInt16LE(at):bin.readUInt8(at))
 }rows.push(row)}return rows;
}
const parts=g.meshes[0].primitives,prim=parts[3],A=prim.attributes;
if(g.meshes.length!==1||parts.length!==10||g.skins[0].joints.length!==63)throw Error('N15 model layout changed');
const totalBefore=parts.reduce((sum,p)=>sum+g.accessors[p.indices].count/3,0);
const pos=read(A.POSITION),norm=read(A.NORMAL),idx=read(prim.indices).map(v=>v[0]);
if(totalBefore!==2099||pos.length!==240||idx.length!==363*3)throw Error('N15 model triangles changed');
const faces=Array.from({length:idx.length/3},(_,i)=>idx.slice(i*3,i*3+3));
const patched=require('./retess_patch.cjs')({positions:pos,triangles:faces,innerIds:[32,238,239],oldNormals:norm});
if(patched.faces.length!==faces.length)throw Error('New connected patch changed budget');
const nextIndex=patched.faces.flat(),newPos=patched.positions,nextNormal=patched.newNormals;
const chunks=[Buffer.from(bin)];
function size(){return chunks.reduce((s,v)=>s+v.length,0)}
function append(rows,id,target){
 if(size()%4)chunks.push(Buffer.alloc(4-size()%4));
 const a=g.accessors[id],n=dim[a.type],w=bs[a.componentType],offset=size(),data=Buffer.alloc(rows.length*n*w);
 for(let i=0;i<rows.length;i++)for(let k=0;k<n;k++){const q=(i*n+k)*w,v=rows[i][k];if(!Number.isFinite(v))throw Error('Nonfinite output attribute');
 if(a.componentType===5126)data.writeFloatLE(v,q);else if(a.componentType===5123)data.writeUInt16LE(Math.round(v),q);else if(a.componentType===5125)data.writeUInt32LE(Math.round(v),q);else data.writeUInt8(Math.max(0,Math.min(255,Math.round(v))),q);}
 chunks.push(data);const view=g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target})-1;
 const na={bufferView:view,componentType:a.componentType,count:rows.length,type:a.type};
 if(a.normalized)na.normalized=true;
 if(a.type==='VEC3'&&a.componentType===5126){na.min=[0,1,2].map(k=>Math.min(...rows.map(v=>v[k])));na.max=[0,1,2].map(k=>Math.max(...rows.map(v=>v[k])))}
 if(a.type==='SCALAR'){na.min=[Math.min(...rows.map(v=>v[0]))];na.max=[Math.max(...rows.map(v=>v[0]))]}
 return g.accessors.push(na)-1;
}
A.POSITION=append(newPos,A.POSITION,34962);
A.NORMAL=append(nextNormal,A.NORMAL,34962);
prim.indices=append(nextIndex.map(i=>[i]),prim.indices,34963);
prim.extras={...prim.extras,stage:'N16_ACTUAL_CENTER_POLYGON_RETESSELLATION',singleOriginalPelvisPrimitive:true,otherAreasProtected:true};
if(size()%4)chunks.push(Buffer.alloc(4-size()%4));
const nextBin=Buffer.concat(chunks);g.buffers[0].byteLength=nextBin.length;
const json=Buffer.from(JSON.stringify(g)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded);
const result=Buffer.alloc(20+padded.length+8+nextBin.length),at=20+padded.length;
result.write('glTF',0,'ascii');result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
result.writeUInt32LE(padded.length,12);result.write('JSON',16,'ascii');padded.copy(result,20);
result.writeUInt32LE(nextBin.length,at);result.write('BIN\0',at+4,'ascii');nextBin.copy(result,at+8);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(output,result);
const proof={stage:'R36HW N16 actual retessellation of 44-face joined center only',inputSHA256:sha(inputBin),outputSHA256:sha(result),trianglesBefore:totalBefore,trianglesAfter:parts.reduce((n,p)=>n+g.accessors[p.indices].count/3,0),pelvisTriangles:nextIndex.length/3,originalPelvisVertices:pos.length,outputPelvisVertices:newPos.length,...patched.metrics,skinJoints:g.skins[0].joints.length,faceAndHairUnmodified:true,externalBodyPrimitivesUnmodified:true,sourceUVAndSkinWeightAccessorsUnchanged:true,imageEmbedded:false,visualApproval:false,nativeS2Rendered:false,limitations:['Inherited shorts-like outer surface remains','Waist/leg edges not yet welded','Single photograph cannot determine 3D depth','3D target likeness not verified']};
fs.writeFileSync(reportFile,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({output,triangles:proof.trianglesAfter,metrics:patched.metrics,sha:proof.outputSHA256}));
