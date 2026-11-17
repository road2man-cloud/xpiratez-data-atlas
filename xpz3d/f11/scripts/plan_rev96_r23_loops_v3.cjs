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


const all=faces.filter(f=>!['coreInner','coreWall','p22'].includes(f.cat)),E=edges(all);
const B=[...E.values()].filter(e=>e.refs.length===1).map(e=>({a:e.a,b:e.b,ref:e.refs[0]}));
const inmap=new Map(),outmap=new Map();
for(let i=0;i<B.length;i++){let e=B[i];if(!inmap.has(e.b))inmap.set(e.b,[]);inmap.get(e.b).push(i);if(!outmap.has(e.a))outmap.set(e.a,[]);outmap.get(e.a).push(i);}
function norm(v){const l=Math.hypot(...v)||1;return v.map(x=>x/l)}
function dot(a,b){return a.reduce((s,x,i)=>s+x*b[i],0)}
function sub(a,b){return a.map((x,i)=>x-b[i])}
const transitions=new Map(),bad=[];
for(const v of new Set([...inmap.keys(),...outmap.keys()])){
 const I=inmap.get(v)||[],O=outmap.get(v)||[];
 if(I.length!==O.length){bad.push({v,in:I.length,out:O.length,p:pts[v]});continue}
 const n=I.length;
 const dfs=(used=[],sum=0)=>{if(used.length===n)return {used,score:sum};let k=used.length,best=null;for(let j=0;j<n;j++)if(!used.includes(j)){
 let candidate=dfs([...used,j],sum+dot(norm(sub(pts[v],pts[B[I[k]].a])),norm(sub(pts[B[O[j]].b],pts[v]))));
 if(!best||candidate.score>best.score)best=candidate;}return best;};
 const best=dfs();
 for(let k=0;k<n;k++)transitions.set(I[k],O[best.used[k]]);
}
const visited=new Set(),loops=[],open=[];
for(let s=0;s<B.length;s++){if(visited.has(s))continue;let curr=s,edgesCycle=[],chain=[],safety=0;while(!visited.has(curr)&&safety++<B.length+2){visited.add(curr);edgesCycle.push(curr);chain.push(B[curr].a);curr=transitions.get(curr);if(curr===undefined)break;}if(curr===s)loops.push({vertices:chain,edgeIds:edgesCycle});else open.push({s,edges:edgesCycle.length,at:curr});}

function splitAtRepeat(l){for(let i=0;i<l.vertices.length;i++)for(let j=i+1;j<l.vertices.length;j++){if(l.vertices[i]===l.vertices[j]){let a={vertices:l.vertices.slice(i,j),edgeIds:l.edgeIds.slice(i,j)},b={vertices:l.vertices.slice(j).concat(l.vertices.slice(0,i)),edgeIds:l.edgeIds.slice(j).concat(l.edgeIds.slice(0,i))};return [...splitAtRepeat(a),...splitAtRepeat(b)];}}return[l];}
const simpleLoops=loops.flatMap(splitAtRepeat);
let summary=simpleLoops.map((l,i)=>{let ps=l.vertices.map(v=>pts[v]),centroid=[0,1,2].map(j=>ps.reduce((s,p)=>s+p[j],0)/ps.length),box=[0,1,2].map(j=>[Math.min(...ps.map(p=>p[j])),Math.max(...ps.map(p=>p[j]))]),perimeter=l.vertices.reduce((s,v,k)=>s+Math.hypot(...sub(pts[v],pts[l.vertices[(k+1)%l.vertices.length]])),0);
 const area=([a,b])=>{let z=0;for(let j=0;j<ps.length;j++){let p=ps[j],q=ps[(j+1)%ps.length];z+=p[a]*q[b]-p[b]*q[a]}return z/2};
 return {loop:i,n:l.vertices.length,center:centroid,box,perimeter,areaXY:area([0,1]),areaXZ:area([0,2]),areaYZ:area([1,2]),triSrc:[...new Set(l.edgeIds.map(id=>B[id].ref.cat))],vertices:l.vertices.slice(0,50)};
});
fs.writeFileSync(path.join(root,'rev96-r23-boundary-loop-plan-v3.json'),JSON.stringify({B,loops:simpleLoops,summary,bad,open},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({count:simpleLoops.length,boundary:B.length,bad,open,summary},null,2));
