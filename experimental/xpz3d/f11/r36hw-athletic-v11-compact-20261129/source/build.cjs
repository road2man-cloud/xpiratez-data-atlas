#!/usr/bin/env node
'use strict';
function build(src){
 const ck=(v,m)=>{if(!v)throw Error(m)},h=new DataView(src.buffer,src.byteOffset,src.length),l=h.getUint32(12,true);
 ck(h.getUint32(0,true)===0x46546c67&&h.getUint32(4,true)===2&&h.getUint32(8,true)===src.length&&h.getUint32(16,true)===0x4e4f534a&&h.getUint32(24+l,true)===0x004e4942,"GLB format");
 const j=JSON.parse(String.fromCharCode(...src.slice(20,20+l))),bin=src.slice(28+l,28+l+h.getUint32(20+l,true)),oldA=j.accessors,oldV=j.bufferViews;
 ck(j.buffers.length===1&&!j.buffers[0].uri&&!j.extensionsUsed?.length&&!j.extensionsRequired?.length,"unsupported container");
 ck(oldA.every(a=>!a.sparse&&!a.extensions&&Number.isInteger(a.bufferView))&&oldV.every(v=>v.buffer===0&&!v.extensions),"unsupported accessor/view");
 ck(oldA.length===162&&oldV.length===166&&j.skins[0].joints.length===63,"V10 expected");
 const protectedJson=JSON.stringify([j.nodes,j.scenes,j.materials,j.textures,j.samplers,j.skins.map(s=>({...s,inverseBindMatrices:undefined}))]);
 const slots=[],imageSlots=[];
 function slot(obj,key){if(obj[key]===undefined)return;ck(Number.isInteger(obj[key])&&oldA[obj[key]],"missing accessor "+key);slots.push({obj,key,id:obj[key]})}
 for(let mesh of j.meshes)for(let p of mesh.primitives){ck(!p.extensions,"primitive extension");slot(p,"indices");for(let k of Object.keys(p.attributes))slot(p.attributes,k);for(let t of p.targets||[])for(let k of Object.keys(t))slot(t,k)}
 for(let skin of j.skins)slot(skin,"inverseBindMatrices");
 for(let a of j.animations||[])for(let s of a.samplers){slot(s,"input");slot(s,"output")}
 for(let im of j.images||[]){if(im.bufferView!==undefined){ck(oldV[im.bufferView],"image buffer");imageSlots.push({obj:im,id:im.bufferView})}}
 const aIds=[...new Set(slots.map(s=>s.id))].sort((a,b)=>a-b),vIds=[...new Set([...aIds.map(i=>oldA[i].bufferView),...imageSlots.map(s=>s.id)])].sort((a,b)=>a-b);
 const aMap=new Map(aIds.map((a,i)=>[a,i])),vMap=new Map(vIds.map((v,i)=>[v,i]));
 const typeDims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
 for(let i of aIds){let a=oldA[i],v=oldV[a.bufferView],n=typeDims[a.type]*sizes[a.componentType],start=a.byteOffset||0;ck(n&&a.count>0&&start+(a.count-1)*(v.byteStride||n)+n<=v.byteLength,"accessor range "+i)}
 const newA=aIds.map(i=>({...oldA[i],bufferView:vMap.get(oldA[i].bufferView)})),newV=[],blocks=[];let offset=0,retained=0;
 for(let i of vIds){let v=oldV[i],start=v.byteOffset||0;ck(start>=0&&v.byteLength>0&&start+v.byteLength<=bin.length,"view range "+i);offset=(offset+3)&~3;newV.push({...v,byteOffset:offset});blocks.push({oldStart:start,newStart:offset,n:v.byteLength});offset+=v.byteLength;retained+=v.byteLength}
 const newBin=new Uint8Array((offset+3)&~3);for(let b of blocks)newBin.set(bin.subarray(b.oldStart,b.oldStart+b.n),b.newStart);
 let equalBytes=0;for(let b of blocks)for(let k=0;k<b.n;k++){ck(newBin[b.newStart+k]===bin[b.oldStart+k],"byte mismatch");equalBytes++}
 for(let s of slots)s.obj[s.key]=aMap.get(s.id);for(let s of imageSlots)s.obj.bufferView=vMap.get(s.id);
 j.accessors=newA;j.bufferViews=newV;j.buffers[0].byteLength=newBin.length;
 for(let s of slots){let a=oldA[s.id],b=newA[s.obj[s.key]];ck(JSON.stringify({...a,bufferView:b.bufferView})===JSON.stringify(b),"accessor metadata changed")}
 ck(JSON.stringify([j.nodes,j.scenes,j.materials,j.textures,j.samplers,j.skins.map(s=>({...s,inverseBindMatrices:undefined}))])===protectedJson,"protected data changed");
 const tri=j.meshes.reduce((n,m)=>n+m.primitives.reduce((s,p)=>s+j.accessors[p.indices].count/3,0),0);ck(tri===2100&&j.materials[18].alphaMode==="OPAQUE","triangle/material");
 j.asset.generator="R36HW V11 lossless live-buffer repack";j.extras={...(j.extras||{}),athleticSuitV11:{source:"V10",operation:"lossless bufferView/accessor reachability repack",geometryUnchanged:true}};
 // UTF-8 encoding (also works in a dependency-free JS runtime).
 let js=[];for(let c of JSON.stringify(j)){let n=c.codePointAt(0);if(n<128)js.push(n);else if(n<2048)js.push(192|(n>>6),128|(n&63));else if(n<65536)js.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else js.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63))}while(js.length%4)js.push(32);
 let out=new Uint8Array(28+js.length+newBin.length),v=new DataView(out.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,out.length,true);v.setUint32(12,js.length,true);v.setUint32(16,0x4e4f534a,true);out.set(js,20);v.setUint32(20+js.length,newBin.length,true);v.setUint32(24+js.length,0x004e4942,true);out.set(newBin,28+js.length);
 return {out,report:{sourceBlob:"d23f79e3c725758c3e4c25a911fae9c15ef0a5ea",inputBytes:src.length,outputBytes:out.length,savedBytes:src.length-out.length,reductionPercent:100*(src.length-out.length)/src.length,oldBufferBytes:bin.length,newBufferBytes:newBin.length,accessorsBefore:oldA.length,accessorsAfter:newA.length,bufferViewsBefore:oldV.length,bufferViewsAfter:newV.length,retainedViewBytes:retained,byteComparisonCount:equalBytes,byteExactLiveViews:true,accessorMetadataPreserved:true,triangles:tri,joints:63,images:j.images.length,geometryPreserved:true,skinWeightsPreserved:true,materialPreserved:true,normalTexturePreserved:true,nativeS2Rendered:false,visualAcceptance:false,limitations:["Unused whole bufferViews removed; unused subranges inside retained views are not pruned.","No changes to skin weighting or posed deformation.","Native S2 import/render not verified."]}}
}
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-athletic-v10-contours-20261129/output/R36HW_F11_ATHLETIC_SUIT_V10_CONTOURS.glb'),output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_F11_ATHLETIC_SUIT_V11_COMPACT.glb');
const src=fs.readFileSync(input),hash=crypto.createHash('sha1').update('blob '+src.length+'\0').update(src).digest('hex');if(hash!=='d23f79e3c725758c3e4c25a911fae9c15ef0a5ea')throw Error('V10 blob mismatch');const r=build(src);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,r.out);const report=path.resolve(path.dirname(output),'../reports/build.json');fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(r.report,null,2)+'\n');console.log(JSON.stringify(r.report,null,2));
