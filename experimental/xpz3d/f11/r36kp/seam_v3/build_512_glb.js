#!/usr/bin/env node
/**
 * R36KK 512 PBR texture variant with no native dependencies.
 * Decode only RGB8 non-interlaced PNG, downsample by area (2x2 box);
 * tangent normal map renormalized; preserve original face/hair image bytes.
 * Repack every glTF bufferView to remove all superseded 1024 PBR image payloads.
 * Usage: node build_512_glb.js model_1024.glb model_512.glb
 */
'use strict';
const fs=require('fs'),zlib=require('zlib'),crypto=require('crypto'),path=require('path');
const [input,out]=process.argv.slice(2);
if(!input||!out)throw Error('Usage: node build_512_glb.js input_1024.glb output_512.glb');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const original=fs.readFileSync(input),jsonLength=original.readUInt32LE(12),base=20+jsonLength+8;
if(original.toString('ascii',0,4)!=='glTF'||original.readUInt32LE(4)!==2||original.readUInt32LE(8)!==original.length)throw Error('invalid GLB v2');
const j=JSON.parse(original.subarray(20,20+jsonLength).toString()),bin=original.subarray(base);
const signature=Buffer.from([137,80,78,71,13,10,26,10]),kinds=['ALBEDO','NORMAL','ORM'];
let crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function crc32(buf){let c=0xffffffff;for(const v of buf)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function chunk(type,payload){let result=Buffer.alloc(12+payload.length);result.writeUInt32BE(payload.length,0);result.write(type,4,'ascii');payload.copy(result,8);result.writeUInt32BE(crc32(result.subarray(4,8+payload.length)),8+payload.length);return result}
function unfilter(raw,width,height){
 const stride=width*3,recon=Buffer.alloc(stride*height);let ro=0;
 for(let y=0;y<height;y++){
  const filter=raw[ro++],dst=y*stride;
  if(filter>4)throw Error('Unsupported PNG filter '+filter);
  for(let i=0;i<stride;i++){
   const a=i>=3?recon[dst+i-3]:0,b=y?recon[dst-stride+i]:0,c=(i>=3&&y)?recon[dst-stride+i-3]:0;
   let pred=0;
   if(filter===1)pred=a;
   if(filter===2)pred=b;
   if(filter===3)pred=Math.floor((a+b)/2);
   if(filter===4){
    const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
    pred=pa<=pb&&pa<=pc?a:pb<=pc?b:c;
   }
   recon[dst+i]=(raw[ro++]+pred)&255;
  }
 }
 if(ro!==raw.length)throw Error('PNG scanline length mismatch');
 return recon;
}
function decodePNG(bytes){
 if(!bytes.subarray(0,8).equals(signature))throw Error('not PNG');
 let off=8,parts=[],meta=null;
 while(off+12<=bytes.length){
  const len=bytes.readUInt32BE(off),type=bytes.toString('ascii',off+4,off+8);
  const data=bytes.subarray(off+8,off+8+len);
  if(type==='IHDR'){
   meta={width:data.readUInt32BE(0),height:data.readUInt32BE(4),depth:data[8],color:data[9],interlace:data[12]};
  }
  if(type==='IDAT')parts.push(data);
  off+=12+len;
  if(type==='IEND')break;
 }
 if(!meta||meta.color!==2||meta.depth!==8||meta.interlace!==0)throw Error('only 8-bit RGB PNG (no interlace)');
 const raw=zlib.inflateSync(Buffer.concat(parts));
 if(raw.length!==(meta.width*3+1)*meta.height)throw Error('PNG length mismatch');
 return {...meta,pixels:unfilter(raw,meta.width,meta.height)};
}
function encodePNG(width,height,pixels){
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 const row=width*3,raster=Buffer.alloc(height*(row+1));
 for(let y=0;y<height;y++){
  const s=y*row,o=y*(row+1);raster[o]=1; // SUB predictor for better lossless compression
  for(let k=0;k<row;k++)raster[o+1+k]=(pixels[s+k]-(k>=3?pixels[s+k-3]:0))&255;
 }
 return Buffer.concat([signature,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raster,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function meanRGB(pixels){let sum=[0,0,0];for(let i=0;i<pixels.length;i+=3)for(let c=0;c<3;c++)sum[c]+=pixels[i+c];return sum.map(x=>x/(pixels.length/3))}
function half(img,kind){
 if(img.width%2||img.height%2)throw Error('texture resolution is not even');
 let w=img.width/2,h=img.height/2,p=Buffer.alloc(w*h*3),old=img.pixels;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let q=(y*w+x)*3,z=[0,0,0];
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   let off=((2*y+dy)*img.width+2*x+dx)*3;
   for(let c=0;c<3;c++)z[c]+=old[off+c];
  }
  z=z.map(v=>v/4);
  if(kind==='NORMAL'){
   let v=z.map(t=>t/127.5-1),len=Math.hypot(...v);
   if(len>0.0001)z=v.map(t=>127.5*(1+t/len));
  }
  for(let c=0;c<3;c++)p[q+c]=Math.max(0,Math.min(255,Math.round(z[c])));
 }
 return {width:w,height:h,pixels:p};
}
const replacements=new Map(),reports=[];
for(let i=0;i<3;i++){
 const image=j.images[i+2],v=j.bufferViews[image.bufferView],orig=bin.subarray(v.byteOffset,v.byteOffset+v.byteLength);
 const decoded=decodePNG(orig),small=half(decoded,kinds[i]),encoded=encodePNG(small.width,small.height,small.pixels);
 replacements.set(image.bufferView,encoded);
 image.name='R36KK seam-v3 512 skin '+kinds[i];
 const before=meanRGB(decoded.pixels),after=meanRGB(small.pixels);
 reports.push({kind:kinds[i],inputSize:[decoded.width,decoded.height],outputSize:[small.width,small.height],
  inputBytes:orig.length,outputBytes:encoded.length,meanRGBBefore:before,meanRGBAfter:after,maxChannelMeanDelta:Math.max(...before.map((x,k)=>Math.abs(x-after[k])))});
}
for(const m of j.materials){if(typeof m.name==='string')m.name=m.name.replaceAll('R36KK 1024','R36KK seam-v3 512')}
let byteParts=[],position=0;
for(let k=0;k<j.bufferViews.length;k++){
 const v=j.bufferViews[k],data=replacements.get(k)||bin.subarray(v.byteOffset,v.byteOffset+v.byteLength);
 v.byteOffset=position;v.byteLength=data.length;
 const pad=(4-data.length%4)%4;
 byteParts.push(data);
 if(pad)byteParts.push(Buffer.alloc(pad));
 position+=data.length+pad;
}
const newBin=Buffer.concat(byteParts);
j.buffers[0].byteLength=newBin.length;
const newJson=Buffer.from(JSON.stringify(j),'utf8'),pad=(4-newJson.length%4)%4,js=Buffer.concat([newJson,Buffer.alloc(pad,32)]);
const glb=Buffer.alloc(12+8+js.length+8+newBin.length);
glb.write('glTF',0,'ascii');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
glb.writeUInt32LE(js.length,12);glb.write('JSON',16,'ascii');js.copy(glb,20);
let binHead=20+js.length;glb.writeUInt32LE(newBin.length,binHead);glb.write('BIN\0',binHead+4,'ascii');newBin.copy(glb,binHead+8);
if(!Number.isInteger(j.skins[0].joints.length)||j.skins[0].joints.length!==63)throw Error('unexpected bone count');
fs.writeFileSync(out,glb);
const report={output:path.basename(out),source:path.basename(input),sha256:sha(glb),sourceSha256:sha(original),bytes:glb.length,
 sizeReductionPct:100*(1-glb.length/original.length),bones:j.skins[0].joints.length,triangles:j.meshes[0].primitives.reduce((n,p)=>n+j.accessors[p.indices].count/3,0),
 otherImagesUntouched:true,skinTextureMeans:reports};
fs.writeFileSync(out+'.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
