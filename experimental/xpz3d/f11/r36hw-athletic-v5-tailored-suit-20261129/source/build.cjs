#!/usr/bin/env node
'use strict';
function build(src){
 const ck=(x,m)=>{if(!x)throw Error(m)},d=new DataView(src.buffer,src.byteOffset,src.byteLength),jl=d.getUint32(12,true);
 ck(d.getUint32(0,true)===0x46546c67&&d.getUint32(4,true)===2&&d.getUint32(8,true)===src.length&&d.getUint32(16,true)===0x4e4f534a&&d.getUint32(24+jl,true)===0x004e4942,"invalid GLB");
 const j=JSON.parse(String.fromCharCode(...src.slice(20,20+jl))),old=src.slice(28+jl,28+jl+d.getUint32(20+jl,true)),m=j.meshes[0],g=m.primitives.find(p=>p.material===18),rig=JSON.stringify([j.nodes,j.skins,j.animations]),protectedPrims=JSON.stringify(m.primitives.filter(p=>p!==g)),material=JSON.stringify(j.materials[18]);
 ck(g&&g.attributes.POSITION===132&&g.indices===138&&j.skins[0].joints.length===63,"V4 required");
 const dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},sizes={5121:1,5123:2,5126:4},get={5121:"getUint8",5123:"getUint16",5126:"getFloat32"},set={5121:"setUint8",5123:"setUint16",5126:"setFloat32"};
 function read(id){const a=j.accessors[id],b=j.bufferViews[a.bufferView],n=dims[a.type],s=sizes[a.componentType],v=new DataView(old.buffer,old.byteOffset,old.byteLength),start=(b.byteOffset||0)+(a.byteOffset||0),stride=b.byteStride||n*s;ck(!a.sparse&&b.buffer===0&&start+(a.count-1)*stride+n*s<=old.length,"accessor bounds");return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>v[get[a.componentType]](start+i*stride+k*s,true)))}
 const attrs=Object.fromEntries(Object.entries(g.attributes).map(([k,id])=>[k,read(id)])),P=attrs.POSITION,N=attrs.NORMAL,J=attrs.JOINTS_0,W=attrs.WEIGHTS_0,C=attrs.COLOR_0,U=attrs.TEXCOORD_0,ix=read(g.indices).flat(),faces=Array.from({length:ix.length/3},(_,i)=>ix.slice(i*3,i*3+3)),orig=P.map(p=>p.slice()),initial=faces.length;
 ck(P.length===498&&initial===992,"unexpected garment size");
 const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a)),avg=(a,b)=>mul(add(a,b),.5),clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{let t=clamp(x);return t*t*(3-2*t)},triN=(p,f)=>cross(sub(p[f[1]],p[f[0]]),sub(p[f[2]],p[f[0]]));
 const lower=Array.from({length:16},(_,i)=>32+i),upper=Array.from({length:16},(_,i)=>48+i);
 ck(lower.every(i=>Math.abs(P[i][2]-1.215)<1e-5)&&upper.every(i=>Math.abs(P[i][2]-1.315)<1e-5),"unexpected torso rings");
 const strip=faces.filter(f=>f.every(i=>i>=32&&i<64)&&f.some(i=>i<48)&&f.some(i=>i>=48));
 ck(strip.length===32,"unexpected torso strip");
 const cyc=(f,a,b,c)=>f.some((x,i)=>x===a&&f[(i+1)%3]===b&&f[(i+2)%3]===c);
 const forward=strip.some(f=>cyc(f,32,33,49)),reverse=strip.some(f=>cyc(f,32,49,33));ck(forward!==reverse,"unexpected strip orientation");
 function shape([x,y,z],gain){
  // Broad, continuous tailoring of opaque athletic textile; no exposed anatomy.
  const front=smooth((-y-.012)/.075),lateral=1-smooth((Math.abs(x)-.105)/.085);
  const height=Math.exp(-Math.pow((z-1.325)/.082,2));
  const waist=Math.exp(-Math.pow((z-1.175)/.075,2));
  const side=1-smooth((Math.abs(x)-.13)/.10);
  const fade=smooth((z-1.08)/.10)*(1-smooth((z-1.40)/.085));
  return [x*(1-gain*.025*waist*fade),y-gain*.031*front*lateral*height*fade+gain*.003*front*waist*side*fade,z];
 }
 let gain=1,changed=0,minCos=1;
 for(let attempt=0;attempt<8;attempt++){
  for(let i=0;i<orig.length;i++){const p=orig[i];P[i]=(i<90&&p[2]>1.10&&p[2]<1.46)?shape(p,gain):p.slice()}
  minCos=1;for(const f of faces){const a=triN(orig,f),b=triN(P,f);minCos=Math.min(minCos,dot(a,b)/(norm(a)*norm(b)))}
  if(minCos>.60)break;gain*=.7;
 }
 ck(minCos>.60,"shape normal inversion guard");
 changed=P.filter((p,i)=>norm(sub(p,orig[i]))>1e-7).length;
 const mids=[];
 for(let i=0;i<16;i++){
  const a=lower[i],b=upper[i],p=avg(orig[a],orig[b]);p[0]*=1.012;p[1]+=(p[1]-.001)*.018;
  mids.push(P.length);P.push(shape(p,gain));N.push([0,0,1]);
  const w=new Map();for(const k of [a,b])for(let t=0;t<4;t++)w.set(J[k][t],(w.get(J[k][t])||0)+W[k][t]*.5);
  let entries=[...w].filter(x=>x[1]>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=entries.reduce((s,e)=>s+e[1],0);while(entries.length<4)entries.push([0,0]);J.push(entries.map(e=>e[0]));W.push(entries.map(e=>e[1]/sum));C.push(avg(C[a],C[b]).map(Math.round));let uv=avg(U[a],U[b]);if(Math.abs(U[a][0]-U[b][0])>.5)uv[0]=(uv[0]+.5)%1;U.push(uv);
 }
 const removed=new Set(strip),F=faces.filter(f=>!removed.has(f));
 function face(a,b,c){F.push(forward?[a,b,c]:[a,c,b])}
 function bridge(a,b){for(let i=0;i<16;i++){let k=(i+1)%16;face(a[i],a[k],b[k]);face(a[i],b[k],b[i])}}
 bridge(lower,mids);bridge(mids,upper);
 let accum=P.map(()=>[0,0,0]),edges=new Map(),minArea=Infinity,volume=0;
 for(const f of F){let n=triN(P,f);minArea=Math.min(minArea,norm(n)/2);ck(norm(n)>1e-9,"degenerate face");for(const i of f)accum[i]=add(accum[i],n);volume+=dot(P[f[0]],cross(P[f[1]],P[f[2]]))/6;for(let q=0;q<3;q++){let a=f[q],b=f[(q+1)%3],key=Math.min(a,b)+":"+Math.max(a,b),e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e)}}
 ck([...edges.values()].every(e=>e[0]===2&&e[1]===0)&&volume>0,"manifold/orientation");
 for(let i=0;i<N.length;i++)N[i]=unit(accum[i]);
 ck(P.length===514&&F.length===1024&&W.every(w=>Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-6)&&J.every(js=>js.every(x=>x>=0&&x<63)),"counts or skin");
 let chunks=[],off=old.length;
 function append(arr,template){const a={...template};delete a.min;delete a.max;delete a.sparse;let n=dims[a.type],s=sizes[a.componentType],pad=(4-off%4)%4;if(pad){chunks.push(new Uint8Array(pad));off+=pad}let bytes=new Uint8Array(arr.length*n*s),v=new DataView(bytes.buffer);arr.forEach((row,i)=>row.forEach((x,k)=>{ck(Number.isFinite(x),"nonfinite");v[set[a.componentType]]((i*n+k)*s,x,true)}));a.bufferView=j.bufferViews.length;a.byteOffset=0;a.count=arr.length;if(a.type==="SCALAR"||template.min){a.min=Array.from({length:n},(_,k)=>Math.min(...arr.map(r=>r[k])));a.max=Array.from({length:n},(_,k)=>Math.max(...arr.map(r=>r[k])))}j.bufferViews.push({buffer:0,byteOffset:off,byteLength:bytes.length,target:a.type==="SCALAR"?34963:34962});chunks.push(bytes);off+=bytes.length;let id=j.accessors.length;j.accessors.push(a);return id}
 for(let k of Object.keys(attrs))g.attributes[k]=append(attrs[k],j.accessors[g.attributes[k]]);
 g.indices=append(F.flat().map(i=>[i]),j.accessors[g.indices]);
 const total=m.primitives.reduce((s,p)=>s+j.accessors[p.indices].count/3,0);ck(total===2096&&total<=2100,"triangle budget");
 ck(JSON.stringify([j.nodes,j.skins,j.animations])===rig&&JSON.stringify(m.primitives.filter(p=>p!==g))===protectedPrims&&JSON.stringify(j.materials[18])===material,"protected content changed");
 m.name="R36HW_F11_V5_TAILORED_ATHLETIC_OUTFIT";j.asset.generator="R36HW V5 torso refinement";j.extras={...(j.extras||{}),athleticSuitV5:{source:"V4",opaqueTextile:true,triangleBudget:2100,newTorsoRing:16}};
 let pad=(4-off%4)%4;if(pad){chunks.push(new Uint8Array(pad));off+=pad}let bin=new Uint8Array(off);bin.set(old);let at=old.length;for(let c of chunks){bin.set(c,at);at+=c.length}j.buffers[0].byteLength=bin.length;
 for(const b of j.bufferViews)ck((b.byteOffset||0)+b.byteLength<=bin.length,"output bufferView range");
 let js=[];for(const c of JSON.stringify(j)){let n=c.codePointAt(0);if(n<128)js.push(n);else if(n<2048)js.push(192|(n>>6),128|(n&63));else if(n<65536)js.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else js.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63))}while(js.length%4)js.push(32);
 const out=new Uint8Array(28+js.length+bin.length),v=new DataView(out.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,out.length,true);v.setUint32(12,js.length,true);v.setUint32(16,0x4e4f534a,true);out.set(js,20);v.setUint32(20+js.length,bin.length,true);v.setUint32(24+js.length,0x004e4942,true);out.set(bin,28+js.length);
 return {out,report:{sourceBlob:"898f57fe6b422e34f494230af77d532a56674e2b",inputTriangles:2064,outputTriangles:total,triangleBudget:2100,addedTriangles:32,addedVertices:16,garmentVertices:P.length,garmentTriangles:F.length,changedOriginalVertices:changed,shapeGain:gain,minOriginalFaceNormalCos:minCos,minTriangleArea:minArea,signedVolume:volume,manifoldOrOrientationErrors:0,skinJoints:63,existingSkinWeightsPreserved:true,addedSkinWeightsNormalized:true,protectedPrimitivesPreserved:true,materialPreserved:true,originalBinaryPreserved:true,outputBytes:out.length,nativeS2Rendered:false,visualAcceptance:false,limitations:["Artistic tailoring estimates, not verified against native S2 or sprite.","No posed clipping or self-intersection test.","Old garment accessors and buffers retained."]}};
}
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-athletic-v4-continuous-suit-20261129/output/R36HW_F11_ATHLETIC_SUIT_V4.glb'),output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_F11_ATHLETIC_SUIT_V5.glb');
const src=fs.readFileSync(input),hash=crypto.createHash('sha1').update('blob '+src.length+'\0').update(src).digest('hex');if(hash!=='898f57fe6b422e34f494230af77d532a56674e2b')throw Error('V4 blob mismatch');const r=build(src);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,r.out);const report=path.resolve(path.dirname(output),'../reports/build.json');fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(r.report,null,2)+'\n');console.log(JSON.stringify(r.report,null,2));
