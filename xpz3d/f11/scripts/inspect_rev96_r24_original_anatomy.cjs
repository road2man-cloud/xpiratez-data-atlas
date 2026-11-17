'use strict';
const fs=require('fs'),p='r21AO-F11-user101-native-retopo-r23-lbsweld.glb',b=fs.readFileSync(p),jl=b.readUInt32LE(12),d=JSON.parse(b.toString('utf8',20,20+jl)),buf=b.subarray(28+jl,28+jl+b.readUInt32LE(20+jl)),S={5121:1,5123:2,5125:4,5126:4},M={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},D={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(n){let a=d.accessors[n],v=d.bufferViews[a.bufferView],sz=S[a.componentType],nc=D[a.type],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||sz*nc,rows=[];for(let i=0;i<a.count;i++){let r=[];for(let j=0;j<nc;j++)r.push(buf[M[a.componentType]](off+stride*i+sz*j));rows.push(nc===1?r[0]:r)}return rows}
let c=d.meshes[0].primitives[13],P=read(c.attributes.POSITION),Q=read(c.targets[0].POSITION),I=read(c.indices),REG=read(c.attributes._ANATREGION),CAV=read(c.attributes._ANATCAVITY);let arc=[340,535,565,568,342,539,503,330,505,506,510,332,515,549,346,584,553,347,552,554,348];
function f(id){const p=P[id],m=Q[id];return {id,xyz:p.map(x=>+x.toFixed(4)),morph:m.map(x=>+x.toFixed(4)),region:+REG[id].toFixed(2),cavity:+CAV[id].toFixed(2)}}

let rows=[];for(let i=0;i<908;i++){if(Math.abs(P[i][0])<.045&&P[i][2]>.80&&P[i][2]<1.04&&P[i][1]>-.18&&P[i][1]<.11)rows.push({i,p:P[i].map(x=>+x.toFixed(4)),reg:+REG[i].toFixed(2),cav:+CAV[i].toFixed(2)})}
console.log('MAX REGION',JSON.stringify(rows.slice().sort((a,b)=>b.reg-a.reg).slice(0,50)));
console.log('MAX CAVITY',JSON.stringify(rows.slice().sort((a,b)=>b.cav-a.cav).slice(0,50)));
console.log('MIDLINE',JSON.stringify(rows.filter(x=>Math.abs(x.p[0])<.015).sort((a,b)=>a.p[1]-b.p[1]).filter((x,i,arr)=>i%3===0).slice(0,70)));
