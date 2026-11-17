'use strict';
/* Rev96 F11 r14: surgical lateral pelvic inner-skin transition.
   Does not undo 101 deleted polygons and does not create a giant horizontal
   torso bridge. The native central anatomical surface (primitive 13) gains
   two locally curved 5-segment skinned sidewalls to original native torso
   boundary. Experimental result: reject on visible sidewall/sail.
*/
const fs=require('fs'),path=require('path'),crypto=require('crypto'),dir=__dirname;
const source='r21AO-F11-user101-core-rounded-fairing-r13.glb',output='r21AO-F11-user101-lateral-closure-r14.glb',manifest='REV96_USER101_LATERAL_R14.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),buf=fs.readFileSync(path.join(dir,source));
if(sha(buf)!=='cb772e9fc8ecb4adca1c5dfd99af5c5fdcbcdc9125dcb4a9e8036ce57032ee1a')throw Error('Unexpected r13 source hash');
for(const name of[output,manifest])if(fs.existsSync(path.join(dir,name)))throw Error('Refuse overwrite '+name);
const jl=buf.readUInt32LE(12),doc=JSON.parse(buf.toString('utf8',20,20+jl));let bin=Buffer.from(buf.subarray(28+jl,28+jl+buf.readUInt32LE(20+jl)));
const primitives=doc.meshes[0].primitives,body=primitives[0],core=primitives[13],sizes={5121:1,5123:2,5125:4,5126:4},types={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},ops={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function get(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=types[a.type],sz=sizes[a.componentType],offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*sz,rows=[];for(let i=0;i<a.count;i++){const r=[];for(let j=0;j<n;j++)r.push(bin[ops[a.componentType]](offset+i*stride+j*sz));rows.push(n===1?r[0]:r)}return rows;}
function append(rows,old){
 const a=doc.accessors[old],n=types[a.type],sz=sizes[a.componentType],start=(bin.length+3)&~3,data=Buffer.alloc(rows.length*n*sz);
 for(let i=0;i<rows.length;i++)for(let k=0;k<n;k++){const x=n===1?rows[i]:rows[i][k],p=(i*n+k)*sz;
 if(!Number.isFinite(x))throw Error('Invalid '+old+' '+i);
 if(a.componentType===5126)data.writeFloatLE(x,p);else if(a.componentType===5125)data.writeUInt32LE(x,p);else if(a.componentType===5123)data.writeUInt16LE(x,p);else data.writeUInt8(x,p);
 }
 bin=Buffer.concat([bin,Buffer.alloc(start-bin.length),data]);
 const vi=doc.bufferViews.push({buffer:0,byteOffset:start,byteLength:data.length})-1,o={bufferView:vi,componentType:a.componentType,type:a.type,count:rows.length};
 if(a.normalized!==undefined)o.normalized=a.normalized;
 if(a.min||a.max)for(const c of['min','max'])if(a[c])o[c]=Array.from({length:n},(_,k)=>c==='min'?Math.min(...rows.map(row=>n===1?row:row[k])):Math.max(...rows.map(row=>n===1?row:row[k])));
 return doc.accessors.push(o)-1;
}
function appendIndices(I){const p=(bin.length+3)&~3,b=Buffer.alloc(I.length*2);for(let i=0;i<I.length;i++)b.writeUInt16LE(I[i],i*2);
 bin=Buffer.concat([bin,Buffer.alloc(p-bin.length),b]);const v=doc.bufferViews.push({buffer:0,byteOffset:p,byteLength:b.length})-1;
 return doc.accessors.push({bufferView:v,componentType:5123,type:'SCALAR',count:I.length,min:[Math.min(...I)],max:[Math.max(...I)]})-1;
}
const A=Object.fromEntries(Object.entries(core.attributes).map(([k,id])=>[k,get(id)])),M=Object.fromEntries(Object.entries(core.targets[0]).map(([k,id])=>[k,get(id)]));
const B=Object.fromEntries(Object.entries(body.attributes).map(([k,id])=>[k,get(id)])),BM=Object.fromEntries(Object.entries(body.targets[0]).map(([k,id])=>[k,get(id)]));
let I=get(core.indices);if(I.length!==957*3||A.POSITION.length!==1153)throw Error('r13 core unexpected');
const plus=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),scale=(a,t)=>a.map(x=>x*t),mix=(a,b,t)=>Array.isArray(a)?a.map((x,i)=>x*(1-t)+b[i]*t):a*(1-t)+b*t;
const len=a=>Math.hypot(...a),unit=a=>scale(a,1/(len(a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function sourceRow(attrs,morph,id){return{a:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,Array.isArray(v[id])?v[id].slice():v[id]])),
m:Object.fromEntries(Object.entries(morph).map(([k,v])=>[k,v[id].slice()]))};}
function combine(a,b,t){
 const maps=new Map();
 for(const [v,w]of[[a,1-t],[b,t]])for(let i=0;i<4;i++){const J=v.a.JOINTS_0[i];maps.set(J,(maps.get(J)||0)+v.a.WEIGHTS_0[i]*w)}
 const four=[...maps].sort((x,y)=>y[1]-x[1]).slice(0,4),sum=four.reduce((s,row)=>s+row[1],0)||1;
 const out={a:{},m:{}};
 for(const k of Object.keys(a.a)){
 if(k==='JOINTS_0')out.a[k]=Array.from({length:4},(_,i)=>four[i]?.[0]||0);
 else if(k==='WEIGHTS_0')out.a[k]=Array.from({length:4},(_,i)=>(four[i]?.[1]||0)/sum);
 else out.a[k]=mix(a.a[k],b.a[k],t);
 }
 for(const k of Object.keys(a.m))out.m[k]=mix(a.m[k],b.m[k],t);
 return out;
}
function push(v){const id=A.POSITION.length;for(const k of Object.keys(A))A[k].push(Array.isArray(v.a[k])?v.a[k].slice():v.a[k]);for(const k of Object.keys(M))M[k].push(v.m[k].slice());return id;}
function sampleNative(sequence,y){for(let k=0;k<sequence.length-1;k++){
 const a=B.POSITION[sequence[k]],b=B.POSITION[sequence[k+1]];
 if(y>=Math.min(a[1],b[1])-1e-8 && y<=Math.max(a[1],b[1])+1e-8){
  const t=Math.max(0,Math.min(1,(y-a[1])/(b[1]-a[1])));
  return combine(sourceRow(B,BM,sequence[k]),sourceRow(B,BM,sequence[k+1]),t);
 }
 }
 return sourceRow(B,BM,sequence[sequence.length-1]);
}
const tracks=[{side:'left',sequence:[221,83,216,214,306,29],col:0},{side:'right',sequence:[82,222,78,75,296,29],col:18}];
const newFaces=[],summaries=[];
for(const track of tracks){
 const stations=[];
 // row0 of existing anatomy uses actual boundary end (340 or 348), rows 1..12
 // run longitudinally towards the native posterior seam. No wide central cap.
 for(let row=9;row<=12;row++){
  const sideId=row===0?(track.col===0?340:348):908+(row-1)*19+track.col;
  const near=sourceRow(A,M,sideId),np=near.a.POSITION;
  const far=sampleNative(track.sequence,np[1]);
  const seam=[sideId];
  if(row===12){stations.push({row,near:sideId,outer:sideId,radial:[sideId]});continue}
  for(let j=1;j<=4;j++){
   const f=j/4,ease=f*f*(3-2*f),v=combine(near,far,ease);
   const p=v.a.POSITION;
   // Smooth lip and aponeurotic inward soft rounded interior.
   const bulge=.0038*Math.sin(Math.PI*ease)*(1-.25*Math.abs(2*row/12-1));
   p[2]+=bulge;
   p[0]+=Math.sign(np[0])*.0013*Math.sin(Math.PI*ease)*Math.sin(Math.PI*row/12);
   // Slight interior setback, not a horizontal bridging sheet.
   p[1]+=.0018*Math.sin(Math.PI*ease)*Math.sin(Math.PI*row/12);
   v.a._TISSUE=.36;v.a._ANATREGION=0;v.a._ANATCAVITY=0;
   seam.push(push(v));
  }
  stations.push({row,near:sideId,outer:seam[4],radial:seam});
 }
 for(let r=0;r<stations.length-2;r++){
  const a=stations[r].radial,b=stations[r+1].radial;
  for(let k=0;k<4;k++){
   if(track.col===0)newFaces.push(a[k],b[k],a[k+1],a[k+1],b[k],b[k+1]);
   else newFaces.push(a[k+1],b[k],a[k],b[k+1],b[k],a[k+1]);
  }
 }
 const a=stations[stations.length-2].radial,tip=stations[stations.length-1].near;
 for(let k=0;k<4;k++){
  if(track.col===0)newFaces.push(a[k],tip,a[k+1]);
  else newFaces.push(a[k+1],tip,a[k]);
 }
 summaries.push({side:track.side,sourceTrack:track.sequence,addedFaces:(stations.length-2)*4*2+4,
    endingOnNativeRim:true,sourceAnatomyBoundaryShared:true});
}
function quality(P){let deg=0,maxEdge=0,min=1,areas=[];
 for(let i=0;i<newFaces.length;i+=3){const [a,b,c]=newFaces.slice(i,i+3).map(id=>P[id]),n=cross(sub(b,a),sub(c,a)),area=len(n)*.5;areas.push(area);
 if(area<5e-9)deg++;min=Math.min(min,area);
 for(const x of[len(sub(a,b)),len(sub(b,c)),len(sub(c,a))])maxEdge=Math.max(maxEdge,x);}
 return{degenerateFaces:deg,maxEdge,minArea:min,medianArea:areas.sort((a,b)=>a-b)[Math.floor(areas.length/2)]};}
const qRest=quality(A.POSITION),q55=quality(A.POSITION.map((v,id)=>plus(v,M.POSITION[id])));
if(qRest.degenerateFaces||q55.degenerateFaces||qRest.maxEdge>.095||q55.maxEdge>.095)throw Error('Lateral ribbons unsafe '+JSON.stringify({qRest,q55}));
I=I.concat(newFaces);
function normals(P,I){const out=P.map(()=>[0,0,0]);for(let i=0;i<I.length;i+=3){const [a,b,c]=I.slice(i,i+3),n=cross(sub(P[b],P[a]),sub(P[c],P[a]));for(const k of[a,b,c])out[k]=plus(out[k],n);}return out.map(unit);}
const n0=normals(A.POSITION,I),n55=normals(A.POSITION.map((v,id)=>plus(v,M.POSITION[id])),I);
for(let k=0;k<A.POSITION.length;k++)if(k>=1153||k===340||k===348||k===908||k===926){A.NORMAL[k]=n0[k];M.NORMAL[k]=sub(n55[k],n0[k]);}
for(const [k,id]of Object.entries(core.attributes))core.attributes[k]=append(A[k],id);
for(const [k,id]of Object.entries(core.targets[0]))core.targets[0][k]=append(M[k],id);
core.indices=appendIndices(I);
core.extras={...core.extras,rev96r14LateralAnatomyClosure:true,sideBands:summaries,rev96r14NativeEdgeLining:true,largeHoleStillOpenElsewhere:true};
const total=primitives.reduce((s,p)=>s+doc.accessors[p.indices].count/3,0),garments=primitives.reduce((s,p)=>s+(p.extras?.layer==='garment'?doc.accessors[p.indices].count/3:0),0);
if(total!==3896+newFaces.length/3||garments!==370||doc.skins[0].joints.length!==63)throw Error('r14 topology check mismatch');
const userData=fs.readFileSync(path.join(dir,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(userData)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Original user trim changed');
const sets=new Map();for(const face of JSON.parse(userData).deletedFaces){let set=sets.get(face.primitive)||new Set();set.add(face.vertices.slice().sort((a,b)=>a-b).join(':'));sets.set(face.primitive,set);}
for(const [pi,s]of sets){const indexed=get(primitives[pi].indices);for(let i=0;i<indexed.length;i+=3)if(s.has(indexed.slice(i,i+3).sort((a,b)=>a-b).join(':')))throw Error('User face returned');}
doc.extras={...doc.extras,revision:'rev96-r14-side-lining',sourceSha256:sha(buf),user101OriginalFacesAbsent:true,
 lateralSurfacePairs:2,sideFacesAdded:newFaces.length/3,garmentFaces:370,bones:63,otherOpenHolesNotClosed:true,experimental:true};
doc.buffers[0].byteLength=bin.length;const j=Buffer.from(JSON.stringify(doc)),jp=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const h=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jp.length+8+bp.length,8);
jh.writeUInt32LE(jp.length);jh.write('JSON',4);bh.writeUInt32LE(bp.length);bh.write('BIN\0',4);
const result=Buffer.concat([h,jh,jp,bh,bp]);fs.writeFileSync(path.join(dir,output),result,{flag:'wx'});
const report={source,output,sha256:sha(result),totalTriangles:total,addedSideFaces:newFaces.length/3,addedSideVertices:A.POSITION.length-1153,
  centralOriginalAnatomyPreserved:908,sideClosureIntoSamePrimitive13:true,sourceHumanDeletedFacesRemainAbsent:101,
  seamSides:summaries,garmentFaces:370,bones:63,qRest,q55,bodyOtherBoundaryStillOpen:true,
  phase:'experimental-visual-review'};
fs.writeFileSync(path.join(dir,manifest),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
