'use strict';
/* For r8: non-destructive boundary atlas for canonical user101 and r7.
   Includes open-edge loops and nearest boundary-to-boundary / surface distances at rest and open55.
*/
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const files=['r21AO-F11-user-trim-rev96-base.glb','r21AO-F11-user101-perineum-lowpoly-r7.glb'];
const out=[];
for(const file of files){
 const raw=fs.readFileSync(path.join(__dirname,file)),jl=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+jl)),bin=raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl));
 const m={5121:['readUInt8',1],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]};
 const N={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
 function read(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],dim=N[a.type],sz=m[a.componentType][1],f=m[a.componentType][0],ofs=(v.byteOffset||0)+(a.byteOffset||0),step=v.byteStride||sz*dim,arr=[];for(let i=0;i<a.count;i++){const vals=[];for(let j=0;j<dim;j++)vals.push(bin[f](ofs+i*step+j*sz));arr.push(dim===1?vals[0]:vals)}return arr;}
 const p=doc.meshes[0].primitives.map((prim,pi)=>{
  const I=read(prim.indices),P=read(prim.attributes.POSITION),M=prim.targets?.[0]?.POSITION!==undefined?read(prim.targets[0].POSITION):P.map(()=>[0,0,0]),Q=P.map((v,id)=>v.map((x,k)=>x+M[id][k]));
  const edges=new Map(),nbr=new Map();
  for(let i=0;i<I.length;i+=3)for(const [a,b] of [[I[i],I[i+1]],[I[i+1],I[i+2]],[I[i+2],I[i]]]){
   const key=a<b?a+':'+b:b+':'+a,row=edges.get(key)||{a,b,n:0,face:i/3};row.n++;edges.set(key,row);
  }
  const border=[...edges.values()].filter(e=>e.n===1);
  for(const e of border){for(const [a,b]of[[e.a,e.b],[e.b,e.a]]){const list=nbr.get(a)||[];list.push(b);nbr.set(a,list)}}
  const vis=new Set(),loops=[];
  for(const e of border){
   const key=(a,b)=>a<b?a+':'+b:b+':'+a;
   if(vis.has(key(e.a,e.b)))continue;
   const vertices=[e.a,e.b];vis.add(key(e.a,e.b));
   let prev=e.a,current=e.b;
   for(let i=0;i<border.length+2;i++){
    const options=nbr.get(current)||[];
    const next=options.find(b=>b!==prev&&!vis.has(key(current,b)));
    if(next===undefined)break;
    vis.add(key(current,next));vertices.push(next);
    prev=current;current=next;if(current===vertices[0])break;
   }
   const closed=vertices.at(-1)===vertices[0];
   const pts=vertices.map(id=>P[id]),centroid=[0,1,2].map(k=>pts.reduce((s,p)=>s+p[k],0)/pts.length);
   const bounds=[0,1,2].map(k=>[Math.min(...pts.map(p=>p[k])),Math.max(...pts.map(p=>p[k]))]);
   const perimeter=vertices.slice(1).reduce((s,id,i)=>s+Math.hypot(...P[id].map((x,k)=>x-P[vertices[i]][k])),0);
   const center55=[0,1,2].map(k=>vertices.reduce((s,id)=>s+Q[id][k],0)/vertices.length);
   loops.push({id:loops.length,closed,n:vertices.length-(closed?1:0),vertices,centroid:centroid.map(v=>+v.toFixed(5)),bounds:bounds.map(x=>x.map(v=>+v.toFixed(5))),center55:center55.map(v=>+v.toFixed(5)),perimeter:+perimeter.toFixed(5)});
  }
  return {pi,type:prim.extras?.name||prim.extras?.type,layer:prim.extras?.layer,faces:I.length/3,borderEdges:border.length,loops,
          positions:P,open55:Q,borderVertices:[...new Set(border.flatMap(e=>[e.a,e.b]))]};
 });
 const keyParts=[0,13,17,18,21,22].filter(id=>p[id]);
 const close=[];
 for(const ai of keyParts)for(const bi of keyParts){
  if(ai>=bi)continue;
  const a=p[ai],b=p[bi],rows=[];
  for(const id of a.borderVertices){
   const at=a.positions[id],aq=a.open55[id];
   if(Math.abs(at[0])>.22||at[2]<.76||at[2]>.99)continue;
   let best={d:100};
   for(const other of b.borderVertices){
    const bt=b.positions[other],bq=b.open55[other],dist=Math.hypot(...at.map((x,k)=>x-bt[k])),dist55=Math.hypot(...aq.map((x,k)=>x-bq[k]));
    const score=Math.max(dist,dist55);
    if(score<best.d)best={id:other,d:score,rest:dist,open55:dist55,p:bt};
   }
   if(best.d<.035)rows.push({from:id,to:best.id,d:+best.d.toFixed(5),dRest:+best.rest.toFixed(5),d55:+best.open55.toFixed(5),fromP:at.map(x=>+x.toFixed(4)),toP:best.p.map(x=>+x.toFixed(4))});
  }
  rows.sort((x,y)=>x.d-y.d);
  close.push({pair:[ai,bi],within3mm:rows.filter(x=>x.d<.003).length,within8mm:rows.filter(x=>x.d<.008).length,within20mm:rows.filter(x=>x.d<.020).length,rows:rows.slice(0,28)});
 }
 const detail={file,sha256:crypto.createHash('sha256').update(raw).digest('hex'),parts:p.map(x=>({pi:x.pi,type:x.type,layer:x.layer,faces:x.faces,borderEdges:x.borderEdges,loops:x.loops.map(l=>({id:l.id,closed:l.closed,n:l.n,centroid:l.centroid,bounds:l.bounds,center55:l.center55,perimeter:l.perimeter,vertices:l.vertices}))})),closeness:close};
 out.push(detail);
 console.log(JSON.stringify({file,parts:detail.parts.filter(x=>keyParts.includes(x.pi)).map(x=>({pi:x.pi,faces:x.faces,openEdges:x.borderEdges,loops:x.loops.map(l=>({id:l.id,closed:l.closed,n:l.n,center:l.centroid,bounds:l.bounds,perim:l.perimeter}))})),pairs:close.map(x=>({pair:x.pair,within3mm:x.within3mm,within8mm:x.within8mm,within20mm:x.within20mm,rows:x.rows.slice(0,5)}))},null,2));
}
fs.writeFileSync(path.join(__dirname,'rev96-r8-boundary-atlas.json'),JSON.stringify(out,null,2)+'\n',{flag:'wx'});
