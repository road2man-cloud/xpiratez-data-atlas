'use strict';
/**
 * R36ME existing-triangle spatial redistribution towards actual annotated
 * contour curves. Not a claim of new triangles or full topology rebuild.
 * Protects 2100 index budget, skeleton/weights and exact UV coordinates.
 */
const fs=require('fs'),path=require('path');
const {load,extract,values,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {shapeStats}=require('../../r36mc-landmark-sculpt-20261128/source/build_r36mc.cjs');
const reference=require('../../r36mc-landmark-sculpt-20261128/source/landmark_hypothesis.json');
const assert=(v,s)=>{if(!v)throw Error(s)};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]];
const length=x=>Math.hypot(...x);
const unit=x=>{const n=length(x);return n?mul(x,1/n):[0,0,1]};
const key=p=>p.map(x=>Math.round(x*100000)).join(':');
const r=reference.mapping.sourceRect,t=reference.mapping.targetBindRegion;
const curves=reference.features.map(f=>({...f,points:f.points.map(p=>[
 t.xMin+(p[0]-r.left)/(r.right-r.left)*(t.xMax-t.xMin),
 t.zTop-(p[1]-r.top)/(r.bottom-r.top)*(t.zTop-t.zBottom)
])}));
function nearest(p) {
 let best=null;
 for(const f of curves){
  for(let i=1;i<f.points.length;i++){
   const a=f.points[i-1],b=f.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
   const ratio=clamp(((p[0]-a[0])*dx+(p[2]-a[1])*dz)/Math.max(1e-10,dx*dx+dz*dz));
   const x=a[0]+dx*ratio,z=a[1]+dz*ratio,d=Math.hypot(p[0]-x,p[2]-z);
   if(!best||d<best.distance)best={distance:d,point:[x,z],feature:f.id,width:f.width||.014};
  }
 }
 return best;
}
function mask(p){
 const [x,y,z]=p;
 return smooth((-.025-y)/.06)*smooth((.095-Math.abs(x))/.031)*
   smooth((z-.744)/.039)*smooth((.978-z)/.041);
}
function assign(before,groups,power){
 const points=before.map(p=>p.slice()),changed=new Set(),features=new Set();
 let maxMove=0,groupsMoved=0,beforeDistance=0,afterDistance=0;
 for(const ids of groups.values()){
  const p=ids.reduce((s,i)=>add(s,mul(before[i],1/ids.length)),[0,0,0]),g=mask(p);
  if(g<.005)continue;
  const near=nearest(p),fall=Math.exp(-.5*(near.distance/.030)**2);
  const factor=power*g*fall;
  const displacement=[(near.point[0]-p[0])*factor,0,(near.point[1]-p[2])*factor];
  const d=length(displacement);
  if(d<1e-7)continue;
  groupsMoved++;features.add(near.feature);maxMove=Math.max(maxMove,d);
  beforeDistance+=near.distance;afterDistance+=Math.hypot(p[0]+displacement[0]-near.point[0],p[2]+displacement[2]-near.point[1]);
  for(const i of ids){points[i]=add(p,displacement);changed.add(i)}
 }
 return {points,changed,stats:{groupsMoved,movedVertices:changed.size,maxTangentialMove:maxMove,
  featureCurvesUsed:features.size,meanOldContourDistance:beforeDistance/Math.max(1,groupsMoved),
  meanNewContourDistance:afterDistance/Math.max(1,groupsMoved)}};
}
function build(sourceFile,outDir,mode){
 assert(['dense','guarded'].includes(mode),'mode dense|guarded');
 assert(fs.existsSync(sourceFile),'input source missing');
 assert(!fs.existsSync(outDir),'output exists');
 const q=load(sourceFile),mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 assert(mi>=0,'body not found');
 const prim=q.g.meshes[mi].primitives[0],mesh=extract(q,mi,0);
 assert(mesh.indices.length===3396&&q.g.skins.some(s=>s.joints.length===63),'original triangle/skin count changed');
 let rest=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)for(const p of m.primitives)rest+=q.g.accessors[p.indices].count/3});
 assert(rest===968,'face/hair triangle count changed');
 const groups=new Map();mesh.positions.forEach((p,i)=>{const k=key(p);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i)});
 let result=null,quality=null,power=mode==='dense'?.42:.24,retries=0;
 for(let pass=0;pass<7;pass++){
  result=assign(mesh.positions,groups,power);
  quality=shapeStats(mesh.positions,result.points,mesh.indices);
  if(quality.folds===0&&quality.worstFaceDot>.80&&quality.minimumAreaRatio>.68&&result.stats.groupsMoved>=20)break;
  power*=.72;retries++;
 }
 assert(quality.folds===0&&quality.worstFaceDot>.80&&quality.minimumAreaRatio>.68,'no safe spatial redistribution candidate');
 assert(result.stats.movedVertices>=70,'too little mesh spatial change');
 const normalsAcc=new Map();
 for(let f=0;f<mesh.indices.length;f+=3){
  const ids=mesh.indices.slice(f,f+3),a=result.points[ids[0]],b=result.points[ids[1]],c=result.points[ids[2]];
  const n=cross(sub(b,a),sub(c,a));
  for(const id of ids){const k=key(mesh.positions[id]);normalsAcc.set(k,add(normalsAcc.get(k)||[0,0,0],n))}
 }
 const normals=mesh.normals.map((n,i)=>{
  const newN=unit(normalsAcc.get(key(mesh.positions[i]))||n),old=unit(n);
  const direction=dot(old,newN)<0?mul(newN,-1):newN;
  return unit(add(mul(old,.12),mul(direction,.88)));
 });
 const tangents=prim.attributes.TANGENT!=null?values(q,prim.attributes.TANGENT):null;
 const newT=tangents?.map((t,i)=>{
  const n=normals[i],v=t.slice(0,3),ortho=sub(v,mul(n,dot(n,v)));
  return [...unit(length(ortho)>1e-8?ortho:cross(n,[0,1,0])),t[3]>=0?1:-1];
 });
 const builder=new Builder(q),target=builder.g.meshes[mi].primitives[0];
 target.attributes.POSITION=builder.addAccessor(result.points,'VEC3',5126,34962);
 target.attributes.NORMAL=builder.addAccessor(normals,'VEC3',5126,34962);
 if(newT)target.attributes.TANGENT=builder.addAccessor(newT,'VEC4',5126,34962);
 builder.g.asset.generator='R36ME reallocated existing physical vertices toward annotated structural contours';
 fs.mkdirSync(outDir,{recursive:true});
 const file='R36ME_'+mode.toUpperCase()+'_2100_FULL.glb',saved=builder.save(path.join(outDir,file));
 const report={version:'R36ME',source:path.basename(sourceFile),sourceSHA256:q.sha,
  mode,power,retries,output:file,outputBytes:saved.bytes,outputSHA256:saved.sha,
  bodyTriangles:1132,headHairTriangles:968,triangles:2100,joints:63,
  imageUVsPreserved:true,skinWeightsPreserved:true,triangleConnectivityPreserved:true,
  trueRetopology:false,physicalVertexRedistribution:true,...result.stats,
  shapeStats:quality,visualQA:'not run',S2EngineQA:'not run',
  caveat:'Triangle positions redistributed; triangle connectivity and count unchanged. Single photo remains 2D evidence.'};
 fs.writeFileSync(path.join(outDir,'R36ME_'+mode.toUpperCase()+'.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({mode,power,moved:report.movedVertices,groups:report.groupsMoved,faceArea:quality.minimumAreaRatio}));
 return report;
}
if(require.main===module)try{assert(process.argv.length===5,'node build_r36me.cjs SOURCE.glb OUT_DIR dense|guarded');build(...process.argv.slice(2));}
catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={build,nearest,assign};
