'use strict';
// R36KQ: de-bias individual UV-island normal maps while preserving within-island
// high-poly deviations. This changes ONLY one embedded PNG plus GLB metadata.
// No vertex, triangle, skin, texture-coordinate or color pixels are modified.
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const {load}=require('./glb_io.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function check(c,s){if(!c)throw Error(s);}
function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function pngChunk(name,data){const t=Buffer.from(name,'ascii'),a=Buffer.alloc(4),c=Buffer.alloc(4);a.writeUInt32BE(data.length);c.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([a,t,data,c]);}
function readPng(buf){
 check(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG signature');
 let pos=8,meta=null,idats=[],w=0,h=0;
 while(pos<buf.length){const n=buf.readUInt32BE(pos),tag=buf.toString('ascii',pos+4,pos+8),data=buf.subarray(pos+8,pos+8+n);
 if(tag==='IHDR'){meta=Buffer.from(data);w=data.readUInt32BE(0);h=data.readUInt32BE(4);check(data[8]===8&&data[9]===6&&data[12]===0,'RGBA8 filter PNG required');}
 if(tag==='IDAT')idats.push(data);
 pos+=n+12;if(tag==='IEND')break;}
 check(meta&&w===2048&&h===2048,'expected 2048 image');
 const raw=zlib.inflateSync(Buffer.concat(idats)),stride=w*4+1;
 check(raw.length===stride*h,'invalid decompression');
 for(let y=0;y<h;y++)check(raw[y*stride]===0,'PNG expected filter type 0');
 return {meta,raw,w,h,stride};
}
function writePng(p){return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',p.meta),pngChunk('IDAT',zlib.deflateSync(p.raw,{level:6})),pngChunk('IEND',Buffer.alloc(0))]);}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function rebalance(img,{meanFactor,detailFactor,maxSlope}){
 const p=readPng(img),cols=34,triangles=1120,tile=Math.floor(p.w/cols),pad=Math.max(2,Math.ceil(tile*.05)),span=tile-2*pad;
 const base=(x,y)=>(y*p.stride+1+x*4),reports=[];
 let beforeAvg=0,afterAvg=0,movedPixels=0;
 for(let fi=0;fi<triangles;fi++){
  const x0=(fi%cols)*tile,y0=Math.floor(fi/cols)*tile;
  let sx=0,sy=0,count=0;
  for(let j=0;j<tile;j++)for(let i=0;i<tile;i++){
   const u=(i+.5-pad)/span,v=(j+.5-pad)/span;
   if(u<0||v<0||u+v>1)continue;
   const off=base(x0+i,y0+j);
   sx+=p.raw[off]/127.5-1;sy+=p.raw[off+1]/127.5-1;count++;
  }
  check(count>0,'invalid UV triangle');
  const mx=sx/count,my=sy/count;
  beforeAvg+=Math.hypot(mx,my);
  let afterX=0,afterY=0,inCount=0;
  for(let j=0;j<tile;j++)for(let i=0;i<tile;i++){
   const off=base(x0+i,y0+j),x=p.raw[off]/127.5-1,y=p.raw[off+1]/127.5-1;
   let nx=(x-mx)*detailFactor+mx*meanFactor,ny=(y-my)*detailFactor+my*meanFactor;
   const q=Math.hypot(nx,ny);if(q>maxSlope){nx*=maxSlope/q;ny*=maxSlope/q;}
   const nz=Math.sqrt(Math.max(1e-8,1-nx*nx-ny*ny));
   p.raw[off]=clamp(Math.round((nx*.5+.5)*255),0,255);
   p.raw[off+1]=clamp(Math.round((ny*.5+.5)*255),0,255);
   p.raw[off+2]=clamp(Math.round((nz*.5+.5)*255),0,255);
   p.raw[off+3]=255;
   movedPixels++;
   const u=(i+.5-pad)/span,v=(j+.5-pad)/span;
   if(u>=0&&v>=0&&u+v<=1){afterX+=nx;afterY+=ny;inCount++;}
  }
  afterAvg+=Math.hypot(afterX/inCount,afterY/inCount);
  reports.push({tri:fi,originalMeanSlope:+Math.hypot(mx,my).toFixed(5),rebasedMeanSlope:+Math.hypot(afterX/inCount,afterY/inCount).toFixed(5)});
 }
 return {png:writePng(p),metrics:{triangles,cols,tile,pad,movedPixels,
  meanSlopeBefore:beforeAvg/triangles,meanSlopeAfter:afterAvg/triangles,
  highTileMean:reports.filter(x=>x.originalMeanSlope>.6).length,
  topFive:reports.sort((a,b)=>b.originalMeanSlope-a.originalMeanSlope).slice(0,5)}};
}
function saveGlb(g,bin,dst){
 const j=Buffer.from(JSON.stringify(g),'utf8'),json=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),payload=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
 const all=Buffer.alloc(28+json.length+payload.length);all.write('glTF');all.writeUInt32LE(2,4);all.writeUInt32LE(all.length,8);all.writeUInt32LE(json.length,12);all.write('JSON',16);json.copy(all,20);
 const p=20+json.length;all.writeUInt32LE(payload.length,p);all.write('BIN\0',p+4,'binary');payload.copy(all,p+8);
 fs.writeFileSync(dst,all);return {sha256:sha(all),bytes:all.length};
}
function produce(source,dest,{meanFactor,detailFactor,maxSlope}){
 check(!fs.existsSync(dest),'output must not exist '+dest);
 const sourceFile=load(source),g=sourceFile.g,old=sourceFile.bin;
 const image=g.images.find(x=>x.name==='body_normal');
 check(image&&g.extras?.r36kp?.budget?.total===2088,'R36KP GLB expected');
 const vId=image.bufferView,views=g.bufferViews,layout=[];let rebasedInfo=null;
 let offset=0;
 for(let i=0;i<views.length;i++){
  const v=views[i];let bytes=old.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
  check(bytes.length===v.byteLength,'accessor ranges');
  if(i===vId){const res=rebalance(bytes,{meanFactor,detailFactor,maxSlope});bytes=res.png;rebasedInfo=res.metrics;}
  const pad=(4-offset%4)%4;if(pad){layout.push(Buffer.alloc(pad));offset+=pad;}
  v.byteOffset=offset;v.byteLength=bytes.length;layout.push(bytes);offset+=bytes.length;
 }
 const packed=Buffer.concat(layout);
 g.buffers[0].byteLength=packed.length;
 g.asset.generator='R36KQ source-normal high-frequency preservation / per-island debias';
 g.extras.r36kq={baseSha256:sourceFile.sha,runtimeTriangles:2088,normalMapModified:true,
   meanFactor,detailFactor,maxSlope,originalBodyColorPreserved:true,meshAndSkinUnchanged:true,
   detailMethod:'per-island tangent normal mean removed, high-frequency deviations retained',
   caveats:['No additional source microgeometry invented','Atlas UV and silhouette unchanged','Exact game engine material not tested']};
 const output=saveGlb(g,packed,dest);
 return {file:dest,output,sourceSha256:sourceFile.sha,params:{meanFactor,detailFactor,maxSlope},metrics:rebasedInfo};
}
if(require.main===module){
 const [source,dir]=process.argv.slice(2);check(source&&dir,'usage node normal_rebalance.cjs R36KP.glb OUT_DIRECTORY');
 check(!fs.existsSync(dir),'output directory must be new');fs.mkdirSync(dir,{recursive:true});
 const balanced=produce(source,path.join(dir,'R36KQ_F11_BALANCED_NORMAL_2088TRI.glb'),{meanFactor:.12,detailFactor:.55,maxSlope:.44});
 const detailed=produce(source,path.join(dir,'R36KQ_F11_DETAIL_NORMAL_2088TRI.glb'),{meanFactor:.22,detailFactor:.83,maxSlope:.62});
 const report={version:'R36KQ',triangleBudget:2100,actualTriangles:2088,source,balanced,detailed};
 fs.writeFileSync(path.join(dir,'R36KQ_PRODUCTION.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
module.exports={produce};
