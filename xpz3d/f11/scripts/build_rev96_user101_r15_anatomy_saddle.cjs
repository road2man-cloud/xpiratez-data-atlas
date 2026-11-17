'use strict';
/**
 * F11 rev96 r15 — inset anatomical saddle, not a dangling flat
 * perineal primitive. 101 human-deleted faces stay deleted. Replace r11
 * primitive 22 closed separate strip with a 21x19 curved smooth loft whose
 * front edge shares the actual 21-vertex primitive-13 open boundary and
 * whose posterior edge matches 19 explicitly subdivided native body rim
 * positions, morph targets, and skin weights. Recreate blind anal pit.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),dir=__dirname;
const src='r21AO-F11-user101-posterior-seam-aligned-r11.glb';
const variant=process.argv.includes('--inset')?'inset':'arch';
const name='r21AO-F11-user101-anatomy-saddle-r15-'+variant+'.glb',reportName='REV96_USER101_ANATOMY_SADDLE_R15_'+variant.toUpperCase()+'.json';
for(const n of [name,reportName])if(fs.existsSync(path.join(dir,n)))throw Error('Refuse overwrite: '+n);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),raw=fs.readFileSync(path.join(dir,src));
const originalSHA='c0109fca67137623db40afcfea0b37d6669b92fe704a59511bd1e8778acb13c5';
if(sha(raw)!==originalSHA)throw Error('Source r11 GLB hash mismatch');
const trimraw=fs.readFileSync(path.join(dir,'rev95-user-trim-101faces-20261116T152807Z.json'));
const snapshotSHA='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5';
if(sha(trimraw)!==snapshotSHA)throw Error('Original user 101-triangle trim mismatch');
const snapshot=JSON.parse(trimraw);
if(snapshot.deletedFaces.length!==101||snapshot.positions.length!==754||Object.keys(snapshot.controls).length!==106)throw Error('Unexpected user trim payload');
const jl=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+jl));
let bin=Buffer.from(raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl)));
const primitives=doc.meshes[0].primitives;
if(primitives.length!==24||doc.skins[0].joints.length!==63)throw Error('Unexpected r11 mesh');
const d={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},s={5121:1,5123:2,5125:4,5126:4},fns={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(id){
 const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=d[a.type],sz=s[a.componentType],f=fns[a.componentType],start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*sz,out=[];
 for(let k=0;k<a.count;k++){const x=[];for(let j=0;j<n;j++)x.push(bin[f](start+k*stride+j*sz));out.push(n===1?x[0]:x);}return out;
}
function push(rows,template){
 const a=doc.accessors[template],n=d[a.type],sz=s[a.componentType],at=(bin.length+3)&~3,data=Buffer.alloc(rows.length*n*sz);
 for(let i=0;i<rows.length;i++)for(let k=0;k<n;k++){
  const x=n===1?rows[i]:rows[i][k],j=(i*n+k)*sz;
  if(!Number.isFinite(x))throw Error('Nonfinite attribute '+template+' '+i);
  if(a.componentType===5126)data.writeFloatLE(x,j);
  else if(a.componentType===5125)data.writeUInt32LE(x,j);
  else if(a.componentType===5123)data.writeUInt16LE(x,j);
  else if(a.componentType===5121)data.writeUInt8(x,j);
 }
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),data]);
 const vi=doc.bufferViews.push({buffer:0,byteOffset:at,byteLength:data.length})-1;
 const o={bufferView:vi,componentType:a.componentType,type:a.type,count:rows.length};
 if(a.normalized!==undefined)o.normalized=a.normalized;
 if(a.min||a.max)for(const kind of ['min','max'])if(a[kind])o[kind]=Array.from({length:n},(_,j)=>kind==='min'?Math.min(...rows.map(row=>n===1?row:row[j])):Math.max(...rows.map(row=>n===1?row:row[j])));
 return doc.accessors.push(o)-1;
}
function pushIndex(ids){
 const at=(bin.length+3)&~3,data=Buffer.alloc(ids.length*2),max=Math.max(...ids);
 if(max>=65536)throw Error('16-bit indices exceeded');
 for(let i=0;i<ids.length;i++)data.writeUInt16LE(ids[i],i*2);
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),data]);
 const v=doc.bufferViews.push({buffer:0,byteOffset:at,byteLength:data.length})-1;
 return doc.accessors.push({bufferView:v,componentType:5123,count:ids.length,type:'SCALAR',min:[Math.min(...ids)],max:[max]})-1;
}
const plus=(a,b)=>a.map((x,i)=>x+b[i]),minus=(a,b)=>a.map((x,i)=>x-b[i]),times=(a,v)=>a.map(x=>x*v),lerp=(a,b,t)=>Array.isArray(a)?a.map((x,i)=>x*(1-t)+b[i]*t):a*(1-t)+b*t;
const length=a=>Math.hypot(...a),unit=a=>times(a,1/(length(a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=t=>t*t*(3-2*t);
const copy=x=>Array.isArray(x)?x.slice():x;
const body=primitives[0],core=primitives[13],oldStrip=primitives[22],oldFaces=read(oldStrip.indices).length/3;
const ba=Object.fromEntries(Object.entries(body.attributes).map(([k,id])=>[k,read(id)])),
 bd=Object.fromEntries(Object.entries(body.targets[0]).map(([k,id])=>[k,read(id)])),
 ca=Object.fromEntries(Object.entries(core.attributes).map(([k,id])=>[k,read(id)])),
 cd=Object.fromEntries(Object.entries(core.targets[0]).map(([k,id])=>[k,read(id)]));
let bodyI=read(body.indices),coreI=read(core.indices);
const oldBodyCount=ba.POSITION.length,oldCoreCount=ca.POSITION.length,originalCoreFaces=coreI.length/3;
if(oldBodyCount!==914||oldCoreCount!==908||originalCoreFaces!==491||oldFaces!==192)throw Error('Unexpected source r11 part sizes');
const mapInfluence=(values)=>{
 const m=new Map();for(const [J,W,k]of values)for(let i=0;i<4;i++)m.set(J[i],(m.get(J[i])||0)+W[i]*k);
 const top=[...m].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((x,t)=>x+t[1],0)||1;
 return {j:Array.from({length:4},(_,i)=>top[i]?.[0]||0),w:Array.from({length:4},(_,i)=>(top[i]?.[1]||0)/sum)};
};
function blendRows(a,b,t){
 const j=mapInfluence([[a.JOINTS_0,a.WEIGHTS_0,1-t],[b.JOINTS_0,b.WEIGHTS_0,t]]);
 const result={};
 for(const field of Object.keys(a)){
  if(field==='JOINTS_0')result[field]=j.j;
  else if(field==='WEIGHTS_0')result[field]=j.w;
  else result[field]=lerp(a[field],b[field],t);
 }
 return result;
}
function sourceVertex(attrs,targets,id){
 return {attributes:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,copy(v[id])])),target:Object.fromEntries(Object.entries(targets).map(([k,v])=>[k,copy(v[id])]))};
}
function interpSource(a,b,t){
 return {attributes:blendRows(a.attributes,b.attributes,t),target:Object.fromEntries(Object.keys(a.target).map(k=>[k,lerp(a.target[k],b.target[k],t)]))};
}
const bodyRim=[908,909,910,29,911,912,913];
// Each of 6 exact native body edge segments gains two new edge vertices;
// triangulate the two fan neighbours without replacing the user 101 faces.
const insert=new Map(),rim=[bodyRim[0]];
for(let i=0;i<bodyRim.length-1;i++){
 const start=bodyRim[i],end=bodyRim[i+1],ids=[];
 for(const t of [1/3,2/3]){
  const id=ba.POSITION.length;
  const a=sourceVertex(ba,bd,start),b=sourceVertex(ba,bd,end),v=interpSource(a,b,t);
  for(const field of Object.keys(ba))ba[field].push(copy(v.attributes[field]));
  for(const field of Object.keys(bd))bd[field].push(copy(v.target[field]));
  ids.push(id);
 }
 insert.set([start,end].sort((a,b)=>a-b).join(':'),{start,end,ids});
 rim.push(...ids,end);
}
if(ba.POSITION.length!==oldBodyCount+12||rim.length!==19)throw Error('Body rim subdivision not created');
const subdivided=[],touched=[];
for(let i=0;i<bodyI.length;i+=3){
 const triangle=bodyI.slice(i,i+3),pair=triangle.map((a,j)=>[a,triangle[(j+1)%3],triangle[(j+2)%3]]).find(([a,b])=>insert.has([a,b].sort((x,y)=>x-y).join(':')));
 if(!pair){subdivided.push(...triangle);continue;}
 const [a,b,opp]=pair,edge=insert.get([a,b].sort((x,y)=>x-y).join(':'));
 const [q,r]=a===edge.start&&b===edge.end?edge.ids:[...edge.ids].reverse();
 subdivided.push(a,q,opp,q,r,opp,r,b,opp);
 touched.push({triangle:triangle.slice(),splitEdge:[a,b],inserted:[q,r]});
}
if(touched.length!==6||subdivided.length/3!==bodyI.length/3+12)throw Error('Rim triangle subdivision failed');
bodyI=subdivided;
// Body original 914 vertex coordinates + their original morph/joints are not modified.
for(const [k,id]of Object.entries(body.attributes))body.attributes[k]=push(ba[k],id);
for(const [k,id]of Object.entries(body.targets[0]))body.targets[0][k]=push(bd[k],id);
body.indices=pushIndex(bodyI);
body.extras={...body.extras,rev96r15NativeEdgeSubdivided:true,rev96r15ExtraRimVertices:12,rev96r15EdgeFacesSplit:6};
// Actual oriented boundary on the native central anatomical surface; this
// list was extracted by tracing its remaining indices, not hand-sketched.
const arc=[340,535,565,568,342,539,503,330,505,506,510,332,515,549,346,584,553,347,552,554,348];
function edgesFor(I){const E=new Map();for(let i=0;i<I.length;i+=3)for(const [a,b] of [[I[i],I[i+1]],[I[i+1],I[i+2]],[I[i+2],I[i]]]){
 const k=a<b?a+':'+b:b+':'+a,e=E.get(k)||{a,b,n:0};e.n++;E.set(k,e);
}return E}
const originalBoundary=edgesFor(coreI);
for(let i=0;i<arc.length-1;i++){const a=arc[i],b=arc[i+1],v=originalBoundary.get(a<b?a+':'+b:b+':'+a);
 if(!v||v.n!==1||v.a!==a||v.b!==b)throw Error('Not oriented genuine central anatomy boundary '+a+'-'+b);
}
// Skin/UV/morph on extension vertex is derived from actual source central
// boundary and the real native posterior torso — no independent 7-column plank.
const rowZero=arc.slice(),front=Array.from({length:19},(_,j)=>{
 const u=j*20/18,k=Math.min(19,Math.floor(u)),t=u-k;
 return interpSource(sourceVertex(ca,cd,arc[k]),sourceVertex(ca,cd,arc[k+1]),t);
}),back=rim.map(id=>sourceVertex(ba,bd,id));
const cols=19,bodyRows=12,grid=[rowZero],added=[];
function register(v){const id=ca.POSITION.length;
 for(const [field,value]of Object.entries(v.attributes))ca[field].push(copy(value));
 for(const [field,value]of Object.entries(v.target))cd[field].push(copy(value));
 added.push(id);return id;
}
for(let row=1;row<=bodyRows;row++){
 const t=row/bodyRows,ids=[];
 for(let col=0;col<cols;col++){
  const u=col/(cols-1),crossPos=2*u-1;
  let v=interpSource(front[col],back[col],smooth(t));
  if(row===bodyRows){
   // Last row reproduces the native split edge exactly in POS, morph, UV,
   // skeleton weights, and per-vertex custom attributes.
   v=back[col];
  }else{
   const central=Math.pow(Math.max(0,1-crossPos*crossPos),1.3);
   const env=Math.pow(Math.sin(Math.PI*t),2);
   const p=v.attributes.POSITION.slice();
   // The previous long plank followed a linear rear bridge at nearly equal Z.
   // Recess the central tissue into the pelvic shell with zero slope at both
   // ends. This deliberately reduces the projected dangling silhouette.
   const lift=(variant==='inset'?.066:.043)*env*(.76+.24*central);
   const lateral=(variant==='inset'?.015:.011)*env*crossPos*(.80+.20*central);
   p[2]+=lift;
   p[0]+=lateral;
   p[1]+=.0044*Math.sin(2*Math.PI*t)*central;
   v.attributes.POSITION=p;
   // Minor tissue variation remains from central anatomy source; it
   // decays toward native body without substituting garment topology.
  }
  ids.push(register(v));
 }
 grid.push(ids);
}
function linkZipper(near,far,out){
 let i=0,j=0;
 while(i<near.length-1||j<far.length-1){
  const a=i<near.length-1?(i+1)/(near.length-1):Infinity,
        b=j<far.length-1?(j+1)/(far.length-1):Infinity;
  if(a<=b){out.push(near[i],far[j],near[i+1]);i++;}
  else{out.push(near[i],far[j],far[j+1]);j++;}
 }
}
let newFaces=[];linkZipper(grid[0],grid[1],newFaces);
const skippedCells=[[5,8],[5,9],[6,8],[6,9]];
for(let row=1;row<bodyRows;row++)for(let col=0;col<cols-1;col++){
 if(skippedCells.some(([r,c])=>r===row&&c===col))continue;
 const a=grid[row][col],b=grid[row][col+1],c=grid[row+1][col],e=grid[row+1][col+1];
 newFaces.push(a,c,b,b,c,e);
}
// Eight genuine vertices around a 2×2 grid cutout; inner contour and blind
// floor are created from the same morphable, skinned tissue surface.
const hole=[grid[5][8],grid[5][9],grid[5][10],grid[6][10],
 grid[7][10],grid[7][9],grid[7][8],grid[6][8]];
function mean(rows){return rows[0].map((_,i)=>rows.reduce((a,b)=>a+b[i],0)/rows.length)}
const holeCenter=mean(hole.map(id=>ca.POSITION[id])),holeM=mean(hole.map(id=>cd.POSITION[id]));
const rings=[];
for(const [factor,depth,cavity,region]of[[.64,.0013,.16,.32],[.23,.006,.68,.43]]){
 const ids=[];
 for(const id of hole){
  const v=sourceVertex(ca,cd,id),p=v.attributes.POSITION,m=v.target.POSITION;
  v.attributes.POSITION=plus(holeCenter,times(minus(p,holeCenter),factor));
  v.attributes.POSITION[2]+=depth;
  v.target.POSITION=plus(holeM,times(minus(m,holeM),factor));
  v.attributes._ANATREGION=region;
  v.attributes._ANATCAVITY=cavity;
  v.attributes._TISSUE=.95;
  ids.push(register(v));
 }
 rings.push(ids);
}
const pitSource=sourceVertex(ca,cd,grid[6][9]);
pitSource.attributes.POSITION=[holeCenter[0],holeCenter[1],holeCenter[2]+.009];
pitSource.target.POSITION=holeM.slice();
pitSource.attributes._ANATREGION=.45;
pitSource.attributes._ANATCAVITY=.85;
pitSource.attributes._TISSUE=.99;
const pit=register(pitSource);
function ringBridge(a,b){
 for(let i=0;i<a.length;i++){let next=(i+1)%a.length;newFaces.push(a[i],b[i],a[next],a[next],b[i],b[next]);}
}
ringBridge(hole,rings[0]);ringBridge(rings[0],rings[1]);
for(let i=0;i<rings[1].length;i++)newFaces.push(rings[1][i],pit,rings[1][(i+1)%rings[1].length]);
// No duplicate / triangulation defects; no illegal mesh fan. Original user
// deleted face triples remain absent (new triangles all contain NEW indices).
for(let i=0;i<newFaces.length;i+=3){
 const [a,b,c]=newFaces.slice(i,i+3);
 if(new Set([a,b,c]).size!==3)throw Error('Degenerate index triple '+i);
}
coreI=coreI.concat(newFaces);
const geoms=ca.POSITION.map((p,i)=>plus(p,cd.POSITION[i]));
function checkFaces(P){let zero=0,min=1,maxEdge=0,maxArea=0;
 for(let i=0;i<newFaces.length;i+=3){
  const [a,b,c]=newFaces.slice(i,i+3).map(id=>P[id]);
  const area=length(cross(minus(b,a),minus(c,a)))*.5;
  if(area<1e-10)zero++;
  min=Math.min(min,area);maxArea=Math.max(maxArea,area);
  for(const e of[length(minus(a,b)),length(minus(b,c)),length(minus(c,a))])maxEdge=Math.max(maxEdge,e);
 }
 return {degenerateFaces:zero,minArea:min,maxArea,maxEdge};
}
const qualityRest=checkFaces(ca.POSITION),qualityOpen55=checkFaces(geoms);
if(qualityRest.degenerateFaces>0||qualityOpen55.degenerateFaces>0)throw Error('Degenerate new surface in rest/open55 '+JSON.stringify({qualityRest,qualityOpen55}));
function vertexNormals(P,I){
 const out=P.map(()=>[0,0,0]);
 for(let i=0;i<I.length;i+=3){
  const [a,b,c]=I.slice(i,i+3),n=cross(minus(P[b],P[a]),minus(P[c],P[a]));
  for(const k of[a,b,c])out[k]=plus(out[k],n);
 }
 return out.map(unit);
}
const normalRest=vertexNormals(ca.POSITION,coreI),normalOpen=vertexNormals(geoms,coreI);
const affected=new Set([...added,...arc]);
for(const id of affected){
 // Preserve original user central anatomy vertex positions; normal-only update
 // is the necessary seam transition to appended continuation.
 ca.NORMAL[id]=normalRest[id];cd.NORMAL[id]=minus(normalOpen[id],normalRest[id]);
}
const coreBoundary=edgesFor(coreI);
for(let i=0;i<arc.length-1;i++){const a=arc[i],b=arc[i+1],row=coreBoundary.get(a<b?a+':'+b:b+':'+a);
 if(row?.n!==2)throw Error('Core boundary not topologically closed at '+a+'-'+b);
}
for(const [key,id]of Object.entries(core.attributes))core.attributes[key]=push(ca[key],id);
for(const [key,id]of Object.entries(core.targets[0]))core.targets[0][key]=push(cd[key],id);
core.indices=pushIndex(coreI);
core.extras={...core.extras,rev96r15ExtendedNativeAnatomy:true,rev96r15NativeArcVertices:arc.length,
 rev96r15PosteriorNativeRimVertices:rim.length,rev96r15CurvedRows:bodyRows,
 rev96r15AddedFaces:newFaces.length/3,rev96r15AnalBlindPit:true};
const removed=primitives.splice(22,1)[0];
if(removed!==oldStrip)throw Error('Wrong old isolated strip removed');
const total=primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),cloth=primitives.reduce((n,p)=>n+(p.extras?.layer==='garment'?doc.accessors[p.indices].count/3:0),0);
if(total!==3610+12-oldFaces+newFaces.length/3||cloth!==370||doc.skins[0].joints.length!==63)throw Error('Output topology invariant mismatch');
// Original 101 user-deleted triangle triplets must never return.
const protectedFaces=new Map();
for(const v of snapshot.deletedFaces){const set=protectedFaces.get(v.primitive)||new Set();set.add(v.vertices.slice().sort((a,b)=>a-b).join(':'));protectedFaces.set(v.primitive,set);}
for(const [pi,removedKeys]of protectedFaces){
 const I=read(primitives[pi].indices);
 for(let i=0;i<I.length;i+=3){const key=I.slice(i,i+3).sort((a,b)=>a-b).join(':');
 if(removedKeys.has(key))throw Error('Manual trim face restored '+pi+' '+key);}
}
doc.extras={...doc.extras,revision:'rev96-user101-r15-inset-anatomical-saddle-'+variant,
 sourceSha256:originalSHA,userTrimSha256:snapshotSHA,
 userDeleted101Protected:true,manualSculptControls:106,originalManualPositions:754,
 bones:63,garmentFaces:370,originalSeparatePerineumRemoved:true,
 centralAnatomyExtendedWithinPrimitive13:true,curvedSurfaceRows:bodyRows,
 newTriangles:newFaces.length/3,bodyEdgeTrianglesAdded:12,
 explicitOriginalCentralBoundaryWeld:true,posteriorMatchedRimVertices:19,
 noFurtherDecimation:true,reviewStatus:'experimental'};
doc.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(doc)),jPad=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),
 bPad=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const H=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
H.write('glTF');H.writeUInt32LE(2,4);H.writeUInt32LE(12+8+jPad.length+8+bPad.length,8);
jh.writeUInt32LE(jPad.length);jh.write('JSON',4);bh.writeUInt32LE(bPad.length);bh.write('BIN\0',4);
const bytes=Buffer.concat([H,jh,jPad,bh,bPad]);
fs.writeFileSync(path.join(dir,name),bytes,{flag:'wx'});
const audit={schema:'xpz3d/f11/r15-anatomical-saddle',variant,input:src,inputSHA256:originalSHA,
 userSnapshotSHA256:snapshotSHA,output:name,outputSHA256:sha(bytes),totalTriangles:total,
 originalTriangles:3610,oldSeparatePerineumFacesRemoved:oldFaces,
 centralOriginalFaces:originalCoreFaces,centralExtendedFaces:coreI.length/3,
 newCentralFaces:newFaces.length/3,bodyNewFaces:12,
 newCoreVertices:ca.POSITION.length-oldCoreCount,
 bodyNewVertices:ba.POSITION.length-oldBodyCount,
 centralBoundaryEdgesWelded:20,posteriorNativeVerticesMatched:rim.length,
 garmentFaces:cloth,skinBones:63,protectedUserDeletedFaces:101,
 originalCentralVertexPositionsPreserved:true,
 sourceOpenBodyHolesNotAllClosed:true, geometryCandidateOnly:true,strictPoseReviewRequired:true,
 rearToBodyGeometricConnectionNotLiterallySameGLTFIndex:true,
 qualityRest,qualityOpen55,analBlindPit:true,poseReviewPending:true,
 removedOld7ColumnSeparatePrimitive:true,
 rim,arc,splitTriangles:touched};
fs.writeFileSync(path.join(dir,reportName),JSON.stringify(audit,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:name,sha256:audit.outputSHA256,totalTriangles:total,newCentralFaces:audit.newCentralFaces,newCoreVertices:audit.newCoreVertices,bodyExtra:audit.bodyNewFaces,source101FacesStillDeleted:true,qualityRest,qualityOpen55},null,2));
