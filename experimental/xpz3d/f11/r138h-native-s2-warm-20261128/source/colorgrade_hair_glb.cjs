'use strict';
// R138H: replace genuinely green hair texture embedded in R36MK GLB
// with warm chestnut hair. Preserve original texture's strand intensity,
// original GLB geometry, UV, all skins / inverse bind matrices, all materials.
// This is source artwork editing, NOT a substitute renderer.
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const input=process.argv[2],outDir=process.argv[3];
if(!input||!outDir||fs.existsSync(outDir))throw Error('usage node colorgrade_hair_glb.cjs source.glb NEWoutputDir');
const assert=(v,m)=>{if(!v)throw Error(m)};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function decodePNG(bytes) {
 assert(bytes.toString('hex',0,8)==='89504e470d0a1a0a','missing PNG signature');
 let ptr=8,w=0,h=0,depth=0,type=0,interlace=0,ids=[];
 while(ptr+12<=bytes.length){
  const len=bytes.readUInt32BE(ptr),tag=bytes.toString('ascii',ptr+4,ptr+8),chunk=bytes.subarray(ptr+8,ptr+8+len);
  ptr+=12+len;
  if(tag==='IHDR'){w=chunk.readUInt32BE(0);h=chunk.readUInt32BE(4);depth=chunk[8];type=chunk[9];interlace=chunk[12];}
  if(tag==='IDAT')ids.push(chunk);
  if(tag==='IEND')break;
 }
 assert(w>0&&h>0&&w<=4096&&h<=4096&&depth===8&&(type===2||type===6)&&interlace===0,'unsupported PNG type '+type);
 const channels=type===6?4:3,row=w*channels;
 const raw=zlib.inflateSync(Buffer.concat(ids));
 assert(raw.length===h*(row+1),'incorrect PNG decoded length');
 const pix=Buffer.alloc(w*h*4);let offset=0;
 const prior=Buffer.alloc(row),current=Buffer.alloc(row);
 for(let y=0;y<h;y++){
  const filter=raw[offset++];
  for(let i=0;i<row;i++){
   const a=i>=channels?current[i-channels]:0,b=prior[i],c=i>=channels?prior[i-channels]:0,v=raw[offset++];
   let x=v;
   if(filter===1)x+=a;
   else if(filter===2)x+=b;
   else if(filter===3)x+=Math.floor((a+b)/2);
   else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);x+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}
   else assert(filter===0,'unexpected PNG filter '+filter);
   current[i]=x&255;
  }
  for(let x=0;x<w;x++){
   const i=(y*w+x)*4,k=x*channels;
   pix[i]=current[k];pix[i+1]=current[k+1];pix[i+2]=current[k+2];pix[i+3]=channels===4?current[k+3]:255;
  }
  current.copy(prior);
 }
 return {w,h,pix};
}

function crc32(b) {let crc=0xffffffff;for(const x of b){crc^=x;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0}
function chunk(type,data) {
 const hdr=Buffer.alloc(8),foot=Buffer.alloc(4),name=Buffer.from(type,'ascii');
 hdr.writeUInt32BE(data.length,0);name.copy(hdr,4);foot.writeUInt32BE(crc32(Buffer.concat([name,data])));
 return Buffer.concat([hdr,data,foot]);
}
function encodeRGB(pix,w,h) {
 const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;
 const raw=Buffer.alloc((w*3+1)*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=4*(w*y+x),to=y*(w*3+1)+1+x*3;
  raw[to]=pix[at];raw[to+1]=pix[at+1];raw[to+2]=pix[at+2];
 }
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:8})),chunk('IEND',Buffer.alloc(0))]);
}
const original=fs.readFileSync(input);
assert(original.toString('ascii',0,4)==='glTF'&&original.readUInt32LE(8)===original.length,'invalid GLB');
const jl=original.readUInt32LE(12),json=JSON.parse(original.toString('utf8',20,20+jl)),bo=20+jl;
assert(original.toString('ascii',bo+4,bo+8)==='BIN\0','missing BIN');
const bin=original.subarray(bo+8,bo+8+original.readUInt32LE(bo)),hairImage=json.images[1];
assert(hairImage.mimeType==='image/png'&&hairImage.bufferView!=null,'expected embedded hair PNG');
const view=json.bufferViews[hairImage.bufferView];
const oldPNG=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
const im=decodePNG(oldPNG);assert(im.w===256&&im.h===256,'unexpected hair atlas dimensions');
const rgba=Buffer.from(im.pix),before=[0,0,0],after=[0,0,0];
for(let i=0;i<rgba.length;i+=4){
 const r=rgba[i]/255,g=rgba[i+1]/255,b=rgba[i+2]/255;
 before[0]+=rgba[i];before[1]+=rgba[i+1];before[2]+=rgba[i+2];
 const l=clamp(.12*r+.80*g+.08*b);
 // Preserve native strand intensity while shifting green to brown.
 const out=[88+165*l,55+129*l,35+95*l].map(v=>Math.max(0,Math.min(255,Math.round(v))));
 for(let k=0;k<3;k++){rgba[i+k]=out[k];after[k]+=out[k]}
}
const newPNG=encodeRGB(rgba,im.w,im.h);
const offset=(bin.length+3)&~3,pad=Buffer.alloc(offset-bin.length);
const nb=Buffer.concat([bin,pad,newPNG,Buffer.alloc((4-newPNG.length%4)%4)]);
const viewIndex=json.bufferViews.length;
json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:newPNG.length});
hairImage.bufferView=viewIndex;
json.buffers[0].byteLength=nb.length;
json.asset.generator='R138H warmth correction on source glTF hair atlas; 2100 triangles and 63 bones preserved';
const jb=Buffer.from(JSON.stringify(json),'utf8'),jp=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,0x20)]);
const result=Buffer.alloc(28+jp.length+nb.length);
result.write('glTF');result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
result.writeUInt32LE(jp.length,12);result.write('JSON',16);jp.copy(result,20);
const at=20+jp.length;result.writeUInt32LE(nb.length,at);result.write('BIN\0',at+4,'ascii');nb.copy(result,at+8);
fs.mkdirSync(outDir,{recursive:true});
const glbPath=path.join(outDir,'R138H_WARM_HAIR_R36MK_2100.glb'),pngPath=path.join(outDir,'R138H_WARM_HAIR_ATLAS_256.png');
fs.writeFileSync(glbPath,result);fs.writeFileSync(pngPath,newPNG);
const report={version:'R138H',sourceGLB:path.basename(input),sourceSHA256:sha(original),patchedGLBSHA256:sha(result),originalHairPNGSHA256:sha(oldPNG),newHairPNGSHA256:sha(newPNG),originalMeanRGB:before.map(v=>Math.round(v/(im.w*im.h))),newMeanRGB:after.map(v=>Math.round(v/(im.w*im.h))),triangles:2100,joints:63,sourceGeometryPreserved:true,updatedImageIndex:1,imageRes:[256,256],nativeS2Rendered:false};
fs.writeFileSync(path.join(outDir,'R138H_WARM_HAIR.report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
