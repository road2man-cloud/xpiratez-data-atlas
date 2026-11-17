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
const scenarios={r22All:()=>true,skipCoreInner:f=>f.cat!=='coreInner',skipCoreWall:f=>f.cat!=='coreWall',skipCoreBacking:f=>!['coreInner','coreWall'].includes(f.cat),dropShellP22:f=>!['coreInner','coreWall','p22'].includes(f.cat),dropShellP22P21:f=>!['coreInner','coreWall','p22','p21'].includes(f.cat),removeCollar:f=>f.cat!=='p23',skinExceptCore:f=>f.cat!=='coreOuter'&&f.cat!=='coreInner'&&f.cat!=='coreWall',bodyPlusCoreAndCollar:f=>[0,13,23].includes(f.pi),coreOuterCollar:f=>['coreOuter','p23'].includes(f.cat),bodyAndCollar:f=>['p0','p23'].includes(f.cat)};
let results={summary:{},multiple:[],boundary:[],faces:faces.length};
for(let [name,filter] of Object.entries(scenarios)){let sel=faces.filter(filter),E=edges(sel),bad=[...E.values()].filter(e=>e.refs.length>2),bdr=[...E.values()].filter(e=>e.refs.length===1),wrong=[...E.values()].filter(e=>e.refs.length===2&&e.refs[0].dir===e.refs[1].dir);
let bySources={};for(let e of bad){let k=e.refs.map(r=>r.cat).sort().join('+');bySources[k]=(bySources[k]||0)+1}
let bdrSources={};for(let e of bdr){let k=e.refs[0].cat;bdrSources[k]=(bdrSources[k]||0)+1}
results.summary[name]={faces:sel.length,boundary:bdr.length,boundaryCenter:bdr.filter(center).length,multiple:bad.length,wrong:wrong.length,badSources:bySources,bdrSources};
if(name==='r22All'){results.multiple=bad.map(e=>({pts:[pts[e.a],pts[e.b]],refs:e.refs,center:center(e)}));results.boundary=bdr.map(e=>({pts:[pts[e.a],pts[e.b]],refs:e.refs,center:center(e)}))}}
fs.writeFileSync(path.join(root,'rev96-r23-preflight-topology-v2.json'),JSON.stringify(results,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(results.summary,null,2));