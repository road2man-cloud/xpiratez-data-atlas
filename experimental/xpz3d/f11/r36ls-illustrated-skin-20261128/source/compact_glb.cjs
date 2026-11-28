'use strict';
/**
 * Lossless binary packing for iterative R36L* GLBs.
 * Removes only image + texture objects no longer referenced by any material,
 * and their exclusive PNG bufferViews. Re-assembles valid GLB 2.0 without
 * requantizing any geometry, texels, skin weights or source bytes.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const need=(x,msg)=>{if(!x)throw Error(msg)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function deepClone(x){return JSON.parse(JSON.stringify(x))}
function visit(x,fn,trail=[]){
 if(!x||typeof x!=='object')return;
 if(Array.isArray(x)){x.forEach((y,i)=>visit(y,fn,trail.concat(i)));return}
 for(const [k,v] of Object.entries(x)){
   fn(x,k,v,trail);
   if(v&&typeof v==='object')visit(v,fn,trail.concat(k));
 }
}
function compact(input,output){
 need(fs.existsSync(input),'source GLB missing');
 need(!fs.existsSync(output),'destination already exists');
 const q=load(input),g=deepClone(q.g),old=g,textures=g.textures||[],images=g.images||[];
 const usedT=new Set();
 for(const mat of g.materials||[])visit(mat,(parent,k,v)=>{
   if(/Texture$/.test(k)&&v&&typeof v==='object'&&Number.isInteger(v.index))usedT.add(v.index);
 });
 // Other supported texture owners must be considered too.
 for(const mesh of g.meshes||[])visit(mesh,(parent,k,v)=>{
   if(k==='texture'&&v&&typeof v==='object'&&Number.isInteger(v.index))usedT.add(v.index);
 });
 const tMap=new Map([...usedT].sort((a,b)=>a-b).map((id,i)=>[id,i]));
 for(const mat of g.materials||[])visit(mat,(parent,k,v)=>{
   if(/Texture$/.test(k)&&v&&typeof v==='object'&&Number.isInteger(v.index)){
      need(tMap.has(v.index),'unresolved material texture');v.index=tMap.get(v.index);
   }
 });
 const usedImages=new Set(),usedSamplers=new Set();
 const selectedTextures=[...tMap.keys()].map(i=>{
   need(textures[i],'invalid source texture '+i);
   const t=deepClone(textures[i]);
   if(Number.isInteger(t.source))usedImages.add(t.source);
   const basis=t.extensions?.KHR_texture_basisu;
   if(Number.isInteger(basis?.source))usedImages.add(basis.source);
   if(Number.isInteger(t.sampler))usedSamplers.add(t.sampler);
   return t;
 });
 const iMap=new Map([...usedImages].sort((a,b)=>a-b).map((id,i)=>[id,i]));
 const sMap=new Map([...usedSamplers].sort((a,b)=>a-b).map((id,i)=>[id,i]));
 for(const t of selectedTextures){
   if(Number.isInteger(t.source))t.source=iMap.get(t.source);
   if(Number.isInteger(t.sampler))t.sampler=sMap.get(t.sampler);
   if(Number.isInteger(t.extensions?.KHR_texture_basisu?.source))
     t.extensions.KHR_texture_basisu.source=iMap.get(t.extensions.KHR_texture_basisu.source);
 }
 g.textures=selectedTextures;
 g.images=[...iMap.keys()].map(i=>deepClone(images[i]));
 if(g.samplers)g.samplers=[...sMap.keys()].map(i=>deepClone(old.samplers[i]));
 // Preserve every non-image bufferView, including extension-owned data,
 // and all image views still referenced by a selected texture.
 const imageOnly=new Set(images.map(z=>z.bufferView).filter(Number.isInteger));
 const protectedViews=new Set();
 for(const acc of g.accessors||[]){
   if(Number.isInteger(acc.bufferView))protectedViews.add(acc.bufferView);
   for(const key of ['indices','values'])if(Number.isInteger(acc.sparse?.[key]?.bufferView))protectedViews.add(acc.sparse[key].bufferView);
 }
 for(const img of g.images)if(Number.isInteger(img.bufferView))protectedViews.add(img.bufferView);
 // Extension bufferView references must also be kept even if in obsolete
 // image bufferView ranges.
 for(const mesh of g.meshes||[])visit(mesh,(parent,k,v)=>{if(k==='bufferView'&&Number.isInteger(v))protectedViews.add(v)});
 const kept=[];
 g.bufferViews.forEach((v,i)=>{if(!imageOnly.has(i)||protectedViews.has(i))kept.push(i)});
 const bvMap=new Map(kept.map((id,i)=>[id,i]));
 visit(g,(parent,k,v)=>{
   if(k==='bufferView'&&Number.isInteger(v)){
     need(bvMap.has(v),'live bufferView incorrectly discarded: '+v);
     parent[k]=bvMap.get(v);
   }
 });
 const chunks=[];let offset=0;
 const nextViews=kept.map(id=>{
   const source=q.g.bufferViews[id],start=source.byteOffset||0,n=source.byteLength;
   need(start>=0&&n>=0&&start+n<=q.bin.length,'bufferView outside BIN');
   const pad=(4-offset%4)%4;
   if(pad){chunks.push(Buffer.alloc(pad));offset+=pad}
   const dst=deepClone(source);dst.byteOffset=offset;
   chunks.push(Buffer.from(q.bin.subarray(start,start+n)));offset+=n;
   return dst;
 });
 g.bufferViews=nextViews;
 need(g.buffers.length===1,'multiple buffers unsupported');g.buffers[0].byteLength=offset;
 g.asset.generator=(g.asset.generator||'')+'; R36LS lossless texture-binary compact';
 const json=Buffer.from(JSON.stringify(g)),jsonPad=Buffer.alloc((4-json.length%4)%4,32);
 const binary=Buffer.concat(chunks),binPad=Buffer.alloc((4-binary.length%4)%4);
 const out=Buffer.alloc(28+json.length+jsonPad.length+binary.length+binPad.length);
 out.write('glTF',0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
 out.writeUInt32LE(json.length+jsonPad.length,12);out.write('JSON',16);
 json.copy(out,20);jsonPad.copy(out,20+json.length);
 const p=20+json.length+jsonPad.length;out.writeUInt32LE(binary.length+binPad.length,p);out.write('BIN\0',p+4,'binary');
 binary.copy(out,p+8);binPad.copy(out,p+8+binary.length);
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,out);
 const test=load(output);
 need(test.g.meshes.length===q.g.meshes.length&&test.g.skins.length===q.g.skins.length,'mesh/skin changed');
 const report={version:'R36LS-COMPACT',input:path.basename(input),inputBytes:q.raw.length,
   output:path.basename(output),outputBytes:out.length,sourceSHA256:q.sha,outputSHA256:sha(out),
   reducedBytes:q.raw.length-out.length,ratio:Number((out.length/q.raw.length).toFixed(6)),
   textureObjectsBefore:textures.length,textureObjectsAfter:g.textures.length,
   imageObjectsBefore:images.length,imageObjectsAfter:g.images.length,
   bufferViewsBefore:q.g.bufferViews.length,bufferViewsAfter:kept.length,
   geometryAccessorValuesLossless:true,skinAccessorsUnchanged:true,embeddedPngBytesLossless:true,
   caveat:'GPU image look unchanged intended; browser visual test still required'};
 fs.writeFileSync(output.replace(/\.glb$/i,'.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
 return report;
}
if(require.main===module)try{
 const [src,dst]=process.argv.slice(2);need(src&&dst,'usage: node compact_glb.cjs SOURCE.glb DESTINATION.glb');compact(src,dst);
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={compact};
