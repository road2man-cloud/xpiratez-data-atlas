'use strict';
/**
 * R36ML true R36MK GLB mesh CPU rasterizer using S2 source-derived
 * directional/ambient light and packed normal decode constants.
 * This is an S2-INSPIRED offline render, not native Direct3D execution.
 *
 * node render_r36ml.cjs INPUT.glb OUTPUT_DIR [ART_DENSE]
 * No network, browser, npm or Python needed.
 */
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const {load,extract}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const ensure=(v,m)=>{if(!v)throw Error(m)};
const clip=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const d=Math.hypot(...a);return d<1e-9?[0,0,1]:mul(a,1/d)};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const crc32=b=>{let c=0xffffffff;for(let i=0;i<b.length;i++){c^=b[i];for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0};
function chunk(tag,b){const h=Buffer.alloc(8),end=Buffer.alloc(4);h.writeUInt32BE(b.length);h.write(tag,4);end.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tag),b])));return Buffer.concat([h,b,end])}
function encodePNG(pix,w,h){
 const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)pix.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);
 const meta=Buffer.alloc(13);meta.writeUInt32BE(w);meta.writeUInt32BE(h,4);meta[8]=8;meta[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',meta),
   chunk('IDAT',zlib.deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
function decodePNG(b){
 ensure(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'embedded texture not PNG');
 let off=8,w=0,h=0,depth=0,type=0,interlace=0,palette=null,trans=null;
 const idats=[];
 while(off+12<=b.length){const size=b.readUInt32BE(off),tag=b.toString('ascii',off+4,off+8),data=b.subarray(off+8,off+8+size);off+=12+size;
  if(tag==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);depth=data[8];type=data[9];interlace=data[12];}
  if(tag==='PLTE')palette=data;if(tag==='tRNS')trans=data;
  if(tag==='IDAT')idats.push(data);if(tag==='IEND')break;
 }
 ensure(depth===8&&interlace===0&&w>0&&h>0,'unsupported texture PNG encoding');
 const channels={0:1,2:3,3:1,4:2,6:4}[type];ensure(channels,'unsupported PNG color type '+type);
 const stride=w*channels,raw=zlib.inflateSync(Buffer.concat(idats)),decoded=Buffer.alloc(stride*h);
 let ptr=0;for(let y=0;y<h;y++){const f=raw[ptr++],row=y*stride;
  for(let k=0;k<stride;k++){const a=k>=channels?decoded[row+k-channels]:0,p=y?decoded[row+k-stride]:0,c=y&&k>=channels?decoded[row+k-stride-channels]:0;
   let v=raw[ptr++];if(f===1)v+=a;else if(f===2)v+=p;else if(f===3)v+=Math.floor((a+p)/2);
   else if(f===4){const q=a+p-c,da=Math.abs(q-a),db=Math.abs(q-p),dc=Math.abs(q-c);v+=(da<=db&&da<=dc)?a:db<=dc?p:c;}
   else ensure(f===0,'bad PNG filter '+f);decoded[row+k]=v&255;
  }
 }
 const pix=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){
  const j=i*channels,k=i*4;
  if(type===6){for(let q=0;q<4;q++)pix[k+q]=decoded[j+q];}
  else if(type===2){for(let q=0;q<3;q++)pix[k+q]=decoded[j+q];pix[k+3]=255;}
  else if(type===0){pix[k]=pix[k+1]=pix[k+2]=decoded[j];pix[k+3]=255;}
  else if(type===4){pix[k]=pix[k+1]=pix[k+2]=decoded[j];pix[k+3]=decoded[j+1];}
  else if(type===3){const j0=decoded[j];pix[k]=palette[j0*3]??255;pix[k+1]=palette[j0*3+1]??255;pix[k+2]=palette[j0*3+2]??255;pix[k+3]=trans?.[j0]??255;}
 }
 return {w,h,pix};
}
const textureCache=new Map();
function texture(q,mat){
 const tid=mat?.pbrMetallicRoughness?.baseColorTexture?.index;
 if(tid==null)return null;if(textureCache.has(tid))return textureCache.get(tid);
 try{
  const tex=q.g.textures[tid],image=q.g.images[tex.source],v=q.g.bufferViews[image.bufferView];
  if(image.mimeType!=='image/png')throw Error('not PNG');
  const png=decodePNG(q.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));
  textureCache.set(tid,png);return png;
 }catch(e){console.warn('texture fallback:',tid,String(e));textureCache.set(tid,null);return null;}
}
function colorAt(t,uv){
 if(!t)return [204,188,174,255];
 const x=clip(uv[0],0,1)*(t.w-1),y=(1-clip(uv[1],0,1))*(t.h-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,t.w-1),y1=Math.min(y0+1,t.h-1);
 const tx=x-x0,ty=y-y0,r=[0,0,0,0];
 for(const [xx,yy,wt] of [[x0,y0,(1-tx)*(1-ty)],[x1,y0,tx*(1-ty)],[x0,y1,(1-tx)*ty],[x1,y1,tx*ty]]){
  const k=(yy*t.w+xx)*4;for(let i=0;i<4;i++)r[i]+=wt*t.pix[k+i];
 }return r;
}
function packedNormal(n){
 // S2 source uses c3=(510/254,-256/254,0,0). Quantize and
 // reconstruct float normals using that exact source constant.
 const p=n.map(x=>Math.round(clip(127*x+128,0,255)));
 return norm(p.map(v=>(v/255)*(510/254)-256/254));
}
const ambient=[.29,.30,.32],direct=[.77,.74,.70],light=norm([-.65,-.54,.72]);
function lighting(n){
 const d=Math.max(0,dot(packedNormal(norm(n)),light));
 return [0,1,2].map(i=>ambient[i]+direct[i]*d);
}
function render(q,mode,view,outFile){
 const W=960,H=1080,rgba=Buffer.alloc(W*H*4),zbuf=new Float64Array(W*H);
 zbuf.fill(-Infinity);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const k=(y*W+x)*4,c=20+Math.round((1-y/H)*13);rgba[k]=c;rgba[k+1]=c+6;rgba[k+2]=c+8;rgba[k+3]=255;
 }
 const yaw=view==='front'?0:view==='oblique'?Math.PI/5:Math.PI/2;
 const eye=norm([Math.sin(yaw),-Math.cos(yaw),.05]),up=[0,0,1],right=norm(cross(up,mul(eye,-1)));
 // For +Y-facing GLB body, camera at -Y. x direction remains right-positive.
 // Reverse horizontal projection if required for stable front camera.
 if(view==='front'&&right[0]<0)right=mul(right,-1);
 const all=[];
 q.g.meshes.forEach((m,i)=>m.primitives.forEach((p,j)=>{
  const e=extract(q,i,j),mat=q.g.materials?.[p.material||0]||{};
  all.push({mesh:e,mat,source:m.name||String(i),texture:mode==='textured'?texture(q,mat):null});
 }));
 const positions=all.flatMap(v=>v.mesh.positions);
 const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 for(const p of positions)for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],p[k]);bounds.max[k]=Math.max(bounds.max[k],p[k]);}
 const center=mul(add(bounds.min,bounds.max),.5);
 let maxX=0,maxY=0;
 for(const p of positions){const v=sub(p,center);maxX=Math.max(maxX,Math.abs(dot(v,right)));maxY=Math.max(maxY,Math.abs(dot(v,up)));}
 const scale=Math.min(W*.42/Math.max(maxX,.001),H*.455/Math.max(maxY,.001));
 const project=p=>{const v=sub(p,center);return [W*.5+dot(v,right)*scale,H*.51-dot(v,up)*scale,dot(v,eye)];};
 let faces=0,fragmentWrites=0,alphaRejects=0,totalMeshes=0,textureMeshes=0;
 for(const entry of all){
  const m=entry.mesh,colors=entry.mat.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1],tex=entry.texture;
  if(tex)textureMeshes++;
  totalMeshes++;
  const proj=m.positions.map(project);
  for(let f=0;f<m.indices.length;f+=3){
   const ids=m.indices.slice(f,f+3),[a,b,c]=ids.map(i=>proj[i]);faces++;
   const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
   if(Math.abs(det)<1e-10)continue;
   const sx=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),ex=Math.min(W-1,Math.ceil(Math.max(a[0],b[0],c[0])));
   const sy=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),ey=Math.min(H-1,Math.ceil(Math.max(a[1],b[1],c[1])));
   const n=ids.map(i=>m.normals[i]);let faceN=norm(cross(sub(m.positions[ids[1]],m.positions[ids[0]]),sub(m.positions[ids[2]],m.positions[ids[0]])));
   if(dot(faceN,eye)<0)faceN=mul(faceN,-1);
   const flat=lighting(faceN);
   for(let y=sy;y<=ey;y++)for(let x=sx;x<=ex;x++){
    const px=x+.5,py=y+.5;
    const u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/det,v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/det,w=1-u-v;
    if(Math.min(u,v,w)<0)continue;
    const d=u*a[2]+v*b[2]+w*c[2],pixel=y*W+x;
    if(d<=zbuf[pixel])continue;
    const uv=[0,1].map(k=>u*m.uvs[ids[0]][k]+v*m.uvs[ids[1]][k]+w*m.uvs[ids[2]][k]);
    const rgb=mode==='clay'?[178,183,179,255]:colorAt(tex,uv);
    const alpha=(rgb[3]/255)*colors[3];if(alpha<.35){alphaRejects++;continue;}
    const nn=norm(add(add(mul(n[0],u),mul(n[1],v)),mul(n[2],w)));
    const l=lighting(dot(nn,eye)<0?mul(nn,-1):nn);
    zbuf[pixel]=d;const idx=pixel*4;
    for(let k=0;k<3;k++){
     let base=mode==='clay'?rgb[k]:rgb[k]*colors[k];
     // Flat test differs from smooth to reveal triangulation.
     const shade=mode==='clay'?l[k]*.65+flat[k]*.35:l[k];
     rgba[idx+k]=Math.round(clip(base*shade,0,255));
    }
    rgba[idx+3]=255;fragmentWrites++;
   }
  }
 }
 const png=encodePNG(rgba,W,H);fs.writeFileSync(outFile,png);
 return {file:path.basename(outFile),bytes:png.length,sha256:hash(png),imageSize:[W,H],
  mode,view,faceCount:faces,meshes:totalMeshes,meshesWithPNGTexture:textureMeshes,fragmentWrites,alphaRejects,bounds,sourceGlbSHA256:q.sha};
}
function main(){
 const [file,out,variant='ART_DENSE']=process.argv.slice(2);
 ensure(file&&out,'usage: node render_r36ml.cjs INPUT.glb OUTPUT_DIR [variant]');
 const q=load(file),reports=[];fs.mkdirSync(out,{recursive:true});
 for(const view of ['front','oblique'])for(const mode of ['clay','textured'])
  reports.push(render(q,mode,view,path.join(out,'R36ML_'+variant+'_'+view.toUpperCase()+'_'+mode.toUpperCase()+'.png')));
 const report={name:'R36ML S2 source-light approximation of actual R36MK GLB',
  nativeEngine:false,sourceGLB:path.basename(file),sourceSHA256:q.sha,
  math:'S2 GfxShaders.txt CalcNormal & CalcDirAmbLightDO plus GfxRender.cpp c3',
  limitations:'not native S2 D3D9, no skeletal animation, vertex normals used; not validated against target reference',
  lighting:{light,ambient,direct},renders:reports};
 fs.writeFileSync(path.join(out,'R36ML_'+variant+'_render.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={render,decodePNG,encodePNG};
