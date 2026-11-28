#!/usr/bin/env node
'use strict';
/* R36HW N17, center-only surface-continuity sculpt.
 * Rework existing N16 connected polygon mesh, do NOT attach a separate object,
 * change full-body silhouette, remesh face/hair, project photographic pixels,
 * or use R36JB as a donor.
 */
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n16-retess-center-20261129/output/R36HW_N16_RETESS_CENTER.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N17_CENTER_DEPTH.glb');
const reportPath=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N17_CENTER_DEPTH.json');
const strength=Number(process.argv[5]||1);if(!Number.isFinite(strength)||strength<.4||strength>1.4)throw Error('Invalid relief strength');
const inputSHA='a5d4aaf2cf8912de2ee3339cbd6e20df9cae15250a09ac76ce0b96bc0d5410d3';
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const src=fs.readFileSync(input);
if(sha(src)!==inputSHA)throw Error('Unexpected N16 input SHA: '+sha(src));
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
if(pos.length!==240||ids.length!==363*3)throw Error('N16 pelvis changed');
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
 const lateral=1-smooth((Math.abs(x)-.045)/.074);
 const upper=1-smooth((z-.957)/.055),lower=smooth((z-.830)/.050);
 const forward=1-smooth((y+.061)/.092);
 return Math.max(0,Math.min(1,lateral*upper*lower*forward));
}
// Center-only 3D relief, not a photo height map. The input photo is a
// qualitative shape reference; a single photo does not reveal true depth.
// +Y means recessed away from viewer standing in front (-Y camera).
function shape(x,z){
 const offset=-.0065+.0048*Math.sin((z-.854)*17);
 const main=.0105*gauss((x-offset)/.015,1)*gauss((z-.907)/.056,1);
 const superior=.0029*gauss((x-offset+.007)/.014,1)*gauss((z-.950)/.024,1);
 const leftRidge=-.0050*gauss((x-offset+.029)/.017,1)*gauss((z-.906)/.066,1);
 const rightRidge=-.0055*gauss((x-offset-.029)/.014,1)*gauss((z-.892)/.068,1);
 const lower=.0027*gauss((x-offset-.005)/.013,1)*gauss((z-.860)/.025,1);
 const asymmetric=-.0018*gauss((x+.018)/.010,1)*gauss((z-.864)/.023,1);
 return main+superior+leftRidge+rightRidge+lower+asymmetric;
}
// Instead of six tiny smoothing passes and cosmetic normals,
// construct a constrained harmonic *skin base* and sculpt on top.
const targeted=[];
for(let i=0;i<pos.length;i++){
 if(protectedBoundary.has(i)||influence(orig[i])<.015||neighbors[i].size<3)continue;
 targeted.push(i);
}
if(targeted.length<40)throw Error('Too few actual center region vertices '+targeted.length);
let harmonic=orig.map(v=>v[1]);
for(let pass=0;pass<18;pass++){
 const next=harmonic.slice();
 for(const i of targeted){
  const p=orig[i],m=influence(p);
  let sum=0,sw=0;
  for(const j of neighbors[i]){
   const q=orig[j],dx=(p[0]-q[0])/.058,dz=(p[2]-q[2])/.069;
   const w=Math.exp(-.5*(dx*dx+dz*dz));sum+=harmonic[j]*w;sw+=w;
  }
  if(sw>1e-10)next[i]+=Math.max(-.0025,Math.min(.0025,(sum/sw-harmonic[i])*.44*m));
 }
 harmonic=next;
}
const rawTargets=new Map(),region=[];
for(const i of targeted){
 const p=orig[i],m=influence(p);
 const displacementBase=(harmonic[i]-p[1])*.90;
 const ridge=shape(p[0],p[2])*strength;
 const wanted=Math.max(-.020,Math.min(.020,(displacementBase+ridge)*m));
 rawTargets.set(i,wanted);region.push({i,weight:m,rawMeters:wanted});
}
// Several source faces are already sharply folded. Search for the greatest
// safe global relief multiplier that does not reverse or degenerate any face.
let reliefScale=1,initialInversions=0,dampingSteps=0;
const originalFaceNormals=faces.map(f=>{
 const [a,b,c]=f.map(i=>orig[i]),AB=b.map((x,k)=>x-a[k]),AC=c.map((x,k)=>x-a[k]);
 return [AB[1]*AC[2]-AB[2]*AC[1],AB[2]*AC[0]-AB[0]*AC[2],AB[0]*AC[1]-AB[1]*AC[0]];
});
function surfaceErrors(){
 let inversions=0,minArea=Infinity;
 for(let f=0;f<faces.length;f++){
  const [a,b,c]=faces[f].map(i=>pos[i]);
  const AB=b.map((v,k)=>v-a[k]),AC=c.map((v,k)=>v-a[k]);
  const n=[AB[1]*AC[2]-AB[2]*AC[1],AB[2]*AC[0]-AB[0]*AC[2],AB[0]*AC[1]-AB[1]*AC[0]];
  const ref=originalFaceNormals[f],D=Math.hypot(...n)*Math.hypot(...ref),dot=n.reduce((s,v,k)=>s+v*ref[k],0);
  const area=Math.hypot(...n)*.5;minArea=Math.min(minArea,area);
  if(area<1e-10||D>0&&dot/D<.07)inversions++;
 }
 return {inversions,minArea};
}
for(const i of targeted)pos[i][1]=orig[i][1]+rawTargets.get(i);
initialInversions=surfaceErrors().inversions;
while(surfaceErrors().inversions>0&&dampingSteps<15){
 reliefScale*=.5;dampingSteps++;
 for(const i of targeted)pos[i][1]=orig[i][1]+reliefScale*rawTargets.get(i);
}
const geometryCheck=surfaceErrors();
if(geometryCheck.inversions>0)throw Error('N17 could not sculpt without face reversals');
const beforeHarmonicResidual=targeted.reduce((s,i)=>s+Math.abs(harmonic[i]-orig[i][1]),0)/targeted.length;
const effectiveMovement=targeted.map(i=>Math.abs(pos[i][1]-orig[i][1]));
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
 const w=influence(orig[i])*.94;
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
pelvis.extras={...pelvis.extras,stage:'N17_CENTER_CONTINUITY_ONLY',localizedVertices:targeted.length,originalBoundaryLocked:true,qualitativeRelief:true};
if(totalBytes()%4)newBinChunks.push(Buffer.alloc(4-totalBytes()%4));
const b=Buffer.concat(newBinChunks);g.buffers[0].byteLength=b.length;
const jbuf=Buffer.from(JSON.stringify(g)),jpad=Buffer.alloc(Math.ceil(jbuf.length/4)*4,32);jbuf.copy(jpad);
const glb=Buffer.alloc(20+jpad.length+8+b.length),p=20+jpad.length;
glb.write('glTF',0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
glb.writeUInt32LE(jpad.length,12);glb.write('JSON',16);jpad.copy(glb,20);glb.writeUInt32LE(b.length,p);glb.write('BIN\0',p+4,'ascii');b.copy(glb,p+8);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(output,glb);
const displacement=pos.map((v,i)=>length(vec(v,orig[i])));
const report={stage:'N17 centered constrained-harmonic base and asymmetric 3D relief on N16 GLB',inputSHA256:sha(src),outputSHA256:sha(glb),triangles:before,skinJoints:63,pelvisVertices:pos.length,pelvisTriangles:faces.length,editedVertices:targeted.length,boundaryProtected:protectedBoundary.size,maximumDisplacementMeters:Math.max(...displacement),minimumTriangleAreaSqMeters:smallest,faceInversions:negative,initialInversions,dampingSteps,reliefScale,strength,meanHarmonicCorrectionMeters:beforeHarmonicResidual,faceHairUntouched:true,sourceUVSkinWeightsUntouched:true,fullBodyUntouched:true,referenceImageProjected:false,visualApproval:false,nativeS2Rendered:false,regionModified:region.length,meanAbsMovementMeters:effectiveMovement.reduce((s,x)=>s+x,0)/effectiveMovement.length,,limitations:['No rendered review yet','N16 clothing-derived side and lower silhouette remains','Existing external skin seams are not welded']};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,triangles:before,modified:targeted.length,boundary:protectedBoundary.size,maxShift:report.maximumDisplacementMeters,sha:report.outputSHA256}));
