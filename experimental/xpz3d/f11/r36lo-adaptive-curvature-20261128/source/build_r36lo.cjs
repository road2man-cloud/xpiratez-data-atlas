'use strict';
/**
 * R36LO: adaptive, budget-locked mid-edge curvature reconstruction.
 * Subdivides six selected shared manifold edges within existing single
 * skinned body (1120 -> 1132 tris), using each triangle's original UV
 * island interpolation. No detached polygons, no new material or bones.
 * Input: published R36LN full-character GLB (2,088 triangles).
 * Output: full-character 2,100-triangle GLB + JSON report.
 */
const fs=require('fs'),path=require('path');
const {load,extract,Builder,values}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {contourField}=require('../../r36ln-reference-contour-20261128/source/center_contour.cjs');
const {projector}=require('../../r36kz-chest-center-shape-20261128/source/surface_patch.cjs');
const EPS=1e-9;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const bell=(x,c,r)=>Math.exp(-.5*((x-c)/r)**2);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=v=>Math.hypot(...v);
const unit=v=>mul(v,1/(norm(v)||1));
const lerp=(a,b,t=.5)=>a.map((v,i)=>v+(b[i]-v)*t);
const key=p=>p.map(x=>Math.round(x*1e6)).join(':');
const ekey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
function assert(t,msg){if(!t)throw Error(msg)}
function topology(p,ix){
 const edges=new Map();
 for(let i=0;i<ix.length;i+=3){
  const ids=ix.slice(i,i+3).map(j=>key(p[j]));
  for(let j=0;j<3;j++){const k=ekey(ids[j],ids[(j+1)%3]);edges.set(k,(edges.get(k)||0)+1)}
 }
 const counts=[...edges.values()];
 return {vertices:new Set(p.map(key)).size,faces:ix.length/3,edges:edges.size,
   boundary:counts.filter(x=>x===1).length,nonManifold:counts.filter(x=>x!==2).length};
}
function edgeCandidates(mesh){
 const edges=new Map(),faces=[],p=mesh.positions,ix=mesh.indices;
 const front=projector(mesh);
 for(let i=0;i<ix.length;i+=3){
  const ids=ix.slice(i,i+3),fid=faces.length;faces.push(ids);
  for(let j=0;j<3;j++){
   const a=ids[j],b=ids[(j+1)%3],c=ids[(j+2)%3];
   const k=ekey(key(p[a]),key(p[b]));
   if(!edges.has(k))edges.set(k,[]);
   edges.get(k).push({fid,a,b,c,slot:j});
  }
 }
 const list=[];
 for(const [k,inc] of edges){
  if(inc.length!==2)continue;
  const A=p[inc[0].a],B=p[inc[0].b],M=lerp(A,B);
  const x=Math.abs(M[0]),y=M[1],z=M[2],dist=norm(sub(B,A));
  if(x>.118||z<.785||z>1.025||y>.035||dist<.005||dist>.15)continue;
  const shell=front.sample(M[0],M[2]);
  if(!shell||y-shell.y>.031||y-shell.y<-.012)continue; // never spend subdivision on hidden rear/inner wall
  const fade=(1-smooth(.105,.14,x))*smooth(.78,.824,z)*(1-smooth(.988,1.042,z));
  if(fade<.12)continue;
  const cm=contourField(M[0],z),ca=contourField(A[0],A[2]),cb=contourField(B[0],B[2]);
  const curvature=cm-(ca+cb)/2;
  const ridge=bell(x,.031,.023)*bell(z,.895,.092)-.58*bell(x,0,.011)*bell(z,.88,.09);
  const delta=clamp(-1.32*curvature-.0018*ridge*fade,-.0035,.0035);
  const score=fade*(.055*bell(x,.031,.051)*bell(z,.89,.094)+8*Math.abs(curvature)+.007*Math.min(dist/.04,2));
  if(Math.abs(delta)<.000025)continue;
  // The selected edge is shared by two faces, so both faces must be safe.
  const at=[M[0],M[1]+delta,M[2]];
  let safe=true,minDot=1,minRatio=1;
  for(const q of inc){
   const original=[p[q.a],p[q.b],p[q.c]];
   const old=cross(sub(original[1],original[0]),sub(original[2],original[0]));
   const left=cross(sub(at,p[q.a]),sub(p[q.c],p[q.a]));
   const right=cross(sub(p[q.b],at),sub(p[q.c],at));
   const oldLen=norm(old),al=norm(left),ar=norm(right);
   const dotL=dot(unit(left),unit(old)),dotR=dot(unit(right),unit(old));
   minDot=Math.min(minDot,dotL,dotR);minRatio=Math.min(minRatio,al/oldLen,ar/oldLen);
   if(oldLen<EPS||al/oldLen<.34||ar/oldLen<.34||dotL<.78||dotR<.78)safe=false;
  }
  if(safe)list.push({k,inc,mid:M,delta,score,minDot,minRatio});
 }
 list.sort((a,b)=>b.score-a.score);
 return list;
}
function skinAt(mesh,incident){
 const tally=new Map();
 for(const {a,b} of incident)for(const id of [a,b])
   for(let k=0;k<4;k++){
     const j=mesh.joints[id][k],w=mesh.weights[id][k]/(incident.length*2);
     tally.set(j,(tally.get(j)||0)+w);
   }
 const best=[...tally].filter(x=>x[1]>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4);
 const sum=best.reduce((s,x)=>s+x[1],0);
 assert(sum>.999e-3,'invalid blended skin');
 return {j:Array.from({length:4},(_,i)=>best[i]?.[0]||0),
   w:Array.from({length:4},(_,i)=>(best[i]?.[1]||0)/sum)};
}
function subdivide(mesh,variant){
 const candidates=edgeCandidates(mesh);
 const chosen=[],usedFaces=new Set(),centers=[];
 for(const c of candidates){
   if(c.inc.some(x=>usedFaces.has(x.fid)))continue;
   if(centers.some(x=>norm(sub(x,c.mid))<.012))continue;
   chosen.push(c);centers.push(c.mid);c.inc.forEach(x=>usedFaces.add(x.fid));
   if(chosen.length===6)break;
 }
 assert(chosen.length===6,'need 6 safe center edges; available '+candidates.length+', selected '+chosen.length);
 const m={...mesh},p=mesh.positions.map(x=>x.slice()),n=mesh.normals.map(x=>x.slice()),
   uv=mesh.uvs.map(x=>x.slice()),j=mesh.joints.map(x=>x.slice()),
   w=mesh.weights.map(x=>x.slice()),t=mesh.tangents.map(x=>x.slice()),
   colors=mesh.colors?mesh.colors.map(x=>x.slice()):null;
 const faceToEdge=new Map(),out=[];
 chosen.forEach(c=>c.inc.forEach(q=>faceToEdge.set(q.fid,{edge:c,entry:q})));
 const intensity=variant==='defined'?1.0:.68;
 for(let fi=0;fi<mesh.indices.length/3;fi++){
   const ids=mesh.indices.slice(fi*3,fi*3+3),entry=faceToEdge.get(fi);
   if(!entry){out.push(...ids);continue}
   const {edge,entry:q}=entry;
   const newPos=[edge.mid[0],edge.mid[1]+edge.delta*intensity,edge.mid[2]];
   const id=p.length,sharedSkin=skinAt(mesh,edge.inc);
   p.push(newPos);
   n.push(unit(add(mesh.normals[q.a],mesh.normals[q.b])));
   uv.push(lerp(mesh.uvs[q.a],mesh.uvs[q.b]));
   j.push(sharedSkin.j);w.push(sharedSkin.w);
   t.push([...unit(add(mesh.tangents[q.a].slice(0,3),mesh.tangents[q.b].slice(0,3))),mesh.tangents[q.a][3]]);
   if(colors)colors.push(lerp(mesh.colors[q.a],mesh.colors[q.b]));
   out.push(q.a,id,q.c,id,q.b,q.c);
 }
 // Compute smooth geometric normals in object space, averaged across UV islands.
 const geom=new Map();
 for(let i=0;i<out.length;i+=3){
   const ids=out.slice(i,i+3);
   const fn=cross(sub(p[ids[1]],p[ids[0]]),sub(p[ids[2]],p[ids[0]]));
   for(const id of ids){
     const k=key(p[id]);geom.set(k,add(geom.get(k)||[0,0,0],fn));
   }
 }
 for(let i=0;i<p.length;i++){
   const [x,y,z]=p[i],ax=Math.abs(x);
   const fade=(1-smooth(.102,.17,ax))*smooth(.735,.804,z)*(1-smooth(1.008,1.085,z));
   const mix=variant==='defined'?.82:.72;
   n[i]=unit(lerp(n[i],unit(geom.get(key(p[i]))||n[i]),fade*mix));
   const raw=t[i].slice(0,3),projected=sub(raw,mul(n[i],dot(raw,n[i])));
   const backup=Math.abs(n[i][2])<.85?[0,0,1]:[0,1,0];
   const fallback=sub(backup,mul(n[i],dot(backup,n[i])));
   t[i]=[...unit(norm(projected)>1e-8?projected:fallback),t[i][3]>=0?1:-1];
 }
 m.positions=p;m.normals=n;m.uvs=uv;m.joints=j;m.weights=w;m.tangents=t;m.colors=colors;m.indices=out;
 const before=topology(mesh.positions,mesh.indices),after=topology(p,out);
 assert(before.faces===1120&&before.boundary===0&&before.nonManifold===0,'source not a closed 1120 triangle surface');
 assert(after.faces===1132&&after.boundary===0&&after.nonManifold===0,'subdivided surface lost manifold closure');
 for(const row of w)assert(Math.abs(row.reduce((s,v)=>s+v,0)-1)<1e-4,'invalid normalized weights');
 return {mesh:m,report:{version:'R36LO',variant,sourceTopology:before,outputTopology:after,
   chosenEdges:chosen.map(x=>({midpoint:x.mid,score:x.score,curvatureOffset:x.delta*intensity,faceIds:x.inc.map(v=>v.fid)})),
   addedBodyTriangles:12,selectedSharedEdges:6,addedRenderVertices:p.length-mesh.positions.length,
   changedGeometry:true,headUnmodified:true,materialTextureRebake:false, UVInterpolationWithinOriginalIslands:true}};
}
function build(input,output,variant='defined'){
 assert(['defined','soft'].includes(variant),'variant defined|soft');
 assert(fs.existsSync(input),'input GLB missing: '+input);
 assert(!fs.existsSync(output),'refuse to overwrite existing: '+output);
 const src=load(input),g=src.g,mi=g.meshes.findIndex(x=>(x.name||'').includes('R36KP_CONTINUOUS_SKIN'));
 assert(mi>=0,'continuous skinned body not found');
 assert(g.skins.some(s=>s.joints.length===63),'63-bone skeleton missing');
 const prim=g.meshes[mi].primitives[0],a=prim.attributes;
 const allowed=new Set(['POSITION','NORMAL','TANGENT','TEXCOORD_0','JOINTS_0','WEIGHTS_0','COLOR_0']);
 assert(Object.keys(a).every(k=>allowed.has(k)),'unhandled primitive attribute');
 assert(a.TANGENT!=null&&a.TEXCOORD_0!=null&&a.JOINTS_0!=null,'source needs uv, tangents and skin');
 const mesh=extract(src,mi,0);mesh.tangents=values(src,a.TANGENT);
 assert(mesh.indices.length===3360,'expected R36LN 1120-body-triangle model');
 let head=0;
 g.meshes.forEach((mm,i)=>{if(i!==mi)mm.primitives.forEach(p=>{head+=g.accessors[p.indices].count/3})});
 assert(head===968,'head/hair changed');
 const result=subdivide(mesh,variant),v=result.mesh;
 const builder=new Builder(src),meta=builder.g,attr=meta.meshes[mi].primitives[0].attributes;
 attr.POSITION=builder.addAccessor(v.positions,'VEC3',5126,34962);
 attr.NORMAL=builder.addAccessor(v.normals,'VEC3',5126,34962);
 attr.TANGENT=builder.addAccessor(v.tangents,'VEC4',5126,34962);
 attr.TEXCOORD_0=builder.addAccessor(v.uvs,'VEC2',5126,34962);
 attr.JOINTS_0=builder.addAccessor(v.joints,'VEC4',5123,34962);
 attr.WEIGHTS_0=builder.addAccessor(v.weights,'VEC4',5126,34962);
 if(v.colors)attr.COLOR_0=builder.addAccessor(v.colors,'VEC'+v.colors[0].length,5126,34962);
 meta.meshes[mi].primitives[0].indices=builder.addAccessor(v.indices,'SCALAR',5123,34963);
 const mat=meta.materials[prim.material];assert(mat,'skin material missing');
 if(mat.normalTexture)mat.normalTexture.scale=variant==='defined'?.20:.14;
 if(mat.occlusionTexture)mat.occlusionTexture.strength=variant==='defined'?.33:.25;
 const total=head+v.indices.length/3;
 assert(total===2100,'triangle budget regression: '+total);
 meta.asset.generator='R36LO adaptive integrated curvature / 2100 triangles / 63 bones';
 meta.extras={...(meta.extras||{}),r36lo:{version:'R36LO',variant,sourceSHA256:src.sha,
   totalTriangles:total,headTriangles:head,bodyTriangles:v.indices.length/3,
   integratedSurface:true,sourceAtlasRetained:true,originalUVIslandsInterpolated:true,
   builder:'build_r36lo.cjs',renderQA:'pending'}};
 fs.mkdirSync(path.dirname(output),{recursive:true});
 const outputMeta=builder.save(output);
 const report={...result.report,input:path.basename(input),inputSHA256:src.sha,
   output:path.basename(output),outputSHA256:outputMeta.sha,bytes:outputMeta.bytes,
   totalTriangles:total,bodyTriangles:v.indices.length/3,headTriangles:head,
   skeletonJoints:63,skinMaterialNormalScale:mat.normalTexture?.scale??null};
 const reportFile=output.replace(/\.glb$/i,'.report.json');
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output,reportFile,sha256:outputMeta.sha,triangles:total,subdividedEdges:6},null,2));
 return report;
}
if(require.main===module){try{
 const [input,output,mode='defined']=process.argv.slice(2);
 assert(input&&output,'usage: node source/build_r36lo.cjs input.glb output.glb [defined|soft]');
 build(input,output,mode);
}catch(e){console.error(e.stack||e);process.exitCode=1}}
module.exports={build,subdivide,topology,edgeCandidates};
