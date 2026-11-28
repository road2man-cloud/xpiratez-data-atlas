'use strict';
/**
 * Split projected UV paint masks into drawable connected islands.
 * Uses real R36LS atlas pixels; does not synthesize shadow or anatomy.
 * node split_uv_islands.cjs INPUT_UV_TEMPLATE_DIR
 */
const fs=require('fs'),path=require('path');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const need=(v,msg)=>{if(!v)throw Error(msg)};
function components(mask,w,h,minPixels=256) {
 const seen=new Uint8Array(w*h),q=new Int32Array(w*h),out=[];
 for(let i=0;i<w*h;i++){
  if(seen[i]||mask[i*4+3]<128)continue;
  let head=0,tail=1;seen[i]=1;q[0]=i;
  let x0=w,y0=h,x1=-1,y1=-1;
  while(head<tail){
   const id=q[head++],x=id%w,y=(id/w)|0;
   if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
   const visit=j=>{if(!seen[j]&&mask[j*4+3]>=128){seen[j]=1;q[tail++]=j}};
   if(x>0)visit(id-1);if(x<w-1)visit(id+1);
   if(y>0)visit(id-w);if(y<h-1)visit(id+w);
  }
  if(tail>=minPixels)out.push({pixels:tail,bbox:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1},ids:Uint32Array.from(q.subarray(0,tail))});
 }
 out.sort((a,b)=>b.pixels-a.pixels);
 return out;
}
function run(dir){
 const report=JSON.parse(fs.readFileSync(path.join(dir,'R36LT_UV_TEMPLATE.report.json'),'utf8'));
 const result=[];
 for(const region of report.regions){
  if(!region.selectedPixels)continue;
  const label=region.direction.toUpperCase();
  const alpha=decodePNG(fs.readFileSync(path.join(dir,region.maskFile)));
  const src=decodePNG(fs.readFileSync(path.join(dir,region.sourceCropFile)));
  const sourceRect=region.crop;
  need(alpha.w===2048&&alpha.h===2048,'invalid UV template mask');
  need(src.w===sourceRect.width&&src.h===sourceRect.height,'source crop mismatch');
  const pieces=components(alpha.pix,alpha.w,alpha.h);
  const list=[];
  for(let i=0;i<pieces.length;i++){
   const c=pieces[i],pad=6;
   const bx=Math.max(0,c.bbox.x-pad),by=Math.max(0,c.bbox.y-pad);
   const bw=Math.min(alpha.w,c.bbox.x+c.bbox.w+pad)-bx;
   const bh=Math.min(alpha.h,c.bbox.y+c.bbox.h+pad)-by;
   const pixels=Buffer.alloc(bw*bh*4),wire=Buffer.alloc(bw*bh*4);
   for(const old of c.ids){
     const x=old%alpha.w,y=(old/alpha.w)|0;
     const sx=x-sourceRect.x,sy=y-sourceRect.y;
     if(sx<0||sy<0||sx>=src.w||sy>=src.h)continue;
     const target=4*((y-by)*bw+(x-bx)),source=4*(sy*src.w+sx);
     for(let k=0;k<4;k++)pixels[target+k]=src.pix[source+k];
     // This guide marks exact pixels only; no guessed UV coordinates.
     wire[target]=56;wire[target+1]=233;wire[target+2]=204;wire[target+3]=255;
   }
   const name='R36LT_'+label+'_UV_ISLAND_'+String(i+1).padStart(2,'0');
   fs.writeFileSync(path.join(dir,name+'_SOURCE.png'),encodePNG(pixels,bw,bh));
   fs.writeFileSync(path.join(dir,name+'_MASK.png'),encodePNG(wire,bw,bh));
   list.push({name,pixels:c.pixels,atlasBounds:{x:bx,y:by,width:bw,height:bh}});
  }
  result.push({side:region.direction,selectedPixels:region.selectedPixels,islandCount:pieces.length,islands:list});
 }
 const output={version:'R36LT-UV-ISLANDS',source:report.source,sourceSHA256:report.sourceSHA256,
  rule:'4-connected pixel UV mask, minimum 256 pixels',result};
 fs.writeFileSync(path.join(dir,'R36LT_UV_ISLANDS.report.json'),JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify(result.map(x=>({side:x.side,islands:x.islandCount,pixels:x.selectedPixels}))));
 return output;
}
if(require.main===module)try{need(process.argv.length===3,'usage: node split_uv_islands.cjs OUTPUT_UV_TEMPLATE_DIR');run(process.argv[2]);}
catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={run,components};
