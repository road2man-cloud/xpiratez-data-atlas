#!/usr/bin/env node
'use strict';
// Bake N19 high-frequency microrelief into V20's EXISTING continuous garment UV atlas.
// Does not add underwear, geometry, a second garment material, or a donor mesh.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {load,extract,values,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const [v20File,n20File,outFile]=process.argv.slice(2);
if(!outFile)throw Error('usage: node build.cjs V20.glb N20.glb OUTPUT.glb');
const base=load(v20File),donor=load(n20File),b=new Builder(base);
const pIndex=b.g.meshes[0].primitives.findIndex(p=>p.material===18);
if(pIndex<0)throw Error('no V20 opaque suit primitive');
const p=b.g.meshes[0].primitives[pIndex],cloth=extract(base,0,pIndex),tangents=values(base,p.attributes.TANGENT);
const q=extract(donor,0,3),Q=q.positions;
if(cloth.positions.length!==1343||cloth.indices.length!==2146*3||Q.length<100||base.g.skins[0].joints.length!==63)throw Error('input V20/N19 budget mismatch');
const material=b.g.materials[18],prevNormal=material.normalTexture;
if(material.alphaMode!=='OPAQUE'||!prevNormal||prevNormal.texCoord!==0)throw Error('opaque V20 normal map expected');
const oldTex=b.g.textures[prevNormal.index],oldImage=b.g.images[oldTex.source];
if(oldImage.mimeType!=='image/png')throw Error('normal map is not PNG');
const sourceView=b.g.bufferViews[oldImage.bufferView];
const pngBytes=Buffer.from(base.bin.subarray((sourceView.byteOffset||0),(sourceView.byteOffset||0)+sourceView.byteLength));
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(buf){let c=0xffffffff;for(const byte of buf){c^=byte;for(let k=0;k<8;k++)c=(c&1)?((c>>>1)^0xedb88320):(c>>>1);}return (c^0xffffffff)>>>0;}
function pngChunk(name,buf){const type=Buffer.from(name),out=Buffer.alloc(12+buf.length);out.writeUInt32BE(buf.length,0);type.copy(out,4);buf.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([type,buf])),8+buf.length);return out;}
function decodeRGB(bytes){
 if(!bytes.subarray(0,8).equals(signature))throw Error('invalid PNG signature');
 let at=8,w=0,h=0,depth=0,mode=0,parts=[];
 while(at<bytes.length){
  const len=bytes.readUInt32BE(at),name=bytes.toString('ascii',at+4,at+8),part=bytes.subarray(at+8,at+8+len);
  if(name==='IHDR'){w=part.readUInt32BE(0);h=part.readUInt32BE(4);depth=part[8];mode=part[9];}
  if(name==='IDAT')parts.push(part);
  at+=len+12;if(name==='IEND')break;
 }
 if(w!==512||h!==512||depth!==8||mode!==2)throw Error('unexpected V20 normal atlas dimensions/format');
 const raw=zlib.inflateSync(Buffer.concat(parts)),stride=w*3,out=Buffer.alloc(h*stride);
 let ptr=0;
 for(let y=0;y<h;y++){
  const filter=raw[ptr++];
  for(let x=0;x<stride;x++){
   const left=x>=3?out[y*stride+x-3]:0,up=y>0?out[(y-1)*stride+x]:0,ul=y>0&&x>=3?out[(y-1)*stride+x-3]:0;
   let predictor=0;
   if(filter===1)predictor=left;
   else if(filter===2)predictor=up;
   else if(filter===3)predictor=Math.floor((left+up)/2);
   else if(filter===4){const p=left+up-ul,a=Math.abs(p-left),bb=Math.abs(p-up),c=Math.abs(p-ul);predictor=a<=bb&&a<=c?left:bb<=c?up:ul;}
   else if(filter!==0)throw Error('unsupported PNG filter '+filter);
   out[y*stride+x]=(raw[ptr++]+predictor)&255;
  }
 }
 if(ptr!==raw.length)throw Error('PNG decode length mismatch');
 return {w,h,pixels:out};
}
function encodeRGB(img){
 const header=Buffer.alloc(13);
 header.writeUInt32BE(img.w,0);header.writeUInt32BE(img.h,4);header[8]=8;header[9]=2;
 const stride=img.w*3,raw=Buffer.alloc(img.h*(stride+1));
 for(let y=0;y<img.h;y++)img.pixels.copy(raw,y*(stride+1)+1,y*stride,(y+1)*stride);
 return Buffer.concat([signature,pngChunk('IHDR',header),pngChunk('IDAT',zlib.deflateSync(raw,{level:9})),pngChunk('IEND',Buffer.alloc(0))]);
}
const atlas=decodeRGB(pngBytes),original=Buffer.from(atlas.pixels);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),fade=v=>{v=clamp(v,0,1);return v*v*(3-2*v);};
const unit=a=>{const m=Math.hypot(...a)||1;return a.map(x=>x/m);};
const cross=(a,c)=>[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]];
const D=Q,lowX=Math.min(...D.map(v=>v[0])),highX=Math.max(...D.map(v=>v[0])),lowZ=Math.min(...D.map(v=>v[2])),highZ=Math.max(...D.map(v=>v[2]));
const lum=q.colors?.map(c=>c[0]*.2126+c[1]*.7152+c[2]*.0722);
function donorAt(x,z){
 let best=[];
 for(let i=0;i<D.length;i++){
  const a=D[i],dist=Math.hypot(a[0]-x,a[2]-z);
  if(best.length<7){best.push([dist,i]);best.sort((a,b)=>a[0]-b[0]);}
  else if(dist<best[6][0]){best[6]=[dist,i];best.sort((a,b)=>a[0]-b[0]);}
 }
 let wsum=0,ysum=0,lsum=0;
 for(const [dist,i] of best){const w=1/((dist+.006)**2);wsum+=w;ysum+=D[i][1]*w;if(lum)lsum+=lum[i]*w;}
 return {height:ysum/wsum,light:lum?lsum/wsum:0,dist:best[0][0]};
}
const highPass=(x,z)=>{
 const h=.024,cc=donorAt(x,z);
 const ring=[donorAt(x+h,z),donorAt(x-h,z),donorAt(x,z+h),donorAt(x,z-h)];
 const mean=ring.reduce((s,v)=>s+v.height,0)*.25;
 const meanLight=ring.reduce((s,v)=>s+v.light,0)*.25;
 return (cc.height-mean)*.90+(cc.light-meanLight)*.004;
};
const UV=cloth.uvs,P=cloth.positions,N=cloth.normals,IDX=cloth.indices;
const W=atlas.w,H=atlas.h,coverage=new Uint16Array(W*H),applied=new Uint16Array(W*H),accX=new Float64Array(W*H),accY=new Float64Array(W*H),accW=new Float64Array(W*H);
let eligibleTriangles=0,rasterSamples=0;
for(let k=0;k<IDX.length;k+=3){
 const ids=IDX.slice(k,k+3),uv=ids.map(i=>UV[i]),pts=ids.map(i=>P[i]);
 const a=uv[0][0]*W,b0=uv[0][1]*H,c=uv[1][0]*W,d=uv[1][1]*H,e=uv[2][0]*W,f=uv[2][1]*H;
 const det=(d-f)*(a-e)+(e-c)*(b0-f);if(Math.abs(det)<.00001)continue;
 const x0=Math.max(0,Math.floor(Math.min(a,c,e))),x1=Math.min(W-1,Math.ceil(Math.max(a,c,e)));
 const y0=Math.max(0,Math.floor(Math.min(b0,d,f))),y1=Math.min(H-1,Math.ceil(Math.max(b0,d,f)));
 if(x0>x1||y0>y1)continue;
 const cent=pts.reduce((sum,v)=>[sum[0]+v[0]/3,sum[1]+v[1]/3,sum[2]+v[2]/3],[0,0,0]);
 const eligible=cent[0]>lowX-.025&&cent[0]<highX+.025&&cent[2]>lowZ-.025&&cent[2]<highZ+.025&&donorAt(cent[0],cent[2]).dist<.12;
 if(eligible)eligibleTriangles++;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  const px=x+.5,py=y+.5,l0=((d-f)*(px-e)+(e-c)*(py-f))/det,l1=((f-b0)*(px-e)+(a-e)*(py-f))/det,l2=1-l0-l1;
  if(Math.min(l0,l1,l2)<-.000001)continue;
  const id=y*W+x;coverage[id]++;
  if(!eligible)continue;
  const pos=[0,1,2].map(j=>pts[0][j]*l0+pts[1][j]*l1+pts[2][j]*l2);
  const boundary=Math.min((pos[0]-lowX)/.065,(highX-pos[0])/.065,(pos[2]-lowZ)/.070,(highZ-pos[2])/.070);
  const dd=donorAt(pos[0],pos[2]);
  const strength=fade(boundary)*fade((.105-dd.dist)/.070);
  if(strength<.005)continue;
  const normal=unit([0,1,2].map(j=>N[ids[0]][j]*l0+N[ids[1]][j]*l1+N[ids[2]][j]*l2));
  const t=unit([0,1,2].map(j=>tangents[ids[0]][j]*l0+tangents[ids[1]][j]*l1+tangents[ids[2]][j]*l2));
  const sign=Math.sign(tangents[ids[0]][3]*l0+tangents[ids[1]][3]*l1+tangents[ids[2]][3]*l2)||1;
  const bitangent=cross(normal,t).map(v=>v*sign);
  const eps=.0065,xp=highPass(pos[0]+eps,pos[2]),xm=highPass(pos[0]-eps,pos[2]),zp=highPass(pos[0],pos[2]+eps),zm=highPass(pos[0],pos[2]-eps);
  const gx=(xp-xm)/(2*eps),gz=(zp-zm)/(2*eps);
  const dx=clamp(-(gx*t[0]+gz*t[2])*1.65,-.62,.62)*strength;
  const dy=clamp(-(gx*bitangent[0]+gz*bitangent[2])*1.65,-.62,.62)*strength;
  const conf=strength;
  accX[id]+=dx*conf;accY[id]+=dy*conf;accW[id]+=conf;applied[id]++;rasterSamples++;
 }
}
if(eligibleTriangles<50)throw Error('donor projection region too small: '+eligibleTriangles);
let changed=0,peakComponent=0,sumAngle=0,maxAngle=0,overlapAvoided=0;
for(let i=0;i<W*H;i++){
 if(!accW[i])continue;
 const ratio=applied[i]/Math.max(1,coverage[i]);
 if(ratio<.65){overlapAvoided++;continue;}
 const mix=clamp(ratio,0,1);
 const x=accX[i]/accW[i]*mix,y=accY[i]/accW[i]*mix;
 const off=i*3;
 const old=unit([original[off]/127.5-1,original[off+1]/127.5-1,original[off+2]/127.5-1]);
 const now=unit([old[0]+x,old[1]+y,old[2]]);
 const angle=Math.acos(clamp(old[0]*now[0]+old[1]*now[1]+old[2]*now[2],-1,1))*180/Math.PI;
 if(angle<.05)continue;
 for(let k=0;k<3;k++)atlas.pixels[off+k]=clamp(Math.round((now[k]+1)*127.5),0,255);
 changed++;sumAngle+=angle;maxAngle=Math.max(maxAngle,angle);peakComponent=Math.max(peakComponent,Math.abs(x),Math.abs(y));
}
if(changed<60||changed>W*H*.25)throw Error('implausible N19 normal bake coverage '+changed);
const generated=encodeRGB(atlas);
const newImage=b.addImage('V21 N19 high-pass garment micro normal atlas',generated);
const newTexture=b.g.textures.push({name:'V21 N19 cloth normal texture',source:newImage,sampler:oldTex.sampler??0})-1;
material.normalTexture={...prevNormal,index:newTexture};
b.g.asset.generator='R36HW Athletic V21 N19 tangent-space normal detail';
b.g.extras={...(b.g.extras||{}),athleticSuitV21:{base:'V20',donor:'N19 center via N20',opaque:true,geometryUnchanged:true,noExtraGarment:true,originalAtlasPreserved:true}};
fs.mkdirSync(path.dirname(outFile),{recursive:true});const result=b.save(outFile);
const atlasPath=path.resolve(path.dirname(outFile),'R36HW_V21_N19_NORMAL_ATLAS.png');fs.writeFileSync(atlasPath,generated);
const report={baseSha256:base.sha,donorSha256:donor.sha,outputSha256:result.sha,outputBytes:result.bytes,outputAtlasBytes:generated.length,atlasDimensions:[W,H],inputNormalTexture:prevNormal.index,outputNormalTexture:newTexture,originalNormalScale:prevNormal.scale,eligibleTriangles,rasterSamples,bakedTexels:changed,overlapTexelsProtected:overlapAvoided,meanTangentNormalDeltaDegrees:sumAngle/changed,maxTangentNormalDeltaDegrees:maxAngle,peakSlopeComponent:peakComponent,originalTotalTriangles:3214,outputTotalTriangles:3214,originalGarmentVertices:1343,outputGarmentVertices:1343,skinJoints:63,opaque:true,additionalGarmentPrimitives:0,material18NormalTextureOnly:true,n19DonorMeshCopied:false,originalV20GeometryPreserved:true,nativeS2Rendered:false,visualAcceptance:false};
const rp=path.resolve(path.dirname(outFile),'../reports/build.json');fs.mkdirSync(path.dirname(rp),{recursive:true});fs.writeFileSync(rp,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
