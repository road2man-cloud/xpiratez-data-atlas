// V23 XPZC v2 texture-sampled static palette. Node.js, no dependencies.
function build(src){
 const assert=(c,s)=>{if(!c)throw Error(s)},clamp=x=>Math.max(0,Math.min(1,x)),mean=a=>[0,1,2].map(k=>a.reduce((s,v)=>s+v[k],0)/a.length),lum=x=>.2126*x[0]+.7152*x[1]+.0722*x[2];
 const d=new DataView(src.buffer,src.byteOffset,src.byteLength),jl=d.getUint32(12,true),base=28+jl;
 assert(d.getUint32(0,true)===0x46546c67&&d.getUint32(4,true)===2&&d.getUint32(8,true)===src.length&&d.getUint32(16,true)===0x4e4f534a&&d.getUint32(24+jl,true)===0x004e4942&&base+d.getUint32(20+jl,true)===src.length,"GLB header");
 const j=JSON.parse(String.fromCharCode(...src.subarray(20,20+jl))),bin=src.subarray(base);
 assert(j.skins[0].joints.length===63&&j.materials[18].alphaMode==="OPAQUE","source constraints");
 function read(id){const a=j.accessors[id],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],sz={5121:1,5123:2,5125:4,5126:4}[a.componentType],st=v.byteStride||sz*n,o=base+(v.byteOffset||0)+(a.byteOffset||0);assert(n&&sz&&!a.sparse&&v.buffer===0&&o+(a.count-1)*st+n*sz<=src.length,"accessor range");return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>{let p=o+i*st+k*sz,x=a.componentType===5126?d.getFloat32(p,true):a.componentType===5125?d.getUint32(p,true):sz===2?d.getUint16(p,true):d.getUint8(p);return a.normalized&&a.componentType!==5126?x/(sz===1?255:sz===2?65535:4294967295):x}))}
 function inflate(z,max){
  assert(z.length>6&&(z[0]&15)===8&&((z[0]*256+z[1])%31)===0&&!(z[1]&32),"zlib header");
  let bit=16;const end=(z.length-4)*8,rd=n=>{assert(bit+n<=end,"deflate EOF");let v=0;for(let i=0;i<n;i++,bit++)v|=((z[bit>>3]>>(bit&7))&1)<<i;return v};
  function tree(lens){let counts=Array(16).fill(0),next=Array(16).fill(0),code=0,m=new Map();for(const x of lens){assert(x<=15,"code length");if(x)counts[x]++}for(let k=1;k<=15;k++){code=(code+counts[k-1])<<1;next[k]=code}for(let i=0;i<lens.length;i++){let n=lens[i];if(n){const c=next[n]++;assert(c<(1<<n),"oversubscribed code");m.set((1<<n)|c,i)}}return m}
  function sym(t){let c=1;for(let n=1;n<=15;n++){c=(c<<1)|rd(1);if(t.has(c))return t.get(c)}throw Error("bad Huffman code")}
  const LB=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],LE=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],DB=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],DE=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],out=new Uint8Array(max);let p=0,final=0;
  const push=v=>{assert(p<max,"inflate overflow");out[p++]=v};
  while(!final){final=rd(1);const type=rd(2);
   if(type===0){bit=(bit+7)&~7;const n=rd(16),nn=rd(16);assert((n^65535)===nn,"stored length");for(let i=0;i<n;i++)push(rd(8));continue}
   assert(type!==3,"invalid block");let lt,dt;
   if(type===1){lt=tree(Array.from({length:288},(_,i)=>i<144?8:i<256?9:i<280?7:8));dt=tree(Array(32).fill(5))}
   else{const nl=rd(5)+257,nd=rd(5)+1,nc=rd(4)+4,cl=Array(19).fill(0);for(let k=0;k<nc;k++)cl[order[k]]=rd(3);const ct=tree(cl),lens=[];while(lens.length<nl+nd){let s=sym(ct);if(s<16)lens.push(s);else{let n,v;if(s===16){assert(lens.length,"repeat without value");n=rd(2)+3;v=lens.at(-1)}else if(s===17){n=rd(3)+3;v=0}else if(s===18){n=rd(7)+11;v=0}else throw Error("bad lengths");while(n--)lens.push(v)}assert(lens.length<=nl+nd,"code length overflow")}lt=tree(lens.slice(0,nl));dt=tree(lens.slice(nl))}
   for(;;){let s=sym(lt);if(s<256){push(s);continue}if(s===256)break;let n=s-257;assert(n<LB.length,"bad length");let count=LB[n]+rd(LE[n]),ds=sym(dt);assert(ds<DB.length,"bad distance");let dist=DB[ds]+rd(DE[ds]);assert(dist<=p,"bad backref");while(count--)push(out[p-dist])}
  }
  assert(p===max,"inflate length mismatch");let a=1,b=0;for(const v of out){a=(a+v)%65521;b=(b+a)%65521}const want=new DataView(z.buffer,z.byteOffset,z.byteLength).getUint32(z.length-4,false);assert(((b<<16|a)>>>0)===want,"adler mismatch");return out;
 }
 function png(bytes){
  assert(bytes.length>33&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v),"bad PNG");
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=8,w,h,type,depth,interlace,ids=[];
  while(p+12<=bytes.length){const n=dv.getUint32(p),tag=String.fromCharCode(...bytes.subarray(p+4,p+8));assert(p+12+n<=bytes.length,"PNG chunk overflow");const c=bytes.subarray(p+8,p+8+n);let crc=0xffffffff;for(let i=p+4;i<p+8+n;i++){crc^=bytes[i];for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}assert(((crc^0xffffffff)>>>0)===dv.getUint32(p+8+n),"PNG CRC");if(tag==="IHDR"){w=dv.getUint32(p+8);h=dv.getUint32(p+12);depth=c[8];type=c[9];interlace=c[12]}if(tag==="IDAT")ids.push(c);p+=12+n;if(tag==="IEND")break}
  assert(w>0&&h>0&&w<=4096&&h<=4096&&depth===8&&(type===2||type===6)&&interlace===0,"unsupported PNG layout "+type);
  let z=new Uint8Array(ids.reduce((s,x)=>s+x.length,0)),k=0;for(const x of ids){z.set(x,k);k+=x.length}
  const ch=type===6?4:3,row=w*ch,raw=inflate(z,h*(row+1)),pix=new Uint8Array(h*row);let o=0;
  for(let y=0;y<h;y++){let f=raw[o++];assert(f<=4,"PNG filter");for(let x=0;x<row;x++){let i=y*row+x,a=x>=ch?pix[i-ch]:0,b=y?pix[i-row]:0,c=y&&x>=ch?pix[i-row-ch]:0,v=raw[o++];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=Math.floor((a+b)/2);else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c}pix[i]=v&255}}
  return {w,h,ch,pix};
 }
 const textures=new Map(),textureAudit=[];
 function texture(mat){const idx=mat.pbrMetallicRoughness?.baseColorTexture?.index;if(idx===undefined)return null;if(textures.has(idx))return textures.get(idx);const t=j.textures[idx],im=j.images[t.source],v=j.bufferViews[im.bufferView];assert(im.mimeType==="image/png"&&v,"texture format");const p=png(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));p.sampler=j.samplers?.[t.sampler]||{};textures.set(idx,p);textureAudit.push({texture:idx,name:im.name,width:p.w,height:p.h,channels:p.ch,pngCrcAndAdlerChecked:true});return p}
 function wrap(i,n,mode){if(mode===33071)return Math.max(0,Math.min(n-1,i));if(mode===33648){const k=((i%(2*n))+2*n)%(2*n);return k<n?k:2*n-1-k}return ((i%n)+n)%n}
 const srgb=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
 function sample(im,u){const x=u[0]*im.w-.5,y=u[1]*im.h-.5,ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy;let out=[0,0,0];for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=wrap(ix+i,im.w,im.sampler.wrapS),yy=wrap(iy+j,im.h,im.sampler.wrapT),o=(yy*im.w+xx)*im.ch,w=(i?dx:1-dx)*(j?dy:1-dy);for(let c=0;c<3;c++)out[c]+=w*srgb(im.pix[o+c]/255)}return out}
 const groups=[],audit=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],kinds={0:2,1:1,8:0,11:2,12:2,18:5};let count=0,errOld=0,errNew=0,coord=0,sampleCount=0;
 for(const mesh of j.meshes)for(const pr of mesh.primitives){
  assert((pr.mode??4)===4&&kinds[pr.material]!==undefined,"primitive");
  const pos=read(pr.attributes.POSITION),idx=read(pr.indices).flat(),c=pr.attributes.COLOR_0!==undefined?read(pr.attributes.COLOR_0):null,uv=pr.attributes.TEXCOORD_0!==undefined?read(pr.attributes.TEXCOORD_0):null,mat=j.materials[pr.material],im=texture(mat),factor=(mat.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]).slice(0,3),tri=[];
  assert(idx.length%3===0&&(!im||uv),"indices/UV");
  for(let i=0;i<idx.length;i+=3){const ids=idx.slice(i,i+3);assert(ids.every(k=>k>=0&&k<pos.length),"index range");const pts=ids.map(k=>pos[k]);for(const p of pts)p.forEach((v,k)=>{assert(Number.isFinite(v)&&Math.abs(v)<100,"vertex");min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v)});
   const old=(c?mean(ids.map(k=>c[k])):[1,1,1]).map((v,k)=>clamp(v*factor[k]));
   const bary=[[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]];
   const rgb=im?mean(bary.map(w=>{const vc=c?[0,1,2].map(k=>ids.reduce((s,id,r)=>s+c[id][k]*w[r],0)):[1,1,1],tc=sample(im,[0,1].map(k=>ids.reduce((s,id,r)=>s+uv[id][k]*w[r],0)));sampleCount++;return factor.map((v,k)=>clamp(v*vc[k]*tc[k]))})):old;
   tri.push({pts,rgb,old,i:i/3})
  }
  const prev=tri.slice().sort((a,b)=>lum(a.old)-lum(b.old)||a.i-b.i);let pe=0,ne=0;
  for(let q=0;q<4;q++){const ts=prev.slice(Math.floor(q*prev.length/4),Math.floor((q+1)*prev.length/4));if(!ts.length)continue;const rgb=mean(ts.map(t=>t.old)).map(v=>Math.round(v*255)/255);for(const t of ts)for(let k=0;k<3;k++)pe+=(t.rgb[k]-rgb[k])**2}
  tri.sort((a,b)=>lum(a.rgb)-lum(b.rgb)||a.i-b.i);
  for(let q=0;q<4;q++){let ts=tri.slice(Math.floor(q*tri.length/4),Math.floor((q+1)*tri.length/4));if(!ts.length)continue;const rgb=mean(ts.map(t=>t.rgb)).map(v=>Math.round(v*255));for(const t of ts)for(let k=0;k<3;k++)ne+=(t.rgb[k]-rgb[k]/255)**2;groups.push({kind:kinds[pr.material],material:pr.material,name:mat.name,q,rgb,ts})}
  audit.push({material:pr.material,name:mat.name,triangles:tri.length,textureSampled:!!im,oldMeanRgb:mean(tri.map(t=>t.old)).map(v=>Math.round(v*255)),newMeanRgb:mean(tri.map(t=>t.rgb)).map(v=>Math.round(v*255)),oldRms:Math.sqrt(pe/(3*tri.length)),newRms:Math.sqrt(ne/(3*tri.length))});count+=tri.length;errOld+=pe;errNew+=ne;
 }
 assert(count===2100&&groups.length===24&&textures.size===2,"budget or texture count");
 const out=new Uint8Array(32+groups.length*16+count*36),v=new DataView(out.buffer);out.set([88,80,90,67]);v.setUint32(4,2,true);v.setUint32(8,groups.length,true);v.setUint32(12,count,true);let o=32;
 for(const g of groups){v.setUint32(o,g.kind,true);v.setUint32(o+4,g.ts.length,true);v.setUint32(o+8,g.ts.length*3,true);v.setUint32(o+12,g.rgb[0]<<16|g.rgb[1]<<8|g.rgb[2],true);o+=16;for(const t of g.ts)for(const p of t.pts)for(const x of p){v.setFloat32(o,x,true);o+=4}}
 assert(o===out.length,"packet length");o=32;
 for(const g of groups){assert(v.getUint32(o,true)===g.kind&&v.getUint32(o+4,true)===g.ts.length&&v.getUint32(o+8,true)===g.ts.length*3&&v.getUint32(o+12,true)===(g.rgb[0]<<16|g.rgb[1]<<8|g.rgb[2]),"header roundtrip");o+=16;for(const t of g.ts)for(const p of t.pts)for(const x of p){assert(v.getFloat32(o,true)===x,"coordinate roundtrip");coord++;o+=4}}
 assert(o===out.length,"readback length");
 return {packet:out,report:{format:"XPZC v2",sourceBlob:"285a8539e2687d47f7ca65a034605b0eeec93ead",sourceBytes:src.length,bytes:out.length,triangles:count,groups:groups.length,sourceJoints:63,packetJoints:0,exactCoordinates:coord,bounds:{min,max},textures:textureAudit,textureSamples:sampleCount,materialAudit:audit,palette:groups.map(({kind,material,name,q,rgb,ts})=>({kind,material,name,q,rgb,triangles:ts.length})),linearColorRmsAgainstTextureSamples:{v22Recomputed:Math.sqrt(errOld/(count*3)),v23:Math.sqrt(errNew/(count*3))},sampling:"Four barycentric points, glTF top-left UV, bilinear interpolation in linear color, material and vertex RGB multiplied; packed linear RGB convention not independently engine-calibrated",limitations:["Static bind pose","Texture colors approximated by 4 flat groups per primitive; no native UV mapping","No normal maps, alpha blending or skinning","Native runtime not executed"],nativeRun:false}};
}
module.exports={build};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const input=process.argv[2],out=process.argv[3]||path.resolve(__dirname,'../output');if(!input)throw Error('Usage: node build.cjs V21.glb [output directory]');const b=fs.readFileSync(input),sha=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');if(sha!=='285a8539e2687d47f7ca65a034605b0eeec93ead')throw Error('Wrong source '+sha);const r=build(b);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'R36HW_F11_ATHLETIC_V23_TEXTURE.xpzc'),r.packet);const reports=path.resolve(out,'../reports');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'build.json'),JSON.stringify(r.report,null,2)+'\n');}
