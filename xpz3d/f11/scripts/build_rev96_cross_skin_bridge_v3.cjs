'use strict';
// XPZ3D F11 rev96: cautious cross-primitive skin seam, 13(anatomy) -> 17/18(lateral skin).
// Produces independent GLB candidates. Does NOT restore excised triangles, modify 13,
// sew closed loops, or touch garment primitives. Every added vertex receives skin joints,
// normalized weights, UV and base/open55 morph data; every added triangle joins a side boundary.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname;
const kind=process.argv.includes('--smooth')?'smooth':'minimal';
const pth=process.argv.find((x,i)=>i>1&&!x.startsWith('--'))||path.join(root,'interim-recovered-r21AO-F11-manual-sculpt-rev96-interim-base.glb');
const tag=path.basename(pth).startsWith('interim-recovered-')?'interim-skin':(path.basename(pth).startsWith('qa-')?'qa-cross-skin':'user-cross-skin');
const out=path.join(root,tag+'-rev96-'+kind+'-r3.glb');
if(fs.existsSync(out))throw Error('Refuse overwrite '+out);
const raw=fs.readFileSync(pth),gl=JSON.parse(raw.toString('utf8',20,20+raw.readUInt32LE(12)));
const bi=28+raw.readUInt32LE(12);let bin=Buffer.from(raw.subarray(bi,bi+raw.readUInt32LE(20+raw.readUInt32LE(12))));
const dimensions={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},sizes={5121:1,5123:2,5125:4,5126:4};
const originals=gl.meshes[0].primitives;
const allTris=originals.reduce((s,p)=>s+gl.accessors[p.indices].count/3,0);
if(gl.skins?.[0]?.joints?.length!==63)throw Error('63 bones required');
if(originals[13].extras?.layer!=='anatomy-skin'||[17,18].some(i=>originals[i].extras?.layer!=='skin'))throw Error('Expected rev92 separated skin primitives missing');
const garmentFaces=originals.reduce((s,p)=>s+(p.extras?.layer==='garment'?gl.accessors[p.indices].count/3:0),0);
if(garmentFaces!==370)throw Error('garment 370 faces not found');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const kedge=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
function readAccessor(id){
 const a=gl.accessors[id],v=gl.bufferViews[a.bufferView],n=dimensions[a.type],sz=sizes[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*sz,rows=[];
 if(!a||!v||!n||!sz)throw Error('Unsupported accessor '+id);
 for(let i=0;i<a.count;i++){
  const x=[];
  for(let j=0;j<n;j++){
   const k=off+i*stride+j*sz;
   x.push(a.componentType===5126?bin.readFloatLE(k):a.componentType===5125?bin.readUInt32LE(k):a.componentType===5123?bin.readUInt16LE(k):bin.readUInt8(k));
  }
  rows.push(n===1?x[0]:x);
 }
 return rows;
}
function addAccessor(rows,oldId){
 const old=gl.accessors[oldId],n=dimensions[old.type],sz=sizes[old.componentType],buffer=Buffer.alloc(rows.length*n*sz);
 for(let i=0;i<rows.length;i++)for(let j=0;j<n;j++){
  const x=n===1?rows[i]:rows[i][j],at=(i*n+j)*sz;
  if(!Number.isFinite(x))throw Error('Invalid accessor value '+old.type+' row '+i);
  switch(old.componentType){case 5126:buffer.writeFloatLE(x,at);break;case 5125:buffer.writeUInt32LE(x,at);break;case 5123:buffer.writeUInt16LE(x,at);break;case 5121:buffer.writeUInt8(x,at);break;default:throw Error('Unsupported comp '+old.componentType);}
 }
 const offset=(bin.length+3)&~3;
 bin=Buffer.concat([bin,Buffer.alloc(offset-bin.length),buffer]);
 const vi=gl.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length})-1;
 const next={bufferView:vi,componentType:old.componentType,type:old.type,count:rows.length};
 if(old.normalized!==undefined)next.normalized=old.normalized;
 if(old.min||old.max){
  for(const name of ['min','max'])if(old[name])next[name]=Array.from({length:n},(_,j)=>name==='min'?Math.min(...rows.map(r=>n===1?r:r[j])):Math.max(...rows.map(r=>n===1?r:r[j])));
 }
 return gl.accessors.push(next)-1;
}
function addIndices(rows,oldId){
 const old=gl.accessors[oldId],max=Math.max(...rows);
 // Preserve the original uint16 index width for WebGL and native consumers.
 const componentType=max<=65535?5123:5125,sz=componentType===5123?2:4;
 const buffer=Buffer.alloc(rows.length*sz);
 for(let i=0;i<rows.length;i++){
  if(componentType===5123)buffer.writeUInt16LE(rows[i],i*sz);
  else buffer.writeUInt32LE(rows[i],i*sz);
 }
 const offset=(bin.length+3)&~3;
 bin=Buffer.concat([bin,Buffer.alloc(offset-bin.length),buffer]);
 const vi=gl.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length})-1;
 return gl.accessors.push({bufferView:vi,componentType,type:'SCALAR',count:rows.length,min:[Math.min(...rows)],max:[max]})-1;
}
const parts=originals.map((p,i)=>{
 const attributes={};for(const [name,id]of Object.entries(p.attributes))attributes[name]=readAccessor(id);
 const targets=(p.targets||[]).map(t=>Object.fromEntries(Object.entries(t).map(([name,id])=>[name,readAccessor(id)])));
 const indices=readAccessor(p.indices),pos=attributes.POSITION;
 const morph=targets[0]?.POSITION||pos.map(()=>[0,0,0]),open=pos.map((v,j)=>v.map((x,k)=>x+morph[j][k]));
 const edgeMap=new Map();
 for(let t=0;t<indices.length;t+=3){for(const [a,b] of [[indices[t],indices[t+1]],[indices[t+1],indices[t+2]],[indices[t+2],indices[t]]]){
  const key=kedge(a,b),r=edgeMap.get(key)||{a,b,count:0,face:t/3};r.count++;edgeMap.set(key,r);
 }}
 const boundary=[...edgeMap.values()].filter(e=>e.count===1);
 return {i,p,attributes,targets,indices,pos,morph,open,boundary};
});
const center=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const diff=(a,b)=>a.map((v,i)=>v-b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const scale=(a,t)=>a.map(v=>v*t);
const length=a=>Math.hypot(...a);
const dist=(a,b)=>length(diff(a,b));
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const norm=a=>{const d=length(a)||1;return a.map(v=>v/d);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const triN=(p,q,r)=>cross(diff(q,p),diff(r,p));
function faceNormal(part,edge,open=false){
 const ids=part.indices.slice(edge.face*3,edge.face*3+3),P=open?part.open:part.pos;
 return norm(triN(...ids.map(id=>P[id])));
}
function vertexWeights(side,sid,central,cid,t){
 const weighted=new Map();
 for(const [p,id,f] of [[side,sid,1-t],[central,cid,t]]){
  const joints=p.attributes.JOINTS_0[id],weights=p.attributes.WEIGHTS_0[id];
  for(let i=0;i<4;i++)weighted.set(joints[i],(weighted.get(joints[i])||0)+weights[i]*f);
 }
 const sorted=[...weighted].sort((a,b)=>b[1]-a[1]).slice(0,4);
 const sum=sorted.reduce((s,p)=>s+p[1],0)||1;
 return {joints:[0,1,2,3].map(i=>sorted[i]?.[0]||0),weights:[0,1,2,3].map(i=>(sorted[i]?.[1]||0)/sum)};
}
function lerp(a,b,t){return Array.isArray(a)?a.map((v,k)=>v*(1-t)+b[k]*t):a*(1-t)+b*t;}
function recalcNormals(pos,idx){
 const res=pos.map(()=>[0,0,0]);
 for(let i=0;i<idx.length;i+=3){const [a,b,c]=idx.slice(i,i+3);
  const n=triN(pos[a],pos[b],pos[c]);
  for(const id of [a,b,c])res[id]=add(res[id],n);
 }
 return res.map(norm);
}
const allAdded=[],reports=[],maxPairs=kind==='minimal'?7:13,limit=kind==='minimal'?.0045:.007;
const central=parts[13];
for(const sideId of [17,18]){
 const side=parts[sideId];
 const cEdges=central.boundary.filter(e=>{
  const [x,y,z]=center(central.pos[e.a],central.pos[e.b]);
  return Math.abs(x)>.016&&Math.abs(x)<.043&&y>-.14&&y<-.045&&z>.855&&z<.945;
 });
 const sEdges=side.boundary.filter(e=>{
  const [x,y,z]=center(side.pos[e.a],side.pos[e.b]);
  return Math.abs(x)>.016&&Math.abs(x)<.043&&y>-.14&&y<-.045&&z>.855&&z<.945;
 });
 const candidates=[],rejected={shared:0,topology:0,pose:0,normal:0,area:0,badEdge:0};
 for(const c of cEdges)for(const s of sEdges){
  // Distinct face edges with no common vertex IDs. Do not duplicate the already
  // coincident lateral part of the anatomy or add an artificial cap.
  if(new Set([c.a,c.b,s.a,s.b]).size!==4){rejected.shared++;continue;}
  const cLen=dist(central.pos[c.a],central.pos[c.b]),sLen=dist(side.pos[s.a],side.pos[s.b]);
  if(cLen<.001||sLen<.001||cLen>.019||sLen>.019||Math.max(cLen,sLen)/Math.min(cLen,sLen)>1.65){rejected.badEdge++;continue;}
  const cMid=center(central.pos[c.a],central.pos[c.b]),sMid=center(side.pos[s.a],side.pos[s.b]);
  if(dist(cMid,sMid)>limit){rejected.pose++;continue;}
  for(const [ca,cb] of [[c.a,c.b],[c.b,c.a]]){
   const d0=dist(side.pos[s.a],central.pos[ca]),d1=dist(side.pos[s.b],central.pos[cb]);
   const p0=dist(side.open[s.a],central.open[ca]),p1=dist(side.open[s.b],central.open[cb]);
   if(Math.min(d0,d1)<.00045||Math.max(d0,d1,p0,p1)>limit){rejected.pose++;continue;}
   const ray0=[side.pos[s.a],side.pos[s.b],central.pos[ca],central.pos[cb]];
   const ray1=[side.open[s.a],side.open[s.b],central.open[ca],central.open[cb]];
   function examine(r,part,edge,pose){
    const A=triN(r[1],r[0],r[2]),B=triN(r[1],r[2],r[3]),ref=faceNormal(part,edge,pose);
    const areas=[length(A)*.5,length(B)*.5];
    const facing=Math.min(dot(norm(A),ref),dot(norm(B),ref));
    const edgeMax=Math.max(dist(r[0],r[1]),dist(r[2],r[3]),dist(r[0],r[2]),dist(r[1],r[3]));
    return {areas,facing,aspect:Math.min(...areas)/(edgeMax*edgeMax)};
   }
   const base=examine(ray0,side,s,false),open=examine(ray1,side,s,true);
   if(Math.min(...base.areas,...open.areas)<1.0e-7||Math.min(base.aspect,open.aspect)<.012){rejected.area++;continue;}
   if(Math.min(base.facing,open.facing)<.12){rejected.normal++;continue;}
   const score=Math.max(d0,d1,p0,p1)+.13*(d0+d1+p0+p1)+.001*(1-Math.min(base.facing,open.facing));
   candidates.push({s,c,ca,cb,d0,d1,p0,p1,score,base,open});
  }
 }
 candidates.sort((a,b)=>a.score-b.score);
 const mapping=new Map(),usedC=new Set(),usedS=new Set(),selected=[];
 for(const cand of candidates){
  if(selected.length>=maxPairs)break;
  const sk=kedge(cand.s.a,cand.s.b),ck=kedge(cand.c.a,cand.c.b);
  if(usedC.has(ck)||usedS.has(sk))continue;
  if((mapping.has(cand.s.a)&&mapping.get(cand.s.a)!==cand.ca)||(mapping.has(cand.s.b)&&mapping.get(cand.s.b)!==cand.cb))continue;
  if([...mapping].some(([a,b])=>(b===cand.ca&&a!==cand.s.a)||(b===cand.cb&&a!==cand.s.b)))continue;
  mapping.set(cand.s.a,cand.ca);mapping.set(cand.s.b,cand.cb);
  usedC.add(ck);usedS.add(sk);selected.push(cand);
 }
 // Preserve original indices; build new triangle strips against existing lateral boundary vertices.
 // Never insert into or overwrite the protected central anatomy primitive.
 const extended=Object.fromEntries(Object.entries(side.attributes).map(([name,rows])=>[name,rows.map(v=>Array.isArray(v)?v.slice():v)]));
 const morphs=side.targets.map(t=>Object.fromEntries(Object.entries(t).map(([name,rows])=>[name,rows.map(v=>Array.isArray(v)?v.slice():v)])));
 const indices=side.indices.slice(),clone=new Map(),middles=new Map(),sideStart=side.pos.length,normalTouched=new Set();
 function getCentralVertex(cid,sid){
  if(clone.has(cid))return clone.get(cid);
  const id=extended.POSITION.length;
  for(const name of Object.keys(extended)){
   let val;
   if(['_TISSUE','_ANATREGION','_ANATCAVITY'].includes(name))val=side.attributes[name]?.[sid]??0;
   else val=central.attributes[name]?.[cid]??side.attributes[name]?.[sid];
   extended[name].push(Array.isArray(val)?val.slice():val);
  }
  for(let t=0;t<morphs.length;t++)for(const name of Object.keys(morphs[t])){
   const val=central.targets[t]?.[name]?.[cid]??side.targets[t][name][sid];
   morphs[t][name].push(Array.isArray(val)?val.slice():val);
  }
  clone.set(cid,id);return id;
 }
 function getMid(sid,cid){
  const key=sid+':'+cid;if(middles.has(key))return middles.get(key);
  const id=extended.POSITION.length,t=.5;
  const Ps=side.pos[sid],Pc=central.pos[cid],ns=side.attributes.NORMAL[sid],nc=central.attributes.NORMAL[cid];
  const gap=diff(Pc,Ps);
  const ts=diff(gap,scale(ns,dot(gap,ns))),tc=diff(gap,scale(nc,dot(gap,nc)));
  let correction=scale(diff(ts,tc),.125);
  const clen=length(correction);if(clen>.00032)correction=scale(correction,.00032/clen);
  for(const name of Object.keys(extended)){
   let val;
   if(name==='POSITION')val=add(lerp(Ps,Pc,t),correction);
   else if(name==='JOINTS_0')val=vertexWeights(side,sid,central,cid,t).joints;
   else if(name==='WEIGHTS_0')val=vertexWeights(side,sid,central,cid,t).weights;
   else if(['_TISSUE','_ANATREGION','_ANATCAVITY'].includes(name))val=side.attributes[name][sid];
   else val=lerp(side.attributes[name][sid],central.attributes[name][cid],t);
   extended[name].push(Array.isArray(val)?val.slice():val);
  }
  for(let k=0;k<morphs.length;k++)for(const name of Object.keys(morphs[k])){
   const val=lerp(side.targets[k][name][sid],central.targets[k][name][cid],t);
   morphs[k][name].push(Array.isArray(val)?val.slice():val);
  }
  middles.set(key,id);return id;
 }
 for(const cand of selected){
  const a=cand.s.a,b=cand.s.b,u=getCentralVertex(cand.ca,a),v=getCentralVertex(cand.cb,b);
  normalTouched.add(a);normalTouched.add(b);
  if(kind==='minimal')indices.push(b,a,u,b,u,v);
  else {
   const m=getMid(a,cand.ca),n=getMid(b,cand.cb);
   indices.push(b,a,m,b,m,n,n,m,u,n,u,v);
  }
  allAdded.push({sidePrimitive:sideId,centralPrimitive:13,sideEdge:[a,b],centralEdge:[cand.ca,cand.cb],newFaces:kind==='minimal'?2:4,gapRest:[cand.d0,cand.d1],gapOpen55:[cand.p0,cand.p1],normalAgreementRest:cand.base.facing,normalAgreement55:cand.open.facing});
 }
 if(selected.length){
  // Smooth shading across both bases and the authored triangles.
  const rest=extended.POSITION,delta=morphs[0].POSITION,posed=rest.map((p,id)=>add(p,delta[id]));
  const NR=recalcNormals(rest,indices),NP=recalcNormals(posed,indices);
  // Local normal update only: untouched skin vertices retain the artist's source normals.
  // This avoids an unrelated global shading change after adding a few seam triangles.
  const formerR=side.attributes.NORMAL,formerMorph=side.targets[0].NORMAL;
  const nextN=extended.NORMAL.map(x=>x.slice()),nextMorph=morphs[0].NORMAL.map(x=>x.slice());
  for(let id=0;id<rest.length;id++){
    if(id>=sideStart){
      nextN[id]=NR[id];
      nextMorph[id]=diff(NP[id],NR[id]);
    } else if(normalTouched.has(id)){
      const d=kind==='smooth'?.55:.35;
      const r=norm(add(scale(formerR[id],1-d),scale(NR[id],d)));
      const oldOpen=norm(add(formerR[id],formerMorph[id]));
      const n=norm(add(scale(oldOpen,1-d),scale(NP[id],d)));
      nextN[id]=r;nextMorph[id]=diff(n,r);
    }
  }
  extended.NORMAL=nextN;morphs[0].NORMAL=nextMorph;
  for(const [name,rows]of Object.entries(extended)){
   side.p.attributes[name]=addAccessor(rows,side.p.attributes[name]);
  }
  for(let t=0;t<morphs.length;t++)for(const [name,rows]of Object.entries(morphs[t])){
   side.p.targets[t][name]=addAccessor(rows,side.p.targets[t][name]);
  }
  side.p.indices=addIndices(indices,side.p.indices);
  side.p.extras={...side.p.extras,rev96CrossPrimitiveSeam:kind,rev96SeamFaces:indices.length/3-side.indices.length/3,rev96RetainedCentralAnatomy:true};
 }
 reports.push({sidePrimitive:sideId,candidatePairs:candidates.length,selectedPairs:selected.length,rejected,appendedVertices:extended.POSITION.length-sideStart,seamFaces:indices.length/3-side.indices.length/3});
}
const addedFaces=allAdded.reduce((s,r)=>s+r.newFaces,0),finalTris=originals.reduce((s,p)=>s+gl.accessors[p.indices].count/3,0);
if(finalTris!==allTris+addedFaces)throw Error('Triangle count mismatch');
if(originals.filter(p=>p.extras?.layer==='garment').reduce((s,p)=>s+gl.accessors[p.indices].count/3,0)!==370)throw Error('Garment changed');
gl.extras={...gl.extras,revision:'rev96-experimental-cross-skin-r3-'+kind,inputSha256:sha(raw),qaFixture:tag.startsWith('qa'),recoveredSculptOnly:tag==='interim-skin',addedFaces,centralAnatomyUntouched:true,garmentUntouched:true,bones:63};
gl.buffers[0].byteLength=bin.length;
const J=Buffer.from(JSON.stringify(gl)),jp=Buffer.concat([J,Buffer.alloc((4-J.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const h=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jp.length+8+bp.length,8);jh.writeUInt32LE(jp.length);jh.write('JSON',4);bh.writeUInt32LE(bp.length);bh.write('BIN\0',4);
const result=Buffer.concat([h,jh,jp,bh,bp]);
fs.writeFileSync(out,result,{flag:'wx'});
const manifest={status:addedFaces?'experimental-real-bridge-candidate-not-visual-approved':'no-bridge-selected',source:pth,out,sha256:sha(result),poseChecks:[0,25,40,55],inputIsFinalUserTrim:tag==='user-cross-skin',interimSculptOnly:tag==='interim-skin',candidate:kind,bones:63,garmentTriangles:370,trianglesBefore:allTris,trianglesAfter:finalTris,addedFaces,reports,additions:allAdded};
const dest=path.join(root,tag+'-rev96-'+kind+'-r3-bridge-manifest.json');
fs.writeFileSync(dest,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:out,sha256:manifest.sha256,triangles:finalTris,addedFaces,reports},null,2));
