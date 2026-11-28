#!/usr/bin/env node
'use strict';
/*
 * R36HW N2 — R36HW-native regional sculpture.
 * Uses the original HW GLB exclusively; no R36JB body substitution.
 * Local reference luminance is a tiny hand-inspected 9x15 raster, NOT image texturing.
 * Stage: geometry experiment; no claim of visually accepted anatomy or finished undress.
 */
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const sourceFile=process.argv[2]||path.resolve(__dirname,'../../r36kp/reference/R36HW_F11_CLOTHED.glb');
const outFile=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N2_REGION_SCULPT.glb');
const reportFile=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N2_REGION_SCULPT.json');
const expected='a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732';
const src=fs.readFileSync(sourceFile),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
if(src.toString('ascii',0,4)!=='glTF'||src.readUInt32LE(4)!==2)throw Error('GLB2 required');
if(sha(src)!==expected)throw Error('R36HW SHA mismatch: '+sha(src));
const jl=src.readUInt32LE(12), j=JSON.parse(src.subarray(20,20+jl).toString('utf8'));
if(src.toString('ascii',16,20)!=='JSON')throw Error('GLB JSON missing');
const binChunkAt=20+jl,binLength=src.readUInt32LE(binChunkAt);
if(src.toString('ascii',binChunkAt+4,binChunkAt+8)!=='BIN\0')throw Error('BIN chunk missing');
const origBin=src.subarray(binChunkAt+8,binChunkAt+8+binLength);
const vertComps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},bpc={5121:1,5123:2,5125:4,5126:4};
function unpack(id){
 const a=j.accessors[id],v=j.bufferViews[a.bufferView],n=vertComps[a.type],s=bpc[a.componentType],stride=v.byteStride||s*n,offset=(v.byteOffset||0)+(a.byteOffset||0);
 const res=[],d=new DataView(origBin.buffer,origBin.byteOffset,origBin.byteLength);
 for(let i=0;i<a.count;i++){
  const row=[];for(let k=0;k<n;k++){
   const off=offset+i*stride+k*s;
   row.push(a.componentType===5126?d.getFloat32(off,true):a.componentType===5125?d.getUint32(off,true):a.componentType===5123?d.getUint16(off,true):d.getUint8(off));
  }res.push(row);
 }return res;
}
const primitives=j.meshes[0].primitives;
if(primitives.length!==15||j.skins[0].joints.length!==63)throw Error('Expected HW mesh and skin');
const originals=primitives.map(p=>({name:j.materials[p.material].name,triangles:j.accessors[p.indices].count/3}));
const originalTriangles=originals.reduce((s,p)=>s+p.triangles,0);
if(originalTriangles!==2098)throw Error('Unexpected original HW triangle count: '+originalTriangles);
const remove=new Set(['trim','hardware','webbing','gear','skull','thigh_strap']);
const skin=j.materials.findIndex(m=>m.name==='skin');
if(skin<0)throw Error('Skin material missing');
j.meshes[0].primitives=primitives.filter(p=>!remove.has(j.materials[p.material].name));
const pp=j.meshes[0].primitives.find(p=>j.materials[p.material].name==='pants');
if(!pp)throw Error('Shorts primitive missing');
const a=pp.attributes, pos=unpack(a.POSITION), norm=unpack(a.NORMAL), joints=unpack(a.JOINTS_0),weights=unpack(a.WEIGHTS_0),colors=unpack(a.COLOR_0),uv=unpack(a.TEXCOORD_0),indices=unpack(pp.indices).flat();
const originalPantsPositions=pos.map(v=>v.slice());
/* 9 columns x 15 rows of blurred 8-bit reference luminance samples.
 * Cropped locally from the supplied reference image; NO photo pixels embedded.
 * Used only as a weak *relative* geometric cue, combined with hand-defined landmarks.
 */
const luminance=[
 [102,96,73,93,74,54,74,77,75],
 [99,84,68,99,77,47,68,76,74],
 [89,64,65,100,76,41,58,73,73],
 [78,50,68,100,73,40,50,71,73],
 [69,45,72,102,70,42,47,70,75],
 [63,44,66,97,70,45,45,67,77],
 [58,47,53,79,73,49,43,60,76],
 [45,50,53,63,80,56,43,53,73],
 [35,53,65,56,78,70,48,53,68],
 [34,55,66,58,65,78,63,59,68],
 [35,56,62,57,54,64,70,64,69],
 [39,50,61,51,47,44,56,61,67],
 [51,42,56,57,46,42,49,54,62],
 [63,48,51,68,63,52,52,55,59],
 [66,65,54,63,72,58,53,55,58]
];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x)};
function sample(u,v){
 u=clamp(u,0,1)*8;v=clamp(v,0,1)*14;
 const x=Math.min(7,Math.floor(u)),y=Math.min(13,Math.floor(v)),tx=u-x,ty=v-y;
 return ((1-tx)*(1-ty)*luminance[y][x]+tx*(1-ty)*luminance[y][x+1]+(1-tx)*ty*luminance[y+1][x]+tx*ty*luminance[y+1][x+1])/255;
}
const gaussian=(x,c,s)=>Math.exp(-.5*((x-c)/s)**2);
function displacement(p){
 const x=p[0],z=p[2];
 // Localized lower anterior pelvic panel; edge fade avoids seams.
 const fadeX=1-smooth((Math.abs(x)-.058)/.085);
 const fadeZ=smooth((z-.805)/.018)*(1-smooth((z-.991)/.045));
 const gate=clamp(fadeX*fadeZ,0,1);
 const u=clamp((x+.145)/.29,0,1),v=clamp((1.04-z)/.235,0,1);
 // Photometric ambiguity: use only 2.0mm max value from the tiny gray guide.
 const gray=sample(u,v);
 const weakRelief=(gray-.27)*.002;
 // Irregular narrow central recess, bounded soft side ridges and lower taper.
 const center=gaussian(x,-.006-.009*Math.sin((z-.82)*19),.015)*gaussian(z,.881,.067);
 const ridgeL=gaussian(x,-.029,.013)*gaussian(z,.889,.066);
 const ridgeR=gaussian(x,.025,.014)*gaussian(z,.886,.062);
 const lower=gaussian(x,-.002,.034)*gaussian(z,.825,.018);
 const emboss=(-.009*center + .0042*ridgeL + .0036*ridgeR + .0018*lower+weakRelief)*gate;
 // Front of model is negative Y; positive Y means recess, negative Y means raised ridge.
 return -emboss;
}
function region(p){return Math.abs(p[0])<.147&&p[1]<-.039&&p[2]>.81&&p[2]<1.034}
const tri=[],selected=[];
for(let n=0;n<indices.length;n+=3){
 const ids=indices.slice(n,n+3),c=[0,0,0];
 for(const id of ids)for(let d=0;d<3;d++)c[d]+=pos[id][d]/3;
 if(region(c))selected.push({triangle:n/3,ids,center:c});
}
if(selected.length<32||selected.length>75)throw Error('Unexpected local ROI size '+selected.length);
const selectedIds=new Set(selected.map(t=>t.triangle)),rows={POSITION:pos,NORMAL:norm,JOINTS_0:joints,WEIGHTS_0:weights,COLOR_0:colors,TEXCOORD_0:uv};
const newIndex=[],updatedCenter=[],perTri=[];
function centroid(arr,ids){return Array.from({length:arr[0].length},(_,d)=>(arr[ids[0]][d]+arr[ids[1]][d]+arr[ids[2]][d])/3)}
function blendSkin(ids){
 const boneWeights=new Map();for(const id of ids){for(let k=0;k<4;k++){const bone=joints[id][k],w=weights[id][k]/3;boneWeights.set(bone,(boneWeights.get(bone)||0)+w)}}
 const strongest=[...boneWeights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=strongest.reduce((s,x)=>s+x[1],0)||1;
 return {joints:Array.from({length:4},(_,k)=>strongest[k]?.[0]||0),weights:Array.from({length:4},(_,k)=>(strongest[k]?.[1]||0)/sum)};
}
for(let n=0;n<indices.length;n+=3){
 const ids=indices.slice(n,n+3),t=n/3;
 if(!selectedIds.has(t)){newIndex.push(...ids);continue}
 const c=centroid(pos,ids),scale=displacement(c),q=pos.length,sk=blendSkin(ids);
 const baseNorm=centroid(norm,ids),len=Math.hypot(...baseNorm)||1;
 c[1]+=scale;
 pos.push(c);norm.push(baseNorm.map(v=>v/len));joints.push(sk.joints);weights.push(sk.weights);
 colors.push([255,255,255,255]);uv.push(centroid(uv,ids));
 newIndex.push(ids[0],ids[1],q,ids[1],ids[2],q,ids[2],ids[0],q);
 updatedCenter.push(q);perTri.push({originalTriangle:t,centroidIndex:q,offsetY:+scale.toFixed(6)});
}
const removedTriangles=originals.filter(x=>remove.has(x.name)).reduce((s,x)=>s+x.triangles,0);
const triangleCount=originalTriangles-removedTriangles+selected.length*2;
if(triangleCount>2100)throw Error('Budget '+triangleCount+' > 2100');
const binary=[Buffer.from(origBin)],oldLen=origBin.length;
function alignBuffer(){let sum=binary.reduce((s,x)=>s+x.length,0);if(sum%4)binary.push(Buffer.alloc(4-sum%4))}
function addAttr(values,type,componentType,normalized=false,target=34962){
 alignBuffer();const offset=binary.reduce((s,x)=>s+x.length,0);
 const count=values.length,components=vertComps[type],size=bpc[componentType],buf=Buffer.alloc(count*components*size);
 let ptr=0;
 for(const row of values){for(let k=0;k<components;k++){const val=row[k];if(componentType===5126)buf.writeFloatLE(val,ptr);else if(componentType===5123)buf.writeUInt16LE(Math.round(val),ptr);else if(componentType===5125)buf.writeUInt32LE(Math.round(val),ptr);else buf.writeUInt8(Math.max(0,Math.min(255,Math.round(val))),ptr);ptr+=size;}}
 binary.push(buf);const view=j.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buf.length,target})-1;
 const ac={bufferView:view,componentType,count,type};if(normalized)ac.normalized=true;
 if(type==='VEC3'&&componentType===5126&&values===pos){ac.min=[0,1,2].map(k=>Math.min(...pos.map(p=>p[k])));ac.max=[0,1,2].map(k=>Math.max(...pos.map(p=>p[k])))}
 return j.accessors.push(ac)-1;
}
for(const [name,arr] of Object.entries(rows)){
 const old=j.accessors[a[name]];
 a[name]=addAttr(arr,old.type,old.componentType,!!old.normalized);
}
pp.indices=addAttr(newIndex.map(x=>[x]),'SCALAR',5123,false,34963);
j.accessors[pp.indices].min=[Math.min(...newIndex)];j.accessors[pp.indices].max=[Math.max(...newIndex)];
pp.material=skin;
for(const p of j.meshes[0].primitives){if(['jacket','boots','gloves'].includes(j.materials[p.material]?.name))p.material=skin;}
pp.extras={...pp.extras,stage:'HW_N2_LOCAL_SCULPT',replacedTriangles:selected.length,addedTriangles:2*selected.length,referenceMethod:'9x15 relative-luminance + analytic curve offsets; no projected photo'};
alignBuffer();
const bin=Buffer.concat(binary);j.buffers[0].byteLength=bin.length;
const jdata=Buffer.from(JSON.stringify(j),'utf8');
const jpad=Buffer.alloc(Math.ceil(jdata.length/4)*4,0x20);jdata.copy(jpad);
const chunks=Buffer.alloc(20+ jpad.length+8+bin.length);
chunks.write('glTF',0,'ascii');chunks.writeUInt32LE(2,4);chunks.writeUInt32LE(chunks.length,8);
chunks.writeUInt32LE(jpad.length,12);chunks.write('JSON',16,'ascii');jpad.copy(chunks,20);
const off=20+jpad.length;chunks.writeUInt32LE(bin.length,off);chunks.write('BIN\0',off+4,'ascii');bin.copy(chunks,off+8);
fs.mkdirSync(path.dirname(outFile),{recursive:true});fs.mkdirSync(path.dirname(reportFile),{recursive:true});
fs.writeFileSync(outFile,chunks);
const stats={stage:'HW original local edit (sculpt geometry; clothing topology remains outside ROI)',inputSha256:sha(src),outputSha256:sha(chunks),originalTriangles,removedTriangles,selectedTriangles:selected.length,addedTriangles:selected.length*2,resultTriangles:triangleCount,originalPantsVertices:originalPantsPositions.length,editedPantsVertices:pos.length,selectedTriangleIDs:selected.map(t=>t.triangle),offsetSummary:{min:Math.min(...perTri.map(t=>t.offsetY)),max:Math.max(...perTri.map(t=>t.offsetY))},retainedSkinJoints:j.skins[0].joints.length,unchangedFaceTriangles:644,unchangedHairTriangles:294,originalBINbytes:oldLen,retainedOriginalBinaryBytes:oldLen,limitations:['No full clothing silhouette removal','Not a photogrammetric depth reconstruction','Image reference is a relative shape hint only','No native S2 run','Visual aesthetics unapproved'],triangles:perTri};
fs.writeFileSync(reportFile,JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify({outFile,reportFile,triangles:triangleCount,selectedTriangles:selected.length,sha256:stats.outputSha256}));
