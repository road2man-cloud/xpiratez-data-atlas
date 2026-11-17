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
const output='r21AO-F11-user101-integrated-oval-r32a-unfolded-convex-seam.glb';
const log='REV96_USER101_R32A_BUILD.json';
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
// r32a: replace folded-over seam strip through normal-aware geometric unfolding.
// The first 529 authored triangles remain position- and index-identical.
const authoredCount=2268;
for(let i=0;i<authoredCount;i++)locked.add(i);
const seamPairs=[];
const originalSeamCount=31;
function signedAngle(v,w){return Math.acos(Math.max(-1,Math.min(1,dot(v,w)/(len(v)*len(w)||1))))*180/Math.PI}
for(const e of edge0.values()){
 if(e.length!==2)continue;
 const au=e.find(v=>v.f<529),ge=e.find(v=>v.f>=529);
 if(!au||!ge||ge.o<authoredCount)continue;
 const nA=cross(sub(P0[au.b],P0[au.a]),sub(P0[au.o],P0[au.a]));
 const nG=cross(sub(P0[ge.b],P0[ge.a]),sub(P0[ge.o],P0[ge.a]));
 const angle=signedAngle(nA,nG);
 seamPairs.push({au,ge,angle});
}
if(seamPairs.length!==31)throw Error('Missing physical center-to-posterior seam: '+seamPairs.length);
const seeds=new Map(),unfolded=[];
for(const item of seamPairs){
 if(item.angle<65)continue;
 const {au,ge}=item;
 const a=P0[au.a],b=P0[au.b],auth=P0[au.o],point=P0[ge.o];
 const m=mul(add(a,b),.5),t=sub(b,a),tl=len(t)||1,unit=mul(t,1/tl);
 const radial=x=>sub(sub(x,m),mul(unit,dot(sub(x,m),unit)));
 const rAuthor=radial(auth),rGen=radial(point),ra=len(rAuthor),rg=len(rGen);
 if(ra<.0002||rg<.00015)continue;
 // Put generated side opposite authored triangle in the seam transverse plane.
 // Retain its original tangential displacement and modest downward convex bias.
 let desired=add(add(m,mul(unit,dot(sub(point,m),unit))),mul(rAuthor,-rg/ra));
 const signedDown=Math.exp(-Math.pow((m[1]+.084)/.050,2));
 desired[2]-=.0015*signedDown;
 let delta=sub(desired,point),displacement=len(delta),maxDistance=.050;
 if(displacement>maxDistance)delta=mul(delta,maxDistance/displacement);
 const v=seeds.get(ge.o)||{sum:[0,0,0],count:0};v.sum=add(v.sum,delta);v.count++;seeds.set(ge.o,v);
 unfolded.push({edge:[au.a,au.b],authFace:au.f,genFace:ge.f,anchor:ge.o,beforeAngle:+item.angle.toFixed(3),targetDelta:delta});
}
if(seeds.size<8)throw Error('No severe folded seam was found');
const seedDeltas=new Map([...seeds].map(([id,v])=>[id,mul(v.sum,1/v.count)]));
const allowed=i=>i>=authoredCount&&!locked.has(i)&&Math.abs(P0[i][0])<.072&&P0[i][1]>-.16&&P0[i][1]<-.040&&P0[i][2]>.83&&P0[i][2]<.976;
const field=Array.from({length:P0.length},()=>[0,0,0]);
for(const [id,d]of seedDeltas)field[id]=d;
// Harmonic attenuation spreads geometric unfolding into neighbor rings rather
// than creating another isolated sharp crease right beside the seam.
const correctionPasses=54;
for(let pass=0;pass<correctionPasses;pass++){
 const next=field.map(v=>v.slice());
 for(let i=authoredCount;i<P0.length;i++){
  if(!allowed(i)||seedDeltas.has(i))continue;
  let v=[0,0,0],total=0;
  for(const j of neighbors[i]){
   const weight=1/(.005+len(sub(P0[i],P0[j])));
   v=add(v,mul(field[j],weight));total+=weight;
  }
  if(total>0)next[i]=mul(v,1/(total+.42*total));
 }
 for(let i=authoredCount;i<P0.length;i++)field[i]=next[i];
}
// A gentle convex bend along the longitudinal strip, not a concave hollow.
const shape=P0.map((p,i)=>{
 if(!allowed(i))return [0,0,0];
 const ax=Math.abs(p[0]),posterior=Math.exp(-Math.pow((p[1]+.061)/.046,2));
 const later=1-smooth(.040,.074,ax),level=smooth(.849,.876,p[2])*(1-smooth(.945,.988,p[2]));
 const d=field[i];return [d[0],d[1],d[2]-.0018*posterior*later*level];
});
const foldedSeamsBefore=seamPairs.filter(r=>r.angle>65).length;
function triangleNormal(pos,t){return cross(sub(pos[t[1]],pos[t[0]]),sub(pos[t[2]],pos[t[0]]))}
const posed0=P0.map((p,i)=>add(p,Q[i]));
function faultFaces(pos,ref,tri){
 const errors=[];
 for(let i=0;i<tri.length;i+=3){const v=tri.slice(i,i+3),n=triangleNormal(pos,v),old=triangleNormal(ref,v);
  if(len(n)<2e-11||dot(n,old)<-2e-13)errors.push(Math.floor(i/3));
 }return errors;
}
const P=P0.map((p,i)=>add(p,shape[i]));
// Unfolding may intentionally reverse the original folded normals; require
// nonzero triangles in both static and morph poses instead of old winding.
let uncollapsedRest=0,uncollapsedPose=0;
for(let f=0;f<I.length;f+=3){
 const t=I.slice(f,f+3),posed=t.map(i=>add(P[i],Q[i]));
 const area=len(triangleNormal(P,t))*.5;
 const q=len(cross(sub(posed[1],posed[0]),sub(posed[2],posed[0])))*.5;
 if(area<1e-10)uncollapsedRest++;
 if(q<1e-10)uncollapsedPose++;
}
if(uncollapsedRest||uncollapsedPose)throw Error('Unfold collapsed '+uncollapsedRest+'/'+uncollapsedPose+' triangles');
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
// r32a deliberately unfolds source-overlapped seam triangles; original normals must change.
const posed=P.map((p,i)=>add(p,Q[i]));
// posed surface has independent non-degeneracy requirements above.
function normals(pos){
 const out=pos.map(()=>[0,0,0]);for(let j=0;j<I.length;j+=3){const t=I.slice(j,j+3),n=triangleNormal(pos,t);for(const id of t)for(let k=0;k<3;k++)out[id][k]+=n[k]}
 return out.map((v,i)=>{const L=len(v);return L>1e-12?mul(v,1/L):A.NORMAL[i]});
}
const rn=normals(P),pn=normals(posed);
const seamAnglesAfter=seamPairs.map(r=>{
 const a=r.au,b=r.ge,na=triangleNormal(P,I.slice(3*a.f,3*a.f+3)),nb=triangleNormal(P,I.slice(3*b.f,3*b.f+3));
 return signedAngle(na,nb);
});
const foldedSeamsAfter=seamAnglesAfter.filter(x=>x>65).length;
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
g.extras={...g.extras,revision:'rev96-user101-r32a-unfolded-convex-seam',sourceSHA256:sourceSha,wholeBodyWatertight:false,visualAcceptance:'candidate-not-yet-reviewed'};
skin.extras={...skin.extras,revision:'r32a-unfolded-convex-seam',directionalEdgeFlips:flips,originalBoundaryEdgesLocked:123};
g.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(g)),jpad=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bpad=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]),head=Buffer.alloc(12),jhead=Buffer.alloc(8),bhead=Buffer.alloc(8);
head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(12+jpad.length+8+bpad.length+8,8);jhead.writeUInt32LE(jpad.length,0);jhead.write('JSON',4);bhead.writeUInt32LE(bpad.length,0);bhead.writeUInt32LE(0x004e4942,4);
const model=Buffer.concat([head,jhead,jpad,bhead,bpad]);
fs.writeFileSync(path.join(root,output),model,{flag:'wx'});
const displacements=P.map((p,i)=>len(sub(p,P0[i])));
const report={revision:'r32a',unfoldedSeamFaces:unfolded.length,anchoredVertices:seedDeltas.size,harmonicPasses:correctionPasses,foldedSeamsBefore,foldedSeamsAfter,dihedralAfter:seamAnglesAfter.map(x=>+x.toFixed(2)),unfolded,curve:'convex downward',file:output,sha256:sha(model),parent:sourceName,parentSha256:sourceSha,sourceSkinTriangles:orig.length/3,resultSkinTriangles:I.length/3,sourceSkinVertices:P.length,resultSkinVertices:A.POSITION.length,allTriangles:primitive.reduce((s,p)=>s+g.accessors[p.indices].count/3,0),movedSkinVertices:displacements.filter(v=>v>1e-5).length,maximumDisplacement:Math.max(...displacements),meanDisplacement:displacements.reduce((s,v)=>s+v,0)/displacements.length,edgeFlips:flips,flipHistory,boundaryEdges:boundaryFinal.size,rigBones:g.skins[0].joints.length,garmentTriangles:garment,manual101Protected:true,authored908Protected:true,authored529FacesProtected:true,morphPreserved:true,restDegenerate:0,poseDegenerate:0,wholeBodyWatertight:false,visualAccepted:false};
fs.writeFileSync(path.join(root,log),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...report,flipHistory:`[${report.flipHistory.length} entries saved]`},null,2));
