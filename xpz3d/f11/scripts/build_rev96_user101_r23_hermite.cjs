'use strict';
/**
 * XPZ3D F11 rev96 USER101 r23 native pelvic retopology.
 * Input is immutable SHA-pinned r22 Dome. Removes the duplicate internal
 * core backing and 182 side-wall faces that over-subscribe 58 seams,
 * removes the 6 conflicting side-strip triangles (source p22), reshapes
 * the generated continuous r22 collar to avoid inverse-Z curvature,
 * and fills only traced skin-boundary loops in the pelvic ROI.
 *
 * Geometry patches are stitched in rest POSITION and morph POSITION
 * across separate glTF material primitives; they do not share primitive
 * index buffers. Reports virtual welded skin union, never falsely says
 * the whole body is watertight.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const src='r21AO-F11-user101-native-skin-bowl-r22-dome.glb';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const refHash='15451f69e5c9e6041463ad15ce8668939a3f604c14ce65e5d601fdd3ceb1cb41';
const snapHash='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5';
const variant='hermite';
const dest='r21AO-F11-user101-native-retopo-r23-hermite.glb';
const audit='REV96_USER101_R23_BUILD_HERMITE.json';
for(const x of [dest,audit])if(fs.existsSync(path.join(root,x)))throw Error('Refusing overwrite '+x);
const raw=fs.readFileSync(path.join(root,src));
if(sha(raw)!==refHash)throw Error('r22 Dome SHA mismatch');
const snapRaw=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(snapRaw)!==snapHash)throw Error('Canonical manual trim changed');
const snap=JSON.parse(snapRaw);
if(snap.deletedFaces.length!==101||snap.positions.length!==754||Object.keys(snap.controls).length!==106)throw Error('Manual input cardinality mismatch');
const jl=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+jl));
let bin=Buffer.from(raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl)));
const ps=doc.meshes[0].primitives,D={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},SZ={5121:1,5123:2,5125:4,5126:4},OP={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
if(ps.length!==24||doc.skins[0].joints.length!==63)throw Error('Unexpected source mesh or rig');
function read(i){
 const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],n=D[a.type],s=SZ[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),st=v.byteStride||n*s,arr=[];
 for(let k=0;k<a.count;k++){const row=[];for(let j=0;j<n;j++)row.push(bin[OP[a.componentType]](off+k*st+j*s));arr.push(n===1?row[0]:row);}
 return arr;
}
const copy=v=>Array.isArray(v)?v.slice():v;
function load(p){
 return {p,a:Object.fromEntries(Object.entries(p.attributes).map(([k,id])=>[k,read(id)])),
 m:Object.fromEntries(Object.entries(p.targets[0]).map(([k,id])=>[k,read(id)])),I:read(p.indices)};
}
const B=load(ps[0]),C=load(ps[13]),K=load(ps[23]);
const originalCoreA=C.a.POSITION.slice(0,908).map(copy),originalCoreM=C.m.POSITION.slice(0,908).map(copy);
const originalBody=JSON.stringify(B.a.POSITION), originalBodyIndex=JSON.stringify(B.I);
if(C.I.length!==2024*3||K.I.length!==144*3||C.a.POSITION.length!==2268)throw Error('Unexpected r22 core/collar topology');
const originalCoreOuter=C.I.slice(0,921*3);
C.I=originalCoreOuter;
const sideStrip=ps[22],oldSideStripFaces=doc.accessors[sideStrip.indices].count/3;
if(oldSideStripFaces!==6)throw Error('Unrecognized redundant 6-face strip');
// Source p22 is the extra conflicting surface; after removal source p23 becomes p22.
ps.splice(22,1);
const sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,t)=>a.map(x=>x*t),mix=(a,b,t)=>Array.isArray(a)?a.map((x,i)=>x*(1-t)+b[i]*t):a*(1-t)+b*t;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=v=>Math.hypot(...v),norm=v=>mul(v,1/(length(v)||1));
const smoother=t=>t*t*(3-2*t);
const cols=19,frontIDs=Array.from({length:cols},(_,i)=>1041+i);
const rearIDs=[908,914,915,909,916,917,910,918,919,29,920,921,911,922,923,912,924,925,913];
const oldSlope={core:[.18,.36,.5],collar:[.5,.66,.82,.93,1]};
function contour(t,col,version='r23'){
 const f=C.a.POSITION[frontIDs[col]],b=B.a.POSITION[rearIDs[col]],x=2*col/(cols-1)-1,edge=Math.pow(Math.abs(x),1.7),T=smoother(t);
 if(version==='r22')return [
  mix(f[0],b[0],T)+Math.sign(x)*.015*Math.pow(Math.sin(Math.PI*t),1.3)*edge,
  mix(f[1],b[1],T)+.001*Math.sin(2*Math.PI*t)*(1-x*x),
  mix(f[2],b[2],T)+.021*Math.pow(Math.sin(Math.PI*t),1.4)*(1-.28*x*x)];
 // Monotone longitudinal interpolation: t in [0,1] and original Fz>= Bz.
 // This removes the humped reverse curvature and shoulder-like wings.
 const amp=variant==='soft'?.0008:.0016;
 return [mix(f[0],b[0],T)+Math.sign(x)*.0025*Math.pow(Math.sin(Math.PI*t),2)*edge,
         mix(f[1],b[1],T)+.00035*Math.sin(2*Math.PI*t)*(1-x*x),
         mix(f[2],b[2],t)+amp*Math.pow(Math.sin(Math.PI*t),2)*(1-.28*x*x)];
}
const assigned=new Set(),mapping=[];
for(const t of oldSlope.collar)for(let col=0;col<cols;col++){
 const expected=contour(t,col,'r22');let min=Infinity,best=-1;
 for(let j=0;j<K.a.POSITION.length;j++)if(!assigned.has(j)){let d=length(sub(expected,K.a.POSITION[j]));if(d<min){min=d;best=j;}}
 if(min>5e-5||best<0)throw Error('Cannot reconstruct original r22 collar grid t='+t+' col='+col+' distance='+min);
 assigned.add(best);mapping.push({t,col,id:best});
}
if(assigned.size!==95)throw Error('Bad recovered collar grid cardinality '+assigned.size);
const unmodifiedOriginalCoreCount=908;
for(let row=0;row<oldSlope.core.length;row++)for(let col=0;col<cols;col++){
 const id=1077+row*cols+col,t=oldSlope.core[row];
 C.a.POSITION[id]=contour(t,col).map(Math.fround);
}
for(const {t,col,id} of mapping)K.a.POSITION[id]=contour(t,col).map(Math.fround);
// Keep the exact pose displacement on each generated vertex.
// The two primitives' .5 row must agree in both POSITION and morph POSITION.
for(let col=0;col<cols;col++){
 const id=1077+2*cols+col,other=mapping.find(x=>x.t===.5&&x.col===col).id;
 if(length(sub(C.a.POSITION[id],K.a.POSITION[other]))>1e-7||length(sub(C.m.POSITION[id],K.m.POSITION[other]))>1e-7)throw Error('New core/collar seam mismatch '+col);
}
for(const {t,col,id} of mapping)if(t===1)if(length(sub(K.a.POSITION[id],B.a.POSITION[rearIDs[col]]))>1e-7||length(sub(K.m.POSITION[id],B.m.POSITION[rearIDs[col]]))>1e-7)throw Error('New body rim mismatch');
function normals(A,I){const arr=A.map(()=>[0,0,0]);for(let k=0;k<I.length;k+=3){const [a,b,c]=I.slice(k,k+3),n=cross(sub(A[b],A[a]),sub(A[c],A[a]));for(const v of [a,b,c])arr[v]=add(arr[v],n);}return arr.map(norm);}
function refresh(thing,first){
 const rest=normals(thing.a.POSITION,thing.I),pose=normals(thing.a.POSITION.map((p,i)=>add(p,thing.m.POSITION[i])),thing.I);
 for(let j=first;j<thing.a.POSITION.length;j++) {thing.a.NORMAL[j]=rest[j];thing.m.NORMAL[j]=sub(pose[j],rest[j]);}
}
refresh(C,908);refresh(K,0);
// Virtual weld across the material primitives uses both rest and morph to
// keep face sides connected in all supported poses.
const roi=[0,13,17,18,21,22];
const arrays=new Map(roi.map(pi=>[pi,pi===0?B:pi===13?C:pi===22?K:load(ps[pi])]));
const vMap=new Map(),V=[],faces=[];
function remap(pi,id){
 const part=arrays.get(pi),p=part.a.POSITION[id],m=part.m.POSITION[id],key=[...p,...m].map(x=>Math.round(x*1e5)).join(',');
 let v=vMap.get(key);if(v===undefined){v=V.length;vMap.set(key,v);V.push({position:p,morph:m,source:[]});}
 V[v].source.push({pi,id});return v;
}
for(const pi of roi){const part=arrays.get(pi),map=new Map();
 for(let j=0;j<part.I.length;j+=3) {
  const ix=part.I.slice(j,j+3).map(id=>{if(!map.has(id))map.set(id,remap(pi,id));return map.get(id)});
  if(new Set(ix).size!==3)throw Error('Collapsed original triangle in virtual atlas '+pi+' '+j/3);
  faces.push({pi,face:j/3,idx:ix});
 }}
function emap(all){
 const E=new Map();
 for(const f of all)for(const [a,b]of[[f.idx[0],f.idx[1]],[f.idx[1],f.idx[2]],[f.idx[2],f.idx[0]]]){
  const key=a<b?a+':'+b:b+':'+a;
  let r=E.get(key);if(!r){r={a,b,refs:[]};E.set(key,r);}
  r.refs.push({pi:f.pi,face:f.face,dir:a<b?1:-1});
 }
 return E;
}
const E=emap(faces),bad=[...E.values()].filter(e=>e.refs.length>2),wrong=[...E.values()].filter(e=>e.refs.length===2&&e.refs[0].dir===e.refs[1].dir);
if(bad.length||wrong.length)throw Error('Pre-patch virtual union nonmanifold '+bad.length+' misoriented '+wrong.length);
const border=[...E.values()].filter(e=>e.refs.length===1),inmap=new Map(),outmap=new Map();
for(let i=0;i<border.length;i++){
 const e=border[i];
 if(!inmap.has(e.b))inmap.set(e.b,[]);
 inmap.get(e.b).push(i);
 if(!outmap.has(e.a))outmap.set(e.a,[]);
 outmap.get(e.a).push(i);
}
const transitions=new Map();
for(const v of new Set([...inmap.keys(),...outmap.keys()])){
 const ins=inmap.get(v)||[],outs=outmap.get(v)||[];
 if(ins.length!==outs.length)throw Error('Mismatched incoming/outgoing virtual boundary degree '+v);
 const n=ins.length;
 function best(used=[],score=0) {
  if(used.length===n)return{used,score};
  let result=null;
  for(let j=0;j<n;j++)if(!used.includes(j)){
   const iv=border[ins[used.length]],ov=border[outs[j]];
   const travel=norm(sub(V[v].position,V[iv.a].position)),leaving=norm(sub(V[ov.b].position,V[v].position));
   const test=best([...used,j],score+travel.reduce((s,x,i)=>s+x*leaving[i],0));
   if(!result||test.score>result.score)result=test;
  }
  return result;
 }
 const bestPair=best();
 for(let k=0;k<n;k++)transitions.set(ins[k],outs[bestPair.used[k]]);
}
const visited=new Set(),rawLoops=[];
for(let start=0;start<border.length;start++){
 if(visited.has(start))continue;
 const vs=[],edges=[],seen=new Set();let cur=start,steps=0;
 while(!visited.has(cur)&&steps++<=border.length){
  visited.add(cur);seen.add(cur);vs.push(border[cur].a);edges.push(cur);cur=transitions.get(cur);
  if(cur===undefined)throw Error('Open border tracing failed');
 }
 if(cur!==start)throw Error('Boundary branch does not close');
 rawLoops.push({vs,edges});
}
function splitLoop(l){
 for(let i=0;i<l.vs.length;i++)for(let j=i+1;j<l.vs.length;j++)if(l.vs[i]===l.vs[j]){
  return [...splitLoop({vs:l.vs.slice(i,j),edges:l.edges.slice(i,j)}),
          ...splitLoop({vs:l.vs.slice(j).concat(l.vs.slice(0,i)),edges:l.edges.slice(j).concat(l.edges.slice(0,i))})];
 }
 return [l];
}
const loops=rawLoops.flatMap(splitLoop);
if(loops.reduce((x,l)=>x+l.edges.length,0)!==border.length)throw Error('Boundary conservation failure');
const stats=[];
const skin=JSON.parse(JSON.stringify(ps[22]));
skin.extras={name:'r23-pelvic-native-curved-hole-repair',type:'connected-skin-continuation',skinReplacement:true,layer:'skin',sourceRevision:'r22-dome',materialBoundarySharedByPositionMorph:true,notIndexWeldedAcrossPrimitives:true};
skin.material=5;
const surface={p:skin,a:Object.fromEntries(Object.keys(K.a).map(k=>[k,[]])),m:Object.fromEntries(Object.keys(K.m).map(k=>[k,[]])),I:[]};
const midpoint=(arr)=>arr[0].map((x,k)=>arr.reduce((sum,z)=>sum+z[k],0)/arr.length);
function skinPoint(v){
 const srcs=V[v].source.slice().sort((a,b)=>{
  const rank={22:0,17:1,18:1,21:2,0:3,13:4};return(rank[a.pi]??8)-(rank[b.pi]??8);
 });
 const {pi,id}=srcs[0],part=arrays.get(pi);
 return {a:Object.fromEntries(Object.keys(K.a).map(k=>[k,copy(part.a[k][id])])),
 m:Object.fromEntries(Object.keys(K.m).map(k=>[k,copy(part.m[k][id])]))};
}
function register(v){
 const id=surface.a.POSITION.length;
 for(const [k,a]of Object.entries(surface.a))a.push(copy(v.a[k]));
 for(const [k,a]of Object.entries(surface.m))a.push(copy(v.m[k]));
 return id;
}
function mergeJointBlend(vs,ws){
 const sum=new Map();
 for(let k=0;k<vs.length;k++)for(let j=0;j<4;j++){
  const bone=vs[k].a.JOINTS_0[j];
  sum.set(bone,(sum.get(bone)||0)+vs[k].a.WEIGHTS_0[j]*ws[k]);
 }
 const top=[...sum].sort((a,b)=>b[1]-a[1]).slice(0,4),total=top.reduce((s,x)=>s+x[1],0)||1;
 return {j:Array.from({length:4},(_,i)=>top[i]?.[0]||0),w:Array.from({length:4},(_,i)=>(top[i]?.[1]||0)/total)};
}
function interpolate(vs,ws){
 const jw=mergeJointBlend(vs,ws);
 const a={},m={};
 for(const k of Object.keys(K.a)){
  if(k==='JOINTS_0')a[k]=jw.j;
  else if(k==='WEIGHTS_0')a[k]=jw.w;
  else {const first=vs[0].a[k];a[k]=Array.isArray(first)?first.map((_,j)=>vs.reduce((s,v,i)=>s+v.a[k][j]*ws[i],0)):vs.reduce((s,v,i)=>s+v.a[k]*ws[i],0);}
 }
 for(const k of Object.keys(K.m)){
  const first=vs[0].m[k];m[k]=Array.isArray(first)?first.map((_,j)=>vs.reduce((s,v,i)=>s+v.m[k][j]*ws[i],0)):vs.reduce((s,v,i)=>s+v.m[k]*ws[i],0);
 }
 return {a,m};
}
const repaired=[],untouched=[];
for(let q=0;q<loops.length;q++){
 const l=loops[q],P=l.vs.map(id=>V[id].position),minZ=Math.min(...P.map(p=>p[2])),maxZ=Math.max(...P.map(p=>p[2]));
 const mid=midpoint(P),maxRadius=Math.max(...P.map(p=>length(sub(p,mid))));
 // Restrict r23 repair to the original pelvic region: unrelated
 // torso/leg/neck/upper-body apertures stay intentionally untouched.
 const pelvic=minZ>.69&&maxZ<1.08&&Math.abs(mid[0])<.13;
 if(!pelvic){untouched.push({loop:q,count:l.vs.length,minZ,maxZ});continue;}
 const n=l.vs.length,anchors=l.vs.map(skinPoint),centroid=interpolate(anchors,Array(n).fill(1/n));
 // Geometric center is the average of 3D boundary not the body origin.
 centroid.a.POSITION=mid.slice(); if(n>=30)centroid.a.POSITION[2]+=0.028; centroid.m.POSITION=midpoint(anchors.map(v=>v.m.POSITION));
 const fine=n>=10; const ringTs=fine?[.10,.25,.42,.59,.76,.90]:n>=7?[.43,.77]:n===4?[.55]:[];
 const rings=[anchors.map(register)];
 for(const t of ringTs){const row=[];
  for(let j=0;j<n;j++){
   const a=interpolate([anchors[j],centroid],[1-t,t]);
   // Smoothly round the cap while remaining tangent at boundary.
   // Lift peaks only a fraction of loop span to avoid sheet-like fins.
   const near=anchors[j].a.NORMAL,dir=sub(centroid.a.POSITION,anchors[j].a.POSITION);
   const tangent=sub(dir,mul(near,near.reduce((s,x,k)=>s+x*dir[k],0)));
   const h00=2*t*t*t-3*t*t+1,h10=t*t*t-2*t*t+t,h01=-2*t*t*t+3*t*t;
   a.a.POSITION=add(add(mul(anchors[j].a.POSITION,h00),mul(tangent,1.15*h10)),mul(centroid.a.POSITION,h01));
   a.m.POSITION=mix(anchors[j].m.POSITION,centroid.m.POSITION,smoother(t));
   row.push(register(a));
  }
  rings.push(row);
 }
 const centerID=register(centroid);
 for(let ri=0;ri<rings.length-1;ri++)for(let i=0;i<n;i++){
  const j=(i+1)%n,a=rings[ri][i],b=rings[ri][j],c=rings[ri+1][i],d=rings[ri+1][j];
  surface.I.push(b,a,c,b,c,d);
 }
 const last=rings.at(-1);
 for(let i=0;i<n;i++)surface.I.push(last[(i+1)%n],last[i],centerID);
 repaired.push({loop:q,edges:n,newFaces:n*(2*(rings.length-1)+1),center:mid,range:[minZ,maxZ],rings:rings.length,materials:[...new Set(l.edges.map(k=>border[k].refs[0].pi))]});
}
if(repaired.length<7||untouched.length<5)throw Error('Unexpected repair loop classification '+repaired.length+'/'+untouched.length);
refresh(surface,0);
// Check no degenerate local skin triangles in both rest and 55deg morph pose.
function triArea(P,I){let zero=0,min=Infinity;for(let j=0;j<I.length;j+=3){const [a,b,c]=I.slice(j,j+3),area=length(cross(sub(P[b],P[a]),sub(P[c],P[a])))/2;min=Math.min(min,area);if(area<1e-10)zero++;}return{zero,min};}
const restQ=triArea(surface.a.POSITION,surface.I);
const morphQ=triArea(surface.a.POSITION.map((p,i)=>add(p,surface.m.POSITION[i])),surface.I);
if(restQ.zero||morphQ.zero)throw Error('Degenerate new patch triangles '+JSON.stringify({restQ,morphQ}));
const rr=surface.a.POSITION.length;
if(rr>65535)throw Error('Too many patch vertices');
function writeRows(rows,template){
 const ac=doc.accessors[template],n=D[ac.type],size=SZ[ac.componentType],count=rows.length,data=Buffer.alloc(count*n*size),alignment=(bin.length+3)&~3;
 for(let j=0;j<count;j++)for(let k=0;k<n;k++){
  const value=n===1?rows[j]:rows[j][k],off=(j*n+k)*size;
  if(!Number.isFinite(value))throw Error('Nonfinite new glTF value');
  if(ac.componentType===5126)data.writeFloatLE(value,off);
  else if(ac.componentType===5123)data.writeUInt16LE(value,off);
  else if(ac.componentType===5125)data.writeUInt32LE(value,off);
  else if(ac.componentType===5121)data.writeUInt8(Math.max(0,Math.min(255,Math.round(value))),off);
 }
 bin=Buffer.concat([bin,Buffer.alloc(alignment-bin.length),data]);
 const bv=doc.bufferViews.push({buffer:0,byteOffset:alignment,byteLength:data.length})-1;
 const a={bufferView:bv,componentType:ac.componentType,count,type:ac.type};
 if(ac.normalized!==undefined)a.normalized=ac.normalized;
 if(ac.min||ac.max)for(const k of ['min','max'])if(ac[k])a[k]=Array.from({length:n},(_,j)=>k==='min'?Math.min(...rows.map(v=>n===1?v:v[j])):Math.max(...rows.map(v=>n===1?v:v[j])));
 return doc.accessors.push(a)-1;
}
function writeIndices(I,template){
 if(I.length%3||I.some(v=>v<0||v>=65536))throw Error('Bad triangle indices');
 const at=(bin.length+3)&~3,data=Buffer.alloc(2*I.length);
 for(let i=0;i<I.length;i++)data.writeUInt16LE(I[i],i*2);
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),data]);
 const bv=doc.bufferViews.push({buffer:0,byteOffset:at,byteLength:data.length})-1;
 return doc.accessors.push({bufferView:bv,componentType:5123,count:I.length,type:'SCALAR',min:[Math.min(...I)],max:[Math.max(...I)]})-1;
}
for(const part of [C,K,surface]){
 for(const [k,i] of Object.entries(part.p.attributes))part.p.attributes[k]=writeRows(part.a[k],i);
 for(const [k,i] of Object.entries(part.p.targets[0]))part.p.targets[0][k]=writeRows(part.m[k],i);
 part.p.indices=writeIndices(part.I,part.p.indices);
}
C.p.extras={...C.p.extras,rev96r23InteriorBackingRemoved:true,rev96r23SideWallsRemoved:true,rev96r23OldCoreClosedFlagSuperseded:true,rev96r23NewOuterFaces:C.I.length/3};
K.p.extras={...K.p.extras,rev96r23MonotoneZFairing:true,rev96r23NativeCollarReshaped:true};
ps.push(skin);
for(const key of ['rev96r22ClosedCore','rev96r22CoreFreeEdges'])delete C.p.extras[key];
function faceKey(v){return v.slice().sort((a,b)=>a-b).join(':')}
const forbidden=new Map();
for(const d of snap.deletedFaces){if(!forbidden.has(d.primitive))forbidden.set(d.primitive,new Set());forbidden.get(d.primitive).add(faceKey(d.vertices));}
for(const [pi,set] of forbidden){
 const I=pi===13?C.I:pi===18?read(ps[18].indices):read(ps[pi].indices);
 for(let k=0;k<I.length;k+=3)if(set.has(faceKey(I.slice(k,k+3))))throw Error('Manual deleted face reintroduced '+pi+' / '+k/3);
}
if(JSON.stringify(B.a.POSITION)!==originalBody||JSON.stringify(B.I)!==originalBodyIndex)throw Error('Original body altered');
for(let i=0;i<908;i++)if(JSON.stringify(C.a.POSITION[i])!==JSON.stringify(originalCoreA[i])||JSON.stringify(C.m.POSITION[i])!==JSON.stringify(originalCoreM[i]))throw Error('Original artist core vertex altered '+i);
const triangleCount=ps.reduce((s,p)=>s+doc.accessors[p.indices].count/3,0), garmentFaces=ps.reduce((s,p)=>s+(p.extras?.layer==='garment'?doc.accessors[p.indices].count/3:0),0);
if(garmentFaces!==370||doc.skins[0].joints.length!==63)throw Error('Garment or bones changed');
for(const key of ['centralCoreTrueManifoldClosed','centralCoreBoundaryEdgeCount','rearSeamCrossPrimitiveIndexWelded'])delete doc.extras[key];
doc.extras={...doc.extras,revision:'rev96-user101-r23-'+variant,manualSnapshotSHA:snapHash,originalDeleted101Absent:true,original754ManualPositionsPreserved:true,
  pelvicRetopology:true,legacyCoreInnerBackingRemoved:true,legacyDuplicateSideWallsRemoved:true,originalSideStrip6FacesRemoved:true,
  expandedPelvicCurvedPatches:repaired.length,coreOwnShellTopologyClosed:false,wholeBodyWatertight:false,
  crossPrimitiveIndexWelded:false,restMorphVirtualUnionIntended:true,garmentFaces:370,bones:63,additionalDecimation:false,notUserApproved:true};
doc.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(doc)),jpad=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bpad=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jpad.length+8+bpad.length,8);
jh.writeUInt32LE(jpad.length,0);jh.write('JSON',4);bh.writeUInt32LE(bpad.length,0);bh.write('BIN\\0',4);
const out=Buffer.concat([head,jh,jpad,bh,bpad]);
fs.writeFileSync(path.join(root,dest),out,{flag:'wx'});
const report={schema:'xpz3d/f11/r23-native-retopology/v1',createdUTC:new Date().toISOString(),input:src,inputSHA256:refHash,file:dest,sha256:sha(out),variant,
  sourceTriangles:5107,newTriangles:triangleCount,removedCoreBackingFaces:921,removedCoreSideWalls:182,removedConflictingSideStripFaces:6,
  originalNativeBodyFacesUnchanged:true,originalArtistCore908PositionsAndMorphUnchanged:true,
  repairedPelvicCycles:repaired,unrelatedOpenLoopsPreserved:untouched,virtualBoundaryBeforeRepair:border.length,
  newPatchFaces:surface.I.length/3,restQuality:restQ,morphQuality:morphQ,originalDeletedFacesReintroduced:0,bones:63,garmentFaces,
  coreOldShellNoLongerClosed:true,materialBoundariesVirtualOnly:true,wholeBodyClosed:false,visualReview:'pending',acceptance:'candidate'};
fs.writeFileSync(path.join(root,audit),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:dest,sha256:report.sha256,newTriangles:triangleCount,patchTriangles:surface.I.length/3,
  repairedLoops:repaired.length,unrelated:untouched.length,boundaryBefore:border.length,restQ,morphQ,garmentFaces},null,2));
