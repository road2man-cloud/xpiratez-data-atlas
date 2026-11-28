#!/usr/bin/env node
'use strict';
/**
 * R36HW N8 — original-body-based skirt/shorts hem-to-leg surface retouch,
 * smooth existing front-fold vertices and subdivide a small high-curvature patch.
 * Still not complete garment removal; this is a geometric, not photographic, remodel.
 * All work is in original GLB space; NO R36JB substitution.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const IN=process.argv[2]||path.resolve(__dirname,'../../r36hw-n6-surface-rebase-20261128/output/R36HW_N6_REBASED_SURFACE.glb');
const OUT=process.argv[3]||path.resolve(__dirname,'../output/R36HW_N8_SOFT_LEGFIT.glb');
const AUDIT=process.argv[4]||path.resolve(__dirname,'../reports/R36HW_N8_SOFT_LEGFIT.json');
const EXPECT='f03169cc12dc53e8304238543dc5f8f5d28274f76ad64102cfa91d44e7a9e041';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(IN);
if(sha(bytes)!==EXPECT)throw Error('R36HW N6 SHA mismatch: '+sha(bytes));
if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('GLB header invalid');
const jlen=bytes.readUInt32LE(12),g=JSON.parse(bytes.toString('utf8',20,20+jlen)),boff=20+jlen;
if(bytes.toString('ascii',boff+4,boff+8)!=='BIN\0')throw Error('GLB BIN missing');
const origBin=bytes.subarray(boff+8,boff+8+bytes.readUInt32LE(boff));
const counts={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},width={5121:1,5123:2,5125:4,5126:4};
function read(id){
 const a=g.accessors[id];if(!a||a.sparse)throw Error('Unsupported accessor '+id);
 const vw=g.bufferViews[a.bufferView],dim=counts[a.type],bpc=width[a.componentType];
 const pos=(vw.byteOffset||0)+(a.byteOffset||0),stride=vw.byteStride||dim*bpc;
 const data=[];
 for(let i=0;i<a.count;i++){
  let row=[];for(let k=0;k<dim;k++){const q=pos+i*stride+k*bpc;
   row.push(a.componentType===5126?origBin.readFloatLE(q):a.componentType===5125?origBin.readUInt32LE(q):a.componentType===5123?origBin.readUInt16LE(q):origBin.readUInt8(q));
  }data.push(row);
 }
 return data;
}
if(g.meshes.length!==1||g.meshes[0].primitives.length!==10||g.skins[0].joints.length!==63)throw Error('Unexpected N6 rig/primitives');
const ps=g.meshes[0].primitives,shorts=ps[3],skin=ps[6],c=shorts.attributes;
const p=read(c.POSITION),oldPos=p.map(v=>v.slice()),oldNormal=read(c.NORMAL),joints=read(c.JOINTS_0),weights=read(c.WEIGHTS_0),colors=read(c.COLOR_0),uv=read(c.TEXCOORD_0);
const idx=read(shorts.indices).map(v=>v[0]);
const origTriangles=ps.reduce((n,t)=>n+g.accessors[t.indices].count/3,0);
if(origTriangles!==2080||p.length!==174||idx.length!==344*3)throw Error('Unexpected N6 geometry counts');
const skinPos=read(skin.attributes.POSITION),skinIndex=read(skin.indices).map(v=>v[0]);
const srcRanges=skin.extras.ranges;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
const gaussian=(v,m,s)=>Math.exp(-.5*((v-m)/s)**2);
function contour(side){
 const name=side>0?'L leg below shorts':'R leg below shorts';
 const rg=srcRanges.find(x=>x.name===name);
 if(!rg)throw Error('No original bare-leg boundary: '+name);
 const inds=[...new Set(skinIndex.slice(rg.startTriangle*3,(rg.startTriangle+rg.triangles)*3))];
 const cx=side*.090,cy=-.031,pts=inds.map(i=>skinPos[i]).filter(v=>Math.abs(v[2]-.815)<.002&&Math.hypot(v[0]-cx,v[1]-cy)>.044);
 if(pts.length!==7)throw Error('Source leg outer ring topology differs: '+side+' count='+pts.length);
 return pts.map(v=>({ang:Math.atan2(v[1]-cy,v[0]-cx),p:v})).sort((a,b)=>a.ang-b.ang);
}
const rings={1:contour(1),'-1':contour(-1)};
function targetRing(v){
 const s=v[0]>=0?1:-1,ring=rings[s],cx=s*.090,cy=-.031;
 let a=Math.atan2(v[1]-cy,v[0]-cx);
 if(a<ring[0].ang)a+=Math.PI*2;
 for(let i=0;i<ring.length;i++){
  const l=ring[i],r=i+1<ring.length?ring[i+1]:{ang:ring[0].ang+2*Math.PI,p:ring[0].p};
  if(a>=l.ang-1e-10&&a<=r.ang+1e-10){const f=clamp((a-l.ang)/(r.ang-l.ang||1));
   return [0,1,2].map(k=>l.p[k]*(1-f)+r.p[k]*f);
  }
 }
 throw Error('Could not project hem vertex');
}
const seamIds=[],hemMoves=[];
for(let i=0;i<p.length;i++){
 const v=p[i];const z=v[2];
 if(z>.872||z<.800)continue;
 const f=z<=.806?1:1-smooth((z-.806)/.065);
 if(f<=0)continue;
 const target=targetRing(v);
 // Original lower edge is z=.803 while the actual visible-leg rim starts at z=.815.
 const orig=v.slice();
 // Original-HW silhouette lock: a per-vertex displacement cannot exceed 11.5mm.
 // Wider 72mm corrections observed in the first prototype destroy thigh proportions.
 const delta=target.map((t,a)=>f*(t-v[a]));
 const magnitude=Math.hypot(...delta),limit=.022;
 const bounded=magnitude>limit?limit/magnitude:1;
 for(let a=0;a<3;a++)v[a]+=delta[a]*bounded;
 const d=Math.hypot(...v.map((k,a)=>k-orig[a]));
 if(d>1e-8){hemMoves.push({i,delta:d,zOriginal:z});if(z<=.806)seamIds.push(i)}
}
// Build adjacency once from actual N6 connected mesh; smooth only protected anterior areas.
const adj=Array.from({length:p.length},()=>new Set());
for(let n=0;n<idx.length;n+=3){const [a,b,c]=idx.slice(n,n+3);
 for(const [u,v] of [[a,b],[b,c],[c,a]]){adj[u].add(v);adj[v].add(u)}
}
function frontalMask(v){
 const [x,y,z]=v;
 return clamp((1-smooth((Math.abs(x)-.070)/.089))*smooth((z-.829)/.038)*(1-smooth((z-.985)/.053))*(1-smooth((y+.02)/.102)),0,1);
}
for(let turn=0;turn<3;turn++){
 const next=p.map(v=>v[1]);
 for(let i=0;i<p.length;i++){
  const m=frontalMask(p[i]);if(m<.001||adj[i].size<3)continue;
  const q=[...adj[i]];
  // Bilateral filter reduces accidental triangle spikes while not flattening main folds.
  let sw=0,ty=0;for(const j of q){
   const dz=(p[i][2]-p[j][2])/.050,dx=(p[i][0]-p[j][0])/.063;
   const weight=Math.exp(-.5*(dx*dx+dz*dz));
   sw+=weight;ty+=p[j][1]*weight;
  }
  if(sw>1e-6)next[i]+=.37*m*(ty/sw-p[i][1]);
 }
 for(let i=0;i<p.length;i++)p[i][1]=next[i];
}
// Add continuous, shallow non-photometric curved fold that is evaluated at every vertex.
function feature(v){
 const [x,y,z]=v,mask=frontalMask(v),shift=-.006+.006*Math.sin((z-.846)*16);
 const core=gaussian(x,shift,.016)*gaussian(z,.888,.062);
 const left=gaussian(x,shift-.032,.016)*gaussian(z,.889,.062);
 const right=gaussian(x,shift+.030,.016)*gaussian(z,.898,.057);
 return mask*(.0024*core-.0012*left-.0010*right);
}
// Broader, area-weighted relaxation of garment-derived angular facets.
 // Keep the source leg rim fixed and limit smoothing to anterior surface.
 for(let turn=0;turn<4;turn++){
   const ny=p.map(v=>v[1]);
   for(let i=0;i<p.length;i++){
     const v=p[i],z=v[2],m=frontalMask(v);
     const upper=smooth((z-.811)/.077)*(1-smooth((z-.972)/.066));
     const a=Math.max(m*.41,upper*.25*(1-smooth((v[1]+.049)/.109)));
     if(a<.001||adj[i].size<3)continue;
     let sum=0,sw=0;
     for(const id of adj[i]) {
       const q=p[id],dist2=((v[0]-q[0])/.09)**2+((z-q[2])/.09)**2;
       const w=Math.exp(-1.1*dist2);
       sum+=w*q[1];sw+=w;
     }
     if(sw>1e-5)ny[i]+=.23*a*(sum/sw-v[1]);
   }
   for(let i=0;i<p.length;i++)p[i][1]=ny[i];
 }
const baseY=p.map(v=>v[1]);
for(let i=0;i<p.length;i++)p[i][1]+=feature(p[i]);
// Spend 18 of 20 remaining polygons precisely in the front fold rather than globally.
const candidates=[];
for(let t=0;t<idx.length;t+=3){
 const ids=idx.slice(t,t+3),center=[0,1,2].map(k=>ids.reduce((s,i)=>s+p[i][k],0)/3);
 const m=frontalMask(center),g=feature(center);
 if(m>.25&&Math.abs(center[0])<.086&&center[2]>.842&&center[2]<.984&&center[1]<-.029){
  const ys=ids.map(i=>p[i][1]),xz=ids.map(i=>p[i]);
  const area=Math.hypot(...cross(xz[1].map((v,k)=>v-xz[0][k]),xz[2].map((v,k)=>v-xz[0][k])))*.5;
  const score=area*(.6+17*Math.abs(g))+Math.max(...ys)-Math.min(...ys);
  candidates.push({t:t/3,ids,center,score});
 }
}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
const selected=candidates.sort((a,b)=>b.score-a.score).slice(0,9).sort((a,b)=>a.t-b.t);
if(selected.length!==9)throw Error('No 9 suitable triangles for local patch: '+selected.length);
const sel=new Map(selected.map(x=>[x.t,x])),nextIdx=[];
function centroid(rows,ids){return Array.from({length:rows[0].length},(_,k)=>ids.reduce((s,i)=>s+rows[i][k],0)/3)}
function boneMean(ids){
 const agg=new Map();for(const i of ids)for(let k=0;k<4;k++){
  const bone=joints[i][k],wt=weights[i][k]/3;agg.set(bone,(agg.get(bone)||0)+wt);
 }
 const top=[...agg].sort((a,b)=>b[1]-a[1]).slice(0,4),tot=top.reduce((a,b)=>a+b[1],0)||1;
 return {joints:Array.from({length:4},(_,k)=>top[k]?.[0]||0),weights:Array.from({length:4},(_,k)=>(top[k]?.[1]||0)/tot)};
}
const added=[];
for(let t=0;t<idx.length/3;t++){
 const ids=idx.slice(t*3,t*3+3);
 if(!sel.has(t)){nextIdx.push(...ids);continue}
 const center=centroid(p,ids),index=p.length,bn=boneMean(ids);
 // A gentle true inset, not a displacement-only texture.
 const fine=feature(center),parent=ids.reduce((s,i)=>s+feature(p[i]),0)/3;
 center[1]+=fine-parent;
 p.push(center);oldNormal.push(centroid(oldNormal,ids));joints.push(bn.joints);
 weights.push(bn.weights);colors.push(centroid(colors,ids));uv.push(centroid(uv,ids));
 nextIdx.push(ids[0],ids[1],index,ids[1],ids[2],index,ids[2],ids[0],index);
 added.push({triangle:t,vertex:index,extraY:fine-parent});
}
const outTriangles=origTriangles+2*selected.length;
if(outTriangles!==2098)throw Error('Unexpected budget '+outTriangles);
// Area-weighted normals for the full affected primitive, with the original orientation preserved.
const accum=Array.from({length:p.length},()=>[0,0,0]),faceAreas=[];
for(let t=0;t<nextIdx.length;t+=3){
 const ids=nextIdx.slice(t,t+3),a=p[ids[0]],b=p[ids[1]],c=p[ids[2]];
 const nn=cross(b.map((v,k)=>v-a[k]),c.map((v,k)=>v-a[k]));
 faceAreas.push(Math.hypot(...nn)*.5);
 for(const i of ids)for(let j=0;j<3;j++)accum[i][j]+=nn[j];
}
function norm(v){const len=Math.hypot(...v)||1;return v.map(q=>q/len)}
const normals=accum.map((a,i)=>{
 let nn=norm(a),old=norm(oldNormal[i]);
 if(nn.reduce((s,v,j)=>s+v*old[j],0)<0)nn=nn.map(v=>-v);
 return norm(nn.map((v,j)=>.79*v+.21*old[j]));
});
// Append replacement shorts POSITION/NORMAL, skinning, color, UV and triangle index buffers.
const chunks=[Buffer.from(origBin)];
function align(){const length=chunks.reduce((s,b)=>s+b.length,0);if(length%4)chunks.push(Buffer.alloc(4-length%4))}
function append(rows,type,ctype,target=34962,normalized=false){
 align();const off=chunks.reduce((s,b)=>s+b.length,0),sz=width[ctype],dim=counts[type],data=Buffer.alloc(rows.length*dim*sz);
 for(let i=0;i<rows.length;i++)for(let j=0;j<dim;j++){
  const v=rows[i][j],q=(i*dim+j)*sz;
  if(!Number.isFinite(v))throw Error('Nonfinite accessor');
  if(ctype===5126)data.writeFloatLE(v,q);else if(ctype===5123)data.writeUInt16LE(Math.round(v),q);else if(ctype===5125)data.writeUInt32LE(Math.round(v),q);else data.writeUInt8(clamp(Math.round(v),0,255),q);
 }
 chunks.push(data);const view=g.bufferViews.push({buffer:0,byteOffset:off,byteLength:data.length,target})-1;
 const attr={bufferView:view,componentType:ctype,count:rows.length,type};if(normalized)attr.normalized=true;
 if(type==='VEC3'&&ctype===5126){attr.min=[0,1,2].map(k=>Math.min(...rows.map(v=>v[k])));attr.max=[0,1,2].map(k=>Math.max(...rows.map(v=>v[k])))}
 return g.accessors.push(attr)-1;
}
const rows={POSITION:p,NORMAL:normals,JOINTS_0:joints,WEIGHTS_0:weights,COLOR_0:colors,TEXCOORD_0:uv};
for(const name of Object.keys(rows)){
 const old=g.accessors[c[name]];
 c[name]=append(rows[name],old.type,old.componentType,34962,!!old.normalized);
}
shorts.indices=append(nextIdx.map(i=>[i]),'SCALAR',5123,34963);
g.accessors[shorts.indices].min=[0];g.accessors[shorts.indices].max=[p.length-1];
shorts.extras={...shorts.extras,stage:'R36HW_N8_CONTINUOUS_SOFT_LEG_FIT',deformedHem:true,smoothedOriginalShortsVertices:174,addedSplitVertices:9,notCompletedUndressing:true};
align();const bin=Buffer.concat(chunks);g.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(g)),jpad=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(jpad);
const final=Buffer.alloc(20+jpad.length+8+bin.length);
final.write('glTF',0);final.writeUInt32LE(2,4);final.writeUInt32LE(final.length,8);
final.writeUInt32LE(jpad.length,12);final.write('JSON',16);jpad.copy(final,20);
const chunkAt=20+jpad.length;final.writeUInt32LE(bin.length,chunkAt);final.write('BIN\0',chunkAt+4,'ascii');bin.copy(final,chunkAt+8);
fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.mkdirSync(path.dirname(AUDIT),{recursive:true});
fs.writeFileSync(OUT,final);
const delta=p.slice(0,oldPos.length).map((v,i)=>Math.hypot(...v.map((x,k)=>x-oldPos[i][k])));
const audit={stage:'R36HW N8 continuous soft leg-fit and curvature relaxation',inputSha256:sha(bytes),outputSha256:sha(final),trianglesBefore:origTriangles,trianglesAfter:outTriangles,sourceBareLegLoops:2,sourceBareLegLoopVertices:14,hemVerticesModified:hemMoves.length,hemBoundarySourceIndices:seamIds,hemMaxMovementMeters:Math.max(...hemMoves.map(x=>x.delta)),originalPantsVertices:oldPos.length,outputPantsVertices:p.length,frontCoreTrianglesSplit:selected.map(x=>x.t),extraTriangles:2*selected.length,allPantsVertexMaxMovementMeters:Math.max(...delta),faceTrianglesUnchanged:644,hairTrianglesUnchanged:294,skinJoints:g.skins[0].joints.length,triangleAreaMinSqMeters:Math.min(...faceAreas),triangleAreaMaxSqMeters:Math.max(...faceAreas),originalEmbeddedBINBytes:origBin.length,limitations:['Still a clothing-derived closed pelvic shell; full surface replacement not claimed','Single-photo guidance defines only relative front fold shape','UV maps remain clothing-derived on this shell','No native S2 material or 63-bone motion captured']};
fs.writeFileSync(AUDIT,JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({output:OUT,report:AUDIT,triangles:outTriangles,hemVertices:hemMoves.length,splits:selected.length,sha256:audit.outputSha256}));
