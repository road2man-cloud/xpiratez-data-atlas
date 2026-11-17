'use strict';
/**
 * F11 r9: tucked closure-first, 101 manual deletions protected.
 * Input: r7 lowpoly (already reduced previously); NEVER reduce more for this step.
 * Round the posterior perineum, register skinning/morph to native body boundary,
 * roll under/seal every exposed edge of the *new perineal patch*, and seal four
 * tiny lateral skin pinholes. Global garment/neck/limb openings are not touched.
 *
 * Outputs: independent r8 GLB + manifest. No overwrite or synthetic
 * restoration of the original 101 triangle index triplets.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,source=path.join(root,'r21AO-F11-user101-perineum-lowpoly-r7.glb');
const output='r21AO-F11-user101-posterior-tucked-closure-r9.glb';
const metaName='REV96_USER101_POSTERIOR_CLOSURE_R9.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const file of [output,metaName])if(fs.existsSync(path.join(root,file)))throw Error('Refuse overwrite '+file);
const raw=fs.readFileSync(source),sourceSha='147a5eafb3ba1a9394b020eaadd9356f902e139779e0aa5793566e7c095b0170';
if(sha(raw)!==sourceSha)throw Error('r7 input SHA drift');
const snapRaw=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
const snapshotSHA='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5';
if(sha(snapRaw)!==snapshotSHA)throw Error('Canonical manual 101-face JSON changed');
const snapshot=JSON.parse(snapRaw);
if(snapshot.deletedFaces.length!==101||snapshot.positions.length!==754||Object.keys(snapshot.controls).length!==106)throw Error('Manual source cardinality changed');
const jl=raw.readUInt32LE(12),doc=JSON.parse(raw.toString('utf8',20,20+jl));let bin=Buffer.from(raw.subarray(28+jl,28+jl+raw.readUInt32LE(20+jl)));
const ps=doc.meshes[0].primitives;
if(ps.length!==23||doc.skins[0].joints.length!==63||ps.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0)!==3522)throw Error('Bad r7 rig/topology');
const sizes={5121:1,5123:2,5125:4,5126:4},readOp={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function read(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=dims[a.type],sz=sizes[a.componentType],f=readOp[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||sz*n,rows=[];for(let i=0;i<a.count;i++){let x=[];for(let k=0;k<n;k++)x.push(bin[f](off+i*stride+k*sz));rows.push(n===1?x[0]:x)}return rows;}
function append(rows,oldId){
 const a=doc.accessors[oldId],n=dims[a.type],sz=sizes[a.componentType],at=(bin.length+3)&~3,b=Buffer.alloc(rows.length*n*sz);
 for(let i=0;i<rows.length;i++)for(let j=0;j<n;j++){
  const x=n===1?rows[i]:rows[i][j],k=(i*n+j)*sz;
  if(!Number.isFinite(x))throw Error('nonfinite accessor '+oldId+' row '+i);
  if(a.componentType===5126)b.writeFloatLE(x,k);else if(a.componentType===5125)b.writeUInt32LE(x,k);
  else if(a.componentType===5123)b.writeUInt16LE(x,k);else if(a.componentType===5121)b.writeUInt8(x,k);
 }
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),b]);
 const vi=doc.bufferViews.push({buffer:0,byteOffset:at,byteLength:b.length})-1;
 const o={bufferView:vi,componentType:a.componentType,type:a.type,count:rows.length};
 if(a.normalized!==undefined)o.normalized=a.normalized;
 if(a.min||a.max)for(const c of ['min','max'])if(a[c])o[c]=Array.from({length:n},(_,j)=>c==='min'?Math.min(...rows.map(v=>n===1?v:v[j])):Math.max(...rows.map(v=>n===1?v:v[j])));
 return doc.accessors.push(o)-1;
}
function appendIndices(ids){
 const b=Buffer.alloc(ids.length*2),at=(bin.length+3)&~3;
 if(Math.max(...ids)>65535)throw Error('uint16 index overflow');
 for(let i=0;i<ids.length;i++)b.writeUInt16LE(ids[i],i*2);
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),b]);
 const vi=doc.bufferViews.push({buffer:0,byteOffset:at,byteLength:b.length})-1;
 return doc.accessors.push({bufferView:vi,componentType:5123,type:'SCALAR',count:ids.length,min:[Math.min(...ids)],max:[Math.max(...ids)]})-1;
}
const clone=v=>Array.isArray(v)?v.slice():v;
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,t)=>a.map(x=>x*t),mix=(a,b,t)=>a.map((x,k)=>x*(1-t)+b[k]*t),len=a=>Math.hypot(...a);
const norm=v=>scale(v,1/(len(v)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const smooth=t=>t*t*(3-2*t),cols=7,rows=8;
const layers=ps.map((p,i)=>({pi:i,p,attr:Object.fromEntries(Object.entries(p.attributes).map(([k,id])=>[k,read(id)])),target:p.targets?.map(t=>Object.fromEntries(Object.entries(t).map(([k,id])=>[k,read(id)])))||[],I:read(p.indices)}));
const skin=layers[22],body=layers[0],core=layers[13];
if(skin.attr.POSITION.length!==73 || skin.I.length!==116*3)throw Error('Unexpected r7 groin patch');
const oldP=skin.attr.POSITION.map(clone),oldD=skin.target[0].POSITION.map(clone);
const A=skin.attr,MT=skin.target[0],I=skin.I.slice(),originalFaces=I.length/3;
function makeWeights(joints,weights){const map=new Map();for(let i=0;i<4;i++)map.set(joints[i],(map.get(joints[i])||0)+weights[i]);return map;}
function blendedSkin(va,vb,t){
 const map=new Map();
 for(const [a,f] of [[va,1-t],[vb,t]])for(let i=0;i<4;i++)map.set(a.joints[i],(map.get(a.joints[i])||0)+a.weights[i]*f);
 const sorted=[...map].sort((x,y)=>y[1]-x[1]).slice(0,4),sum=sorted.reduce((s,v)=>s+v[1],0)||1;
 return {joints:Array.from({length:4},(_,i)=>sorted[i]?.[0]||0),weights:Array.from({length:4},(_,i)=>(sorted[i]?.[1]||0)/sum)};
}
function bodySource(id){
 return {pos:body.attr.POSITION[id],morph:body.target[0].POSITION[id],
         uv:body.attr.TEXCOORD_0[id],
         joints:body.attr.JOINTS_0[id],weights:body.attr.WEIGHTS_0[id],
         tissue:body.attr._TISSUE[id],region:body.attr._ANATREGION[id],cavity:body.attr._ANATCAVITY[id]};
}
const body174=bodySource(174),body29=bodySource(29),body296=bodySource(296);
function lerpSource(a,b,t){
 const w=blendedSkin(a,b,t);
 return {pos:mix(a.pos,b.pos,t),morph:mix(a.morph,b.morph,t),uv:mix(a.uv,b.uv,t),
         joints:w.joints,weights:w.weights,tissue:a.tissue*(1-t)+b.tissue*t,
         region:a.region*(1-t)+b.region*t,cavity:a.cavity*(1-t)+b.cavity*t};
}
const rear=Array.from({length:cols},(_,col)=>{
 const t=col/(cols-1);
 const base=t<=.5?lerpSource(body174,body29,t*2):lerpSource(body29,body296,(t-.5)*2);
 base.pos=base.pos.slice();base.pos[0]=(t-.5)*.048;
 return base;
});
const front=Array.from({length:cols},(_,col)=>{
 const id=col;
 return {pos:clone(oldP[id]),morph:clone(oldD[id]),uv:clone(A.TEXCOORD_0[id]),
         joints:clone(A.JOINTS_0[id]),weights:clone(A.WEIGHTS_0[id]),
         tissue:A._TISSUE[id],region:A._ANATREGION[id],cavity:A._ANATCAVITY[id]};
});
const trow=[0,.12,.27,.43,.57,.73,.88,1],posteriorOffsets=[];
for(let r=1;r<rows;r++){
 const t=trow[r],w=smooth(t),shift=.32*w*w;
 for(let c=0;c<cols;c++){
  const id=r*cols+c,f=front[c],b=rear[c],frac=(c-3)/3;
  const target=mix(f.pos,b.pos,w),targetMorph=mix(f.morph,b.morph,w);
  A.POSITION[id]=mix(oldP[id],target,shift);
  MT.POSITION[id]=mix(oldD[id],targetMorph,shift);
  if(r<rows-1){
   const arch=.0018*Math.sin(Math.PI*t)*(1-.2*Math.abs(frac));
   A.POSITION[id][2]+=arch;posteriorOffsets.push(arch);
  }
  const prior={joints:clone(A.JOINTS_0[id]),weights:clone(A.WEIGHTS_0[id])};
  const next=blendedSkin(f,b,w),blend=blendedSkin(prior,next,shift);
  A.JOINTS_0[id]=blend.joints;A.WEIGHTS_0[id]=blend.weights;
  A.TEXCOORD_0[id]=mix(A.TEXCOORD_0[id],mix(f.uv,b.uv,w),shift);
  for(const [field,fname] of [['_TISSUE','tissue'],['_ANATREGION','region'],['_ANATCAVITY','cavity']])
   A[field][id]=A[field][id]*(1-shift)+(f[fname]*(1-w)+b[fname]*w)*shift;
 }
}
// Embed anal ring + pit in the re-draped surface. Each vertex gets the
// displacement field from its four closest ORIGINAL grid vertices in XY.
for(let id=56;id<oldP.length;id++){
 const candidates=Array.from({length:rows*cols},(_,i)=>{
  const d=(oldP[i][0]-oldP[id][0])**2+(oldP[i][1]-oldP[id][1])**2;
  return {i,d:Math.max(.0000008,d)};
 }).sort((a,b)=>a.d-b.d).slice(0,4);
 const sum=candidates.reduce((x,q)=>x+1/q.d,0);
 let dp=[0,0,0],dm=[0,0,0];
 for(const o of candidates){
  const s=(1/o.d)/sum,delta=sub(A.POSITION[o.i],oldP[o.i]),dmorph=sub(MT.POSITION[o.i],oldD[o.i]);
  dp=add(dp,scale(delta,s));dm=add(dm,scale(dmorph,s));
 }
 A.POSITION[id]=add(oldP[id],dp);MT.POSITION[id]=add(oldD[id],dm);
}
// Seal the free perimeter with a short rounded roll-under and a skin-lined
// inner cap. This closes ALL 26 edges of the new perineal primitive.
function border(I){
 const edges=new Map();
 for(let i=0;i<I.length;i+=3)for(const [a,b] of [[I[i],I[i+1]],[I[i+1],I[i+2]],[I[i+2],I[i]]]){
  const k=a<b?a+':'+b:b+':'+a,row=edges.get(k)||{a,b,n:0};row.n++;edges.set(k,row);
 }
 return [...edges.values()].filter(e=>e.n===1);
}
function orderedBorder(edges){
 if(!edges.length)throw Error('No perimeter edges to close');
 const successor=new Map();for(const {a,b}of edges){if(successor.has(a))throw Error('Branching perineum boundary');successor.set(a,b);}
 const loop=[edges[0].a];let current=loop[0];
 for(let i=0;i<edges.length+1;i++){const n=successor.get(current);if(n===undefined)throw Error('Open nonclosed patch');if(n===loop[0])break;loop.push(n);current=n;}
 if(loop.length!==edges.length)throw Error('Perineum has multiple/inverted border loops');
 return loop;
}
const oldBorder=border(I),boundary=orderedBorder(oldBorder);
if(boundary.length!==26)throw Error('Expected exactly 26 outer perineal edges');
const centroid=A.POSITION.slice(0,rows*cols).reduce((a,p)=>add(a,p),[0,0,0]).map(x=>x/(rows*cols));
function pushOriginalLike(id,position,morph){
 const next=A.POSITION.length;
 for(const name of Object.keys(A))A[name].push(clone(A[name][id]));
 for(const name of Object.keys(MT))MT[name].push(clone(MT[name][id]));
 A.POSITION[next]=position;MT.POSITION[next]=morph;
 return next;
}
const innerRing=[];
for(const id of boundary){
 const p=A.POSITION[id],m=MT.POSITION[id],
       t= .08, x=centroid[0]+(p[0]-centroid[0])*(1-t),
       y=centroid[1]+(p[1]-centroid[1])*(1-t);
 // Rim buries itself 5mm into the pelvic-floor backing without a visible bevel lip.
 const q=[x,y,p[2]+.0090];
 innerRing.push(pushOriginalLike(id,q,scale(m,.96)));
}
for(let k=0;k<boundary.length;k++){
 const a=boundary[k],b=boundary[(k+1)%boundary.length],
       u=innerRing[k],v=innerRing[(k+1)%boundary.length];
 I.push(b,a,u,b,u,v); // source border a->b is paired with b->a
}
// Ear clipping for the single simple XY perineal cap loop (no long fan).
function triangulatePolygon(loop){
 const pts=loop.map(id=>A.POSITION[id]),n=loop.length,inds=[...Array(n).keys()];
 const signed=pts.reduce((sum,p,i)=>{const q=pts[(i+1)%n];return sum+p[0]*q[1]-q[0]*p[1]},0);
 const side=signed>=0?1:-1,result=[];
 function crossZ(i,j,k){const a=pts[i],b=pts[j],c=pts[k];return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])}
 function insideTriangle(p,a,b,c){
  const aa=crossZ(a,b,p)*side,bb=crossZ(b,c,p)*side,cc=crossZ(c,a,p)*side;
  return aa>=-1e-9&&bb>=-1e-9&&cc>=-1e-9;
 }
 let guard=0;
 while(inds.length>3&&guard++<300){
  let ear=-1,best=Infinity;
  for(let i=0;i<inds.length;i++){
   const a=inds[(i-1+inds.length)%inds.length],b=inds[i],c=inds[(i+1)%inds.length];
   const cv=crossZ(a,b,c)*side;
   if(cv<1e-9)continue;
   let occupied=false;for(const v of inds)if(v!==a&&v!==b&&v!==c&&insideTriangle(v,a,b,c)){occupied=true;break;}
   if(occupied)continue;
   const longEdge=Math.max(len(sub(pts[a],pts[b])),len(sub(pts[b],pts[c])),len(sub(pts[c],pts[a])));
   if(longEdge<best){best=longEdge;ear=i;}
  }
  if(ear<0)throw Error('R8 back cap self-crossing; review rear contour before build');
  const a=inds[(ear-1+inds.length)%inds.length],b=inds[ear],c=inds[(ear+1)%inds.length];
  result.push(loop[a],loop[c],loop[b]); // reverse ring orientation
  inds.splice(ear,1);
 }
 if(inds.length!==3)throw Error('Cap triangulation failed');
 result.push(loop[inds[0]],loop[inds[2]],loop[inds[1]]);
 return result;
}
const capIndices=triangulatePolygon(innerRing);
I.push(...capIndices);
function faceArea(a,b,c){return len(cross(sub(b,a),sub(c,a)))*.5}
function windingAndAreas(pts,index){let zero=0,flip=0,maximumEdge=0;for(let i=0;i<index.length;i+=3){
 const [a,b,c]=index.slice(i,i+3).map(k=>pts[k]);if(faceArea(a,b,c)<5e-9)zero++;
 for(const d of [len(sub(a,b)),len(sub(b,c)),len(sub(c,a))])maximumEdge=Math.max(d,maximumEdge);
 }return{zero,maximumEdge}}
let rest=windingAndAreas(A.POSITION,I),pose=windingAndAreas(A.POSITION.map((p,id)=>add(p,MT.POSITION[id])),I);
if(rest.zero||pose.zero)throw Error('Degenerate r8 closure: rest '+rest.zero+', pose '+pose.zero);
const remainingBorders=border(I);
if(remainingBorders.length!==0)throw Error('r8 perineum not closed: '+remainingBorders.length);
// Recalculate normals in both rest/open to keep a continuous rounded rear edge.
function normals(P,I){const out=P.map(()=>[0,0,0]);for(let i=0;i<I.length;i+=3){
 const [a,b,c]=I.slice(i,i+3),n=cross(sub(P[b],P[a]),sub(P[c],P[a]));
 for(const id of[a,b,c])out[id]=add(out[id],n);
 }return out.map(norm);}
const normalRest=normals(A.POSITION,I),normalOpen=normals(A.POSITION.map((p,id)=>add(p,MT.POSITION[id])),I);
A.NORMAL=normalRest;MT.NORMAL=normalOpen.map((n,id)=>sub(n,normalRest[id]));
// Write changed perineum. No changes to input primitives 0..21.
for(const [name,rows]of Object.entries(A))skin.p.attributes[name]=append(rows,skin.p.attributes[name]);
for(const [name,rows]of Object.entries(MT))skin.p.targets[0][name]=append(rows,skin.p.targets[0][name]);
skin.p.indices=appendIndices(I);
skin.p.extras={...skin.p.extras,rev96r8PosteriorRounded:true,rev96r8ClosedSkinBorder:true,rev96r8OriginalBorderEdges:26,
 newPerineumFaceCount:I.length/3,addedBorderFaces:I.length/3-originalFaces,
 reviewStatus:'experimental'};
// Seal four small lateral holes (2 x quad + 2 x triangle) at the original
// core↔left/right skin interface; no large user-cut opening is capped.
const groups=require('./r21AO-F11-user101-perineum-lowpoly-r7-virtual-open-boundaries.json').groups;
const virt=require('./r21AO-F11-user101-perineum-lowpoly-r7-virtual-open-boundaries.json').vertices;
const groupIds=groups.filter(x=>x.n===4&&x.bounds[0][0]>-.08&&x.bounds[0][1]<.08&&x.bounds[2][0]>.86&&x.bounds[2][1]<.98||
x.n===3&&x.bounds[0][0]>-.08&&x.bounds[0][1]<.08&&x.bounds[2][0]>.86&&x.bounds[2][1]<.98);
if(groupIds.length!==4)throw Error('Expected 4 lateral pinholes, found '+groupIds.length);
const pinAttrs=Object.fromEntries(Object.keys(A).map(k=>[k,[]])),pinMorph=Object.fromEntries(Object.keys(MT).map(k=>[k,[]])),pinIndices=[],pins=[];
for(const g of groupIds){
 const ids=g.verts.slice(0,-1),offset=pinAttrs.POSITION.length;
 for(const virtualId of ids){
  const candidates=virt[virtualId].from;
  const choice=candidates.find(c=>c.pi===13)||candidates.find(c=>c.pi===17||c.pi===18);
  if(!choice)throw Error('No valid lateral source for microclosure');
  const srcLayer=layers[choice.pi];
  for(const key of Object.keys(pinAttrs))pinAttrs[key].push(clone(srcLayer.attr[key][choice.id]));
  for(const key of Object.keys(pinMorph))pinMorph[key].push(clone(srcLayer.target[0][key][choice.id]));
 }
 let local=[];
 if(ids.length===3)local=[0,1,2];
 else {
  const p=pinAttrs.POSITION.slice(offset,offset+4);
  const ac=len(sub(p[0],p[2])),bd=len(sub(p[1],p[3]));
  local=ac<=bd?[0,1,2,0,2,3]:[0,1,3,1,2,3];
 }
 for(let k=0;k<local.length;k+=3){
  const t=local.slice(k,k+3).map(x=>offset+x);
  const area=faceArea(...t.map(id=>pinAttrs.POSITION[id]));
  const posed=faceArea(...t.map(id=>add(pinAttrs.POSITION[id],pinMorph.POSITION[id])));
  if(area<5e-8||posed<5e-8)throw Error('Degenerate pinhole closure '+g.n+' '+area);
  pinIndices.push(...t);
 }
 pins.push({sourceMergedLoopVertices:g.n,faces:local.length/3,center:g.center,bounds:g.bounds});
}
const pinOld=core.p,pin=JSON.parse(JSON.stringify(pinOld));
for(const name of Object.keys(pin.attributes))pin.attributes[name]=append(pinAttrs[name],pinOld.attributes[name]);
for(const name of Object.keys(pin.targets[0]))pin.targets[0][name]=append(pinMorph[name],pinOld.targets[0][name]);
pin.indices=appendIndices(pinIndices);
pin.extras={type:'skin-seam-fill',layer:'anatomy-skin',name:'rev96-r8-lateral-microhole-closures',materialRole:'skin',user101Unchanged:true,
 siteCount:4,faces:pinIndices.length/3,originalFacesRestored:false};
ps.push(pin);
const originalDeleted=new Map();for(const f of snapshot.deletedFaces){const pi=f.primitive;let s=originalDeleted.get(pi);if(!s){s=new Set();originalDeleted.set(pi,s);}s.add(f.vertices.slice().sort((a,b)=>a-b).join(':'));}
for(const [pi,forbidden]of originalDeleted){
 const inds=layers[pi].I;for(let k=0;k<inds.length;k+=3){
  if(forbidden.has(inds.slice(k,k+3).slice().sort((a,b)=>a-b).join(':')))throw Error('Restored user-cut triangle '+pi);
 }
}
const total=ps.reduce((s,p)=>s+doc.accessors[p.indices].count/3,0),
 garment=ps.reduce((s,p)=>s+(p.extras?.layer==='garment'?doc.accessors[p.indices].count/3:0),0);
if(garment!==370||doc.skins[0].joints.length!==63||total!==3522+(I.length/3-originalFaces)+pinIndices.length/3)throw Error('Output invariants mismatch');
doc.extras={...doc.extras,revision:'F11-rev96-user101-r9-tucked-closure-first',sourceSha256:sourceSha,canonicalTrimSnapshotSha256:snapshotSHA,
 removedTrianglesOriginally:101,preservedOriginalManualControls:106,preservedManualCoordinates:754,garmentTriangles:370,bones:63,
 posteriorRounded:true,perineumFreeEdgesBefore:oldBorder.length,perineumFreeEdgesAfter:0,
 lateralPinholesClosed:4,localHoleFacesAdded:pinIndices.length/3,
 simplifyFurtherBeforeVisualApproval:false,stage:'closure-first'};
doc.buffers[0].byteLength=bin.length;
const j=Buffer.from(JSON.stringify(doc)),jp=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const H=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
H.write('glTF');H.writeUInt32LE(2,4);H.writeUInt32LE(12+8+jp.length+8+bp.length,8);jh.writeUInt32LE(jp.length);jh.write('JSON',4);bh.writeUInt32LE(bp.length);bh.write('BIN\0',4);
const result=Buffer.concat([H,jh,jp,bh,bp]);fs.writeFileSync(path.join(root,output),result,{flag:'wx'});
const report={schema:'xpz3d.F11.r9/posterior-closure',source:source.replace(root+'\\',''),inputSha256:sourceSha,
 manualSnapshotSHA:snapshotSHA,output,sha256:sha(result),trianglesBefore:3522,trianglesAfter:total,
 originalPerineumTriangles:originalFaces,roundedPerineumTriangles:I.length/3,perineumBorderEdgesBefore:oldBorder.length,
 perineumBorderEdgesAfter:remainingBorders.length,closedPerineum:true,closedSmallSideHoles:4,sideHoleFaces:pinIndices.length/3,pins,
 rearBodyAnchorIds:[174,29,296],posteriorRoundOverMax:.0018,restFaceQuality:rest,open55FaceQuality:pose,
 garment,rigBones:63,manualDeletedFacesStillAbsent:101,noAdditionalDecimation:true,
 limitation:'Posterior rim has a modest 32% body blend rather than a wide sail; body indices are not truly welded. Original large pelvis aperture remains unclosed.',
 status:'built-experimental-not-user-approved'};
fs.writeFileSync(path.join(root,metaName),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
