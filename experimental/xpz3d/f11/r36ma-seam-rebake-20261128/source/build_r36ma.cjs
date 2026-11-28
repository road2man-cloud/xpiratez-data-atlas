'use strict';
/**
 * R36MA - real geometric UV-seam rebake for R36LZ.
 *
 * Match disconnected UV charts through identical 3D edge endpoints. For every
 * matching seam, blend source-image COLOR and real tangent-space NORMAL across
 * the same physical edge, while retaining per-pixel interior image detail.
 *
 * No invented shadows, new geometry, polygon count or reference photo uploads.
 * node build_r36ma.cjs INPUT_R36LZ.glb OUT_DIR [6]
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,values,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const {decodePNG}=require('../../r36lt-texture-projection-20261128/source/png_rgba.cjs');
const {uvMask,nearestOwners,padMap}=require('../../r36lt-texture-projection-20261128/source/build_r36lu_uv_gutter.cjs');
const need=(v,s)=>{if(!v)throw Error(s)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const clip=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const sm=t=>{t=clip(t);return t*t*(3-2*t)};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(...a);
const unit=a=>{const n=len(a);return n<1e-10?[0,0,1]:mul(a,1/n)};
const mix=(a,b,t)=>add(mul(a,1-t),mul(b,t));
const vkey=p=>p.map(v=>Math.round(v*100000)).join('/');
function uvpx(p,w,h){return [p[0]*w,(1-p[1])*h]}
function embedded(q,id){
 const tex=q.g.textures[id],img=q.g.images[tex.source];
 need(img.mimeType==='image/png'&&Number.isInteger(img.bufferView),'PNG bufferView required');
 const view=q.g.bufferViews[img.bufferView],at=view.byteOffset||0;
 return decodePNG(q.bin.subarray(at,at+view.byteLength));
}
function bilinear(img,x,y){
 x=clip(x,0,img.w-1);y=clip(y,0,img.h-1);
 const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,img.w-1),y1=Math.min(y0+1,img.h-1);
 const ax=x-x0,ay=y-y0,o=[0,0,0,0];
 for(const [xx,yy,w] of [[x0,y0,(1-ax)*(1-ay)],[x1,y0,ax*(1-ay)],[x0,y1,(1-ax)*ay],[x1,y1,ax*ay]]){
  const j=4*(yy*img.w+xx);for(let k=0;k<4;k++)o[k]+=img.pix[j+k]*w;
 }
 return o;
}
function triangleFrame(mesh,ids,wts){
 let n=[0,0,0],t=[0,0,0],sign=0;
 for(let i=0;i<3;i++){
  const id=ids[i],wt=wts[i];
  n=add(n,mul(mesh.normals[id],wt));
  t=add(t,mul(mesh.tangents[id].slice(0,3),wt));
  sign+=mesh.tangents[id][3]*wt;
 }
 n=unit(n);t=sub(t,mul(n,dot(n,t)));
 if(len(t)<1e-7){const a=Math.abs(n[0])<.9?[1,0,0]:[0,1,0];t=cross(a,n)}
 t=unit(t);
 const b=mul(unit(cross(n,t)),sign<0?-1:1);
 return {n,t,b};
}
function texToWorld(c,frame){
 const v=unit([c[0]/127.5-1,c[1]/127.5-1,c[2]/127.5-1]);
 return unit(add(add(mul(frame.t,v[0]),mul(frame.b,v[1])),mul(frame.n,v[2])));
}
function worldToTex(w,frame){
 const d=unit([dot(w,frame.t),dot(w,frame.b),dot(w,frame.n)]);
 return d.map(v=>Math.round(clip((v*.5+.5)*255,0,255)));
}
function triUV(mesh,ids,w,h){return ids.map(i=>uvpx(mesh.uvs[i],w,h))}
function insideBary(uv,x,y){
 const [a,b,c]=uv;
 const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
 if(Math.abs(d)<1e-9)return null;
 const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d;
 const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d;
 const s=1-u-v;
 return Math.min(u,v,s)>=-1e-6?[u,v,s]:null;
}
function collectSeams(mesh,w,h){
 const {positions,uvs,indices}=mesh,edgeMap=new Map();
 for(let f=0;f<indices.length/3;f++){
  const ids=indices.slice(f*3,f*3+3);
  const centroid=mul(add(add(positions[ids[0]],positions[ids[1]]),positions[ids[2]]),1/3);
  if(centroid[1]>-.022||Math.abs(centroid[0])>.119||centroid[2]<.745||centroid[2]>.980)continue;
  for(let e=0;e<3;e++){
   let ia=ids[e],ib=ids[(e+1)%3];
   const ka=vkey(positions[ia]),kb=vkey(positions[ib]);
   if(ka===kb)continue;
   if(ka>kb)[ia,ib]=[ib,ia];
   const key=ka<kb?ka+'|'+kb:kb+'|'+ka;
   if(!edgeMap.has(key))edgeMap.set(key,[]);
   edgeMap.get(key).push({face:f,ids,ia,ib,ic:ids.find(x=>x!==ia&&x!==ib),
    pa:uvpx(uvs[ia],w,h),pb:uvpx(uvs[ib],w,h),uv:triUV(mesh,ids,w,h)});
  }
 }
 const seams=[];
 let skippedNonmanifold=0,skippedSharp=0;
 for(const [k,owners] of edgeMap){
  if(owners.length!==2){if(owners.length>2)skippedNonmanifold++;continue}
  const [a,b]=owners;
  const uvDistance=Math.max(len(sub(a.pa,b.pa)),len(sub(a.pb,b.pb)));
  if(uvDistance<2)continue;
  const pa=mesh.positions[a.ia],pb=mesh.positions[a.ib];
  const center=mul(add(pa,pb),.5);
  const ua=a.ids.map(i=>mesh.positions[i]);
  const ub=b.ids.map(i=>mesh.positions[i]);
  const na=unit(cross(sub(ua[1],ua[0]),sub(ua[2],ua[0])));
  const nb=unit(cross(sub(ub[1],ub[0]),sub(ub[2],ub[0])));
  if(Math.abs(dot(na,nb))<.75){skippedSharp++;continue}
  seams.push({key:k,owners:[a,b],worldMidpoint:center,UVSeparationPx:uvDistance});
 }
 return {seams,skippedNonmanifold,skippedSharp};
}
function edgeSample(owner,s,mesh,color,normal){
 const p=mix(owner.pa,owner.pb,s);
 const third=uvpx(mesh.uvs[owner.ic],color.w,color.h);
 const toward=sub(third,p),factor=Math.min(.06,1.1/Math.max(.01,len(toward)));
 const q=add(p,mul(toward,factor));
 const c=bilinear(color,q[0]-.5,q[1]-.5),n=bilinear(normal,q[0]-.5,q[1]-.5);
 const weights=owner.ids.map(id=>id===owner.ia?(1-s)*(1-factor):id===owner.ib?s*(1-factor):factor);
 const f=triangleFrame(mesh,owner.ids,weights);
 return {color:c,nWorld:texToWorld(n,f)};
}
function projectToEdge(p,a,b){
 const ab=sub(b,a),d=dot(ab,ab);
 const s=clip(dot(sub(p,a),ab)/Math.max(1e-9,d));
 return {s,distance:len(sub(p,add(a,mul(ab,s))))};
}
function rebake(mesh,color,normal,radius=6){
 need(mesh.tangents&&mesh.tangents.length===mesh.positions.length,'TANGENT accessor is required');
 need(color.w===2048&&color.h===2048&&normal.w===2048&&normal.h===2048,'source must have 2048 maps');
 need(Number.isInteger(radius)&&radius>=2&&radius<=12,'radius must be 2..12 pixels');
 const {seams,skippedNonmanifold,skippedSharp}=collectSeams(mesh,color.w,color.h);
 need(seams.length>=4,'no usable 3D connected UV seams found');
 const updates=new Map(),visitedTriangles=new Set();
 let pairsWithSamples=0,usedEdgePairs=0,skippedIncompatibleNormal=0,summedEdgeDifference=0;
 for(const seam of seams){
  const [oa,ob]=seam.owners;
  const centerS=[.25,.5,.75];
  let discrepancy=0,validNormals=true;
  for(const t of centerS){
   const a=edgeSample(oa,t,mesh,color,normal),b=edgeSample(ob,t,mesh,color,normal);
   discrepancy+=len(sub(a.color.slice(0,3),b.color.slice(0,3)))/3;
   if(dot(a.nWorld,b.nWorld)<.25)validNormals=false;
  }
  if(!validNormals){skippedIncompatibleNormal++;continue}
  summedEdgeDifference+=discrepancy/3;pairsWithSamples++;let seamUsed=false;
  for(let side=0;side<2;side++){
   const self=seam.owners[side],other=seam.owners[1-side];
   const e0=self.pa,e1=self.pb;
   const loX=Math.max(0,Math.floor(Math.min(e0[0],e1[0])-radius-1));
   const hiX=Math.min(color.w-1,Math.ceil(Math.max(e0[0],e1[0])+radius+1));
   const loY=Math.max(0,Math.floor(Math.min(e0[1],e1[1])-radius-1));
   const hiY=Math.min(color.h-1,Math.ceil(Math.max(e0[1],e1[1])+radius+1));
   for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
    const pix=[x+.5,y+.5],bary=insideBary(self.uv,pix[0],pix[1]);
    if(!bary)continue;
    const projection=projectToEdge(pix,e0,e1);
    if(projection.distance>radius)continue;
    const weight=sm(1-projection.distance/radius)*.94;
    if(weight<1e-4)continue;
    const at=projection.s,sa=edgeSample(self,at,mesh,color,normal);
    const sb=edgeSample(other,at,mesh,color,normal);
    const frame=triangleFrame(mesh,self.ids,bary);
    const edgeTarget=unit(add(sa.nWorld,sb.nWorld));
    const adjust=sub(edgeTarget,sa.nWorld);
    const difference=mul(sub(sb.color.slice(0,3),sa.color.slice(0,3)),.5);
    const ix=y*color.w+x;
    let rec=updates.get(ix);
    if(!rec){
     rec={c:[0,0,0],world:[0,0,0],frame,weight:0};
     updates.set(ix,rec);
    }
    for(let k=0;k<3;k++){
     rec.c[k]+=clip(difference[k],-18,18)*weight;
     rec.world[k]+=clip(adjust[k],-.35,.35)*weight;
    }
    rec.weight+=weight;
    seamUsed=true;visitedTriangles.add(self.face);
   }
  }
  if(seamUsed)usedEdgePairs++;
 }
 need(usedEdgePairs>=4,'no seam pixels could be sampled inside triangles');
 const c=Buffer.from(color.pix),n=Buffer.from(normal.pix);
 let changedColor=0,changedNormal=0,totalColorDeviation=0,maxColorDeviation=0;
 for(const [i,r] of updates){
  const p=4*i,scale=1/Math.max(1,r.weight);
  let differentColor=false,differentNormal=false;
  for(let k=0;k<3;k++){
   const base=c[p+k];
   const next=Math.round(clip(base+r.c[k]*scale,0,255));
   totalColorDeviation+=Math.abs(next-base);maxColorDeviation=Math.max(maxColorDeviation,Math.abs(next-base));
   if(base!==next)differentColor=true;
   c[p+k]=next;
  }
  const src=[n[p],n[p+1],n[p+2],n[p+3]];
  const originalWorld=texToWorld(src,r.frame),newWorld=unit(add(originalWorld,mul(r.world,scale)));
  const target=worldToTex(newWorld,r.frame);
  for(let k=0;k<3;k++){if(n[p+k]!==target[k])differentNormal=true;n[p+k]=target[k];}
  if(differentColor)changedColor++;
  if(differentNormal)changedNormal++;
 }
 // Populate the source atlas's previously existing image gutters from the
 // UPDATED chart interiors to prevent stale edge colors reappearing in mipmaps.
 const m=uvMask(mesh,color.w,color.h),owners=nearestOwners(m,color.w,color.h,4);
 const paddedColor=padMap({w:color.w,h:color.h,pix:c},owners);
 const paddedNormal=padMap({w:normal.w,h:normal.h,pix:n},owners);
 return {color:paddedColor.bytes,normal:paddedNormal.bytes,metrics:{
  seamsDetected:seams.length,usableSeams:pairsWithSamples,edgesRebaked:usedEdgePairs,
  skippedSharp,skippedNonmanifold,skippedIncompatibleNormal,
  meanSourceEdgeRGBDifference:summedEdgeDifference/Math.max(1,pairsWithSamples),
  touchedUVTriangleCount:visitedTriangles.size,
  affectedInteriorPixels:updates.size,
  changedAlbedoPixels:changedColor,changedNormalPixels:changedNormal,
  meanAbsoluteRGB8Delta:totalColorDeviation/Math.max(1,3*updates.size),
  maxRGB8Delta:maxColorDeviation,
  paddedColorPixels:paddedColor.filledPixels,paddedNormalPixels:paddedNormal.filledPixels,
  algorithm:'paired physical 3D edges -> dual UV seam pixel transforms, world-space normal transport',
  didNotTouchPositionsOrJointWeights:true
 }};
}
function build(input,outDir,radius=6){
 need(fs.existsSync(input),'source GLB missing');
 need(!fs.existsSync(outDir),'refusing overwrite existing output');
 const q=load(input),mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 need(mi>=0,'integrated body mesh not found');
 const mesh=extract(q,mi,0),prim=q.g.meshes[mi].primitives[0];
 need(mesh.indices.length===3396&&q.g.skins.some(s=>s.joints.length===63),'body or joint budget mismatch');
 let others=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)for(const p of m.primitives)others+=q.g.accessors[p.indices].count/3});
 need(others===968,'head or hair geometry changed');
 need(prim.attributes.TANGENT!=null,'source TANGENT required');
 mesh.tangents=values(q,prim.attributes.TANGENT);
 const mat=q.g.materials[prim.material],color=embedded(q,mat.pbrMetallicRoughness.baseColorTexture.index),normal=embedded(q,mat.normalTexture.index);
 const output=rebake(mesh,color,normal,radius);
 need(output.metrics.changedAlbedoPixels>0||output.metrics.changedNormalPixels>0,'no actual pixel changes in rebake');
 fs.mkdirSync(outDir,{recursive:true});
 const builder=new Builder(q),files={};
 for(const [kind,pixels] of [['COLOR',output.color],['NORMAL',output.normal]]){
  const png=encodePNG(pixels,2048,2048),name='R36MA_SEAM_'+kind+'_2048.png';
  fs.writeFileSync(path.join(outDir,name),png);
  const id=builder.addTexture('R36MA_REBAKED_'+kind,png);
  if(kind==='COLOR')builder.g.materials[prim.material].pbrMetallicRoughness.baseColorTexture.index=id;
  if(kind==='NORMAL')builder.g.materials[prim.material].normalTexture.index=id;
  files[kind]={name,sha256:sha(png),bytes:png.length};
 }
 builder.g.asset.generator='R36MA sculpt-aware 3D UV seam correction with matched albedo and tangent-space normals';
 const model='R36MA_SEAM_REBAKED_2100_FULL.glb';
 const out=builder.save(path.join(outDir,model));
 const report={version:'R36MA',source:path.basename(input),sourceSHA256:q.sha,
  model,modelSHA256:out.sha,modelBytes:out.bytes,
  triangles:2100,bodyTriangles:1132,faceHairTriangles:968,joints:63,
  geometryAndSkinUnchanged:true,normalMapAndColorUpdated:true,
  metrics:output.metrics,images:files,
  visualQA:'not run',engineQA:'not run',
  caveat:'Physical seam blending, not photographic depth recovery or visual approval'};
 fs.writeFileSync(path.join(outDir,'R36MA_SEAM_REBAKE.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({model,outBytes:out.bytes,sha256:out.sha,...output.metrics}));
 return report;
}
if(require.main===module)try{
 const args=process.argv.slice(2);
 need(args.length>=2&&args.length<=3,'usage: node build_r36ma.cjs INPUT.glb OUT_DIR [radius=6]');
 build(args[0],args[1],args[2]==null?6:Number(args[2]));
}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={build,collectSeams,rebake,edgeSample,triangleFrame};
