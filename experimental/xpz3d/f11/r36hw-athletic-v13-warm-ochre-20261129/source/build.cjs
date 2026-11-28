#!/usr/bin/env node
'use strict';
function build(src){
 const ck=(v,m)=>{if(!v)throw Error(m)},h=new DataView(src.buffer,src.byteOffset,src.byteLength),l=h.getUint32(12,true);ck(h.getUint32(0,true)===0x46546c67&&h.getUint32(4,true)===2&&h.getUint32(8,true)===src.length&&h.getUint32(16,true)===0x4e4f534a&&h.getUint32(24+l,true)===0x004e4942,"GLB");
 const j=JSON.parse(String.fromCharCode(...src.slice(20,20+l))),bin=src.slice(28+l,28+l+h.getUint32(20+l,true)),original=bin.slice(),d=new DataView(bin.buffer,bin.byteOffset,bin.length),mesh=j.meshes[0],g=mesh.primitives.find(p=>p.material===18),skin=j.materials[8],mat=j.materials[18];
 ck(g.attributes.POSITION===34&&g.attributes.COLOR_0===38&&j.skins[0].joints.length===63&&mat.alphaMode==="OPAQUE","V12 required");
 const protectedJSON=JSON.stringify([j.nodes,j.skins,j.meshes,j.accessors,j.bufferViews,j.images,j.textures,j.samplers,j.materials.filter((_,i)=>i!==18)]);
 const dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},sz={5121:1,5123:2,5125:4,5126:4},get={5121:"getUint8",5123:"getUint16",5125:"getUint32",5126:"getFloat32"};
 function layout(id){const a=j.accessors[id],b=j.bufferViews[a.bufferView],n=dim[a.type],s=sz[a.componentType],o=(a.byteOffset||0)+(b.byteOffset||0),st=b.byteStride||n*s;ck(!a.sparse&&b.buffer===0&&o+(a.count-1)*st+n*s<=bin.length,"accessor");return {a,n,s,o,st}}
 function read(id){const {a,n,s,o,st}=layout(id);return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>d[get[a.componentType]](o+i*st+k*s,true)))}
 const P=read(g.attributes.POSITION),C=read(g.attributes.COLOR_0),old=JSON.parse(JSON.stringify(mat)),key=p=>p.map(x=>Math.round(x*1e6)).join(",");
 ck(P.length===706&&C.length===706,"vertex count");
 const colors={main:[239,231,218,255],transition:[224,207,185,255],sidePanel:[189,165,139,255],binding:[155,133,110,255]};
 const grouped=new Map();
 for(let i=0;i<P.length;i++){let k=key(P[i]);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(i)}
 const paletteCount={main:0,transition:0,sidePanel:0,binding:0},out=C.map(c=>c.slice()),clamp=x=>Math.max(0,Math.min(1,x)),mix=(a,b,t)=>a.map((v,i)=>Math.round(v*(1-t)+b[i]*t)),smooth=x=>{let t=clamp(x);return t*t*(3-2*t)};
 for(let list of grouped.values()){
  let i=list[0],[x,y,z]=P[i],ax=Math.abs(x),v=Math.min(...list.map(k=>C[k][0]));
  let type=v<=205?"sidePanel":v<=225?"transition":"main",c=colors[type].slice();
  // Visible garment edges remain material cues, with no additional geometry or thickness.
  let cuff=z>1.30?smooth((ax-.695)/.058):0,collar=ax<.09?smooth((z-1.500)/.051):0,ankle=z<.20?smooth((.155-z)/.065)*.60:0;
  let t=Math.max(cuff,collar,ankle);if(t>.015){c=mix(c,colors.binding,t);if(t>.5)type="binding"}
  for(let k of list){out[k]=c.slice();paletteCount[type]++}
 }
 let q=layout(g.attributes.COLOR_0);ck(q.a.componentType===5121&&q.a.normalized&&q.n===4&&q.st===4,"color format");let changed=0;for(let i=0;i<out.length;i++){if(out[i].some((v,k)=>v!==C[i][k]))changed++;for(let k=0;k<4;k++)d.setUint8(q.o+i*q.st+k,out[i][k])}
 mat.name="R36HW_V13_OPAQUE_WARM_OCHRE_ATHLETIC_WEAR";mat.pbrMetallicRoughness.baseColorFactor=[.63,.45,.255,1];mat.pbrMetallicRoughness.roughnessFactor=.93;mat.pbrMetallicRoughness.metallicFactor=0;mat.normalTexture.scale=.22;
 let changedBytes=0;for(let i=0;i<bin.length;i++)if(bin[i]!==original[i]){ck(i>=q.o&&i<q.o+q.a.count*q.st,"non-color byte changed");changedBytes++}
 ck(JSON.stringify([j.nodes,j.skins,j.meshes,j.accessors,j.bufferViews,j.images,j.textures,j.samplers,j.materials.filter((_,i)=>i!==18)])===protectedJSON,"protected JSON");
 const tri=mesh.primitives.reduce((s,p)=>s+j.accessors[p.indices].count/3,0);ck(tri===2100&&mat.alphaMode==="OPAQUE"&&out.every(c=>c[3]===255),"budget/opacity");
 j.asset.generator="R36HW V13 warm ochre opaque athletic material";j.extras={...(j.extras||{}),athleticSuitV13:{source:"V12",opaqueTextile:true,visibleTonalBindings:true,materialAndVertexColorOnly:true}};
 let js=[];for(let c of JSON.stringify(j)){let n=c.codePointAt(0);if(n<128)js.push(n);else if(n<2048)js.push(192|(n>>6),128|(n&63));else if(n<65536)js.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else js.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63))}while(js.length%4)js.push(32);let output=new Uint8Array(28+js.length+bin.length),dv=new DataView(output.buffer);dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,output.length,true);dv.setUint32(12,js.length,true);dv.setUint32(16,0x4e4f534a,true);output.set(js,20);dv.setUint32(20+js.length,bin.length,true);dv.setUint32(24+js.length,0x004e4942,true);output.set(bin,28+js.length);
 return {output,report:{sourceBlob:"0f85e995f9541a59545df14822b2c33eb650bcae",inputBytes:src.length,outputBytes:output.length,triangles:tri,joints:63,garmentVertices:P.length,changedColorVertices:changed,changedBinaryBytes:changedBytes,uniqueWeldedPoints:grouped.size,paletteCount,palette:colors,skinReferenceBaseColor:skin.pbrMetallicRoughness.baseColorFactor,garmentBaseColorBefore:old.pbrMetallicRoughness.baseColorFactor,garmentBaseColorAfter:mat.pbrMetallicRoughness.baseColorFactor,roughnessBefore:old.pbrMetallicRoughness.roughnessFactor,roughnessAfter:mat.pbrMetallicRoughness.roughnessFactor,normalScaleBefore:old.normalTexture.scale,normalScaleAfter:mat.normalTexture.scale,geometryPreserved:true,skinWeightsPreserved:true,nonColorBinaryPreserved:true,normalImagePreserved:true,opaqueMaterial:true,nativeS2Rendered:false,visualAcceptance:false,limitations:["Warm ochre palette is an artistic choice based on existing material values, not a calibrated color match to the GIF.","Existing normal image is retained with reduced strength; no new high-resolution texture was generated.","S2 material import, lighting and appearance remain unverified."]}}
}
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-athletic-v12-rig-20261129/output/R36HW_F11_ATHLETIC_SUIT_V12_RIG.glb'),output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_F11_ATHLETIC_SUIT_V13_WARM_OCHRE.glb');
const src=fs.readFileSync(input),hash=crypto.createHash('sha1').update('blob '+src.length+'\0').update(src).digest('hex');if(hash!=='0f85e995f9541a59545df14822b2c33eb650bcae')throw Error('V12 blob mismatch');const r=build(src);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,r.output);const report=path.resolve(path.dirname(output),'../reports/build.json');fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(r.report,null,2)+'\n');console.log(JSON.stringify(r.report,null,2));
