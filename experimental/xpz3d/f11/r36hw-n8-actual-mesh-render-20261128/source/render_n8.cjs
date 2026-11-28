'use strict';
/**
 * R36HW-N8 direct-GLB actual mesh diagnostic rasterizer, extended from R36ML.
 *
 * This script is not a native Silent Storm / S2 Direct3D runtime. It ports:
 *  - GfxRender.cpp c3 packed normal decode (2*255/254, -256/254)
 *  - GfxShaders.txt CalcDirAmbLightDO directional + ambient model
 * Produces frontal/oblique/side full-body PNG images in CLAY and
 * SHADED modes, from actual triangle POSITION/NORMAL/COLOR attributes.
 *
 * No generated image proxy; no user PC execution; no Python.
 * node render_n6.cjs actual-r36hw-n6.glb output-dir
 */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {load,values,extract}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
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
function colorOf(m,i,mode){
 if(mode==='clay')return [0.74,0.77,0.79];
 if(m.colors){
  const color=m.colors[i];if(color && color.length>=3)return color.slice(0,3).map(x=>clamp(x));
 }
 if(/hair/i.test(m.name))return [0.42,0.34,0.26];
 if(/face|eye|lash|brow/i.test(m.name))return [0.76,0.64,0.57];
 return [0.75,0.67,0.61];
}
function originalNormalDecoded(n){
 // Source math: c3 = (2*255/254, -256/254, 0, 0).
 // Encode float to the nearest vertex normal byte only for CPU test.
 const packed=n.map(v=>Math.round(clamp((v+1)*127.5,0,255)));
 return unit(packed.map(v=>(v/255)*(2*255/254)-256/254));
}
function raster(meshes,view,mode,bbox,focus='full'){
 const px=Buffer.alloc(W*H*4),depth=new Float64Array(W*H).fill(-Infinity);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=4*(y*W+x),d=0.5+0.5*y/H;
  px[i]=Math.round(21+12*d);px[i+1]=Math.round(25+13*d);px[i+2]=Math.round(32+15*d);px[i+3]=255;
 }
 // S2 coordinate convention (+Z up; -Y front) verified in source project's preview.
 const camera=unit(view==='front'?[0,-1,.12]:view==='oblique'?[.58,-1,.23]:[1,-.12,.17]);
 const right=unit(cross([0,0,1],camera)),up=unit(cross(camera,right));
 const center=focus==='detail'?[0,-.073,.914]:bbox.center,objectHeight=focus==='detail'?.55:bbox.size[2],width=focus==='detail'?.51:Math.max(bbox.size[0],bbox.size[1],.4),scale=Math.min((H*.83)/Math.max(1e-6,objectHeight),W*.77/width);
 const project=p=>{const q=sub(p,center);return [W/2+dot(q,right)*scale,H/2-dot(q,up)*scale,dot(q,camera)];};
 const light=unit([-.61,-.64,.68]),ambient=[.31,.32,.34],direct=[.72,.71,.68];
 let drawn=0,total=0,visible=0,culled=0,normalMean=0;
 for(const m of meshes){
  const xy=m.positions.map(project),normals=m.normals.map(originalNormalDecoded);
  for(let f=0;f<m.indices.length;f+=3){
   total++;const ids=m.indices.slice(f,f+3),P=ids.map(i=>xy[i]);
   if(ids.some(i=>!Number.isFinite(xy[i][0])))continue;
   const phys=ids.map(i=>m.positions[i]);
   let faceN=unit(cross(sub(phys[1],phys[0]),sub(phys[2],phys[0])));
   // No culling: GLB double-sided conventions and reversed winding can vary.
   const den=(P[1][1]-P[2][1])*(P[0][0]-P[2][0])+(P[2][0]-P[1][0])*(P[0][1]-P[2][1]);
   if(Math.abs(den)<1e-10){culled++;continue;}
   visible++;
   const ax=Math.max(0,Math.floor(Math.min(...P.map(v=>v[0])))),bx=Math.min(W-1,Math.ceil(Math.max(...P.map(v=>v[0]))));
   const ay=Math.max(0,Math.floor(Math.min(...P.map(v=>v[1])))),by=Math.min(H-1,Math.ceil(Math.max(...P.map(v=>v[1]))));
   const material=ids.map(i=>colorOf(m,i,mode));
   for(let y=ay;y<=by;y++)for(let x=ax;x<=bx;x++){
    const u=((P[1][1]-P[2][1])*(x+.5-P[2][0])+(P[2][0]-P[1][0])*(y+.5-P[2][1]))/den;
    const v=((P[2][1]-P[0][1])*(x+.5-P[2][0])+(P[0][0]-P[2][0])*(y+.5-P[2][1]))/den;
    const w=1-u-v;if(Math.min(u,v,w)<-1e-8)continue;
    const z=u*P[0][2]+v*P[1][2]+w*P[2][2],pixel=y*W+x;
    if(z<depth[pixel])continue;
    const weights=[u,v,w];
    const smoothed=unit(ids.reduce((a,i,k)=>add(a,mul(normals[i],weights[k])),[0,0,0]));
    const geometric=faceN;
    const normal=smoothed; // N7B clay now respects actual GLB vertex normals; face-normal diagnostic is not representative of the smoothed native model.
    const lit=Math.max(0,dot(normal,light)),base=material[0].map((_,k)=>material.reduce((s,c,j)=>s+weights[j]*c[k],0));
    const i=pixel*4;
    for(let k=0;k<3;k++)px[i+k]=Math.round(255*clamp(base[k]*(ambient[k]+direct[k]*lit)));
    px[i+3]=255;depth[pixel]=z;drawn++;normalMean+=lit;
   }
  }
 }
 return {png:pngRGBA(W,H,px),report:{view,mode,focus,triangles:total,nondegenerateTriangles:visible,projectedDegenerate:culled,fragmentWrites:drawn,meanDirectionalTerm:normalMean/Math.max(drawn,1),imageDimensions:[W,H]}};
}
function main(file,out){
 assert(fs.existsSync(file),'R36HW-N8 GLB must exist in Actions checkout');
 const expected='4964f36cf81f6fba4009b75a4813cb08e18469988475301aadccecb089be4ceb';
 assert(sha(fs.readFileSync(file))===expected,'N7B corrected hem geometry SHA required (not the 72mm prototype)');
 assert(!fs.existsSync(out),'Output directory exists; refusing overwrite');
 const q=load(file),meshes=[];
 let body=0,other=0;
 for(let mi=0;mi<q.g.meshes.length;mi++){
  const mesh=q.g.meshes[mi];
  for(let pi=0;pi<mesh.primitives.length;pi++){
   const prim=mesh.primitives[pi];if(prim.mode!=null&&prim.mode!==4)continue;
   const m=extract(q,mi,pi);m.name=q.g.materials[prim.material]?.name||mesh.name||'';
   if(!m.indices.length)continue;
   if([2,3,4,5,6,9].includes(pi))body+=m.indices.length/3;
   else other+=m.indices.length/3;
   meshes.push(m);
  }
 }
 assert(body===1142&&other===956,'Unexpected N7B triangle count: '+body+'/'+other);
 const box=bounds(meshes),images=[];
 fs.mkdirSync(out,{recursive:true});
 for(const mode of ['clay','shaded'])for(const view of ['front','oblique','side'])for(const focus of ['full','detail']){
  const {png,report}=raster(meshes,view,mode,box,focus);
  const name='R36HW_N8_'+mode.toUpperCase()+'_'+view.toUpperCase()+'_'+focus.toUpperCase()+'.png';
  fs.writeFileSync(path.join(out,name),png);
  images.push({...report,file:name,bytes:png.length,sha256:sha(png)});
 }
 const result={version:'R36HW-N8-CPU',renderer:'pure Node CPU diagnostic rasterizer of actual N7B GLB triangles (S2-source-inspired illumination; NOT native S2)',sourceFile:path.basename(file),sourceSHA256:q.sha,totalTriangles:body+other,bodyTriangles:body,otherTriangles:other,bodyMeshCount:meshes.length,bounds:box,sourceShaderMath:['CalcNormal packed normalization approximation','CalcDirAmbLightDO direct + ambient'],syntheticCamera:true,syntheticLighting:true,images,limitations:['static glTF bind-pose positions; no animated skinning','does not sample embedded N4 baseColor PNG, micro-normal atlas, ORM, or native S2 bump shader','not Direct3D 9 execution or screenshot']};
 fs.writeFileSync(path.join(out,'R36HW_N8_RENDER.report.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({sourceSHA256:q.sha,body,other,rendered:images.length,files:images.map(x=>({name:x.file,bytes:x.bytes}))}));
}
if(require.main===module)try{assert(process.argv.length===4,'usage: node render_n6.cjs input-glb outdir');main(process.argv[2],process.argv[3]);}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={main};
