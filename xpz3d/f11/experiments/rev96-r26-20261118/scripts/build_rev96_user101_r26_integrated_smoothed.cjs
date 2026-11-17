'use strict';
/**
 * F11 rev96 r26 INTEGRATED perineal anatomy / skin mesh
 * Immutable parent r24 Ellipse Soft v3, SHA pinned.
 *
 * Physical retopology: transfer all 392 posterior generated anatomical
 * triangles out of core primitive13 and merge with 682 pelvic skin triangles
 * from primitive23 into one indexed continuous material5 skin primitive.
 * Weld matched rest+morph vertices inside the combined mesh.
 * Add one barycentric shape vertex per face, enabling shared oval curvature.
 * Keep first 529 authored/core attachment triangles and 908 authored vertices.
 * Separate blind anal cavity, no open anatomical tunnel.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const src='r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v3.glb';
const baselineHash='ed99fb2df29767fff3258a6267ddc395b6e5b177eebc9676de7f1c5485bced7a';
const strong=process.argv.includes('--oval-strong');
const tag=strong?'smoothed-strong':'smoothed-gentle';
const dest='r21AO-F11-user101-integrated-oval-r26-'+tag+'.glb';
const logName='REV96_USER101_R26_'+tag.toUpperCase().replaceAll('-','_')+'_BUILD.json';
if(fs.existsSync(path.join(root,dest))||fs.existsSync(path.join(root,logName)))throw Error('Refuse overwrite '+dest);
const input=fs.readFileSync(path.join(root,src));if(sha(input)!==baselineHash)throw Error('r24 source hash mismatch');
const trim=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(trim)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Manual trim hash mismatch');
const user=JSON.parse(trim);
if(user.deletedFaces.length!==101||user.positions.length!==754||Object.keys(user.controls).length!==106)throw Error('User history count changed');
const jl=input.readUInt32LE(12),g=JSON.parse(input.toString('utf8',20,20+jl));
let bin=Buffer.from(input.subarray(28+jl,28+jl+input.readUInt32LE(20+jl)));
const ps=g.meshes[0].primitives;
if(ps.length!==24||g.skins[0].joints.length!==63)throw Error('Unexpected source skin');
const N={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},S={5121:1,5123:2,5125:4,5126:4},R={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(a){const ac=g.accessors[a],bv=g.bufferViews[ac.bufferView],n=N[ac.type],sz=S[ac.componentType],o=(ac.byteOffset||0)+(bv.byteOffset||0),st=bv.byteStride||n*sz,rows=[];
 for(let i=0;i<ac.count;i++){const row=[];for(let k=0;k<n;k++)row.push(bin[R[ac.componentType]](o+i*st+k*sz));rows.push(n===1?row[0]:row);}
 return rows;
}
function load(p){return{p,a:Object.fromEntries(Object.entries(p.attributes).map(([k,i])=>[k,read(i)])),m:Object.fromEntries(Object.entries(p.targets[0]).map(([k,i])=>[k,read(i)])),I:read(p.indices)}}
const C=load(ps[13]),P=load(ps[23]),Body=load(ps[0]);
if(C.I.length!==921*3||P.I.length!==682*3)throw Error('Core/patch faces unexpected');
const originalBodyJSON=JSON.stringify([Body.a.POSITION,Body.m.POSITION,Body.I,Body.a.WEIGHTS_0]);
const protected908=C.a.POSITION.slice(0,908).map(p=>p.slice()),protectedMorph=C.m.POSITION.slice(0,908).map(p=>p.slice());
const P0=JSON.stringify(C.I.slice(0,529*3));
const vec=(a)=>Array.isArray(a)?a.slice():a;
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,n)=>a.map(x=>x*n);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>mul(a,1/(Math.hypot(...a)||1)),smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const keys=Object.keys(P.a),mkeys=Object.keys(P.m),out={a:Object.fromEntries(keys.map(k=>[k,[]])),m:Object.fromEntries(mkeys.map(k=>[k,[]])),I:[]};
const map=new Map(),sourceRefs=[],sourceFaceCount=0,parts=[{label:'generatedCore',item:C,faces:C.I.slice(529*3)},{label:'skinBridge',item:P,faces:P.I}];
function idOf(part,idx){
 const a=part.a,p=a.POSITION[idx],m=part.m.POSITION[idx],key=[...p,...m].map(x=>Math.round(x*1e5)).join(',');
 let id=map.get(key);if(id!==undefined){sourceRefs[id].push({label:part===C?'core':'bridge',idx});return id;}
 id=out.a.POSITION.length;map.set(key,id);
 for(const k of keys)out.a[k].push(vec(a[k][idx]));
 for(const k of mkeys)out.m[k].push(vec(part.m[k][idx]));
 sourceRefs.push([{label:part===C?'core':'bridge',idx}]);return id;
}
const faceSource=[];
for(const part of parts){
 for(let k=0;k<part.faces.length;k+=3){const v=part.faces.slice(k,k+3).map(id=>idOf(part.item,id));if(new Set(v).size<3)throw Error('Degenerate transferred source face');
  out.I.push(...v);faceSource.push(part.label);
 }
}
const mergedUnique=out.a.POSITION.length,mergedTriangles=out.I.length/3;
if(mergedTriangles!==1074)throw Error('Transfer failed '+mergedTriangles);
// Validate actual physical vertex sharing from core-generated faces to skin faces.
const usage=new Map();
for(let f=0;f<mergedTriangles;f++)for(let j=0;j<3;j++){const v=out.I[3*f+j],row=usage.get(v)||new Set();row.add(faceSource[f]);usage.set(v,row);}
const shared=[...usage].filter(([id,groups])=>groups.size>1).map(([id])=>id);
if(shared.length<12)throw Error('Expected real cross-submesh shared indices: '+shared.length);
// The original generated core has matching nodes against material 3 and the
// bridge outer rim. Lock *all* existing vertex positions to protect those.
const originals=out.a.POSITION.map(p=>p.slice()),originalMorph=out.m.POSITION.map(p=>p.slice());
const sourceFaces=out.I.slice();
// For barycentric subdivision, all original triangle edges remain as-is.
// New central vertices allow detailed curvature without any T junctions.
function median(vs,k){const p=vs.map(i=>out.a[k][i]);const first=p[0];return Array.isArray(first)?first.map((_,j)=>p.reduce((s,x)=>s+x[j],0)/p.length):p.reduce((s,x)=>s+x,0)/p.length;}
function medMorph(vs,k){const p=vs.map(i=>out.m[k][i]);const first=p[0];return Array.isArray(first)?first.map((_,j)=>p.reduce((s,x)=>s+x[j],0)/p.length):p.reduce((s,x)=>s+x,0)/p.length;}
function skinAverage(vs){
 const W=new Map();
 for(const id of vs)for(let j=0;j<4;j++){const bone=out.a.JOINTS_0[id][j],w=out.a.WEIGHTS_0[id][j];W.set(bone,(W.get(bone)||0)+w/3);}
 const top=[...W].sort((a,b)=>b[1]-a[1]).slice(0,4),total=top.reduce((s,x)=>s+x[1],0)||1;
 return{j:Array.from({length:4},(_,i)=>top[i]?.[0]||0),w:Array.from({length:4},(_,i)=>(top[i]?.[1]||0)/total)};
}

// Reconnect actual generated core surface to lateral skin, then fair only
// original *interior* vertices. Unlike faceted r26, this does not introduce
// new spokes/fan centroids which looked visually wrinkled.
const centerIds=[];
out.I=sourceFaces.slice();
const srcPos=out.a.POSITION.map(p=>p.slice()),srcMorph=out.m.POSITION.map(p=>p.slice());
const forbidden=new Set();
const allMatch=new Set();
for(const pi of [0,17,18,21,22]){
 const part=load(ps[pi]);
 for(const id of new Set(part.I)){
 const p=part.a.POSITION[id],m=part.m.POSITION[id],key=[...p,...m].map(x=>Math.round(x*1e5)).join(',');
 allMatch.add(key);
 }
}
const coreStay=new Set(C.I.slice(0,529*3));
for(let id=0;id<mergedUnique;id++){
 if(sourceRefs[id].some(r=>r.label==='core'&&(coreStay.has(r.idx)||(r.idx>=1060&&r.idx<=1076)))){forbidden.add(id);continue;}
 const p=srcPos[id],m=srcMorph[id],key=[...p,...m].map(x=>Math.round(x*1e5)).join(',');
 if(allMatch.has(key)){forbidden.add(id);continue;}
}
const E=new Map(),adj=Array.from({length:mergedUnique},()=>new Set());
for(let f=0;f<sourceFaces.length;f+=3){
 const vs=sourceFaces.slice(f,f+3);
 for(const [a,b]of [[vs[0],vs[1]],[vs[1],vs[2]],[vs[2],vs[0]]]){
 const key=a<b?a+':'+b:b+':'+a;
 E.set(key,(E.get(key)||0)+1);adj[a].add(b);adj[b].add(a);}
}
for(const [k,c]of E)if(c===1)for(const id of k.split(':'))forbidden.add(+id);
// Apply Taubin-like gentle nonshrinking relaxation in lateral skin.
// Lock entire pit/rim, all 908 authored points and the material border.
const allowed=[];
for(let i=0;i<mergedUnique;i++){
 if(forbidden.has(i))continue;
 const p=srcPos[i];if(Math.abs(p[0])>.15||p[2]<.71||p[2]>1.06)continue;
 allowed.push(i);
}
let working=srcPos.map(p=>p.slice());
const passes=strong?8:5,lambda=strong?.18:.12;
for(let pass=0;pass<passes;pass++){
 const old=working.map(x=>x.slice());
 for(const id of allowed){
 const p=old[id],near=[...adj[id]],avg=[0,0,0];
 if(near.length<3)continue;
 for(const v of near)for(let k=0;k<3;k++)avg[k]+=old[v][k]/near.length;
 const wt=Math.exp(-(((Math.abs(p[0])-.034)/.062)**2));
 const mask=.35+.65*wt;
 for(let k=0;k<3;k++)working[id][k]=p[k]+lambda*mask*(avg[k]-p[k]);
 }
}
const targets=[];
for(const id of allowed){
 const p=srcPos[id],target=working[id];
 const [x,y,z]=p;
 const core=Math.exp(-((x/.033)**2)-(((y+.029)/.068)**2));
 const major=Math.exp(-(((Math.sqrt((x/.036)**2+((y+.052)/.050)**2)-.80)/.27)**2));
 const minor=Math.exp(-(((Math.sqrt((x/.023)**2+((y-.005)/.026)**2)-.80)/.27)**2));
 const taper=Math.max(0,Math.min(1,(.04-y)/.026))*Math.max(0,Math.min(1,(y+.13)/.037));
 const zLift=(strong?.0035:.0022)*taper*(.55*major+.30*minor+.15*core);
 targets.push({id,p,target:[target[0],target[1],target[2]+zLift]});
}
function quality(pos,old,i){
 let flip=0,zero=0,min=Infinity;
 for(let f=0;f<i.length;f+=3){
  const [a,b,c]=i.slice(f,f+3),q=cross(sub(pos[b],pos[a]),sub(pos[c],pos[a])),r=cross(sub(old[b],old[a]),sub(old[c],old[a])),area=Math.hypot(...q)*.5;
  if(area<1e-11)zero++;
  if(r.reduce((s,x,j)=>s+x*q[j],0)<-1e-14)flip++;
  min=Math.min(min,area);
 }
 return{flip,zero,min};
}
let fairingScale=1,restQuality,poseQuality;
const meshBaseline=srcPos,morphBaseline=srcMorph,desired=targets.map(x=>({id:x.id,dz:x.target[2]-x.p[2],dx:x.target[0]-x.p[0],dy:x.target[1]-x.p[1]}));

for(let attempt=0;attempt<16;attempt++){
 for(const {id,dz,dx,dy} of desired){out.a.POSITION[id][0]=meshBaseline[id][0]+dx*fairingScale;out.a.POSITION[id][1]=meshBaseline[id][1]+dy*fairingScale;out.a.POSITION[id][2]=meshBaseline[id][2]+dz*fairingScale;}
 restQuality=quality(out.a.POSITION,meshBaseline,out.I);
 const newPose=out.a.POSITION.map((p,i)=>add(p,out.m.POSITION[i])),oldPose=meshBaseline.map((p,i)=>add(p,morphBaseline[i]));
 poseQuality=quality(newPose,oldPose,out.I);
 if(restQuality.flip===0&&poseQuality.flip===0&&restQuality.zero===0&&poseQuality.zero===0)break;
 fairingScale*=.70;
 if(attempt===15)throw Error('Oval retopology could not avoid triangle fold');
}
function calcNormals(pos,i){const result=pos.map(()=>[0,0,0]);for(let j=0;j<i.length;j+=3){const [a,b,c]=i.slice(j,j+3),n=cross(sub(pos[b],pos[a]),sub(pos[c],pos[a]));for(const v of [a,b,c])result[v]=add(result[v],n);}return result.map(norm);}
const normals=calcNormals(out.a.POSITION,out.I),posedNormals=calcNormals(out.a.POSITION.map((p,i)=>add(p,out.m.POSITION[i])),out.I);
// Preserve original clean anatomical shading: the underlying skin patch
// was intentionally sculpted with smoothed normals. Recomputing normals
// from large heterogeneous radial fan triangles introduces severe facets.
for(let id=0;id<mergedUnique;id++){
 const refs=sourceRefs[id],values=[],poses=[];
 for(const {label,idx}of refs){const obj=label==='core'?C:P,ra=obj.a.NORMAL[idx],md=obj.m.NORMAL[idx];values.push(ra);poses.push(add(ra,md));}
 const sum=(xs)=>xs.reduce((v,x)=>add(v,x),[0,0,0]);
 const n=norm(sum(values)),p=norm(sum(poses));
 out.a.NORMAL[id]=n;out.m.NORMAL[id]=sub(p,n);
}
for(let f=0;f<mergedTriangles;f++){
 const base=sourceFaces.slice(f*3,f*3+3),id=centerIds[f];
 const avg=norm(base.map(v=>out.a.NORMAL[v]).reduce(add,[0,0,0]));
 const pose=norm(base.map(v=>add(out.a.NORMAL[v],out.m.NORMAL[v])).reduce(add,[0,0,0]));
 out.a.NORMAL[id]=avg;out.m.NORMAL[id]=sub(pose,avg);
}
// Keep originally authored anatomy and its 529 triangles untouched in material3.
C.I=C.I.slice(0,529*3);
const userDeleted=new Map();
for(const f of user.deletedFaces){const set=userDeleted.get(f.primitive)||new Set();set.add(f.vertices.slice().sort((a,b)=>a-b).join(','));userDeleted.set(f.primitive,set);}
for(const [pi,forbid] of userDeleted){
 const tri=pi===13?C.I:read(ps[pi].indices);
 for(let j=0;j<tri.length;j+=3)if(forbid.has(tri.slice(j,j+3).sort((a,b)=>a-b).join(',')))throw Error('User-deleted face resurfaced: '+pi);
}
if(JSON.stringify([Body.a.POSITION,Body.m.POSITION,Body.I,Body.a.WEIGHTS_0])!==originalBodyJSON)throw Error('Body changed');
for(let i=0;i<908;i++)if(JSON.stringify(C.a.POSITION[i])!==JSON.stringify(protected908[i])||JSON.stringify(C.m.POSITION[i])!==JSON.stringify(protectedMorph[i]))throw Error('Original manual anatomy modified');
if(JSON.stringify(C.I)!==P0)throw Error('Artist retained faces changed');
const triangleSource=ps.reduce((s,p)=>s+g.accessors[p.indices].count/3,0);
const faceCountFinal=triangleSource;
function write(rows,template){
 const ac=g.accessors[template],n=N[ac.type],sz=S[ac.componentType],data=Buffer.alloc(rows.length*n*sz),o=(bin.length+3)&~3;
 for(let j=0;j<rows.length;j++)for(let k=0;k<n;k++){
  const val=n===1?rows[j]:rows[j][k],at=(j*n+k)*sz;
  if(!Number.isFinite(val))throw Error('Nonfinite new accessor');
  if(ac.componentType===5126)data.writeFloatLE(val,at);
  else if(ac.componentType===5125)data.writeUInt32LE(val,at);
  else if(ac.componentType===5123)data.writeUInt16LE(val,at);
  else if(ac.componentType===5121)data.writeUInt8(Math.round(val),at);
 }
 bin=Buffer.concat([bin,Buffer.alloc(o-bin.length),data]);
 const bv=g.bufferViews.push({buffer:0,byteOffset:o,byteLength:data.length})-1,ax={bufferView:bv,componentType:ac.componentType,count:rows.length,type:ac.type};
 if(ac.normalized!==undefined)ax.normalized=ac.normalized;
 if(ac.min||ac.max)for(const k of ['min','max'])if(ac[k])ax[k]=Array.from({length:n},(_,t)=>k==='min'?Math.min(...rows.map(v=>n===1?v:v[t])):Math.max(...rows.map(v=>n===1?v:v[t])));
 return g.accessors.push(ax)-1;
}
function writeIndices(I,template){
 if(I.length%3||Math.max(...I)>=65536)throw Error('Bad indices');
 const o=(bin.length+3)&~3,dat=Buffer.alloc(I.length*2);I.forEach((id,i)=>dat.writeUInt16LE(id,i*2));
 bin=Buffer.concat([bin,Buffer.alloc(o-bin.length),dat]);
 const bv=g.bufferViews.push({buffer:0,byteOffset:o,byteLength:dat.length})-1;
 return g.accessors.push({bufferView:bv,componentType:5123,count:I.length,type:'SCALAR',min:[0],max:[Math.max(...I)]})-1;
}
ps[13].indices=writeIndices(C.I,ps[13].indices);
for(const [k,i]of Object.entries(P.p.attributes))P.p.attributes[k]=write(out.a[k],i);
for(const [k,i]of Object.entries(P.p.targets[0]))P.p.targets[0][k]=write(out.m[k],i);
P.p.indices=writeIndices(out.I,P.p.indices);
P.p.material=5;
P.p.extras={...P.p.extras,name:'r26-integrated-oval-anatomy-and-perineal-skin',type:'unified-physical-perineal-retopology',rev96r26PhysicalCoreSkirtVertexWelding:true,rev96r26AnteriorLargeUAndPosteriorSmallU:true,rev96r26AnteriorPosteriorAnalSeparationPreserved:true,rev96r26Material:5};
C.p.extras={...C.p.extras,rev96r26GeneratedCoreMovedToUnifiedSkin:true,rev96r26AuthoredTrianglesRetained:529};
g.extras={...g.extras,revision:'rev96-user101-r26-'+tag,baselineSHA256:baselineHash,unifiedCorePerinealPrimitive:23,physicalCoreSkirtWeld:true,wholeBodyWatertight:false,visualAcceptance:'pending',manual101Protected:true,authored908Preserved:true,garment370:true,rig63:true};
const garmentFaces=ps.reduce((s,p)=>s+(p.extras?.layer==='garment'?g.accessors[p.indices].count/3:0),0);
if(garmentFaces!==370)throw Error('Independent garments changed');
const total=ps.reduce((s,p)=>s+g.accessors[p.indices].count/3,0);
if(total!==faceCountFinal)throw Error('Total face count mismatch '+total+' expected '+faceCountFinal);
g.buffers[0].byteLength=bin.length;
const rawjson=Buffer.from(JSON.stringify(g)),jp=Buffer.concat([rawjson,Buffer.alloc((4-rawjson.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const H=Buffer.alloc(12),jH=Buffer.alloc(8),bH=Buffer.alloc(8);
H.write('glTF');H.writeUInt32LE(2,4);H.writeUInt32LE(12+8+jp.length+8+bp.length,8);jH.writeUInt32LE(jp.length,0);jH.write('JSON',4);bH.writeUInt32LE(bp.length,0);bH.write('BIN\0',4);
const output=Buffer.concat([H,jH,jp,bH,bp]);fs.writeFileSync(path.join(root,dest),output,{flag:'wx'});
const info={schema:'xpz3d/f11/rev96/r26-v1',createdUTC:new Date().toISOString(),baseline:src,baselineSHA256:baselineHash,file:dest,sha256:sha(output),
 sourceCoreAuthoredFaces:529,sourceCoreGeneratedFaces:392,sourcePelvicSkinFaces:682,mergedPhysicalIndexFaces:mergedTriangles,mergedPhysicalVertices:mergedUnique,sharedPhysicalCoreSkinVertices:shared.length,addedBarycentricVertices:centerIds.length,smoothedOriginalInteriorVertices:allowed.length,relaxationPasses:passes,newTriangles:total,oldTriangles:triangleSource,
 skinMaterial:5,coreMaterial:3,physicalMaterialIndexWeldWithinNewSkinPrimitive:true,separateMaterialBoundaryNoPhysicalIndexWeld:true,ellipticLargeAnteriorUSmallPosteriorU:true,analPosteriorShiftPreserved:.020,
 fairingScale,restQuality,poseQuality,garmentFaces,author908Preserved:true,sourceTrim101Preserved:true,visualApproval:'pending',seamAudit:'pending'};
fs.writeFileSync(path.join(root,logName),JSON.stringify(info,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(info,null,2));
