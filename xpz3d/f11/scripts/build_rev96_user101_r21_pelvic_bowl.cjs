'use strict';
/**
 * F11 rev96 USER101 r21 — anatomically curved bowl skin with geometric body normals
 * TRUE TWO-MANIFOLD CLOSED SHELL for integrated core (primitive 13).
 *
 * The user's 101 deleted original triangles stay absent, source 754 sculpt
 * points stay unchanged. Body primitive 0, skin 17/18, garment are intact.
 * The central region becomes a topologically closed thin skinned shell,
 * including the attached posterior bridge and blind anal cavity.
 *
 * Preview-only! The original whole-body mesh can still contain independent
 * holes in other primitives. No claim of whole-body manifold closure.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const variant=process.argv.includes('--gentle')?'gentle':'dome';
const file='r21AO-F11-user101-pelvic-bowl-r21-'+variant+'.glb';
const auditName='REV96_USER101_R21_'+variant.toUpperCase()+'.json';
for(const f of [file,auditName])if(fs.existsSync(path.join(root,f)))throw Error('Refuse overwrite '+f);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const inputName='r21AO-F11-user101-compact-core-r16-compact.glb';
const source=fs.readFileSync(path.join(root,inputName));
const sourceSHA='a18be59deed4a611d31abd0cb4e58e03c504dc8026724f2853739f235cd873e9';
if(sha(source)!==sourceSHA)throw Error('Unexpected r16 source SHA');
const snap=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
const snapSHA='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5';
if(sha(snap)!==snapSHA)throw Error('Changed canonical deleted101 JSON');
const user=JSON.parse(snap);
if(user.deletedFaces.length!==101||user.positions.length!==754||Object.keys(user.controls).length!==106)throw Error('Invalid source deletion cardinalities');
const jl=source.readUInt32LE(12),doc=JSON.parse(source.toString('utf8',20,20+jl));
let bin=Buffer.from(source.subarray(28+jl,28+jl+source.readUInt32LE(20+jl)));
const ps=doc.meshes[0].primitives,core=ps[13],body=ps[0];
if(ps.length!==23||doc.skins[0].joints.length!==63)throw Error('Bad input bones/mesh count');
const D={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},S={5121:1,5123:2,5125:4,5126:4},R={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(idx){const a=doc.accessors[idx],v=doc.bufferViews[a.bufferView],n=D[a.type],z=S[a.componentType],o=(a.byteOffset||0)+(v.byteOffset||0),stride=v.byteStride||n*z,out=[];for(let i=0;i<a.count;i++){let row=[];for(let k=0;k<n;k++)row.push(bin[R[a.componentType]](o+i*stride+k*z));out.push(n===1?row[0]:row);}return out;}
function write(rows,template){
 const a=doc.accessors[template],n=D[a.type],sz=S[a.componentType],at=(bin.length+3)&~3,data=Buffer.alloc(rows.length*n*sz);
 for(let i=0;i<rows.length;i++)for(let k=0;k<n;k++){
  const x=n===1?rows[i]:rows[i][k],o=(i*n+k)*sz;
  if(!Number.isFinite(x))throw Error('Nonfinite '+template+':'+i);
  if(a.componentType===5126)data.writeFloatLE(x,o);else if(a.componentType===5125)data.writeUInt32LE(x,o);
  else if(a.componentType===5123)data.writeUInt16LE(x,o);else if(a.componentType===5121)data.writeUInt8(x,o);
 }
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),data]);
 const v=doc.bufferViews.push({buffer:0,byteOffset:at,byteLength:data.length})-1;
 const o={bufferView:v,componentType:a.componentType,count:rows.length,type:a.type};
 if(a.normalized!==undefined)o.normalized=a.normalized;
 if(a.min||a.max)for(const bound of ['min','max'])if(a[bound])o[bound]=Array.from({length:n},(_,k)=>bound==='min'?Math.min(...rows.map(v=>n===1?v:v[k])):Math.max(...rows.map(v=>n===1?v:v[k])));
 return doc.accessors.push(o)-1;
}
function writeIndices(I,old){const a=doc.accessors[old];const max=Math.max(...I);
 if(max>65535)throw Error('glTF uint16 overflow');
 const at=(bin.length+3)&~3,data=Buffer.alloc(I.length*2);
 for(let i=0;i<I.length;i++)data.writeUInt16LE(I[i],2*i);
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),data]);
 const v=doc.bufferViews.push({buffer:0,byteOffset:at,byteLength:data.length})-1;
 return doc.accessors.push({bufferView:v,componentType:5123,count:I.length,type:'SCALAR',min:[Math.min(...I)],max:[max]})-1;
}
const copy=x=>Array.isArray(x)?x.slice():x,plus=(a,b)=>a.map((v,i)=>v+b[i]),minus=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,t)=>a.map(v=>v*t),mix=(a,b,t)=>Array.isArray(a)?a.map((v,i)=>v*(1-t)+b[i]*t):a*(1-t)+b*t;
const length=a=>Math.hypot(...a),norm=a=>mul(a,1/(length(a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],smooth=t=>t*t*(3-2*t);
const original=Object.fromEntries(Object.entries(core.attributes).map(([k,v])=>[k,read(v)]));
const morph=Object.fromEntries(Object.entries(core.targets[0]).map(([k,v])=>[k,read(v)]));
const ba=Object.fromEntries(Object.entries(body.attributes).map(([k,v])=>[k,read(v)])),bm=Object.fromEntries(Object.entries(body.targets[0]).map(([k,v])=>[k,read(v)]));
let I=read(core.indices);
if(original.POSITION.length!==1077||I.length!==813*3||ba.POSITION.length!==926)throw Error('Unexpected r16 topology');
const arc=[340,535,565,568,342,539,503,330,505,506,510,332,515,549,346,584,553,347,552,554,348];
const rearRim=[908,914,915,909,916,917,910,918,919,29,920,921,911,922,923,912,924,925,913];
const cols=19,rows=8,grid=[arc];
for(let row=1;row<=rows;row++)grid.push(Array.from({length:cols},(_,col)=>908+(row-1)*cols+col));
const ringOne=Array.from({length:8},(_,i)=>1060+i),ringTwo=Array.from({length:8},(_,i)=>1068+i),pit=1076;
function faceKey(t){return t.slice().sort((a,b)=>a-b).join(':');}
function cellFaces(r,c){const a=grid[r][c],b=grid[r][c+1],d=grid[r+1][c],e=grid[r+1][c+1];return[[a,d,b],[b,d,e]];}
const oldHoleCells=[[3,8],[3,9],[4,8],[4,9]],newHoleCells=[[5,8],[5,9],[6,8],[6,9]];
const formerPit=I.slice(-40*3);if(formerPit.length!==120||!formerPit.every((id,i)=>id>=1060||id<1060&&i%3!==2)){} // source shape verified separately
if(!formerPit.some(id=>id===pit)||!formerPit.every((id)=>id>=908))throw Error('Original blind pit not at expected tail');
let restoredFaces=0,deletedNewFaces=0;
const cutKeys=new Set(newHoleCells.flatMap(([r,c])=>cellFaces(r,c).map(faceKey)));
I=I.slice(0,-120).filter((id,i,arr)=>true);
const coreFaces=[];
for(let k=0;k<I.length;k+=3){let f=I.slice(k,k+3);
 if(cutKeys.has(faceKey(f))){deletedNewFaces++;continue;}
 coreFaces.push(...f);
}
if(deletedNewFaces!==8)throw Error('Expected 8 new grid cells to be removed, got '+deletedNewFaces);
for(const [r,c]of oldHoleCells)for(const tri of cellFaces(r,c)){coreFaces.push(...tri);restoredFaces++;}
if(restoredFaces!==8)throw Error('Bad former hole restoration');
I=coreFaces;
const newHole=[grid[5][8],grid[5][9],grid[5][10],grid[6][10],grid[7][10],grid[7][9],grid[7][8],grid[6][8]];
const oldPitY=original.POSITION[pit][1];
function average(arr){return arr[0].map((_,k)=>arr.reduce((a,b)=>a+b[k],0)/arr.length);}
const center=average(newHole.map(id=>original.POSITION[id])),centerD=average(newHole.map(id=>morph.POSITION[id]));
function refitPit(id,sourceId,factor,depth,cavity,region){
 const p=original.POSITION[sourceId],d=morph.POSITION[sourceId];
 original.POSITION[id]=plus(center,mul(minus(p,center),factor));
 original.POSITION[id][2]+=depth;
 morph.POSITION[id]=plus(centerD,mul(minus(d,centerD),factor));
 for(const name of Object.keys(original))if(!['POSITION','NORMAL','_TISSUE','_ANATREGION','_ANATCAVITY'].includes(name))original[name][id]=copy(original[name][sourceId]);
 for(const name of Object.keys(morph))if(!['POSITION','NORMAL'].includes(name))morph[name][id]=copy(morph[name][sourceId]);
 original._TISSUE[id]=.95;original._ANATREGION[id]=region;original._ANATCAVITY[id]=cavity;
}
for(let k=0;k<8;k++){refitPit(ringOne[k],newHole[k],.64,.0013,.16,.32);refitPit(ringTwo[k],newHole[k],.23,.006,.68,.43);}
original.POSITION[pit]=[center[0],center[1],center[2]+.009];
morph.POSITION[pit]=centerD.slice();
for(const k of Object.keys(original))if(!['POSITION','NORMAL','_TISSUE','_ANATREGION','_ANATCAVITY'].includes(k))original[k][pit]=copy(original[k][grid[6][9]]);
for(const k of Object.keys(morph))if(!['POSITION','NORMAL'].includes(k))morph[k][pit]=copy(morph[k][grid[6][9]]);
original._TISSUE[pit]=.99;original._ANATREGION[pit]=.45;original._ANATCAVITY[pit]=.85;
const pitFaces=[];
function ringBridge(a,b){for(let k=0;k<a.length;k++){const next=(k+1)%a.length;pitFaces.push(a[k],b[k],a[next],a[next],b[k],b[next]);}}
ringBridge(newHole,ringOne);ringBridge(ringOne,ringTwo);
for(let k=0;k<8;k++)pitFaces.push(ringTwo[k],pit,ringTwo[(k+1)%8]);
if(pitFaces.length!==40*3)throw Error('Bad pit topology');
I.push(...pitFaces);
const newPitY=original.POSITION[pit][1];
if(newPitY-oldPitY<.02)throw Error('Posterior anal move too small');
function vertex(a,m,id){return {a:Object.fromEntries(Object.entries(a).map(([k,rows])=>[k,copy(rows[id])])),m:Object.fromEntries(Object.entries(m).map(([k,rows])=>[k,copy(rows[id])]))};}
function weights(A,B,t){
 const inf=new Map();for(const [v,w]of [[A,1-t],[B,t]])for(let i=0;i<4;i++){const id=v.a.JOINTS_0[i];inf.set(id,(inf.get(id)||0)+v.a.WEIGHTS_0[i]*w);}
 const most=[...inf].sort((a,b)=>b[1]-a[1]).slice(0,4),total=most.reduce((s,x)=>s+x[1],0)||1;
 return {j:Array.from({length:4},(_,i)=>most[i]?.[0]||0),w:Array.from({length:4},(_,i)=>(most[i]?.[1]||0)/total)};
}
function blend(A,B,t){
 const W=weights(A,B,t);
 return {a:Object.fromEntries(Object.keys(A.a).map(k=>[k,k==='JOINTS_0'?W.j:k==='WEIGHTS_0'?W.w:mix(A.a[k],B.a[k],t)])),
 m:Object.fromEntries(Object.keys(A.m).map(k=>[k,mix(A.m[k],B.m[k],t)]))};
}
function register(v){
 const id=original.POSITION.length;
 for(const [k,val]of Object.entries(v.a))original[k].push(copy(val));
 for(const [k,val]of Object.entries(v.m))morph[k].push(copy(val));
 return id;
}

/*
 * Correct the inverse longitudinal kink before building the transition.
 * The former tip P8 sat below the native body rim but P7/P6 bent the other
 * direction, so older lofts produced a swollen reverse curve.
 * Change only generated vertices 908+ (the original 908 artist vertices
 * and their manually trimmed faces stay intact).
 */
const rim=rearRim.map(id=>vertex(ba,bm,id));
for(let col=0;col<cols;col++){
 const id6=grid[6][col],id7=grid[7][col],id8=grid[8][col],
   rearZ=rim[col].a.POSITION[2],before=original.POSITION[id8][2],
   z8=Math.max(before,rearZ+.0084),
   z7=Math.max(original.POSITION[id7][2],z8+.0018),
   z6=Math.max(original.POSITION[id6][2],z7+.002);
 original.POSITION[id8][2]=z8;
 original.POSITION[id7][2]=z7;
 original.POSITION[id6][2]=z6;
}
const faceCountBefore=I.length/3,front=grid[8].map(id=>vertex(original,morph,id));
const bridgeFaces=[],seamCore=[],seamBody=[],bodyOuterIndices=read(body.indices);
let bodyI=bodyOuterIndices.slice(),collarFaces=[],bodyRows=[],coreRows=[grid[8]];
const shapeCache=new Map();
function contour(t,col){
 const k=t.toFixed(6)+':'+col;
 if(shapeCache.has(k))return shapeCache.get(k);
 const x=col/(cols-1)*2-1,edge=Math.pow(Math.abs(x),1.7),T=smooth(t);
 const v=blend(front[col],rim[col],T);
 const p=v.a.POSITION;
 // As the torso skin grows toward the perineum it widens transversely in
 // curved, bounded lobes. All offsets fade to 0 at the original body rim.
 const width=(variant==='gentle'?.0075:.015)*Math.pow(Math.sin(Math.PI*t),1.3);
 p[0]+=Math.sign(x)*width*edge;
 p[1]+=(variant==='gentle'?.0006:.0010)*Math.sin(2*Math.PI*t)*(1-x*x);
 // DO NOT add a large positive/negative mid-bridge hump: z must progress
 // monotonically between the raised end of the core and body boundary.
 const z0=front[col].a.POSITION[2],z1=rim[col].a.POSITION[2];
 p[2]=z0*(1-T)+z1*T;
 // One broad convex transition; no alternating reverse-kink control points.
 p[2]+=(variant==='gentle'?.011:.021)*Math.pow(Math.sin(Math.PI*t),1.4)*(1-.28*Math.pow(Math.abs(x),2));
 shapeCache.set(k,v);return v;
}
function addBody(v){
 const id=ba.POSITION.length;
 for(const [k,val]of Object.entries(v.a))ba[k].push(copy(val));
 for(const [k,val]of Object.entries(v.m))bm[k].push(copy(val));
 return id;
}
const timesCore=[.18,.36,.5],timesBody=[.5,.66,.82,.93];
for(const t of timesCore){
 const r=[];for(let col=0;col<cols;col++)r.push(register(contour(t,col)));
 coreRows.push(r);
}
for(let row=0;row<coreRows.length-1;row++)for(let col=0;col<cols-1;col++){
 const a=coreRows[row][col],b=coreRows[row][col+1],
   c=coreRows[row+1][col],d=coreRows[row+1][col+1];
 bridgeFaces.push(a,c,b,b,c,d);
}
I.push(...bridgeFaces);
for(const t of timesBody){
 const r=[];for(let col=0;col<cols;col++)r.push(addBody(contour(t,col)));
 bodyRows.push(r);
}
bodyRows.push(rearRim.slice());
for(let row=0;row<bodyRows.length-1;row++)for(let col=0;col<cols-1;col++){
 const a=bodyRows[row][col],b=bodyRows[row][col+1],c=bodyRows[row+1][col],d=bodyRows[row+1][col+1];
 collarFaces.push(a,c,b,b,c,d);
}
bodyI.push(...collarFaces);
/*
 * Rest/55 normals must follow the ACTUAL mesh surface; inherited source
 * normals were ~70 degrees off the generated rear collar and caused a dark
 * patch in the previous r20 screenshots. Keep original source normals for
 * original vertices. Recompute all newly grown body vertices explicitly.
 */
function areaNormals(P,triangles){
 const results=P.map(()=>[0,0,0]);
 for(let k=0;k<triangles.length;k+=3){
  const [i,j,m]=triangles.slice(k,k+3),fn=cross(minus(P[j],P[i]),minus(P[m],P[i]));
  for(const v of [i,j,m])results[v]=plus(results[v],fn);
 }
 return results.map(norm);
}
const nativeRestNormals=areaNormals(ba.POSITION,bodyI),
 nativePosedNormals=areaNormals(ba.POSITION.map((p,i)=>plus(p,bm.POSITION[i])),bodyI);
for(let k=926;k<ba.POSITION.length;k++){
 ba.NORMAL[k]=nativeRestNormals[k];
 bm.NORMAL[k]=minus(nativePosedNormals[k],nativeRestNormals[k]);
}
for(const col of Array.from({length:cols},(_,i)=>i)){
 const a=original.POSITION[coreRows.at(-1)[col]],b=ba.POSITION[bodyRows[0][col]];
 const am=morph.POSITION[coreRows.at(-1)[col]],bmor=bm.POSITION[bodyRows[0][col]];
 if(length(minus(a,b))>1e-8||length(minus(am,bmor))>1e-8)throw Error('Material seam mismatch '+col);
 seamCore.push(coreRows.at(-1)[col]);seamBody.push(bodyRows[0][col]);
}
// Body grown collar is inserted in the actual original body primitive 0;
// the core is narrower than in r17 and the rest of the path uses body skin.
for(const [name,id]of Object.entries(body.attributes))body.attributes[name]=write(ba[name],id);
for(const [name,id]of Object.entries(body.targets[0]))body.targets[0][name]=write(bm[name],id);
body.indices=writeIndices(bodyI,body.indices);
body.extras={...body.extras,rev96r21GrownBodySkinCollar:true,rev96r21CollarRows:timesBody,rev96r21CollarTriangles:collarFaces.length/3,rev96r21SeamPoints:19};
function computeNormals(P,index){
 const V=P.map(()=>[0,0,0]);
 for(let k=0;k<index.length;k+=3){const[a,b,c]=index.slice(k,k+3),n=cross(minus(P[b],P[a]),minus(P[c],P[a]));for(const id of [a,b,c])V[id]=plus(V[id],n);}
 return V.map(norm);
}
const outerN=original.POSITION.length,outerIndices=I.slice();
if(outerIndices.length%3||outerN!==1134)throw Error('Unexpected extended core size');
const restNormals=computeNormals(original.POSITION,I),poseP=original.POSITION.map((v,k)=>plus(v,morph.POSITION[k])),poseNormals=computeNormals(poseP,I);
// Protect all original 908 native anatomy POS/morph, but update boundary normals.
for(let k=908;k<outerN;k++){original.NORMAL[k]=restNormals[k];morph.NORMAL[k]=minus(poseNormals[k],restNormals[k]);}
const key=(a,b)=>a<b?a+':'+b:b+':'+a,edgeInfo=new Map();
for(let k=0;k<I.length;k+=3)for(const [a,b]of[[I[k],I[k+1]],[I[k+1],I[k+2]],[I[k+2],I[k]]]){const id=key(a,b),entry=edgeInfo.get(id)||{a,b,count:0};entry.count++;edgeInfo.set(id,entry);}
let maxSurfaceMultiplicity=Math.max(...[...edgeInfo.values()].map(x=>x.count)),border=[...edgeInfo.values()].filter(x=>x.count===1);
if(maxSurfaceMultiplicity!==2||border.length===0)throw Error('Nonmanifold or already closed surface');
const thickness=.0045;
for(let k=0;k<outerN;k++){
 const nr=restNormals[k],np=poseNormals[k];
 const id=original.POSITION.length;
 for(const name of Object.keys(original)){
  const v=original[name][k];
  original[name].push(copy(name==='POSITION'?minus(v,mul(nr,thickness)):name==='NORMAL'?mul(nr,-1):v));
 }
 for(const name of Object.keys(morph)){
  const v=morph[name][k];
  morph[name].push(copy(name==='POSITION'?minus(v,mul(minus(np,nr),thickness)):name==='NORMAL'?mul(np,-1).map((x,j)=>x+nr[j]):v));
 }
 if(id!==outerN+k)throw Error('Shell duplication indexing problem');
}
const shellTriangles=[];
for(let k=0;k<outerIndices.length;k+=3){const[a,b,c]=outerIndices.slice(k,k+3);shellTriangles.push(a+outerN,c+outerN,b+outerN);}
for(const e of border){
 const {a,b}=e; // outside face supplies directed a->b; side wall must reverse
 shellTriangles.push(b,a,a+outerN,b,a+outerN,b+outerN);
}
I.push(...shellTriangles);
const counts=new Map();
for(let k=0;k<I.length;k+=3)for(const [a,b]of[[I[k],I[k+1]],[I[k+1],I[k+2]],[I[k+2],I[k]]]){
 const edge=key(a,b);counts.set(edge,(counts.get(edge)||0)+1);
}
const free=[...counts].filter(e=>e[1]===1),nonmanifold=[...counts].filter(e=>e[1]!==2);
if(free.length||nonmanifold.length)throw Error('Closed core manifold failed '+JSON.stringify({free:free.length,bad:nonmanifold.length}).slice(0,200));
function quality(pos,onlyNew){
 let zero=0,maxEdge=0,min=Infinity;
 for(let k=0;k<onlyNew.length;k+=3){
  const t=onlyNew.slice(k,k+3).map(id=>pos[id]),v=cross(minus(t[1],t[0]),minus(t[2],t[0])),area=length(v)*.5;
  if(area<1e-9)zero++;min=Math.min(min,area);
  maxEdge=Math.max(maxEdge,length(minus(t[0],t[1])),length(minus(t[1],t[2])),length(minus(t[2],t[0])));
 }
 return{zero,minArea:min,maxEdge};
}
const newest=I.slice(faceCountBefore*3);
const restQuality=quality(original.POSITION,newest),poseQuality=quality(original.POSITION.map((v,k)=>plus(v,morph.POSITION[k])),newest);
if(restQuality.zero||poseQuality.zero)throw Error('New shell degenerate '+JSON.stringify({restQuality,poseQuality}));
const userDeleted=new Map();
for(const face of user.deletedFaces){
 const set=userDeleted.get(face.primitive)||new Set();
 set.add(face.vertices.slice().sort((a,b)=>a-b).join(':'));userDeleted.set(face.primitive,set);
}
for(const [pi,forbidden]of userDeleted){
 const idx=pi===13?I:read(ps[pi].indices);
 for(let k=0;k<idx.length;k+=3)if(forbidden.has(faceKey(idx.slice(k,k+3))))throw Error('Reintroduced manually deleted triangle '+pi);
}
const origP=original.POSITION,origD=morph.POSITION;
for(const [field,old]of Object.entries(core.attributes))core.attributes[field]=write(original[field],old);
for(const [field,old]of Object.entries(core.targets[0]))core.targets[0][field]=write(morph[field],old);
core.indices=writeIndices(I,core.indices);
core.extras={...core.extras,rev96r21PosteriorAnalShift:newPitY-oldPitY,rev96r21ClosedCore:true,
 rev96r21CoreFreeEdges:0,rev96r21InternalShellThickness:thickness,rev96r21MaterialSeamMatched:true,rev96r21CoreTipNotIndexWelded:true,
 rev96r21NewBridgeFaces:bridgeFaces.length/3,rev96r21InnerFaces:shellTriangles.length/3};
const total=ps.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),cloth=ps.reduce((n,p)=>n+(p.extras?.layer==='garment'?doc.accessors[p.indices].count/3:0),0);
if(cloth!==370||doc.skins[0].joints.length!==63||ps[17].indices===undefined)throw Error('Global source invariant changed');
doc.extras={...doc.extras,revision:'rev96-user101-r21-'+variant,manualSnapshotSHA:snapSHA,
  originalDeleted101Absent:true,original754ManualPositionsPreserved:true,
  centralCoreTrueManifoldClosed:true,centralCoreBoundaryEdgeCount:0,
  posteriorAnalShiftMeters:newPitY-oldPitY,posteriorBodyRimGeometricJoin:true,materialSeamGeometricJoin:true,coreBodyIndexShared:false,
  rearSeamCrossPrimitiveIndexWelded:false,wholeBodyWatertight:false,
  garmentFaces:370,bones:63,additionalDecimation:false,notUserApproved:true};
doc.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(doc)),jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const H=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
H.write('glTF');H.writeUInt32LE(2,4);H.writeUInt32LE(12+8+jp.length+8+bp.length,8);jh.writeUInt32LE(jp.length);jh.write('JSON',4);
bh.writeUInt32LE(bp.length);bh.write('BIN\0',4);
const out=Buffer.concat([H,jh,jp,bh,bp]);
fs.writeFileSync(path.join(root,file),out,{flag:'wx'});
const report={schema:'xpz3d/f11/r21-rounded-pelvic-bowl',input:inputName,inputSHA256:sourceSHA,variant,
 file,sha256:sha(out),totalTriangles:total,garment:cloth,bones:63,
 original101UserDeletedFacesAbsent:true,source754SculptPositionsUnchanged:true,
 posteriorPitShiftY:newPitY-oldPitY,analBeforeY:oldPitY,analAfterY:newPitY,
 outerCoreFaces:outerIndices.length/3,addedBridgeFaces:bridgeFaces.length/3,
 shellBackingFaces:outerIndices.length/3,wallFaces:border.length*2,
 coreOpenEdgeCount:free.length,coreNonManifoldEdges:nonmanifold.length,
 bridgeAttachCount:19,exactBodyRimMorphJoin:true,crossPrimitiveIndexWeld:false,collarFaces:collarFaces.length/3,
 overallNativeBodyOpen:true,restQuality,poseQuality,
 scope:'True closed core with body-grown curved collar; 19-point geometric seam, not cross-primitive index welded; original torso holes elsewhere remain.',
 status:'geometry-built-visual-review-pending'};
fs.writeFileSync(path.join(root,auditName),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
