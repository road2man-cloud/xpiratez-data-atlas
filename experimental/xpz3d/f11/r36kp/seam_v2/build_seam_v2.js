#!/usr/bin/env node
/* XPZ3D R36KK seam-v2: reversible, narrowly scoped medial thigh blend.
   Does not claim to reconstruct missing R36KP binary. Node.js standard library only. */
'use strict';
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const input=process.argv[2],out=process.argv[3];
if(!input||!out)throw Error('Usage: node build_seam_v2.js input.glb output.glb');
const source=fs.readFileSync(input),data=Buffer.from(source);
if(data.toString('ascii',0,4)!=='glTF'||data.readUInt32LE(4)!==2)throw Error('GLB v2 required');
const jlen=data.readUInt32LE(12),json=JSON.parse(data.subarray(20,20+jlen).toString('utf8'));
const binStart=20+jlen+8;
const parts=json.meshes[0].primitives;
function acc(id) {
 const a=json.accessors[id],v=json.bufferViews[a.bufferView];
 if(a.componentType!==5126||a.type!=='VEC3'||v.byteStride)throw Error('unexpected VEC3 accessor');
 const start=binStart+v.byteOffset+(a.byteOffset||0);
 return Array.from({length:a.count},(_,i)=>[0,1,2].map(k=>data.readFloatLE(start+i*12+k*4)));
}
function save(id,arr){
 const a=json.accessors[id],v=json.bufferViews[a.bufferView],start=binStart+v.byteOffset+(a.byteOffset||0);
 arr.forEach((p,i)=>p.forEach((x,k)=>data.writeFloatLE(x,start+i*12+k*4)));
}
const torso=acc(parts[7].attributes.POSITION);
const info={source:path.basename(input),output:path.basename(out),algorithm:'proximal leg to torso soft seam blend; nearest high-z torso vertex',changes:[],maxAllowedDisplacement:0.0025};
for(const pidx of [10,11]){
 const p=parts[pidx],points=acc(p.attributes.POSITION),old=points.map(v=>v.slice());
 const target=torso.filter(v=>v[2]>=0.84&&v[2]<=0.99);
 const proposals=points.map((v,i)=>{
    const d=target.map(t=>({t,dist:Math.hypot(v[0]-t[0],v[1]-t[1],v[2]-t[2])})).sort((a,b)=>a.dist-b.dist)[0];
    return {i,...d,z:v[2]};
 }).filter(x=>x.z>=0.85&&x.dist>=0.00001&&x.dist<=0.06).sort((a,b)=>a.dist-b.dist).slice(0,5);
 let sumOld=0,sumNew=0;
 for(const q of proposals) {
   const pt=points[q.i],step=Math.min(0.0025,q.dist*0.16);
   sumOld+=q.dist;
   for(let k=0;k<3;k++)pt[k]+=(q.t[k]-pt[k])*(step/q.dist);
   sumNew+=Math.hypot(...pt.map((x,k)=>x-q.t[k]));
 }
 save(p.attributes.POSITION,points);
 info.changes.push({primitive:pidx,selectedIndices:proposals.map(q=>q.i),vertexCount:proposals.length,meanGapBefore:proposals.length?sumOld/proposals.length:0,meanGapAfter:proposals.length?sumNew/proposals.length:0,maxDisplacement:Math.max(0,...points.map((v,i)=>Math.hypot(...v.map((x,k)=>x-old[i][k]))))});
}
if(data.length!==source.length)throw Error('unexpected length change');
fs.writeFileSync(out,data);
info.bytes=data.length;
info.sha256=crypto.createHash('sha256').update(data).digest('hex');
info.triangles=parts.reduce((n,p)=>n+json.accessors[p.indices].count/3,0);
info.bones=json.skins[0].joints.length;
info.sourceSha256=crypto.createHash('sha256').update(source).digest('hex');
fs.writeFileSync(out+'.json',JSON.stringify(info,null,2)+'\n');
console.log(JSON.stringify(info,null,2));
