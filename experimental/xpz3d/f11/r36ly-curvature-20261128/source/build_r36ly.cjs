'use strict';
/**
 * R36LY: actual geometric curvature pass over R36LX texture-segmented body.
 * Reuses 2,100 triangles, original UV images and 63-bone skinning.
 * Does not treat photographic shading as measured depth.
 * Node.js 22; built in GitHub Actions from existing R36LX compact GLB.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder,values}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const ensure=(x,msg)=>{if(!x)throw Error(msg)};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
const gauss=(x,c,s)=>Math.exp(-.5*((x-c)/s)**2);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const norm=a=>{const l=Math.hypot(...a);return l<1e-12?[0,0,1]:a.map(x=>x/l)};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const key=p=>p.map(v=>Math.round(v*100000)).join('/');
function envelope(p){
 const [x,y,z]=p;
 const front=smooth((-0.025-y)/.055);
 const side=smooth((.094-Math.abs(x))/.028);
 const lower=smooth((z-.749)/.055);
 const upper=smooth((.980-z)/.060);
 return front*side*lower*upper;
}
function sculpt(p,scale){
 const [x,,z]=p,e=envelope(p);
 if(e<1e-6)return [0,0,0];
 // Broad physical surface transitions, NOT a silhouette of the photograph.
 // Narrowed channel surrounded by two rounded ridges, continuous with
 // adjoining body surfaces. Keep displacement less than 0.007 model units.
 const bend=.003*Math.sin((z-.790)*15.3);
 const off=x-bend,abs=Math.abs(off);
 const long=gauss(z,.860,.072);
 const central=gauss(off,0,.012)*long;
 const paired=gauss(abs,.026,.014)*gauss(z,.861,.068);
 const peripheral=gauss(abs,.061,.022)*gauss(z,.846,.076);
 const upper=gauss(off,0,.039)*gauss(z,.935,.036);
 const dy=e*scale*(.0048*central-.0036*paired-.0016*peripheral+.00095*upper);
 // No x/z movement: keeps source-image coordinates and seam topology fixed.
 return [0,clamp(dy,-.0065,.0065),0];
}
function triangleStats(before,after,indices){
 let minDot=1,minAreaRatio=Infinity,degenerate=0;
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i],b=indices[i+1],c=indices[i+2];
  const u=cross(sub(before[b],before[a]),sub(before[c],before[a]));
  const v=cross(sub(after[b],after[a]),sub(after[c],after[a]));
  const oldA=Math.hypot(...u),newA=Math.hypot(...v);
  if(oldA<1e-10){degenerate++;continue;}
  minDot=Math.min(minDot,dot(u,v)/(oldA*Math.max(1e-12,newA)));
  minAreaRatio=Math.min(minAreaRatio,newA/oldA);
 }
 return {minFaceNormalDot:minDot,minAreaRatio,preExistingDegenerateTriangles:degenerate};
}
function retarget(source,scale){
 const {positions,normals,indices,uvs}=source;
 const groups=new Map();positions.forEach((p,i)=>{
  const k=key(p);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);
 });
 const displaced=positions.map(p=>p.slice()),shift=new Float64Array(positions.length);
 let changedPhysical=0,changedUVVertices=0,maxDisplacement=0,minDisplacement=0;
 for(const ids of groups.values()){
  const p=ids.reduce((s,i)=>s.map((v,j)=>v+positions[i][j]/ids.length),[0,0,0]);
  const d=sculpt(p,scale),amount=Math.hypot(...d);
  if(amount<1e-8)continue;
  changedPhysical++;
  maxDisplacement=Math.max(maxDisplacement,amount);
  minDisplacement=Math.min(minDisplacement,d[1]);
  const newP=p.map((v,i)=>v+d[i]);
  for(const i of ids){
   displaced[i]=newP.slice();shift[i]=amount;changedUVVertices++;
  }
 }
 // Hard failure rather than silently creating a nominal "new" version.
 ensure(changedPhysical>=30,'insufficient uniquely moved surface positions '+changedPhysical);
 ensure(changedUVVertices>=80,'insufficient affected UV-split vertices '+changedUVVertices);
 ensure(maxDisplacement<.007,'sculpt escaped safe geometry envelope');
 const quality=triangleStats(positions,displaced,indices);
 ensure(quality.minFaceNormalDot>.62,'inverted or severely folded triangle '+quality.minFaceNormalDot);
 ensure(quality.minAreaRatio>.48,'collapsed triangle '+quality.minAreaRatio);
 // Area-weighted geometric normals shared across UV seam duplicates.
 // Original normals remain unchanged outside the local continuous transition.
 const accum=new Map();
 for(let i=0;i<indices.length;i+=3){
  const tri=indices.slice(i,i+3),a=displaced[tri[0]],b=displaced[tri[1]],c=displaced[tri[2]];
  const fac=cross(sub(b,a),sub(c,a));
  for(const id of tri){
   const k=key(positions[id]),old=accum.get(k)||[0,0,0];
   accum.set(k,old.map((v,j)=>v+fac[j]));
  }
 }
 const newNormals=normals.map(v=>v.slice());
 let recalculated=0,smallestNormalAgreement=1;
 for(const ids of groups.values()){
  const k=key(positions[ids[0]]),p=positions[ids[0]],weight=envelope(p);
  if(weight<=1e-5)continue;
  const old=norm(ids.reduce((s,i)=>s.map((v,j)=>v+normals[i][j]/ids.length),[0,0,0]));
  let target=norm(accum.get(k)||old);
  if(dot(target,old)<0)target=target.map(x=>-x);
  smallestNormalAgreement=Math.min(smallestNormalAgreement,dot(target,old));
  const a=clamp(.67*weight);
  const newN=norm(old.map((v,j)=>v*(1-a)+target[j]*a));
  for(const id of ids){newNormals[id]=newN.slice();recalculated++;}
 }
 // Retarget existing tangent directions to the new surface normal; retain
 // original handedness to keep glTF normal-texture orientation stable.
 const oldT=source.tangents;
 let newT=null;
 if(oldT){
  newT=oldT.map((t,i)=>{
   const n=newNormals[i],base=t.slice(0,3);
   let tg=sub(base,n.map(v=>dot(base,n)*v));
   if(Math.hypot(...tg)<1e-9){
    const helper=Math.abs(n[0])<.85?[1,0,0]:[0,1,0];
    tg=cross(helper,n);
   }
   return [...norm(tg),t[3]>=0?1:-1];
  });
 }
 return {positions:displaced,normals:newNormals,tangents:newT,
  stats:{physicalVertexGroups:groups.size,movedPhysicalVertexGroups:changedPhysical,
   movedUVSplitVertices:changedUVVertices,maxVertexDisplacement:maxDisplacement,
   minSignedYDisplacement:minDisplacement,normalUpdatedVertices:recalculated,
   smallestNormalAgreement,retargetedTangents:!!newT,
   ...quality}};
}
function build(input,outDir,variant){
 ensure(['flow','guarded'].includes(variant),'variant flow or guarded required');
 ensure(fs.existsSync(input),'source R36LX GLB not found');
 ensure(!fs.existsSync(outDir),'output directory already exists');
 const q=load(input),mi=q.g.meshes.findIndex(x=>String(x.name).includes('R36KP_CONTINUOUS_SKIN'));
 ensure(mi>=0,'R36LX integrated body mesh not found');
 const prim=q.g.meshes[mi].primitives[0],data=extract(q,mi,0);
 ensure(data.indices.length===3396&&q.g.skins.some(s=>s.joints.length===63),'source 1132 body triangles or 63 bones missing');
 let others=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)for(const p of m.primitives)others+=q.g.accessors[p.indices].count/3;});
 ensure(others===968,'R36HW 968 head/hair triangles not preserved');
 data.tangents=prim.attributes.TANGENT!=null?values(q,prim.attributes.TANGENT):null;
 const scale=variant==='flow'?1:.55;
 const result=retarget(data,scale),b=new Builder(q),outPrim=b.g.meshes[mi].primitives[0];
 outPrim.attributes.POSITION=b.addAccessor(result.positions,'VEC3',5126,34962);
 outPrim.attributes.NORMAL=b.addAccessor(result.normals,'VEC3',5126,34962);
 if(result.tangents)outPrim.attributes.TANGENT=b.addAccessor(result.tangents,'VEC4',5126,34962);
 const newFile='R36LY_'+variant.toUpperCase()+'_2100_FULL.glb';
 fs.mkdirSync(outDir,{recursive:true});
 b.g.asset.generator='R36LY physical local curvature and shared-seam smooth normals from R36LX';
 b.g.extras={...(b.g.extras||{}),r36ly:{variant,sourceSHA256:q.sha,scale,geometry:true}};
 const glb=b.save(path.join(outDir,newFile));
 const report={version:'R36LY',variant,input:path.basename(input),
  sourceSHA256:q.sha,model:newFile,modelSHA256:glb.sha,modelBytes:glb.bytes,
  totalTriangles:2100,bodyTriangles:1132,headHairTriangles:968,skinJoints:63,
  inputTexturesPreserved:true,meshUVsPreserved:true,skinWeightsPreserved:true,
  originalHeadHairPreserved:true,onlyIntegratedBodyAttributesReplaced:true,
  ...result.stats,visualQA:'not run',S2QA:'not run',
  limitation:'Shape is explicitly modelled from constrained continuous basis, not photo-calibrated physical depth'};
 const rp=path.join(outDir,'R36LY_'+variant.toUpperCase()+'.report.json');
 fs.writeFileSync(rp,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({variant,glb:glb.file,sha:glb.sha,bytes:glb.bytes,
  movedUnique:report.movedPhysicalVertexGroups,movedUV:report.movedUVSplitVertices,
  maxDisplacement:report.maxVertexDisplacement,minFaceDot:report.minFaceNormalDot,
  minAreaRatio:report.minAreaRatio}));
 return report;
}
if(require.main===module)try{
 const args=process.argv.slice(2);
 ensure(args.length===3,'usage: node build_r36ly.cjs INPUT_COMPACT.glb OUTPUT_DIR flow|guarded');
 build(...args);
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={sculpt,envelope,triangleStats,retarget,build};
