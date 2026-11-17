'use strict';
const fs=require('fs'),path=require('path');
const files=['r21AO-F11-user-trim-rev96-base.glb','r21AO-F11-user101-perineum-lowpoly-r7.glb'];
for(const file of files){
 const raw=fs.readFileSync(path.join(__dirname,file)),jl=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+jl)),bin=raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl));
 const sizes={5123:2,5125:4,5126:4,5121:1},reader={5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE',5121:'readUInt8'},dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
 function read(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=dims[a.type],sz=sizes[a.componentType],f=reader[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||sz*n,rows=[];for(let i=0;i<a.count;i++){const row=[];for(let k=0;k<n;k++)row.push(bin[f](off+i*stride+k*sz));rows.push(n===1?row[0]:row);}return rows}
 const involved=[0,13,17,18,21,...(doc.meshes[0].primitives.length>22?[22]:[])];
 const ids=new Map(),vertex=[],edges=new Map(),faces=[];
 function key(P,M){return P.map(v=>Math.round(v*100000)).join(':')+':'+M.map(v=>Math.round(v*100000)).join(':')}
 function vid(P,M,pi,oldid){const k=key(P,M);if(!ids.has(k)){ids.set(k,vertex.length);vertex.push({p:P,q:P.map((x,i)=>x+M[i]),from:[{pi,id:oldid}]})}else{vertex[ids.get(k)].from.push({pi,id:oldid})}return ids.get(k)}
 const kedge=(a,b)=>a<b?a+':'+b:b+':'+a;
 for(const pi of involved){const prim=doc.meshes[0].primitives[pi],I=read(prim.indices),P=read(prim.attributes.POSITION),M=read(prim.targets[0].POSITION);
  for(let t=0;t<I.length;t+=3){const a=I.slice(t,t+3).map(id=>vid(P[id],M[id],pi,id));faces.push({pi,ids:a});
   for(const [x,y]of[[a[0],a[1]],[a[1],a[2]],[a[2],a[0]]]){const k=kedge(x,y),v=edges.get(k)||{a:x,b:y,count:0,primitives:new Set()};v.count++;v.primitives.add(pi);edges.set(k,v)}
  }
 }
 const boundary=[...edges.values()].filter(e=>e.count===1),multiples=[...edges.values()].filter(e=>e.count>2);
 const nbr=new Map();for(const e of boundary){for(const [a,b]of[[e.a,e.b],[e.b,e.a]]){const arr=nbr.get(a)||[];arr.push(b);nbr.set(a,arr)}}
 const visited=new Set(),groups=[];
 for(const e of boundary){const ek=kedge(e.a,e.b);if(visited.has(ek))continue;
  const arr=[e.a,e.b];visited.add(ek);let pre=e.a,cur=e.b;
  for(let n=0;n<boundary.length+1;n++){let near=nbr.get(cur)||[],next=near.find(id=>id!==pre&&!visited.has(kedge(cur,id)));if(next===undefined)break;visited.add(kedge(cur,next));arr.push(next);pre=cur;cur=next;if(cur===arr[0])break;}
  const V=arr.map(id=>vertex[id].p),bounds=[0,1,2].map(k=>[Math.min(...V.map(v=>v[k])),Math.max(...V.map(v=>v[k]))]),center=[0,1,2].map(k=>V.reduce((s,x)=>s+x[k],0)/V.length),closed=arr.at(-1)===arr[0];
  groups.push({n:arr.length-Number(closed),closed,bounds:bounds.map(a=>a.map(x=>+x.toFixed(4))),center:center.map(x=>+x.toFixed(4)),verts:arr,relatedPrimitives:[...new Set(arr.flatMap(id=>vertex[id].from.map(f=>f.pi)))]});
 }
 groups.sort((a,b)=>b.n-a.n);
 console.log(JSON.stringify({file,virtualVertices:vertex.length,faces:faces.length,boundaryEdges:boundary.length,nonmanifoldEdges:multiples.length,
 groups:groups.map(g=>({n:g.n,closed:g.closed,bounds:g.bounds,center:g.center,prims:g.relatedPrimitives,verts:g.n<100?g.verts:undefined}))},null,2));
 fs.writeFileSync(path.join(__dirname,file.replace('.glb','-virtual-open-boundaries.json')),JSON.stringify({source:file,vertices:vertex,groups,nonmanifoldEdges:multiples.map(e=>({a:e.a,b:e.b,count:e.count}))},null,2)+'\n',{flag:'wx'});
}
