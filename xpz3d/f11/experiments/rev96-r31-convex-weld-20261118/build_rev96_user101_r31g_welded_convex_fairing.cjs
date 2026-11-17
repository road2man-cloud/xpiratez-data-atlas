'use strict';
/**
 * XPZ3D F11 rev96 r30a: posterior oval curvature plus topology-aware diagonal flips.
 * Derived exclusively from immutable r29f (the compact, four-hole-repaired model).
 * The 908 authored positions, 529 authored triangles, manual 101-face trim,
 * 63-bone skin, garments, external body and both anatomical openings are immutable.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceName='r21AO-F11-user101-integrated-oval-r31f-physically-welded-convex.glb';
const sourceSha='e0564deae45481fff185931c36137f6f6c07b1622cb8bd3ab143972ed0fe8cdc';
const output='r21AO-F11-user101-integrated-oval-r31g-welded-convex-fairing.glb';
const log='REV96_USER101_R31G_BUILD.json';
if([output,log].some(f=>fs.existsSync(path.join(root,f))))throw Error('Never overwrite an existing candidate');
const userBuf=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(userBuf)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('User trim history does not match');
const usr=JSON.parse(userBuf);
if(usr.deletedFaces.length!==101||usr.positions.length!==754||Object.keys(usr.controls).length!==106)throw Error('Manual counts changed');
const input=fs.readFileSync(path.join(root,sourceName));
if(sha(input)!==sourceSha)throw Error('Unexpected source model SHA');
const jl=input.readUInt32LE(12),g=JSON.parse(input.toString('utf8',20,20+jl));
let bin=Buffer.from(input.subarray(28+jl,28+jl+input.readUInt32LE(20+jl)));
const primitive=g.meshes[0].primitives,skin=primitive[23];
if(primitive.length!==24||g.skins[0].joints.length!==63||skin.material!==5||primitive[13].material!==5)throw Error('Unexpected original mesh');
const C={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},S={5121:1,5123:2,5125:4,5126:4},R={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(i){
 const a=g.accessors[i],bv=g.bufferViews[a.bufferView],n=C[a.type],sz=S[a.componentType],ofs=(bv.byteOffset||0)+(a.byteOffset||0),stride=bv.byteStride||n*sz,ret=[];
 for(let j=0;j<a.count;j++){const v=[];for(let k=0;k<n;k++)v.push(bin[R[a.componentType]](ofs+j*stride+k*sz));ret.push(n===1?v[0]:v);}
 return ret;
}
const A=Object.fromEntries(Object.entries(skin.attributes).map(([k,id])=>[k,read(id)]));
const M=Object.fromEntries(Object.entries(skin.targets[0]).map(([k,id])=>[k,read(id)]));
let I=read(skin.indices);
if(A.POSITION.length!==3466||I.length!==2861*3)throw Error('Different input topology');
const orig=I.slice(),P0=A.POSITION.map(x=>x.slice()),Q=M.POSITION.map(x=>x.slice());
const sub=(a,b)=>a.map((v,k)=>v-b[k]),add=(a,b)=>a.map((v,k)=>v+b[k]),mul=(a,x)=>a.map(v=>v*x);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),len=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const key=(a,b)=>a<b?a+':'+b:b+':'+a;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
function edges(tris){const E=new Map();for(let i=0;i<tris.length;i+=3){for(let j=0;j<3;j++){const a=tris[i+j],b=tris[i+(j+1)%3],o=tris[i+(j+2)%3],k=key(a,b);if(!E.has(k))E.set(k,[]);E.get(k).push({f:i/3,a,b,o});}}return E}
const edge0=edges(I),border0=new Set([...edge0].filter(([,e])=>e.length===1).map(([k])=>k));
const locked=new Set([...border0].flatMap(k=>k.split(':').map(Number)));
if(border0.size!==123||[...edge0.values()].some(v=>v.length>2))throw Error('Unexpected source open borders');
const neighbors=Array.from({length:P0.length},()=>new Set());
for(let i=0;i<I.length;i+=3){const [a,b,c]=I.slice(i,i+3);for(const [u,v]of[[a,b],[b,c],[c,a]]){neighbors[u].add(v);neighbors[v].add(u)}}
// Topologically welded skin is a single surface. Preserve all 2,268 source
// authored geometry slots and smooth ONLY GENERATED vertices near the 31
// connected seam edges. No separate caps or stacked skin overlays are made.
const authoredCount=2268;
for(let i=0;i<authoredCount;i++)locked.add(i);
const welded=new Set();for(let i=0;i<authoredCount;i++)if([...neighbors[i]].some(j=>j>=authoredCount))welded.add(i);
if(welded.size<25)throw Error('Authored/generated vertex weld was not found');
const depth=Array.from({length:P0.length},()=>1000),queue=[];
for(const id of welded){depth[id]=0;queue.push(id)}
for(let p=0;p<queue.length;p++){
 const id=queue[p];if(depth[id]>=7)continue;
 for(const j of neighbors[id]){if(j<authoredCount||depth[j]<=depth[id]+1)continue;depth[j]=depth[id]+1;queue.push(j)}
}
const mask=P0.map((p,i)=>{
 if(locked.has(i)||i<authoredCount||depth[i]>7)return 0;
 const [x,y,z]=p;
 return (1-smooth(3,8,depth[i]))*smooth(-.132,-.105,y)*(1-smooth(-.034,-.014,y))*(1-smooth(.042,.067,Math.abs(x)))*smooth(.821,.85,z)*(1-smooth(.950,.993,z));
});
let relaxed=P0.map(p=>p.slice());const iterations=13;
for(let pass=0;pass<iterations;pass++){
 const old=relaxed;
 relaxed=old.map((p,i)=>{
  if(mask[i]<.01)return p.slice();let count=0,avg=[0,0,0];
  for(const j of neighbors[i]){
   const q=old[j],d=len(sub(q,p));
   if(d>.033||Math.abs(q[2]-p[2])>.021)continue;
   const w=Math.exp(-Math.pow(d/.022,2));avg=add(avg,mul(q,w));count+=w;
  }
  if(count<.001)return p.slice();avg=mul(avg,1/count);
  const delta=sub(avg,p),f=.38*mask[i];return add(p,mul(delta,Math.min(f,.002/(len(delta)||1))));
 });
}
const gauss=(x,c,r)=>Math.exp(-Math.pow((x-c)/r,2));
const shape=P0.map((p,i)=>{
 if(mask[i]<.003)return [0,0,0];
 const d=sub(relaxed[i],p),rear=gauss(p[1],-.036,.028),side=gauss(Math.abs(p[0]),.022,.017);
 // convex downward bulge: the center of the longitudinal arc has lower Z.
 return [d[0],d[1],d[2]-.0036*mask[i]*rear*(.72+.28*side)];
});
function triangleNormal(pos,t){return cross(sub(pos[t[1]],pos[t[0]]),sub(pos[t[2]],pos[t[0]]))}
const posed0=P0.map((p,i)=>add(p,Q[i]));
function faultFaces(pos,ref,tri){
 const errors=[];
 for(let i=0;i<tri.length;i+=3){const v=tri.slice(i,i+3),n=triangleNormal(pos,v),old=triangleNormal(ref,v);
  if(len(n)<2e-11||dot(n,old)<-2e-13)errors.push(Math.floor(i/3));
 }return errors;
}
const factors=shape.map((v,i)=>locked.has(i)?0:1),P=P0.map(p=>p.slice());let rounds=0,lastRest=[],lastPose=[];
for(rounds=0;rounds<52;rounds++){
 for(let i=0;i<P.length;i++)P[i]=add(P0[i],mul(shape[i],factors[i]));
 const posed=P.map((p,i)=>add(p,Q[i]));
 lastRest=faultFaces(P,P0,I);lastPose=faultFaces(posed,posed0,I);
 if(!lastRest.length&&!lastPose.length)break;
 for(const f of new Set([...lastRest,...lastPose]))for(const id of I.slice(f*3,f*3+3))if(factors[id]>0)factors[id]*=.70;
}
if(lastRest.length||lastPose.length)throw Error('Shape constraints cannot avoid fold');
A.POSITION=P;
function triangleMetric(pos,v){
 const a=pos[v[0]],b=pos[v[1]],c=pos[v[2]];
 const ab=len(sub(a,b)),bc=len(sub(b,c)),ca=len(sub(c,a)),ar=len(triangleNormal(pos,v))*.5;
 return (4*Math.sqrt(3)*ar)/(ab*ab+bc*bc+ca*ca+1e-18);
}
// Local edge flips replace long diagonals with consistently oriented, higher-quality facets;
// refuse nonconvex quads, changes on rims, or flips that touch the posterior opening.
const tris=[];for(let j=0;j<I.length;j+=3)tris.push(I.slice(j,j+3));
let flips=0;const flipHistory=[];
// r30a already performed 248 connectivity flips; r30b retains that topology.
for(let pass=0;pass<0;pass++){
 const ids=tris.flat(),E=edges(ids),proposals=[];
 for(const [k,entry]of E){
  if(entry.length!==2)continue;
  const [f1,f2]=entry,{a,b,o:w}=f1,{o:z}=f2;
  if(f2.a!==b||f2.b!==a)continue;
  if(new Set([a,b,w,z]).size!==4||locked.has(a)||locked.has(b)||locked.has(w)||locked.has(z))continue;
  if(E.has(key(w,z)))continue;
  const cp=[a,b,w,z].map(i=>P[i]),cent=cp[0].map((_,q)=>cp.reduce((s,p)=>s+p[q],0)/4);
  if(Math.abs(cent[0])>.060||cent[1]<-.120||cent[1]>.010||cent[2]<.80||cent[2]>.984)continue;
  const before=[tris[f1.f],tris[f2.f]],after=[[w,z,b],[z,w,a]];
  const origQuality=Math.min(...before.map(t=>triangleMetric(P,t)));
  const newQuality=Math.min(...after.map(t=>triangleMetric(P,t)));
  if(newQuality<origQuality*1.18||newQuality<.08)continue;
  const ok=[P,P.map((p,i)=>add(p,Q[i]))].every(pos=>{
    const n=before.map(t=>triangleNormal(pos,t)),m=after.map(t=>triangleNormal(pos,t));
    return m.every(t=>len(t)>.00000002&&n.every(q=>dot(t,q)>len(t)*len(q)*.35));
  });
  if(!ok)continue;
  proposals.push({f1:f1.f,f2:f2.f,after,old:origQuality,new:newQuality,edge:k,gain:newQuality-origQuality});
 }
 proposals.sort((a,b)=>b.gain-a.gain);
 const used=new Set();let changed=0;
 for(const row of proposals){if(used.has(row.f1)||used.has(row.f2))continue;
  // After a flip an edge may become shared by a different face; never touch adjacent selected pairs.
  tris[row.f1]=row.after[0];tris[row.f2]=row.after[1];
  used.add(row.f1);used.add(row.f2);changed++;flipHistory.push({pass,oldEdge:row.edge,newEdge:key(row.after[0][0],row.after[0][1]),gain:row.gain});
 }
 flips+=changed;if(changed===0)break;
}
I=tris.flat();
const edgeFinal=edges(I),boundaryFinal=new Set([...edgeFinal].filter(([,v])=>v.length===1).map(([k])=>k));
if(boundaryFinal.size!==border0.size||[...boundaryFinal].some(k=>!border0.has(k))||[...edgeFinal.values()].some(e=>e.length>2))throw Error('Surface boundary/nonmanifold changed');
if(faultFaces(P,P0,I).length>0)throw Error('New mesh direction conflicts with reference winding');
const posed=P.map((p,i)=>add(p,Q[i]));
if(faultFaces(posed,posed0,I).length>0)throw Error('New posed mesh direction conflicts with source winding');
function normals(pos){
 const out=pos.map(()=>[0,0,0]);for(let j=0;j<I.length;j+=3){const t=I.slice(j,j+3),n=triangleNormal(pos,t);for(const id of t)for(let k=0;k<3;k++)out[id][k]+=n[k]}
 return out.map((v,i)=>{const L=len(v);return L>1e-12?mul(v,1/L):A.NORMAL[i]});
}
const rn=normals(P),pn=normals(posed);
A.NORMAL=rn.map((v,i)=>i<authoredCount?read(skin.attributes.NORMAL)[i]:v);
M.NORMAL=pn.map((v,i)=>i<authoredCount?read(skin.targets[0].NORMAL)[i]:sub(v,rn[i]));
function write(rows,oldId){
 const a=g.accessors[oldId],n=C[a.type],sz=S[a.componentType],b=Buffer.alloc(rows.length*n*sz),off=(bin.length+3)&~3;
 for(let i=0;i<rows.length;i++)for(let j=0;j<n;j++){
  const v=n===1?rows[i]:rows[i][j],o=(i*n+j)*sz;if(!Number.isFinite(v))throw Error('Nonfinite');
  if(a.componentType===5126)b.writeFloatLE(v,o);
  else if(a.componentType===5123)b.writeUInt16LE(v,o);
  else if(a.componentType===5121)b.writeUInt8(Math.round(v),o);
  else if(a.componentType===5125)b.writeUInt32LE(v,o);
 }
 bin=Buffer.concat([bin,Buffer.alloc(off-bin.length),b]);
 const bv=g.bufferViews.push({buffer:0,byteOffset:off,byteLength:b.length})-1;
 const ac={bufferView:bv,componentType:a.componentType,count:rows.length,type:a.type};
 if(a.normalized!==undefined)ac.normalized=a.normalized;
 if(a.min||a.max)for(const mode of ['min','max'])if(a[mode])ac[mode]=Array.from({length:n},(_,j)=>mode==='min'?Math.min(...rows.map(r=>n===1?r:r[j])):Math.max(...rows.map(r=>n===1?r:r[j])));
 return g.accessors.push(ac)-1;
}
function writeIndex(tris,oldId){
 const a=g.accessors[oldId],max=Math.max(...tris);if(max>65535||tris.length%3)throw Error('Invalid indices');
 const off=(bin.length+3)&~3,b=Buffer.alloc(tris.length*2);tris.forEach((v,i)=>b.writeUInt16LE(v,2*i));
 bin=Buffer.concat([bin,Buffer.alloc(off-bin.length),b]);
 const bv=g.bufferViews.push({buffer:0,byteOffset:off,byteLength:b.length})-1;
 return g.accessors.push({bufferView:bv,componentType:5123,count:tris.length,type:'SCALAR',min:[0],max:[max]})-1;
}
const oldAuthorIndices=primitive[13].indices,oldBodyIndices=primitive[0].indices;
for(let i=0;i<authoredCount;i++)if(JSON.stringify(P[i])!==JSON.stringify(P0[i]))throw Error('Authored position changed');
for(const [k,id]of Object.entries(skin.attributes))skin.attributes[k]=write(A[k],id);
for(const [k,id]of Object.entries(skin.targets[0]))skin.targets[0][k]=write(M[k],id);
skin.indices=writeIndex(I,skin.indices);
if(primitive[13].indices!==oldAuthorIndices||primitive[0].indices!==oldBodyIndices)throw Error('External geometry changed');
const garment=primitive.reduce((s,p)=>s+(p.extras?.layer==='garment'?g.accessors[p.indices].count/3:0),0);
if(garment!==370)throw Error('Garment count changed');
g.extras={...g.extras,revision:'rev96-user101-r31g-welded-convex-fairing',sourceSHA256:sourceSha,wholeBodyWatertight:false,visualAcceptance:'candidate-not-yet-reviewed'};
skin.extras={...skin.extras,revision:'r31g-welded-convex-fairing',directionalEdgeFlips:flips,originalBoundaryEdgesLocked:123};
g.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(g)),jpad=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bpad=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]),head=Buffer.alloc(12),jhead=Buffer.alloc(8),bhead=Buffer.alloc(8);
head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(12+jpad.length+8+bpad.length+8,8);jhead.writeUInt32LE(jpad.length,0);jhead.write('JSON',4);bhead.writeUInt32LE(bpad.length,0);bhead.writeUInt32LE(0x004e4942,4);
const model=Buffer.concat([head,jhead,jpad,bhead,bpad]);
fs.writeFileSync(path.join(root,output),model,{flag:'wx'});
const displacements=P.map((p,i)=>len(sub(p,P0[i])));
const report={revision:'r31g',weldedAuthoredSeamVertices:welded.size,smoothedInteriorVertices:mask.filter(x=>x>.01).length,curve:'convex downward',file:output,sha256:sha(model),parent:sourceName,parentSha256:sourceSha,sourceSkinTriangles:orig.length/3,resultSkinTriangles:I.length/3,sourceSkinVertices:P.length,resultSkinVertices:A.POSITION.length,allTriangles:primitive.reduce((s,p)=>s+g.accessors[p.indices].count/3,0),movedSkinVertices:displacements.filter(v=>v>1e-5).length,maximumDisplacement:Math.max(...displacements),meanDisplacement:displacements.reduce((s,v)=>s+v,0)/displacements.length,edgeFlips:flips,flipHistory,boundaryEdges:boundaryFinal.size,rigBones:g.skins[0].joints.length,garmentTriangles:garment,manual101Protected:true,authored908Protected:true,authored529FacesProtected:true,morphPreserved:true,restDegenerate:0,poseDegenerate:0,wholeBodyWatertight:false,visualAccepted:false};
fs.writeFileSync(path.join(root,log),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...report,flipHistory:`[${report.flipHistory.length} entries saved]`},null,2));
