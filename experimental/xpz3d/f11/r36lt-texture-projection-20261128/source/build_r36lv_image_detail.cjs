'use strict';
/**
 * R36LV: real-image detail reconstruction (source image high frequencies)
 * Inputs R36LU GLB albedo+normal+ORM. Reconstructs fine texture using
 * local source-image frequencies, not brush-painted world-space shadows.
 * Geometry, rig, UVs, weights, face and hair untouched.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const {uvMask,nearestOwners}=require('./build_r36lu_uv_gutter.cjs');
const check=(x,s)=>{if(!x)throw Error(s);};
const clamp=(x,a=0,b=255)=>Math.max(a,Math.min(b,x));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function embedded(q,id){
 const tex=q.g.textures[id],im=q.g.images[tex.source];check(im.mimeType==='image/png'&&Number.isInteger(im.bufferView),'missing embedded png');
 const v=q.g.bufferViews[im.bufferView],o=v.byteOffset||0;return decodePNG(q.bin.subarray(o,o+v.byteLength));
}
function detail(source,normal,mask,{strength=.38,normalStrength=.22}={}){
 const {w,h,pix}=source;check(normal.w===w&&normal.h===h,'normal dimensions differ');
 check(strength>=0&&strength<=1&&normalStrength>=0&&normalStrength<=1,'invalid gains');
 const N=w*h;check(mask.length===N,'invalid UV mask');
 const outColor=Buffer.from(pix),outNormal=Buffer.from(normal.pix);
 const luma=new Float32Array(N),low=new Float32Array(N);
 // Luminance comes exclusively from the existing image; no synthetic noise.
 for(let i=0;i<N;i++){const k=4*i;luma[i]=.2126*pix[k]+.7152*pix[k+1]+.0722*pix[k+2];}
 // Separable 5x5 Gaussian-like kernel [1,4,6,4,1] / 16.
 const weights=[1,4,6,4,1],scratch=new Float32Array(N);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(!mask[i]){scratch[i]=luma[i];continue;}
  let sum=0,den=0;
  for(let k=-2;k<=2;k++){
   const xx=Math.min(w-1,Math.max(0,x+k)),j=y*w+xx;
   if(mask[j]){sum+=luma[j]*weights[k+2];den+=weights[k+2];}
  }
  scratch[i]=sum/Math.max(1,den);
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(!mask[i]){low[i]=luma[i];continue;}
  let sum=0,den=0;
  for(let k=-2;k<=2;k++){
   const yy=Math.min(h-1,Math.max(0,y+k)),j=yy*w+x;
   if(mask[j]){sum+=scratch[j]*weights[k+2];den+=weights[k+2];}
  }
  low[i]=sum/Math.max(1,den);
 }
 let changedColor=0,changedNormal=0,sumDelta=0,maxDelta=0,valid=0;
 const read=(x,y,origin)=>{
  const xx=Math.max(0,Math.min(w-1,x)),yy=Math.max(0,Math.min(h-1,y)),j=yy*w+xx;
  return mask[j]?luma[j]-low[j]:luma[origin]-low[origin];
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(!mask[i])continue;valid++;
  const k=4*i,high=clamp(luma[i]-low[i],-35,35),gain=strength;
  // Enhance real source-image contrast at fine scale, not artificial lighting.
  let any=false;
  for(let ch=0;ch<3;ch++){
   const target=Math.round(clamp(pix[k+ch]+gain*high));
   if(target!==pix[k+ch])any=true;
   sumDelta+=Math.abs(target-pix[k+ch]);maxDelta=Math.max(maxDelta,Math.abs(target-pix[k+ch]));
   outColor[k+ch]=target;
  }
  if(any)changedColor++;
  // Image detail gradient in texture space, blended with pre-existing normal.
  const gx=(read(x+1,y,i)-read(x-1,y,i))/40,gy=(read(x,y+1,i)-read(x,y-1,i))/40;
  let nx=normal.pix[k]/127.5-1,ny=normal.pix[k+1]/127.5-1;
  nx=clamp(nx-normalStrength*gx,-.96,.96);ny=clamp(ny-normalStrength*gy,-.96,.96);
  const length=Math.hypot(nx,ny);
  if(length>.96){nx=nx*.96/length;ny=ny*.96/length;}
  const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
  const n=[Math.round((nx*.5+.5)*255),Math.round((ny*.5+.5)*255),Math.round((nz*.5+.5)*255)];
  for(let ch=0;ch<3;ch++)outNormal[k+ch]=n[ch];
  if(n.some((v,ch)=>v!==normal.pix[k+ch]))changedNormal++;
 }
 return {color:outColor,normal:outNormal,metrics:{validSourceUVPixels:valid,
  changedAlbedoPixels:changedColor,changedNormalPixels:changedNormal,
  averageAbsoluteRGB8Delta:sumDelta/Math.max(1,3*valid),maxRGB8Delta:maxDelta,
  imageLuminanceHighPass:true,artificialLightStrokes:false,strength,normalStrength}};
}
function build(input,outDir,strength=.38,normalStrength=.22){
 check(fs.existsSync(input),'source R36LU GLB missing');
 check(!fs.existsSync(outDir),'output destination already exists');
 const q=load(input),mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 check(mi>=0,'continuous body missing');
 const mesh=extract(q,mi,0),primitive=q.g.meshes[mi].primitives[0];
 check(mesh.indices.length===3396&&q.g.skins.some(s=>s.joints.length===63),'R36LS rig/body mismatch');
 let others=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)m.primitives.forEach(p=>others+=q.g.accessors[p.indices].count/3)});
 check(others===968,'face and hair budget mismatch');
 const mat=q.g.materials[primitive.material];
 const color=embedded(q,mat.pbrMetallicRoughness.baseColorTexture.index);
 const nor=embedded(q,mat.normalTexture.index);
 check(color.w===2048&&color.h===2048,'requires 2048 albedo');
 const mask=uvMask(mesh,2048,2048),modified=detail(color,nor,mask,{strength,normalStrength});
 check(modified.metrics.changedAlbedoPixels>1000,'no source texture detail was extracted');
 fs.mkdirSync(outDir,{recursive:true});
 const b=new Builder(q),results={};
 for(const [kind,bytes] of [['COLOR',modified.color],['NORMAL',modified.normal]]){
  const png=encodePNG(bytes,2048,2048),name='R36LV_IMAGE_DETAIL_'+kind+'_2048.png';
  fs.writeFileSync(path.join(outDir,name),png);
  const idx=b.addTexture(name,png);
  const m=b.g.materials[primitive.material];
  if(kind==='COLOR')m.pbrMetallicRoughness.baseColorTexture.index=idx;
  else m.normalTexture.index=idx;
  results[kind]={file:name,sha256:hash(png),bytes:png.length};
 }
 b.g.asset.generator='R36LV source-image high-frequency texture detail + normal rebake';
 const output=b.save(path.join(outDir,'R36LV_IMAGE_DETAIL_2100_FULL.glb'));
 const report={version:'R36LV',input:path.basename(input),inputSHA256:q.sha,
  output:path.basename(output.file),outputSHA256:output.sha,bytes:output.bytes,
  bodyTriangles:1132,faceHairTriangles:968,totalTriangles:2100,joints:63,
  meshPositionsUntouched:true,uvUntouched:true,skinWeightsUntouched:true,
  roughnessMapPreserved:true,detailMetrics:modified.metrics,maps:results,
  note:'Texture detail from source albedo frequencies; not reference image anatomical reconstruction',
  visualQA:'not run',S2QA:'not run'};
 fs.writeFileSync(path.join(outDir,'R36LV_IMAGE_DETAIL.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));return report;
}
if(require.main===module)try{
 const args=process.argv.slice(2);check(args.length>=2&&args.length<=4,'usage: node build_r36lv_image_detail.cjs input.glb outputDir [strength] [normalStrength]');
 build(args[0],args[1],args[2]==null?.38:Number(args[2]),args[3]==null?.22:Number(args[3]));
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={build,detail};
