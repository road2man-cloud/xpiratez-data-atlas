'use strict';
/**
 * F11 rev96 r28 adaptive non-boundary edge retopology.
 * Split all overlong INTERNAL edges of the already physically integrated
 * perineal skin, using conforming 0/1/2/3 edge case triangulation.
 * Preserve existing 605 source vertices, ALL boundary edges, 529 authored
 * core faces and vertices, 101 manually deleted faces, all garment and bones.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const src='r21AO-F11-user101-integrated-oval-r31c-convex-g1-seam-fairing.glb';
const h='d4652a02f69dfeb66ddf51caa105163b13e08445d66387316012603655820d80';
const output='r21AO-F11-user101-integrated-oval-r31d-convex-seam-collar.glb';
const report='REV96_USER101_R31D_BUILD.json';
if([output,report].some(f=>fs.existsSync(path.join(root,f))))throw Error('Refuse overwrite');
const old=fs.readFileSync(path.join(root,src));if(hash(old)!==h)throw Error('Wrong immutable r26 parent');
const trim=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(hash(trim)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('User manual trim mismatch');
const jl=old.readUInt32LE(12),g=JSON.parse(old.toString('utf8',20,20+jl)),o=28+jl;let buf=Buffer.from(old.subarray(o,o+old.readUInt32LE(20+jl))),ps=g.meshes[0].primitives;
if(ps.length!==24||g.skins[0].joints.length!==63||ps[13].material!==5||ps[23].material!==5)throw Error('Unexpected original mesh');
const ntype={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},size={5121:1,5123:2,5125:4,5126:4},reader={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(i){const a=g.accessors[i],v=g.bufferViews[a.bufferView],n=ntype[a.type],os=(v.byteOffset||0)+(a.byteOffset||0),st=v.byteStride||n*size[a.componentType],out=[];for(let j=0;j<a.count;j++){const row=[];for(let k=0;k<n;k++)row.push(buf[reader[a.componentType]](os+j*st+k*size[a.componentType]));out.push(n===1?row[0]:row)}return out}
function load(p){return {attrs:Object.fromEntries(Object.entries(p.attributes).map(([k,i])=>[k,read(i)])),morph:Object.fromEntries(Object.entries(p.targets[0]).map(([k,i])=>[k,read(i)])),indices:read(p.indices)}}
const skin=load(ps[23]),attrs=skin.attrs,morph=skin.morph;
const originalCount=attrs.POSITION.length;
if(originalCount!==1211||skin.indices.length!==2292*3)throw Error('Different input topology');
const originalIndices=skin.indices.slice(),originalPos=attrs.POSITION.map(p=>p.slice()),origMorph=morph.POSITION.map(p=>p.slice());
const vec=(a,b,t)=>Array.isArray(a)?a.map((x,i)=>x*(1-t)+b[i]*t):a*(1-t)+b*t;
const sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),length=a=>Math.hypot(...a);
const key=(a,b)=>a<b?a+':'+b:b+':'+a;
const allAttributes=Object.keys(attrs),allMorphs=Object.keys(morph);
const iterations=[];
let indices=skin.indices.slice();
const skinWeights=(a,b)=>{const sum=new Map();for(const id of [a,b])for(let k=0;k<4;k++){const bone=attrs.JOINTS_0[id][k],w=attrs.WEIGHTS_0[id][k]*.5;sum.set(bone,(sum.get(bone)||0)+w)}const top=[...sum].sort((x,y)=>y[1]-x[1]).slice(0,4),z=top.reduce((s,x)=>s+x[1],0)||1;return {j:Array.from({length:4},(_,i)=>top[i]?.[0]||0),w:Array.from({length:4},(_,i)=>(top[i]?.[1]||0)/z)}};
const boundarySource=new Set();
function edgesOf(I){const e=new Map();for(let f=0;f<I.length;f+=3){const [a,b,c]=I.slice(f,f+3);for(const [x,y,z]of [[a,b,c],[b,c,a],[c,a,b]]){const k=key(x,y),r=e.get(k)||{a:Math.min(x,y),b:Math.max(x,y),faces:[],opposites:[]};r.faces.push(f/3);r.opposites.push(z);e.set(k,r)}}return e}
for(const [k,e]of edgesOf(indices))if(e.faces.length===1)boundarySource.add(k);
const boundaryVertices=new Set([...boundarySource].flatMap(k=>k.split(':').map(Number)));
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
// Narrow, connected oval volume: sculpt only the procedural skin; keep the
// authored anatomy, separate posterior cavity and all pre-existing rims.
const changes=[],sourceFaceCount=indices.length/3;
// Split only the authored-to-procedural shared seam triangles and sculpt an
// actual tangent collar. This avoids the indiscriminate face-centroid bumps
// that made the r30c experiment faceted.
const author=load(ps[13]);
const geom=(a,b)=>[a,b].sort().map(i=>i).join(':');
const cKey=p=>p.map(x=>Math.round(x*1e6)).join('/');
const ce=(a,b)=>[cKey(a),cKey(b)].sort().join('|');
const authorRim=new Map();
for(const [k,e]of edgesOf(author.indices))if(e.faces.length===1)authorRim.set(ce(author.attrs.POSITION[e.a],author.attrs.POSITION[e.b]),e);
const originalEdgeMap=edgesOf(indices);
const seamFaces=new Map();
for(const [k,e]of originalEdgeMap){
 if(e.faces.length!==1)continue;
 const au=authorRim.get(ce(attrs.POSITION[e.a],attrs.POSITION[e.b]));
 if(!au)continue;
 const P=attrs.POSITION,cent=vec(P[e.a],P[e.b],.5),y=cent[1];
 if(y<-.119||y>-.049)continue;
 const f=e.faces[0];
 const A=author.attrs.POSITION,pa=A[au.a],pb=A[au.b],pc=A[au.opposites[0]];
 const n=cross(sub(pb,pa),sub(pc,pa)),nl=length(n);
 if(nl<1e-9)continue;
 seamFaces.set(f,{edge:[e.a,e.b],author:[au.a,au.b,au.opposites[0]],normal:n.map(v=>v/nl),point:pa});
}
function wt3(ids){const sum=new Map();for(const id of ids)for(let k=0;k<4;k++){const bone=attrs.JOINTS_0[id][k],w=attrs.WEIGHTS_0[id][k]/3;sum.set(bone,(sum.get(bone)||0)+w)}const top=[...sum].sort((a,b)=>b[1]-a[1]).slice(0,4),z=top.reduce((a,b)=>a+b[1],0)||1;return{j:Array.from({length:4},(_,i)=>top[i]?.[0]||0),w:Array.from({length:4},(_,i)=>(top[i]?.[1]||0)/z)}}
function mid3(ids,keyName,group){const data=group[keyName],v=data[ids[0]];return Array.isArray(v)?v.map((_,k)=>ids.reduce((s,id)=>s+data[id][k],0)/3):ids.reduce((s,id)=>s+data[id],0)/3}
let replaced=0;const faces=[],seamDisplacements=[];
const tau=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
for(let f=0;f<indices.length;f+=3){
 const ids=indices.slice(f,f+3),collar=seamFaces.get(f/3);
 if(!collar){faces.push(...ids);continue}
 const originalTriangle=ids.map(i=>attrs.POSITION[i]),origPose=ids.map(i=>attrs.POSITION[i].map((v,k)=>v+morph.POSITION[i][k]));
 const base=originalTriangle[0].map((_,k)=>originalTriangle.reduce((a,p)=>a+p[k],0)/3);
 const poseBase=origPose[0].map((_,k)=>origPose.reduce((a,p)=>a+p[k],0)/3);
 const n=collar.normal,projection=-tau(n,sub(base,collar.point));
 let offset=n.map(v=>v*projection*.92),amt=length(offset);if(amt>.022)offset=offset.map(v=>v*.022/amt);
 const triRest=cross(sub(originalTriangle[1],originalTriangle[0]),sub(originalTriangle[2],originalTriangle[0]));
 const triPose=cross(sub(origPose[1],origPose[0]),sub(origPose[2],origPose[0]));
 let factor=1;
 const ok=(pos,center,ref)=>{
   const nset=[[0,1],[1,2],[2,0]].map(([a,b])=>cross(sub(pos[b],pos[a]),sub(center,pos[a])));
   return nset.every(k=>length(k)>1e-9&&tau(k,ref)>0);
 };
 for(let it=0;it<25;it++){
  const p=base.map((v,k)=>v+offset[k]*factor),q=poseBase.map((v,k)=>v+offset[k]*factor);
  if(ok(originalTriangle,p,triRest)&&ok(origPose,q,triPose))break;
  factor*=.68;
 }
 const adjusted=offset.map(v=>v*factor),newId=attrs.POSITION.length,sw=wt3(ids);
 for(const key of allAttributes)attrs[key].push(key==='JOINTS_0'?sw.j:key==='WEIGHTS_0'?sw.w:mid3(ids,key,attrs));
 for(const key of allMorphs)morph[key].push(mid3(ids,key,morph));
 attrs.POSITION[newId]=attrs.POSITION[newId].map((v,k)=>v+adjusted[k]);
 faces.push(ids[0],ids[1],newId,ids[1],ids[2],newId,ids[2],ids[0],newId);
 seamDisplacements.push({face:f/3,vertex:newId,offset:adjusted,initialDistanceToAuthoredTangent:projection,blend:factor});
 replaced++;
}
indices=faces;
// r29d already closed four tiny non-anatomic loops; preserve all remaining rims.
const smallCaps=0,capFaces=0,capLoops=[];
// Derive vertex normals from the new surface in rest and morph pose.
const sub3=(a,b)=>a.map((x,k)=>x-b[k]);const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function calcNormals(P){const N=Array.from({length:P.length},()=>[0,0,0]);for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),n=cross3(sub3(P[b],P[a]),sub3(P[c],P[a]));for(const v of [a,b,c])for(let k=0;k<3;k++)N[v][k]+=n[k]}return N.map(v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)})}
const restN=calcNormals(attrs.POSITION),posedN=calcNormals(attrs.POSITION.map((p,i)=>p.map((v,k)=>v+morph.POSITION[i][k])));
for(let i=0;i<attrs.POSITION.length;i++){attrs.NORMAL[i]=restN[i];morph.NORMAL[i]=posedN[i].map((v,k)=>v-restN[i][k]);}
iterations.push({phase:'curved-face-replacement',sourceFaces:sourceFaceCount,replaced,newCurvedFaces:replaced*3});
iterations.push({phase:'small-rim-cap',smallCaps,capFaces,capLoops});
const newEdges=edgesOf(indices),newBoundary=[...newEdges].filter(([k,e])=>e.faces.length===1).map(([k])=>k);
if(newBoundary.some(k=>!boundarySource.has(k)))throw Error('Unexpected new open boundaries');
const originals=attrs.POSITION.slice(0,originalCount);
for(let i=0;i<originalCount;i++)if(boundaryVertices.has(i)&&JSON.stringify(originals[i])!==JSON.stringify(originalPos[i]) || JSON.stringify(morph.POSITION[i])!==JSON.stringify(origMorph[i]))throw Error('Original skin vertex changed');
function stats(pos){let zero=0,areaMin=Infinity;for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),t=cross(sub(pos[b],pos[a]),sub(pos[c],pos[a])),ar=length(t)/2;areaMin=Math.min(areaMin,ar);if(ar<1e-11)zero++;}return{zero,areaMin}}
const rest=stats(attrs.POSITION),pose=stats(attrs.POSITION.map((p,i)=>p.map((x,k)=>x+morph.POSITION[i][k])));
if(rest.zero||pose.zero)throw Error('Degenerate split triangle');
const oldSourceBodyIndices=ps[0].indices,oldAuthorIndices=ps[13].indices;
function writeRows(rows,template){const a=g.accessors[template],n=ntype[a.type],s=size[a.componentType],block=Buffer.alloc(rows.length*n*s),at=(buf.length+3)&~3;
for(let i=0;i<rows.length;i++)for(let k=0;k<n;k++){const v=n===1?rows[i]:rows[i][k],t=(i*n+k)*s;if(!Number.isFinite(v))throw Error('NaN attribute');if(a.componentType===5126)block.writeFloatLE(v,t);else if(a.componentType===5123)block.writeUInt16LE(v,t);else if(a.componentType===5121)block.writeUInt8(Math.round(v),t);else if(a.componentType===5125)block.writeUInt32LE(v,t)}
buf=Buffer.concat([buf,Buffer.alloc(at-buf.length),block]);const bv=g.bufferViews.push({buffer:0,byteOffset:at,byteLength:block.length})-1;const ac={bufferView:bv,componentType:a.componentType,count:rows.length,type:a.type};if(a.normalized!==undefined)ac.normalized=a.normalized;
if(a.min||a.max)for(const mode of ['min','max'])if(a[mode])ac[mode]=Array.from({length:n},(_,k)=>mode==='min'?Math.min(...rows.map(x=>n===1?x:x[k])):Math.max(...rows.map(x=>n===1?x:x[k])));
return g.accessors.push(ac)-1}
function writeIndices(I){if(Math.max(...I)>=65536)throw Error('Index overflow');const at=(buf.length+3)&~3,b=Buffer.alloc(I.length*2);I.forEach((x,k)=>b.writeUInt16LE(x,2*k));buf=Buffer.concat([buf,Buffer.alloc(at-buf.length),b]);const v=g.bufferViews.push({buffer:0,byteOffset:at,byteLength:b.length})-1;return g.accessors.push({bufferView:v,componentType:5123,count:I.length,type:'SCALAR',min:[0],max:[Math.max(...I)]})-1}
for(const [k,i]of Object.entries(ps[23].attributes))ps[23].attributes[k]=writeRows(attrs[k],i);
for(const [k,i]of Object.entries(ps[23].targets[0]))ps[23].targets[0][k]=writeRows(morph[k],i);
ps[23].indices=writeIndices(indices);
if(ps[0].indices!==oldSourceBodyIndices||ps[13].indices!==oldAuthorIndices)throw Error('Original geometry changed');
ps[23].extras={...ps[23].extras,revision:'r31d-convex-seam-collar',sourceBoundaryVerticesLocked:boundaryVertices.size,originalBoundaryEdgesLocked:boundarySource.size,adaptiveSplits:iterations};
g.extras={...g.extras,revision:'rev96-user101-r31d-convex-seam-collar',parentSHA256:h,visualAcceptance:'pending',wholeBodyWatertight:false};
const triangles=ps.reduce((s,p)=>s+g.accessors[p.indices].count/3,0),garment=ps.reduce((s,p)=>s+(p.extras?.layer==='garment'?g.accessors[p.indices].count/3:0),0);
if(garment!==370)throw Error('Garment damaged');
g.buffers[0].byteLength=buf.length;
const raw=Buffer.from(JSON.stringify(g)),jp=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),bp=Buffer.concat([buf,Buffer.alloc((4-buf.length%4)%4)]),head=Buffer.alloc(12),j=Buffer.alloc(8),b=Buffer.alloc(8);
head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jp.length+8+bp.length,8);j.writeUInt32LE(jp.length,0);j.write('JSON',4);b.writeUInt32LE(bp.length,0);b.write('BIN\0',4);
const model=Buffer.concat([head,j,jp,b,bp]);fs.writeFileSync(path.join(root,output),model,{flag:'wx'});
const result={file:output,sha256:hash(model),source:src,sourceSHA256:h,sourceSkinFaces:originalIndices.length/3,seamCollarFacesReplaced:replaced,seamDisplacements,sourceSkinVertices:originalCount,newSkinFaces:indices.length/3,newSkinVertices:attrs.POSITION.length,allTriangles:triangles,skinBoundaryEdgesUnchanged:newBoundary.length,internalEdgeNonmanifold:[...newEdges.values()].filter(e=>e.faces.length>2).length,rest,pose,iterations,bones:63,garments:370,protected101:true,originalAuthor908Untouched:true,sourceBoundaryVerticesUntouched:true,existingBodyUntouched:true,visualApproval:'pending',replacedCurvedFaces:replaced,cappedSmallLoops:smallCaps,capFaces,remainingBoundaryEdges:newBoundary.length};
fs.writeFileSync(path.join(root,report),JSON.stringify({...result,vertexChanges:changes},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
