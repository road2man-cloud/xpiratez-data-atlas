'use strict';
/**
 * XPZ3D F11 rev96 r31f: physically weld authored center with generated
 * posterior tissue. Anatomical authored positions/faces are exact and
 * immutable. Material-5 primitives 13 and 23 are combined into a single
 * topologically connected surface with actual shared vertices along the
 * 31 geometry-matched boundary edges, no superposed patch.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const source='r21AO-F11-user101-integrated-oval-r31d-convex-seam-collar.glb';
const sourceSha='b20fac96e2f6195f8bc114a777f3f00888094d73b7a0d306a60a3a019f786594';
const output='r21AO-F11-user101-integrated-oval-r31f-physically-welded-convex.glb';
const log='REV96_USER101_R31F_BUILD.json';
if([output,log].some(f=>fs.existsSync(path.join(root,f))))throw Error('Never overwrite an existing candidate');
const original=fs.readFileSync(path.join(root,source));
if(sha(original)!==sourceSha)throw Error('Unexpected GLB parent');
const trim=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(trim)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Manual deletion history differs');
const u=JSON.parse(trim);if(u.deletedFaces.length!==101||u.positions.length!==754||Object.keys(u.controls).length!==106)throw Error('Manual edit counts differ');
const jl=original.readUInt32LE(12),g=JSON.parse(original.toString('utf8',20,20+jl));
const offset=28+jl;let bin=Buffer.from(original.subarray(offset,offset+original.readUInt32LE(20+jl)));
const prim=g.meshes[0].primitives,a=prim[13],b=prim[23];
if(prim.length!==24||g.skins[0].joints.length!==63||a.material!==5||b.material!==5||a.extras?.layer!=='anatomy-skin'||b.extras?.layer!=='skin')throw Error('Unexpected primitive grouping');
const C={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},S={5121:1,5123:2,5125:4,5126:4},F={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(i){
 const aa=g.accessors[i],v=g.bufferViews[aa.bufferView],n=C[aa.type],sz=S[aa.componentType],ofs=(v.byteOffset||0)+(aa.byteOffset||0),st=v.byteStride||n*sz;
 return Array.from({length:aa.count},(_,j)=>{const out=[];for(let k=0;k<n;k++)out.push(bin[F[aa.componentType]](ofs+j*st+k*sz));return n===1?out[0]:out});
}
function data(p){return{attrs:Object.fromEntries(Object.entries(p.attributes).map(([k,id])=>[k,read(id)])),morph:Object.fromEntries(Object.entries(p.targets[0]).map(([k,id])=>[k,read(id)])),indices:read(p.indices)}}
const A=data(a),B=data(b),anames=Object.keys(A.attrs),mnames=Object.keys(A.morph);
if(JSON.stringify(anames.sort())!==JSON.stringify(Object.keys(B.attrs).sort())||JSON.stringify(mnames.sort())!==JSON.stringify(Object.keys(B.morph).sort()))throw Error('Incompatible attributes');
if(A.indices.length!==529*3||B.indices.length!==2332*3||B.attrs.POSITION.length!==1231)throw Error('Wrong parent mesh version');
const Nauthor=A.attrs.POSITION.length,Nskin=B.attrs.POSITION.length;
const subtract=(x,y)=>x.map((v,i)=>v-y[i]);
const distance=(x,y)=>Math.hypot(...subtract(x,y));
const key=(a,b)=>a<b?a+':'+b:b+':'+a;
const cKey=(x)=>x.map(v=>Math.round(v*1e6)).join('/');
const cEdge=(a,b)=>[cKey(a),cKey(b)].sort().join('|');
function edges(indices){const out=new Map();for(let i=0;i<indices.length;i+=3){const t=indices.slice(i,i+3);for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3],k=key(a,b);if(!out.has(k))out.set(k,[]);out.get(k).push({a,b,other:t[(j+2)%3],f:i/3})}}return out}
const eA=edges(A.indices),eB=edges(B.indices),edgesA=[...eA.values()].filter(a=>a.length===1).map(a=>a[0]),edgesB=[...eB.values()].filter(a=>a.length===1).map(a=>a[0]);
const authByCoord=new Map();
for(const e of edgesA){const cc=cEdge(A.attrs.POSITION[e.a],A.attrs.POSITION[e.b]);if(!authByCoord.has(cc))authByCoord.set(cc,[]);authByCoord.get(cc).push(e)}
const weld=new Map(),weldedEdges=[];
const jointDistance=(idA,idB)=>{
 const x=A.attrs.JOINTS_0[idA],y=B.attrs.JOINTS_0[idB],u=A.attrs.WEIGHTS_0[idA],v=B.attrs.WEIGHTS_0[idB];
 return x.every((a,i)=>a===y[i])?u.reduce((s,a,i)=>s+Math.abs(a-v[i]),0):Infinity;
};
const diff=(aa,bb)=>Array.isArray(aa)?distance(aa,bb):Math.abs(aa-bb);
for(const e of edgesB){
 const options=authByCoord.get(cEdge(B.attrs.POSITION[e.a],B.attrs.POSITION[e.b]))||[];
 if(!options.length)continue;
 const match=options.find(o=>{
  for(const [ia,ib]of [[o.a,e.a],[o.b,e.b]]){} // pair by position below
  const pairs=[e.a,e.b].map(idB=>[o.a,o.b].find(idA=>distance(B.attrs.POSITION[idB],A.attrs.POSITION[idA])<1e-7));
  if(pairs.some(x=>x===undefined))return false;
  return [e.a,e.b].every((idB,i)=>{
   const idA=pairs[i];
   return diff(A.attrs.TEXCOORD_0[idA],B.attrs.TEXCOORD_0[idB])<2e-5&&diff(A.morph.POSITION[idA],B.morph.POSITION[idB])<2e-5&&jointDistance(idA,idB)<.012;
  });
 });
 if(!match)continue;
 const pa=[e.a,e.b].map(idB=>[match.a,match.b].find(idA=>distance(B.attrs.POSITION[idB],A.attrs.POSITION[idA])<1e-7));
 if(pa.some((ia,i)=>weld.has([e.a,e.b][i])&&weld.get([e.a,e.b][i])!==ia))continue;
 weld.set(e.a,pa[0]);weld.set(e.b,pa[1]);
 weldedEdges.push({auth:[match.a,match.b],skin:[e.a,e.b]});
}
if(weldedEdges.length<18)throw Error('Insufficient shape-compatible seam edges to physically weld: '+weldedEdges.length);
const joined={attrs:{},morph:{},indices:[]};
for(const k of anames)joined.attrs[k]=A.attrs[k].map(v=>Array.isArray(v)?v.slice():v);
for(const k of mnames)joined.morph[k]=A.morph[k].map(v=>Array.isArray(v)?v.slice():v);
const map=[];
for(let i=0;i<Nskin;i++){
 if(weld.has(i)){map[i]=weld.get(i);continue;}
 const dest=joined.attrs.POSITION.length;
 map[i]=dest;
 for(const k of anames)joined.attrs[k].push(Array.isArray(B.attrs[k][i])?B.attrs[k][i].slice():B.attrs[k][i]);
 for(const k of mnames)joined.morph[k].push(Array.isArray(B.morph[k][i])?B.morph[k][i].slice():B.morph[k][i]);
}
joined.indices=A.indices.concat(B.indices.map(i=>map[i]));
const faceCount=joined.indices.length/3,joinedEdges=edges(joined.indices),incident=[...joinedEdges.values()].map(x=>x.length);
const maxIncidence=Math.max(...incident),nonManifold=incident.filter(n=>n>2).length;
const edgeBoundary=[...joinedEdges.values()].filter(v=>v.length===1).length;
if(nonManifold)throw Error('Weld created nonmanifold edges='+nonManifold);
const successfulJoin=weldedEdges.filter(e=>edges(joined.indices).get(key(...e.auth))?.length===2);
if(successfulJoin.length<18)throw Error('Weld did not topologically connect the anatomical surface');
const sizeBefore=joined.attrs.POSITION.length;
if(!A.indices.every((v,i)=>joined.indices[i]===v))throw Error('Original authored indices were not preserved');
for(let i=0;i<Nauthor;i++)if(JSON.stringify(joined.attrs.POSITION[i])!==JSON.stringify(A.attrs.POSITION[i])||JSON.stringify(joined.morph.POSITION[i])!==JSON.stringify(A.morph.POSITION[i]))throw Error('Original authored vertex changed');
const sub=subtract;
const cross=(x,y)=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
const add=(x,y)=>x.map((v,k)=>v+y[k]),mul=(x,t)=>x.map(v=>v*t);
const dot=(x,y)=>x.reduce((s,v,i)=>s+v*y[i],0),length=x=>Math.hypot(...x);
function geometricNormals(positions){
 const norms=positions.map(()=>[0,0,0]);
 for(let f=0;f<joined.indices.length;f+=3){const [ia,ib,ic]=joined.indices.slice(f,f+3),norm=cross(sub(positions[ib],positions[ia]),sub(positions[ic],positions[ia]));for(const idx of [ia,ib,ic])norms[idx]=add(norms[idx],norm);}
 return norms.map((n,i)=>length(n)>1e-11?mul(n,1/length(n)):joined.attrs.NORMAL[i]);
}
const rest=joined.attrs.POSITION,posed=rest.map((x,i)=>add(x,joined.morph.POSITION[i])),geom=geometricNormals(rest),posedGeom=geometricNormals(posed);
// Exact C0 topological weld: a single shared normal is now used by both original
// authored faces and procedural posterior faces. Prefer author's authored
// orientation on the seam where signed face winding happens to disagree.
for(let i=0;i<rest.length;i++){
 const authored=i<Nauthor,originalRest=joined.attrs.NORMAL[i],originalPose=add(originalRest,joined.morph.NORMAL[i]);
 let n=geom[i],np=posedGeom[i];
 if(authored){
  const ar=originalRest,ap=originalPose;
  if(length(ar)>.01&&dot(n,ar)<0.25*length(n)*length(ar))n=ar;
  if(length(ap)>.01&&dot(np,ap)<0.25*length(np)*length(ap))np=ap;
 }
 n=mul(n,1/(length(n)||1));np=mul(np,1/(length(np)||1));
 joined.attrs.NORMAL[i]=n;joined.morph.NORMAL[i]=sub(np,n);
}
function area(pos){
 let degenerate=0,min=Infinity;
 for(let i=0;i<joined.indices.length;i+=3){const [a,b,c]=joined.indices.slice(i,i+3),normal=cross(sub(pos[b],pos[a]),sub(pos[c],pos[a])),v=length(normal)*.5;if(v<1e-11)degenerate++;min=Math.min(min,v)}
 return{degenerate,min};
}
const restQuality=area(rest),poseQuality=area(posed);
if(restQuality.degenerate||poseQuality.degenerate)throw Error('Source faces degenerated by welding');
function writeRows(rows,template){
 const t=g.accessors[template],n=C[t.type],sz=S[t.componentType],block=Buffer.alloc(rows.length*n*sz),at=(bin.length+3)&~3;
 for(let i=0;i<rows.length;i++)for(let k=0;k<n;k++){
  const v=n===1?rows[i]:rows[i][k],o=(i*n+k)*sz;if(!Number.isFinite(v))throw Error('NaN');
  if(t.componentType===5126)block.writeFloatLE(v,o);
  else if(t.componentType===5123)block.writeUInt16LE(v,o);
  else if(t.componentType===5121)block.writeUInt8(Math.round(v),o);
  else if(t.componentType===5125)block.writeUInt32LE(v,o);
 }
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),block]);const bv=g.bufferViews.push({buffer:0,byteOffset:at,byteLength:block.length})-1;
 const aa={bufferView:bv,componentType:t.componentType,count:rows.length,type:t.type};if(t.normalized!==undefined)aa.normalized=t.normalized;
 if(t.min||t.max)for(const mode of ['min','max'])if(t[mode])aa[mode]=Array.from({length:n},(_,k)=>mode==='min'?Math.min(...rows.map(r=>n===1?r:r[k])):Math.max(...rows.map(r=>n===1?r:r[k])));
 return g.accessors.push(aa)-1;
}
function indexWriter(indices,oldId){
 if(indices.some(x=>x>65535)||indices.length%3)throw Error('Index invalid');
 const at=(bin.length+3)&~3,block=Buffer.alloc(indices.length*2);indices.forEach((v,i)=>block.writeUInt16LE(v,2*i));
 bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),block]);const bv=g.bufferViews.push({buffer:0,byteOffset:at,byteLength:block.length})-1;
 const result={bufferView:bv,componentType:5123,count:indices.length,type:'SCALAR'};
 if(indices.length){result.min=[Math.min(...indices)];result.max=[Math.max(...indices)]}
 return g.accessors.push(result)-1;
}
// Transfer authored geometry to primitive 23 unchanged, as first 529 faces.
// Primitive 13 remains present for legacy viewer indices, but has no faces.
a.indices=indexWriter([],a.indices);
for(const k of anames)b.attributes[k]=writeRows(joined.attrs[k],b.attributes[k]);
for(const k of mnames)b.targets[0][k]=writeRows(joined.morph[k],b.targets[0][k]);
b.indices=indexWriter(joined.indices,b.indices);
a.extras={...a.extras,layer:'authored-geometry-transferred',transferredFaceCount:529,destinationPrimitive:23,sourceAuthoredPositionsSHA256:sha(Buffer.from(JSON.stringify(A.attrs.POSITION)))};
b.extras={...b.extras,layer:'skin',revision:'r31f-physically-welded-convex',preservedAuthorFaces:529,weldedBoundaryEdges:successfulJoin.length,sharedVertexCount:weld.size};
g.extras={...g.extras,revision:'rev96-user101-r31f-physical-author-skin-weld',parentSHA256:sourceSha,wholeBodyWatertight:false,visualAcceptance:'candidate'};
const garments=prim.reduce((s,p)=>s+(p.extras?.layer==='garment'?g.accessors[p.indices].count/3:0),0);
if(garments!==370||prim.reduce((s,p)=>s+g.accessors[p.indices].count/3,0)!==6050)throw Error('Original triangle counts changed');
g.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(g)),jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]),head=Buffer.alloc(12),jhead=Buffer.alloc(8),bhead=Buffer.alloc(8);
head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jp.length+8+bp.length,8);jhead.writeUInt32LE(jp.length,0);jhead.write('JSON',4);bhead.writeUInt32LE(bp.length,0);bhead.writeUInt32LE(0x004e4942,4);
const final=Buffer.concat([head,jhead,jp,bhead,bp]);fs.writeFileSync(path.join(root,output),final,{flag:'wx'});
const report={revision:'r31f',file:output,sha256:sha(final),parent:source,parentSha256:sourceSha,authoredSourceVertices:Nauthor,authoredSourceFaces:529,generatedSourceVertices:Nskin,generatedSourceFaces:2332,resultUnifiedVertices:sizeBefore,resultUnifiedFaces:faceCount,sharedVertices:weld.size,topologicallyWeldedEdges:successfulJoin.length,oldComponentBoundaryEdges:edgesA.length+edgesB.length,remainingComponentBoundaryEdges:edgeBoundary,nonmanifoldEdges:nonManifold,authoredPositionArraysUntouched:true,authoredIndicesPreserved:true,manualDeletedFaces101Preserved:true,rigBones:g.skins[0].joints.length,garmentFaces:garments,restQuality,poseQuality,wholeBodyWatertight:false,visualAcceptance:'pending',edgeMapping:weldedEdges};
fs.writeFileSync(path.join(root,log),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...report,edgeMapping:`[${report.edgeMapping.length} seam edge pairs]`},null,2));
