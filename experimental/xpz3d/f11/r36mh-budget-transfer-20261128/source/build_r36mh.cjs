'use strict';
/**
 * R36MH: REAL triangle-budget transfer while keeping 2100 total triangles.
 * Every safe interior-edge collapse removes exactly TWO body triangles;
 * every selected contour-face centroid split replaces 1 triangle by 3,
 * adding TWO. Unlike R36MG this changes actual face allocation by region.
 *
 * Rig invariant: original skin 63 joints, each new vertex interpolates
 * JOINTS_0/WEIGHTS_0 with top-4 normalized influences. No Python.
 *
 * New source: R36MG_ART_DENSE...COMPACT_FULL.glb, etc.
 * node build_r36mh.cjs SOURCE.glb OUTPUT_DIR [12] [strong|guarded]
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,values,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const ref=require('../../r36mc-landmark-sculpt-20261128/source/landmark_hypothesis.json');
const ensure=(x,m)=>{if(!x)throw Error(m)};
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),len=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{let n=len(a);return n>1e-12?mul(a,1/n):[0,0,1]};
const avg=pts=>pts.reduce((s,p)=>add(s,mul(p,1/pts.length)),pts[0].map(()=>0));
const key=p=>p.map(x=>Math.round(x*100000)).join(':');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fmap=ref.mapping,rect=fmap.sourceRect,bounds=fmap.targetBindRegion;
const curves=ref.features.map(f=>({...f,bind:f.points.map(p=>[
 bounds.xMin+(p[0]-rect.left)/(rect.right-rect.left)*(bounds.xMax-bounds.xMin),
 bounds.zTop-(p[1]-rect.top)/(rect.bottom-rect.top)*(bounds.zTop-bounds.zBottom)
])}));
function distanceToSegment(p,a,b) {
 const ab=sub(b,a),projection=clamp(dot(sub(p,a),ab)/Math.max(dot(ab,ab),1e-15));
 const closest=add(a,mul(ab,projection));
 return {distance:len(sub(p,closest)),closest};
}
function featureAt(p) {
 let best={distance:Infinity,feature:null,closest:null};
 for(const f of curves)for(let i=1;i<f.bind.length;i++){
  const hit=distanceToSegment([p[0],p[2]],f.bind[i-1],f.bind[i]);
  if(hit.distance<best.distance)best={distance:hit.distance,feature:f,closest:hit.closest};
 }
 return best;
}
function relief(p){
 let out=0;
 for(const f of curves){
  let d=Infinity;for(let i=1;i<f.bind.length;i++){
   d=Math.min(d,distanceToSegment([p[0],p[2]],f.bind[i-1],f.bind[i]).distance);
  }
  const fine=Math.max(.0045,(f.width||.015)*.44);
  // Low amplitude differential of existing hand-annotated features, not
  // photograph-measured depth.
  out+=f.depth*Math.exp(-.5*(d/fine)**2)*.34;
 }
 return clamp(out,-.009,.009);
}
function a3(f){const p=f.v.map(v=>v.p);return .5*len(cross(sub(p[1],p[0]),sub(p[2],p[0])))}
function faceNormal(f){const p=f.v.map(v=>v.p);return unit(cross(sub(p[1],p[0]),sub(p[2],p[0])))}
function cloneEntry(e){return {p:e.p.slice(),n:e.n.slice(),t:e.t.slice(),uv:e.uv.slice(),
 j:e.j.slice(),w:e.w.slice(),col:e.col?e.col.slice():null};}
function blendSkin(entries,weights){
 const js=new Map();
 entries.forEach((e,i)=>e.j.forEach((joint,k)=>{
  js.set(joint,(js.get(joint)||0)+weights[i]*e.w[k]);
 }));
 const top=[...js].sort((a,b)=>b[1]-a[1]).slice(0,4);
 const sum=top.reduce((s,x)=>s+x[1],0);
 while(top.length<4)top.push([0,0]);
 return {j:top.map(x=>x[0]),w:top.map(x=>x[1]/Math.max(sum,1e-12))};
}
function blendEntry(entries,weights){
 const w=weights,total=w.reduce((s,x)=>s+x,0),nw=w.map(x=>x/total);
 const skin=blendSkin(entries,nw);
 const n=unit(entries.reduce((a,e,i)=>add(a,mul(e.n,nw[i])),[0,0,0]));
 let t=unit(entries.reduce((a,e,i)=>add(a,mul(e.t.slice(0,3),nw[i])),[0,0,0]));
 t=unit(sub(t,mul(n,dot(n,t))));
 const col=entries[0].col?entries[0].col.map((_,k)=>entries.reduce((s,e,i)=>s+nw[i]*e.col[k],0)):null;
 return {p:entries.reduce((a,e,i)=>add(a,mul(e.p,nw[i])),[0,0,0]),
  n,t:[...t,entries[0].t[3]<0?-1:1],
  uv:entries.reduce((a,e,i)=>add(a,mul(e.uv,nw[i])),[0,0]),
  j:skin.j,w:skin.w,col};
}
function originalFaces(mesh) {
 const faces=[];
 for(let i=0;i<mesh.indices.length;i+=3){
  const v=mesh.indices.slice(i,i+3).map(id=>({
   p:mesh.positions[id].slice(),n:mesh.normals[id].slice(),t:mesh.tangents[id].slice(),
   uv:mesh.uvs[id].slice(),j:mesh.joints[id].slice(),w:mesh.weights[id].slice(),
   col:mesh.colors?mesh.colors[id].slice():null
  }));
  faces.push({v,id:i/3,parent:i/3,op:'original'});
 }
 return faces;
}
function graph(faces){
 const vertices=new Map(),edges=new Map();
 for(let fi=0;fi<faces.length;fi++){
  const f=faces[fi],ks=f.v.map(e=>key(e.p));
  for(let k=0;k<3;k++){
   const a=ks[k],b=ks[(k+1)%3],c=ks[(k+2)%3];
   if(a===b)continue;
   if(!vertices.has(a))vertices.set(a,{e:f.v[k],near:new Set(),faces:new Set(),boundary:false});
   if(!vertices.has(b))vertices.set(b,{e:f.v[(k+1)%3],near:new Set(),faces:new Set(),boundary:false});
   vertices.get(a).near.add(b);vertices.get(b).near.add(a);
   vertices.get(a).faces.add(fi);vertices.get(b).faces.add(fi);
   const ek=[a,b].sort().join('|');
   if(!edges.has(ek))edges.set(ek,[]);
   edges.get(ek).push({face:fi,opposite:c});
  }
 }
 for(const [ek,owners] of edges)if(owners.length===1){
  const [a,b]=ek.split('|');vertices.get(a).boundary=true;vertices.get(b).boundary=true;
 }
 return {vertices,edges};
}
function protectedSurface(p){
 return Math.abs(p[0])<.112&&p[2]>.727&&p[2]<.974&&p[1]<-.025;
}
function planCollapse(faces,G){
 const candidates=[];
 for(const [edge,owners] of G.edges){
  if(owners.length!==2)continue;
  const [ka,kb]=edge.split('|'),u=G.vertices.get(ka),v=G.vertices.get(kb);
  if(!u||!v||u.boundary||v.boundary)continue;
  const both=[...u.near].filter(k=>v.near.has(k));
  if(both.length!==2||new Set(owners.map(o=>o.opposite)).size!==2||
      !owners.every(o=>both.includes(o.opposite)))continue;
  const pa=u.e.p,pb=v.e.p,center=mul(add(pa,pb),.5),distance=len(sub(pa,pb));
  if(distance>.070||protectedSurface(pa)||protectedSurface(pb)||protectedSurface(center))continue;
  if(Math.abs(pa[1]-pb[1])>.021)continue;
  const bend=dot(faceNormal(faces[owners[0].face]),faceNormal(faces[owners[1].face]));
  if(bend<.86)continue;
  const skin=blendSkin([u.e,v.e],[.5,.5]);
  const trial=blendEntry([u.e,v.e],[.5,.5]);
  trial.j=skin.j;trial.w=skin.w;
  const impacted=new Set([...u.faces,...v.faces]);
  const removed=new Set(owners.map(o=>o.face));
  let valid=true,worstRatio=Infinity,worstDot=1,weightChange=0;
  for(const fi of impacted){
   if(removed.has(fi))continue;
   const old=faces[fi],now={v:old.v.map(e=>{
    const k=key(e.p);return k===ka||k===kb?{...e,p:trial.p,j:trial.j,w:trial.w}:e;
   })};
   const ks=now.v.map(e=>key(e.p));
   if(new Set(ks).size!==3){valid=false;break}
   const ratio=a3(now)/Math.max(a3(old),1e-14),cos=dot(faceNormal(old),faceNormal(now));
   worstRatio=Math.min(worstRatio,ratio);worstDot=Math.min(worstDot,cos);
   if(ratio<.52||cos<.78){valid=false;break}
  }
  if(!valid)continue;
  for(const e of [u.e,v.e]){
   const a=new Map(e.j.map((j,i)=>[j,e.w[i]]));
   for(let i=0;i<4;i++)weightChange+=Math.abs((a.get(trial.j[i])||0)-trial.w[i]);
  }
  if(weightChange>2.0)continue;
  const planarity=(bend-.86)/.14;
  const score=1/(.005+distance)*(.5+.5*planarity) * (.6+.4*clamp(worstRatio,.1,1));
  candidates.push({ka,kb,center:trial.p,entry:trial,removed:[...removed],
   score,edgeLength:distance,impacted:[...impacted],worstRatio,worstDot,skinWeightDelta:weightChange});
 }
 candidates.sort((a,b)=>b.score-a.score);
 return candidates;
}
function collapse(faces,plan){
 const removed=new Set(plan.removed);
 const edited=[];
 for(let i=0;i<faces.length;i++){
  if(removed.has(i))continue;
  const f=faces[i];
  const v=f.v.map(e=>{
   const k=key(e.p);
   if(k!==plan.ka&&k!==plan.kb)return e;
   return {...cloneEntry(e),p:plan.entry.p.slice(),j:plan.entry.j.slice(),w:plan.entry.w.slice()};
  });
  edited.push(v.some((e,k)=>e!==f.v[k])?{...f,v,op:'donor_neighbor'}:f);
 }
 ensure(faces.length-edited.length===2,'edge collapse must remove exactly two triangles');
 return edited;
}
function scoreTarget(f){
 const p=avg(f.v.map(e=>e.p)),feat=featureAt(p),area=a3(f),maxZ=bounds.zTop,minZ=bounds.zBottom;
 if(Math.abs(p[0])>.096||p[2]<minZ+.015||p[2]>maxZ-.012||p[1]>-.035)return 0;
 if(area<.000006||feat.distance>.040)return 0;
 const curve=Math.exp(-.5*(feat.distance/.022)**2);
 return curve*Math.sqrt(area)*Math.max(.1,1-clamp(feat.distance/.045));
}
function chooseTarget(faces,n){
 const arr=faces.map((f,i)=>({i,score:scoreTarget(f)})).filter(x=>x.score>0);
 arr.sort((a,b)=>b.score-a.score);
 return arr.slice(0,n);
}
function split(faces,candidates,strength){
 const idx=new Set(candidates.map(x=>x.i)),out=[],reports=[];
 for(let fi=0;fi<faces.length;fi++){
  const f=faces[fi];
  if(!idx.has(fi)){out.push(f);continue}
  const midpoint=blendEntry(f.v,[1,1,1]),base=avg(f.v.map(e=>e.p));
  const val=relief(base)-f.v.reduce((s,e)=>s+relief(e.p)/3,0);
  let amplitude=clamp(val*strength,-.0045,.0045),chosen=null;
  for(let attempt=0;attempt<8;attempt++){
   const center=cloneEntry(midpoint);center.p[1]+=amplitude;
   const parts=[[f.v[0],f.v[1],center],[f.v[1],f.v[2],center],[f.v[2],f.v[0],center]]
     .map(v=>({v,id:f.id,parent:f.parent,op:'target_split'}));
   const sourceN=faceNormal(f);
   if(parts.every(q=>dot(faceNormal(q),sourceN)>.70&&a3(q)>a3(f)*.075)){
    chosen=parts;break
   }
   amplitude*=.5;
  }
  if(!chosen)throw Error('unable to subdivide target triangle '+f.id);
  out.push(...chosen);
  const feat=featureAt(base);
  reports.push({sourceTriangle:f.id,feature:feat.feature?.id||null,
   distanceToContour:feat.distance,extraDepthY:amplitude,areaBefore:a3(f),facesAdded:2});
 }
 ensure(out.length===faces.length+2*reports.length,'target splitting did not add two triangles per target');
 return {faces:out,report:reports};
}
function smoothNormals(faces,sourceFaces){
 const changed=new Set();
 for(const f of faces)if(f.op!=='original')for(const e of f.v)changed.add(key(e.p));
 const accum=new Map();
 for(const f of faces){
  const n=cross(sub(f.v[1].p,f.v[0].p),sub(f.v[2].p,f.v[0].p));
  for(const v of f.v)accum.set(key(v.p),add(accum.get(key(v.p))||[0,0,0],n));
 }
 let count=0;
 for(const f of faces)for(const e of f.v)if(changed.has(key(e.p))){
  const old=unit(e.n),geo=unit(accum.get(key(e.p))||old);
  e.n=unit(add(mul(old,.20),mul(dot(old,geo)<0?mul(geo,-1):geo,.80)));
  let t=sub(e.t.slice(0,3),mul(e.n,dot(e.n,e.t.slice(0,3))));
  if(len(t)<1e-9)t=cross(e.n,[0,0,1]);
  e.t=[...unit(t),e.t[3]<0?-1:1];count++;
 }
 return {changedPhysicalGroups:changed.size,updatedNormalCorners:count};
}
function frame(face,weights){
 const n=unit(face.v.reduce((s,e,i)=>add(s,mul(e.n,weights[i])),[0,0,0]));
 let t=face.v.reduce((s,e,i)=>add(s,mul(e.t.slice(0,3),weights[i])),[0,0,0]);
 t=unit(sub(t,mul(n,dot(n,t))));
 if(len(t)<1e-8)t=unit(cross(n,[0,0,1]));
 const hand=face.v.reduce((s,e,i)=>s+weights[i]*e.t[3],0);
 return {n,t,b:mul(unit(cross(n,t)),hand<0?-1:1)};
}
function world(rgb,f){
 const k=unit(rgb.slice(0,3).map(v=>v/127.5-1));
 return unit(add(add(mul(f.t,k[0]),mul(f.b,k[1])),mul(f.n,k[2])));
}
function encodeNormal(w,f){
 return [...[dot(w,f.t),dot(w,f.b),dot(w,f.n)].map(v=>Math.round(clamp((v*.5+.5)*255,0,255))),255];
}
function pixBary(x,y,u){
 const [a,b,c]=u,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
 if(Math.abs(den)<1e-11)return null;
 const w0=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;
 const w1=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;
 return [w0,w1,1-w0-w1];
}
function decodeTexture(q,idx){
 const tex=q.g.textures[idx],img=q.g.images[tex.source],view=q.g.bufferViews[img.bufferView];
 ensure(img.mimeType==='image/png','RGBA PNG expected');
 return decodePNG(q.bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));
}
function rebakeNormals(faces,oldFaces,sourceMap){
 const im={w:sourceMap.w,h:sourceMap.h,pix:Buffer.from(sourceMap.pix)};
 const covered=new Uint8Array(im.w*im.h);
 let pixels=0,changed=0,triangles=0;
 for(const f of faces){
  if(f.op==='original')continue;
  const source=oldFaces[f.parent];if(!source)throw Error('missing original parent triangle '+f.parent);
  const uv=f.v.map(e=>[e.uv[0]*im.w,(1-e.uv[1])*im.h]);
  const oldUV=source.v.map(e=>[e.uv[0]*im.w,(1-e.uv[1])*im.h]);
  const x0=Math.max(0,Math.floor(Math.min(...uv.map(p=>p[0])))),x1=Math.min(im.w-1,Math.ceil(Math.max(...uv.map(p=>p[0]))));
  const y0=Math.max(0,Math.floor(Math.min(...uv.map(p=>p[1])))),y1=Math.min(im.h-1,Math.ceil(Math.max(...uv.map(p=>p[1]))));
  let used=0;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const weights=pixBary(x+.5,y+.5,uv);
   if(!weights||Math.min(...weights)<-1e-6)continue;
   const i=y*im.w+x;if(covered[i])continue;
   const oldB=pixBary(x+.5,y+.5,oldUV);
   if(!oldB||Math.min(...oldB)<-1e-4)continue;
   const frameOld=frame(source,oldB),frameNew=frame(f,weights);
   const j=i*4,rgba=[...sourceMap.pix.subarray(j,j+4)];
   const originalWorld=world(rgba,frameOld);
   const delta=sub(originalWorld,frameOld.n);
   const adjustedWorld=unit(add(frameNew.n,mul(delta,.92)));
   const encoded=encodeNormal(adjustedWorld,frameNew);
   let differing=false;
   for(let k=0;k<3;k++){if(im.pix[j+k]!==encoded[k])differing=true;im.pix[j+k]=encoded[k]}
   covered[i]=1;pixels++;used++;if(differing)changed++;
  }
  if(used)triangles++;
 }
 return {image:im,changedTexels:changed,processedTexels:pixels,affectedUvFaces:triangles};
}
function build(input,outDir,maxTransfers=12,mode='strong'){
 ensure(['strong','guarded'].includes(mode),'mode strong|guarded');
 ensure(fs.existsSync(input),'source R36MG GLB missing');
 ensure(!fs.existsSync(outDir),'output directory already exists');
 const q=load(input),mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 ensure(mi>=0,'continuous body not found');
 const prim=q.g.meshes[mi].primitives[0],mesh=extract(q,mi,0);
 ensure(mesh.indices.length===3396,'expected 1132 body triangles');
 ensure(q.g.skins.some(s=>s.joints.length===63),'63-bone skin missing');
 let rest=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)for(const p of m.primitives)rest+=q.g.accessors[p.indices].count/3});
 ensure(rest===968,'head/hair budget missing');
 mesh.tangents=values(q,prim.attributes.TANGENT);
 const original=originalFaces(mesh),begin=original.length;
 let faces=original,donors=[],targetAvailable=chooseTarget(original,100).length;
 const requested=Math.min(maxTransfers,mode==='strong'?16:9,targetAvailable);
 for(let attempt=0;attempt<requested;attempt++){
  const plans=planCollapse(faces,graph(faces));
  if(!plans.length)break;
  const pick=plans[0];faces=collapse(faces,pick);
  donors.push({edge:[pick.ka,pick.kb],oldFacesRemoved:2,edgeLength:pick.edgeLength,
    worstAreaRatio:pick.worstRatio,worstFaceDot:pick.worstDot});
 }
 ensure(donors.length>=2,'no safe donor edge collapses found; refusing to invent budget transfer');
 const targets=chooseTarget(faces,donors.length);
 // Never produce a model that consumes fewer triangles than it gives back.
 ensure(targets.length===donors.length,'not enough target triangles to match reclaimed budget');
 const result=split(faces,targets,mode==='strong'?1:.65);faces=result.faces;
 ensure(faces.length===begin&&faces.length===1132,'net triangle budget did not balance');
 ensure(faces.every(f=>a3(f)>1e-10),'new body contains zero-area face');
 const geometry=smoothNormals(faces,original);
 const mat=q.g.materials[prim.material],oldNormal=decodeTexture(q,mat.normalTexture.index);
 const rebaked=rebakeNormals(faces,original,oldNormal);
 ensure(rebaked.changedTexels>30,'normal rebake did not modify texture');
 const b=new Builder(q),target=b.g.meshes[mi].primitives[0];
 const mapping=[['POSITION','p','VEC3',5126],['NORMAL','n','VEC3',5126],
  ['TANGENT','t','VEC4',5126],['TEXCOORD_0','uv','VEC2',5126],
  ['JOINTS_0','j','VEC4',5123],['WEIGHTS_0','w','VEC4',5126]];
 if(prim.attributes.COLOR_0!=null)mapping.push(['COLOR_0','col',mesh.colors[0].length===4?'VEC4':'VEC3',5126]);
 const count=faces.length*3;
 for(const [attr,k,dim,component] of mapping){
  target.attributes[attr]=b.addAccessor(faces.flatMap(f=>f.v.map(e=>e[k])),dim,component,34962);
 }
 target.indices=b.addAccessor(Array.from({length:count},(_,i)=>i),'SCALAR',5123,34963);
 const newMat=JSON.parse(JSON.stringify(mat));
 const png=encodePNG(rebaked.image.pix,rebaked.image.w,rebaked.image.h);
 fs.mkdirSync(outDir,{recursive:true});
 fs.writeFileSync(path.join(outDir,'R36MH_REALLOCATED_NORMAL_2048.png'),png);
 const tid=b.addTexture('R36MH_NORMAL_DETAIL',png);
 newMat.normalTexture.index=tid;
 newMat.name='R36MH_BUDGET_TRANSFER_'+mode.toUpperCase();
 target.material=b.g.materials.length;b.g.materials.push(newMat);
 b.g.asset.generator='R36MH real edge collapse + contour aligned centroid subdivides + skinned normal map';
 const filename='R36MH_'+mode.toUpperCase()+'_2100_FULL.glb';
 const saved=b.save(path.join(outDir,filename));
 const areas={
  before:original.reduce((s,f)=>s+a3(f),0),
  after:faces.reduce((s,f)=>s+a3(f),0)
 };
 const report={version:'R36MH',source:path.basename(input),sourceSHA256:q.sha,
  variant:mode,trianglesBefore:2100,trianglesAfter:2100,
  bodyTriangles:1132,headHairTriangles:968,joints:63,
  trueBudgetTransfer:true,donorEdgeCollapses:donors.length,
  donorFacesRemoved:donors.length*2,recipientFacesAdded:result.report.length*2,
  recipientTrianglesSplit:result.report.length,
  netFaceChange:faces.length-begin,bodyVertexEntriesBefore:mesh.positions.length,
  bodyVertexEntriesAfter:count,geometry,areas,
  donorOperations:donors,recipientOperations:result.report,
  normalTexture:{file:'R36MH_REALLOCATED_NORMAL_2048.png',sha256:sha(png),bytes:png.length,...rebaked},
  model:filename,modelBytes:saved.bytes,modelSHA256:saved.sha,
  sourceUVPixelsReused:true,sourcePBRColorPreserved:true,skinJointWeightsInterpolated:true,
  visualQA:'not run',S2EngineQA:'not run',
  limitation:'Existing source UV image color retained; relief is a conservative 2D landmark-driven sculpt hypothesis'};
 delete report.normalTexture.image;
 fs.writeFileSync(path.join(outDir,'R36MH_'+mode.toUpperCase()+'.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({model:filename,donors:donors.length,addedFaces:donors.length*2,
  normalPixels:rebaked.changedTexels,triangles:2100,size:saved.bytes,sha256:saved.sha}));
 return report;
}
if(require.main===module)try{
 const a=process.argv.slice(2);ensure(a.length>=2&&a.length<=4,
  'usage: node build_r36mh.cjs SOURCE.glb OUTPUT_DIR [number=12] [strong|guarded]');
 build(a[0],a[1],a[2]==null?12:Number(a[2]),a[3]||'strong');
}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={build,graph,planCollapse,chooseTarget,relief,rebakeNormals};
