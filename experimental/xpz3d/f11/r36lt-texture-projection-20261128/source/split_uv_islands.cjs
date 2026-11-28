'use strict';
/**
 * R36LT drawable UV island extraction. Converts measured atlas regions into
 * independent image-editable cropped PNGs (source, mask, actual UV wire).
 * Never paints missing anatomy, shadows, highlights, or inferred structures.
 * Usage: node split_uv_islands.cjs output/uv-template
 */
const fs=require('fs'),path=require('path');
const {decodePNG}=require('./png_rgba.cjs');
const {encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const need=(v,s)=>{if(!v)throw Error(s)};
function components(rgba,w,h,minPixels=256){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),list=[];
 for(let i=0;i<w*h;i++){
  if(seen[i]||rgba[i*4+3]<128)continue;
  let head=0,tail=1,x0=w,y0=h,x1=-1,y1=-1;
  seen[i]=1;queue[0]=i;
  while(head<tail){
   const k=queue[head++],x=k%w,y=Math.floor(k/w);
   x0=Math.min(x,x0);x1=Math.max(x,x1);y0=Math.min(y,y0);y1=Math.max(y,y1);
   const touch=j=>{if(!seen[j]&&rgba[j*4+3]>=128){seen[j]=1;queue[tail++]=j}};
   if(x>0)touch(k-1);if(x<w-1)touch(k+1);
   if(y>0)touch(k-w);if(y<h-1)touch(k+w);
  }
  if(tail>=minPixels)list.push({pixels:tail,bbox:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1},
    ids:Uint32Array.from(queue.subarray(0,tail))});
 }
 list.sort((a,b)=>b.pixels-a.pixels);
 return list;
}
function run(folder,{maxIslands=12,minPixels=256}={}){
 need(fs.existsSync(folder),'source template directory unavailable');
 const template=JSON.parse(fs.readFileSync(path.join(folder,'R36LT_UV_TEMPLATE.report.json'),'utf8'));
 const out=[];
 for(const region of template.regions){
  if(!region.selectedPixels||!region.crop)continue;
  const label=region.direction.toUpperCase(),mask=decodePNG(fs.readFileSync(path.join(folder,region.maskFile)));
  const base=decodePNG(fs.readFileSync(path.join(folder,region.sourceCropFile)));
  const wire=decodePNG(fs.readFileSync(path.join(folder,region.wireCropFile)));
  need(mask.w===2048&&mask.h===2048,'expected full UV mask');
  for(const im of [base,wire])need(im.w===region.crop.width&&im.h===region.crop.height,'source crop and UV wire mismatch');
  const pieces=components(mask.pix,mask.w,mask.h,minPixels),selections=pieces.slice(0,maxIslands),islands=[];
  for(let i=0;i<selections.length;i++){
   const {bbox,ids,pixels}=selections[i],pad=6;
   const bx=Math.max(0,bbox.x-pad),by=Math.max(0,bbox.y-pad);
   const width=Math.min(mask.w,bbox.x+bbox.w+pad)-bx,height=Math.min(mask.h,bbox.y+bbox.h+pad)-by;
   const patch=Buffer.alloc(width*height*4),wirePatch=Buffer.alloc(patch.length),alpha=Buffer.alloc(patch.length);
   for(const j of ids){
     const x=j%mask.w,y=Math.floor(j/mask.w),srcX=x-region.crop.x,srcY=y-region.crop.y;
     if(srcX<0||srcY<0||srcX>=base.w||srcY>=base.h)continue;
     const si=(srcY*base.w+srcX)*4,di=((y-by)*width+x-bx)*4;
     for(let ch=0;ch<4;ch++){patch[di+ch]=base.pix[si+ch];wirePatch[di+ch]=wire.pix[si+ch];}
     alpha[di]=255;alpha[di+1]=255;alpha[di+2]=255;alpha[di+3]=255;
   }
   const stem='R36LT_'+label+'_UV_ISLAND_'+String(i+1).padStart(2,'0');
   for(const [name,buf] of [['SOURCE',patch],['MASK',alpha],['WIRE',wirePatch]])
      fs.writeFileSync(path.join(folder,stem+'_'+name+'.png'),encodePNG(buf,width,height));
   islands.push({stem,pixels,atlasBounds:{x:bx,y:by,width,height},
     sourceFile:stem+'_SOURCE.png',maskFile:stem+'_MASK.png',wireFile:stem+'_WIRE.png'});
  }
  out.push({direction:region.direction,selectedPixels:region.selectedPixels,connectedComponents:pieces.length,
    exportedIslands:islands.length,exportedPixelCount:islands.reduce((s,i)=>s+i.pixels,0),islands});
 }
 const report={version:'R36LT-UV-ISLANDS-V2',sourceSHA256:template.sourceSHA256,
  sourceAtlas:[2048,2048],minPixels,maxIslands,output:out,origin:'measured R36LS UV texture pixels'};
 fs.writeFileSync(path.join(folder,'R36LT_UV_ISLANDS.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(out.map(v=>({side:v.direction,components:v.connectedComponents,
  files:v.exportedIslands*3,pixels:v.exportedPixelCount}))));
 return report;
}
if(require.main===module)try{
 need(process.argv.length===3,'usage: node split_uv_islands.cjs UV_TEMPLATE_DIR');run(process.argv[2]);
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={components,run};
