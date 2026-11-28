// XPZC v2 static vertex-color packet, no dependencies.
function build(src){
 const assert=(c,s)=>{if(!c)throw Error(s)},clamp=x=>Math.max(0,Math.min(1,x)),mean=a=>[0,1,2].map(k=>a.reduce((s,v)=>s+v[k],0)/a.length);
 const d=new DataView(src.buffer,src.byteOffset,src.byteLength),jl=d.getUint32(12,true),base=28+jl;
 assert(d.getUint32(0,true)===0x46546c67&&d.getUint32(4,true)===2&&d.getUint32(8,true)===src.length&&d.getUint32(16,true)===0x4e4f534a&&d.getUint32(24+jl,true)===0x004e4942&&base+d.getUint32(20+jl,true)===src.length,"GLB header");
 const j=JSON.parse(String.fromCharCode(...src.subarray(20,20+jl)));
 assert(j.skins[0].joints.length===63&&j.materials[18].alphaMode==="OPAQUE","source constraints");
 function read(id){const a=j.accessors[id],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],sz={5121:1,5123:2,5125:4,5126:4}[a.componentType],st=v.byteStride||sz*n,o=base+(v.byteOffset||0)+(a.byteOffset||0);assert(n&&sz&&!a.sparse&&v.buffer===0&&o+(a.count-1)*st+n*sz<=src.length,"accessor range");return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>{let p=o+i*st+k*sz,x=a.componentType===5126?d.getFloat32(p,true):a.componentType===5125?d.getUint32(p,true):sz===2?d.getUint16(p,true):d.getUint8(p);return a.normalized&&a.componentType!==5126?x/(sz===1?255:sz===2?65535:4294967295):x}))}
 const groups=[],audit=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],kinds={0:2,1:1,8:0,11:2,12:2,18:5};let count=0,e0=0,e1=0,coord=0;
 for(const mesh of j.meshes)for(const pr of mesh.primitives){
  assert((pr.mode??4)===4&&kinds[pr.material]!==undefined,"primitive");
  const pos=read(pr.attributes.POSITION),idx=read(pr.indices).flat(),c=pr.attributes.COLOR_0!==undefined?read(pr.attributes.COLOR_0):null,mat=j.materials[pr.material],factor=(mat.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]).slice(0,3),tri=[];
  assert(idx.length%3===0,"indices");
  for(let i=0;i<idx.length;i+=3){const ids=idx.slice(i,i+3);assert(ids.every(k=>k>=0&&k<pos.length),"index range");const pts=ids.map(k=>pos[k]);for(const p of pts)p.forEach((v,k)=>{assert(Number.isFinite(v)&&Math.abs(v)<100,"vertex");min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v)});const rgb=(c?mean(ids.map(k=>c[k])):[1,1,1]).map((v,k)=>clamp(v*factor[k]));tri.push({pts,rgb,l:.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],i:i/3})}
  const ref=mean(tri.map(t=>t.rgb));tri.sort((a,b)=>a.l-b.l||a.i-b.i);let n=0;
  for(let q=0;q<4;q++){let ts=tri.slice(Math.floor(q*tri.length/4),Math.floor((q+1)*tri.length/4));if(!ts.length)continue;const rgb=mean(ts.map(t=>t.rgb)).map(v=>Math.round(v*255));for(const t of ts)for(let k=0;k<3;k++){e0+=(t.rgb[k]-ref[k])**2;e1+=(t.rgb[k]-rgb[k]/255)**2}groups.push({kind:kinds[pr.material],material:pr.material,name:mat.name,q,rgb,ts});n++}
  audit.push({material:pr.material,name:mat.name,triangles:tri.length,groups:n,vertexColors:!!c,baseColorTextureOmitted:mat.pbrMetallicRoughness?.baseColorTexture!==undefined});count+=tri.length
 }
 assert(count===2100&&groups.length<=48,"budget");
 const out=new Uint8Array(32+groups.length*16+count*36),v=new DataView(out.buffer);out.set([88,80,90,67]);v.setUint32(4,2,true);v.setUint32(8,groups.length,true);v.setUint32(12,count,true);let o=32;
 for(const g of groups){v.setUint32(o,g.kind,true);v.setUint32(o+4,g.ts.length,true);v.setUint32(o+8,g.ts.length*3,true);v.setUint32(o+12,g.rgb[0]<<16|g.rgb[1]<<8|g.rgb[2],true);o+=16;for(const t of g.ts)for(const p of t.pts)for(const x of p){v.setFloat32(o,x,true);o+=4}}
 assert(o===out.length,"packet length");o=32;
 for(const g of groups){assert(v.getUint32(o,true)===g.kind&&v.getUint32(o+4,true)===g.ts.length&&v.getUint32(o+8,true)===g.ts.length*3&&v.getUint32(o+12,true)===(g.rgb[0]<<16|g.rgb[1]<<8|g.rgb[2]),"header roundtrip");o+=16;for(const t of g.ts)for(const p of t.pts)for(const x of p){assert(v.getFloat32(o,true)===x,"coordinate roundtrip");coord++;o+=4}}
 assert(o===out.length,"readback length");
 return {packet:out,report:{format:"XPZC v2",sourceBlob:"285a8539e2687d47f7ca65a034605b0eeec93ead",sourceBytes:src.length,bytes:out.length,triangles:count,groups:groups.length,sourceJoints:63,packetJoints:0,exactCoordinates:coord,bounds:{min,max},materialAudit:audit,palette:groups.map(({kind,material,name,q,rgb,ts})=>({kind,material,name,q,rgb,triangles:ts.length})),oneColorRms:Math.sqrt(e0/(count*3)),fourStrataRms:Math.sqrt(e1/(count*3)),formatReference:"31ce14586b53a7fb1c9893de70b412f34298b1f1",priorRuntimeEvidence:"8ccffa792576cc921841e00af7aef648dbf28209",limitations:["Static bind pose","Vertex RGB and material factors only; embedded image textures not sampled","No UV, normal map, alpha blending or skeleton","Native runtime not executed"],nativeRun:false}};
}
module.exports={build};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const input=process.argv[2],out=process.argv[3]||path.resolve(__dirname,'../output');if(!input)throw Error('Usage: node build.cjs V21.glb [output directory]');const b=fs.readFileSync(input),sha=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');if(sha!=='285a8539e2687d47f7ca65a034605b0eeec93ead')throw Error('Wrong source '+sha);const r=build(b);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'R36HW_F11_ATHLETIC_V22_STATIC.xpzc'),r.packet);const reports=path.resolve(out,'../reports');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'build.json'),JSON.stringify(r.report,null,2)+'\n');}
