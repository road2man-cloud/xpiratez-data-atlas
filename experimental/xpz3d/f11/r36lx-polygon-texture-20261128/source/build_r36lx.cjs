'use strict';
/**
 * R36LX: distribute a low-resolution, non-photographic residual texture field
 * across many R36LV mesh triangles through continuous bind-space (X,Z) projection.
 *
 * Each source feature belongs to 4x8 image cells, NOT one photo sticker.
 * The corresponding UV pixels are rasterized separately per mesh triangle.
 * No geometry, UV, joints, weights or topology changes. Original skin color
 * is retained and only source-derived residual contrast is locally transferred.
 *
 * node build_r36lx.cjs R36LV_COMPACT.glb out-dir
 */
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const ok=(a,msg)=>{if(!a)throw Error(msg)};
const clip=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clip(x);return x*x*(3-2*x)};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const FIELD_FILE=path.join(__dirname,'feature_residual_80x104.b64');
function loadResidual(){
 const b=zlib.inflateSync(Buffer.from(fs.readFileSync(FIELD_FILE,'utf8').trim(),'base64'));
 ok(b.length===4160,'feature residual field size mismatch');
 const data=new Uint8Array(80*104);
 for(let i=0;i<data.length;i++)data[i]=(b[i>>1]>>(i%2?0:4))&15;
 return {w:80,h:104,data,sha:hash(b)};
}
function sample(field,u,v){
 const x=clip(u)*(field.w-1),y=clip(v)*(field.h-1);
 const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
 const get=(a,b)=>field.data[Math.min(field.h-1,b)*field.w+Math.min(field.w-1,a)];
 const a=get(ix,iy)*(1-tx)+get(ix+1,iy)*tx;
 const b=get(ix,iy+1)*(1-tx)+get(ix+1,iy+1)*tx;
 // 4-bit values encode source photographic local-luminance residual
 return (a*(1-ty)+b*ty)/15*95-55;
}
function embedded(q,tid){
 const t=q.g.textures[tid],im=q.g.images[t.source];
 ok(im.mimeType==='image/png'&&Number.isInteger(im.bufferView),'embedded PNG image required');
 const view=q.g.bufferViews[im.bufferView],a=view.byteOffset||0;
 return decodePNG(q.bin.subarray(a,a+view.byteLength));
}
function build(input,dir,opt={}){
 ok(fs.existsSync(input),'input GLB missing');
 ok(!fs.existsSync(dir),'output directory already exists');
 const q=load(input),g=q.g,mi=g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 ok(mi>=0,'R36LV skinned body missing');
 const mesh=extract(q,mi,0),primitive=g.meshes[mi].primitives[0];
 ok(mesh.indices.length===3396&&g.skins.some(s=>s.joints.length===63),'R36LV triangle/rig mismatch');
 let others=0;g.meshes.forEach((m,i)=>{if(i!==mi)for(const p of m.primitives)others+=g.accessors[p.indices].count/3});
 ok(others===968,'head-hair triangle mismatch');
 const mat=g.materials[primitive.material],color=embedded(q,mat.pbrMetallicRoughness.baseColorTexture.index),
  normal=embedded(q,mat.normalTexture.index);
 ok(color.w===2048&&color.h===2048&&normal.w===2048&&normal.h===2048,'expected 2048 atlas');
 const field=loadResidual(),w=2048,h=2048;
 // Physical axis in this model: -Y anterior, +Z up, +/-X lateral
 const cfg={xMin:-.085,xMax:.085,zMin:.78,zMax:.94,frontMax:-.035,
  edgeX:.022,edgeZ:.024,alpha:.78,normalGain:.12,...opt};
 ok(cfg.xMin<cfg.xMax&&cfg.zMin<cfg.zMax&&cfg.alpha>=0&&cfg.alpha<=1,'invalid region');
 const col=Buffer.from(color.pix),nm=Buffer.from(normal.pix),hit=new Uint8Array(w*h);
 const covered=new Set(),influenced=new Set(),cells=new Map(),regionTri=[];
 const sourcePositions=mesh.positions,sourceUV=mesh.uvs,ids=mesh.indices;
 let changedPixels=0,changedColorPixels=0,changedNormalPixels=0,sumColor=0;
 let maxColor=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 function gate(P){
  const [x,y,z]=P;
  if(y>=cfg.frontMax||x<=cfg.xMin||x>=cfg.xMax||z<=cfg.zMin||z>=cfg.zMax)return 0;
  const edge=Math.min(x-cfg.xMin,cfg.xMax-x)/cfg.edgeX;
  const vert=Math.min(z-cfg.zMin,cfg.zMax-z)/cfg.edgeZ;
  const side=smooth(edge)*smooth(vert);
  // avoid accidental painting on edges folding to back/side
  const front=smooth((cfg.frontMax-y)/.026);
  return side*front;
 }
 for(let fi=0;fi<ids.length/3;fi++){
  const tri=ids.slice(fi*3,fi*3+3),P=tri.map(j=>sourcePositions[j]);
  const cx=(P[0][0]+P[1][0]+P[2][0])/3,cy=(P[0][1]+P[1][1]+P[2][1])/3,
    cz=(P[0][2]+P[1][2]+P[2][2])/3;
  if(Math.abs(cx)>.105||cy>-.015||cz<.745||cz>.975)continue;
  regionTri.push(fi);
  const uv=tri.map(j=>[sourceUV[j][0]*w,(1-sourceUV[j][1])*h]);
  const den=(uv[1][1]-uv[2][1])*(uv[0][0]-uv[2][0])+(uv[2][0]-uv[1][0])*(uv[0][1]-uv[2][1]);
  if(Math.abs(den)<1e-9)continue;
  const x0=Math.max(0,Math.floor(Math.min(...uv.map(p=>p[0])))),
    x1=Math.min(w-1,Math.ceil(Math.max(...uv.map(p=>p[0]))));
  const y0=Math.max(0,Math.floor(Math.min(...uv.map(p=>p[1])))),
    y1=Math.min(h-1,Math.ceil(Math.max(...uv.map(p=>p[1]))));
  let active=0,triCells=new Set();
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const xx=x+.5,yy=y+.5;
   const a=((uv[1][1]-uv[2][1])*(xx-uv[2][0])+(uv[2][0]-uv[1][0])*(yy-uv[2][1]))/den;
   const b=((uv[2][1]-uv[0][1])*(xx-uv[2][0])+(uv[0][0]-uv[2][0])*(yy-uv[2][1]))/den;
   const c=1-a-b;if(Math.min(a,b,c)<0)continue;
   const ix=y*w+x;if(hit[ix])continue;hit[ix]=1;
   const world=[0,1,2].map(k=>a*P[0][k]+b*P[1][k]+c*P[2][k]);
   const g=gate(world);if(g<.005)continue;
   const u=(world[0]-cfg.xMin)/(cfg.xMax-cfg.xMin),
     v=(cfg.zMax-world[2])/(cfg.zMax-cfg.zMin);
   // 4x8 source image segments with continuous coordinates across their borders
   const cellX=Math.min(3,Math.floor(u*4)),cellY=Math.min(7,Math.floor(v*8));
   const key=cellY*4+cellX;
   triCells.add(key);cells.set(key,(cells.get(key)||0)+1);
   const residual=sample(field,u,v);
   const detail=clip(residual/45,-1,1);
   const j=ix*4,delta=cfg.alpha*g*detail*28;
   let deltaSum=0,nonzero=false;
   for(let ch=0;ch<3;ch++){
     const orig=col[j+ch],next=Math.round(clip(orig+delta*(ch===0?1:ch===1?.87:.73),0,255));
     if(next!==orig)nonzero=true;
     deltaSum+=Math.abs(next-orig);col[j+ch]=next;
   }
   if(nonzero)changedColorPixels++;
   sumColor+=deltaSum/3;maxColor=Math.max(maxColor,deltaSum/3);
   // Depth gradient from the same residual image, but very low amplitude.
   const du=.6/field.w,dv=.6/field.h;
   // Transfer the source-image gradient through EACH triangle's actual
   // UV-to-bind-space Jacobian, rather than assuming every UV tile has
   // the same orientation. Y in the PNG atlas points downward.
   const gradU=(sample(field,clip(u+du),v)-sample(field,clip(u-du),v))/(2*du);
   const gradV=(sample(field,u,clip(v+dv))-sample(field,u,clip(v-dv)))/(2*dv);
   const daX=(uv[1][1]-uv[2][1])/den,dbX=(uv[2][1]-uv[0][1])/den;
   const daY=(uv[2][0]-uv[1][0])/den,dbY=(uv[0][0]-uv[2][0])/den;
   const dxX=(P[0][0]-P[2][0])*daX+(P[1][0]-P[2][0])*dbX;
   const dxZ=(P[0][2]-P[2][2])*daX+(P[1][2]-P[2][2])*dbX;
   const dyX=(P[0][0]-P[2][0])*daY+(P[1][0]-P[2][0])*dbY;
   const dyZ=(P[0][2]-P[2][2])*daY+(P[1][2]-P[2][2])*dbY;
   const gradTexX=gradU*dxX/(cfg.xMax-cfg.xMin)-gradV*dxZ/(cfg.zMax-cfg.zMin);
   const gradTexY=gradU*dyX/(cfg.xMax-cfg.xMin)-gradV*dyZ/(cfg.zMax-cfg.zMin);
   const oldNx=(normal.pix[j]/127.5)-1,oldNy=(normal.pix[j+1]/127.5)-1;
   // Source field has 80x104 texels; image-space gradients are strictly
   // bounded so that isolated residual samples cannot flip surface normals.
   let nx=oldNx-cfg.normalGain*g*clip(gradTexX,-.42,.42);
   let ny=oldNy+cfg.normalGain*g*clip(gradTexY,-.42,.42);
   const len=Math.hypot(nx,ny);if(len>.94){nx*=.94/len;ny*=.94/len}
   const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
   const nn=[Math.round((nx*.5+.5)*255),Math.round((ny*.5+.5)*255),Math.round((nz*.5+.5)*255)];
   if(nn.some((z,k)=>z!==normal.pix[j+k]))changedNormalPixels++;
   for(let k=0;k<3;k++)nm[j+k]=nn[k];
   changedPixels++;active++;
   minX=Math.min(minX,world[0]);maxX=Math.max(maxX,world[0]);
   minZ=Math.min(minZ,world[2]);maxZ=Math.max(maxZ,world[2]);
  }
  if(active)influenced.add(fi);
  for(const key of triCells){
   covered.add(key);
  }
 }
 ok(influenced.size>=40,'not enough polygons have been assigned the image feature: '+influenced.size);
 ok(changedPixels>500,'feature image has insufficient UV coverage');
 fs.mkdirSync(dir,{recursive:true});
 const builder=new Builder(q),maps={};
 for(const [kind,pix] of [['COLOR',col],['NORMAL',nm]]){
  const bytes=encodePNG(pix,w,h),name='R36LX_POLYGON_'+kind+'_2048.png';
  fs.writeFileSync(path.join(dir,name),bytes);
  const idx=builder.addTexture('R36LX_POLYGON_'+kind,bytes);
  if(kind==='COLOR')builder.g.materials[primitive.material].pbrMetallicRoughness.baseColorTexture.index=idx;
  else builder.g.materials[primitive.material].normalTexture.index=idx;
  maps[kind]={file:name,sha256:hash(bytes),bytes:bytes.length};
 }
 builder.g.asset.generator='R36LX continuous coordinate image residual over separately rasterized 3D body polygon triangles';
 const glb=builder.save(path.join(dir,'R36LX_POLYGON_DETAIL_2100_FULL.glb'));
 const report={version:'R36LX',input:path.basename(input),sourceSHA256:q.sha,model: path.basename(glb.file),
  modelSHA256:glb.sha,modelBytes:glb.bytes,bodyTriangles:1132,headHairTriangles:968,
  totalTriangles:2100,joints:63,geometryUVSkinUnchanged:true,
  originalImageIncluded:false,sourceResidual:{size:[field.w,field.h],bitDepth:4,sha256:field.sha},
  projection:cfg,imageSections:{columns:4,rows:8,nonEmpty:[...covered].sort((a,b)=>a-b)},
  candidateRegionTriangles:regionTri.length,touchedTriangles:influenced.size,
  touchedTriangleIds:[...influenced].sort((a,b)=>a-b),coveragePixels:changedPixels,
  changedColorPixels,changedNormalPixels,meanAbsRGB8Delta:sumColor/changedPixels,
  normalConversion:'per-triangle UV-to-bind-position Jacobian; Y-inverted texture coordinate',
  maxAbsRGB8Delta:maxColor,sourceCoordRange:{x:[minX,maxX],z:[minZ,maxZ]},
  pixelsPerSection:Object.fromEntries([...cells].sort((a,b)=>a[0]-b[0])),
  maps,visualQA:'not run',S2EngineQA:'not run',
  limitations:'Source is low-frequency-limited private-image residual; not physical displacement or final anatomical approval'};
 fs.writeFileSync(path.join(dir,'R36LX_POLYGON_DETAIL.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({model:glb.file,sha256:glb.sha,touchedTriangles:report.touchedTriangles,
  cells:report.imageSections.nonEmpty.length,pixels:changedPixels,changedColorPixels,changedNormalPixels}));
 return report;
}
if(require.main===module)try{
 const args=process.argv.slice(2);ok(args.length===2,'usage: node build_r36lx.cjs INPUT.glb OUTPUT_DIR');build(...args);
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={build,sample,loadResidual};
