'use strict';
const fs=require('fs'),path=require('path'),root=__dirname;
const raw=fs.readFileSync(path.join(root,'r21AO-F11-user101-native-skin-bowl-r22-dome.glb')),jl=raw.readUInt32LE(12),g=JSON.parse(raw.toString('utf8',20,20+jl)),bin=raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl));
const pp=g.meshes[0].primitives,D={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},S={5121:1,5123:2,5125:4,5126:4},M={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(n){let a=g.accessors[n],v=g.bufferViews[a.bufferView],z=S[a.componentType],c=D[a.type],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||z*c,r=[];for(let i=0;i<a.count;i++){let q=[];for(let j=0;j<c;j++)q.push(bin[M[a.componentType]](off+i*stride+j*z));r.push(c===1?q[0]:q);}return r}
const wanted=[0,13,17,18,21,22,23],pts=[],morph=[],source=[],verts=new Map(),faces=[];
function vtx(pi,id,P,H){let p=P[id],h=H[id],k=[...p,...h].map(x=>Math.round(x*1e5)).join(',');if(!verts.has(k)){verts.set(k,pts.length);pts.push(p);morph.push(h);source.push([])}const v=verts.get(k);source[v].push([pi,id]);return v}
for(const pi of wanted){const p=pp[pi],P=read(p.attributes.POSITION),H=read(p.targets[0].POSITION),I=read(p.indices),vm=new Map();
for(let k=0;k<I.length;k+=3){let a=I.slice(k,k+3),b=a.map(id=>{if(!vm.has(id))vm.set(id,vtx(pi,id,P,H));return vm.get(id)});let cat=pi===13?(a.every(id=>id<1134)?'coreOuter':a.every(id=>id>=1134)?'coreInner':'coreWall'):'p'+pi;faces.push({pi,cat,idx:k/3,a,b,center:[0,1,2].map(j=>a.reduce((v,id)=>v+P[id][j],0)/3)})}}
function edges(fset){let E=new Map(),K=(a,b)=>a<b?a+':'+b:b+':'+a;
for(const f of fset)for(const [a,b]of[[f.b[0],f.b[1]],[f.b[1],f.b[2]],[f.b[2],f.b[0]]]){let k=K(a,b),row=E.get(k)||{a,b,refs:[]};row.refs.push({cat:f.cat,pi:f.pi,idx:f.idx,dir:a<b?1:-1});E.set(k,row)}return E}
const center=e=>[e.a,e.b].every(id=>{let p=pts[id];return Math.abs(p[0])<.12&&p[1]>-.18&&p[1]<.125&&p[2]>.80&&p[2]<.97});

const all=faces.filter(f=>!['coreInner','coreWall','p22'].includes(f.cat)),E=edges(all),bdr=[...E.values()].filter(e=>e.refs.length===1),mul=[...E.values()].filter(e=>e.refs.length>2),wrong=[...E.values()].filter(e=>e.refs.length===2&&e.refs[0].dir===e.refs[1].dir);
const adjacency=new Map(),visited=new Set(),k=(a,b)=>a<b?a+':'+b:b+':'+a;
for(const e of bdr)for(let [a,b]of[[e.a,e.b],[e.b,e.a]]){if(!adjacency.has(a))adjacency.set(a,[]);adjacency.get(a).push(b)}
const chains=[];for(const e of bdr){if(visited.has(k(e.a,e.b)))continue;let stack=[e.a,e.b],queue=[e.a,e.b],edgeset=new Set();while(queue.length){const a=queue.pop();for(const b of (adjacency.get(a)||[])){const z=k(a,b);if(edgeset.has(z))continue;edgeset.add(z);queue.push(b);}}let es=bdr.filter(x=>edgeset.has(k(x.a,x.b))),vs=[...new Set(es.flatMap(x=>[x.a,x.b]))],degreeCounts={};for(const v of vs){const d=(adjacency.get(v)||[]).length;degreeCounts[d]=(degreeCounts[d]||0)+1}
let ps=vs.map(v=>pts[v]),center=[0,1,2].map(j=>ps.reduce((s,p)=>s+p[j],0)/ps.length),box=[0,1,2].map(j=>[Math.min(...ps.map(p=>p[j])),Math.max(...ps.map(p=>p[j]))]);for(const edge of es)visited.add(k(edge.a,edge.b));
chains.push({vertices:vs.length,edges:es.length,degreeCounts,center,box,cats:[...new Set(es.map(x=>x.refs[0].cat))],vs,edges:es.map(x=>({a:x.a,b:x.b,cat:x.refs[0].cat,tri:x.refs[0].idx,pi:x.refs[0].pi})),coords:vs.map(v=>({id:v,p:pts[v],source:source[v]}))});
}
const report={edges:bdr.length,wrong:wrong.map(e=>({p:[pts[e.a],pts[e.b]],refs:e.refs})),components:chains.sort((a,b)=>b.edges-a.edges),meta:pp.map((p,i)=>({i,material:p.material,count:g.accessors[p.indices].count/3}))};
fs.writeFileSync(path.join(root,'rev96-r23-post-shell-boundary-v2.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({meta:report.meta,wrong:report.wrong,edges:report.edges,components:report.components.map(c=>({vertices:c.vertices,edges:c.edges,degreeCounts:c.degreeCounts,center:c.center,box:c.box,cats:c.cats}))},null,2));
