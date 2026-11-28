'use strict';
// Dependency-free decoder for ordinary non-interlaced PNG files of any size.
// Returns RGBA8 for PNG grayscale/RGB/indexed/gray-alpha/RGBA, including
// indexed 1/2/4-bit palettes and tRNS. No image content is synthesized.
const fs=require('fs'),zlib=require('zlib');
const ensure=(v,s)=>{if(!v)throw Error(s)};
const sig=Buffer.from([137,80,78,71,13,10,26,10]);
function decodePNG(buf){
 ensure(Buffer.isBuffer(buf)&&buf.subarray(0,8).equals(sig),'invalid PNG signature');
 let offset=8,w=0,h=0,depth=0,kind=-1,interlace=1,palette=null,trns=null,parts=[];
 while(offset+12<=buf.length){
  const n=buf.readUInt32BE(offset),end=offset+12+n;
  ensure(n>=0&&end<=buf.length,'corrupt PNG chunk');
  const name=buf.toString('ascii',offset+4,offset+8),data=buf.subarray(offset+8,end-4);
  if(name==='IHDR'){
   ensure(n===13,'bad PNG header length');
   w=data.readUInt32BE(0);h=data.readUInt32BE(4);
   depth=data[8];kind=data[9];interlace=data[12];
   ensure(data[10]===0&&data[11]===0,'unsupported PNG compression/filter');
  }
  if(name==='PLTE')palette=Buffer.from(data);
  if(name==='tRNS')trns=Buffer.from(data);
  if(name==='IDAT')parts.push(data);
  offset=end;if(name==='IEND')break;
 }
 const channels={0:1,2:3,3:1,4:2,6:4}[kind];
 ensure(Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&w<=8192&&h<=8192,'PNG dimensions unsupported');
 ensure(channels&&interlace===0,'unsupported PNG color type or interlace');
 ensure(kind===3?[1,2,4,8].includes(depth):depth===8,'PNG bit depth unsupported');
 ensure(parts.length>0,'missing PNG data');
 if(kind===3)ensure(palette&&palette.length%3===0,'missing PNG palette');
 const bpp=Math.max(1,Math.ceil(channels*depth/8)),stride=Math.ceil(w*channels*depth/8);
 const raw=zlib.inflateSync(Buffer.concat(parts));
 ensure(raw.length===h*(stride+1),'unexpected PNG raw length');
 const decoded=Buffer.alloc(stride*h),out=Buffer.alloc(w*h*4);
 let at=0;
 for(let y=0;y<h;y++){
  const filter=raw[at++],row=y*stride,prior=(y-1)*stride;
  ensure(filter<=4,'unsupported PNG filter');
  for(let x=0;x<stride;x++){
   const left=x>=bpp?decoded[row+x-bpp]:0,above=y?decoded[prior+x]:0;
   const upLeft=y&&x>=bpp?decoded[prior+x-bpp]:0;
   let n=raw[at++];
   if(filter===1)n+=left;
   if(filter===2)n+=above;
   if(filter===3)n+=Math.floor((left+above)/2);
   if(filter===4){
    const p=left+above-upLeft,a=Math.abs(p-left),b=Math.abs(p-above),c=Math.abs(p-upLeft);
    n+=a<=b&&a<=c?left:b<=c?above:upLeft;
   }
   decoded[row+x]=n&255;
  }
  for(let x=0;x<w;x++){
   const dst=(y*w+x)*4;let r,g,b,a=255;
   if(kind===3){
    const bit=x*depth,byte=decoded[row+(bit>>>3)],shift=8-depth-(bit&7);
    const i=(byte>>>shift)&((1<<depth)-1);
    ensure(i*3+2<palette.length,'indexed pixel outside palette');
    r=palette[i*3];g=palette[i*3+1];b=palette[i*3+2];if(trns&&i<trns.length)a=trns[i];
   }else if(kind===0){
    r=g=b=decoded[row+x];if(trns&&trns.length>=2&&r===trns.readUInt16BE(0))a=0;
   }else if(kind===2){
    const i=row+x*3;r=decoded[i];g=decoded[i+1];b=decoded[i+2];
    if(trns&&trns.length>=6&&r===trns.readUInt16BE(0)&&g===trns.readUInt16BE(2)&&b===trns.readUInt16BE(4))a=0;
   }else if(kind===4){
    const i=row+x*2;r=g=b=decoded[i];a=decoded[i+1];
   }else{
    const i=row+x*4;r=decoded[i];g=decoded[i+1];b=decoded[i+2];a=decoded[i+3];
   }
   out[dst]=r;out[dst+1]=g;out[dst+2]=b;out[dst+3]=a;
  }
 }
 return {w,h,pix:out,sourceColorType:kind,sourceBitDepth:depth};
}
if(require.main===module){
 const f=process.argv[2];ensure(f,'usage: node png_rgba.cjs file.png');
 const d=decodePNG(fs.readFileSync(f));
 console.log(JSON.stringify({width:d.w,height:d.h,sourceColorType:d.sourceColorType,sourceBitDepth:d.sourceBitDepth}));
}
module.exports={decodePNG};
