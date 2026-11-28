#!/usr/bin/env node
'use strict';
/*
 * R36HW-N11: original-HW derived open pelvis surface relaxation.
 * Preserves N10 topology (1,985 total tris), R36HW face/hair, skinning and
 * open waist/leg boundaries. Applies bounded 3D positional refitting to
 * garment-origin facets, NOT a texture-only / face-normal cosmetic change.
 *
 * Base R36HW -> N9 -> N10 -> N11. No R36JB body substitution.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||path.resolve(__dirname,'../../r36hw-n10-skin-bridge-20261129/output/R36HW_N10_SKIN_BRIDGE.glb');
const output=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N11_SKIN_RELAX.glb');
const reportFile=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N11_SKIN_RELAX.json');
const expected='af56ea15d8eb9de728926c6d7c002bfd5c2825b08d9ac71b066ac0f74edfd028';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const blob=fs.readFileSync(input);if(sha(blob)!==expected)throw Error('Unexpected N10 lineage: '+sha(blob));
if(blob.toString('ascii',0,4)!=='glTF'||blob.readUInt32LE(4)!==2||blob.readUInt32LE(8)!==blob.length)throw Error('Invalid GLB header');
const jl=blob.readUInt32LE(12),g=JSON.parse(blob.toString('utf8',20,20+jl)),bh=20+jl;
if(blob.toString('ascii',bh+4,bh+8)!=='BIN\0')throw Error('Missing binary');
const bin=blob.subarray(bh+8,bh+8+blob.readUInt32LE(bh));
const parts=g.meshes[0].primitives;
const count=parts.reduce((n,p)=>n+g.accessors[p.indices].count/3,0);
if(count!==1985||parts.length!==10||g.skins[0].joints.length!==63)throw Error('N10 model changed');
const dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},sz={5121:1,5123:2,5125:4,5126:4};
function read(id){
 const a=g.accessors[id],v=g.bufferViews[a.bufferView],n=dim[a.type],s=sz[a.componentType],step=v.byteStride||n*s,base=(v.byteOffset||0)+(a.byteOffset||0);
 if(a.sparse)throw Error('Sparse GLB unsupported');
 let ret=[];for(let i=0;i<a.count;i++){let r=[];for(let j=0;j<n;j++){
  const off=base+i*step+j*s;
  r.push(a.componentType===5126?bin.readFloatLE(off):a.componentType===5125?bin.readUInt32LE(off):a.componentType===5123?bin.readUInt16LE(off):bin.readUInt8(off));
 }ret.push(r)}return ret;
}
const pelvis=parts[3],attr=pelvis.attributes,pos=read(attr.POSITION),normals=read(attr.NORMAL),index=read(pelvis.indices).map(r=>r[0]),previous=pos.map(v=>v.slice());
if(pos.length!==183||index.length!==249*3)throw Error('N10 pelvis topology changed');
const clamp=(t,a=0,b=1)=>Math.min(b,Math.max(a,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
const gauss=(v,c,r)=>Math.exp(-.5*((v-c)/r)**2);
const adj=Array.from({length:pos.length},()=>new Set());
for(let t=0;t<index.length;t+=3){
 const [a,b,c]=index.slice(t,t+3);
 for(const [i,j] of [[a,b],[b,c],[c,a]]){adj[i].add(j);adj[j].add(i)}
}
const edges=new Map();for(let t=0;t<index.length;t+=3){
 const f=index.slice(t,t+3);for(const [a,b] of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]){
  const key=a<b?a+','+b:b+','+a;edges.set(key,(edges.get(key)||0)+1);
 }
}
const boundaries=new Set([...edges].filter(e=>e[1]===1).flatMap(e=>e[0].split(',').map(Number)));
let edited=0,sideEdited=0,frontEdited=0;
function targetY(p){
 const [x,y,z]=p;
 const outward=(x/.174)**2;
 const ellipse=Math.sqrt(Math.max(.10,1-outward));
 const front=-.018-.083*ellipse,back=.013+.098*ellipse;
 const forwardWeight=1-smooth((y+.010)/.050);
 return forwardWeight*front+(1-forwardWeight)*back;
}
for(let i=0;i<pos.length;i++){
 const p=pos[i],orig=previous[i],[x,y,z]=orig;
 if(boundaries.has(i)||z<=.842||z>=1.003)continue;
 const vertical=smooth((z-.842)/.046)*(1-smooth((z-.951)/.052));
 const backOrFront=1-smooth((Math.abs(y)-.089)/.048);
 const gate=vertical*backOrFront;
 if(gate<.001)continue;
 const yIdeal=targetY(orig),drift=clamp((yIdeal-y)*.47*gate,-.014,.014);
 p[1]+=drift;
 const sideGate=smooth((Math.abs(x)-.110)/.050)*vertical;
 const safeXShift=clamp((x>0?-1:1)*.007*sideGate,-.006,.006);
 p[0]+=safeXShift;
 if(Math.abs(drift)>1e-7)frontEdited++;
 if(Math.abs(safeXShift)>1e-7)sideEdited++;
 edited++;
}
// Additional progressive vertex relaxation on the polygon fan centers, with
// original N10 boundaries protected from any movement.
for(let iteration=0;iteration<3;iteration++){
 const next=pos.map(p=>p.slice());
 for(let i=0;i<pos.length;i++){
  const p=pos[i],[x,y,z]=p;
  if(boundaries.has(i)||z<.849||z>.99||adj[i].size<3)continue;
  const gate=smooth((z-.849)/.045)*(1-smooth((z-.949)/.045));
  if(gate<.01)continue;
  let sum=0,sw=0;
  for(const id of adj[i]){
   const q=pos[id],dx=(q[0]-x)/.083,dz=(q[2]-z)/.081,w=Math.exp(-.5*(dx*dx+dz*dz));
   sum+=q[1]*w;sw+=w;
  }
  if(sw>0)next[i][1]+=gate*.33*(sum/sw-p[1]);
 }
 for(let i=0;i<pos.length;i++)pos[i]=next[i];
}
// Low amplitude analytical center groove with asymmetrical contours.
let foldVertices=0;
for(let i=0;i<pos.length;i++){
 if(boundaries.has(i))continue;
 const [x,y,z]=pos[i],fade=smooth((z-.859)/.048)*(1-smooth((z-.955)/.053))*(1-smooth((y+.045)/.070));
 const off=-.004+.004*Math.sin((z-.87)*18);
 const core=gauss(x,off,.015)*gauss(z,.891,.055);
 const borderL=gauss(x,off-.030,.015)*gauss(z,.885,.063);
 const borderR=gauss(x,off+.027,.014)*gauss(z,.895,.062);
 const d=fade*(.0022*core-.0011*borderL-.0011*borderR);
 pos[i][1]+=d;if(Math.abs(d)>1e-6)foldVertices++;
}
// Preserve R36HW N10 proportions; clamp accumulated relaxation, not only each sub-pass.
for(let i=0;i<pos.length;i++){
 const delta=pos[i].map((v,k)=>v-previous[i][k]),length=Math.hypot(...delta),limit=.015;
 if(length>limit)for(let k=0;k<3;k++)pos[i][k]=previous[i][k]+delta[k]*limit/length;
}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function unit(v){const s=Math.hypot(...v)||1;return v.map(x=>x/s)}
const acc=pos.map(()=>[0,0,0]);let minArea=Infinity;
for(let k=0;k<index.length;k+=3){
 const [i,j,h]=index.slice(k,k+3),a=pos[i],b=pos[j],c=pos[h],n=cross(b.map((q,k)=>q-a[k]),c.map((q,k)=>q-a[k])),ar=Math.hypot(...n)/2;
 minArea=Math.min(ar,minArea);
 for(const id of [i,j,h])for(let k=0;k<3;k++)acc[id][k]+=n[k];
}
const nNew=acc.map((v,i)=>{let n=unit(v),ref=unit(normals[i]);if(n.reduce((s,x,k)=>s+x*ref[k],0)<0)n=n.map(x=>-x);return unit(n.map((x,k)=>.86*x+.14*ref[k]))});
const additional=[Buffer.from(bin)];
function length(){return additional.reduce((a,b)=>a+b.length,0)}
function add(rows,type,component){
 if(length()%4)additional.push(Buffer.alloc(4-length()%4));
 const off=length(),bytes=Buffer.alloc(rows.length*dim[type]*sz[component]);
 for(let i=0;i<rows.length;i++)for(let j=0;j<dim[type];j++)bytes.writeFloatLE(rows[i][j],(i*dim[type]+j)*4);
 additional.push(bytes);
 const view=g.bufferViews.push({buffer:0,byteOffset:off,byteLength:bytes.length,target:34962})-1;
 const a={bufferView:view,componentType:component,count:rows.length,type};
 a.min=[0,1,2].map(k=>Math.min(...rows.map(v=>v[k])));
 a.max=[0,1,2].map(k=>Math.max(...rows.map(v=>v[k])));
 return g.accessors.push(a)-1;
}
attr.POSITION=add(pos,'VEC3',5126);attr.NORMAL=add(nNew,'VEC3',5126);
pelvis.extras={...pelvis.extras,stage:'N11_BOUNDARY_LOCKED_ORIGINAL_HW_FACET_RELAX',boundaryVerticesLocked:boundaries.size};
if(length()%4)additional.push(Buffer.alloc(4-length()%4));
const newBin=Buffer.concat(additional);g.buffers[0].byteLength=newBin.length;
const json=Buffer.from(JSON.stringify(g)),pad=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(pad);
const glb=Buffer.alloc(20+pad.length+8+newBin.length),bo=20+pad.length;
glb.write('glTF',0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(pad.length,12);glb.write('JSON',16);pad.copy(glb,20);
glb.writeUInt32LE(newBin.length,bo);glb.write('BIN\0',bo+4,'ascii');newBin.copy(glb,bo+8);
const move=pos.map((v,i)=>Math.hypot(...v.map((x,k)=>x-previous[i][k])));
if(Math.max(...move)>.026||minArea<1e-9)throw Error('Shape shift exceeds 26mm or degenerate face: '+Math.max(...move)+' '+minArea);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(reportFile),{recursive:true});
fs.writeFileSync(output,glb);
const report={stage:'N11 original HW boundary-locked smoothing of former garment facets',inputSHA256:sha(blob),outputSHA256:sha(glb),totalTriangles:count,rigJoints:g.skins[0].joints.length,faceTriangles:644,hairTriangles:294,pelvisTriangles:index.length/3,pelvisVertices:pos.length,lockedOpenBoundaryVertices:boundaries.size,editedVertices:edited,frontEdited,sideEdited,foldVertices,maxMovementMeters:Math.max(...move),minimumTriangleArea:minArea,fullUndress:false,nativeS2Rendered:false,limitations:['Source clothing-derived primitive topology still partly present','Unwelded midriff/leg boundaries inherited from N10','Static bind pose; no native UV/normal-map rendering or live 63-bone animation']};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({triangles:count,edited,locked:boundaries.size,maxMovement:report.maxMovementMeters,output,sha256:report.outputSHA256}));
