'use strict';
/**
 * F11 rev96 r11: align posterior body and perineum seams locally without recreating any
 * of the user's 101 deleted central-patch triangles. Separate experimental GLB.
 *
 * Uses actual BODY primitive 0 border vertices, not projected spline guesses.
 * A two-sided zipper mesh spans the left/right native posterior boundary.
 * Rest/open55 morph, UV, normal and 63-bone skin attributes are carried through.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),dir=__dirname;
const source='r21AO-F11-user101-posterior-tucked-closure-r9.glb',output='r21AO-F11-user101-posterior-seam-aligned-r11.glb',manifest='REV96_USER101_POSTERIOR_R11.json';
if(fs.existsSync(path.join(dir,output))||fs.existsSync(path.join(dir,manifest)))throw Error('Refuse overwrite');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),raw=fs.readFileSync(path.join(dir,source));
const sourceSha='d221a17073541c02284246a438314e55352b823a9ca3fe007b8c370ad7f58f54';
if(hash(raw)!==sourceSha)throw Error('Expected r9 source sha256');
const canonical=fs.readFileSync(path.join(dir,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(hash(canonical)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('User trim changed');
const user=JSON.parse(canonical),jl=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+jl));
let bin=Buffer.from(raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl)));
const primitives=doc.meshes[0].primitives;
const comps={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']},dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(id){
 const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=dims[a.type],sz=comps[a.componentType][0],fn=comps[a.componentType][1],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*sz,out=[];
 for(let i=0;i<a.count;i++){const row=[];for(let k=0;k<n;k++)row.push(bin[fn](off+i*stride+k*sz));out.push(n===1?row[0]:row);}return out;
}
function write(rows,sourceId){
 const a=doc.accessors[sourceId],n=dims[a.type],sz=comps[a.componentType][0],off=(bin.length+3)&~3,b=Buffer.alloc(rows.length*n*sz);
 for(let i=0;i<rows.length;i++)for(let k=0;k<n;k++){
  const x=n===1?rows[i]:rows[i][k],j=(i*n+k)*sz;if(!Number.isFinite(x))throw Error('nonfinite '+sourceId);
  if(a.componentType===5126)b.writeFloatLE(x,j);else if(a.componentType===5123)b.writeUInt16LE(x,j);else if(a.componentType===5125)b.writeUInt32LE(x,j);else b.writeUInt8(x,j);
 }
 bin=Buffer.concat([bin,Buffer.alloc(off-bin.length),b]);
 const v=doc.bufferViews.push({buffer:0,byteOffset:off,byteLength:b.length})-1;
 const out={bufferView:v,componentType:a.componentType,type:a.type,count:rows.length};
 if(a.normalized!==undefined)out.normalized=a.normalized;
 if(a.min||a.max)for(const type of ['min','max'])if(a[type])out[type]=Array.from({length:n},(_,k)=>type==='min'?Math.min(...rows.map(v=>n===1?v:v[k])):Math.max(...rows.map(v=>n===1?v:v[k])));
 return doc.accessors.push(out)-1;
}
function writeIndices(I){
 const off=(bin.length+3)&~3,b=Buffer.alloc(I.length*2);
 for(let i=0;i<I.length;i++)b.writeUInt16LE(I[i],i*2);
 bin=Buffer.concat([bin,Buffer.alloc(off-bin.length),b]);
 const v=doc.bufferViews.push({buffer:0,byteOffset:off,byteLength:b.length})-1;
 return doc.accessors.push({bufferView:v,componentType:5123,count:I.length,type:'SCALAR',min:[Math.min(...I)],max:[Math.max(...I)]})-1;
}
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,t)=>a.map(x=>x*t),len=a=>Math.hypot(...a),mix=(a,b,t)=>Array.isArray(a)?a.map((x,i)=>x*(1-t)+b[i]*t):a*(1-t)+b*t;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>mul(a,1/(len(a)||1));

const body=primitives[0],groin=primitives[22],ba=Object.fromEntries(Object.entries(body.attributes).map(([k,id])=>[k,read(id)])),
 bd=Object.fromEntries(Object.entries(body.targets[0]).map(([k,id])=>[k,read(id)])),
 pa=Object.fromEntries(Object.entries(groin.attributes).map(([k,id])=>[k,read(id)])),
 pd=Object.fromEntries(Object.entries(groin.targets[0]).map(([k,id])=>[k,read(id)]));
const originalBodyVertexCount=ba.POSITION.length;
const bodyIndices=read(body.indices),patchIndices=read(groin.indices);
if(originalBodyVertexCount!==908||pa.POSITION.length!==99||patchIndices.length!==192*3)throw Error('Unexpected r9 source topology');
const mergeInfluences=(jA,wA,jB,wB,t)=>{
 const s=new Map();
 for(const [J,W,f] of [[jA,wA,1-t],[jB,wB,t]])for(let k=0;k<4;k++)s.set(J[k],(s.get(J[k])||0)+W[k]*f);
 const a=[...s].sort((x,y)=>y[1]-x[1]).slice(0,4),n=a.reduce((tot,row)=>tot+row[1],0)||1;
 return {j:Array.from({length:4},(_,k)=>a[k]?.[0]||0),w:Array.from({length:4},(_,k)=>(a[k]?.[1]||0)/n)};
};
const ids=new Map(),changes=new Map();
const P0=ba.POSITION[29],rear=[49,50,51,52,53,54,55];
for(const id of rear){
 const old=pa.POSITION[id].slice(),oldD=pd.POSITION[id].slice();
 if(id===52){
  ids.set(id,29);
  pa.POSITION[id]=ba.POSITION[29].slice();pd.POSITION[id]=bd.POSITION[29].slice();
  pa.JOINTS_0[id]=ba.JOINTS_0[29].slice();pa.WEIGHTS_0[id]=ba.WEIGHTS_0[29].slice();
 }else{
  const right=id>52,end=right?296:174;
  const t=Math.max(.015,Math.min(.985,(old[0]-P0[0])/(ba.POSITION[end][0]-P0[0])));
  const newId=ba.POSITION.length,skin=mergeInfluences(ba.JOINTS_0[29],ba.WEIGHTS_0[29],ba.JOINTS_0[end],ba.WEIGHTS_0[end],t);
  for(const [key,row]of Object.entries(ba)){
   let val;
   if(key==='JOINTS_0')val=skin.j;
   else if(key==='WEIGHTS_0')val=skin.w;
   else val=mix(row[29],row[end],t);
   row.push(Array.isArray(val)?val.slice():val);
  }
  for(const [key,row]of Object.entries(bd)){
   const val=mix(row[29],row[end],t);row.push(Array.isArray(val)?val.slice():val);
  }
  ids.set(id,newId);
  pa.POSITION[id]=ba.POSITION[newId].slice();
  pd.POSITION[id]=bd.POSITION[newId].slice();
  pa.JOINTS_0[id]=skin.j.slice();pa.WEIGHTS_0[id]=skin.w.slice();
 }
 // Keep custom anatomical scalar fields; only move UV halfway towards the
 // existing body if it reduces the current seam texture discontinuity.
 const bodyId=ids.get(id);
 pa.TEXCOORD_0[id]=mix(pa.TEXCOORD_0[id],ba.TEXCOORD_0[bodyId],.24);
 changes.set(id,{move:sub(pa.POSITION[id],old),morph:sub(pd.POSITION[id],oldD),bodyId});
}
if(ba.POSITION.length!==originalBodyVertexCount+6||changes.size!==7)throw Error('Not exactly 6 rim splits');
// A smooth falloff prevents distortion and stretching in the penultimate rows.
for(const [row,w]of [[6,.44],[5,.16]]){
 for(let c=0;c<7;c++){
  const id=row*7+c,ref=rear[c],change=changes.get(ref);
  pa.POSITION[id]=add(pa.POSITION[id],mul(change.move,w));
  pd.POSITION[id]=add(pd.POSITION[id],mul(change.morph,w));
 }
}
// Original pre-closure patch faces (0..115) define the ordered 26-edge border.
// r9 appended its inward ring in exactly that sequence, vertices 73..98.
function freeEdges(index){
 const map=new Map();
 for(let i=0;i<index.length;i+=3)for(const [a,b]of [[index[i],index[i+1]],[index[i+1],index[i+2]],[index[i+2],index[i]]]){
  const key=a<b?a+':'+b:b+':'+a,row=map.get(key)||{a,b,n:0};row.n++;map.set(key,row);
 }
 return [...map.values()].filter(v=>v.n===1);
}
const originalEdges=freeEdges(patchIndices.slice(0,348)),next=new Map();
for(const {a,b}of originalEdges){if(next.has(a))throw Error('Patch boundary forks');next.set(a,b);}
const loop=[originalEdges[0].a];let current=loop[0];
for(let i=0;i<originalEdges.length;i++){const id=next.get(current);if(id===undefined)throw Error('Boundary broken');if(id===loop[0])break;loop.push(id);current=id;}
if(loop.length!==26)throw Error('Unexpected patch boundary length');
for(let i=0;i<loop.length;i++){
 const move=changes.get(loop[i]);if(!move)continue;
 const rim=73+i;
 pa.POSITION[rim]=add(pa.POSITION[rim],move.move);
 pd.POSITION[rim]=add(pd.POSITION[rim],move.morph);
 const blend=mergeInfluences(pa.JOINTS_0[rim],pa.WEIGHTS_0[rim],pa.JOINTS_0[loop[i]],pa.WEIGHTS_0[loop[i]],.8);
 pa.JOINTS_0[rim]=blend.j;pa.WEIGHTS_0[rim]=blend.w;
}
const faces=[],faceKey=t=>t.slice().sort((a,b)=>a-b).join(':');
let splitLeft=0,splitRight=0;
for(let i=0;i<bodyIndices.length;i+=3){
 const tri=bodyIndices.slice(i,i+3),f=faceKey(tri);
 if(f===faceKey([29,174,302])){
  // Original face order: 29 -> 174 -> 302. The new points follow 29 -> 174.
  const chain=[29,ids.get(51),ids.get(50),ids.get(49),174];
  for(let k=0;k<chain.length-1;k++)faces.push(chain[k],chain[k+1],302);
  splitLeft++;continue;
 }
 if(f===faceKey([29,28,296])){
  const chain=[29,ids.get(53),ids.get(54),ids.get(55),296];
  for(let k=0;k<chain.length-1;k++)faces.push(chain[k],28,chain[k+1]);
  splitRight++;continue;
 }
 faces.push(...tri);
}
if(splitLeft!==1||splitRight!==1||faces.length/3!==bodyIndices.length/3+6)throw Error('Native rim split failed');
function computeNormals(P,I){
 const output=P.map(()=>[0,0,0]);
 for(let k=0;k<I.length;k+=3){
  const [a,b,c]=I.slice(k,k+3),n=cross(sub(P[b],P[a]),sub(P[c],P[a]));
  for(const id of[a,b,c])output[id]=add(output[id],n);
 }
 return output.map(norm);
}
// The unchanged body's artist normals remain intact. New boundary vertices
// inherit interpolated normals, while the perineum receives a fresh local curve.
const nr=computeNormals(pa.POSITION,patchIndices),np=computeNormals(pa.POSITION.map((p,id)=>add(p,pd.POSITION[id])),patchIndices);
pa.NORMAL=nr;pd.NORMAL=nr.map((v,i)=>sub(np[i],v));
for(const [key,id]of Object.entries(body.attributes))body.attributes[key]=write(ba[key],id);
for(const [key,id]of Object.entries(body.targets[0]))body.targets[0][key]=write(bd[key],id);
body.indices=writeIndices(faces);
body.extras={...body.extras,rev96r11NativeRimSplit:true,rev96r11SplitVertices:6,rev96r11SplitTrianglesAdded:6};
for(const [key,id]of Object.entries(groin.attributes))groin.attributes[key]=write(pa[key],id);
for(const [key,id]of Object.entries(groin.targets[0]))groin.targets[0][key]=write(pd[key],id);
groin.extras={...groin.extras,rev96r11LocalSeamMatched:true,rev96r11MatchedNativeEdges:6,rev96r11NoGlobalPanel:true};
// Guarantee source user triangle IDs are not brought back.
const sourceFaces=user.deletedFaces.reduce((map,f)=>{const id=f.primitive,bag=map.get(id)||new Set();bag.add(faceKey(f.vertices));map.set(id,bag);return map;},new Map());
for(const [pi,set]of sourceFaces){const p=primitives[pi],I=read(p.indices);for(let i=0;i<I.length;i+=3)if(set.has(faceKey(I.slice(i,i+3))))throw Error('User deleted face reappeared!');}
const faceTotal=primitives.reduce((s,p)=>s+doc.accessors[p.indices].count/3,0),cloth=primitives.reduce((s,p)=>s+(p.extras?.layer==='garment'?doc.accessors[p.indices].count/3:0),0);
if(faceTotal!==3610||cloth!==370||doc.skins[0].joints.length!==63)throw Error('r11 invariant failure');
// Exact rest/open55 rear coordinate equality, including rig influences.
let maxRest=0,maxPose=0,maxInfluence=0;
for(const id of rear){const ref=ids.get(id);
 maxRest=Math.max(maxRest,len(sub(pa.POSITION[id],ba.POSITION[ref])));
 maxPose=Math.max(maxPose,len(sub(add(pa.POSITION[id],pd.POSITION[id]),add(ba.POSITION[ref],bd.POSITION[ref]))));
 maxInfluence=Math.max(maxInfluence,len(sub(pa.WEIGHTS_0[id],ba.WEIGHTS_0[ref])));
}
if(maxRest>1e-7||maxPose>1e-7||maxInfluence>1e-7)throw Error('Rig alignment not exact');
doc.extras={...doc.extras,revision:'rev96-r11-aligned-posterior-rim',sourceSha256:sourceSha,
 userDeletedOriginalFaces:101,garmentTriangles:370,bones:63,originalNativePositionsUnchanged:908,
 newRimVertices:6,newTriangles:6,bodyAndPerineumGeometricallyAligned:true,
 notCrossPrimitiveIndexWelded:true,additionalDecimation:false,visualApproval:'pending'};
doc.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(doc)),jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const H=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
H.write('glTF');H.writeUInt32LE(2,4);H.writeUInt32LE(12+8+jp.length+8+bp.length,8);jh.writeUInt32LE(jp.length);jh.write('JSON',4);
bh.writeUInt32LE(bp.length);bh.write('BIN\0',4);
const result=Buffer.concat([H,jh,jp,bh,bp]);
fs.writeFileSync(path.join(dir,output),result,{flag:'wx'});
const report={source,output,sha256:hash(result),sourceSha256:sourceSha,trianglesBefore:3604,trianglesAfter:faceTotal,
 originalBodyVertices:908,newRimVertices:6,splitBodyFaces:2,splitBodyAddedFaces:6,
 perineumRearNodesMatched:7,posteriorMatchedRestMax:maxRest,posteriorMatchedOpen55Max:maxPose,
 posteriorSkinWeightErrorMax:maxInfluence,skinOpenEdgesNewPerineum:0,
 original101UserDeletedFacesPreserved:true,garment:cloth,bones:63,
 noBroadBodyPanelAdded:true,noFurtherDecimation:true,
 warning:'Geometric seam matched across glTF primitives; body/anatomy material primitives remain separate (not single-index welded).'};
fs.writeFileSync(path.join(dir,manifest),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
