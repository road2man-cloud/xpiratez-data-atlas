'use strict';
/**
 * R36LW: compositing ACTUAL retouched RGBA island PNGs onto R36LV body atlas.
 * No invented shading or anatomical geometry. Uses measured R36LT UV coordinates.
 * Optional per-island NORMAL PNG, authored externally (tangent-space RGB).
 *
 * CLI node apply_uv_patches.cjs model.glb uv-template-dir patches-dir output-dir
 * patches are named <stem>_COLOR.png and optional <stem>_NORMAL.png.
 * A cropped MASK from uv-template-dir is mandatory; only masked pixels transfer.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG}=require('./png_rgba.cjs');
const {encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const assert=(v,msg)=>{if(!v)throw Error(msg)};
const clamp=x=>Math.max(0,Math.min(1,x));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function embedded(q,tid){
 const tex=q.g.textures[tid],im=q.g.images[tex.source];
 assert(im.mimeType==='image/png'&&Number.isInteger(im.bufferView),'embedded PNG expected');
 const v=q.g.bufferViews[im.bufferView],start=v.byteOffset||0;
 return decodePNG(q.bin.subarray(start,start+v.byteLength));
}
function blendCrop(atlas,patch,mask,bounds,ownership){
 const {x,y,width,height}=bounds;
 assert(width===patch.w&&height===patch.h&&mask.w===width&&mask.h===height,'crop size mismatch');
 assert(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x+width<=atlas.w&&y+height<=atlas.h,'crop outside atlas');
 let touched=0,changed=0;
 for(let iy=0;iy<height;iy++)for(let ix=0;ix<width;ix++){
  const p=(iy*width+ix)*4;
  const a=clamp(patch.pix[p+3]/255)*clamp(mask.pix[p+3]/255);
  if(a<1/255)continue;
  const k=(y+iy)*atlas.w+(x+ix),o=k*4;
  assert(!ownership[k],'UV patch overlap: '+(x+ix)+','+(y+iy));
  ownership[k]=1;touched++;let delta=0;
  for(let c=0;c<3;c++){
   const old=atlas.pix[o+c],value=Math.round(old*(1-a)+patch.pix[p+c]*a);
   delta+=Math.abs(value-old);atlas.pix[o+c]=value;
  }
  if(delta)changed++;
 }
 return {touched,changed};
}
function build(model,templates,patches,outDir){
 for(const p of [model,templates,patches])assert(fs.existsSync(p),'missing input '+p);
 assert(!fs.existsSync(outDir),'output exists, refusing overwrite');
 const report=JSON.parse(fs.readFileSync(path.join(templates,'R36LT_UV_ISLANDS.report.json'),'utf8'));
 const q=load(model),mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 assert(mi>=0,'continuous body missing');
 const mesh=extract(q,mi,0);
 assert(mesh.indices.length===3396&&q.g.skins.some(s=>s.joints.length===63),'body/rig mismatch');
 let rest=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)for(const p of m.primitives)rest+=q.g.accessors[p.indices].count/3});
 assert(rest===968,'head/hair triangle mismatch');
 const p=q.g.meshes[mi].primitives[0],mat=q.g.materials[p.material],body=embedded(q,mat.pbrMetallicRoughness.baseColorTexture.index),
  normal=embedded(q,mat.normalTexture.index);
 assert(body.w===2048&&body.h===2048&&normal.w===2048&&normal.h===2048,'expected 2048 maps');
 assert(report.sourceAtlas?.[0]===2048&&report.sourceAtlas?.[1]===2048,'unexpected UV template atlas');
 const entries=[],seenColor=new Uint8Array(2048*2048),seenNormal=new Uint8Array(2048*2048);
 let colorChanged=0,normalChanged=0,applied=0,missing=0;
 for(const side of report.output){
  for(const item of side.islands){
   const mask=decodePNG(fs.readFileSync(path.join(templates,item.maskFile)));
   for(const kind of ['COLOR','NORMAL']){
    const pathname=path.join(patches,item.stem+'_'+kind+'.png');
    if(!fs.existsSync(pathname)){missing++;continue}
    const img=decodePNG(fs.readFileSync(pathname));
    const map=kind==='COLOR'?body:normal,seen=kind==='COLOR'?seenColor:seenNormal;
    const result=blendCrop(map,img,mask,item.atlasBounds,seen);
    if(kind==='COLOR')colorChanged+=result.changed;else normalChanged+=result.changed;
    entries.push({source:path.basename(pathname),kind,sha256:sha(fs.readFileSync(pathname)),...result});
    applied++;
   }
  }
 }
 assert(applied>0,'no edited PNG patches found');
 assert(colorChanged+normalChanged>0,'patched image pixels identical to original; refusing empty variant');
 fs.mkdirSync(outDir,{recursive:true});
 const builder=new Builder(q),outputMaps={};
 for(const [kind,pix] of [['COLOR',body.pix],['NORMAL',normal.pix]]){
  const image=encodePNG(pix,2048,2048),file='R36LW_UV_PATCH_'+kind+'_2048.png';
  fs.writeFileSync(path.join(outDir,file),image);
  const idx=builder.addTexture('R36LW_'+kind,image);
  if(kind==='COLOR')builder.g.materials[p.material].pbrMetallicRoughness.baseColorTexture.index=idx;
  else builder.g.materials[p.material].normalTexture.index=idx;
  outputMaps[kind]={file,sha256:sha(image),bytes:image.length};
 }
 builder.g.asset.generator='R36LW measured UV-island image pixel compositing, preserving original mesh/skin';
 const out=builder.save(path.join(outDir,'R36LW_PATCHED_2100_FULL.glb'));
 const result={version:'R36LW',sourceModel:path.basename(model),sourceSHA256:q.sha,
  model: path.basename(out.file),modelSHA256:out.sha,modelBytes:out.bytes,
  triangles:2100,joints:63,geometryUntouched:true,uvUntouched:true,skinWeightsUntouched:true,
  editedPatchCount:applied,unprovidedPatchCount:missing,colorChangedPixels:colorChanged,normalChangedPixels:normalChanged,
  maps:outputMaps,patches:entries,rendererQA:'not run',S2QA:'not run'};
 fs.writeFileSync(path.join(outDir,'R36LW_PATCHED.report.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({model:out.file,sha256:out.sha,patches:applied,colorChanged,normalChanged}));
 return result;
}
if(require.main===module)try{
 assert(process.argv.length===6,'usage: node apply_uv_patches.cjs IN.glb UV_TEMPLATE_DIR EDITED_PNG_DIR OUT_DIR');
 build(...process.argv.slice(2));
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={blendCrop,build};
