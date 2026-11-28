#!/usr/bin/env node
'use strict';
// Converts *actual* corrected N7B GLB mesh triangles to the already-connected native S2 XPZC format.
// The packet is a diagnostic static bind pose; UV, normals and textures are not represented.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n7-hem-continuity-20261129/output/R36HW_N7_HEM_CONTINUITY.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N7B_STATIC_XPZC.bin');
const report=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N7B_STATIC_XPZC.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const expected='4964f36cf81f6fba4009b75a4813cb08e18469988475301aadccecb089be4ceb';
const blob=fs.readFileSync(input);
if(sha(blob)!==expected)throw Error('Unexpected N7B GLB SHA-256 '+sha(blob));
if(blob.toString('ascii',0,4)!=='glTF'||blob.readUInt32LE(4)!==2||blob.readUInt32LE(8)!==blob.length)throw Error('Bad GLB header');
const jl=blob.readUInt32LE(12),g=JSON.parse(blob.toString('utf8',20,20+jl));
const binaryOff=20+jl,bl=blob.readUInt32LE(binaryOff);
if(blob.toString('ascii',binaryOff+4,binaryOff+8)!=='BIN\0')throw Error('Missing BIN');
const bin=blob.subarray(binaryOff+8,binaryOff+8+bl);
const bytes={5121:1,5123:2,5125:4,5126:4},dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(i){
 const a=g.accessors[i],v=g.bufferViews[a.bufferView];if(!a||!v||a.sparse)throw Error('Bad accessor '+i);
 const n=dim[a.type],size=bytes[a.componentType],stride=v.byteStride||n*size,offset=(v.byteOffset||0)+(a.byteOffset||0);
 if(n<1||size<1||offset+(a.count-1)*stride+n*size>bin.length)throw Error('Bad dimensions '+i);
 const data=[];for(let row=0;row<a.count;row++){const vec=[];for(let c=0;c<n;c++){
  const at=offset+row*stride+c*size,v=a.componentType===5126?bin.readFloatLE(at):a.componentType===5125?bin.readUInt32LE(at):a.componentType===5123?bin.readUInt16LE(at):bin.readUInt8(at);
  vec.push(v);
 }data.push(vec)}return data;
}
const primitives=g.meshes.flatMap(m=>m.primitives),groups=[],parts=[];
if(primitives.length!==10||g.skins?.[0]?.joints?.length!==63)throw Error('N7B primitive/rig mismatch');
let total=0,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
for(let k=0;k<primitives.length;k++){
 const p=primitives[k];const position=read(p.attributes.POSITION),idx=read(p.indices).map(x=>x[0]);
 if(idx.length%3)throw Error('Index count not multiple 3');
 const kind=k===1?1:(k===0||(k===7||k===8))?2:0;
 const tris=idx.length/3;
 const points=idx.map(i=>{if(i>=position.length)throw Error('Index OOB');return position[i]});
 const header=Buffer.alloc(16);header.writeUInt32LE(kind,0);header.writeUInt32LE(tris,4);header.writeUInt32LE(points.length,8);
 const vertices=Buffer.alloc(points.length*12);
 for(let n=0;n<points.length;n++)for(let axis=0;axis<3;axis++){
  const v=points[n][axis];if(!Number.isFinite(v)||Math.abs(v)>100)throw Error('Bad vertex');
  vertices.writeFloatLE(v,n*12+axis*4);min[axis]=Math.min(min[axis],v);max[axis]=Math.max(max[axis],v);
 }
 groups.push({index:k,triangles:tris,kind,material:p.material,vertices:points.length});
 parts.push(header,vertices);total+=tris;
}
if(total!==2098||groups.length!==10)throw Error('Unexpected triangles/parts '+total+'/'+groups.length);
const hdr=Buffer.alloc(32);hdr.write('XPZC',0,'ascii');hdr.writeUInt32LE(1,4);hdr.writeUInt32LE(groups.length,8);hdr.writeUInt32LE(total,12);
const packet=Buffer.concat([hdr,...parts]);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(report),{recursive:true});
fs.writeFileSync(output,packet);
const proof={format:'XPZC native S2 static geometry',inputSha256:sha(blob),packetSha256:sha(packet),triangles:total,parts:groups.length,groups,modelOriginalJoints:g.skins[0].joints.length,bounds:{min,max},packetBytes:packet.length,limitations:['No original UV/color atlas','No original normals/tangent space','No runtime bone animation','Requires native S2 loader accepting 2098 triangles (original R138E hardcodes 2100)','No native capture in this build']};
fs.writeFileSync(report,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({output,report,triangles:total,groups:groups.length,bytes:packet.length,sha256:proof.packetSha256}));
