'use strict';
/**
 * F11 rev96 r28 adaptive non-boundary edge retopology.
 * Split all overlong INTERNAL edges of the already physically integrated
 * perineal skin, using conforming 0/1/2/3 edge case triangulation.
 * Preserve existing 605 source vertices, ALL boundary edges, 529 authored
 * core faces and vertices, 101 manually deleted faces, all garment and bones.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const src='r21AO-F11-user101-integrated-oval-r26-unified-skin-v2.glb';
const h='08e37ff8fa981ad9f23807e090f477cdf7d97c1bfd50027f59e87b249fd6cbc3';
const output='r21AO-F11-user101-integrated-oval-r28-conforming-skin-retopo.glb';
const report='REV96_USER101_R28_RETOPO_BUILD.json';
if([output,report].some(f=>fs.existsSync(path.join(root,f))))throw Error('Refuse overwrite');
const old=fs.readFileSync(path.join(root,src));if(hash(old)!==h)throw Error('Wrong immutable r26 parent');
const trim=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(hash(trim)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('User manual trim mismatch');
const jl=old.readUInt32LE(12),g=JSON.parse(old.toString('utf8',20,20+jl)),o=28+jl;let buf=Buffer.from(old.subarray(o,o+old.readUInt32LE(20+jl))),ps=g.meshes[0].primitives;
if(ps.length!==24||g.skins[0].joints.length!==63||ps[13].material!==5||ps[23].material!==5)throw Error('Unexpected original mesh');
const ntype={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},size={5121:1,5123:2,5125:4,5126:4},reader={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(i){const a=g.accessors[i],v=g.bufferViews[a.bufferView],n=ntype[a.type],os=(v.byteOffset||0)+(a.byteOffset||0),st=v.byteStride||n*size[a.componentType],out=[];for(let j=0;j<a.count;j++){const row=[];for(let k=0;k<n;k++)row.push(buf[reader[a.componentType]](os+j*st+k*size[a.componentType]));out.push(n===1?row[0]:row)}return out}
function load(p){return {attrs:Object.fromEntries(Object.entries(p.attributes).map(([k,i])=>[k,read(i)])),morph:Object.fromEntries(Object.entries(p.targets[0]).map(([k,i])=>[k,read(i)])),indices:read(p.indices)}}
const skin=load(ps[23]),attrs=skin.attrs,morph=skin.morph;
const originalCount=attrs.POSITION.length;
if(originalCount!==605||skin.indices.length!==1074*3)throw Error('Different input topology');
const originalIndices=skin.indices.slice(),originalPos=attrs.POSITION.map(p=>p.slice()),origMorph=morph.POSITION.map(p=>p.slice());
const vec=(a,b,t)=>Array.isArray(a)?a.map((x,i)=>x*(1-t)+b[i]*t):a*(1-t)+b*t;
const sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),length=a=>Math.hypot(...a);
const key=(a,b)=>a<b?a+':'+b:b+':'+a;
const allAttributes=Object.keys(attrs),allMorphs=Object.keys(morph);
const iterations=[];
let indices=skin.indices.slice();
const skinWeights=(a,b)=>{const sum=new Map();for(const id of [a,b])for(let k=0;k<4;k++){const bone=attrs.JOINTS_0[id][k],w=attrs.WEIGHTS_0[id][k]*.5;sum.set(bone,(sum.get(bone)||0)+w)}const top=[...sum].sort((x,y)=>y[1]-x[1]).slice(0,4),z=top.reduce((s,x)=>s+x[1],0)||1;return {j:Array.from({length:4},(_,i)=>top[i]?.[0]||0),w:Array.from({length:4},(_,i)=>(top[i]?.[1]||0)/z)}};
const boundarySource=new Set();
function edgesOf(I){const e=new Map();for(let f=0;f<I.length;f+=3){const [a,b,c]=I.slice(f,f+3);for(const [x,y,z]of [[a,b,c],[b,c,a],[c,a,b]]){const k=key(x,y),r=e.get(k)||{a:Math.min(x,y),b:Math.max(x,y),faces:[],opposites:[]};r.faces.push(f/3);r.opposites.push(z);e.set(k,r)}}return e}
for(const [k,e]of edgesOf(indices))if(e.faces.length===1)boundarySource.add(k);
const thresholds=[.052,.039,.030];
for(let pass=0;pass<thresholds.length;pass++){
 const E=edgesOf(indices),chosen=new Map();
 for(const [k,e]of E){if(e.faces.length!==2)continue;const p=attrs.POSITION[e.a],q=attrs.POSITION[e.b];const len=length(sub(p,q)),mid=vec(p,q,.5);
 if(len<=thresholds[pass]||Math.abs(mid[0])>.102||mid[1]<-.165||mid[1]>.125||mid[2]<.72||mid[2]>1.04)continue;
 // Avoid intentional separate anatomical pockets: keep their small local edge spacing.
 chosen.set(k,e);
 }
 if(chosen.size===0){iterations.push({pass,threshold:thresholds[pass],edgesSplit:0,faces:indices.length/3});continue}
 const indexOf=new Map();
 for(const [k,e] of chosen){const id=attrs.POSITION.length,indexWeights=skinWeights(e.a,e.b);
  const originalMid=vec(attrs.POSITION[e.a],attrs.POSITION[e.b],.5);
  // Interior edge midpoint follows a small constrained Loop/Coons-style lift.
  // Never affect source/border vertices or any original source edge endpoints.
  const opposite=e.opposites.map(i=>attrs.POSITION[i]),curv=vec(opposite[0],opposite[1],.5);
  const amp=pass===0?.12:pass===1?.08:.045;
  const delta=sub(curv,originalMid).map(x=>x*amp*.5);
  const masked=(Math.abs(originalMid[0])>.085||originalMid[1]>.045)?0:.45;
  const adjusted=originalMid.map((x,i)=>x+delta[i]*masked);
  for(const k2 of allAttributes){
   if(k2==='JOINTS_0')attrs[k2].push(indexWeights.j);
   else if(k2==='WEIGHTS_0')attrs[k2].push(indexWeights.w);
   else attrs[k2].push(vec(attrs[k2][e.a],attrs[k2][e.b],.5));
  }
  attrs.POSITION[id]=adjusted;
  for(const k2 of allMorphs)morph[k2].push(vec(morph[k2][e.a],morph[k2][e.b],.5));
  indexOf.set(k,id);
 }
 // For each triangle, split along every selected global edge with a consistent
 // winding, ensuring no T junctions between two triangles sharing the edge.
 const faces=[];
 for(let j=0;j<indices.length;j+=3){const vs=indices.slice(j,j+3),marks=[indexOf.get(key(vs[0],vs[1])),indexOf.get(key(vs[1],vs[2])),indexOf.get(key(vs[2],vs[0]))],cnt=marks.filter(x=>x!==undefined).length;
  if(cnt===0){faces.push(...vs);continue}
  if(cnt===1){const k=marks.findIndex(x=>x!==undefined),a=vs[k],b=vs[(k+1)%3],c=vs[(k+2)%3],m=marks[k];faces.push(a,m,c,m,b,c);continue}
  if(cnt===2){const unmarked=marks.findIndex(x=>x===undefined),k=(unmarked+1)%3,a=vs[k],b=vs[(k+1)%3],c=vs[(k+2)%3],ab=marks[k],bc=marks[(k+1)%3];faces.push(b,bc,ab,a,ab,c,ab,bc,c);continue}
  const [a,b,c]=vs,[ab,bc,ca]=marks;faces.push(a,ab,ca,b,bc,ab,c,ca,bc,ab,bc,ca);
 }
 indices=faces;
 iterations.push({pass,threshold:thresholds[pass],edgesSplit:chosen.size,faces:indices.length/3,vertices:attrs.POSITION.length});
}
const newEdges=edgesOf(indices),newBoundary=[...newEdges].filter(([k,e])=>e.faces.length===1).map(([k])=>k);
if(newBoundary.length!==boundarySource.size||newBoundary.some(k=>!boundarySource.has(k)))throw Error('Boundary topology changed');
const originals=attrs.POSITION.slice(0,originalCount);
for(let i=0;i<originalCount;i++)if(JSON.stringify(originals[i])!==JSON.stringify(originalPos[i])||JSON.stringify(morph.POSITION[i])!==JSON.stringify(origMorph[i]))throw Error('Original skin vertex changed');
function stats(pos){let zero=0,areaMin=Infinity;for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),t=cross(sub(pos[b],pos[a]),sub(pos[c],pos[a])),ar=length(t)/2;areaMin=Math.min(areaMin,ar);if(ar<1e-11)zero++;}return{zero,areaMin}}
const rest=stats(attrs.POSITION),pose=stats(attrs.POSITION.map((p,i)=>p.map((x,k)=>x+morph.POSITION[i][k])));
if(rest.zero||pose.zero)throw Error('Degenerate split triangle');
const oldSourceBodyIndices=ps[0].indices,oldAuthorIndices=ps[13].indices;
function writeRows(rows,template){const a=g.accessors[template],n=ntype[a.type],s=size[a.componentType],block=Buffer.alloc(rows.length*n*s),at=(buf.length+3)&~3;
for(let i=0;i<rows.length;i++)for(let k=0;k<n;k++){const v=n===1?rows[i]:rows[i][k],t=(i*n+k)*s;if(!Number.isFinite(v))throw Error('NaN attribute');if(a.componentType===5126)block.writeFloatLE(v,t);else if(a.componentType===5123)block.writeUInt16LE(v,t);else if(a.componentType===5121)block.writeUInt8(Math.round(v),t);else if(a.componentType===5125)block.writeUInt32LE(v,t)}
buf=Buffer.concat([buf,Buffer.alloc(at-buf.length),block]);const bv=g.bufferViews.push({buffer:0,byteOffset:at,byteLength:block.length})-1;const ac={bufferView:bv,componentType:a.componentType,count:rows.length,type:a.type};if(a.normalized!==undefined)ac.normalized=a.normalized;
if(a.min||a.max)for(const mode of ['min','max'])if(a[mode])ac[mode]=Array.from({length:n},(_,k)=>mode==='min'?Math.min(...rows.map(x=>n===1?x:x[k])):Math.max(...rows.map(x=>n===1?x:x[k])));
return g.accessors.push(ac)-1}
function writeIndices(I){if(Math.max(...I)>=65536)throw Error('Index overflow');const at=(buf.length+3)&~3,b=Buffer.alloc(I.length*2);I.forEach((x,k)=>b.writeUInt16LE(x,2*k));buf=Buffer.concat([buf,Buffer.alloc(at-buf.length),b]);const v=g.bufferViews.push({buffer:0,byteOffset:at,byteLength:b.length})-1;return g.accessors.push({bufferView:v,componentType:5123,count:I.length,type:'SCALAR',min:[0],max:[Math.max(...I)]})-1}
for(const [k,i]of Object.entries(ps[23].attributes))ps[23].attributes[k]=writeRows(attrs[k],i);
for(const [k,i]of Object.entries(ps[23].targets[0]))ps[23].targets[0][k]=writeRows(morph[k],i);
ps[23].indices=writeIndices(indices);
if(ps[0].indices!==oldSourceBodyIndices||ps[13].indices!==oldAuthorIndices)throw Error('Original geometry changed');
ps[23].extras={...ps[23].extras,revision:'r28-conforming-adaptive-internal-edge-retopo',sourceSkinVerticesLocked:originalCount,originalBoundaryEdgesLocked:boundarySource.size,adaptiveSplits:iterations};
g.extras={...g.extras,revision:'rev96-user101-r28-conforming-skin-retopo',parentSHA256:h,visualAcceptance:'pending',wholeBodyWatertight:false};
const triangles=ps.reduce((s,p)=>s+g.accessors[p.indices].count/3,0),garment=ps.reduce((s,p)=>s+(p.extras?.layer==='garment'?g.accessors[p.indices].count/3:0),0);
if(garment!==370)throw Error('Garment damaged');
g.buffers[0].byteLength=buf.length;
const raw=Buffer.from(JSON.stringify(g)),jp=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),bp=Buffer.concat([buf,Buffer.alloc((4-buf.length%4)%4)]),head=Buffer.alloc(12),j=Buffer.alloc(8),b=Buffer.alloc(8);
head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jp.length+8+bp.length,8);j.writeUInt32LE(jp.length,0);j.write('JSON',4);b.writeUInt32LE(bp.length,0);b.write('BIN\0',4);
const model=Buffer.concat([head,j,jp,b,bp]);fs.writeFileSync(path.join(root,output),model,{flag:'wx'});
const result={file:output,sha256:hash(model),source:src,sourceSHA256:h,sourceSkinFaces:originalIndices.length/3,sourceSkinVertices:originalCount,newSkinFaces:indices.length/3,newSkinVertices:attrs.POSITION.length,allTriangles:triangles,skinBoundaryEdgesUnchanged:newBoundary.length,internalEdgeNonmanifold:[...newEdges.values()].filter(e=>e.faces.length>2).length,rest,pose,iterations,bones:63,garments:370,protected101:true,originalAuthor908Untouched:true,existingBodyUntouched:true,visualApproval:'pending'};
fs.writeFileSync(path.join(root,report),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
