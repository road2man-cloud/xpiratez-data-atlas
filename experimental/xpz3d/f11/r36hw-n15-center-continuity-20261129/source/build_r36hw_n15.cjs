#!/usr/bin/env node
'use strict';
/* R36HW N15, center-only surface-continuity sculpt.
 * Rework existing N14 connected polygon mesh, do NOT attach a separate object,
 * change full-body silhouette, remesh face/hair, project photographic pixels,
 * or use R36JB as a donor.
 */
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n14-three-pole-center-20261129/output/R36HW_N14_THREE_POLE_CENTER.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N15_CENTER_CONTINUITY.glb');
const reportPath=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N15_CENTER_CONTINUITY.json');
const inputSHA='4b11da809e8df858b3f70e74d8088dbefee3f1058a9a3f5a2da0798bf359e59e';
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const src=fs.readFileSync(input);
if(sha(src)!==inputSHA)throw Error('Unexpected N14 input SHA: '+sha(src));
if(src.toString('ascii',0,4)!=='glTF'||src.readUInt32LE(4)!==2||src.readUInt32LE(8)!==src.length)throw Error('Not GLB2');
const jsonLen=src.readUInt32LE(12),g=JSON.parse(src.toString('utf8',20,20+jsonLen)),binHeader=20+jsonLen;
if(src.toString('ascii',binHeader+4,binHeader+8)!=='BIN\0')throw Error('No BIN');
const bin=src.subarray(binHeader+8,binHeader+8+src.readUInt32LE(binHeader));
const dimensions={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},units={5121:1,5123:2,5125:4,5126:4};
function accessor(id){
 const a=g.accessors[id],v=g.bufferViews[a.bufferView];
 if(!a||!v||a.sparse)throw Error('Sparse or missing attribute');
 const n=dimensions[a.type],w=units[a.componentType],stride=v.byteStride||n*w,base=(v.byteOffset||0)+(a.byteOffset||0);
 const rows=[];for(let i=0;i<a.count;i++){const row=[];for(let j=0;j<n;j++){
  const off=base+i*stride+j*w;
  if(off+w>bin.length)throw Error('Buffer overflow');
  row.push(a.componentType===5126?bin.readFloatLE(off):a.componentType===5125?bin.readUInt32LE(off):a.componentType===5123?bin.readUInt16LE(off):bin.readUInt8(off));
 }rows.push(row)}return rows;
}
const parts=g.meshes?.[0]?.primitives;
if(g.meshes.length!==1||parts.length!==10||g.skins[0].joints.length!==63)throw Error('Unexpected mesh/rig');
const before=parts.reduce((n,p)=>n+g.accessors[p.indices].count/3,0);
if(before!==2099)throw Error('Unexpected triangles');
const pelvis=parts[3],at=pelvis.attributes,pos=accessor(at.POSITION),orig=pos.map(v=>v.slice()),oldNormal=accessor(at.NORMAL),ids=accessor(pelvis.indices).map(r=>r[0]);
if(pos.length!==240||ids.length!==363*3)throw Error('N14 pelvis changed');
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
const gauss=(t,s)=>Math.exp(-.5*(t/s)**2);
const edges=new Map(),neighbors=Array.from({length:pos.length},()=>new Set()),faces=[];
for(let i=0;i<ids.length;i+=3){
 const face=ids.slice(i,i+3);faces.push(face);
 for(const [a,b] of [[face[0],face[1]],[face[1],face[2]],[face[2],face[0]]]){
  neighbors[a].add(b);neighbors[b].add(a);
  const k=a<b?a+','+b:b+','+a;edges.set(k,(edges.get(k)||0)+1);
 }
}
const protectedBoundary=new Set([...edges].filter(([k,v])=>v===1).flatMap(([k])=>k.split(',').map(Number)));
if(protectedBoundary.size!==45)throw Error('Unexpected base boundary');
function influence(p){
 const [x,y,z]=p;
 const lateral=1-smooth((Math.abs(x)-.045)/.07);
 const upper=1-smooth((z-.959)/.037),lower=smooth((z-.833)/.037);
 const forward=1-smooth((y+.068)/.060);
 return Math.max(0,Math.min(1,lateral*upper*lower*forward));
}
// Photo is only a qualitative reference to asymmetric creases, not a texture.
// The target is a shallow bounded displacement in native pelvic coordinates.
function shape(x,z){
 const offset=-.007+.005*Math.sin((z-.860)*14);
 const trench=.0029*gauss(x-offset,.015)*gauss(z-.899,.054);
 const left=-.0016*gauss(x-offset+.029,.016)*gauss(z-.893,.066);
 const right=-.0018*gauss(x-offset-.028,.017)*gauss(z-.882,.061);
 const lower=.0009*gauss(x+.004,.025)*gauss(z-.861,.025);
 return trench+left+right+lower;
}
// Relax the excessively sharp N14 curvature within the existing connected faces.
// Move Y only, and never modify the original open boundary vertices.
const base=pos.map(v=>v.slice());
const targeted=[];
for(let i=0;i<pos.length;i++){
 const m=influence(orig[i]);
 if(protectedBoundary.has(i)||m<.015||neighbors[i].size<3)continue;
 targeted.push(i);
}
if(targeted.length<25)throw Error('Too few eligible center vertices '+targeted.length);
for(let pass=0;pass<6;pass++){
 const next=pos.map(v=>v[1]);
 for(const i of targeted){
  const p=pos[i],mask=influence(orig[i]);
  let weight=0,average=0;
  for(const j of neighbors[i]){
   const q=pos[j],dx=(p[0]-q[0])/.061,dz=(p[2]-q[2])/.072,w=Math.exp(-.5*(dx*dx+dz*dz));
   weight+=w;average+=w*q[1];
  }
  if(weight>0)next[i]+=Math.max(-.0017,Math.min(.0017,(average/weight-p[1])*.32*mask));
 }
 for(const i of targeted)pos[i][1]=next[i];
}
for(const i of targeted){
 const m=influence(orig[i]),q=orig[i];
 // Fine folds take precedence over photometric interpretation.
 const intended=shape(q[0],q[2])*m;
 const relaxation=pos[i][1]-q[1];
 const total=Math.max(-.008,Math.min(.008,relaxation*.82+intended));
 pos[i][1]=q[1]+total;
}
const vec=(a,b)=>a.map((x,k)=>x-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),length=a=>Math.hypot(...a);
const unit=a=>a.map(v=>v/(length(a)||1));
const sums=pos.map(()=>[0,0,0]);
let smallest=Infinity,negative=0,refSides=0;
for(const face of faces){
 const [a,b,c]=face.map(i=>pos[i]),[aa,bb,cc]=face.map(i=>orig[i]);
 const n=cross(vec(b,a),vec(c,a)),o=cross(vec(bb,aa),vec(cc,aa)),area=length(n)*.5;
 smallest=Math.min(smallest,area);
 if(area<1e-10)throw Error('Degenerate triangle created');
 if(dot(unit(n),unit(o))<.05){negative++; }
 for(const i of face)for(let k=0;k<3;k++)sums[i][k]+=n[k];
}
if(negative>0)throw Error('Local facet inversions '+negative);
const changed=new Set([...targeted,...targeted.flatMap(i=>[...neighbors[i]])]);
const normals=oldNormal.map((v,i)=>{
 if(!changed.has(i)||protectedBoundary.has(i))return v.slice();
 let n=unit(sums[i]),ref=unit(v);if(dot(n,ref)<0)n=n.map(x=>-x);
 const w=influence(orig[i])*.85;
 return unit(n.map((x,k)=>n[k]*w+ref[k]*(1-w)));
});
const newBinChunks=[Buffer.from(bin)];
function totalBytes(){return newBinChunks.reduce((s,b)=>s+b.length,0)}
function add(rows,id){
 const a=g.accessors[id],n=dimensions[a.type],w=units[a.componentType];
 if(a.componentType!==5126||a.type!=='VEC3')throw Error('Position/normal must be VEC3 f32');
 if(totalBytes()%4)newBinChunks.push(Buffer.alloc(4-totalBytes()%4));
 const offset=totalBytes(),data=Buffer.alloc(rows.length*n*w);
 for(let i=0;i<rows.length;i++)for(let j=0;j<n;j++)data.writeFloatLE(rows[i][j],(i*n+j)*w);
 newBinChunks.push(data);
 const view=g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target:34962})-1;
 const next={bufferView:view,componentType:5126,count:rows.length,type:'VEC3'};
 next.min=[0,1,2].map(k=>Math.min(...rows.map(v=>v[k])));
 next.max=[0,1,2].map(k=>Math.max(...rows.map(v=>v[k])));
 return g.accessors.push(next)-1;
}
at.POSITION=add(pos,at.POSITION);at.NORMAL=add(normals,at.NORMAL);
pelvis.extras={...pelvis.extras,stage:'N15_CENTER_CONTINUITY_ONLY',localizedVertices:targeted.length,originalBoundaryLocked:true};
if(totalBytes()%4)newBinChunks.push(Buffer.alloc(4-totalBytes()%4));
const b=Buffer.concat(newBinChunks);g.buffers[0].byteLength=b.length;
const jbuf=Buffer.from(JSON.stringify(g)),jpad=Buffer.alloc(Math.ceil(jbuf.length/4)*4,32);jbuf.copy(jpad);
const glb=Buffer.alloc(20+jpad.length+8+b.length),p=20+jpad.length;
glb.write('glTF',0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
glb.writeUInt32LE(jpad.length,12);glb.write('JSON',16);jpad.copy(glb,20);glb.writeUInt32LE(b.length,p);glb.write('BIN\0',p+4,'ascii');b.copy(glb,p+8);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(output,glb);
const displacement=pos.map((v,i)=>length(vec(v,orig[i])));
const report={stage:'N15 regional curvature smoothing of connected N14 center only',inputSHA256:sha(src),outputSHA256:sha(glb),triangles:before,skinJoints:63,pelvisVertices:pos.length,pelvisTriangles:faces.length,editedVertices:targeted.length,boundaryProtected:protectedBoundary.size,maximumDisplacementMeters:Math.max(...displacement),minimumTriangleAreaSqMeters:smallest,faceInversions:negative,faceHairUntouched:true,sourceUVSkinWeightsUntouched:true,fullBodyUntouched:true,referenceImageProjected:false,visualApproval:false,nativeS2Rendered:false,limitations:['No rendered review yet','N14 clothing-derived side and lower silhouette remains','Existing external skin seams are not welded']};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,triangles:before,modified:targeted.length,boundary:protectedBoundary.size,maxShift:report.maximumDisplacementMeters,sha:report.outputSHA256}));
