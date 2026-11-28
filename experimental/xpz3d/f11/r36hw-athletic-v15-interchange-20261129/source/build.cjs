#!/usr/bin/env node
'use strict';
function build(src){
 const ck=(v,m)=>{if(!v)throw Error(m)},dv=new DataView(src.buffer,src.byteOffset,src.byteLength),jl=dv.getUint32(12,true);
 ck(dv.getUint32(0,true)===0x46546c67&&dv.getUint32(4,true)===2&&dv.getUint32(8,true)===src.length&&dv.getUint32(16,true)===0x4e4f534a&&dv.getUint32(24+jl,true)===0x004e4942,"GLB header");
 const j=JSON.parse(String.fromCharCode(...src.slice(20,20+jl))),bin=src.slice(28+jl,28+jl+dv.getUint32(20+jl,true)),oldViews=j.bufferViews;
 ck(j.buffers.length===1&&!j.buffers[0].uri&&!j.extensionsUsed?.length&&!j.extensionsRequired?.length&&j.skins[0].joints.length===63,"V14 container");
 ck(j.accessors.length===42&&oldViews.length===46&&j.images.length===4,"V14 layout");
 const protectedJSON=JSON.stringify([j.nodes,j.scenes,j.meshes,j.skins,j.materials,j.samplers,j.textures,j.accessors.map(a=>({...a,bufferView:undefined}))]);
 const used=new Set(),imageViews=new Set(j.images.map(i=>i.bufferView));
 for(let a of j.accessors){ck(!a.sparse&&!a.extensions&&oldViews[a.bufferView],"accessor");used.add(a.bufferView)}
 ck(oldViews.every(v=>v.buffer===0&&!v.extensions)&&[...imageViews].every(v=>!used.has(v)),"shared image or extension");
 const names=["identity-equipment.png","hair-strands.png","eye-atlas.png","athletic-normal.png"],files={},images=[];
 for(let i=0;i<j.images.length;i++){let im=j.images[i],v=oldViews[im.bufferView],start=v.byteOffset||0;ck(im.mimeType==="image/png"&&start+v.byteLength<=bin.length,"image bounds");let data=bin.slice(start,start+v.byteLength);ck(data.slice(0,8).every((v,k)=>v===[137,80,78,71,13,10,26,10][k]),"PNG signature");let p="textures/"+names[i],dd=new DataView(data.buffer,data.byteOffset,data.byteLength);files[p]=data;images.push({index:i,path:p,name:im.name,bytes:data.length,width:dd.getUint32(16),height:dd.getUint32(20),sourceView:im.bufferView});delete im.bufferView;im.uri=p}
 const retained=[...used].sort((a,b)=>a-b),map=new Map(retained.map((v,i)=>[v,i])),blocks=[],views=[];let length=0;
 for(let id of retained){let v=oldViews[id],start=v.byteOffset||0;ck(start+v.byteLength<=bin.length,"view bounds");length=(length+3)&~3;views.push({...v,byteOffset:length});blocks.push({start,offset:length,size:v.byteLength});length+=v.byteLength}
 let bytes=new Uint8Array((length+3)&~3),checked=0;
 for(let b of blocks){bytes.set(bin.subarray(b.start,b.start+b.size),b.offset);for(let k=0;k<b.size;k++){ck(bytes[b.offset+k]===bin[b.start+k],"copy mismatch");checked++}}
 const originalAccessors=j.accessors.map(a=>a.bufferView);for(let a of j.accessors)a.bufferView=map.get(a.bufferView);
 j.bufferViews=views;j.buffers=[{byteLength:bytes.length,uri:"model.bin"}];files["model.bin"]=bytes;
 ck(JSON.stringify([j.nodes,j.scenes,j.meshes,j.skins,j.materials,j.samplers,j.textures,j.accessors.map(a=>({...a,bufferView:undefined}))])===protectedJSON,"non-layout data changed");
 for(let i=0;i<j.accessors.length;i++){let a=j.accessors[i],ov=oldViews[originalAccessors[i]],nv=views[a.bufferView];ck(ov.byteLength===nv.byteLength&&ov.byteStride===nv.byteStride&&ov.target===nv.target,"view metadata")}
 const groupMap=j.meshes.flatMap((mesh,mi)=>mesh.primitives.map((p,pi)=>({mesh:mi,primitive:pi,materialIndex:p.material,materialName:j.materials[p.material].name,vertices:j.accessors[p.attributes.POSITION].count,triangles:j.accessors[p.indices].count/3,attributes:Object.keys(p.attributes),indexComponentType:j.accessors[p.indices].componentType})));
 const total=groupMap.reduce((s,p)=>s+p.triangles,0);ck(total===2100&&j.materials[18].alphaMode==="OPAQUE","triangle or material");
 let hierarchy=j.skins[0].joints.map((node,index)=>({index,node,name:j.nodes[node].name,children:(j.nodes[node].children||[]).map(n=>j.skins[0].joints.indexOf(n)).filter(n=>n>=0),translation:j.nodes[node].translation||[0,0,0],rotation:j.nodes[node].rotation||[0,0,0,1]}));
 const manifest={schema:"r36hw-interchange-v1",sourceBlob:"b824e5ec3d9564950909037a5f0ba2533593b8d3",format:"glTF 2.0 external resources",nativeS2:false,entry:"model.gltf",binary:"model.bin",triangles:total,skinJoints:hierarchy.length,coordinateSystem:{meshLocal:"Z-up",sceneRoot:"Y-up conversion",rootNode:64,rootQuaternion:j.nodes[64].rotation,keepRootTransform:true},primitives:groupMap,images,skin:{inverseBindMatricesAccessor:j.skins[0].inverseBindMatrices,joints:hierarchy},materialIndex18:j.materials[18],limitations:["Standard glTF interchange only; not an S2-native compiled model.","No native S2 import or animation execution performed.","Original mesh, skin weights and texture bytes preserved; no visual modifications."]};
 j.asset.generator="R36HW V15 external-resource interchange exporter";j.extras={...(j.extras||{}),athleticSuitV15:{source:"V14",externalResourcePackage:true,nativeS2:false}};
 const gltf=JSON.stringify(j,null,2)+"\n",manifestText=JSON.stringify(manifest,null,2)+"\n";
 const report={sourceBlob:manifest.sourceBlob,inputBytes:src.length,geometryBytes:bytes.length,geometryBytesCompared:checked,imageBytes:images.reduce((s,x)=>s+x.bytes,0),images:images.map(({path,width,height,bytes})=>({path,width,height,bytes})),bufferViewsBefore:oldViews.length,bufferViewsAfter:views.length,accessors:j.accessors.length,primitiveCount:groupMap.length,triangles:total,joints:hierarchy.length,geometryBytePreserved:true,skinWeightBytePreserved:true,textureBytePreserved:true,materialPreserved:true,nativeS2Rendered:false,nativeS2Compiled:false};
 return {files,gltf,manifestText,report};
}
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-athletic-v14-shoulder-20261129/output/R36HW_F11_ATHLETIC_SUIT_V14_SHOULDER.glb'),out=process.argv[3]||path.resolve(__dirname,'../output');
const src=fs.readFileSync(input),hash=crypto.createHash('sha1').update('blob '+src.length+'\0').update(src).digest('hex');if(hash!=='b824e5ec3d9564950909037a5f0ba2533593b8d3')throw Error('V14 blob mismatch');const r=build(src);fs.mkdirSync(out,{recursive:true});for(const [name,data] of Object.entries(r.files)){const f=path.join(out,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data)}fs.writeFileSync(path.join(out,'model.gltf'),r.gltf);fs.writeFileSync(path.join(out,'interchange.json'),r.manifestText);const report=path.resolve(out,'../reports/build.json');fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(r.report,null,2)+'\n');console.log(JSON.stringify(r.report,null,2));
