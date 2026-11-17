'use strict';
const fs=require('fs'),path=require('path'),root=__dirname,input='r21AO-F11-user101-native-perineal-r24-soft.glb',raw=fs.readFileSync(path.join(root,input)),jl=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+jl)),bin=raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl)),pp=doc.meshes[0].primitives;
const D={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},SZ={5121:1,5123:2,5125:4,5126:4},OP={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(i){const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],n=D[a.type],s=SZ[a.componentType],o=(v.byteOffset||0)+(a.byteOffset||0),st=v.byteStride||n*s,out=[];for(let j=0;j<a.count;j++){const r=[];for(let k=0;k<n;k++)r.push(bin[OP[a.componentType]](o+j*st+k*s));out.push(n===1?r[0]:r)}return out;}
const roi=[0,13,17,18,21,22,23],scale=100000,keys=new Map(),positions=[],refs=[],faces=[],per=[];let coincident=0;
function virtual(pi,idx,P,D){const p=P[idx],q=D[idx],key=[...p,...q].map(x=>Math.round(x*scale)).join(',');
 let v=keys.get(key);
 if(v===undefined){v=positions.length;keys.set(key,v);positions.push(p);refs.push([]);}else coincident++;
 refs[v].push({pi,id:idx});return v;
}
for(const pi of roi){const p=pp[pi],P=read(p.attributes.POSITION),M=read(p.targets[0].POSITION),I=read(p.indices),map=new Map();
 for(let j=0;j<I.length;j+=3){const x=I.slice(j,j+3).map(id=>{if(!map.has(id))map.set(id,virtual(pi,id,P,M));return map.get(id)});faces.push({pi,x});}
 per.push({pi,faces:I.length/3,uniqueMapped:map.size});
}
const E=new Map();for(const f of faces)for(const [a,b] of [[f.x[0],f.x[1]],[f.x[1],f.x[2]],[f.x[2],f.x[0]]]){
 const key=a<b?a+':'+b:b+':'+a,row=E.get(key)||{a,b,refs:[]};row.refs.push({pi:f.pi,sign:a<b?1:-1});E.set(key,row);
}
const bdr=[...E.values()].filter(e=>e.refs.length===1),multiple=[...E.values()].filter(e=>e.refs.length>2),wrongPairs=[...E.values()].filter(e=>e.refs.length===2&&e.refs[0].sign===e.refs[1].sign);
const centerB=bdr.filter(e=>[e.a,e.b].every(id=>{const p=positions[id];return Math.abs(p[0])<.12&&p[1]>-.18&&p[1]<.125&&p[2]>.80&&p[2]<.97}));
const nb=new Map();for(const e of bdr)for(const [a,b]of[[e.a,e.b],[e.b,e.a]]){const r=nb.get(a)||[];r.push(b);nb.set(a,r);}
const used=new Set(),chains=[],ek=(a,b)=>a<b?a+':'+b:b+':'+a;
for(const e of bdr){if(used.has(ek(e.a,e.b)))continue;let ids=[e.a,e.b],last=e.a,current=e.b;used.add(ek(last,current));
 for(let k=0;k<bdr.length;k++){const next=(nb.get(current)||[]).find(x=>x!==last&&!used.has(ek(current,x)));if(next===undefined)break;ids.push(next);used.add(ek(current,next));last=current;current=next;if(current===ids[0])break;}
 let pts=ids.map(id=>positions[id]),box=[0,1,2].map(k=>[Math.min(...pts.map(p=>p[k])),Math.max(...pts.map(p=>p[k]))]),center=pts[0].map((_,k)=>pts.reduce((s,p)=>s+p[k],0)/pts.length);
 chains.push({n:ids.length-(ids[0]===ids.at(-1)?1:0),closed:ids[0]===ids.at(-1),center,box,ids,dominant:[...new Set(ids.flatMap(id=>refs[id].map(x=>x.pi)))],first:ids.slice(0,20).map(id=>({id,p:positions[id],from:refs[id]}))});
}
const result={input,roi,per,vertices:positions.length,coincident,multiple:multiple.length,wrongPairs:wrongPairs.length,boundaryEdges:bdr.length,centerBoundaryEdges:centerB.length,chains:chains.sort((a,b)=>b.n-a.n),positionRefs:refs,positions};
fs.writeFileSync(path.join(root,'rev96-r24-union-boundary-soft.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({per,vertices:result.vertices,multiple:result.multiple,wrongPairs:result.wrongPairs,boundaryEdges:bdr.length,centerBoundaryEdges:centerB.length,chains:result.chains.map(c=>({n:c.n,closed:c.closed,center:c.center.map(x=>+x.toFixed(4)),box:c.box.map(a=>a.map(x=>+x.toFixed(4))),dominant:c.dominant}))},null,2));
