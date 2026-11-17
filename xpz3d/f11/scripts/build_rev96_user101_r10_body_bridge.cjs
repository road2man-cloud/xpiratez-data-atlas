'use strict';
/**
 * F11 rev96 r10: close posterior body under-skin void without recreating any
 * of the user's 101 deleted central-patch triangles. Separate experimental GLB.
 *
 * Uses actual BODY primitive 0 border vertices, not projected spline guesses.
 * A two-sided zipper mesh spans the left/right native posterior boundary.
 * Rest/open55 morph, UV, normal and 63-bone skin attributes are carried through.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),dir=__dirname;
const source='r21AO-F11-user101-posterior-tucked-closure-r9.glb',output='r21AO-F11-user101-posterior-body-bridge-r10.glb',manifest='REV96_USER101_POSTERIOR_R10.json';
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
const body=primitives[0],attr=Object.fromEntries(Object.entries(body.attributes).map(([k,id])=>[k,read(id)])),
 morph=Object.fromEntries(Object.entries(body.targets[0]).map(([k,id])=>[k,read(id)]));
const Ibody=read(body.indices);
const left=[29,174,306,214,216,215],right=[29,296,75,78,76];
const indexHasEdge=(a,b)=>{
 for(let i=0;i<Ibody.length;i+=3){const t=Ibody.slice(i,i+3);if(t.includes(a)&&t.includes(b))return true;}return false;
};
for(const list of [left,right])for(let i=0;i<list.length-1;i++)if(!indexHasEdge(list[i],list[i+1]))throw Error('Posterior source boundary edge not found '+list[i]+':'+list[i+1]);
const outAttrs=Object.fromEntries(Object.keys(body.attributes).map(k=>[k,[]])),
 outMorph=Object.fromEntries(Object.keys(body.targets[0]).map(k=>[k,[]])),faces=[],vertexMap=new Map();
const clone=x=>Array.isArray(x)?x.slice():x;
function addRaw(id){
 const key='orig:'+id;if(vertexMap.has(key))return vertexMap.get(key);
 const next=outAttrs.POSITION.length;for(const k of Object.keys(outAttrs))outAttrs[k].push(clone(attr[k][id]));
 for(const k of Object.keys(outMorph))outMorph[k].push(clone(morph[k][id]));
 vertexMap.set(key,next);return next;
}
function skinWeights(a,b,t){
 const map=new Map();
 for(const [id,w] of [[a,1-t],[b,t]])for(let k=0;k<4;k++){
  const j=attr.JOINTS_0[id][k];map.set(j,(map.get(j)||0)+attr.WEIGHTS_0[id][k]*w);
 }
 const sorted=[...map].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((s,x)=>s+x[1],0)||1;
 return {j:Array.from({length:4},(_,i)=>sorted[i]?.[0]||0),w:Array.from({length:4},(_,i)=>(sorted[i]?.[1]||0)/sum)};
}
function addBlend(a,b,t,offset=0){
 const id=outAttrs.POSITION.length;for(const k of Object.keys(outAttrs)){
  if(k==='JOINTS_0')outAttrs[k].push(skinWeights(a,b,t).j);
  else if(k==='WEIGHTS_0')outAttrs[k].push(skinWeights(a,b,t).w);
  else outAttrs[k].push(mix(attr[k][a],attr[k][b],t));
 }
 for(const k of Object.keys(outMorph))outMorph[k].push(mix(morph[k][a],morph[k][b],t));
 outAttrs.POSITION[id][2]+=offset;return id;
}
const L=left.map(addRaw),R=right.map(addRaw),N=6,spine=[L[0]];
// Spine follows the two real body boundary polylines. Intermediate rows are
// a minimal-curvature interpolation, not a detached flat flap.
function sampled(list,t){
 const segments=list.slice(1).map((id,i)=>len(sub(attr.POSITION[id],attr.POSITION[list[i]])));
 const total=segments.reduce((s,v)=>s+v,0),want=total*t;let a=0;
 for(let i=0;i<segments.length;i++){const segment=segments[i];
  if(a+segment>=want||i===segments.length-1)return [list[i],list[i+1],Math.max(0,Math.min(1,(want-a)/segment))];
  a+=segment;
 }
 throw Error('sampling');
}
for(let i=1;i<=N;i++){
 const t=i/N,la=sampled(left,t),ra=sampled(right,t);
 // Original body interpolation in both positions and morph; generated spine
 // is curved toward the body by 4mm to prevent an exposed hard planar seam.
 const lp=mix(attr.POSITION[la[0]],attr.POSITION[la[1]],la[2]),rp=mix(attr.POSITION[ra[0]],attr.POSITION[ra[1]],ra[2]);
 const lm=mix(morph.POSITION[la[0]],morph.POSITION[la[1]],la[2]),rm=mix(morph.POSITION[ra[0]],morph.POSITION[ra[1]],ra[2]);
 const ap=la[2]<.5?la[0]:la[1],bp=ra[2]<.5?ra[0]:ra[1],id=addBlend(ap,bp,.5,.004*Math.sin(Math.PI*t));
 outAttrs.POSITION[id]=mix(lp,rp,.5);outAttrs.POSITION[id][2]+=.004*Math.sin(Math.PI*t);
 outMorph.POSITION[id]=mix(lm,rm,.5);
 spine.push(id);
}
function makeStrip(side,central,orientation){
 let i=0,j=0;
 // First two arms share body vertex 29, so the initial triangle forms
 // the sheet root; no degenerate duplicate 29->29 triangle is created.
 faces.push(...(orientation?[side[0],side[1],central[1]]:[side[0],central[1],side[1]]));
 i++;j++;
 while(i<side.length-1||j<central.length-1){
  const a=i<side.length-1?(i+1)/(side.length-1):Infinity;
  const b=j<central.length-1?(j+1)/(central.length-1):Infinity;
  if(a<=b){faces.push(...(orientation?[side[i],side[i+1],central[j]]:[side[i],central[j],side[i+1]]));i++;}
  else{faces.push(...(orientation?[side[i],central[j+1],central[j]]:[side[i],central[j],central[j+1]]));j++;}
 }
}
makeStrip(L,spine,false);makeStrip(R,spine,true);
const F=faces.length/3;
const pos=outAttrs.POSITION,delta=outMorph.POSITION,posed=pos.map((p,i)=>add(p,delta[i]));
function quality(P){
 let deg=0,maxedge=0,positive=0,negative=0;
 for(let i=0;i<faces.length;i+=3){const [a,b,c]=faces.slice(i,i+3).map(id=>P[id]);
  const n=cross(sub(b,a),sub(c,a));if(len(n)<1e-8)deg++;
  if(n[2]>=0)positive++;else negative++;
  maxedge=Math.max(maxedge,len(sub(a,b)),len(sub(b,c)),len(sub(c,a)));
 }return {deg,maxedge,positive,negative};
}
const rest=quality(pos),open=quality(posed);
if(rest.deg||open.deg||rest.maxedge>.25||open.maxedge>.25)throw Error('Rear bridge invalid pose or long face');
function recalc(P){const a=P.map(()=>[0,0,0]);for(let k=0;k<faces.length;k+=3){
 const [i,j,m]=faces.slice(k,k+3),n=cross(sub(P[j],P[i]),sub(P[m],P[i]));
 for(const id of [i,j,m])a[id]=add(a[id],n);
 }return a.map(norm);}
outAttrs.NORMAL=recalc(pos);
const Nopen=recalc(posed);
outMorph.NORMAL=outAttrs.NORMAL.map((n,i)=>sub(Nopen[i],n));
const p=JSON.parse(JSON.stringify(body));
for(const name of Object.keys(p.attributes))p.attributes[name]=write(outAttrs[name],body.attributes[name]);
for(const name of Object.keys(p.targets[0]))p.targets[0][name]=write(outMorph[name],body.targets[0][name]);
p.indices=writeIndices(faces);
p.extras={name:'rev96-r10-native-posterior-boundary-surface-bridge',layer:'skin',
 materialRole:'native-body',sourcePrimitive:0,closedTissueCandidate:true,manual101Unchanged:true,
 originalBoundary: {left,right},faceCount:F,viewStatus:'experimental'};
primitives.push(p);
const total=primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0);
const garment=primitives.reduce((n,p)=>n+(p.extras?.layer==='garment'?doc.accessors[p.indices].count/3:0),0);
if(total!==3604+F||garment!==370||doc.skins[0].joints.length!==63)throw Error('Invariant mismatch');
doc.extras={...doc.extras,revision:'rev96-r10-posterior-body-bridge',sourceSha256:sourceSha,
 original101FacesStillAbsent:true,garmentTriangles:370,bones:63,bridgeFacesAdded:F,
 bodyPerimeterClosedVisually:true,bodyToPatchNotPhysicallyWelded:true,additionalDecimation:false,
 review:'experimental-not-user-approved'};
doc.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(doc)),jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const H=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
H.write('glTF');H.writeUInt32LE(2,4);H.writeUInt32LE(12+8+jp.length+8+bp.length,8);
jh.writeUInt32LE(jp.length);jh.write('JSON',4);bh.writeUInt32LE(bp.length);bh.write('BIN\0',4);
const data=Buffer.concat([H,jh,jp,bh,bp]);fs.writeFileSync(path.join(dir,output),data,{flag:'wx'});
const report={source,sha256:hash(data),sourceSha256:sourceSha,output,addedTriangles:F,totalTriangles:total,
 originalDeleted:101,garmentTriangles:370,bones:63,sourceBoundary:{left,right},restQuality:rest,open55Quality:open,
 status:'experimental-will-reject-if-flat-flap',notYetWelded:true,additionalDecimation:false};
fs.writeFileSync(path.join(dir,manifest),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
