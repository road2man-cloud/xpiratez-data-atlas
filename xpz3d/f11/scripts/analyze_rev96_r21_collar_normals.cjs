'use strict';const fs=require('fs'),raw=fs.readFileSync('r21AO-F11-user101-bodygrown-core-r20-fitted.glb'),jl=raw.readUInt32LE(12),j=JSON.parse(raw.toString('utf8',20,20+jl)),bin=raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl)),p=j.meshes[0].primitives[0];
const d={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},s={5121:1,5123:2,5125:4,5126:4},op={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(i){let a=j.accessors[i],v=j.bufferViews[a.bufferView],n=d[a.type],size=s[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),st=v.byteStride||n*size,res=[];for(let i=0;i<a.count;i++){let r=[];for(let k=0;k<n;k++)r.push(bin[op[a.componentType]](off+i*st+k*size));res.push(n===1?r[0]:r);}return res;}
let P=read(p.attributes.POSITION),N=read(p.attributes.NORMAL),UV=read(p.attributes.TEXCOORD_0),I=read(p.indices),first=P.length-4*19;
const sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=a=>a.map(x=>x/(Math.hypot(...a)||1));
for(let row=0;row<4;row++){
 const id=first+row*19+9;let faces=[];for(let k=0;k<I.length;k+=3){let t=I.slice(k,k+3);if(t.includes(id)){let n=norm(cross(sub(P[t[1]],P[t[0]]),sub(P[t[2]],P[t[0]])));faces.push({dot:+dot(n,norm(N[id])).toFixed(3),n:n.map(x=>+x.toFixed(3))});}}
 console.log('row',row,'id',id,'P',P[id].map(x=>+x.toFixed(4)),'N',N[id].map(x=>+x.toFixed(3)),'UV',UV[id].map(x=>+x.toFixed(4)),'normalvsfaces',faces);
}
