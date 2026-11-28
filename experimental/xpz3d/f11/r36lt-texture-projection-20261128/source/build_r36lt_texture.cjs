'use strict';
/**
 * R36LT: image-detail projection, not procedural shadow painting.
 * Inputs: existing R36LS GLB + user-supplied RGBA PNG + mapping JSON.
 * UV-space projective transform with feathered alpha and skin-color preservation.
 * Keeps all positions, normals, joint indices, weights and triangles untouched.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const check=(v,s)=>{if(!v)throw Error(s)};
function embedded(q,textureIndex){
 const tex=q.g.textures[textureIndex],img=q.g.images[tex.source];
 check(img.mimeType==='image/png'&&Number.isInteger(img.bufferView),'embedded PNG expected');
 const view=q.g.bufferViews[img.bufferView],start=view.byteOffset||0;
 return decodePNG(q.bin.subarray(start,start+view.byteLength));
}
function bilinear(png,x,y){
 x=clamp(x,0,png.w-1);y=clamp(y,0,png.h-1);
 const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,png.w-1),y1=Math.min(y0+1,png.h-1),fx=x-x0,fy=y-y0;
 const sample=(ix,iy,k)=>png.pix[4*(iy*png.w+ix)+k];
 return [0,1,2,3].map(k=>(1-fx)*(1-fy)*sample(x0,y0,k)+fx*(1-fy)*sample(x1,y0,k)+(1-fx)*fy*sample(x0,y1,k)+fx*fy*sample(x1,y1,k));
}
function solveAffine(src,dst){
 check(src.length===3&&dst.length===3,'three landmark pairs required');
 const det=(a,b,c)=>a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]);
 const d=det(...src);check(Math.abs(d)>1e-8,'collinear source landmarks');
 function coeff(k){
  const z=dst.map(p=>p[k]);
  return [
   (z[0]*(src[1][1]-src[2][1])+z[1]*(src[2][1]-src[0][1])+z[2]*(src[0][1]-src[1][1]))/d,
   (z[0]*(src[2][0]-src[1][0])+z[1]*(src[0][0]-src[2][0])+z[2]*(src[1][0]-src[0][0]))/d,
   (z[0]*(src[1][0]*src[2][1]-src[2][0]*src[1][1])+z[1]*(src[2][0]*src[0][1]-src[0][0]*src[2][1])+z[2]*(src[0][0]*src[1][1]-src[1][0]*src[0][1]))/d
  ];
 }
 return [coeff(0),coeff(1)];
}
function rasterMask(mesh,w,h){
 // Only pixels belonging to actual body UV triangles can be changed.
 const mask=new Uint8Array(w*h),ids=mesh.indices,uv=mesh.uvs;
 for(let i=0;i<ids.length;i+=3){
  const p=[0,1,2].map(k=>[uv[ids[i+k]][0]*w,(1-uv[ids[i+k]][1])*h]);
  const xmin=Math.max(0,Math.floor(Math.min(...p.map(a=>a[0])))),xmax=Math.min(w-1,Math.ceil(Math.max(...p.map(a=>a[0]))));
  const ymin=Math.max(0,Math.floor(Math.min(...p.map(a=>a[1])))),ymax=Math.min(h-1,Math.ceil(Math.max(...p.map(a=>a[1]))));
  const d=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1]);
  if(Math.abs(d)<1e-9)continue;
  for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
   const xx=x+.5,yy=y+.5;
   const a=((p[1][1]-p[2][1])*(xx-p[2][0])+(p[2][0]-p[1][0])*(yy-p[2][1]))/d;
   const b=((p[2][1]-p[0][1])*(xx-p[2][0])+(p[0][0]-p[2][0])*(yy-p[2][1]))/d;
   if(Math.min(a,b,1-a-b)>=-1e-6)mask[y*w+x]=1;
  }
 }
 return mask;
}
function project(atlas,detail,mesh,config){
 const out=Buffer.from(atlas.pix),mask=rasterMask(mesh,atlas.w,atlas.h);
 const {sourceLandmarks,targetUV}=config;
 const source=sourceLandmarks.map(p=>[p[0]*detail.w,p[1]*detail.h]);
 const target=targetUV.map(p=>[p[0]*atlas.w,(1-p[1])*atlas.h]);
 const [cx,cy]=solveAffine(target,source); // atlas pixel => detail pixel
 const opacity=clamp(config.opacity??1),feather=clamp(config.featherPx??12,0,256);
 const bounds=config.targetBoundsUV||[0,0,1,1];
 check(bounds.length===4&&bounds.every(Number.isFinite),'targetBoundsUV [uMin,vMin,uMax,vMax] required');
 let painted=0;
 const x0=Math.max(0,Math.floor(bounds[0]*atlas.w)),x1=Math.min(atlas.w,Math.ceil(bounds[2]*atlas.w));
 const y0=Math.max(0,Math.floor((1-bounds[3])*atlas.h)),y1=Math.min(atlas.h,Math.ceil((1-bounds[1])*atlas.h));
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  if(!mask[y*atlas.w+x])continue;
  const sx=cx[0]*(x+.5)+cx[1]*(y+.5)+cx[2],sy=cy[0]*(x+.5)+cy[1]*(y+.5)+cy[2];
  if(sx<0||sy<0||sx>detail.w-1||sy>detail.h-1)continue;
  const rgba=bilinear(detail,sx,sy);
  const edge=Math.min(sx,sy,detail.w-1-sx,detail.h-1-sy);
  const alpha=opacity*(rgba[3]/255)*(feather>0?clamp(edge/feather):1);
  if(alpha<1/255)continue;
  const k=(y*atlas.w+x)*4;
  // Detail image is an actual pixel layer. No artificial highlight or shadow.
  for(let c=0;c<3;c++)out[k+c]=Math.round(out[k+c]*(1-alpha)+rgba[c]*alpha);
  painted++;
 }
 return {pixels:out,painted};
}
function run(input,detailPath,configPath,outDir){
 check(fs.existsSync(input)&&fs.existsSync(detailPath)&&fs.existsSync(configPath),'missing input');
 check(!fs.existsSync(outDir),'output directory already exists');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 check(config.sourceLandmarks?.length===3&&config.targetUV?.length===3,'three correspondences required');
 const q=load(input),mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 check(mi>=0,'body mesh not found');
 const body=extract(q,mi,0),prim=q.g.meshes[mi].primitives[0];
 check(body.indices.length===3396&&q.g.skins.some(s=>s.joints.length===63),'R36LS body/rig mismatch');
 const mat=q.g.materials[prim.material],atlas=embedded(q,mat.pbrMetallicRoughness.baseColorTexture.index);
 const detail=decodePNG(fs.readFileSync(detailPath));
 check(atlas.w===2048&&atlas.h===2048&&detail.w>0&&detail.h>0,'unexpected PNG dimensions');
 const updated=project(atlas,detail,body,config);
 check(updated.painted>0,'no overlapping projected pixels');
 fs.mkdirSync(outDir,{recursive:true});
 const png=encodePNG(updated.pixels,atlas.w,atlas.h),outputPng=path.join(outDir,'R36LT_IMAGE_DETAIL_COLOR_2048.png');
 fs.writeFileSync(outputPng,png);
 const builder=new Builder(q),tex=builder.addTexture('R36LT_IMAGE_DETAIL_COLOR',png);
 builder.g.materials[prim.material].pbrMetallicRoughness.baseColorTexture.index=tex;
 builder.g.asset.generator='R36LT image detail projection on R36LS compact full character';
 const glb=builder.save(path.join(outDir,'R36LT_IMAGE_DETAIL_2100_FULL.glb'));
 const report={version:'R36LT-IMAGE-DETAIL',sourceSHA256:q.sha,detailSHA256:sha(fs.readFileSync(detailPath)),config,
  changedColorPixels:updated.painted,bodyTriangles:1132,expectedTotalTriangles:2100,rigJoints:63,
  normalMap:'source preserved',ormMap:'source preserved',positions:'source preserved',uvs:'source preserved',
  outputGLB:path.basename(glb.file),outputGLBSHA256:glb.sha,outputColorSHA256:sha(png),
  visualQA:'not run',S2QA:'not run'};
 fs.writeFileSync(path.join(outDir,'R36LT_IMAGE_DETAIL.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
if(require.main===module){
 try{check(process.argv.length===6,'usage: node build_r36lt_texture.cjs SOURCE.glb DETAIL.png CONFIG.json OUTDIR');run(...process.argv.slice(2))}
 catch(e){console.error(e.stack||e);process.exitCode=1}
}
module.exports={solveAffine,rasterMask,project,run};
