'use strict';
/**
 * XPZ3D F11 rev96 r24 | progressive vestibular-perineal groove + posterior anal inset
 * Source r23 LBS Weld is immutable. Changes only generated anatomy vertices >=908,
 * active posterior vestibular/anal inset, and internal (non-seam) vertices of large
 * pelvic skin patches. Original manual trim 101 faces and 754 saved sculpt positions
 * remain protected. No newly opened aperture; anal inset and vestibular cavity
 * remain anatomically distinct.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const src='r21AO-F11-user101-native-retopo-r23-lbsweld.glb',canonical='f7e0a3d16712abfa21ce4b3a4faedea55b3fb77dac0400f64575423838db7132';
const mode='posterior-v3';
const dest='r21AO-F11-user101-native-perineal-r24-'+mode+'.glb',audit='REV96_USER101_R24_'+mode.toUpperCase()+'_BUILD.json';
if([dest,audit].some(n=>fs.existsSync(path.join(root,n))))throw Error('Refuse overwrite of existing r24 artifact');
const input=fs.readFileSync(path.join(root,src));if(sha(input)!==canonical)throw Error('Immutable r23 input hash mismatch');
const manual=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(manual)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Manual trim changed');
const m=JSON.parse(manual);if(m.deletedFaces.length!==101||m.positions.length!==754||Object.keys(m.controls).length!==106)throw Error('Missing original user data');
const jl=input.readUInt32LE(12),doc=JSON.parse(input.toString('utf8',20,20+jl));
let bin=Buffer.from(input.subarray(28+jl,28+jl+input.readUInt32LE(20+jl)));
const ps=doc.meshes[0].primitives;
if(ps.length!==24||doc.skins[0].joints.length!==63)throw Error('Unexpected r23 GLB rig/part count');
const count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},size={5121:1,5123:2,5125:4,5126:4},readOp={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function get(accessor){
 const a=doc.accessors[accessor],v=doc.bufferViews[a.bufferView],n=count[a.type],sz=size[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*sz,out=[];
 for(let i=0;i<a.count;i++){let row=[];for(let k=0;k<n;k++)row.push(bin[readOp[a.componentType]](off+i*stride+k*sz));out.push(n===1?row[0]:row);}
 return out;
}
function load(pi){
 const p=ps[pi];return {p,a:Object.fromEntries(Object.entries(p.attributes).map(([k,id])=>[k,get(id)])),m:Object.fromEntries(Object.entries(p.targets[0]).map(([k,id])=>[k,get(id)])),I:get(p.indices)};
}
const body=load(0),core=load(13),patch=load(23),origCoreP=core.a.POSITION.map(x=>x.slice()),origCoreMorph=core.m.POSITION.map(x=>x.slice());
const origBodyP=JSON.stringify(body.a.POSITION),origBodyM=JSON.stringify(body.m.POSITION),origBodyI=JSON.stringify(body.I);
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,t)=>a.map(x=>x*t),norm=a=>mul(a,1/(Math.hypot(...a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const window=(y,a,b,c,d)=>smooth((y-a)/(b-a))*(1-smooth((y-c)/(d-c)));
const parms={pitShift:.013,groove:.0047,labialLip:.0017,flankRecess:.008,flankTuck:.004};
const frozen=new Set(),crossSeam=[];
const coordinateKey=(p,h)=>[...p,...h].map(x=>Math.round(x*1e5)).join(',');
const virtual=new Map();
for(let pi=0;pi<ps.length;pi++){
 const p=ps[pi],P=get(p.attributes.POSITION),M=get(p.targets[0].POSITION),idx=get(p.indices),used=new Set(idx);
 for(const i of used){const k=coordinateKey(P[i],M[i]),v=virtual.get(k)||[];v.push([pi,i]);virtual.set(k,v);}
}
for(let i=0;i<core.a.POSITION.length;i++){
 const row=virtual.get(coordinateKey(core.a.POSITION[i],core.m.POSITION[i]))||[];
 if(row.some(x=>x[0]!==13)){frozen.add(i);crossSeam.push(i);}
}
for(const p of core.I)if(p>=core.a.POSITION.length)throw Error('Core index out of range');
if(core.a.POSITION.length!==2268||patch.I.length/3!==682||core.I.length/3!==921)throw Error('Unrecognized r23 anatomical shell');
const altered=[],movedPit=[];
const gridStart=908,gridCols=19,gridRows=8;
const posteriorRows=[0,0,.0001,.0009,.0052,.0094,.0061,0];
const centerByRow=Array.from({length:gridRows},(_,r)=>core.a.POSITION[gridStart+r*gridCols+9][0]);
for(let r=0;r<gridRows;r++)for(let c=0;c<gridCols;c++){
 const id=gridStart+r*gridCols+c;
 if(frozen.has(id))continue;
 const before=core.a.POSITION[id],P=before.slice(),y=P[1],dx=P[0]-centerByRow[r],ax=Math.abs(dx);
 const lateralFall=Math.exp(-0.5*(dx/.021)**2);
 const yshift=posteriorRows[r]*(parms.pitShift/.011)*lateralFall;
 P[1]+=yshift;
 // A continuous shallow skin depression between the pre-existing vestibular
 // lips and the separate posterior anal inset. Positive Z faces into the
 // native body (recesses on under-camera), while bilateral lips project out.
 const g=window(y,-.084,-.059,-.011,.014);
 const recess=Math.exp(-.5*(dx/.0043)**2)*parms.groove*g;
 const bilateral=(Math.exp(-.5*((dx-.0085)/.0036)**2)+Math.exp(-.5*((dx+.0085)/.0036)**2)) *parms.labialLip * window(y,-.085,-.055,-.028,.001);
 P[2]+=recess-bilateral;
 // Smoothly narrow the posterior continuation of both folds; avoid creating
 // a second open tract or turning the anal rim into a straight rectangular hole.
 if(Math.abs(yshift)>1e-12||Math.abs(recess-bilateral)>1e-12){
  core.a.POSITION[id]=P;
  altered.push({id,before,after:P,oldY:y,posteriorShift:yshift,recess,reduction:bilateral});
 }
}
// Ring and blind center were generated by r22. Neither original artist's 908
// sculpted vertices nor geometry at other material seams may be displaced.
const ringCenter=core.a.POSITION[1076].slice();
const pitTargets=new Map();
for(let i=1060;i<=1076;i++){
 if(frozen.has(i))throw Error('Anal inset vertex unexpectedly welded to foreign primitive '+i);
 const P=core.a.POSITION[i].slice();
 P[1]+=parms.pitShift;
 // Gently broaden the former polygonal ring; preserve a distinct blind hole.
 if(i<=1067){P[0]=ringCenter[0]+(P[0]-ringCenter[0])*1.06;P[2]+=.00025;}
 else if(i<=1075){P[0]=ringCenter[0]+(P[0]-ringCenter[0])*1.08;P[2]+=.0004;}
 else{P[2]+=.0011;}
 core.a.POSITION[i]=P;pitTargets.set(i,P.slice());movedPit.push(i);
}
const pitOld=origCoreP[1076],pitNew=core.a.POSITION[1076];
if(Math.abs(pitNew[1]-pitOld[1]-parms.pitShift)>1e-6)throw Error('Posterior pit shift inconsistent');
// The r23 broad openings #2 and #5 are already fully capped but planar. Bend
// only their interior rings, leaving *all* original boundary anchor vertices
// and clothing/body skinning untouched.
const patches=[{loop:2,n:38,start:9,rings:4},{loop:5,n:35,start:239,rings:4}];
const movedPatch=[],ringParams=[.23,.50,.77];
for(const cfg of patches){
 const {n,start}=cfg,anchors=patch.a.POSITION.slice(start,start+n),center=patch.a.POSITION[start+n*4];
 for(let ri=1;ri<cfg.rings;ri++)for(let j=0;j<n;j++){
  const id=start+ri*n+j,old=patch.a.POSITION[id],anchor=anchors[j],t=ringParams[ri-1],P=old.slice();
  // Curved medial bowl rather than a nearly planar radial fan.
  const extent=window(anchor[1],-.152,-.10,.064,.115);
  const transition=Math.sin(Math.PI*t);
  const medial=Math.sign(center[0])*(.35+.65*Math.min(1,Math.abs(anchor[0])/.09));
  const recession=parms.flankRecess*transition*extent;
  P[2]+=recession;
  P[0]-=medial*parms.flankTuck*transition*extent;
  patch.a.POSITION[id]=P;movedPatch.push({id,loop:cfg.loop,from:old,to:P});
 }
}
function normals(P,I){
 const N=Array.from({length:P.length},()=>[0,0,0]);
 for(let k=0;k<I.length;k+=3){
  let [a,b,c]=I.slice(k,k+3),n=cross(sub(P[b],P[a]),sub(P[c],P[a]));
  for(let id of [a,b,c])N[id]=add(N[id],n);
 }
 return N.map(norm);
}
function recompute(target,changed){
 const a=normals(target.a.POSITION,target.I),q=normals(target.a.POSITION.map((p,i)=>add(p,target.m.POSITION[i])),target.I);
 for(const id of changed){target.a.NORMAL[id]=a[id];target.m.NORMAL[id]=sub(q[id],a[id]);}
}
// Reduce inward fairing amplitude until no patch face changes orientation.
// This preserves the exact existing seam and avoids broad tissue-sheet inversion.
// Bring the anatomy back towards the accepted source if exaggerated
// contour sculpt crosses existing triangles. All user-authored vertices remain fixed.
let coreSculptScale=1;
for(let attempt=0;attempt<9;attempt++){
 for(const item of altered)core.a.POSITION[item.id]=add(item.before,mul(sub(item.after,item.before),coreSculptScale));
 for(const [id,target] of pitTargets)core.a.POSITION[id]=add(origCoreP[id],mul(sub(target,origCoreP[id]),coreSculptScale));

 const qa=(()=>{let reversed=0;for(let k=0;k<core.I.length;k+=3){let [a,b,c]=core.I.slice(k,k+3),p=core.a.POSITION,z=origCoreP,x=cross(sub(p[b],p[a]),sub(p[c],p[a])),y=cross(sub(z[b],z[a]),sub(z[c],z[a]));if(x.reduce((sum,v,j)=>sum+v*y[j],0)<-1e-13)reversed++;}return reversed;})();
 if(qa===0)break;
 coreSculptScale*=.7;
 if(attempt===8)throw Error('Core sculpt cannot avoid inversion');
}
const pitActual=core.a.POSITION[1076].slice();const actualShift=pitActual[1]-pitOld[1];
const patchOriginal=get(ps[23].attributes.POSITION);
let patchFairingScale=1;
for(let attempt=0;attempt<9;attempt++){
 for(const item of movedPatch)patch.a.POSITION[item.id]=add(item.from,mul(sub(item.to,item.from),patchFairingScale));
 const qa=(()=>{let reversed=0;for(let k=0;k<patch.I.length;k+=3){let [a,b,c]=patch.I.slice(k,k+3),p=patch.a.POSITION,z=patchOriginal,x=cross(sub(p[b],p[a]),sub(p[c],p[a])),y=cross(sub(z[b],z[a]),sub(z[c],z[a]));if(x.reduce((sum,v,j)=>sum+v*y[j],0)<-1e-13)reversed++;}return reversed;})();
 if(qa===0)break;
 patchFairingScale*=.5;
 if(attempt===8)throw Error('Patch fairing cannot avoid inversion');
}
recompute(core,new Set([...altered.map(x=>x.id),...movedPit]));
recompute(patch,new Set(movedPatch.map(x=>x.id)));
if(JSON.stringify(body.a.POSITION)!==origBodyP||JSON.stringify(body.m.POSITION)!==origBodyM||JSON.stringify(body.I)!==origBodyI)throw Error('Body source modified');
for(let i=0;i<908;i++){
 if(JSON.stringify(core.a.POSITION[i])!==JSON.stringify(origCoreP[i]))throw Error('Protected artist sculpt modified at '+i);
 if(JSON.stringify(core.m.POSITION[i])!==JSON.stringify(origCoreMorph[i]))throw Error('Protected artist morph modified at '+i);
}
function geomQuality(P,I,A=undefined){
 let min=Infinity,zero=0,reversed=0,maxStretch=0;
 for(let k=0;k<I.length;k+=3){
  const [a,b,c]=I.slice(k,k+3),v=cross(sub(P[b],P[a]),sub(P[c],P[a])),l=Math.hypot(...v)/2;min=Math.min(min,l);
  if(l<1e-11)zero++;
  if(A){const w=cross(sub(A[b],A[a]),sub(A[c],A[a])),old=Math.hypot(...w)/2;
   if(w.reduce((s,x,j)=>s+x*v[j],0)<-1e-13)reversed++;
   if(old>1e-8)maxStretch=Math.max(maxStretch,l/old);
  }
 }
 return {minArea:min,zero,reversed,maxStretch};
}
const coreQuality=geomQuality(core.a.POSITION,core.I,origCoreP);
const patchOrigP=patchOriginal,patchQuality=geomQuality(patch.a.POSITION,patch.I,patchOrigP);
const corePose=geomQuality(core.a.POSITION.map((p,i)=>add(p,core.m.POSITION[i])),core.I);
const patchPose=geomQuality(patch.a.POSITION.map((p,i)=>add(p,patch.m.POSITION[i])),patch.I);
if(coreQuality.reversed||patchQuality.reversed||coreQuality.zero>0||patchQuality.zero>0||corePose.zero>0||patchPose.zero>0)throw Error('Geometry degeneracy/normal inversion: '+JSON.stringify({coreQuality,patchQuality,corePose,patchPose}));
// Material boundary coordinate/morph preservation.
for(const i of frozen)if(JSON.stringify(core.a.POSITION[i])!==JSON.stringify(origCoreP[i]))throw Error('Changed shared cross-primitive seam at '+i);
const prevBoundaryKeys=new Set([...virtual.keys()].filter(k=>(virtual.get(k)||[]).some(v=>v[0]===13)&&(virtual.get(k)||[]).some(v=>v[0]!==13)));
for(const key of prevBoundaryKeys)if(!frozen.size)throw Error('Boundary keys lost');
function writeRows(rows,template){
 const a=doc.accessors[template],n=count[a.type],sz=size[a.componentType],t=Buffer.alloc(rows.length*n*sz),start=(bin.length+3)&~3;
 for(let i=0;i<rows.length;i++)for(let j=0;j<n;j++){
  const val=n===1?rows[i]:rows[i][j],off=(i*n+j)*sz;
  if(!Number.isFinite(val))throw Error('Invalid GLB numeric value');
  if(a.componentType===5126)t.writeFloatLE(val,off);
  else if(a.componentType===5123)t.writeUInt16LE(val,off);
  else if(a.componentType===5125)t.writeUInt32LE(val,off);
  else if(a.componentType===5121)t.writeUInt8(val,off);
 }
 bin=Buffer.concat([bin,Buffer.alloc(start-bin.length),t]);
 const bv=doc.bufferViews.push({buffer:0,byteOffset:start,byteLength:t.length})-1,ax={bufferView:bv,componentType:a.componentType,count:rows.length,type:a.type};
 if(a.normalized!==undefined)ax.normalized=a.normalized;
 if(a.min||a.max)for(const bound of ['min','max'])if(a[bound])ax[bound]=Array.from({length:n},(_,j)=>bound==='min'?Math.min(...rows.map(v=>n===1?v:v[j])):Math.max(...rows.map(v=>n===1?v:v[j])));
 return doc.accessors.push(ax)-1;
}
for(const part of [core,patch]){
 for(const key of ['POSITION','NORMAL'])part.p.attributes[key]=writeRows(part.a[key],part.p.attributes[key]);
 part.p.targets[0].NORMAL=writeRows(part.m.NORMAL,part.p.targets[0].NORMAL);
}
core.p.extras={...core.p.extras,rev96r24PosteriorAnalShift:parms.pitShift,rev96r24PerinealRapheCrease:true,rev96r24AnalCavitySeparate:true};
patch.p.extras={...patch.p.extras,rev96r24LateralFairing:true,rev96r24OriginalBoundaryAnchorsPreserved:true};
doc.extras={...doc.extras,revision:'rev96-user101-r24-'+mode,sourceRevision:'r23-lbsweld',sourceSHA256:canonical,
 posteriorAnalDeltaY:actualShift,analCenterBefore:pitOld,analCenterAfter:pitActual,
 vestibuleToPerinealRaphe:true,separateBlindAnalInset:true,preservedUserDeleted101:true,
 manual754OriginalPositionsProtected:true,nativeBodyPrimitive0Preserved:true,localSeamRestMorphProtected:true,
 wholeBodyWatertight:false,skinCrossPrimitiveIndexWelded:false,notUserApproved:true,notG1Certified:true};
doc.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(doc)),jpad=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bpad=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jpad.length+8+bpad.length,8);jh.writeUInt32LE(jpad.length);jh.write('JSON',4);bh.writeUInt32LE(bpad.length);bh.write('BIN\\0',4);
const out=Buffer.concat([head,jh,jpad,bh,bpad]);fs.writeFileSync(path.join(root,dest),out,{flag:'wx'});
const report={schema:'xpz3d/f11/rev96/r24/v1',file:dest,sha256:sha(out),dateUTC:new Date().toISOString(),base:src,baseSHA:canonical,parameters:parms,posteriorAnalDeltaY:actualShift,
 createdGeometry:{coreMoved:altered.length,pitMoved:movedPit.length,patchInteriorMoved:movedPatch.length,coreSculptScale,patchFairingScale,triangles:ps.reduce((s,p)=>s+doc.accessors[p.indices].count/3,0)},
 protected:{originalArtist908Vertices:true,userTrim101:true,manualPositions754:true,rig63:true,independentGarment370:true,originalBodyPrimitiveUnchanged:true,materialSeamVerticesFrozen:frozen.size},
 beforeAfter:{analCenterOld:pitOld,analCenterNew:pitActual},quality:{core:coreQuality,patch:patchQuality,corePose,patchPose},
 openEdgesClaim:'Not re-validated; unchanged triangle indices and unchanged rest/morph shared boundary anchors',renderReview:'pending',finalVisualAcceptance:false};
fs.writeFileSync(path.join(root,audit),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:dest,sha256:sha(out),triangles:report.createdGeometry.triangles,posteriorShift:actualShift,coreMoved:altered.length,pitMoved:movedPit.length,patchMoved:movedPatch.length,seamsFrozen:frozen.size,quality:report.quality},null,2));
