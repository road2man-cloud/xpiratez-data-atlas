'use strict';
/**
 * R36LT actual UV painting templates from the R36LS skinned body.
 * Exports UV mask PNG, source-color crop PNG, UV-wireframe crop PNG,
 * and face/UV/3D correspondence JSON. No color painting of the model.
 */
const fs=require('fs'),path=require('path');
const {load,extract}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const need=(v,s)=>{if(!v)throw Error(s)};
function readTexture(q,id){
 const t=q.g.textures[id],im=q.g.images[t.source],v=q.g.bufferViews[im.bufferView];
 need(im.mimeType==='image/png','embedded PNG required');
 return decodePNG(q.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));
}
function raster(mesh,cfg,w,h){
 const signs=[{name:'negative',test:p=>p[1]<cfg.frontY},{name:'positive',test:p=>p[1]>cfg.frontY}];
 const regions=signs.map(s=>({...s,mask:new Uint8Array(w*h),faces:new Set(),rangeY:[Infinity,-Infinity]}));
 const box=cfg.bounds,ind=mesh.indices,pos=mesh.positions,uv=mesh.uvs;
 for(let f=0;f<ind.length;f+=3){
  const ids=ind.slice(f,f+3),P=ids.map(i=>pos[i]),U=ids.map(i=>[uv[i][0]*w,(1-uv[i][1])*h]);
  const den=(U[1][1]-U[2][1])*(U[0][0]-U[2][0])+(U[2][0]-U[1][0])*(U[0][1]-U[2][1]);
  if(Math.abs(den)<1e-8)continue;
  const x0=Math.max(0,Math.floor(Math.min(...U.map(p=>p[0])))),x1=Math.min(w-1,Math.ceil(Math.max(...U.map(p=>p[0]))));
  const y0=Math.max(0,Math.floor(Math.min(...U.map(p=>p[1])))),y1=Math.min(h-1,Math.ceil(Math.max(...U.map(p=>p[1]))));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const a=((U[1][1]-U[2][1])*(x+.5-U[2][0])+(U[2][0]-U[1][0])*(y+.5-U[2][1]))/den;
    const b=((U[2][1]-U[0][1])*(x+.5-U[2][0])+(U[0][0]-U[2][0])*(y+.5-U[2][1]))/den;
    const c=1-a-b;if(Math.min(a,b,c)<-1e-6)continue;
    const px=P[0][0]*a+P[1][0]*b+P[2][0]*c;
    const py=P[0][1]*a+P[1][1]*b+P[2][1]*c;
    const pz=P[0][2]*a+P[1][2]*b+P[2][2]*c;
    if(px<box.xMin||px>box.xMax||pz<box.zMin||pz>box.zMax)continue;
    const i=y*w+x;
    for(const r of regions)if(r.test([px,py,pz])){
      r.mask[i]=1;r.faces.add(f/3);
      r.rangeY[0]=Math.min(r.rangeY[0],py);r.rangeY[1]=Math.max(r.rangeY[1],py);
    }
  }
 }
 return regions;
}
function boundsOf(mask,w,h){
 let minX=w,minY=h,maxX=-1,maxY=-1,n=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){
  minX=Math.min(x,minX);minY=Math.min(y,minY);maxX=Math.max(x,maxX);maxY=Math.max(y,maxY);n++;
 }
 if(!n)return {selectedPixels:0,rect:null};
 const pad=12,x=Math.max(0,minX-pad),y=Math.max(0,minY-pad);
 return {selectedPixels:n,rect:{x,y,width:Math.min(w,maxX+pad+1)-x,height:Math.min(h,maxY+pad+1)-y}};
}
function drawLine(pix,w,h,x1,y1,x2,y2,col){
 let n=Math.ceil(Math.max(Math.abs(x2-x1),Math.abs(y2-y1)));
 if(n<1)n=1;
 for(let i=0;i<=n;i++){
   const t=i/n,x=Math.round(x1+(x2-x1)*t),y=Math.round(y1+(y2-y1)*t);
   if(x<0||y<0||x>=w||y>=h)continue;
   const j=4*(y*w+x);
   for(let c=0;c<4;c++)pix[j+c]=col[c];
 }
}
function saveRegion(q,base,mesh,r,outDir){
 const W=base.w,H=base.h,shape=boundsOf(r.mask,W,H),label=r.name.toUpperCase();
 const mask=Buffer.alloc(W*H*4);
 for(let i=0;i<r.mask.length;i++)if(r.mask[i]){
   const j=i*4;mask[j]=255;mask[j+1]=255;mask[j+2]=255;mask[j+3]=255;
 }
 const maskFile='R36LT_'+label+'_CENTER_MASK_2048.png';
 fs.writeFileSync(path.join(outDir,maskFile),encodePNG(mask,W,H));
 let source=null,wire=null;
 if(shape.rect){
   const {x,y,width:w,height:h}=shape.rect;
   source=Buffer.alloc(w*h*4);
   for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
     const si=(y+yy)*W+(x+xx);if(!r.mask[si])continue;
     const i=4*(yy*w+xx),j=4*si;
     for(let k=0;k<4;k++)source[i+k]=base.pix[j+k];
   }
   const sourceName='R36LT_'+label+'_CENTER_SOURCE_CROP.png';
   fs.writeFileSync(path.join(outDir,sourceName),encodePNG(source,w,h));
   const overlay=Buffer.from(source);
   for(const fi of r.faces){
     const ids=mesh.indices.slice(fi*3,fi*3+3),uv=ids.map(id=>[mesh.uvs[id][0]*W-x,(1-mesh.uvs[id][1])*H-y]);
     for(let k=0;k<3;k++)drawLine(overlay,w,h,...uv[k],...uv[(k+1)%3],[42,237,214,255]);
   }
   wire='R36LT_'+label+'_CENTER_UV_WIRE_CROP.png';
   fs.writeFileSync(path.join(outDir,wire),encodePNG(overlay,w,h));
   source=sourceName;
 }
 const triangles=[...r.faces].sort((a,b)=>a-b).map(f=>{
   const ids=mesh.indices.slice(f*3,f*3+3);
   return {triangle:f,uv:ids.map(i=>mesh.uvs[i]),bindPositions:ids.map(i=>mesh.positions[i])};
 });
 const report={direction:r.name,selectedPixels:shape.selectedPixels,crop:shape.rect,
   frontYRange:r.faces.size?r.rangeY:null,intersectedTriangleCount:r.faces.size,
   maskFile,sourceCropFile:source,wireCropFile:wire,triangles};
 fs.writeFileSync(path.join(outDir,'R36LT_'+label+'_CENTER_UV.json'),JSON.stringify(report,null,2)+'\n');
 return {direction:r.name,selectedPixels:shape.selectedPixels,crop:shape.rect,intersectedTriangleCount:r.faces.size,
  maskFile,sourceCropFile:source,wireCropFile:wire};
}
function run(input,config,outDir){
 need(fs.existsSync(input)&&fs.existsSync(config),'source and config required');
 need(!fs.existsSync(outDir),'refusing to overwrite output');
 const cfg=JSON.parse(fs.readFileSync(config,'utf8'));
 need(cfg.bounds&&cfg.bounds.xMin<cfg.bounds.xMax&&cfg.bounds.zMin<cfg.bounds.zMax&&Number.isFinite(cfg.frontY),'invalid bounds / front plane');
 const q=load(input),mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 need(mi>=0,'body mesh not found');
 const mesh=extract(q,mi,0),prim=q.g.meshes[mi].primitives[0];
 need(mesh.indices.length===3396&&q.g.skins.some(s=>s.joints.length===63),'source geometry / skin mismatch');
 let extra=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)for(const p of m.primitives)extra+=q.g.accessors[p.indices].count/3;});
 need(extra===968,'head and hair count changed');
 const mat=q.g.materials[prim.material],base=readTexture(q,mat.pbrMetallicRoughness.baseColorTexture.index);
 need(base.w===2048&&base.h===2048,'expected 2048 atlas');
 fs.mkdirSync(outDir,{recursive:true});
 const regions=raster(mesh,cfg,base.w,base.h),result=regions.map(r=>saveRegion(q,base,mesh,r,outDir));
 need(result.some(x=>x.selectedPixels>0),'no center UV region overlaps selected bounds');
 const report={version:'R36LT-UV-TEMPLATE',source:path.basename(input),sourceSHA256:q.sha,
  bodyTriangles:1132,otherTriangles:extra,totalTriangles:2100,skinJoints:63,
  sourceAtlas:[base.w,base.h],selection:cfg.bounds,frontPlane:cfg.frontY,regions:result,
  note:'Actual image template output, not finished appearance or renderer quality'};
 fs.writeFileSync(path.join(outDir,'R36LT_UV_TEMPLATE.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));return report;
}
if(require.main===module){try{
 need(process.argv.length===5,'usage: node export_uv_template.cjs SOURCE.glb CONFIG.json OUTPUT_DIR');run(...process.argv.slice(2));
}catch(e){console.error(e.stack||e);process.exitCode=1}}
module.exports={run,raster,boundsOf};
