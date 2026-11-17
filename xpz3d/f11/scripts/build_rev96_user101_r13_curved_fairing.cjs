'use strict';
/* R13: non-destructive local fairing of the r12 *integrated* native anatomy,
   keep central original 908 vertices and exact 19 posterior rim nodes unchanged.
   Adds a lateral S-shaped saddle and smooth 55-degree morph curvature.
   Makes NO claim that the existing wide body cut is closed.
*/
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const input='r21AO-F11-user101-core-extended-curved-r12.glb',output='r21AO-F11-user101-core-rounded-fairing-r13.glb',meta='REV96_USER101_CORE_FAIRING_R13.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(fs.existsSync(path.join(root,output))||fs.existsSync(path.join(root,meta)))throw Error('Refuse overwrite');
const original=fs.readFileSync(path.join(root,input)),sourceSHA='05e6f971d34592d32c4008af5ee853f140a1891712f6705ac2f8f2a8f293e77c';
if(sha(original)!==sourceSHA)throw Error('Unexpected source GLB');
const jl=original.readUInt32LE(12),doc=JSON.parse(original.toString('utf8',20,20+jl));
let bin=Buffer.from(original.subarray(28+jl,28+jl+original.readUInt32LE(20+jl)));
const P=doc.meshes[0].primitives,core=P[13],parts={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},size={5121:1,5123:2,5125:4,5126:4},reader={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function rd(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=parts[a.type],s=size[a.componentType],start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*s,rows=[];for(let i=0;i<a.count;i++){const x=[];for(let k=0;k<n;k++)x.push(bin[reader[a.componentType]](start+i*stride+k*s));rows.push(n===1?x[0]:x);}return rows;}
function write(rows,id){const a=doc.accessors[id],n=parts[a.type],s=size[a.componentType],o=(bin.length+3)&~3,b=Buffer.alloc(rows.length*n*s);
 for(let i=0;i<rows.length;i++)for(let k=0;k<n;k++){
  const x=n===1?rows[i]:rows[i][k],j=(i*n+k)*s;
  if(!Number.isFinite(x))throw Error('nonfinite at '+i);
  if(a.componentType===5126)b.writeFloatLE(x,j);
  else if(a.componentType===5123)b.writeUInt16LE(x,j);
  else if(a.componentType===5125)b.writeUInt32LE(x,j);
  else b.writeUInt8(x,j);
 }
 bin=Buffer.concat([bin,Buffer.alloc(o-bin.length),b]);
 const v=doc.bufferViews.push({buffer:0,byteOffset:o,byteLength:b.length})-1,out={bufferView:v,componentType:a.componentType,type:a.type,count:rows.length};
 if(a.normalized!==undefined)out.normalized=a.normalized;
 if(a.min||a.max)for(const kind of ['min','max'])if(a[kind])out[kind]=Array.from({length:n},(_,k)=>kind==='min'?Math.min(...rows.map(r=>n===1?r:r[k])):Math.max(...rows.map(r=>n===1?r:r[k])));
 return doc.accessors.push(out)-1;
}
const I=rd(core.indices),A=rd(core.attributes.POSITION),D=rd(core.targets[0].POSITION),old=A.map(v=>v.slice());
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,t)=>a.map(x=>x*t),norm=a=>mul(a,1/(Math.hypot(...a)||1)),
cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
if(A.length!==1153||I.length!==957*3)throw Error('r12 source size changed');
const moved=[];
for(let row=1;row<12;row++){
 const t=row/12,envelope=Math.pow(Math.sin(Math.PI*t),1.5);
 for(let col=0;col<19;col++){
  const id=908+(row-1)*19+col,x=col/9-1,center=1-x*x;
  const offX=envelope*(.0065*x*(1-.3*Math.abs(x))+.0015*Math.sin(2*Math.PI*t)*(1-Math.abs(x)));
  const offY=.0029*Math.sin(2*Math.PI*t)*(1-Math.abs(x)) +.0026*Math.sin(Math.PI*t)*Math.cos(Math.PI*x)*center;
  const offZ=envelope*(.0048*x*x-.0030*center)+.0012*Math.sin(3*Math.PI*t)*center;
  const dv=[offX,offY,offZ];
  A[id]=add(A[id],dv);
  // 55-degree spreads along each flank and preserves longitudinal curve,
  // but old protected start and rear anchor positions remain byte-identical.
  D[id][0]+=offX*(.45+.35*Math.abs(x));
  D[id][1]+=offY*.25;
  D[id][2]+=offZ*.18;
  moved.push({id,displacement:dv});
 }
}
// Reposition anal ring with the adjacent four face corners, avoiding the old
// straight trench. Ring vertex positions are carried with exact position deltas.
for(let i=0;i<16;i++){
 const id=1136+i,k=i%8,anchors=[8*19+8,8*19+9,8*19+10,9*19+10,10*19+10,10*19+9,10*19+8,9*19+8];
 const anchor=908+(anchors[k]-19); // nearest from grid row1..12 range
 const dv=sub(A[anchor],old[anchor]),s=i<8?.64:.23;
 A[id]=add(A[id],mul(dv,s));D[id]=add(D[id],mul(dv,s*.5));
}
const rim=1152,neighbors=[908+(9-1)*19+9,908+(9-1)*19+8,908+(9-1)*19+10],avg=neighbors.reduce((s,id)=>add(s,sub(A[id],old[id])),[0,0,0]).map(x=>x/3);
A[rim]=add(A[rim],mul(avg,.5));
function normals(P){const out=P.map(()=>[0,0,0]);for(let i=0;i<I.length;i+=3){const [a,b,c]=I.slice(i,i+3),n=cross(sub(P[b],P[a]),sub(P[c],P[a]));for(const k of[a,b,c])out[k]=add(out[k],n);}return out.map(norm);}
const nr=normals(A),np=normals(A.map((v,id)=>add(v,D[id])));
const N=rd(core.attributes.NORMAL),NM=rd(core.targets[0].NORMAL);
for(let id=908;id<A.length;id++){N[id]=nr[id];NM[id]=sub(np[id],nr[id]);}
function quality(P){let zero=0,maxEdge=0;for(let i=0;i<I.length;i+=3){const ids=I.slice(i,i+3);if(!ids.some(id=>id>=908))continue;const [a,b,c]=ids.map(id=>P[id]),n=cross(sub(b,a),sub(c,a));
 if(Math.hypot(...n)<2e-9)zero++;
 for(const e of [Math.hypot(...sub(a,b)),Math.hypot(...sub(b,c)),Math.hypot(...sub(c,a))])maxEdge=Math.max(maxEdge,e);
 }return {degenerate:zero,maxEdge};}
const rest=quality(A),posed=quality(A.map((v,id)=>add(v,D[id])));
if(rest.degenerate||posed.degenerate||rest.maxEdge>.065||posed.maxEdge>.065)throw Error('Curve unsafe '+JSON.stringify({rest,posed}));
core.attributes.POSITION=write(A,core.attributes.POSITION);
core.attributes.NORMAL=write(N,core.attributes.NORMAL);
core.targets[0].POSITION=write(D,core.targets[0].POSITION);
core.targets[0].NORMAL=write(NM,core.targets[0].NORMAL);
core.extras={...core.extras,rev96r13SmoothFairing:true,rev96r13CurvedTransverse:true,rev96r13Protected21FrontArc:true,rev96r13Protected19RearRim:true,rev96r13RestAnd55Normals:true};
const total=P.reduce((s,p)=>s+doc.accessors[p.indices].count/3,0),clothing=P.reduce((s,p)=>s+(p.extras?.layer==='garment'?doc.accessors[p.indices].count/3:0),0);
if(total!==3896||clothing!==370||doc.skins[0].joints.length!==63)throw Error('Topology changed');
const trim=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));const expected='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5';
if(sha(trim)!==expected)throw Error('Canonical user trim altered');
const banned=new Map();for(const v of JSON.parse(trim).deletedFaces){let bag=banned.get(v.primitive)||new Set();bag.add(v.vertices.slice().sort((x,y)=>x-y).join(':'));banned.set(v.primitive,bag);}
for(const [pi,bags]of banned){let ix=rd(P[pi].indices);for(let k=0;k<ix.length;k+=3)if(bags.has(ix.slice(k,k+3).sort((a,b)=>a-b).join(':')))throw Error('manual trimmed face restored');}
doc.extras={...doc.extras,revision:'rev96-r13-curved-central-anatomy-fairing',sourceSha256:sourceSHA,original101UserDeletedFacesStillAbsent:true,
 preservedBones:63,preservedClothing370:true,additionalPolygonDecimation:false,remainingNativeBodyOpenBoundaryStillRequiresRetopology:true,experiment:true};
doc.buffers[0].byteLength=bin.length;
const j=Buffer.from(JSON.stringify(doc)),jp=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const h=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jp.length+8+bp.length,8);
jh.writeUInt32LE(jp.length);jh.write('JSON',4);bh.writeUInt32LE(bp.length);bh.write('BIN\0',4);const bytes=Buffer.concat([h,jh,jp,bh,bp]);
fs.writeFileSync(path.join(root,output),bytes,{flag:'wx'});
const info={schema:'xpz3d/f11/r13-fairing',date:'2026-11-17',input,output,sha256:sha(bytes),triangles:total,centralOriginalVerticesUnchanged:908,
 curvedInternalVerticesMoved:moved.length,frontAndRearRimsUnchanged:true,manualDeletedFacesRemainAbsent:101,garmentTriangles:clothing,bones:63,
 newTriangles:0,qualityRest:rest,qualityOpen55:posed,
 remainingUnintendedBodyHolesStillUnclosed:true,notGameReady:true,poseReview:'pending'};
fs.writeFileSync(path.join(root,meta),JSON.stringify(info,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(info,null,2));
