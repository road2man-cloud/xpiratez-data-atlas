// V28 warm palette, exposed skin seam and tonal garment trim.
function build(src){
 const assert=(x,m)=>{if(!x)throw Error(m)},d=new DataView(src.buffer,src.byteOffset,src.byteLength),jl=d.getUint32(12,true),base=28+jl;
 assert(d.getUint32(0,true)===0x46546c67&&d.getUint32(4,true)===2&&d.getUint32(8,true)===src.length&&d.getUint32(16,true)===0x4e4f534a&&d.getUint32(24+jl,true)===0x004e4942&&base+d.getUint32(20+jl,true)===src.length,"GLB");
 const j=JSON.parse(String.fromCharCode(...src.subarray(20,20+jl))),orig=JSON.parse(JSON.stringify(j)),bin=src.slice(base);
 assert(j.materials[18].alphaMode==="OPAQUE"&&j.skins[0].joints.length===63,"source");
 const report={schema:"r36hw-v28-warm-palette-v1",sourceBlob:"20c969915e7f62b2591711045a8699f48016ae66",reference:{file:"body500_F11_pir.gif",warmPixels:2353,medianRgb:[112,68,28],q25:[92,44,16],q75:[136,96,44],note:"Uncalibrated sprite RGB; not a physically based albedo target"},sourceBytes:src.length,materials:[],zones:[]};
 for(const [id,factor] of [[0,[.48,.25,.085,1]],[8,[.48,.25,.085,1]],[18,[.28,.15,.055,1]]]){const m=j.materials[id];report.materials.push({id,name:m.name,before:m.pbrMetallicRoughness.baseColorFactor,after:factor});m.pbrMetallicRoughness.baseColorFactor=factor}
 function layout(id){const a=j.accessors[id],v=j.bufferViews[a.bufferView],n={VEC3:3,VEC4:4}[a.type],sz=a.componentType===5126?4:a.componentType===5121?1:0,st=v.byteStride||n*sz,o=(v.byteOffset||0)+(a.byteOffset||0);assert(n&&sz&&!a.sparse&&base+o+(a.count-1)*st+n*sz<=src.length,"accessor");return{a,st,o,n,sz}}
 function read(id){const a=layout(id);return Array.from({length:a.a.count},(_,i)=>Array.from({length:a.n},(_,k)=>a.sz===4?d.getFloat32(base+a.o+i*a.st+k*a.sz,true):d.getUint8(base+a.o+i*a.st+k)))}
 const mean=rows=>rows.length?[0,1,2].map(k=>+(rows.reduce((s,v)=>s+v[k],0)/rows.length).toFixed(3)):null;
 for(const p of j.meshes[0].primitives.filter(x=>[0,8,18].includes(x.material))){
  const pos=read(p.attributes.POSITION),colors=read(p.attributes.COLOR_0),ca=layout(p.attributes.COLOR_0),updates={};
  assert(ca.a.componentType===5121&&ca.a.normalized&&ca.n===4&&ca.st===4,"color layout");
  for(let i=0;i<pos.length;i++){const [x,y,z]=pos[i],c=colors[i];let zone=null,after=null;
   const wrist=Math.abs(x)>.64&&Math.abs(x)<.76&&z>1.27&&z<1.55,neck=Math.abs(x)<.13&&z>1.48&&z<1.64;
   if(p.material===0&&neck&&c.slice(0,3).every(v=>v>=253)){zone="face lower edge";after=[255,255,255]}
   if(p.material===8&&wrist&&c[0]===230&&c[1]===230&&c[2]===230){zone="exposed wrist skin";after=[255,255,255]}
   if(p.material===18&&(neck||wrist)&&((c[1]>c[0]+4&&c[2]>c[0]+5)||c[0]<120)){zone=neck?"fabric collar trim":"fabric cuff trim";after=[185,159,125]}
   if(!after)continue;const g=updates[zone]||(updates[zone]={selected:0,changed:0,before:[],after:[]});g.selected++;g.before.push(c);g.after.push(after);if(after.some((v,k)=>v!==c[k])){g.changed++;for(let k=0;k<3;k++)bin[ca.o+i*ca.st+k]=after[k]}
   assert(bin[ca.o+i*ca.st+3]===c[3],"alpha changed");
  }
  for(const [zone,g] of Object.entries(updates))report.zones.push({material:p.material,zone,selected:g.selected,changed:g.changed,oldMeanRgb:mean(g.before),newMeanRgb:mean(g.after)});
 }
 const changed=[];for(let k=0;k<j.bufferViews.length;k++){const v=j.bufferViews[k],o=v.byteOffset||0;if(!bin.subarray(o,o+v.byteLength).every((x,i)=>x===src[base+o+i]))changed.push(k)}
 assert(changed.includes(4)&&changed.includes(42)&&changed.every(k=>[4,26,42].includes(k)),"changed views");
 for(const k of ["meshes","skins","nodes","accessors","bufferViews","images","textures","samplers","buffers"])assert(JSON.stringify(j[k])===JSON.stringify(orig[k]),k+" changed");
 for(let i=0;i<j.materials.length;i++){let a=JSON.parse(JSON.stringify(j.materials[i])),b=orig.materials[i];if([0,8,18].includes(i))a.pbrMetallicRoughness.baseColorFactor=b.pbrMetallicRoughness.baseColorFactor;assert(JSON.stringify(a)===JSON.stringify(b),"other material property changed")}
 assert(j.materials[18].alphaMode==="OPAQUE"&&j.materials[18].normalTexture.scale===.25,"opaque garment texture");
 const tri=j.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+j.accessors[p.indices].count/3,0);assert(tri===2100,"triangle budget");
 j.asset.generator="R36HW V28 warm palette and tonal fabric trim";
 const s=JSON.stringify(j),jb=new Uint8Array((s.length+3)&~3).fill(32);for(let i=0;i<s.length;i++){assert(s.charCodeAt(i)<128,"JSON");jb[i]=s.charCodeAt(i)}
 const glb=new Uint8Array(28+jb.length+bin.length),h=new DataView(glb.buffer);[0x46546c67,2,glb.length,jb.length,0x4e4f534a].forEach((x,i)=>h.setUint32(i*4,x,true));glb.set(jb,20);h.setUint32(20+jb.length,bin.length,true);h.setUint32(24+jb.length,0x004e4942,true);glb.set(bin,28+jb.length);
 Object.assign(report,{outputBytes:glb.length,triangles:tri,joints:63,changedViews:changed,unchangedViews:j.bufferViews.length-changed.length,poseGeometryWeightsNormalsTexturesUnchanged:true,garmentOpaque:true,garmentSeparatePalette:true,renderPerformed:false,referenceColorCalibrated:false});
 return {glb,report};
}
module.exports={build};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const input=process.argv[2],out=process.argv[3]||path.resolve(__dirname,'../output');if(!input)throw Error('Usage: node build.cjs V27.glb [output directory]');const b=fs.readFileSync(input),sha=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');if(sha!=='20c969915e7f62b2591711045a8699f48016ae66')throw Error('Wrong source '+sha);const r=build(b);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'R36HW_F11_ATHLETIC_SUIT_V28_WARM.glb'),r.glb);const reports=path.resolve(out,'../reports');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'build.json'),JSON.stringify(r.report,null,2)+'\n');}
