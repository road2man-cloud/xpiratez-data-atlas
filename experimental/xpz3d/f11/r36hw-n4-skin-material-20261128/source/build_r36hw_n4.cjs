#!/usr/bin/env node
'use strict';
/*
 * R36HW-N4: procedural skin micro-material on the N3 direct-HW geometry.
 * NO copy of the user image, NO baked-photo projection, NO new replacement body.
 * Keeps N3 positions, indices, face/hair source attributes and 63-joint skeleton.
 * Uses built-in Node modules only; output GLB carries its own PNG images.
 */
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib'),path=require('node:path');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n3-curvature-20261128/output/R36HW_N3_CURVATURE.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N4_SKIN_DETAIL.glb');
const report=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N4_SKIN_DETAIL.json');
const expectedInput='87295d5b09b735110838f4bdbad4729b07b632ea7c4e11c4d01216f0ea412424';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const b=fs.readFileSync(input);
if(sha(b)!==expectedInput)throw Error('N3 base file changed: '+sha(b));
if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw Error('Invalid GLB2');
const jlen=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+jlen));
const binOff=20+jlen,oldBinSize=b.readUInt32LE(binOff);
if(b.toString('ascii',binOff+4,binOff+8)!=='BIN\0')throw Error('GLB missing BIN chunk');
const originalBin=b.subarray(binOff+8,binOff+8+oldBinSize);
if(g.skins?.[0]?.joints?.length!==63||g.meshes.length!==1||g.meshes[0].primitives.length!==9)throw Error('Unexpected HW N3 rig or mesh');
const primitives=g.meshes[0].primitives;
const count=primitives.reduce((n,p)=>n+g.accessors[p.indices].count/3,0);
if(count!==2076)throw Error('N3 triangles changed: '+count);
const skinId=g.materials.findIndex(m=>m.name==='skin');
if(skinId<0)throw Error('Original skin missing');
for(const i of [2,3,4,5])if(primitives[i].material!==skinId ||primitives[i].attributes.TEXCOORD_0===undefined)throw Error('Expected dressed HW shell with UV: primitive '+i);
const W=512,H=512,clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const smooth=t=>t*t*(3-2*t);
function hash2(x,y,seed){let a=(Math.imul(x+13,374761393)+Math.imul(y+37,668265263)+Math.imul(seed+1,2246822519))|0;a=Math.imul(a^(a>>>13),1274126177);return ((a^(a>>>16))>>>0)/4294967295;}
function noise(u,v,n,seed){
 const xx=(u-Math.floor(u))*n,yy=(v-Math.floor(v))*n,ix=Math.floor(xx),iy=Math.floor(yy),fx=smooth(xx-ix),fy=smooth(yy-iy);
 const v00=hash2(ix%n,iy%n,seed),v10=hash2((ix+1)%n,iy%n,seed),v01=hash2(ix%n,(iy+1)%n,seed),v11=hash2((ix+1)%n,(iy+1)%n,seed);
 return ((v00*(1-fx)+v10*fx)*(1-fy)+(v01*(1-fx)+v11*fx)*fy)*2-1;
}
function height(u,v){return .14*noise(u,v,9,3)+.32*noise(u,v,32,8)+.39*noise(u,v,91,23)+.15*noise(u,v,167,63)}
function pngChunk(type,bytes){
 const nm=Buffer.from(type,'ascii'),out=Buffer.alloc(12+bytes.length);out.writeUInt32BE(bytes.length,0);nm.copy(out,4);bytes.copy(out,8);
 let crc=0xffffffff;for(let i=4;i<8+bytes.length;i++){crc^=out[i];for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 out.writeUInt32BE((crc^0xffffffff)>>>0,8+bytes.length);return out;
}
function png(width,height,pixels){
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;header[10]=0;header[11]=0;header[12]=0;
 const raw=Buffer.alloc(height*(1+width*4));
 for(let y=0;y<height;y++)pixels.copy(raw,y*(1+width*4)+1,y*width*4,(y+1)*width*4);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',zlib.deflateSync(raw,{level:9})),pngChunk('IEND',Buffer.alloc(0))]);
}
const albedo=Buffer.alloc(W*H*4),normal=Buffer.alloc(W*H*4);
let aMin=255,aMax=0,nMin=255,nMax=0;
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const u=x/(W-1),v=y/(H-1),n=height(u,v),fine=noise(u,v,167,63),freckle=Math.max(0,noise(u,v,91,66)-.55);
 const base=[248,244,240],i=(y*W+x)*4;
 for(let c=0;c<3;c++){
  const p=clamp(Math.round(base[c]+n*6+fine*2.6-freckle*[10,7,4][c]),218,255);
  albedo[i+c]=p;aMin=Math.min(aMin,p);aMax=Math.max(aMax,p);
 }
 albedo[i+3]=255;
 const dx=(height(u+1/(W-1),v)-height(u-1/(W-1),v))*.95;
 const dy=(height(u,v+1/(H-1))-height(u,v-1/(H-1)))*.95;
 const len=Math.hypot(dx,dy,1);
 const vx=[-dx/len,-dy/len,1/len];
 for(let c=0;c<3;c++){const v=clamp(Math.round(vx[c]*127.5+127.5),0,255);normal[i+c]=v;nMin=Math.min(nMin,v);nMax=Math.max(nMax,v)}
 normal[i+3]=255;
}
const pngBase=png(W,H,albedo),pngNormal=png(W,H,normal);
const binaries=[Buffer.from(originalBin)];
function align(){const length=binaries.reduce((s,b)=>s+b.length,0);if(length%4)binaries.push(Buffer.alloc(4-length%4))}
function append(buf){
 align();
 const offset=binaries.reduce((s,b)=>s+b.length,0);
 binaries.push(buf);return g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buf.length})-1;
}
g.images=g.images||[];g.textures=g.textures||[];g.samplers=g.samplers||[];
const imA=g.images.push({name:'R36HW_N4_procedural_skin_albedo',mimeType:'image/png',bufferView:append(pngBase)})-1;
const imN=g.images.push({name:'R36HW_N4_procedural_skin_micro_normal',mimeType:'image/png',bufferView:append(pngNormal)})-1;
const samp=g.samplers.push({magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497})-1;
const texA=g.textures.push({name:'R36HW_N4_skin_color',source:imA,sampler:samp})-1;
const texN=g.textures.push({name:'R36HW_N4_skin_normal',source:imN,sampler:samp})-1;
const baseMaterial=JSON.parse(JSON.stringify(g.materials[skinId]));
baseMaterial.name='R36HW_N4_procedural_skin_shells';
baseMaterial.pbrMetallicRoughness=baseMaterial.pbrMetallicRoughness||{};
baseMaterial.pbrMetallicRoughness.baseColorTexture={index:texA,texCoord:0};
baseMaterial.pbrMetallicRoughness.roughnessFactor=.88;
baseMaterial.pbrMetallicRoughness.metallicFactor=0;
baseMaterial.normalTexture={index:texN,texCoord:0,scale:.48};
const newMaterial=g.materials.push(baseMaterial)-1;
for(const i of [2,3,4,5])primitives[i].material=newMaterial;
align();const bin=Buffer.concat(binaries);g.buffers[0].byteLength=bin.length;
const jtext=Buffer.from(JSON.stringify(g),'utf8'),jpad=Buffer.alloc(Math.ceil(jtext.length/4)*4,32);jtext.copy(jpad);
const out=Buffer.alloc(20+jpad.length+8+bin.length);
out.write('glTF',0,'ascii');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
out.writeUInt32LE(jpad.length,12);out.write('JSON',16,'ascii');jpad.copy(out,20);
const off=20+jpad.length;out.writeUInt32LE(bin.length,off);out.write('BIN\0',off+4,'ascii');bin.copy(out,off+8);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(report),{recursive:true});
fs.writeFileSync(output,out);
const result={stage:'R36HW N4: subtle tiled procedural skin albedo and tangent-space normal on source HW garment shell primitives',inputSha256:sha(b),outputSha256:sha(out),modelTriangles:count,skinJoints:g.skins[0].joints.length,originalBinaryBytes:originalBin.length,newBinaryBytes:bin.length,originalFacePrimitive:primitives[0],originalHairPrimitive:primitives[1],texturedPrimitives:[2,3,4,5],untouchedExposedSkinPrimitiveIndex:6,albedoTexture:{width:W,height:H,pngBytes:pngBase.length,minChannel:aMin,maxChannel:aMax},microNormalTexture:{width:W,height:H,pngBytes:pngNormal.length,minChannel:nMin,maxChannel:nMax,scale:.48},limitations:['No screenshot or native S2 confirmation','Subtle procedural micro-detail is not target anatomy','Existing clothing-origin UV mapping still needs seam retopology','Skin material only; original face and hair preserved']};
fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({out:output,bytes:out.length,triangles:count,sha256:result.outputSha256,textured:result.texturedPrimitives,images:g.images.length}));
