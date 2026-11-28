#!/usr/bin/env node
'use strict';
// R36HW direct-preservation prototype. No R36JB body substitution.
// Stage 1: remove accessory primitives and neutralize garment materials.
// Clothing-shaped geometry remains until locally retopologized. Do not call this a final nude mesh.
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const INPUT=process.argv[2]||path.resolve(__dirname,'../../r36kp/reference/R36HW_F11_CLOTHED.glb');
const OUTPUT=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N1_STAGE1.glb');
const REPORT=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N1_STAGE1.json');
const EXPECTED='a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732';
const source=fs.readFileSync(INPUT);
if(source.toString('ascii',0,4)!=='glTF'||source.readUInt32LE(4)!==2)throw Error('Not GLB 2');
const originalHash=crypto.createHash('sha256').update(source).digest('hex');
if(originalHash!==EXPECTED)throw Error('R36HW input hash mismatch: '+originalHash);
const length=source.readUInt32LE(12),type=source.toString('ascii',16,20);
if(type!=='JSON')throw Error('Missing JSON chunk');
const gltf=JSON.parse(source.subarray(20,20+length).toString('utf8'));
const before=gltf.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0);
const originalPrimitives=gltf.meshes.flatMap(m=>m.primitives);
const beforeDetail=originalPrimitives.map((p,i)=>({index:i,name:gltf.materials[p.material]?.name,triangles:gltf.accessors[p.indices].count/3,attributes:Object.keys(p.attributes)}));
const remove=new Set(['trim','hardware','webbing','gear','skull','thigh_strap']);
const convert=new Set(['jacket','pants','boots','gloves']);
const skinId=gltf.materials.findIndex(m=>m.name==='skin');
if(skinId<0)throw Error('No original skin material');
const removed=[],converted=[];
for(const mesh of gltf.meshes){
  mesh.primitives=mesh.primitives.filter(p=>{
    const name=gltf.materials[p.material]?.name;
    if(remove.has(name)){removed.push({name,triangles:gltf.accessors[p.indices].count/3});return false;}
    if(convert.has(name)){converted.push({name,triangles:gltf.accessors[p.indices].count/3});p.material=skinId;}
    return true;
  });
}
const after=gltf.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0);
if(after>2100||gltf.skins?.[0]?.joints?.length!==63)throw Error('Budget or rig mismatch');
const json=Buffer.from(JSON.stringify(gltf),'utf8');
const padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded);
const remaining=source.subarray(20+length);
const header=Buffer.alloc(12);header.write('glTF',0,'ascii');header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+padded.length+remaining.length,8);
const chunk=Buffer.alloc(8);chunk.writeUInt32LE(padded.length,0);chunk.write('JSON',4,'ascii');
const result=Buffer.concat([header,chunk,padded,remaining]);
fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
fs.mkdirSync(path.dirname(REPORT),{recursive:true});
fs.writeFileSync(OUTPUT,result);
const report={stage:'geometry-preserving material and accessory pass, NOT completed undressing',originalSha256:originalHash,outputSha256:crypto.createHash('sha256').update(result).digest('hex'),originalTriangles:before,outputTriangles:after,retainedSkinJoints:63,materialClassification:beforeDetail,removed,converted,limitations:['Garment topology remains clothing-shaped','No occluded skin reconstruction','No center anatomical topology','No native S2 rendering or live skinning']};
fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:OUTPUT,report:REPORT,triangles:after,sha256:report.outputSha256}));
