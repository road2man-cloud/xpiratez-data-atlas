'use strict';
/**
 * R36LU: image-pixel UV island padding for R36LS (no painted shading).
 * Copies genuine albedo, tangent normals and ORM texels outward from UV
 * triangle coverage to protect details from bilinear / mip-map bleeding.
 * Exactly preserves in-UV texels and every mesh, joint, skin and UV accessor.
 *
 * usage: node build_r36lu_uv_gutter.cjs IN.glb OUT_DIR [8]
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const ok=(x,s)=>{if(!x)throw Error(s);};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function embed(q,id){
 const tex=q.g.textures[id],img=q.g.images[tex.source];ok(img.mimeType==='image/png'&&Number.isInteger(img.bufferView),'embedded PNG expected');
 const v=q.g.bufferViews[img.bufferView],start=v.byteOffset||0;return decodePNG(q.bin.subarray(start,start+v.byteLength));
}
function uvMask(mesh,w,h){
 const mask=new Uint8Array(w*h),indices=mesh.indices,uv=mesh.uvs;
 for(let i=0;i<indices.length;i+=3){
  const pts=[0,1,2].map(k=>[uv[indices[i+k]][0]*w,(1-uv[indices[i+k]][1])*h]);
  const den=(pts[1][1]-pts[2][1])*(pts[0][0]-pts[2][0])+(pts[2][0]-pts[1][0])*(pts[0][1]-pts[2][1]);
  if(Math.abs(den)<1e-9)continue;
  const x0=Math.max(0,Math.floor(Math.min(...pts.map(p=>p[0])))),x1=Math.min(w-1,Math.ceil(Math.max(...pts.map(p=>p[0]))));
  const y0=Math.max(0,Math.floor(Math.min(...pts.map(p=>p[1])))),y1=Math.min(h-1,Math.ceil(Math.max(...pts.map(p=>p[1]))));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const xp=x+.5,yp=y+.5;
   const a=((pts[1][1]-pts[2][1])*(xp-pts[2][0])+(pts[2][0]-pts[1][0])*(yp-pts[2][1]))/den;
   const b=((pts[2][1]-pts[0][1])*(xp-pts[2][0])+(pts[0][0]-pts[2][0])*(yp-pts[2][1]))/den;
   if(Math.min(a,b,1-a-b)>=-1e-7)mask[y*w+x]=1;
  }
 }
 return mask;
}
function nearestOwners(mask,w,h,radius){
 const n=w*h,owner=new Int32Array(n),dist=new Uint8Array(n),queue=new Int32Array(n);owner.fill(-1);
 let head=0,tail=0,inside=0;
 for(let i=0;i<n;i++)if(mask[i]){owner[i]=i;queue[tail++]=i;inside++;}
 ok(inside>0,'no UV island raster pixels');
 while(head<tail){
  const i=queue[head++],d=dist[i];if(d>=radius)continue;
  const x=i%w,y=(i/w)|0;
  for(let dy=-1;dy<=1;dy++){
   const ny=y+dy;if(ny<0||ny>=h)continue;
   for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dy===0)continue;
    const nx=x+dx;if(nx<0||nx>=w)continue;
    const j=ny*w+nx;
    if(owner[j]>=0)continue;
    owner[j]=owner[i];dist[j]=d+1;queue[tail++]=j;
   }
  }
 }
 return {owner,covered:tail,inside};
}
function padMap(png,nearest){
 const {owner,inside}=nearest,src=png.pix,n=png.w*png.h;
 ok(n===owner.length&&src.length===n*4,'map/UV raster dimensions differ');
 const dst=Buffer.from(src);let touched=0,changed=0;
 for(let i=0;i<n;i++){
  const source=owner[i];if(source<0||source===i)continue;
  touched++;const a=i*4,b=source*4;
  let diff=false;
  for(let k=0;k<4;k++){if(dst[a+k]!==src[b+k])diff=true;dst[a+k]=src[b+k];}
  if(diff)changed++;
 }
 return {bytes:dst,filledPixels:touched,changedPixels:changed,unchangedOriginalUVPixels:inside};
}
function build(input,outDir,pad=8){
 ok(fs.existsSync(input),'input GLB not found');
 ok(!fs.existsSync(outDir),'output directory exists');
 ok(Number.isInteger(pad)&&pad>=1&&pad<=24,'pad must be integer 1..24');
 const q=load(input),mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 ok(mi>=0,'body not found');
 const body=extract(q,mi,0);ok(body.indices.length===3396,'body 1132 triangles required');
 ok(q.g.skins.some(s=>s.joints.length===63),'63 joints required');
 let others=0;q.g.meshes.forEach((m,j)=>{if(j!==mi)for(const p of m.primitives)others+=q.g.accessors[p.indices].count/3;});
 ok(others===968,'head/hair triangle budget mismatch');
 const materialId=q.g.meshes[mi].primitives[0].material,mat=q.g.materials[materialId];
 const ids={color:mat.pbrMetallicRoughness.baseColorTexture.index,normal:mat.normalTexture.index,orm:mat.pbrMetallicRoughness.metallicRoughnessTexture.index};
 const src={};for(const k of Object.keys(ids))src[k]=embed(q,ids[k]);
 const w=src.color.w,h=src.color.h;ok(w===2048&&h===2048,'2048 atlas expected');
 for(const k of ['normal','orm'])ok(src[k].w===w&&src[k].h===h,'texture dimensions mismatch');
 const nearest=nearestOwners(uvMask(body,w,h),w,h,pad),builder=new Builder(q),result={};
 fs.mkdirSync(outDir,{recursive:true});
 for(const kind of ['color','normal','orm']){
  const filled=padMap(src[kind],nearest),png=encodePNG(filled.bytes,w,h);
  const file='R36LU_UVGUTTER_'+kind.toUpperCase()+'_2048.png';
  fs.writeFileSync(path.join(outDir,file),png);
  const id=builder.addTexture('R36LU_PADDED_'+kind.toUpperCase(),png);
  if(kind==='color')builder.g.materials[materialId].pbrMetallicRoughness.baseColorTexture.index=id;
  if(kind==='normal')builder.g.materials[materialId].normalTexture.index=id;
  if(kind==='orm'){
   builder.g.materials[materialId].pbrMetallicRoughness.metallicRoughnessTexture.index=id;
   if(builder.g.materials[materialId].occlusionTexture)builder.g.materials[materialId].occlusionTexture.index=id;
  }
  result[kind]={file,pngSHA256:sha(png),bytes:png.length,filledPixels:filled.filledPixels,
   changedPixels:filled.changedPixels,originalUVPixelsPreserved:filled.unchangedOriginalUVPixels};
 }
 builder.g.asset.generator='R36LU photo/albedo image UV island gutter fill; UV-covered texels identical to R36LS';
 builder.g.extras={...(builder.g.extras||{}),r36lu:{inputSHA256:q.sha,padRadius:pad,sourceModel:'R36LS COMPACT',maps:result}};
 const glb=builder.save(path.join(outDir,'R36LU_UVGUTTER_2100_FULL.glb'));
 const report={version:'R36LU-UVGUTTER',input:path.basename(input),inputSHA256:q.sha,
  glb:path.basename(glb.file),glbSHA256:glb.sha,glbBytes:glb.bytes,bodyTriangles:1132,
  headHairTriangles:others,totalTriangles:2100,rigJoints:63,padRadius:pad,
  selectedOriginalUVPixels:nearest.inside,paddedUVPixels:nearest.covered-nearest.inside,
  insideUVBytesBitExact:true,geometryAndSkinUnmodified:true,maps:result,
  visualQA:'not run',S2EngineQA:'not run',
  limitation:'Image seam padding only; no new anatomical shape or painted reference added'};
 fs.writeFileSync(path.join(outDir,'R36LU_UVGUTTER.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({glb:glb.file,glbSHA256:glb.sha,paddedPixels:report.paddedUVPixels,
  maps:Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.changedPixels]))}));
 return report;
}
if(require.main===module)try{
 const args=process.argv.slice(2);ok(args.length>=2&&args.length<=3,'usage: node build_r36lu_uv_gutter.cjs IN.glb OUT_DIR [pad]');
 build(args[0],args[1],args[2]==null?8:Number(args[2]));
}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={build,uvMask,nearestOwners,padMap};
