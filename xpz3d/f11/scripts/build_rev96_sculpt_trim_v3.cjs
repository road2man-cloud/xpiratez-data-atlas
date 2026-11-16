'use strict';
// XPZ3D F11 rev96: exact user snapshot replay, boundary extraction and conservative skin stitching.
// Usage: node build_rev96_trim_seam.cjs <rev95-user-snapshot.json>
// Never fabricates a missing snapshot or restores deleted faces.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const dir=__dirname, web=path.resolve(dir,'../F11_Web_Review_ghpages_20261105/f11/r21al');
const src=path.join(web,'r21AO-F11-skin-separated-rev92-base.glb');
const qaMode=process.argv.includes('--qa');
const sculptOnly=process.argv.includes('--sculpt-only');
if(qaMode&&sculptOnly)throw Error('Choose either QA or sculpt-only');
const expectedDeletes=qaMode?1:(sculptOnly?0:101);
const snapshotPath=process.argv.slice(2).find(x=>!x.startsWith('--'));
if(!snapshotPath||!fs.existsSync(snapshotPath))throw Error('Required 2026-11-16 15:28 user rev95 JSON missing. Pass its path as argument; no substitute allowed.');
const user=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
if(user.schema!=='XPZ3D.F11.ManualSculpt.v1'||path.basename(user.sourceGLB||'')!==path.basename(src))throw Error('Incorrect snapshot schema/source');
if(!user.controls||Object.keys(user.controls).length!==106||!Array.isArray(user.positions)||!Array.isArray(user.deletedFaces)||user.deletedFaces.length!==expectedDeletes)throw Error('Snapshot must contain 106 controls, positions and the required number of removed faces');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=fs.readFileSync(src);
if(source.toString('ascii',0,4)!=='glTF')throw Error('Not GLB');
const jsonLength=source.readUInt32LE(12),base=JSON.parse(source.toString('utf8',20,20+jsonLength));
const binOffset=28+jsonLength,binLen=source.readUInt32LE(20+jsonLength),originalBin=source.subarray(binOffset,binOffset+binLen);
if(base.skins?.[0]?.joints?.length!==63)throw Error('63-bone rig missing');
const primitives=base.meshes[0].primitives;
const origFaces=primitives.reduce((n,p)=>n+base.accessors[p.indices].count/3,0);
if(origFaces!==3647)throw Error('Source triangle count unexpected: '+origFaces);
const types={5120:['getInt8',1],5121:['getUint8',1],5122:['getInt16',2],5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]};
const dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function read(aid){const a=base.accessors[aid],v=base.bufferViews[a.bufferView],size=types[a.componentType][1],method=types[a.componentType][0],dim=dims[a.type],stride=v.byteStride||dim*size,offset=(v.byteOffset||0)+(a.byteOffset||0),dv=new DataView(originalBin.buffer,originalBin.byteOffset,originalBin.byteLength),out=[];
for(let i=0;i<a.count;i++)for(let j=0;j<dim;j++)out.push(dv[method](offset+i*stride+j*size,true));return out;}
const orig=primitives.map(p=>({indices:read(p.indices),pos:read(p.attributes.POSITION),morph:p.targets?.[0]?.POSITION!==undefined?read(p.targets[0].POSITION):null}));
const removal=primitives.map(()=>new Set());
for(const f of user.deletedFaces){let pi=Number(f.primitive),ti=Number(f.triangle??f.face);if(!Number.isInteger(pi)||!orig[pi]||!Number.isInteger(ti)||ti<0||ti>=orig[pi].indices.length/3)throw Error('Invalid removed face ID');const actual=orig[pi].indices.slice(ti*3,ti*3+3);if(Array.isArray(f.vertices)&&actual.join(',')!==f.vertices.join(','))throw Error('Face vertices changed '+pi+':'+ti);if(primitives[pi].extras?.layer==='garment')throw Error('Cannot delete separate clothing faces');if(removal[pi].has(ti))throw Error('Duplicate face');removal[pi].add(ti);}
const edits=primitives.map(()=>new Map());
for(const e of user.positions){const pi=Number(e.primitive),id=Number(e.id);if(!orig[pi]||!Number.isInteger(id)||id<0||id>=orig[pi].pos.length/3||!Array.isArray(e.originalXYZ)||!Array.isArray(e.restXYZ)||!Array.isArray(e.open55XYZ))throw Error('Invalid position');const o=orig[pi].pos.slice(id*3,id*3+3);if(o.some((v,j)=>Math.abs(v-e.originalXYZ[j])>0.00001))throw Error('Position source mismatch '+pi+':'+id);edits[pi].set(id,e);}
const xyz=(P,id)=>P.slice(id*3,id*3+3),dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const faces=orig.map((p,pi)=>{const arr=[];for(let t=0;t<p.indices.length/3;t++)if(!removal[pi].has(t))arr.push(...p.indices.slice(t*3,t*3+3));return arr;});
if(faces.reduce((n,x)=>n+x.length/3,0)!==3647-expectedDeletes)throw Error('Unexpected trimmed total');
const edgeKey=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
function boundaries(I){const edges=new Map();for(let i=0;i<I.length;i+=3){for(const [a,b] of [[I[i],I[i+1]],[I[i+1],I[i+2]],[I[i+2],I[i]]]){const k=edgeKey(a,b),row=edges.get(k)||{a,b,count:0};row.count++;edges.set(k,row);}}
return [...edges.values()].filter(x=>x.count===1);}
const per=orig.map((p,pi)=>{const P=p.pos.slice(),M=p.morph?.slice();for(const [id,e] of edits[pi]){for(let k=0;k<3;k++){P[id*3+k]=e.restXYZ[k];if(M)M[id*3+k]=e.open55XYZ[k]-e.restXYZ[k];}}return {P,M};});
const before=orig.map(p=>boundaries(p.indices));
const after=faces.map(I=>boundaries(I));
function boundaryReport(){return after.map((edges,pi)=>{const old=new Set(before[pi].map(e=>edgeKey(e.a,e.b)));const created=edges.filter(e=>!old.has(edgeKey(e.a,e.b)));const graph=new Map();for(const e of created){for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){if(!graph.has(a))graph.set(a,new Set());graph.get(a).add(b);}}const visited=new Set(),components=[];for(const v of graph.keys()){if(visited.has(v))continue;const queue=[v],vertices=[];visited.add(v);while(queue.length){const x=queue.pop();vertices.push(x);for(const y of graph.get(x))if(!visited.has(y)){visited.add(y);queue.push(y);}}const deg=vertices.map(id=>graph.get(id).size),P=per[pi].P;const bounds=vertices.map(id=>xyz(P,id));components.push({vertices,edgeCount:deg.reduce((a,b)=>a+b,0)/2,closed:deg.every(d=>d===2),length:vertices.length,centroid:[0,1,2].map(k=>bounds.reduce((a,p)=>a+p[k],0)/bounds.length),side:bounds.reduce((a,p)=>a+p[0],0)<0?'left':'right'});}return {primitive:pi,layer:primitives[pi].extras?.layer||'skin',originalBoundaryEdges:before[pi].length,remainingBoundaryEdges:edges.length,newCutEdges:created.length,components};});}
const loops=boundaryReport();
// Minimal joins only opposite newly cut skin edges on the SAME primitive, and never fills a closed anatomical opening.
// Two disjoint boundary edges whose endpoints are close and form non-degenerate two-triangle quads may be linked.
// No long fans, no reconstructed deleted face and no garment geometry.
function stitch(mode){
  const I=faces.map(v=>v.slice()), joined=[], rejected={closed:0,foreign:0,distance:0,normal:0,topology:0};
  const limit=mode==='minimal'?0.004:0.007;
  function unit(v){const l=Math.hypot(...v)||1;return v.map(q=>q/l);}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function triangleNormal(t,P){const a=xyz(P,t[0]),b=xyz(P,t[1]),c=xyz(P,t[2]);return cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i]));}
  for(let pi=0;pi<I.length;pi++){
    const layer=primitives[pi].extras?.layer;
    // The central anatomy, garment and all pre-existing openings are protected.
    if(layer==='garment'||layer==='anatomy-skin'||pi===13)continue;
    const origKeys=new Set(before[pi].map(e=>edgeKey(e.a,e.b)));
    const edges=boundaries(I[pi]).filter(e=>!origKeys.has(edgeKey(e.a,e.b)));
    const adjacency=new Map();
    for(let ei=0;ei<edges.length;ei++)for(const v of [edges[ei].a,edges[ei].b]){if(!adjacency.has(v))adjacency.set(v,[]);adjacency.get(v).push(ei);}
    const compId=new Array(edges.length).fill(-1),components=[];
    for(let i=0;i<edges.length;i++){
      if(compId[i]>=0)continue;
      const queue=[i],group=[],c=components.length;compId[i]=c;
      while(queue.length){const j=queue.pop();group.push(j);for(const v of [edges[j].a,edges[j].b])for(const k of adjacency.get(v)){if(compId[k]<0){compId[k]=c;queue.push(k);}}}
      const vertices=new Set(group.flatMap(j=>[edges[j].a,edges[j].b]));
      const closed=[...vertices].every(v=>adjacency.get(v).length===2);
      const branching=[...vertices].some(v=>adjacency.get(v).length>2);
      components.push({closed,branching,group});
      if(closed)rejected.closed++;
    }
    const P=per[pi].P,baseNormal=normals(P,faces[pi]);
    const forbidden=new Set([...removal[pi]].map(t=>[...orig[pi].indices.slice(t*3,t*3+3)].sort((a,b)=>a-b).join(':')));
    const existing=new Set();
    for(let t=0;t<I[pi].length;t+=3)existing.add([...I[pi].slice(t,t+3)].sort((a,b)=>a-b).join(':'));
    const candidates=[];
    for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
      const ca=components[compId[i]],cb=components[compId[j]];
      // Never cap a cut hole, join a single boundary component to itself,
      // or use a branched/non-manifold cut boundary as stitching support.
      if(compId[i]===compId[j]||ca.closed||cb.closed||ca.branching||cb.branching)continue;
      const a=edges[i],b=edges[j];
      if(new Set([a.a,a.b,b.a,b.b]).size!==4)continue;
      const d0=dist(xyz(P,a.a),xyz(P,b.b)),d1=dist(xyz(P,a.b),xyz(P,b.a));
      if(d0>limit||d1>limit){rejected.distance++;continue;}
      if(dist(xyz(P,a.a),xyz(P,a.b))>0.016||dist(xyz(P,b.a),xyz(P,b.b))>0.016)continue;
      const triangles=[[a.b,a.a,b.b],[a.b,b.b,b.a]];
      const ns=triangles.map(t=>triangleNormal(t,P));
      const area=ns.map(n=>Math.hypot(...n)*0.5);
      if(Math.min(...area)<2e-8)continue;
      const maxEdge=Math.max(dist(xyz(P,a.a),xyz(P,a.b)),dist(xyz(P,b.a),xyz(P,b.b)),d0,d1);
      if(Math.min(...area)/(maxEdge*maxEdge)<0.025)continue;
      const ids=triangles.map(t=>t.slice().sort((x,y)=>x-y).join(':'));
      if(ids.some(id=>forbidden.has(id)||existing.has(id))){rejected.topology++;continue;}
      const avg=unit([a.a,a.b,b.a,b.b].reduce((acc,id)=>acc.map((v,k)=>v+baseNormal[id*3+k]),[0,0,0]));
      if(ns.some(n=>{const u=unit(n);return u.reduce((x,v,k)=>x+v*avg[k],0)<0.10;})){rejected.normal++;continue;}
      candidates.push({i,j,triangles,score:d0+d1,ids,sourceEdges:[[a.a,a.b],[b.a,b.b]]});
    }
    candidates.sort((a,b)=>a.score-b.score);
    const used=new Set();
    for(const cand of candidates){
      if(used.has(cand.i)||used.has(cand.j))continue;
      if(cand.ids.some(id=>existing.has(id)||forbidden.has(id)))continue;
      I[pi].push(...cand.triangles.flat());used.add(cand.i);used.add(cand.j);
      cand.ids.forEach(id=>existing.add(id));
      joined.push({primitive:pi,edges:cand.sourceEdges,added:2,score:cand.score});
    }
  }
  return {I,joined,rejected};
}
const minimal=stitch('minimal'),smooth=stitch('smooth');
function normals(P,I){const N=new Array(P.length).fill(0);for(let t=0;t<I.length;t+=3){let [a,b,c]=I.slice(t,t+3).map(x=>x*3);const x=P[b]-P[a],y=P[b+1]-P[a+1],z=P[b+2]-P[a+2],u=P[c]-P[a],v=P[c+1]-P[a+1],w=P[c+2]-P[a+2],n=[y*w-z*v,z*u-x*w,x*v-y*u];for(const id of [a,b,c])for(let k=0;k<3;k++)N[id+k]+=n[k];}for(let i=0;i<N.length;i+=3){const l=Math.hypot(N[i],N[i+1],N[i+2])||1;for(let k=0;k<3;k++)N[i+k]/=l;}return N;}
function emit(name,I,kind,joined){const doc=JSON.parse(JSON.stringify(base));let bin=Buffer.from(originalBin);function append(data,type){const count=data.length/(type==='VEC3'?3:1),buf=Buffer.alloc(data.length*4);for(let i=0;i<data.length;i++)type==='VEC3'?buf.writeFloatLE(data[i],i*4):buf.writeUInt32LE(data[i],i*4);const pos=(bin.length+3)&~3;bin=Buffer.concat([bin,Buffer.alloc(pos-bin.length),buf]);const view=doc.bufferViews.push({buffer:0,byteOffset:pos,byteLength:buf.length})-1;const accessor={bufferView:view,componentType:type==='VEC3'?5126:5125,count,type};if(type==='SCALAR'){accessor.min=[Math.min(...data)];accessor.max=[Math.max(...data)];}else{accessor.min=[0,1,2].map(k=>Math.min(...Array.from({length:count},(_,i)=>data[i*3+k])));accessor.max=[0,1,2].map(k=>Math.max(...Array.from({length:count},(_,i)=>data[i*3+k])));}return doc.accessors.push(accessor)-1;}
const keep=[];for(let pi=0;pi<I.length;pi++){const ids=I[pi];if(!ids.length)continue;const p=doc.meshes[0].primitives[pi],{P,M}=per[pi],changed=edits[pi].size>0||ids.length!==orig[pi].indices.length||joined.some(x=>x.primitive===pi);if(changed){p.indices=append(ids,'SCALAR');p.attributes.POSITION=append(P,'VEC3');if(M&&p.targets?.[0])p.targets[0].POSITION=append(M,'VEC3');if(p.attributes.NORMAL!==undefined){const N=normals(P,ids);p.attributes.NORMAL=append(N,'VEC3');if(M&&p.targets?.[0]){const next=normals(P.map((v,i)=>v+M[i]),ids);p.targets[0].NORMAL=append(next.map((v,i)=>v-N[i]),'VEC3');}}}keep.push(p);}
doc.meshes[0].primitives=keep;doc.buffers[0].byteLength=bin.length;doc.extras={...doc.extras,revision:'rev96-'+kind,sourceSha256:sha(source),userInputSha256:sha(fs.readFileSync(snapshotPath)),deletedFaces:expectedDeletes,seamFacesAdded:joined.length*2,rigPreserved:63,garmentSeparated:true};
const jb=Buffer.from(JSON.stringify(doc)),jp=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]),h=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jp.length+8+bp.length,8);jh.writeUInt32LE(jp.length);jh.write('JSON',4);bh.writeUInt32LE(bp.length);bh.write('BIN\0',4);const out=Buffer.concat([h,jh,jp,bh,bp]),dest=path.join(dir,name);fs.writeFileSync(dest,out,{flag:'wx'});return {file:dest,sha256:sha(out),triangles:I.reduce((n,i)=>n+i.length/3,0),seamTriangles:joined.length*2,bones:doc.skins[0].joints.length};}
function json(name,data){fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});}
const prefix=qaMode?'qa-single-face-':(sculptOnly?'interim-recovered-':'');
const glbNames=sculptOnly?['r21AO-F11-manual-sculpt-rev96-interim-base.glb','r21AO-F11-seam-rev96-interim-minimal.glb','r21AO-F11-seam-rev96-interim-smooth.glb']:['r21AO-F11-user-trim-rev96-base.glb','r21AO-F11-trim-bridge-rev96-minimal.glb','r21AO-F11-trim-bridge-rev96-smooth.glb'];
const outputs=[emit(prefix+glbNames[0],faces,'base',[]),emit(prefix+glbNames[1],minimal.I,'minimal',minimal.joined),emit(prefix+glbNames[2],smooth.I,'smooth',smooth.joined)];
json(prefix+'rev96-boundary-loops.json',{source:src,sourceSha256:sha(source),userInput:snapshotPath,loops});
json(prefix+'rev96-triangle-diff.json',{original:3647,deleted:expectedDeletes,trimmed:3647-expectedDeletes,minimal:outputs[1].triangles,smooth:outputs[2].triangles,minimalBridges:minimal.joined,smoothBridges:smooth.joined,blocked:{minimal:minimal.rejected,smooth:smooth.rejected},policy:'no closed component cap; no central anatomy; no garment; no deleted original face'});
json(prefix+'REV96_LATEST_CANDIDATE.json',{status:qaMode?'qa-fixture-not-user-trim':(sculptOnly?'interim-recovered-sculpt-no-user-trim':'generated-not-visual-approved'),source:src,userInput:snapshotPath,outputs,reviewStatus:'requires 0/25/40/55 pose review',noAutomaticOpeningFill:true,controlsRetained:106,positionsRetained:user.positions.length,expectedDeletedFaces:expectedDeletes,interimRecovery:sculptOnly});
console.log(JSON.stringify(outputs,null,2));
