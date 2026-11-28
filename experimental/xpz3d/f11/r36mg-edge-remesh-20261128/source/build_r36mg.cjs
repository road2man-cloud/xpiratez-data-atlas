'use strict';
/* R36MG: true physical quad diagonal flips across detached per-triangle UV tiles.
 * On success, source physical corner positions, JOINTS, WEIGHTS and normals
 * are reassigned to independent UV slots; tile images are freshly reprojected
 * from old triangles. This is real physical triangle adjacency change,
 * not a vertex position smoothing pass. No source photo is embedded.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,values,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const assert=(a,m)=>{if(!a)throw Error(m)};
const vec=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),len=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{let d=len(a);return d>1e-12?mul(a,1/d):[0,0,1]};
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const poskey=p=>p.map(v=>Math.round(v*1e5)).join('/');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function bary2(p,a,b,c){
 const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
 if(Math.abs(d)<1e-11)return null;
 return [((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/d,
 ((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/d].concat(0).map((v,i,arr)=>i===2?1-arr[0]-arr[1]:v);
}
function flat(p){return [p[0],p[2]]}
function area2(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])}
function minShape(a,b,c){
 const ab=len(vec(a,b)),bc=len(vec(b,c)),ca=len(vec(c,a));
 const area=Math.abs(area2(a,b,c));
 return area/Math.max(1e-12,ab*bc+bc*ca+ca*ab);
}
function embed(q,id){
 const t=q.g.textures[id],im=q.g.images[t.source],view=q.g.bufferViews[im.bufferView],start=view.byteOffset||0;
 assert(im.mimeType==='image/png','PNG required');
 return decodePNG(q.bin.subarray(start,start+view.byteLength));
}
function sample(img,x,y){
 x=clamp(x,0,img.w-1);y=clamp(y,0,img.h-1);
 const x0=Math.floor(x),y0=Math.floor(y),ax=x-x0,ay=y-y0;
 const x1=Math.min(img.w-1,x0+1),y1=Math.min(img.h-1,y0+1);
 const ans=[0,0,0,0];
 for(const [xx,yy,w] of [[x0,y0,(1-ax)*(1-ay)],[x1,y0,ax*(1-ay)],[x0,y1,(1-ax)*ay],[x1,y1,ax*ay]]){
  const i=4*(yy*img.w+xx);for(let k=0;k<4;k++)ans[k]+=w*img.pix[i+k];
 }
 return ans;
}
function centerCompatible(p){
 return Math.abs(p[0])<.093&&p[2]>.77&&p[2]<.953&&p[1]<-.034;
}
function enumerate(mesh){
 const edges=new Map(),P=mesh.positions,ids=mesh.indices;
 for(let f=0;f<ids.length/3;f++){
  const tri=ids.slice(3*f,3*f+3),center=mul(tri.reduce((s,i)=>add(s,P[i]),[0,0,0]),1/3);
  if(!centerCompatible(center))continue;
  for(let j=0;j<3;j++){
   const i=tri[j],k=tri[(j+1)%3],a=poskey(P[i]),b=poskey(P[k]);
   if(a===b)continue;
   const ek=a<b?a+'|'+b:b+'|'+a;
   if(!edges.has(ek))edges.set(ek,[]);
   edges.get(ek).push({face:f,tri,shared:[i,k],opposite:tri[(j+2)%3]});
  }
 }
 const candidates=[];
 for(const [edge,entries] of edges){
  if(entries.length!==2)continue;
  const [L,R]=entries;
  const pair=[...L.shared,L.opposite,R.opposite];
  if(new Set(pair.map(i=>poskey(P[i]))).size!==4)continue;
  // guarantee original source front surface, with non-self-crossing convex quad
  const [ia,ib]=L.shared,ic=L.opposite,id=R.opposite;
  const A=flat(P[ia]),B=flat(P[ib]),C=flat(P[ic]),D=flat(P[id]);
  let oldC=area2(A,B,C),oldD=area2(A,B,D);
  if(oldC*oldD>=-1e-11)continue;
  const newA=area2(C,D,A),newB=area2(C,D,B);
  if(newA*newB>=-1e-11)continue;
  const oldQuality=Math.min(minShape(A,B,C),minShape(A,B,D));
  const newQuality=Math.min(minShape(C,D,A),minShape(C,D,B));
  if(newQuality<.055||newQuality<oldQuality*1.09)continue;
  const all=[ia,ib,ic,id];const y=all.map(i=>P[i][1]);
  if(Math.max(...y)-Math.min(...y)>.035)continue;
  const normalOriginal=unit(cross(vec(P[L.tri[1]],P[L.tri[0]]),vec(P[L.tri[2]],P[L.tri[0]])));
  const normalNeighbor=unit(cross(vec(P[R.tri[1]],P[R.tri[0]]),vec(P[R.tri[2]],P[R.tri[0]])));
  if(dot(normalOriginal,normalNeighbor)<.55)continue;
  candidates.push({edge,L,R,quad:[ia,ib,ic,id],oldQuality,newQuality,
    improvement:(newQuality-oldQuality)/Math.max(.01,oldQuality)});
 }
 return candidates.sort((a,b)=>b.improvement-a.improvement);
}
function oriented(source,slots,cornerIds){
 const P=source.positions;
 const original=slots.map(i=>P[i]);
 const origN=cross(vec(original[1],original[0]),vec(original[2],original[0]));
 let best=null;
 // keep the first corner as close as possible to its former physical location
 for(const perm of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
  const ids=perm.map(i=>cornerIds[i]),points=ids.map(i=>P[i]);
  const newN=cross(vec(points[1],points[0]),vec(points[2],points[0]));
  const agreement=dot(unit(origN),unit(newN));
  if(agreement<.55)continue;
  const dist=slots.reduce((v,id,i)=>v+len(vec(P[id],P[ids[i]])),0);
  if(!best||dist<best.dist)best={ids,dist,agreement};
 }
 return best;
}
function prepare(mesh,candidate){
 const [a,b,c,d]=candidate.quad,L=candidate.L,R=candidate.R;
 // Each triangle receives its own old UV tile and a new diagonal.
 const choices=[
  [[c,a,d],[c,d,b]],
  [[c,d,a],[c,b,d]]
 ];
 let best=null;
 for(const option of choices){
  const one=oriented(mesh,L.tri,option[0]),two=oriented(mesh,R.tri,option[1]);
  if(!one||!two)continue;
  const distance=one.dist+two.dist;
  if(!best||distance<best.distance)best={one,two,distance};
 }
 return best;
}
function select(mesh,maxFlips=18){
 const cands=enumerate(mesh),selected=[],usedFaces=new Set(),usedPositions=new Set();
 for(const c of cands){
  if(selected.length>=maxFlips)break;
  if(usedFaces.has(c.L.face)||usedFaces.has(c.R.face))continue;
  // guard against disjoint candidate edits producing neighboring cracks
  const keys=c.quad.map(i=>poskey(mesh.positions[i]));
  if(keys.some(k=>usedPositions.has(k)))continue;
  const patch=prepare(mesh,c);if(!patch)continue;
  selected.push({...c,patch});usedFaces.add(c.L.face);usedFaces.add(c.R.face);
  for(const k of keys)usedPositions.add(k);
 }
 return {selected,candidateCount:cands.length};
}
function transfer(mesh,selections,images){
 const n=mesh.positions.length;
 const result={
  positions:mesh.positions.map(x=>x.slice()),normals:mesh.normals.map(x=>x.slice()),
  joints:mesh.joints.map(x=>x.slice()),weights:mesh.weights.map(x=>x.slice()),
  tangents:mesh.tangents.map(x=>x.slice()),uvs:mesh.uvs,indices:mesh.indices
 };
 const maps={color:Buffer.from(images.color.pix),normal:Buffer.from(images.normal.pix)};
 const w=images.color.w,h=images.color.h;
 const processed=new Uint8Array(w*h);
 let changedPixels=0,normalPixels=0,paintedFaces=0;
 for(const s of selections){
  const originals=[s.L,s.R];
  const newSets=[s.patch.one.ids,s.patch.two.ids];
  const sourceTriangles=originals.map(t=>t.tri.map(i=>({
   world:flat(mesh.positions[i]),
   uv:[mesh.uvs[i][0]*w,(1-mesh.uvs[i][1])*h],
   normal:mesh.normals[i],tangent:mesh.tangents[i]
  })));
  const newData=newSets.map((ids,k)=>{
   const slots=originals[k].tri;
   ids.forEach((sourceId,j)=>{
    const dest=slots[j];
    for(const attr of ['positions','normals','joints','weights','tangents'])
     result[attr][dest]=mesh[attr][sourceId].slice();
   });
   return {slots,uv:slots.map(i=>[mesh.uvs[i][0]*w,(1-mesh.uvs[i][1])*h]),
     world:ids.map(id=>flat(mesh.positions[id]))};
  });
  for(const dest of newData){
   const box={
    xmin:Math.max(0,Math.floor(Math.min(...dest.uv.map(p=>p[0])))),
    xmax:Math.min(w-1,Math.ceil(Math.max(...dest.uv.map(p=>p[0])))),
    ymin:Math.max(0,Math.floor(Math.min(...dest.uv.map(p=>p[1])))),
    ymax:Math.min(h-1,Math.ceil(Math.max(...dest.uv.map(p=>p[1]))))
   };
   let covered=0;
   for(let y=box.ymin;y<=box.ymax;y++)for(let x=box.xmin;x<=box.xmax;x++){
    const weights=bary2([x+.5,y+.5],...dest.uv);
    if(!weights||Math.min(...weights)<-1e-6)continue;
    const p=dest.world.reduce((a,v,i)=>add(a,mul(v,weights[i])),[0,0]);
    const index=y*w+x;if(processed[index])continue;
    let source=null,bary=null;
    for(const tri of sourceTriangles){
      const t=bary2(p,...tri.map(v=>v.world));
      if(t&&Math.min(...t)>-1e-5){source=tri;bary=t;break}
    }
    if(!source)continue;
    const originalUV=source.reduce((a,v,i)=>add(a,mul(v.uv,bary[i])),[0,0]);
    const oldC=sample(images.color,originalUV[0]-.5,originalUV[1]-.5);
    const oldN=sample(images.normal,originalUV[0]-.5,originalUV[1]-.5);
    const destIndex=index*4;
    for(let ch=0;ch<4;ch++)maps.color[destIndex+ch]=Math.round(oldC[ch]);
    // Geometry normal is recomputed downstream; preserve reference detailed
    // tangent-space map as locally sampled (avoid introducing fake shadows).
    for(let ch=0;ch<4;ch++)maps.normal[destIndex+ch]=Math.round(oldN[ch]);
    processed[index]=1;changedPixels++;normalPixels++;covered++;
   }
   if(covered)paintedFaces++;
  }
 }
 // Recompute geometric normals for all physical groups touched by flipped faces.
 const editedKeys=new Set(selections.flatMap(s=>s.quad.map(i=>poskey(mesh.positions[i]))));
 const accum=new Map();
 for(let f=0;f<mesh.indices.length;f+=3){
  const tri=mesh.indices.slice(f*3,f*3+3),P=tri.map(i=>result.positions[i]);
  const face=cross(vec(P[1],P[0]),vec(P[2],P[0]));
  for(const i of tri){const k=poskey(result.positions[i]);accum.set(k,add(accum.get(k)||[0,0,0],face));}
 }
 let updatedNormals=0;
 for(let i=0;i<n;i++){
  const k=poskey(result.positions[i]);if(!editedKeys.has(k))continue;
  const nn=unit(accum.get(k)||result.normals[i]),prev=unit(result.normals[i]);
  result.normals[i]=dot(nn,prev)<0?mul(nn,-1):nn;updatedNormals++;
  const t=result.tangents[i],normal=result.normals[i],v=t.slice(0,3);
  let tx=vec(v,mul(normal,dot(normal,v)));
  if(len(tx)<1e-7)tx=cross(normal,[0,0,1]);
  result.tangents[i]=[...unit(tx),t[3]>=0?1:-1];
 }
 return {result,maps,changedPixels,normalPixels,paintedFaces,updatedNormals};
}
function build(input,outDir,maxFlips=18){
 assert(fs.existsSync(input),'R36MF source GLB not found');assert(!fs.existsSync(outDir),'output directory already exists');
 const q=load(input),mi=q.g.meshes.findIndex(m=>(m.name||'').includes('R36KP_CONTINUOUS_SKIN'));
 assert(mi>=0,'integrated body not found');
 const primitive=q.g.meshes[mi].primitives[0],body=extract(q,mi,0);
 assert(body.indices.length===3396&&q.g.skins.some(s=>s.joints.length===63),'budget violated');
 let rest=0;q.g.meshes.forEach((mesh,i)=>{if(i!==mi)for(const p of mesh.primitives)rest+=q.g.accessors[p.indices].count/3});
 assert(rest===968,'head/hair triangles violated');
 assert(primitive.attributes.TANGENT!=null,'TANGENT required');
 body.tangents=values(q,primitive.attributes.TANGENT);
 const material=q.g.materials[primitive.material];
 const color=embed(q,material.pbrMetallicRoughness.baseColorTexture.index);
 const normal=embed(q,material.normalTexture.index);
 assert(color.w===2048&&color.h===2048&&normal.w===2048&&normal.h===2048,'expected 2048 atlas');
 const selection=select(body,maxFlips);
 assert(selection.selected.length>=2,'no safe actual topology flips available: '+selection.selected.length+' candidates '+selection.candidateCount);
 const baked=transfer(body,selection.selected,{color,normal});
 assert(baked.changedPixels>300,'not enough reprojected image pixels');
 fs.mkdirSync(outDir,{recursive:true});
 const b=new Builder(q),p=b.g.meshes[mi].primitives[0];
 for(const [name,type] of [['positions','POSITION'],['normals','NORMAL'],['joints','JOINTS_0'],['weights','WEIGHTS_0'],['tangents','TANGENT']]){
  const prev=q.g.accessors[primitive.attributes[type]];
  if(type==='JOINTS_0'){p.attributes[type]=b.addAccessor(baked.result[name],'VEC4',5123,34962);}
  else p.attributes[type]=b.addAccessor(baked.result[name],type==='TANGENT'||type==='WEIGHTS_0'?'VEC4':'VEC3',5126,34962);
 }
 const files={};
 for(const [kind,bytes] of Object.entries(baked.maps)){
  const png=encodePNG(bytes,2048,2048),name='R36MG_REMESH_'+kind.toUpperCase()+'_2048.png';
  fs.writeFileSync(path.join(outDir,name),png);
  const tid=b.addTexture('R36MG_REMESH_'+kind,png);
  if(kind==='color')b.g.materials[primitive.material].pbrMetallicRoughness.baseColorTexture.index=tid;
  else b.g.materials[primitive.material].normalTexture.index=tid;
  files[kind]={file:name,bytes:png.length,sha256:sha(png)};
 }
 const model='R36MG_TOPOLOGY_2100_FULL.glb';
 b.g.asset.generator='R36MG physically reconnected independent UV triangles with source-image rebake';
 const saved=b.save(path.join(outDir,model));
 const report={version:'R36MG',source:path.basename(input),shaSource:q.sha,
  output:model,modelSHA256:saved.sha,modelBytes:saved.bytes,
  bodyTriangles:1132,faceHairTriangles:968,totalTriangles:2100,bones:63,
  physicalEdgeFlips:selection.selected.length,changedPhysicalTriangles:selection.selected.length*2,
  candidateCount:selection.candidateCount,originalUVTilesPreserved:true,
  imagePixelsReprojected:baked.changedPixels,modifiedNormalVertices:baked.updatedNormals,
  actualPhysicalTopologyChanged:true,textureMaps:files,
  flips:selection.selected.map(x=>({oldPhysicalEdge:x.edge,originalFaces:[x.L.face,x.R.face],
    oldQuality:x.oldQuality,newQuality:x.newQuality,score:x.improvement})),
  visualQA:'not run',S2EngineQA:'not run',
  caveat:'Quad flips on already independent triangle UV tiles. Image is rebaked from old mapped surface, not directly new photographic source.'};
 fs.writeFileSync(path.join(outDir,'R36MG_TOPOLOGY.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({flips:report.physicalEdgeFlips,candidates:report.candidateCount,triangles:report.changedPhysicalTriangles,
  pixels:report.imagePixelsReprojected,bytes:saved.bytes}));
 return report;
}
if(require.main===module)try{
 assert(process.argv.length>=4&&process.argv.length<=5,'usage: node build_r36mg.cjs input.glb output_dir [max_flips]');
 build(process.argv[2],process.argv[3],Number(process.argv[4]||18));
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={build,enumerate,select,transfer};
