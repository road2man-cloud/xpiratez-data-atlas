'use strict'; const fs=require('fs'),path=require('path'),root=__dirname;
const buf=fs.readFileSync(path.join(root,'r21AO-F11-user101-integrated-oval-r26-unified-skin-v2.glb'));const jl=buf.readUInt32LE(12),g=JSON.parse(buf.toString('utf8',20,20+jl)),off=28+jl,bin=buf.subarray(off,off+buf.readUInt32LE(20+jl));
const sizes={5121:1,5123:2,5125:4,5126:4},reads={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},nums={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function get(i){const a=g.accessors[i],v=g.bufferViews[a.bufferView],n=nums[a.type],st=v.byteStride||n*sizes[a.componentType],ofs=(v.byteOffset||0)+(a.byteOffset||0),d=[];
for(let j=0;j<a.count;j++){const row=[];for(let k=0;k<n;k++)row.push(bin[reads[a.componentType]](ofs+j*st+k*sizes[a.componentType]));d.push(n===1?row[0]:row)}return d}
let info={};
for(const i of [0,13,17,18,21,22,23]){const p=g.meshes[0].primitives[i],ids=get(p.indices),v=get(p.attributes.POSITION),m=get(p.targets[0].POSITION),b=[[],[]],bb=[[],[]];for(const pos of [v,v.map((x,j)=>x.map((y,k)=>y+m[j][k]))]){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const x of pos){for(let k=0;k<3;k++){min[k]=Math.min(min[k],x[k]);max[k]=Math.max(max[k],x[k])}}bb[pos===v?0:1]=[min,max]}
let ranges={};for(const x of v){const y=Math.floor(x[1]*20)/20,z=Math.floor(x[2]*20)/20;const key='y'+y.toFixed(2)+'_z'+z.toFixed(2);ranges[key]=(ranges[key]||0)+1}
const top=Object.entries(ranges).sort((a,b)=>b[1]-a[1]).slice(0,6);
info[i]={material:p.material,vertices:v.length,triangles:ids.length/3,restBBox:bb[0],posedBBox:bb[1],topRanges:top,accessors:Object.keys(p.attributes)}
}
const u=JSON.parse(fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'),'utf8'));
console.log(JSON.stringify({info,manualFirstPosition:u.positions[0],manualFirstDeleted:u.deletedFaces[0],glbNodes:g.nodes.length},null,2));