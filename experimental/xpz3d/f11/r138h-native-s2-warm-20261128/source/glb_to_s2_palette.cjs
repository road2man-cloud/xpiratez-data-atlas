'use strict';
// R138G — real GLB bind-pose mesh -> actual native S2 CMemObject palette groups.
// Decode original embedded GLB PNG baseColor images, sample each triangle's UV,
// distribute it to FOUR per-material color strata, preserve ALL 2100 faces.
// Node built-ins only. No imitation renderer, no local Python.
const fs=require('fs'),zlib=require('zlib'),path=require('path'),crypto=require('crypto');
const [input,output,report]=process.argv.slice(2);
if(!input||!output||!report)throw Error('usage node glb_to_s2_palette.cjs input.glb output.xpzc report.json');
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const glb=fs.readFileSync(input);
assert(glb.toString('ascii',0,4)==='glTF'&&glb.readUInt32LE(8)===glb.length,'bad GLB');
const jsonLength=glb.readUInt32LE(12),g=JSON.parse(glb.toString('utf8',20,20+jsonLength));
const binPos=20+jsonLength;
assert(glb.toString('ascii',binPos+4,binPos+8)==='BIN\0','no embedded bin');
const bin=glb.subarray(binPos+8,binPos+8+glb.readUInt32LE(binPos));
const types={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const readers={5120:'readInt8',5121:'readUInt8',5122:'readUInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function accessor(i) {
 const a=g.accessors[i],v=g.bufferViews[a.bufferView],sz=sizes[a.componentType],n=types[a.type],reader=readers[a.componentType];
 assert(a&&!a.sparse&&sz&&n&&reader,'bad accessor '+i);
 const offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||sz*n;
 assert(offset+(a.count-1)*stride+sz*n<=bin.length,'accessor out of bounds '+i);
 const norm=a.normalized && a.componentType!==5126;
 const div=a.componentType===5121?255:a.componentType===5123?65535:1;
 return Array.from({length:a.count},(_,j)=>Array.from({length:n},(_,k)=>{
   const value=bin[reader](offset+j*stride+k*sz);
   return norm?value/div:value;
 }));
}
function decodePNG(bytes) {
 assert(bytes.toString('hex',0,8)==='89504e470d0a1a0a','missing PNG signature');
 let ptr=8,w=0,h=0,depth=0,type=0,interlace=0,ids=[];
 while(ptr+12<=bytes.length){
  const len=bytes.readUInt32BE(ptr),tag=bytes.toString('ascii',ptr+4,ptr+8),chunk=bytes.subarray(ptr+8,ptr+8+len);
  ptr+=12+len;
  if(tag==='IHDR'){w=chunk.readUInt32BE(0);h=chunk.readUInt32BE(4);depth=chunk[8];type=chunk[9];interlace=chunk[12];}
  if(tag==='IDAT')ids.push(chunk);
  if(tag==='IEND')break;
 }
 assert(w>0&&h>0&&w<=4096&&h<=4096&&depth===8&&(type===2||type===6)&&interlace===0,'unsupported PNG type '+type);
 const channels=type===6?4:3,row=w*channels;
 const raw=zlib.inflateSync(Buffer.concat(ids));
 assert(raw.length===h*(row+1),'incorrect PNG decoded length');
 const pix=Buffer.alloc(w*h*4);let offset=0;
 const prior=Buffer.alloc(row),current=Buffer.alloc(row);
 for(let y=0;y<h;y++){
  const filter=raw[offset++];
  for(let i=0;i<row;i++){
   const a=i>=channels?current[i-channels]:0,b=prior[i],c=i>=channels?prior[i-channels]:0,v=raw[offset++];
   let x=v;
   if(filter===1)x+=a;
   else if(filter===2)x+=b;
   else if(filter===3)x+=Math.floor((a+b)/2);
   else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);x+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}
   else assert(filter===0,'unexpected PNG filter '+filter);
   current[i]=x&255;
  }
  for(let x=0;x<w;x++){
   const i=(y*w+x)*4,k=x*channels;
   pix[i]=current[k];pix[i+1]=current[k+1];pix[i+2]=current[k+2];pix[i+3]=channels===4?current[k+3]:255;
  }
  current.copy(prior);
 }
 return {w,h,pix};
}
const imageCache=new Map();
function imageFor(material) {
 const index=material?.pbrMetallicRoughness?.baseColorTexture?.index;
 if(index===undefined)return null;
 if(imageCache.has(index))return imageCache.get(index);
 const tex=g.textures[index],img=g.images[tex.source];
 assert(img?.bufferView!==undefined&&img.mimeType==='image/png','external/non-PNG texture '+index);
 const v=g.bufferViews[img.bufferView],o=v.byteOffset||0;
 const out=decodePNG(bin.subarray(o,o+v.byteLength));
 imageCache.set(index,out);return out;
}
function sample(img,uv) {
 if(!img||!uv)return [1,1,1];
 const x=Math.min(img.w-1,Math.max(0,Math.round(clamp(uv[0])*(img.w-1))));
 const y=Math.min(img.h-1,Math.max(0,Math.round((1-clamp(uv[1]))*(img.h-1))));
 const i=(y*img.w+x)*4;return [img.pix[i],img.pix[i+1],img.pix[i+2]].map(v=>v/255);
}
const mul=(a,b)=>a.map((v,i)=>v*b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mix=(xs)=>xs.reduce((a,c)=>add(a,c),[0,0,0]).map(v=>v/xs.length);
function posePoint(p,joints,weights) {
 let l=0,r=0;
 if(joints)for(let k=0;k<joints.length;k++){
  if([14,20,21,26,27].includes(joints[k]))l+=weights[k];
  if([13,18,19,24,25].includes(joints[k]))r+=weights[k];
 }
 l=clamp(l);r=clamp(r);const rest=Math.max(0,1-clamp(l+r));
 const angle=1.10,c=Math.cos(angle),s=Math.sin(angle);
 const rotate=(pivot,side)=>{const dx=p[0]-pivot[0],dz=p[2]-pivot[1];return [pivot[0]+dx*c+side*dz*s,p[1],pivot[1]-side*dx*s+dz*c]};
 const L=rotate([.182458,1.411317],1),R=rotate([-.182129,1.411317],-1);
 return p.map((v,k)=>v*rest+L[k]*l+R[k]*r);
}
function kindOf(meshName,materialName) {
 if(meshName.toLowerCase().includes('continuous_skin'))return 0;
 const n=materialName.toLowerCase();
 if(n.includes('hair'))return 1;
 if(n.includes('face')||n.includes('eye'))return 2;
 if(n.includes('boot')||n.includes('pants'))return 4;
 if(n.includes('jacket')||n.includes('armor'))return 3;
 return 5;
}
const outGroups=[],audit=[];
for(let mi=0;mi<g.meshes.length;mi++){
 const mesh=g.meshes[mi];
 for(let pi=0;pi<mesh.primitives.length;pi++){
  const p=mesh.primitives[pi];if((p.mode??4)!==4)continue;
  const pos=accessor(p.attributes.POSITION),indices=accessor(p.indices).map(x=>x[0]);
  const joints=p.attributes.JOINTS_0!==undefined?accessor(p.attributes.JOINTS_0):null;
  const weights=p.attributes.WEIGHTS_0!==undefined?accessor(p.attributes.WEIGHTS_0):null;
  const uvs=p.attributes.TEXCOORD_0!==undefined?accessor(p.attributes.TEXCOORD_0):null;
  const vcols=p.attributes.COLOR_0!==undefined?accessor(p.attributes.COLOR_0):null;
  const mat=g.materials[p.material],img=imageFor(mat),factor=(mat.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]).slice(0,3);
  const fallback=(mesh.name||'').includes('CONTINUOUS_SKIN')?[.76,.61,.52]:[.72,.69,.66];
  const kind=kindOf(mesh.name||'',mat.name||'');
  const triangles=[];
  assert(indices.length%3===0,'non-tri primitive');
  for(let i=0;i<indices.length;i+=3){
   const inds=indices.slice(i,i+3);
   const verts=inds.map(k=>posePoint(pos[k],joints?.[k],weights?.[k]));
   const uv=uvs?mix(inds.map(k=>[uvs[k][0],uvs[k][1],0])).slice(0,2):null;
   const col=img&&uv?mul(sample(img,uv),factor):vcols?mul(mix(inds.map(k=>vcols[k].slice(0,3))),factor):mul(fallback,factor);
   const rgb=col.map(x=>clamp(x)),luma=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
   triangles.push({verts,rgb,luma});
  }
  triangles.sort((a,b)=>a.luma-b.luma);
  // Four ranked palettes per actual material, max 24 groups for six primitives.
  let nonempty=0;
  for(let q=0;q<4;q++){
   const first=Math.floor(q*triangles.length/4),last=Math.floor((q+1)*triangles.length/4),subset=triangles.slice(first,last);
   if(!subset.length)continue;
   const col=mix(subset.map(x=>x.rgb));
   const packed=col.map(x=>Math.round(clamp(x)*255));
   const packedRGB=(packed[0]<<16)|(packed[1]<<8)|packed[2];
   outGroups.push({kind,material:p.material,quantile:q,packedRGB,color:packed,vertices:subset.flatMap(x=>x.verts),triangles:subset.length});
   nonempty++;
  }
  audit.push({mesh:mesh.name,material:mat.name,kind,triangles:triangles.length,texture:!!img,paletteGroups:nonempty,meanColor:mix(triangles.map(x=>x.rgb)).map(x=>Math.round(x*255))});
 }
}
const faceCount=outGroups.reduce((s,g)=>s+g.triangles,0);
assert(faceCount===2100&&outGroups.length<=48,'budget exceeded tris='+faceCount+' groups='+outGroups.length);
const chunks=[],header=Buffer.alloc(32);header.write('XPZC');header.writeUInt32LE(2,4);header.writeUInt32LE(outGroups.length,8);header.writeUInt32LE(faceCount,12);chunks.push(header);
for(const group of outGroups){
 const h=Buffer.alloc(16);h.writeUInt32LE(group.kind,0);h.writeUInt32LE(group.triangles,4);h.writeUInt32LE(group.vertices.length,8);h.writeUInt32LE(group.packedRGB,12);chunks.push(h);
 const data=Buffer.alloc(group.vertices.length*12);
 for(let i=0;i<group.vertices.length;i++)for(let k=0;k<3;k++){
  const v=group.vertices[i][k];assert(Number.isFinite(v)&&Math.abs(v)<100,'bad coordinate');data.writeFloatLE(v,i*12+k*4);
 }
 chunks.push(data);
}
const outputBytes=Buffer.concat(chunks);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,outputBytes);
const result={schema:'xpz3d.r138g.native_s2_palette/v2',sourceGLBSHA256:sha(glb),packetSHA256:sha(outputBytes),packetBytes:outputBytes.length,triangles:faceCount,groups:outGroups.length,imagesDecoded:imageCache.size,materialAudit:audit,palette:outGroups.map(({kind,material,quantile,color,triangles})=>({kind,material,quantile,color,triangles})),pose:'static weighted arms-down, preserved 2100 original triangles',nativeRenderer:'Nival S2 IGScene CreateMesh; textures sampled offline into 4 material palettes, NOT native UV texture mapping',engineVerified:false};
fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({packet:output,bytes:result.packetBytes,sha:result.packetSHA256,triangles:faceCount,groups:outGroups.length,decodedImages:imageCache.size,materialAudit:audit}));
