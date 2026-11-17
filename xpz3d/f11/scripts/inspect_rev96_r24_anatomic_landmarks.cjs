'use strict';
const fs=require('fs'),p='r21AO-F11-user101-native-retopo-r23-lbsweld.glb',b=fs.readFileSync(p),jl=b.readUInt32LE(12),d=JSON.parse(b.toString('utf8',20,20+jl)),buf=b.subarray(28+jl,28+jl+b.readUInt32LE(20+jl)),S={5121:1,5123:2,5125:4,5126:4},M={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},D={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(n){let a=d.accessors[n],v=d.bufferViews[a.bufferView],sz=S[a.componentType],nc=D[a.type],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||sz*nc,rows=[];for(let i=0;i<a.count;i++){let r=[];for(let j=0;j<nc;j++)r.push(buf[M[a.componentType]](off+stride*i+sz*j));rows.push(nc===1?r[0]:r)}return rows}
let c=d.meshes[0].primitives[13],P=read(c.attributes.POSITION),Q=read(c.targets[0].POSITION),I=read(c.indices),REG=read(c.attributes._ANATREGION),CAV=read(c.attributes._ANATCAVITY);let arc=[340,535,565,568,342,539,503,330,505,506,510,332,515,549,346,584,553,347,552,554,348];
function f(id){const p=P[id],m=Q[id];return {id,xyz:p.map(x=>+x.toFixed(4)),morph:m.map(x=>+x.toFixed(4)),region:+REG[id].toFixed(2),cavity:+CAV[id].toFixed(2)}}
for(let row=-1;row<8;row++){const ids=row===-1?arc.slice(1,20):Array.from({length:19},(_,j)=>908+19*row+j);console.log('row '+row+' '+JSON.stringify(ids.slice(5,14).map(f)))}
console.log('PIT '+JSON.stringify(Array.from({length:17},(_,j)=>f(1060+j))));
console.log('GRID MAIN LINE '+JSON.stringify(Array.from({length:8},(_,j)=>f(908+19*j+9))));
console.log('BODY rim '+JSON.stringify([908,914,915,909,916,917,910,918,919,29,920,921,911,922,923,912,924,925,913].slice(6,13).map(k=>f(k)),null,2));
console.log('geom',P.length,I.length/3,c.extras);
