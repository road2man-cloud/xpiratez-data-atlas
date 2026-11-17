'use strict';
/** XPZ3D r27 targeted relief: adaptively sculpt the already unified physical skin.
 * Does not touch r24, 101 manual deleted triangles, artist-authored geometry,
 * the body mesh, independent garments, UV, joint weights, or 63-bone rig.
 * Uses per-vertex local triangle constraints instead of one global damping factor.
 * Engineering candidate only; visual anatomy acceptance is not implied.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const parent='r21AO-F11-user101-integrated-oval-r26-unified-skin-v2.glb';
const parentHash='08e37ff8fa981ad9f23807e090f477cdf7d97c1bfd50027f59e87b249fd6cbc3';
const target='r21AO-F11-user101-integrated-oval-r27-adaptive-relief.glb';
const report='REV96_USER101_R27_ADAPTIVE_RELIEF_BUILD.json';
if([target,report].some(f=>fs.existsSync(path.join(root,f))))throw Error('Refuse overwrite');
const raw=fs.readFileSync(path.join(root,parent));
if(sha(raw)!==parentHash)throw Error('r26 unified v2 immutable source hash changed');
const manual=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(manual)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Manual trim mismatch');
const jl=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+jl)),bp=28+jl,bin=Buffer.from(raw.subarray(bp,bp+raw.readUInt32LE(20+jl))),pr=doc.meshes[0].primitives;
if(pr.length!==24||doc.skins[0].joints.length!==63||pr[13].material!==5||pr[23].material!==5)throw Error('Wrong source revision');
const sizes={5121:1,5123:2,5125:4,5126:4},reads={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},types={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(idx){const a=doc.accessors[idx],v=doc.bufferViews[a.bufferView],n=types[a.type],ofs=(v.byteOffset||0)+(a.byteOffset||0),st=v.byteStride||n*sizes[a.componentType],o=[];for(let i=0;i<a.count;i++){const r=[];for(let k=0;k<n;k++)r.push(bin[reads[a.componentType]](ofs+i*st+k*sizes[a.componentType]));o.push(n===1?r[0]:r)}return o}
function writeVec3(idx,rows){const a=doc.accessors[idx],v=doc.bufferViews[a.bufferView];if(a.type!=='VEC3'||a.componentType!==5126||a.count!==rows.length)throw Error('Unsafe vector accessor');const o=(v.byteOffset||0)+(a.byteOffset||0),st=v.byteStride||12;for(let i=0;i<rows.length;i++)for(let k=0;k<3;k++){if(!Number.isFinite(rows[i][k]))throw Error('Not finite');bin.writeFloatLE(rows[i][k],o+i*st+k*4)}a.min=[0,1,2].map(k=>Math.min(...rows.map(r=>r[k])));a.max=[0,1,2].map(k=>Math.max(...rows.map(r=>r[k])));}
const skin=pr[23],pos=read(skin.attributes.POSITION),original=pos.map(p=>p.slice()),morph=read(skin.targets[0].POSITION),normals=read(skin.attributes.NORMAL),faces=read(skin.indices);
const n=pos.length,incident=Array.from({length:n},()=>[]),edges=new Map();
for(let f=0;f<faces.length/3;f++){const a=faces[f*3],b=faces[f*3+1],c=faces[f*3+2];for(const v of [a,b,c])incident[v].push(f);for(const [u,v] of [[a,b],[b,c],[c,a]]){const key=Math.min(u,v)+':'+Math.max(u,v);edges.set(key,(edges.get(key)||0)+1)}}
const locked=new Set();
for(const [key,count]of edges)if(count===1)for(const x of key.split(':'))locked.add(+x);
const otherSeams=new Set();
for(const ip of [0,13,17,18,21,22]){const p=pr[ip],p0=read(p.attributes.POSITION),p1=read(p.targets[0].POSITION),ix=read(p.indices);for(const id of new Set(ix)){const k=[...p0[id],...p1[id]].map(x=>Math.round(x*1e5)).join(':');otherSeams.add(k)}}
for(let i=0;i<n;i++){const p=original[i],m=morph[i],key=[...p,...m].map(x=>Math.round(x*1e5)).join(':');if(otherSeams.has(key))locked.add(i);if(p[1]>0.016||Math.abs(p[0])>.085||p[1]<-.145||p[2]<.76||p[2]>1.03)locked.add(i)}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
function shape(p){const [x,y,z]=p;
 const r1=Math.hypot(x/.038,(y+.063)/.053),r2=Math.hypot(x/.025,(y-.001)/.028);
 const a=Math.exp(-Math.pow((r1-.86)/.21,2)),b=Math.exp(-Math.pow((r2-.81)/.23,2));
 const basin=Math.exp(-Math.pow(x/.020,2)-Math.pow((y+.033)/.064,2));
 const taper=smooth((y+.149)/.030)*(1-smooth((y-.008)/.020))*(1-smooth((Math.abs(x)-.066)/.019));
 return taper*(-.0044*a-.0033*b+.0024*basin);
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),len=v=>Math.hypot(...v);
function area(vs,v){return cross(sub(v[vs[1]],v[vs[0]]),sub(v[vs[2]],v[vs[0]]))}
const baselinePose=original.map((p,i)=>p.map((x,k)=>x+morph[i][k]));
const baselineFaces=Array.from({length:faces.length/3},(_,i)=>faces.slice(3*i,3*i+3));
const refRest=baselineFaces.map(t=>area(t,original)),refPose=baselineFaces.map(t=>area(t,baselinePose));
function good(t,points,refs,index){const nrm=area(t,points),a=len(nrm),b=len(refs[index]);return a>Math.max(b*.18,2e-11)&&dot(nrm,refs[index])>Math.max(b*b*.09,1e-15)}
const want=Array.from({length:n},(_,i)=>locked.has(i)?0:shape(original[i]));
const order=Array.from({length:n},(_,i)=>i).filter(i=>Math.abs(want[i])>1e-8).sort((a,b)=>Math.abs(want[b])-Math.abs(want[a]));
const moved=new Set(),pose=baselinePose.map(p=>p.slice()),scale=[];
for(const id of order){let fraction=1;while(fraction>1/2048){pos[id][2]=original[id][2]+want[id]*fraction;pose[id][2]=baselinePose[id][2]+want[id]*fraction;
 if(incident[id].every(f=>good(baselineFaces[f],pos,refRest,f)&&good(baselineFaces[f],pose,refPose,f)))break;
 fraction*=.5;}
 if(fraction<=1/2048){pos[id][2]=original[id][2];pose[id][2]=baselinePose[id][2];continue}
 moved.add(id);scale.push(fraction);
}
function verify(points,ref){let flips=0,degenerate=0,minArea=Infinity;for(let f=0;f<baselineFaces.length;f++){const a=area(baselineFaces[f],points),r=ref[f],sz=len(a)/2;minArea=Math.min(minArea,sz);if(sz<1e-11)degenerate++;if(dot(a,r)<0)flips++}return{flips,degenerate,minArea}}
const rest=verify(pos,refRest),posed=verify(pose,refPose);
if(rest.flips||posed.flips||rest.degenerate||posed.degenerate)throw Error('Unsafe sculpt');
if(moved.size<15)throw Error('Relief failed to move meaningful vertex count');
function recompute(pts){const normals=Array.from({length:n},()=>[0,0,0]);for(const t of baselineFaces){const normal=area(t,pts);for(const id of t)for(let k=0;k<3;k++)normals[id][k]+=normal[k]}return normals.map(v=>v.map(x=>x/(len(v)||1)))}
const oldG=recompute(original),newG=recompute(pos),newNormals=normals.map((v,i)=>{if(locked.has(i))return v.slice();const raw=v.map((x,k)=>x+.40*(newG[i][k]-oldG[i][k]));return raw.map(x=>x/(len(raw)||1))});
writeVec3(skin.attributes.POSITION,pos);writeVec3(skin.attributes.NORMAL,newNormals);
skin.extras={...skin.extras,rev96r27AdaptivePerVertexRelief:true,anteriorUPosteriorUSculptExperimental:true};
doc.extras={...doc.extras,revision:'rev96-user101-r27-adaptive-oval-relief',parentSHA256:parentHash,visualAcceptance:'pending',wholeBodyWatertight:false};
const jf=Buffer.from(JSON.stringify(doc)),jpad=Buffer.concat([jf,Buffer.alloc((4-jf.length%4)%4,32)]),bpad=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const h=Buffer.alloc(12),j=Buffer.alloc(8),b=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jpad.length+8+bpad.length,8);j.writeUInt32LE(jpad.length,0);j.write('JSON',4);b.writeUInt32LE(bpad.length,0);b.write('BIN\0',4);
const bytes=Buffer.concat([h,j,jpad,b,bpad]),total=pr.reduce((s,p)=>s+doc.accessors[p.indices].count/3,0),garments=pr.reduce((s,p)=>s+(p.extras?.layer==='garment'?doc.accessors[p.indices].count/3:0),0);
if(total!==4680||garments!==370)throw Error('Topology/garment regression');
const maxShift=Math.max(...pos.map((p,i)=>len(sub(p,original[i])))),shifts=pos.map((p,i)=>len(sub(p,original[i]))).filter(x=>x>0).sort((a,b)=>a-b);
fs.writeFileSync(path.join(root,target),bytes,{flag:'wx'});
const stats={schema:'xpz3d/f11/rev96/r27-adaptive-relief-v1',source:parent,sourceSHA256:parentHash,file:target,sha256:sha(bytes),triangles:total,garmentTriangles:garments,bones:63,lockedVertices:locked.size,eligibleVertices:order.length,changedVertices:moved.size,maximumRestDisplacementGLB:maxShift,medianChangedDisplacementGLB:shifts[Math.floor(shifts.length/2)],meanAcceptedFraction:scale.reduce((s,x)=>s+x,0)/scale.length,rest,posed,protectedAuthoredPrimitivesUntouched:true,manual101NotResurrected:true,visualApproval:'pending',seamAudit:'pending',wholeBodyWatertight:false};
fs.writeFileSync(path.join(root,report),JSON.stringify(stats,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(stats,null,2));
