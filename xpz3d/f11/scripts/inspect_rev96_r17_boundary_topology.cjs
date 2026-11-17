'use strict';
const fs=require('fs'),path=require('path'),root=__dirname;
const file='r21AO-F11-user101-compact-core-r16-compact.glb',b=fs.readFileSync(path.join(root,file)),jl=b.readUInt32LE(12),doc=JSON.parse(b.toString('utf8',20,20+jl)),buf=b.subarray(28+jl,28+jl+b.readUInt32LE(20+jl));
const t={5121:['readUInt8',1],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]},D={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function get(id){let a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=D[a.type],[fn,s]=t[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*s,out=[];for(let i=0;i<a.count;i++){let r=[];for(let j=0;j<n;j++)r.push(buf[fn](off+i*stride+j*s));out.push(n===1?r[0]:r)}return out;}
const P=doc.meshes[0].primitives;
let report=[];
for(let pi of [0,13,17,18,21,22]){if(!P[pi])continue;let I=get(P[pi].indices),V=get(P[pi].attributes.POSITION),M=get(P[pi].targets[0].POSITION),edges=new Map(),nbr=new Map();
for(let i=0;i<I.length;i+=3){for(let [a,b]of [[I[i],I[i+1]],[I[i+1],I[i+2]],[I[i+2],I[i]]]){let key=a<b?a+':'+b:b+':'+a,old=edges.get(key)||{a,b,num:0};old.num++;edges.set(key,old)}}
let boundary=[...edges.values()].filter(e=>e.num===1),used=new Set(),chains=[];for(const e of boundary)for(let [a,b] of [[e.a,e.b],[e.b,e.a]]){if(!nbr.has(a))nbr.set(a,[]);nbr.get(a).push(b)}
function key(a,b){return a<b?a+':'+b:b+':'+a}
for(const e of boundary){if(used.has(key(e.a,e.b)))continue;let ids=[e.a,e.b],prev=e.a,cur=e.b;used.add(key(e.a,e.b));for(let k=0;k<boundary.length+2;k++){const candidate=(nbr.get(cur)||[]).find(x=>x!==prev&&!used.has(key(cur,x)));if(candidate===undefined)break;ids.push(candidate);used.add(key(cur,candidate));prev=cur;cur=candidate;if(cur===ids[0])break}
let closed=ids.at(-1)===ids[0],coords=ids.map(id=>V[id]),min=[0,1,2].map(k=>Math.min(...coords.map(v=>v[k]))),max=[0,1,2].map(k=>Math.max(...coords.map(v=>v[k])));
const sample=ids.slice(0,40).map(id=>({id,p:V[id].map(x=>+x.toFixed(4))}));
chains.push({n:ids.length-Number(closed),closed,min:min.map(x=>+x.toFixed(4)),max:max.map(x=>+x.toFixed(4)),ids, sample});
}
report.push({pi,faces:I.length/3,verts:V.length,openEdges:boundary.length,chains});
}
fs.writeFileSync(path.join(root,'rev96-r17-r16-boundaries.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report.map(p=>({pi:p.pi,faces:p.faces,verts:p.verts,openEdges:p.openEdges,chains:p.chains.map(c=>({n:c.n,closed:c.closed,min:c.min,max:c.max,ids:c.ids.length<65?c.ids:undefined}))})),null,2));
