'use strict';
const fs=require('fs');const b=fs.readFileSync('r21AO-F11-user101-core-extended-curved-r12.glb'),j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12))),bin=b.subarray(28+b.readUInt32LE(12)),q=j.meshes[0].primitives;
function r(pi,id,key='POSITION',t=false){const idx=t?q[pi].targets[0][key]:q[pi].attributes[key],a=j.accessors[idx],v=j.bufferViews[a.bufferView],off=(v.byteOffset||0)+(a.byteOffset||0)+id*12;return [0,4,8].map(k=>+bin.readFloatLE(off+k).toFixed(5))}
for(const id of [29,174,306,214,216,215,296,75,78,76,83,82,221,222,302,28])console.log(id,'body',r(0,id),'morph',r(0,id,'POSITION',true));
for(let row=1;row<=12;row++)console.log('row',row,'L',r(13,908+(row-1)*19),'R',r(13,908+(row-1)*19+18));
