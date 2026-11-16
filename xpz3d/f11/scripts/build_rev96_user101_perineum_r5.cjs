'use strict';
/**
 * XPZ3D F11 rev96 user-101 r5: artist-locked low-poly perineum / anal depression
 * Input: VERIFIED rev96 base with 101 actual user-deleted triangles absent.
 * Output: independent GLBs, no overwrite, no re-insertion of any deleted triangle,
 * separate skin garment (370 triangles), 63 bones, morph and LBS ready.
 *
 * Geometry: selective 2-pose collapse on undistinguished interior core faces;
 *            a short-strip 7-column/10-row perineum between the manually sculpted
 *            inferior rim and body posterior boundary; eight-sided inset anal
 *            depression with a blind inner cap, NEVER a black transparency hole.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const dir=__dirname,mode=process.argv.includes('--soft')?'soft':'lowpoly';
const filename='r21AO-F11-user101-perineum-'+mode+'-r5.glb',manifestName='rev96-user101-perineum-'+mode+'-r5-manifest.json';
for(const n of [filename,manifestName])if(fs.existsSync(path.join(dir,n)))throw Error('Refuse overwrite: '+n);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceFile=path.join(dir,'r21AO-F11-user-trim-rev96-base.glb');
const input=fs.readFileSync(sourceFile);
const inputSha='f53a8d5af9000593aaa681c11038bb641950cae62810511784e05a0fc5d07cd7';
if(sha(input)!==inputSha)throw Error('Cannot work on unverified or previously modified user trim');
const snapBytes=fs.readFileSync(path.join(dir,'rev95-user-trim-101faces-20261116T152807Z.json'));
const snapshotSha='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5';
if(sha(snapBytes)!==snapshotSha)throw Error('Canonical 101-face snapshot SHA mismatch');
const snapshot=JSON.parse(snapBytes);
if(snapshot.deletedFaces.length!==101||snapshot.positions.length!==754||Object.keys(snapshot.controls).length!==106)throw Error('Canonical sculpt mismatch');
const jlen=input.readUInt32LE(12),doc=JSON.parse(input.toString('utf8',20,20+jlen));
let bin=Buffer.from(input.subarray(28+jlen,28+jlen+input.readUInt32LE(20+jlen)));
const primitives=doc.meshes[0].primitives;
if(primitives.length!==22||doc.skins[0].joints.length!==63||
 primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0)!==3546)throw Error('Canonical GLB topology mismatch');
const sizes={5121:1,5123:2,5125:4,5126:4},reader={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function get(id){
 const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],d=dims[a.type],sz=sizes[a.componentType],stride=v.byteStride||sz*d,off=(v.byteOffset||0)+(a.byteOffset||0);
 if(!a||!v||!d||!sz)throw Error('Bad glTF accessor '+id);
 const out=[];
 for(let k=0;k<a.count;k++){const p=[];for(let c=0;c<d;c++)p.push(bin[reader[a.componentType]](off+k*stride+c*sz));out.push(d===1?p[0]:p);}
 return out;
}
function append(rows,template){
 const old=doc.accessors[template],d=dims[old.type],sz=sizes[old.componentType],at=(bin.length+3)&~3,data=Buffer.alloc(rows.length*d*sz);
 for(let i=0;i<rows.length;i++)for(let j=0;j<d;j++){
  const x=d===1?rows[i]:rows[i][j],k=(i*d+j)*sz;
  if(!Number.isFinite(x))throw Error('Invalid output '+template+' at '+i);
  if(old.componentType===5126)data.writeFloatLE(x,k);
  else if(old.componentType===5123)data.writeUInt16LE(x,k);
  else if(old.componentType===5125)data.writeUInt32LE(x,k);
  else if(old.componentType===5121)data.writeUInt8(x,k);
  else throw Error('Unsupported output component type '+old.componentType);
 }
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),data]);
 const v=doc.bufferViews.push({buffer:0,byteOffset:at,byteLength:data.length})-1;
 const o={bufferView:v,componentType:old.componentType,type:old.type,count:rows.length};
 if(old.normalized!==undefined)o.normalized=old.normalized;
 if(old.min||old.max)for(const kind of ['min','max'])if(old[kind])o[kind]=Array.from({length:d},(_,j)=>kind==='min'?Math.min(...rows.map(r=>d===1?r:r[j])):Math.max(...rows.map(r=>d===1?r:r[j])));
 return doc.accessors.push(o)-1;
}
function appendIndices(ids){
 if(Math.max(...ids)>65535)throw Error('New mesh cannot use 32-bit indices');
 const at=(bin.length+3)&~3,buffer=Buffer.alloc(ids.length*2);
 for(let i=0;i<ids.length;i++)buffer.writeUInt16LE(ids[i],i*2);
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),buffer]);
 const vi=doc.bufferViews.push({buffer:0,byteOffset:at,byteLength:buffer.length})-1;
 return doc.accessors.push({bufferView:vi,componentType:5123,count:ids.length,type:'SCALAR',min:[Math.min(...ids)],max:[Math.max(...ids)]})-1;
}
const layers=primitives.map(p=>({p,attrs:Object.fromEntries(Object.entries(p.attributes).map(([k,id])=>[k,get(id)])),targets:(p.targets||[]).map(t=>Object.fromEntries(Object.entries(t).map(([k,id])=>[k,get(id)]))),I:get(p.indices)}));
const len=a=>Math.hypot(...a),sub=(a,b)=>a.map((v,i)=>v-b[i]),plus=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,t)=>a.map(v=>v*t),mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(len(a)||1)),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const vnorm=(P,t)=>cross(sub(P[t[1]],P[t[0]]),sub(P[t[2]],P[t[0]]));
function normals(P,I){const out=P.map(()=>[0,0,0]);for(let i=0;i<I.length;i+=3){const t=I.slice(i,i+3),N=vnorm(P,t);for(const id of t)out[id]=plus(out[id],N)}return out.map(v=>unit(v));}
function boundary(I){
 const edges=new Map();
 for(let i=0;i<I.length;i+=3)for(const [a,b]of [[I[i],I[i+1]],[I[i+1],I[i+2]],[I[i+2],I[i]]]){
  let key=a<b?a+':'+b:b+':'+a,e=edges.get(key)||{a,b,count:0};e.count++;edges.set(key,e);
 }
 return edges;
}
function faceKey(t){return t.slice().sort((a,b)=>a-b).join(':');}
const originalDeleted=new Map();
for(const d of snapshot.deletedFaces){if(!originalDeleted.has(d.primitive))originalDeleted.set(d.primitive,new Set());originalDeleted.get(d.primitive).add(faceKey(d.vertices));}
function validateOriginalDeletion(){
 for(const [pi,forbidden]of originalDeleted){const I=layers[pi].I;for(let i=0;i<I.length;i+=3)if(forbidden.has(faceKey(I.slice(i,i+3))))throw Error('USER TRIM RESTORED '+pi+':'+i/3);}
}
validateOriginalDeletion();
const core=layers[13],P=core.attrs.POSITION,Q=P.map((v,i)=>plus(v,core.targets[0].POSITION[i])),R=core.attrs._ANATREGION,C=core.attrs._ANATCAVITY,UV=core.attrs.TEXCOORD_0;
const normalR=core.attrs.NORMAL,weights=core.attrs.WEIGHTS_0,joints=core.attrs.JOINTS_0;
const originalCoreFaces=core.I.length/3;
function influences(id){
 const m=new Map();for(let i=0;i<4;i++)m.set(joints[id][i],(m.get(joints[id][i])||0)+weights[id][i]);return m;
}
function candidateEdges(I){
 const E=boundary(I),locked=new Set();
 for(const e of E.values())if(e.count===1){locked.add(e.a);locked.add(e.b)}
 const neighbours=new Map();
 for(let t=0;t<I.length;t+=3){
  for(const [a,b]of [[I[t],I[t+1]],[I[t+1],I[t+2]],[I[t+2],I[t]]]){
   if(!neighbours.has(a))neighbours.set(a,new Set());neighbours.get(a).add(b);
  }
 }
 const out=[];
 for(const e of E.values()){
  if(e.count!==2||locked.has(e.a)||locked.has(e.b))continue;
  const {a,b}=e,ra=R[a],rb=R[b],ca=C[a],cb=C[b];
  if(Math.max(ra,rb)>.22||Math.max(ca,cb)>.04)continue; // preserve mucosa/cleft
  const d0=len(sub(P[a],P[b])),d1=len(sub(Q[a],Q[b]));
  if(d0>.0067||d1>.009||Math.abs(ra-rb)>.04||Math.abs(ca-cb)>.04||len(sub(UV[a],UV[b]))>.027)continue;
  const ia=influences(a),ib=influences(b);
  const wd=[...new Set([...ia.keys(),...ib.keys()])].reduce((s,k)=>s+Math.abs((ia.get(k)||0)-(ib.get(k)||0)),0);
  if(wd>.28||dot(unit(normalR[a]),unit(normalR[b]))<.84)continue;
  const com=[...neighbours.get(a)].filter(k=>neighbours.get(b).has(k));
  if(com.length!==2)continue; // manifold edge link condition
  const keep=neighbours.get(a).size>=neighbours.get(b).size?a:b,drop=keep===a?b:a;
  let deg=0,ok=true,affected=0;
  const old=new Set(),next=new Set();
  for(let i=0;i<I.length;i+=3){
   const t=I.slice(i,i+3),nt=t.map(id=>id===drop?keep:id);
   if(t.includes(drop)){
    affected++;
    if(new Set(nt).size<3){deg++;continue}
    const A=vnorm(P,t),B=vnorm(P,nt),A1=vnorm(Q,t),B1=vnorm(Q,nt);
    if(len(B)<1e-7||len(B1)<1e-7||dot(unit(A),unit(B))<.82||dot(unit(A1),unit(B1))<.82){ok=false;break}
   }
   const key=faceKey(nt);if(next.has(key)){ok=false;break}next.add(key);
  }
  if(!ok||deg!==2||affected>18)continue;
  const score=d0+.65*d1+wd*.005+(1-dot(unit(normalR[a]),unit(normalR[b])))*.002+Math.abs(ra-rb)*.005;
  out.push({keep,drop,score,originalEdge:[a,b],restDistance:d0,openDistance:d1});
 }
 out.sort((a,b)=>a.score-b.score);
 return out;
}
let collapsed=[],I=core.I.slice(),goal=mode==='soft'?64:90;
for(let rep=0;rep<goal/2;rep++){
 const candidates=candidateEdges(I);
 if(!candidates.length)break;
 const best=candidates[0],next=[];
 for(let t=0;t<I.length;t+=3){
  const tri=I.slice(t,t+3).map(k=>k===best.drop?best.keep:k);
  if(new Set(tri).size===3)next.push(...tri);
 }
 if((I.length-next.length)/3!==2)throw Error('Non two-face collapse '+rep);
 collapsed.push(best);I=next;
}
core.I=I;
const coreReduction=originalCoreFaces-I.length/3;
if(coreReduction<12)throw Error('Conservative decimator produced too little detail reduction');
core.p.indices=appendIndices(core.I);
// Re-normalize only the retained original core vertices where topology changed.
const newNormals=normals(P,I),newPoseNormals=normals(Q,I);
const revisedN=core.attrs.NORMAL.map(v=>v.slice()),revisedMorphN=core.targets[0].NORMAL.map(v=>v.slice()),changed=new Set(collapsed.flatMap(v=>[v.keep,v.drop]));
for(const id of changed){if(!I.includes(id))continue;
 revisedN[id]=unit(mix(core.attrs.NORMAL[id],newNormals[id],.55));
 const origOpen=unit(plus(core.attrs.NORMAL[id],core.targets[0].NORMAL[id]));
 const nextOpen=unit(mix(origOpen,newPoseNormals[id],.55));
 revisedMorphN[id]=sub(nextOpen,revisedN[id]);
}
core.p.attributes.NORMAL=append(revisedN,core.p.attributes.NORMAL);
core.p.targets[0].NORMAL=append(revisedMorphN,core.p.targets[0].NORMAL);
core.p.extras={...core.p.extras,rev96r5SelectiveDecimation:true,rev96r5RemovedCoreFaces:coreReduction,rev96r5ProtectManualOpening:true};

// Perineal low-poly bridge: 7 columns x 10 rows; 2x2 cell opening gets
// an actual inset anal-ring geometry rather than a two-dimensional decal.
const cols=7,rows=10;
const frontRefs=[
 [{pi:17,id:482,weight:1}],
 [{pi:17,id:482,weight:.45},{pi:13,id:340,weight:.55}],
 [{pi:13,id:568,weight:1}],
 [{pi:13,id:357,weight:1}],
 [{pi:13,id:584,weight:1}],
 [{pi:13,id:348,weight:.58},{pi:18,id:466,weight:.42}],
 [{pi:18,id:466,weight:1}]
];
const backRefs=[
 [{pi:0,id:214,weight:1}],
 [{pi:0,id:214,weight:.5},{pi:0,id:306,weight:.5}],
 [{pi:0,id:306,weight:.45},{pi:0,id:29,weight:.55}],
 [{pi:0,id:29,weight:1}],
 [{pi:0,id:29,weight:.6},{pi:0,id:296,weight:.4}],
 [{pi:0,id:296,weight:.50},{pi:0,id:75,weight:.50}],
 [{pi:0,id:75,weight:1}]
];
function blendRefs(refs){
 const fields=Object.keys(core.p.attributes),extra={};
 for(const name of fields)extra[name]=null;
 const allWeight=new Map();
 let jointWeights=new Map(),mPos=[0,0,0],pos=[0,0,0];
 for(const {pi,id,weight:w}of refs){
  const l=layers[pi];
  pos=plus(pos,mul(l.attrs.POSITION[id],w));
  mPos=plus(mPos,mul(l.targets[0].POSITION[id],w));
  for(let k=0;k<4;k++){
   const joint=l.attrs.JOINTS_0[id][k],ww=l.attrs.WEIGHTS_0[id][k]*w;
   jointWeights.set(joint,(jointWeights.get(joint)||0)+ww);
  }
  for(const name of ['TEXCOORD_0','_TISSUE','_ANATREGION','_ANATCAVITY']){
   const v=l.attrs[name]?.[id]??(name==='TEXCOORD_0'?[.23,.44]:0);
   if(extra[name]==null)extra[name]=Array.isArray(v)?mul(v,w):v*w;
   else extra[name]=Array.isArray(v)?plus(extra[name],mul(v,w)):extra[name]+v*w;
  }
 }
 const sorted=[...jointWeights].sort((a,b)=>b[1]-a[1]).slice(0,4);
 const sum=sorted.reduce((a,x)=>a+x[1],0)||1;
 return {p:pos,m:mPos,uv:extra.TEXCOORD_0,tissue:extra._TISSUE,region:extra._ANATREGION,cavity:extra._ANATCAVITY,joints:Array.from({length:4},(_,i)=>sorted[i]?.[0]||0),weights:Array.from({length:4},(_,i)=>(sorted[i]?.[1]||0)/sum)};
}
const front=frontRefs.map(blendRefs),back=backRefs.map(blendRefs);
const attr={POSITION:[],NORMAL:[],TEXCOORD_0:[],JOINTS_0:[],WEIGHTS_0:[],_TISSUE:[],_ANATREGION:[],_ANATCAVITY:[]};
const morph={POSITION:[],NORMAL:[]},tri=[],grid=[];
function interpolateWeights(w1,w2,t){
 const map=new Map();
 for(const [w,mult]of [[w1,1-t],[w2,t]])for(let i=0;i<4;i++)map.set(w.joints[i],(map.get(w.joints[i])||0)+w.weights[i]*mult);
 const top=[...map].sort((a,b)=>b[1]-a[1]).slice(0,4),total=top.reduce((s,v)=>s+v[1],0)||1;
 return {joints:Array.from({length:4},(_,k)=>top[k]?.[0]||0),weights:Array.from({length:4},(_,k)=>(top[k]?.[1]||0)/total)};
}
function addVertex(p,m,uv,w,region=0,cavity=0,tissue=0.38){
 const id=attr.POSITION.length;
 attr.POSITION.push(p);attr.NORMAL.push([0,0,-1]);attr.TEXCOORD_0.push(uv);
 attr.JOINTS_0.push(w.joints.slice());attr.WEIGHTS_0.push(w.weights.slice());
 attr._TISSUE.push(tissue);attr._ANATREGION.push(region);attr._ANATCAVITY.push(cavity);
 morph.POSITION.push(m);morph.NORMAL.push([0,0,0]);return id;
}
const rowTs=[0,.12,.23,.35,.46,.56,.66,.77,.88,1];
for(let r=0;r<rows;r++){
 let ids=[],t=rowTs[r],envelope=Math.sin(Math.PI*t);
 for(let c=0;c<cols;c++){
  const A=front[c],B=back[c],frac=(c-3)/3,mid=1-Math.abs(frac);
  let p=mix(A.p,B.p,t),m=mul(mix(A.m,B.m,t),1);
  if(r>0&&r<rows-1){
   // Caudal saddle, gradually rising to the existing posterior body seam.
   const depression=(mode==='soft'?.023:.027)+(mode==='soft'?.045:.046)*mid*mid;
   p[2]-=depression*envelope;
   p[0]*=1+.20*envelope;
   p[1]+=.005*(1-mid)*envelope;
   // Keep user sculpt at anterior rim; fade morph as skin continues posteriorly.
   m=mul(m,1-.32*smooth(t));
  }
  const w=interpolateWeights(A,B,smooth(t));
  // Prevent the central perineal sheet splitting under leg abduction.
  if(r>0&&r<rows-1&&mid>.5){
   const leg2=w.joints.findIndex(j=>j===2),leg3=w.joints.findIndex(j=>j===3);
   if(leg2>=0)w.weights[leg2]*=.64;
   if(leg3>=0)w.weights[leg3]*=.64;
   const total=w.weights.reduce((a,v)=>a+v,0)||1;w.weights=w.weights.map(x=>x/total);
  }
  const uv=mix(A.uv,B.uv,t);
  ids.push(addVertex(p,m,uv,w,0,0,.42));
 }
 grid.push(ids);
}
for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){
 if((r===5||r===6)&&(c===2||c===3))continue; // anal inset, not a flat black quad
 const a=grid[r][c],b=grid[r][c+1],c1=grid[r+1][c],d=grid[r+1][c+1];
 tri.push(a,c1,b,b,c1,d);
}
// Eight source vertices on the open rectangular grid boundary, in CCW order.
const hole=[grid[5][2],grid[5][3],grid[5][4],grid[6][4],grid[7][4],grid[7][3],grid[7][2],grid[6][2]];
const centerXY=[(attr.POSITION[grid[5][3]][0]+attr.POSITION[grid[7][3]][0])/2,
                 (attr.POSITION[grid[5][3]][1]+attr.POSITION[grid[7][3]][1])/2];
function nearestSurface(x,y){
 let best=[],a=0;
 for(let id=0;id<grid.flat().length;id++){
  const p=attr.POSITION[id],dist2=(p[0]-x)**2+(p[1]-y)**2;
  best.push({id,weight:1/Math.max(.000001,dist2)});
 }
 best.sort((a,b)=>b.weight-a.weight);best=best.slice(0,4);
 const total=best.reduce((s,v)=>s+v.weight,0);
 const xyz=[0,0,0],m=[0,0,0];let uv=[0,0],ww=new Map();
 for(const v of best){const w=v.weight/total,p=attr.POSITION[v.id],delta=morph.POSITION[v.id];
  for(let k=0;k<3;k++){xyz[k]+=p[k]*w;m[k]+=delta[k]*w;}
  uv=plus(uv,mul(attr.TEXCOORD_0[v.id],w));
  for(let k=0;k<4;k++){const joint=attr.JOINTS_0[v.id][k];ww.set(joint,(ww.get(joint)||0)+attr.WEIGHTS_0[v.id][k]*w);}
 }
 const sorted=[...ww].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((a,x)=>a+x[1],0)||1;
 return {z:xyz[2],m,uv,joints:Array.from({length:4},(_,i)=>sorted[i]?.[0]||0),weights:Array.from({length:4},(_,i)=>(sorted[i]?.[1]||0)/sum)};
}
const outer=[],inner=[];
for(let j=0;j<hole.length;j++){
 const hp=attr.POSITION[hole[j]],theta=Math.atan2(hp[1]-centerXY[1],hp[0]-centerXY[0]);
 const outerXY=[centerXY[0]+.0108*Math.cos(theta),centerXY[1]+.013*Math.sin(theta)];
 const innerXY=[centerXY[0]+.0036*Math.cos(theta),centerXY[1]+.0055*Math.sin(theta)];
 const o=nearestSurface(...outerXY),i=nearestSurface(...innerXY);
 outer.push(addVertex([outerXY[0],outerXY[1],o.z-.001],
   o.m,o.uv,o,0.27,.18,.92));
 inner.push(addVertex([innerXY[0],innerXY[1],i.z+.0068],
   i.m,i.uv,i,.52,.91,.98));
}
const cm=nearestSurface(...centerXY);
const pit=addVertex([centerXY[0],centerXY[1],cm.z+.012],
 cm.m,cm.uv,cm,.58,1,1);
function stitchRing(A,B){
 for(let i=0;i<A.length;i++){
  const next=(i+1)%A.length;
  tri.push(A[i],B[i],A[next],A[next],B[i],B[next]);
 }
}
stitchRing(hole,outer);stitchRing(outer,inner);
for(let i=0;i<inner.length;i++)tri.push(inner[i],pit,inner[(i+1)%inner.length]);
const addedFaces=tri.length/3;
const normalsR=normals(attr.POSITION,tri),posed=attr.POSITION.map((p,i)=>plus(p,morph.POSITION[i])),normalsOpen=normals(posed,tri);
for(let i=0;i<attr.NORMAL.length;i++){
 attr.NORMAL[i]=normalsR[i];
 morph.NORMAL[i]=sub(normalsOpen[i],normalsR[i]);
}
// Preserve the front and rear attachments at exact rest and morph endpoints.
for(let c=0;c<cols;c++){
 for(const [id,anchor]of [[grid[0][c],front[c]],[grid[rows-1][c],back[c]]]){
  if(len(sub(attr.POSITION[id],anchor.p))>1e-6||len(sub(morph.POSITION[id],anchor.m))>1e-6)
   throw Error('Attachment moved away from canonical seam');
 }
}
// Inset must have a measurable cavity in geometry, not a shader-only decal.
const edgeLengthRange={min:1,max:0};let reversals=0,degenerates=0;
for(let k=0;k<tri.length;k+=3){
 const a=attr.POSITION[tri[k]],b=attr.POSITION[tri[k+1]],c=attr.POSITION[tri[k+2]];
 const n=cross(sub(b,a),sub(c,a)),area=len(n)*.5;
 if(area<5e-8)degenerates++;
 for(const d of [len(sub(a,b)),len(sub(b,c)),len(sub(c,a))]){edgeLengthRange.min=Math.min(edgeLengthRange.min,d);edgeLengthRange.max=Math.max(edgeLengthRange.max,d);}
 if(n[2]>0)reversals++;
}
if(degenerates>0)throw Error('Degenerate patch faces: '+degenerates);
// Separate perineal primitive is skinned as a member of the existing mesh/skin.
// ALL custom fields, morphs and physical garment separation are preserved.
const template=core.p,pr=JSON.parse(JSON.stringify(template));
for(const name of Object.keys(pr.attributes)){
 if(!attr[name])throw Error('Unmapped skin attr '+name);
 pr.attributes[name]=append(attr[name],template.attributes[name]);
}
for(let t=0;t<pr.targets.length;t++){
 for(const name of Object.keys(pr.targets[t])){
  if(!morph[name])throw Error('Unmapped morph attr '+name);
  pr.targets[t][name]=append(morph[name],template.targets[t][name]);
 }
}
pr.indices=appendIndices(tri);
pr.extras={type:'connected-anatomy',layer:'anatomy-skin',realSkin:true,clothing:false,
 name:'rev96-r5-coarse-perineum-and-anal-fossa',authoring:'procedural-grid-short-strips',
 source:'user101-verified-rev96-base',region:'inferior-perineum-posterior',
 gridColumns:cols,gridRows:rows,analRingSegments:8,blindCavity:true,original101FaceRestoration:false,
 separateSkinningAndMorph:true,selectedMode:mode};
primitives.push(pr);
const finalTri=primitives.reduce((s,p)=>s+doc.accessors[p.indices].count/3,0);
const garmentTris=primitives.reduce((s,p)=>s+(p.extras?.layer==='garment'?doc.accessors[p.indices].count/3:0),0);
if(finalTri!==3546-coreReduction+addedFaces||garmentTris!==370||doc.skins[0].joints.length!==63)throw Error('Output topology error');
validateOriginalDeletion();
doc.buffers[0].byteLength=bin.length;
doc.extras={...doc.extras,revision:'rev96-user101-perineum-r5-'+mode,sourceSha256:sha(input),
 userSnapshotSha256:snapshotSha,protectedUserDeletions:101,manualRestOpenPositionsRetained:754,
 preservedClothingTriangles:370,rigBones:63,newLowPolyPerineumPrimitive:primitives.length-1,
 originalTriangles:3546,centralFacesRemovedByReduction:coreReduction,perinealFacesAdded:addedFaces,
 analDepressionGeometry:true,visualReviewStatus:'not-yet-reviewed'};
const json=Buffer.from(JSON.stringify(doc)),jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const h=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jp.length+8+bp.length,8);jh.writeUInt32LE(jp.length);jh.write('JSON',4);bh.writeUInt32LE(bp.length);bh.write('BIN\0',4);
const result=Buffer.concat([h,jh,jp,bh,bp]);
fs.writeFileSync(path.join(dir,filename),result,{flag:'wx'});
const manifest={schema:'xpz3d-f11/r5-perineum-lowpoly',date:'2026-11-17',mode,source:path.basename(sourceFile),
 sourceSha256:sha(input),userSnapshotSha256:snapshotSha,output:filename,sha256:sha(result),
 originalTriangles:3546,originalAnatomyTriangles:originalCoreFaces,finalAnatomyTriangles:I.length/3,
 anatomyReduction:coreReduction,bodyAndGarmentUnchanged:true,perinealFacesAdded:addedFaces,
 finalTriangles:finalTri,garmentTriangles:garmentTris,bones:63,primitives:primitives.length,
 newPrimitive:primitives.length-1,perineumVertices:attr.POSITION.length,rows,cols,
 anal:{centerXY,outerRadiusX:.0108,outerRadiusY:.013,innerRadiusX:.0036,innerRadiusY:.0055,
 insetDepth:.0068,blindCapDepth:.012,segments:8,geometryNotDecal:true},
 edgeLengths:edgeLengthRange,normalFacingUpCount:reversals,degenerateFaces:degenerates,
 collapseCount:collapsed.length,collapseAudit:collapsed.map(o=>({edge:o.originalEdge,keep:o.keep,drop:o.drop,d0:o.restDistance,d55:o.openDistance})),
 policies:{allOriginal101TrianglesAbsent:true,manualVertexCoordinatesUnchanged:true,garment370Separate:true,manualCutBoundaryUnchanged:true},
 status:'built-review-pending'};
fs.writeFileSync(path.join(dir,manifestName),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({filename,sha256:manifest.sha256,original:3546,centralReduced:coreReduction,
 perineumAdded:addedFaces,result:finalTri,degenerateFaces:degenerates,upwardNormalFaces:reversals,
 minEdgeLength:edgeLengthRange.min,maxEdgeLength:edgeLengthRange.max,anal:manifest.anal},null,2));
