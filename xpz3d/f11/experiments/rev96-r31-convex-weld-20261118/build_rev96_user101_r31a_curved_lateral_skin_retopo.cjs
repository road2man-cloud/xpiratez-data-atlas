'use strict';
/**
 * XPZ3D F11 rev96 r31a -- contour-preserving curved lateral skin replacement.
 * Retopologize only primitive 21, preserving its entire 908-point authored array.
 * New internal edge vertices are a locally clamped two-sided fairing of the
 * adjacent triangles; all 32 boundary edges remain identical for adjoining skin.
 * Input r30d and 101 manual face deletions are SHA pinned, immutable.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),root=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const src='r21AO-F11-user101-integrated-oval-r30d-continuous-oval-fairing.glb';
const hash='2c4fc4be131aced3613215534e7c114193f6066e50517061c1d23e56aaee060c';
const output='r21AO-F11-user101-integrated-oval-r31a-curved-lateral-skin-retopo.glb';
const report='REV96_USER101_R31A_BUILD.json';
if([output,report].some(p=>fs.existsSync(path.join(root,p))))throw Error('Refuse overwrite');
const raw=fs.readFileSync(path.join(root,src));if(sha(raw)!==hash)throw Error('Wrong immutable r30d');
const trim=fs.readFileSync(path.join(root,'rev95-user-trim-101faces-20261116T152807Z.json'));
if(sha(trim)!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Manual trim source changed');
const usr=JSON.parse(trim);if(usr.deletedFaces.length!==101||usr.positions.length!==754||Object.keys(usr.controls).length!==106)throw Error('Manual edit counts mismatch');
const jl=raw.readUInt32LE(12),g=JSON.parse(raw.toString('utf8',20,20+jl)),off=28+jl;let bin=Buffer.from(raw.subarray(off,off+raw.readUInt32LE(20+jl)));
const ps=g.meshes[0].primitives,p=ps[21];if(ps.length!==24||g.skins[0].joints.length!==63||p.material!==5||p.extras?.layer!=='skin')throw Error('Unexpected primitive');
const T={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},S={5121:1,5123:2,5125:4,5126:4},R={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function read(i){const a=g.accessors[i],v=g.bufferViews[a.bufferView],n=T[a.type],s=S[a.componentType],o=(v.byteOffset||0)+(a.byteOffset||0),st=v.byteStride||n*s;return Array.from({length:a.count},(_,j)=>{const z=[];for(let k=0;k<n;k++)z.push(bin[R[a.componentType]](o+j*st+k*s));return n===1?z[0]:z})}
const A=Object.fromEntries(Object.entries(p.attributes).map(([k,i])=>[k,read(i)]));
const M=Object.fromEntries(Object.entries(p.targets[0]).map(([k,i])=>[k,read(i)]));
let I=read(p.indices),oldI=I.slice();
const originalVertices=A.POSITION.length;if(originalVertices!==908||I.length!==56*3)throw Error('Wrong source lateral skin');
const originalPos=A.POSITION.map(x=>x.slice()),originalMorph=M.POSITION.map(x=>x.slice());
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,t)=>a.map(x=>x*t),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),length=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mid=(a,b)=>Array.isArray(a)?a.map((x,i)=>(x+b[i])/2):(a+b)/2,ek=(a,b)=>a<b?a+':'+b:b+':'+a;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
function getEdges(v){const E=new Map();for(let i=0;i<v.length;i+=3){const t=v.slice(i,i+3);for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],o=t[(k+2)%3],key=ek(a,b);if(!E.has(key))E.set(key,{a:Math.min(a,b),b:Math.max(a,b),face:[],opp:[]});const e=E.get(key);e.face.push(i/3);e.opp.push(o)}}return E}
const oldEdges=getEdges(I),border0=new Set([...oldEdges].filter(([,e])=>e.face.length===1).map(([k])=>k));
if(border0.size!==32||[...oldEdges.values()].some(e=>e.face.length>2))throw Error('Unexpected source lateral border');
const selected=new Map();
for(const [key,e]of oldEdges){
 if(e.face.length!==2)continue;
 const q=mid(A.POSITION[e.a],A.POSITION[e.b]),[x,y,z]=q,ax=Math.abs(x),lengthEdge=length(sub(A.POSITION[e.a],A.POSITION[e.b]));
 const influence=smooth(.036,.068,ax)*(1-smooth(.181,.203,ax))*smooth(-.158,-.132,y)*(1-smooth(-.063,-.047,y))*smooth(.718,.78,z)*(1-smooth(1.035,1.084,z));
 if(influence<.08||lengthEdge<.015)continue;
 const opp=mid(A.POSITION[e.opp[0]],A.POSITION[e.opp[1]]),curvature=sub(opp,q);
 // Curvature follows geometry on BOTH original adjacent triangles; cap displacement
 // and limit large Z jumps so the patch does not look like four pinned tent poles.
 const target=mul(curvature,.18*influence);
 let factor=Math.min(1,.009/(length(target)||1));
 // New vertex must remain on the same side of each original oriented triangle
 // for both rest and posed positions. Cut back only this local midpoint.
 const id=e.a,je=e.b,adj=e.opp;
 const check=(pos,delta)=>{
  const nq=add(mid(pos[id],pos[je]),delta);
  return adj.every(kk=>{
   const a=pos[id],b=pos[je],c=pos[kk],n=cross(sub(b,a),sub(c,a));
   const t1=cross(sub(nq,a),sub(c,a)),t2=cross(sub(b,nq),sub(c,nq));
   return length(t1)>1e-11&&length(t2)>1e-11&&dot(n,t1)>0&&dot(n,t2)>0;
  });
 };
 const posed=A.POSITION.map((x,i)=>add(x,M.POSITION[i]));
 let d=mul(target,factor);
 for(let pass=0;pass<24&&(!check(A.POSITION,d)||!check(posed,d));pass++){factor*=.67;d=mul(target,factor)}
 if(!check(A.POSITION,d)||!check(posed,d))continue;
 selected.set(key,{edge:e,delta:d,influence,oldLength:lengthEdge});
}
if(selected.size<8)throw Error('Too few lateral connections selected: '+selected.size);
const weightCombine=(a,b)=>{
 const map=new Map();for(const id of [a,b])for(let i=0;i<4;i++){const joint=A.JOINTS_0[id][i],w=A.WEIGHTS_0[id][i]*.5;map.set(joint,(map.get(joint)||0)+w)}
 const top=[...map].sort((x,y)=>y[1]-x[1]).slice(0,4),sum=top.reduce((s,r)=>s+r[1],0)||1;
 return {j:Array.from({length:4},(_,i)=>top[i]?.[0]||0),w:Array.from({length:4},(_,i)=>(top[i]?.[1]||0)/sum)};
};
const newId=new Map(),splitDetails=[];
for(const [key,row]of selected){
 const {a,b}=row.edge,id=A.POSITION.length,sw=weightCombine(a,b);
 for(const name of Object.keys(A))A[name].push(name==='JOINTS_0'?sw.j:name==='WEIGHTS_0'?sw.w:mid(A[name][a],A[name][b]));
 for(const name of Object.keys(M))M[name].push(mid(M[name][a],M[name][b]));
 A.POSITION[id]=add(A.POSITION[id],row.delta);
 // Preserve original endpoint seam normals; only normalize the new midpoint's rest/posed normals.
 const n=A.NORMAL[id],nl=length(n)||1;A.NORMAL[id]=mul(n,1/nl);
 const nm=add(A.NORMAL[id],M.NORMAL[id]),ml=length(nm)||1;M.NORMAL[id]=sub(mul(nm,1/ml),A.NORMAL[id]);
 newId.set(key,id);
 splitDetails.push({newVertex:id,sourceEdge:[a,b],delta:row.delta,edgeLength:row.oldLength,influence:row.influence});
}
const faces=[];
for(let i=0;i<I.length;i+=3){
 const v=I.slice(i,i+3),marked=[newId.get(ek(v[0],v[1])),newId.get(ek(v[1],v[2])),newId.get(ek(v[2],v[0]))],count=marked.filter(id=>id!==undefined).length;
 if(count===0){faces.push(...v);continue}
 if(count===1){const k=marked.findIndex(x=>x!==undefined),a=v[k],b=v[(k+1)%3],c=v[(k+2)%3],m=marked[k];faces.push(a,m,c,m,b,c);continue}
 if(count===2){const unmarked=marked.findIndex(x=>x===undefined),k=(unmarked+1)%3,a=v[k],b=v[(k+1)%3],c=v[(k+2)%3],ab=marked[k],bc=marked[(k+1)%3];faces.push(b,bc,ab,a,ab,c,ab,bc,c);continue}
 const [a,b,c]=v,[ab,bc,ca]=marked;faces.push(a,ab,ca,b,bc,ab,c,ca,bc,ab,bc,ca);
}
I=faces;
const edges1=getEdges(I),border1=new Set([...edges1].filter(([,e])=>e.face.length===1).map(([k])=>k));
if(border1.size!==32||[...border1].some(k=>!border0.has(k))||[...edges1.values()].some(e=>e.face.length>2))throw Error('Boundary topology changed');
for(let i=0;i<originalVertices;i++)if(JSON.stringify(A.POSITION[i])!==JSON.stringify(originalPos[i])||JSON.stringify(M.POSITION[i])!==JSON.stringify(originalMorph[i]))throw Error('Original authored point displaced');
function area(P){let min=Infinity,zero=0;for(let i=0;i<I.length;i+=3){const [a,b,c]=I.slice(i,i+3),n=cross(sub(P[b],P[a]),sub(P[c],P[a])),v=length(n)*.5;min=Math.min(min,v);if(v<1e-11)zero++;}return{min,zero}}
const rest=area(A.POSITION),pose=area(A.POSITION.map((p,i)=>add(p,M.POSITION[i])));
if(rest.zero||pose.zero)throw Error('Degenerate reconstructed surface');
function put(rows,template){
 const ac=g.accessors[template],n=T[ac.type],sz=S[ac.componentType],part=Buffer.alloc(rows.length*n*sz),o=(bin.length+3)&~3;
 for(let i=0;i<rows.length;i++)for(let k=0;k<n;k++){const x=n===1?rows[i]:rows[i][k],j=(i*n+k)*sz;if(!Number.isFinite(x))throw Error('Nonfinite');
 if(ac.componentType===5126)part.writeFloatLE(x,j);else if(ac.componentType===5123)part.writeUInt16LE(x,j);else if(ac.componentType===5121)part.writeUInt8(Math.round(x),j);else if(ac.componentType===5125)part.writeUInt32LE(x,j);}
 bin=Buffer.concat([bin,Buffer.alloc(o-bin.length),part]);const v=g.bufferViews.push({buffer:0,byteOffset:o,byteLength:part.length})-1;
 const next={bufferView:v,componentType:ac.componentType,count:rows.length,type:ac.type};if(ac.normalized!==undefined)next.normalized=ac.normalized;
 if(ac.min||ac.max)for(const mode of ['min','max'])if(ac[mode])next[mode]=Array.from({length:n},(_,k)=>mode==='min'?Math.min(...rows.map(x=>n===1?x:x[k])):Math.max(...rows.map(x=>n===1?x:x[k])));
 return g.accessors.push(next)-1;
}
function writeIndices(v){const at=(bin.length+3)&~3,b=Buffer.alloc(v.length*2);v.forEach((id,i)=>b.writeUInt16LE(id,2*i));bin=Buffer.concat([bin,Buffer.alloc(at-bin.length),b]);const bv=g.bufferViews.push({buffer:0,byteOffset:at,byteLength:b.length})-1;return g.accessors.push({bufferView:bv,componentType:5123,count:v.length,type:'SCALAR',min:[0],max:[Math.max(...v)]})-1}
for(const [k,accessor]of Object.entries(p.attributes))p.attributes[k]=put(A[k],accessor);
for(const [k,accessor]of Object.entries(p.targets[0]))p.targets[0][k]=put(M[k],accessor);
p.indices=writeIndices(I);
p.extras={...p.extras,revision:'r31a-curved-lateral-skin-retopology',immutableOriginalVertices:908,splitOnlyInteriorEdges:true,sourceFaces:oldI.length/3,addedMidpoints:splitDetails.length};
g.extras={...g.extras,revision:'rev96-user101-r31a-curved-lateral-skin-retopology',parentSHA256:hash,visualAcceptance:'candidate',wholeBodyWatertight:false};
const garment=ps.reduce((s,p)=>s+(p.extras?.layer==='garment'?g.accessors[p.indices].count/3:0),0);
if(garment!==370)throw Error('Garment count changed');
g.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(g)),jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const head=Buffer.alloc(12),jhead=Buffer.alloc(8),bhead=Buffer.alloc(8);
head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jp.length+8+bp.length,8);jhead.writeUInt32LE(jp.length,0);jhead.write('JSON',4);bhead.writeUInt32LE(bp.length,0);bhead.writeUInt32LE(0x004e4942,4);
const buf=Buffer.concat([head,jhead,jp,bhead,bp]);fs.writeFileSync(path.join(root,output),buf,{flag:'wx'});
const result={file:output,sha256:sha(buf),parent:src,parentSHA256:hash,retopologyPrimitive:21,sourceFaces:oldI.length/3,resultFaces:I.length/3,sourceVertices:originalVertices,resultVertices:A.POSITION.length,curvedInternalEdges:splitDetails.length,facesAdded:I.length/3-oldI.length/3,oldBoundaryEdges:border0.size,resultBoundaryEdges:border1.size,rest,pose,allTriangles:ps.reduce((s,p)=>s+g.accessors[p.indices].count/3,0),bones:g.skins[0].joints.length,garmentTriangles:garment,manualDeleted101Preserved:true,authored908PositionsUntouched:true,authored529FacesUntouched:true,remainingBodyOpenBoundaries:true,visualApproval:'pending',splitDetails};
fs.writeFileSync(path.join(root,report),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...result,splitDetails:`[${splitDetails.length} entries saved]`},null,2));
