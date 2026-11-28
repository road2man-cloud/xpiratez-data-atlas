'use strict';
/**
 * R36MD: adaptive anatomical contour-zone atlas from actual R36MC 3D mesh.
 * Source R36MB is used for real image detail; target R36MC for geometry.
 * Features are hand-annotated curve candidates, NOT 3D photo measurements.
 * Generates transparent PNG crops per feature rather than 4x8 even grid,
 * rebuilds tangent normals for R36MC and outputs a skinned full GLB.
 *
 * node build_r36md.cjs R36MB.glb R36MC.glb OUT_DIR
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,values,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const {transfer,compareTopology}=require('../../r36mb-frame-transport-20261128/source/build_r36mb.cjs');
const {rebake}=require('../../r36ma-seam-rebake-20261128/source/build_r36ma.cjs');
const reference=require('../../r36mc-landmark-sculpt-20261128/source/landmark_hypothesis.json');
const ok=(v,s)=>{if(!v)throw Error(s)};
const clip=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const SHA=b=>crypto.createHash('sha256').update(b).digest('hex');
const cfg=reference.mapping,r=cfg.sourceRect,b=cfg.targetBindRegion;
const features=reference.features.map((f,i)=>({...f,index:i,bind:f.points.map(p=>[
 b.xMin+(p[0]-r.left)/(r.right-r.left)*(b.xMax-b.xMin),
 b.zTop-(p[1]-r.top)/(r.bottom-r.top)*(b.zTop-b.zBottom)
])}));
function pointDist(p,a,z){
 const dx=z[0]-a[0],dy=z[1]-a[1],n=dx*dx+dy*dy;
 const t=clip(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/Math.max(n,1e-15));
 const x=a[0]+t*dx,y=a[1]+t*dy;
 return Math.hypot(p[0]-x,p[1]-y);
}
function nearestFeature(x,z){
 let best=-1,score=Infinity;
 for(const f of features){
  let d=Infinity;
  for(let k=1;k<f.bind.length;k++)d=Math.min(d,pointDist([x,z],f.bind[k-1],f.bind[k]));
  const normalized=d/(f.width||.013);
  if(normalized<score){score=normalized;best=f.index}
 }
 return score<=2.8?best:-1;
}
function embedded(q,id){
 const tex=q.g.textures[id],im=q.g.images[tex.source],v=q.g.bufferViews[im.bufferView],o=v.byteOffset||0;
 ok(im.mimeType==='image/png','material PNG required');
 return decodePNG(q.bin.subarray(o,o+v.byteLength));
}
function body(q){
 const mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 ok(mi>=0,'body mesh missing');
 const prim=q.g.meshes[mi].primitives[0],mesh=extract(q,mi,0);
 mesh.tangents=values(q,prim.attributes.TANGENT);
 return {mi,prim,mesh};
}
function rasterZones(mesh,w,h){
 const ids=mesh.indices,uv=mesh.uvs,pos=mesh.positions;
 const zones=new Uint8Array(w*h),hit=new Uint8Array(w*h);zones.fill(255);
 const faceSets=features.map(()=>new Set()),counts=features.map(()=>0);
 for(let fi=0;fi<ids.length;fi+=3){
  const tri=ids.slice(fi,fi+3),P=tri.map(id=>pos[id]),u=tri.map(id=>[uv[id][0]*w,(1-uv[id][1])*h]);
  const center=P.reduce((s,p)=>s.map((v,i)=>v+p[i]/3),[0,0,0]);
  if(center[1]>-.015||Math.abs(center[0])>.12||center[2]<.73||center[2]>.985)continue;
  const den=(u[1][1]-u[2][1])*(u[0][0]-u[2][0])+(u[2][0]-u[1][0])*(u[0][1]-u[2][1]);
  if(Math.abs(den)<1e-8)continue;
  let used=new Set();
  const xmin=Math.max(0,Math.floor(Math.min(...u.map(p=>p[0])))),xmax=Math.min(w-1,Math.ceil(Math.max(...u.map(p=>p[0]))));
  const ymin=Math.max(0,Math.floor(Math.min(...u.map(p=>p[1])))),ymax=Math.min(h-1,Math.ceil(Math.max(...u.map(p=>p[1]))));
  for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
   const xx=x+.5,yy=y+.5;
   const a=((u[1][1]-u[2][1])*(xx-u[2][0])+(u[2][0]-u[1][0])*(yy-u[2][1]))/den;
   const bb=((u[2][1]-u[0][1])*(xx-u[2][0])+(u[0][0]-u[2][0])*(yy-u[2][1]))/den;
   const c=1-a-bb;if(Math.min(a,bb,c)<-1e-6)continue;
   const pixel=y*w+x;if(hit[pixel])continue;
   hit[pixel]=1;
   const p=[0,1,2].map(k=>a*P[0][k]+bb*P[1][k]+c*P[2][k]);
   if(p[1]>-.025)continue;
   const z=nearestFeature(p[0],p[2]);
   if(z<0)continue;
   zones[pixel]=z;counts[z]++;used.add(z);
  }
  for(const z of used)faceSets[z].add(fi/3);
 }
 return {zones,counts,faceSets};
}
function exportPatches(z,images,outDir){
 const {zones,counts,faceSets}=z,w=images.color.w,h=images.color.h,created=[];
 const masks=features.map(()=>({x0:w,y0:h,x1:-1,y1:-1}));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,zone=zones[i];if(zone===255)continue;
  const v=masks[zone];v.x0=Math.min(v.x0,x);v.x1=Math.max(v.x1,x);v.y0=Math.min(v.y0,y);v.y1=Math.max(v.y1,y);
 }
 for(const f of features){
  const bounds=masks[f.index];if(bounds.x1<0)continue;
  const pad=4,l=Math.max(0,bounds.x0-pad),t=Math.max(0,bounds.y0-pad);
  const right=Math.min(w-1,bounds.x1+pad),bottom=Math.min(h-1,bounds.y1+pad);
  const ww=right-l+1,hh=bottom-t+1;
  const color=Buffer.alloc(ww*hh*4),normal=Buffer.alloc(ww*hh*4),mask=Buffer.alloc(ww*hh*4);
  for(let y=0;y<hh;y++)for(let x=0;x<ww;x++){
   const atlasIndex=(y+t)*w+x+l;if(zones[atlasIndex]!==f.index)continue;
   const src=atlasIndex*4,dest=(y*ww+x)*4;
   images.color.pix.copy(color,dest,src,src+4);
   images.normal.pix.copy(normal,dest,src,src+4);
   mask[dest]=255;mask[dest+1]=255;mask[dest+2]=255;mask[dest+3]=255;
  }
  const prefix='R36MD_'+f.id.toUpperCase().replace(/[^A-Z0-9]/g,'_');
  for(const [n,pix] of [['COLOR',color],['NORMAL',normal],['MASK',mask]]){
   fs.writeFileSync(path.join(outDir,prefix+'_'+n+'.png'),encodePNG(pix,ww,hh));
  }
  created.push({id:f.id,kind:f.kind,pixels:counts[f.index],triangles:faceSets[f.index].size,
   atlasBounds:{x:l,y:t,width:ww,height:hh},files:['COLOR','NORMAL','MASK'].map(n=>prefix+'_'+n+'.png')});
 }
 ok(created.length>=5,'too few semantic image patches');
 return created;
}
function build(sourceFile,targetFile,outDir){
 ok(fs.existsSync(sourceFile)&&fs.existsSync(targetFile),'input GLBs missing');
 ok(!fs.existsSync(outDir),'refusing overwrite output');
 const q0=load(sourceFile),q1=load(targetFile),source=body(q0),target=body(q1);
 const topology=compareTopology(source.mesh,target.mesh);
 const m0=q0.g.materials[source.prim.material],m1=q1.g.materials[target.prim.material];
 const normal0=embedded(q0,m0.normalTexture.index),color1=embedded(q1,m1.pbrMetallicRoughness.baseColorTexture.index);
 const moved=transfer(source.mesh,target.mesh,normal0,.72);
 const merged=rebake(target.mesh,color1,{w:normal0.w,h:normal0.h,pix:moved.normal},6);
 const finalColor={w:2048,h:2048,pix:merged.color},finalNormal={w:2048,h:2048,pix:merged.normal};
 fs.mkdirSync(outDir,{recursive:true});
 const z=rasterZones(target.mesh,2048,2048),patches=exportPatches(z,{color:finalColor,normal:finalNormal},outDir);
 const builder=new Builder(q1),mat=builder.g.materials[target.prim.material];
 const imageFiles={};
 for(const [kind,img] of [['COLOR',finalColor],['NORMAL',finalNormal]]){
  const png=encodePNG(img.pix,img.w,img.h),name='R36MD_SEMANTIC_'+kind+'_2048.png';
  fs.writeFileSync(path.join(outDir,name),png);
  const id=builder.addTexture('R36MD_'+kind,png);
  if(kind==='COLOR')mat.pbrMetallicRoughness.baseColorTexture.index=id;
  else mat.normalTexture.index=id;
  imageFiles[kind]={name,sha256:SHA(png),bytes:png.length};
 }
 const model='R36MD_SEMANTIC_2100_FULL.glb';
 builder.g.asset.generator='R36MD semantic nonuniform 3D-zone image patch export and sculpted tangent map transfer';
 const saved=builder.save(path.join(outDir,model));
 const report={version:'R36MD',source:path.basename(sourceFile),target:path.basename(targetFile),
  output:model,outputSHA256:saved.sha,outputBytes:saved.bytes,triangles:2100,joints:63,
  semanticImageRegions:patches.length,regions:patches,nonUniformGrid:true,sourceTexturePreserved:true,
  modelPositionUnchangedFromR36MC:true,transport:moved.stats,seams:merged.metrics,
  sourceVsTarget:topology,images:imageFiles,visualQA:'not run',S2EngineQA:'not run',
  limitation:'Meaningful UV image layers extracted, but photograph colors are not directly projected; camera-depth still uncalibrated'};
 fs.writeFileSync(path.join(outDir,'R36MD_SEMANTIC.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({model,regions:patches.length,patchPixels:patches.map(p=>p.pixels),imageNormalChanged:moved.stats.changedPixels}));
 return report;
}
if(require.main===module)try{ok(process.argv.length===5,'node build_r36md.cjs R36MB.glb R36MC.glb OUTPUT_DIR');build(...process.argv.slice(2));}
catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={build,rasterZones,nearestFeature};
