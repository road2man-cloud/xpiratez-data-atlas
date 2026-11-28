'use strict';
/**
 * R36MM -- pure Node 22 CPU rasterizer of the REAL R36MK GLB mesh.
 *
 * This script is not a native Silent Storm / S2 Direct3D runtime. It ports:
 *  - GfxRender.cpp c3 packed normal decode (2*255/254, -256/254)
 *  - GfxShaders.txt CalcDirAmbLightDO directional + ambient model
 * Produces frontal/oblique/side full-body PNG images in CLAY and
 * SHADED modes, from actual triangle POSITION/NORMAL/COLOR attributes.
 *
 * No generated image proxy; no user PC execution; no Python.
 * node render_r36ml.cjs actual-r36mk.glb output-dir
 */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {load,values,extract}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const sharp=require('sharp');
const assert=(x,m)=>{if(!x)throw Error(m)};
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>mul(v,1/Math.max(1e-12,Math.hypot(...v)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const W=900,H=1120;
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0}
function chunk(tag,data){const h=Buffer.alloc(8),crc=Buffer.alloc(4);h.writeUInt32BE(data.length);h.write(tag,4);crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tag),data])));return Buffer.concat([h,data,crc]);}
function pngRGBA(w,h,pixels){
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(w);hdr.writeUInt32BE(h,4);hdr[8]=8;hdr[9]=6;
 const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)pixels.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',zlib.deflateSync(raw,{level:8})),chunk('IEND',Buffer.alloc(0))]);
}
function bounds(meshes){
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const m of meshes)for(const p of m.positions)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}
 return {min:lo,max:hi,center:mul(add(lo,hi),.5),size:sub(hi,lo)};
}

function originalNormalDecoded(n) {
 const packed=n.map(v=>Math.round(clamp((v+1)*127.5,0,255)));
 return unit(packed.map(v=>(v/255)*(2*255/254)-256/254));
}
function texturePixels(img,u,v) {
 if(!img)return [1,1,1,1];
 // GLTF UV origin bottom-left; sharp's pixel image top-left
 const x=clamp(u,0,1)*(img.width-1),y=(1-clamp(v,0,1))*(img.height-1);
 const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,i1=Math.min(i+1,img.width-1),j1=Math.min(j+1,img.height-1);
 const rgba=[0,0,0,0],bytes=img.data,w=img.width;
 for(const [xx,yy,wt] of [[i,j,(1-fx)*(1-fy)],[i1,j,fx*(1-fy)],[i,j1,(1-fx)*fy],[i1,j1,fx*fy]]){
  const index=4*(yy*w+xx);
  for(let c=0;c<4;c++)rgba[c]+=bytes[index+c]*wt/255;
 }
 return rgba;
}
async function readMaterials(q) {
 const textures=new Map();
 async function get(t){
  if(!t||t.index==null)return null;
  const idx=t.index;
  if(textures.has(idx))return textures.get(idx);
  const tx=q.g.textures?.[idx];
  assert(tx,'missing glTF texture '+idx);
  const im=q.g.images?.[tx.source];
  assert(im,'missing glTF image '+tx.source);
  if(im.uri)throw Error('external image URI is not supported; GLB should embed images');
  const bv=q.g.bufferViews[im.bufferView],off=bv.byteOffset||0;
  const bytes=q.bin.subarray(off,off+bv.byteLength);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert(info.channels===4,'decoder must yield RGBA');
  const obj={width:info.width,height:info.height,data,sourceTextureIndex:idx};
  textures.set(idx,obj);return obj;
 }
 const materials=[];
 for(let i=0;i<(q.g.materials||[]).length;i++){
  const mat=q.g.materials[i],pbr=mat.pbrMetallicRoughness||{};
  const result={name:mat.name||('material-'+i),colorFactor:pbr.baseColorFactor||[1,1,1,1],
   alphaMode:mat.alphaMode||'OPAQUE',alphaCutoff:mat.alphaCutoff??.5,
   normalScale:mat.normalTexture?.scale??1,aoStrength:mat.occlusionTexture?.strength??1,
   roughnessFactor:pbr.roughnessFactor??1,metallicFactor:pbr.metallicFactor??0,
   doubleSided:mat.doubleSided===true,
   base:await get(pbr.baseColorTexture),
   normal:await get(mat.normalTexture),
   mr:await get(pbr.metallicRoughnessTexture),
   ao:await get(mat.occlusionTexture),
   emissive:await get(mat.emissiveTexture),
   emissiveFactor:mat.emissiveFactor||[0,0,0]};
  materials.push(result);
 }
 return {materials,imageDecodes:textures.size,textureSummary:materials.map(x=>({
  name:x.name,base:!!x.base,normal:!!x.normal,roughness:!!x.mr,occlusion:!!x.ao,alphaMode:x.alphaMode,
  baseResolution:x.base?[x.base.width,x.base.height]:null,
  normalResolution:x.normal?[x.normal.width,x.normal.height]:null
 }))};
}
function getTangent(m,ids,weights,N,faceTangent) {
 const ts=m.tangents;
 let tangent=[0,0,0],hand=0;
 if(ts){
  for(let i=0;i<3;i++){const t=ts[ids[i]];tangent=add(tangent,mul(t.slice(0,3),weights[i]));hand+=t[3]*weights[i]}
 }else{tangent=faceTangent.slice();hand=1}
 tangent=sub(tangent,mul(N,dot(tangent,N)));
 if(Math.hypot(...tangent)<1e-8)tangent=cross(N,[0,0,1]);
 tangent=unit(tangent);
 return {t:tangent,b:mul(unit(cross(N,tangent)),hand<0?-1:1)};
}
function faceTangent(p,uv) {
 const dp1=sub(p[1],p[0]),dp2=sub(p[2],p[0]),du1=sub(uv[1],uv[0]),du2=sub(uv[2],uv[0]);
 const den=du1[0]*du2[1]-du1[1]*du2[0];
 if(Math.abs(den)<1e-9)return unit(dp1);
 return unit(mul(sub(mul(dp1,du2[1]),mul(dp2,du1[1])),1/den));
}
function raster(meshes,view,mode,bbox){
 const px=Buffer.alloc(W*H*4),depth=new Float64Array(W*H).fill(-Infinity);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=4*(y*W+x),d=0.5+0.5*y/H;
  px[i]=Math.round(21+12*d);px[i+1]=Math.round(25+13*d);px[i+2]=Math.round(32+15*d);px[i+3]=255;
 }
 const camera=unit(view==='front'?[0,-1,.12]:view==='oblique'?[.58,-1,.23]:[1,-.12,.17]);
 const right=unit(cross([0,0,1],camera)),up=unit(cross(camera,right));
 const center=bbox.center,scale=Math.min((H*.83)/Math.max(1e-6,bbox.size[2]),W*.77/Math.max(bbox.size[0],bbox.size[1],.4));
 const project=p=>{const q=sub(p,center);return [W/2+dot(q,right)*scale,H/2-dot(q,up)*scale,dot(q,camera)];};
 const light=unit([-.61,-.64,.68]),ambient=[.31,.32,.34],direct=[.72,.71,.68];
 let drawn=0,total=0,visible=0,degenerate=0,normalMapPixels=0,colorMapPixels=0,alphaDiscard=0,aoPixels=0;
 for(const m of meshes){
  const xy=m.positions.map(project),normals=m.normals.map(originalNormalDecoded),mat=m.materialInfo;
  for(let f=0;f<m.indices.length;f+=3){
   total++;const ids=m.indices.slice(f,f+3),P=ids.map(i=>xy[i]);
   if(ids.some(i=>!Number.isFinite(xy[i][0])))continue;
   const phys=ids.map(i=>m.positions[i]);
   const faceN=unit(cross(sub(phys[1],phys[0]),sub(phys[2],phys[0])));
   const den=(P[1][1]-P[2][1])*(P[0][0]-P[2][0])+(P[2][0]-P[1][0])*(P[0][1]-P[2][1]);
   if(Math.abs(den)<1e-10){degenerate++;continue}
   visible++;
   const uv=ids.map(i=>m.uvs[i]),faceT=faceTangent(phys,uv);
   const ax=Math.max(0,Math.floor(Math.min(...P.map(v=>v[0])))),bx=Math.min(W-1,Math.ceil(Math.max(...P.map(v=>v[0]))));
   const ay=Math.max(0,Math.floor(Math.min(...P.map(v=>v[1])))),by=Math.min(H-1,Math.ceil(Math.max(...P.map(v=>v[1]))));
   for(let y=ay;y<=by;y++)for(let x=ax;x<=bx;x++){
    const u=((P[1][1]-P[2][1])*(x+.5-P[2][0])+(P[2][0]-P[1][0])*(y+.5-P[2][1]))/den;
    const v=((P[2][1]-P[0][1])*(x+.5-P[2][0])+(P[0][0]-P[2][0])*(y+.5-P[2][1]))/den;
    const w=1-u-v;if(Math.min(u,v,w)<-1e-8)continue;
    const z=u*P[0][2]+v*P[1][2]+w*P[2][2],pixel=y*W+x;
    if(z<depth[pixel])continue;
    const weights=[u,v,w], texUV=uv.reduce((a,c,i)=>add(a,mul(c,weights[i])),[0,0]);
    let color=[.75,.68,.61],alpha=1;
    if(mode==='clay'){color=[.75,.77,.79]}
    else{
     if(mat.base){
      const sample=texturePixels(mat.base,...texUV);
      color=sample.slice(0,3).map((c,i)=>c*mat.colorFactor[i]);
      alpha=sample[3]*mat.colorFactor[3];colorMapPixels++;
     }else{
      color=mat.colorFactor.slice(0,3);
      if(m.colors){const vertex=ids.map(i=>m.colors[i]);color=color.map((c,k)=>c*vertex.reduce((s,vc,i)=>s+weights[i]*(vc[k]??1),0))}
      alpha=mat.colorFactor[3];
     }
     if(mat.alphaMode==='MASK'&&alpha<mat.alphaCutoff){alphaDiscard++;continue}
     if(mat.alphaMode==='BLEND'&&alpha<.35){alphaDiscard++;continue}
    }
    const smooth=unit(ids.reduce((a,i,k)=>add(a,mul(normals[i],weights[k])),[0,0,0]));
    let N=mode==='clay'?faceN:smooth;
    if(mode==='textured_normal'&&mat.normal){
     const sample=texturePixels(mat.normal,...texUV);
     const tx=clamp((sample[0]*2-1)*mat.normalScale,-1,1),ty=clamp((sample[1]*2-1)*mat.normalScale,-1,1);
     const tz=Math.sqrt(Math.max(0,1-tx*tx-ty*ty));
     const frame=getTangent(m,ids,weights,smooth,faceT);
     N=unit(add(add(mul(frame.t,tx),mul(frame.b,ty)),mul(smooth,tz)));
     normalMapPixels++;
    }
    let AO=1,roughness=mat.roughnessFactor;
    if(mode!=='clay'){
     if(mat.ao){const s=texturePixels(mat.ao,...texUV);AO=1-mat.aoStrength*(1-s[0]);aoPixels++}
     if(mat.mr){const s=texturePixels(mat.mr,...texUV);roughness*=s[1]}
    }
    const lit=Math.max(0,dot(N,light)),bounce=.22*Math.max(0,dot(N,[.45,.2,-.87]));
    const halfVector=unit(add(light,camera));
    const shine=Math.pow(Math.max(0,dot(N,halfVector)),2+Math.pow(1-clamp(roughness),2)*72);
    // The base texture is sRGB. Approximate linear lighting, then return to sRGB.
    const i=pixel*4;
    for(let k=0;k<3;k++){
     const surface=Math.pow(clamp(color[k]),2.2);
     const intensity=ambient[k]*AO+direct[k]*lit+bounce*.12;
     let value=surface*intensity+shine*(mode==='clay'?.02:.035*(1-clamp(roughness)))*(1-(mat.metallicFactor||0)*.4);
     if(mode!=='clay'&&mat.emissive){value+=mat.emissiveFactor[k]*texturePixels(mat.emissive,...texUV)[k]}
     px[i+k]=Math.round(255*Math.pow(clamp(value),1/2.2));
    }
    px[i+3]=255;depth[pixel]=z;drawn++;
   }
  }
 }
 return {png:pngRGBA(W,H,px),report:{view,mode,triangles:total,nondegenerateTriangles:visible,projectedDegenerate:degenerate,fragmentWrites:drawn,colorMapPixels,normalMapPixels,aoPixels,alphaDiscard,imageDimensions:[W,H]}};
}
async function main(file,out){
 assert(fs.existsSync(file),'R36MK GLB must exist locally');
 assert(!fs.existsSync(out),'Output directory exists; refusing overwrite');
 const q=load(file),meshes=[];
 const materialResult=await readMaterials(q),materials=materialResult.materials;
 let body=0,other=0;
 for(let mi=0;mi<q.g.meshes.length;mi++){
  const mesh=q.g.meshes[mi];
  for(let pi=0;pi<mesh.primitives.length;pi++){
   const prim=mesh.primitives[pi];if(prim.mode!=null&&prim.mode!==4)continue;
   const m=extract(q,mi,pi);m.name=mesh.name||'';
   if(!m.indices.length)continue;
   m.materialInfo=materials[prim.material]||{colorFactor:[.75,.67,.61,1],aoStrength:1,roughnessFactor:.75,metallicFactor:0,normalScale:1,alphaMode:'OPAQUE'};
   m.tangents=prim.attributes.TANGENT!=null?values(q,prim.attributes.TANGENT):null;
   if(m.name.includes('R36KP_CONTINUOUS_SKIN'))body+=m.indices.length/3;
   else other+=m.indices.length/3;
   meshes.push(m);
  }
 }
 assert(body===1132&&other===968,'Unexpected actual GLB triangle count: '+body+'/'+other);
 const box=bounds(meshes),images=[];
 fs.mkdirSync(out,{recursive:true});
 for(const mode of ['clay','textured','textured_normal'])for(const view of ['front','oblique','side']){
  const {png,report}=raster(meshes,view,mode,box);
  const name='R36MM_'+mode.toUpperCase()+'_'+view.toUpperCase()+'.png';
  fs.writeFileSync(path.join(out,name),png);
  images.push({...report,file:name,bytes:png.length,sha256:sha(png)});
 }
 const result={version:'R36MM',renderer:'Node CPU actual GLB with embedded glTF color/normal/ORM textures and S2-inspired illumination (NOT native S2)',sourceFile:path.basename(file),sourceSHA256:q.sha,totalTriangles:body+other,bodyTriangles:body,otherTriangles:other,meshCount:meshes.length,bounds:box,decodedImages:materialResult.imageDecodes,materials:materialResult.textureSummary,syntheticCamera:true,syntheticLighting:true,images,
 limitations:['no native Direct3D9','static glTF bind pose; skin animation not executed','alpha BLEND approximated by clip','no cast shadows or exact S2 game parameters','glTF PBR adapted to classic forward-light approximation; not exact native S2 shader']};
 fs.writeFileSync(path.join(out,'R36MM_RENDER.report.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({sourceSHA256:q.sha,totalTriangles:body+other,decodedImages:result.decodedImages,rendered:images.length,normalPixels:images.filter(x=>x.mode==='textured_normal').map(x=>x.normalMapPixels),files:images.map(x=>({name:x.file,bytes:x.bytes}))}));
}
if(require.main===module)main(process.argv[2],process.argv[3]).catch(e=>{console.error(e.stack||e);process.exitCode=1});
module.exports={main,readMaterials,raster};
