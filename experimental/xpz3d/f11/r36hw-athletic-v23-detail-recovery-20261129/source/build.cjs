#!/usr/bin/env node
'use strict';
// V22: improve V21 N19 microrelief normals without changing V14/V20 garment geometry.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {load,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('usage: node build.cjs V22.glb OUTPUT.glb');
const v22=load(input),b=new Builder(v22),g=b.g,mat=g.materials[18];
if(!mat||mat.alphaMode!=='OPAQUE'||mat.normalTexture?.index!==5||g.skins[0].joints.length!==63)throw Error('unexpected V21 garment/rig');
const totalTris=g.meshes[0].primitives.reduce((sum,p)=>sum+g.accessors[p.indices].count/3,0);
if(totalTris!==3214)throw Error('V21 geometry budget unexpectedly changed');
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes){let c=0xffffffff;for(const v of bytes){c^=v;for(let i=0;i<8;i++)c=(c&1)?(c>>>1)^0xedb88320:c>>>1;}return(c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type,'ascii'),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),8+data.length);return out;}
function getTexturePng(texture){
 const i=g.images[g.textures[texture].source];if(i.mimeType!=='image/png')throw Error('PNG required');
 const view=g.bufferViews[i.bufferView];return Buffer.from(v22.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength));
}
function decodePng(encoded){
 if(!encoded.subarray(0,8).equals(pngSignature))throw Error('PNG signature');
 let pos=8,w=0,h=0,color=0,depth=0,interlace=0,dat=[];
 while(pos<encoded.length){
  const size=encoded.readUInt32BE(pos),name=encoded.toString('ascii',pos+4,pos+8),value=encoded.subarray(pos+8,pos+8+size);
  if(name==='IHDR'){w=value.readUInt32BE(0);h=value.readUInt32BE(4);depth=value[8];color=value[9];interlace=value[12];}
  if(name==='IDAT')dat.push(value);pos+=size+12;if(name==='IEND')break;
 }
 if(w!==512||h!==512||color!==2||depth!==8||interlace!==0)throw Error('expected 512x512 RGB8 normal map');
 const infl=zlib.inflateSync(Buffer.concat(dat)),rowBytes=w*3,out=Buffer.alloc(h*rowBytes);let at=0;
 for(let y=0;y<h;y++){
  const filter=infl[at++];
  for(let x=0;x<rowBytes;x++){
   const left=x>=3?out[y*rowBytes+x-3]:0,up=y>0?out[(y-1)*rowBytes+x]:0,ul=x>=3&&y>0?out[(y-1)*rowBytes+x-3]:0;
   let pred=0;
   if(filter===1)pred=left;
   else if(filter===2)pred=up;
   else if(filter===3)pred=(left+up)>>1;
   else if(filter===4){const p=left+up-ul,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-ul);pred=a<=b&&a<=c?left:b<=c?up:ul;}
   else if(filter!==0)throw Error('unsupported PNG filter '+filter);
   out[y*rowBytes+x]=(infl[at++]+pred)&255;
  }
 }
 if(at!==infl.length)throw Error('PNG inflate length');
 return {w,h,pixels:out};
}
function encodePng(img){
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(img.w,0);ihdr.writeUInt32BE(img.h,4);ihdr[8]=8;ihdr[9]=2;
 const rowBytes=img.w*3,rows=Buffer.alloc(img.h*(rowBytes+1));
 for(let y=0;y<img.h;y++)img.pixels.copy(rows,y*(rowBytes+1)+1,y*rowBytes,(y+1)*rowBytes);
 return Buffer.concat([pngSignature,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
// Recover high-frequency *N19* relief from V21, while retaining V22's softened
// baseline. This is texture-only; it never adds a second mesh, material or garment.
const original=decodePng(getTexturePng(3));
const donor=decodePng(getTexturePng(4));
const previous=decodePng(getTexturePng(5));
const W=original.w,H=original.h,num=W*H;
const clamp=(a,lo,hi)=>Math.min(hi,Math.max(lo,a));
const normal=v=>{const m=Math.hypot(...v)||1;return v.map(x=>x/m);};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const angle=(a,b)=>Math.acos(clamp(dot(a,b),-1,1))*180/Math.PI;
const decode=(bytes,i)=>normal([bytes[i*3]/127.5-1,bytes[i*3+1]/127.5-1,bytes[i*3+2]/127.5-1]);
const n0=new Array(num),d21=new Array(num),d22=new Array(num),active=new Uint8Array(num);
const A21=new Float32Array(num),A22=new Float32Array(num);
let sourceActive=0;
for(let i=0;i<num;i++){
 const orig=decode(original.pixels,i),raw=decode(donor.pixels,i),soft=decode(previous.pixels,i);
 n0[i]=orig;d21[i]=raw.map((v,k)=>v-orig[k]);d22[i]=soft.map((v,k)=>v-orig[k]);
 A21[i]=angle(orig,raw);A22[i]=angle(orig,soft);
 if(A21[i]>.13){active[i]=1;sourceActive++;}
}
const result={w:W,h:H,pixels:Buffer.from(previous.pixels)};
const delta={w:W,h:H,pixels:Buffer.alloc(num*3)};
const HIGH_FREQ_GAIN=.36,MAX_ANGLE_DEG=19.0,MIN_DELTA_DEG=.13;
const kernel=[1,4,6,4,1],sigma=.19;
let changed=0,angles22=0,angles23=0,angles21=0,max23=0,capped=0,neighborLinks=0,supported=0;
let editedDiff=0,pixelsUnchanged=0,edgeControlled=0,activePixelCount=0;
const changedTexturePixels=new Uint8Array(num);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const i=y*W+x;
 if(!active[i]){pixelsUnchanged++;continue;}
 activePixelCount++;
 angles21+=A21[i];angles22+=A22[i];
 const base=n0[i],raw=d21[i],soft=d22[i];
 let wx=0,mean=[0,0,0],count=0;
 for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
  const xx=x+ox,yy=y+oy;if(xx<0||yy<0||xx>=W||yy>=H)continue;
  const j=yy*W+xx;
  if(!active[j]||dot(base,n0[j])<.96)continue;
  const difference=(raw[0]-d21[j][0])**2+(raw[1]-d21[j][1])**2+(raw[2]-d21[j][2])**2;
  const w=kernel[oy+2]*kernel[ox+2]*Math.exp(-difference/(2*sigma*sigma));
  for(let k=0;k<3;k++)mean[k]+=d21[j][k]*w;
  wx+=w;count++;neighborLinks++;
 }
 if(wx<.001){angles23+=A22[i];continue;}
 supported++;
 mean=mean.map(v=>v/wx);
 const high=raw.map((v,k)=>v-mean[k]);
 // Suppress isolated texture UV boundary spikes while preserving directional ridges.
 const coverage=Math.min(1,count/12);
 if(coverage<.70)edgeControlled++;
 const gain=HIGH_FREQ_GAIN*coverage;
 let out=normal(base.map((v,k)=>v+soft[k]+high[k]*gain));
 let deltaAngle=angle(base,out);
 if(deltaAngle>MAX_ANGLE_DEG){
  const theta=deltaAngle*Math.PI/180,t=MAX_ANGLE_DEG/deltaAngle;
  const den=Math.sin(theta);
  if(Math.abs(den)>1e-5){
   const va=Math.sin((1-t)*theta)/den,vb=Math.sin(t*theta)/den;
   out=normal(base.map((v,k)=>v*va+out[k]*vb));
  }else out=normal(base.map((v,k)=>v+(out[k]-v)*t));
  capped++;
 }
 const offset=i*3;
 for(let k=0;k<3;k++)result.pixels[offset+k]=clamp(Math.round((out[k]+1)*127.5),0,255);
 const actual=decode(result.pixels,i),after=angle(base,actual),change=angle(decode(previous.pixels,i),actual);
 angles23+=after;max23=Math.max(max23,after);
 if(change>MIN_DELTA_DEG){
  changed++;changedTexturePixels[i]=1;editedDiff+=change;
  // Diagnostic texture only; not used on the rendered model.
  const level=clamp(Math.round(change*12),0,255);
  for(let k=0;k<3;k++)delta.pixels[offset+k]=level;
 }
}
if(sourceActive<15000||changed<1500||max23>19.9)throw Error('V23 microrelief build guard '+JSON.stringify({sourceActive,changed,max23}));
const png=encodePng(result),detailPng=encodePng(delta);
const image=b.addImage('R36HW V23 N19 high-frequency refined fabric normals',png);
const tex=g.textures.push({name:'R36HW V23 N19 microrelief recovery',source:image,sampler:g.textures[5].sampler??0})-1;
const matBefore=mat.normalTexture;mat.normalTexture={...matBefore,index:tex};
g.asset.generator='R36HW V23 N19 high-frequency detail recovery';
g.extras={...(g.extras||{}),athleticSuitV23:{base:'V22',N19Reference:'V21 embedded normal atlas',highFrequencyGain:HIGH_FREQ_GAIN,angleCap:MAX_ANGLE_DEG,geometryUnchanged:true,noAddedClothing:true,opaque:true}};
fs.mkdirSync(path.dirname(output),{recursive:true});const saved=b.save(output);
fs.writeFileSync(path.resolve(path.dirname(output),'R36HW_F11_V23_N19_DETAIL_NORMAL.png'),png);
fs.writeFileSync(path.resolve(path.dirname(output),'R36HW_F11_V23_CHANGE_MAP.png'),detailPng);
const report={
 baseSha256:v22.sha,outputSha256:saved.sha,outputBytes:saved.bytes,
 sourceActiveTexels:sourceActive,changedTexelsFromV22:changed,originalTexelsUnchanged:pixelsUnchanged,
 meanSourceAngleV21:angles21/activePixelCount,meanSourceAngleV22:angles22/activePixelCount,
 meanOutputAngleV23:angles23/activePixelCount,maxOutputAngleV23:max23,
 meanV22ToV23AngleOnChanged:changed?editedDiff/changed:0,
 localDetailRecoveryGain:HIGH_FREQ_GAIN,angleCapDegrees:MAX_ANGLE_DEG,
 cappedTexels:capped,edgeControlledTexels:edgeControlled,supportedTexels:supported,
 localNeighborLinks:neighborLinks,atlasDimensions:[W,H],normalAtlasBytes:png.length,changeMapBytes:detailPng.length,
 referenceOriginalTexture:3,referenceN19Texture:4,referenceV22Texture:5,outputNormalTexture:tex,
 originalNormalScale:matBefore.scale,originalTotalTriangles:3214,outputTotalTriangles:totalTris,garmentVertices:1343,
 originalSkinJoints:63,material18Opaque:true,garmentGeometryUnchanged:true,
 originalV14ClothingCoveragePreserved:true,additionalGarmentPrimitives:0,
 donorAnatomyCopied:false,nativeS2Rendered:false,visualAcceptance:false
};
const rp=path.resolve(path.dirname(output),'../reports/build.json');
fs.mkdirSync(path.dirname(rp),{recursive:true});fs.writeFileSync(rp,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
