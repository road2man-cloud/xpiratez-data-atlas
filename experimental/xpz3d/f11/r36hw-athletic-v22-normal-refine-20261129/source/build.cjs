#!/usr/bin/env node
'use strict';
// V22: improve V21 N19 microrelief normals without changing V14/V20 garment geometry.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {load,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('usage: node build.cjs V21.glb OUTPUT.glb');
const v21=load(input),b=new Builder(v21),g=b.g,mat=g.materials[18];
if(!mat||mat.alphaMode!=='OPAQUE'||mat.normalTexture?.index!==4||g.skins[0].joints.length!==63)throw Error('unexpected V21 garment/rig');
const totalTris=g.meshes[0].primitives.reduce((sum,p)=>sum+g.accessors[p.indices].count/3,0);
if(totalTris!==3214)throw Error('V21 geometry budget unexpectedly changed');
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes){let c=0xffffffff;for(const v of bytes){c^=v;for(let i=0;i<8;i++)c=(c&1)?(c>>>1)^0xedb88320:c>>>1;}return(c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type,'ascii'),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),8+data.length);return out;}
function getTexturePng(texture){
 const i=g.images[g.textures[texture].source];if(i.mimeType!=='image/png')throw Error('PNG required');
 const view=g.bufferViews[i.bufferView];return Buffer.from(v21.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength));
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
const orig=decodePng(getTexturePng(3)),baked=decodePng(getTexturePng(4));
const num=orig.w*orig.h,clamp=(a,l,h)=>Math.max(l,Math.min(h,a));
const vec=Array.from({length:num}),dv=Array.from({length:num}),mask=new Uint8Array(num),diffAngle=new Float32Array(num);
const norm=a=>{const len=Math.hypot(...a)||1;return a.map(v=>v/len);};
const dot=(a,c)=>a[0]*c[0]+a[1]*c[1]+a[2]*c[2];
const angle=(a,c)=>Math.acos(clamp(dot(a,c),-1,1))*180/Math.PI;
for(let i=0;i<num;i++){
 const off=i*3,n0=norm([orig.pixels[off]/127.5-1,orig.pixels[off+1]/127.5-1,orig.pixels[off+2]/127.5-1]);
 const n1=norm([baked.pixels[off]/127.5-1,baked.pixels[off+1]/127.5-1,baked.pixels[off+2]/127.5-1]);
 vec[i]=n0;dv[i]=[n1[0]-n0[0],n1[1]-n0[1],n1[2]-n0[2]];
 const deg=angle(n0,n1);diffAngle[i]=deg;if(deg>=.13)mask[i]=1;
}
const result={w:orig.w,h:orig.h,pixels:Buffer.from(orig.pixels)};
const MAX_DELTA_ANGLE_DEGREES=16.0,GAIN=.78,SMOOTH_WEIGHT=.40;
const neighbors=[[-1,-1,.35],[0,-1,.9],[1,-1,.35],[-1,0,.9],[0,0,2],[1,0,.9],[-1,1,.35],[0,1,.9],[1,1,.35]];
let inputActive=0,changed=0,capped=0,meanBefore=0,meanAfter=0,maxBefore=0,maxAfter=0,preservedPixels=0;
let totalNeighborSamples=0;
for(let y=0;y<orig.h;y++)for(let x=0;x<orig.w;x++){
 const i=y*orig.w+x,old=vec[i],raw=dv[i];
 if(!mask[i]){preservedPixels++;continue;}
 inputActive++;const before=diffAngle[i];meanBefore+=before;maxBefore=Math.max(maxBefore,before);
 let wsum=0,sum=[0,0,0];
 for(const [dx,dy,spaceW] of neighbors){
  const xx=x+dx,yy=y+dy;if(xx<0||xx>=orig.w||yy<0||yy>=orig.h)continue;
  const j=yy*orig.w+xx;if(!mask[j])continue;
  // Do not mix adjacent but unrelated UV islands or contrasting sharp relief.
  if(dot(old,vec[j])<.94)continue;
  const d2=(raw[0]-dv[j][0])**2+(raw[1]-dv[j][1])**2+(raw[2]-dv[j][2])**2;
  const weight=spaceW*Math.exp(-d2/(2*.21*.21));
  for(let c=0;c<3;c++)sum[c]+=dv[j][c]*weight;
  wsum+=weight;totalNeighborSamples++;
 }
 const smooth=wsum?sum.map(v=>v/wsum):raw;
 const d=raw.map((v,k)=>GAIN*((1-SMOOTH_WEIGHT)*v+SMOOTH_WEIGHT*smooth[k]));
 let target=norm(old.map((v,k)=>v+d[k]));
 let deg=angle(old,target);
 if(deg>MAX_DELTA_ANGLE_DEGREES){
  const t=MAX_DELTA_ANGLE_DEGREES/deg,theta=deg*Math.PI/180;
  const s0=Math.sin((1-t)*theta)/Math.sin(theta),s1=Math.sin(t*theta)/Math.sin(theta);
  target=norm(old.map((v,k)=>v*s0+target[k]*s1));deg=angle(old,target);capped++;
 }
 const off=i*3;
 for(let k=0;k<3;k++)result.pixels[off+k]=clamp(Math.round((target[k]+1)*127.5),0,255);
 const q=norm([result.pixels[off]/127.5-1,result.pixels[off+1]/127.5-1,result.pixels[off+2]/127.5-1]);
 const actual=angle(old,q);
 if(actual>.13)changed++;meanAfter+=actual;maxAfter=Math.max(maxAfter,actual);
}
if(inputActive<10000||changed<10000||changed>24000||maxAfter>17)throw Error('V22 texture acceptance guard '+JSON.stringify({inputActive,changed,maxAfter}));
const png=encodePng(result),image=b.addImage('R36HW V22 N19 refined micro-normal atlas',png);
const tex=g.textures.push({name:'R36HW V22 N19 refined normal texture',source:image,sampler:g.textures[4].sampler??0})-1;
const previous=mat.normalTexture;mat.normalTexture={...previous,index:tex};
g.asset.generator='R36HW V22 N19 spatially-smoothed textile microrelief';
g.extras={...(g.extras||{}),athleticSuitV22:{base:'V21',originalCloth:'V14',N19Microrelief:true,normalFilter:'bilateral masked 3x3',normalDeltaCapDegrees:MAX_DELTA_ANGLE_DEGREES,sameGeometry:true,noGarmentOverlay:true,opaque:true}};
fs.mkdirSync(path.dirname(output),{recursive:true});const saved=b.save(output);
const normalPath=path.resolve(path.dirname(output),'R36HW_F11_V22_REFINED_N19_NORMAL.png');fs.writeFileSync(normalPath,png);
const report={baseSha256:v21.sha,outputSha256:saved.sha,outputBytes:saved.bytes,normalAtlasBytes:png.length,atlasDimensions:[orig.w,orig.h],inputReferenceNormalTexture:3,inputN19NormalTexture:4,outputNormalTexture:tex,inputAffectedTexels:inputActive,outputAffectedTexels:changed,preservedOriginalTexels:preservedPixels,neighborSamples:totalNeighborSamples,meanAtlasAngleBefore:meanBefore/inputActive,meanAtlasAngleAfter:meanAfter/inputActive,maxAtlasAngleBefore:maxBefore,maxAtlasAngleAfter:maxAfter,normalCapDegrees:MAX_DELTA_ANGLE_DEGREES,capAppliedTexels:capped,gain:GAIN,spatialSmoothing:SMOOTH_WEIGHT,originalNormalScale:previous.scale,triangles:totalTris,garmentVertices:1343,skinJoints:63,opaque:true,geometryUnchanged:true,vertexColorsUnchanged:true,garmentMaterial18Preserved:true,additionalGarmentPrimitives:0,nativeS2Rendered:false,visualAcceptance:false};
const reportPath=path.resolve(path.dirname(output),'../reports/build.json');fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
