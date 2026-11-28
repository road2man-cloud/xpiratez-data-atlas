#!/usr/bin/env node
'use strict';
/*
 * R36HW N3 — continuity-aware local sculpt and garment-shell retouch.
 * Uses the original HW GLB exclusively; no R36JB body substitution.
 * Local reference luminance is a tiny hand-inspected 9x15 raster, NOT image texturing.
 * Stage: geometry experiment; no claim of visually accepted anatomy or finished undress.
 */
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const sourceFile=process.argv[2]||path.resolve(__dirname,'../../r36kp/reference/R36HW_F11_CLOTHED.glb');
const outFile=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N3_CURVATURE.glb');
const reportFile=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N3_CURVATURE.json');
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

// Smooth, bounded height-field. Negative Y is the visible forward direction.
// A single photo cannot specify absolute depth; luminance stays a weak cue.
function displacement(p){
 const x=p[0],y=p[1],z=p[2];
 const fadeX=1-smooth((Math.abs(x)-.052)/.103);
 const fadeZ=smooth((z-.800)/.031)*(1-smooth((z-.999)/.045));
 const frontFade=1-smooth((y+.055)/.115);
 const mask=clamp(fadeX*fadeZ*frontFade,0,1);
 const shift=-.005 + .009*Math.sin((z-.833)*14);
 const core=gaussian(x,shift,.014)*gaussian(z,.878,.058);
 const softLeft=gaussian(x,shift-.030,.015)*gaussian(z,.885,.063);
 const softRight=gaussian(x,shift+.029,.015)*gaussian(z,.889,.061);
 const rim=gaussian(x,shift-.014,.014)*gaussian(z,.931,.018);
 const taper=gaussian(x,.003,.027)*gaussian(z,.820,.021);
 const guide=sample((x+.156)/.312,(1.042-z)/.244);
 const lightCue=clamp(guide-.27,-.18,.22)*.0016;
 // Positive Y forms a recess, negative Y a shallow raised fold.
 return mask*(.0073*core - .0034*softLeft - .0031*softRight - .0018*rim - .0012*taper-lightCue);
}
const h=.0015;
function revisedNormal(p,n){
 const dx=(displacement([p[0]+h,p[1],p[2]])-displacement([p[0]-h,p[1],p[2]]))/(2*h);
 const dz=(displacement([p[0],p[1],p[2]+h])-displacement([p[0],p[1],p[2]-h]))/(2*h);
 const v=[n[0]-n[1]*dx,n[1],n[2]-n[1]*dz],L=Math.hypot(...v)||1;
 return v.map(q=>q/L);
}
function colorAt(p){
 const depth=displacement(p);
 const occl=clamp(depth/.008,0,1),raised=clamp(-depth/.005,0,1);
 const noise=Math.sin(p[0]*211+p[2]*137)*Math.sin(p[0]*91-p[2]*109)*2.5;
 return [255,249,243].map((v,k)=>Math.round(clamp(v-occl*[25,31,34][k]+raised*[0,2,3][k]+noise,210,255))).concat(255);
}
function region(p){return Math.abs(p[0])<.178&&p[1]<-.010&&p[2]>.802&&p[2]<1.044}
const selectedCandidates=[];
for(let n=0;n<indices.length;n+=3){
 const ids=indices.slice(n,n+3),c=[0,0,0];
 for(const id of ids)for(let d=0;d<3;d++)c[d]+=pos[id][d]/3;
 if(region(c))selectedCandidates.push({triangle:n/3,ids,center:c});
}
// Spend saved accessory triangles where changing curvature benefits most, not on a uniform raster.
for(const t of selectedCandidates){
 const d=displacement(t.center),avg=t.ids.reduce((s,id)=>s+displacement(pos[id]),0)/3;
 const score=Math.abs(d-avg)*140 + Math.abs(d)*15
  + .23*gaussian(t.center[0],-.005,.055)*gaussian(t.center[2],.886,.094);
 t.priority=score;
}
const selected=selectedCandidates.sort((a,b)=>b.priority-a.priority||a.triangle-b.triangle).slice(0,86).sort((a,b)=>a.triangle-b.triangle);
if(selected.length<32||selected.length>93)throw Error('Unexpected local ROI size '+selected.length);
const originalNormals=norm.map(v=>v.slice());
const baselineOffset=originalPantsPositions.map(p=>displacement(p));
// Diffuse relief across original vertices too: no isolated centroid spikes.
for(let i=0;i<originalPantsPositions.length;i++){
 pos[i][1]+=baselineOffset[i];
 norm[i]=revisedNormal(originalPantsPositions[i],originalNormals[i]);
 colors[i]=colorAt(originalPantsPositions[i]);
}
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
 const unmodified=centroid(originalPantsPositions,ids),c=centroid(pos,ids);
 const target=displacement(unmodified),meanBase=ids.reduce((s,id)=>s+baselineOffset[id],0)/3;
 const residual=target-meanBase,q=pos.length,sk=blendSkin(ids);
 const baseNorm=centroid(originalNormals,ids);
 c[1]+=residual;
 pos.push(c);norm.push(revisedNormal(unmodified,baseNorm));joints.push(sk.joints);weights.push(sk.weights);
 colors.push(colorAt(unmodified));uv.push(centroid(uv,ids));
 newIndex.push(ids[0],ids[1],q,ids[1],ids[2],q,ids[2],ids[0],q);
 updatedCenter.push(q);perTri.push({originalTriangle:t,centroidIndex:q,totalOffsetY:+target.toFixed(6),residualY:+residual.toFixed(6)});
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
// Retouch the *existing HW geometry* of the other garment shells.
// Thin shell contraction is conservative; no new donor body or full reconstruction.
const retouches=[];
for(const p of j.meshes[0].primitives){
 const name=j.materials[p.material]?.name;
 if(!['jacket','boots','gloves'].includes(name))continue;
 const orig=unpack(p.attributes.POSITION),n0=unpack(p.attributes.NORMAL);
 const tint=unpack(p.attributes.COLOR_0),positions=orig.map(a=>a.slice());
 const normals=n0.map(a=>a.slice());
 let maxShift=0;
 for(let i=0;i<orig.length;i++){
  const v=orig[i],f=positions[i],z=v[2];
  // Garment shell thickness removed radially around approximate body/limb axis.
  const legCenter=name==='boots'?(v[0]<0?-.095:.095):name==='gloves'?(v[0]<0?-.69:.69):0;
  const sf=name==='jacket'?.025:name==='boots'?.049:.022;
  const sy=name==='jacket'?.020:name==='boots'?.028:.015;
  f[0]=legCenter+(v[0]-legCenter)*(1-sf);
  f[1]=v[1]*(1-sy);
  if(name==='jacket')f[2]+= .0015*smooth((z-1.21)/.29)*(1-smooth((z-1.47)/.055));
  if(name==='boots')f[2]+= .0025*smooth((.24-z)/.20);
  const nn=[n0[i][0]/(1-sf),n0[i][1]/(1-sy),n0[i][2]],ll=Math.hypot(...nn)||1;
  normals[i]=nn.map(k=>k/ll);
  const tone=(name==='jacket'?247:name==='boots'?240:250)-4*Math.sin(z*26+v[0]*19);
  tint[i]=[tone,tone-6,tone-10,255].map(q=>Math.round(clamp(q,0,255)));
  maxShift=Math.max(maxShift,Math.hypot(...f.map((v,d)=>v-orig[i][d])));
 }
 const previous=p.attributes.POSITION;
 p.attributes.POSITION=addAttr(positions,'VEC3',5126);
 j.accessors[p.attributes.POSITION].min=[0,1,2].map(k=>Math.min(...positions.map(v=>v[k])));
 j.accessors[p.attributes.POSITION].max=[0,1,2].map(k=>Math.max(...positions.map(v=>v[k])));
 p.attributes.NORMAL=addAttr(normals,'VEC3',5126);
 p.attributes.COLOR_0=addAttr(tint,'VEC4',5121,true);
 p.material=skin;
 retouches.push({primitive:name,vertexCount:positions.length,maxDisplacementMeters:+maxShift.toFixed(6),originalAccessor:previous});
}
pp.extras={...pp.extras,stage:'HW_N3_CURVATURE',splitTriangles:selected.length,addedTriangles:2*selected.length,baseVerticesDeformed:baselineOffset.filter(x=>Math.abs(x)>.000001).length,referenceMethod:'9x15 low-resolution luminance and bounded continuous analytical folds; not projected image'};
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
const stats={stage:'R36HW N3 direct edit — distributed height displacement, improved normals and original garment shell retouch',inputSha256:sha(src),outputSha256:sha(chunks),originalTriangles,removedTriangles,selectedTriangles:selected.length,candidateTriangles:selectedCandidates.length,addedTriangles:selected.length*2,resultTriangles:triangleCount,originalPantsVertices:originalPantsPositions.length,editedPantsVertices:pos.length,selectedTriangleIDs:selected.map(t=>t.triangle),offsetSummaryMeters:{min:Math.min(...perTri.map(t=>t.totalOffsetY)),max:Math.max(...perTri.map(t=>t.totalOffsetY)),originalVerticesWithRelief:baselineOffset.filter(x=>Math.abs(x)>.000001).length},retouchedPrimitives:retouches,retainedSkinJoints:j.skins[0].joints.length,unchangedFaceTriangles:644,unchangedHairTriangles:294,originalBINbytes:oldLen,retainedOriginalBinaryBytes:oldLen,limitations:['Original outfit-shaped shells were conservatively slimmed but not fully retopologized','Not a photogrammetric depth reconstruction','Image reference is a low-resolution nonliteral cue','No native S2 run','Visual aesthetics unapproved'],triangles:perTri};
fs.writeFileSync(reportFile,JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify({outFile,reportFile,triangles:triangleCount,selectedTriangles:selected.length,retouched:retouches.length,sha256:stats.outputSha256}));
