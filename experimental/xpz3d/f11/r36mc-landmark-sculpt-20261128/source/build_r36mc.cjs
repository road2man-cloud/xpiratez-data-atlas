'use strict';
/**
 * R36MC: reference-contour guided mesh sculpt, NOT an image shadow-paint pass.
 * Preserve 2100 triangle budget and 63-bone skin. Relocate existing body
 * vertices in X,Y,Z with matching UV-seam vertices welded in bind space.
 * The photo gives 2D contours, not metric physical depth. All parameters
 * live in source/landmark_hypothesis.json and can be rejected or edited.
 *
 * node build_r36mc.cjs INPUT_R36MB.glb OUT_DIR sculpt|guarded
 */
const fs=require('fs'),path=require('path');
const {load,extract,Builder,values}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const cfg=require('./landmark_hypothesis.json');
const fail=(c,msg)=>{if(!c)throw Error(msg)};
const clip=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=t=>{t=clip(t);return t*t*(3-2*t)};
const key=p=>p.map(x=>Math.round(x*100000)).join(':');
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const mul=(a,k)=>a.map(x=>x*k);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a);
const unit=a=>{let n=length(a);return n>1e-10?mul(a,1/n):[0,0,1]};
function mapRef(ref){
 const p=cfg.mapping,rect=p.sourceRect,b=p.targetBindRegion;
 return [b.xMin+(ref[0]-rect.left)/(rect.right-rect.left)*(b.xMax-b.xMin),
         b.zTop-(ref[1]-rect.top)/(rect.bottom-rect.top)*(b.zTop-b.zBottom)];
}
function splinePoint(points,t){
 const n=points.length-1,pos=clip(t)*n,i=Math.min(n-1,Math.floor(pos)),u=pos-i;
 const a=points[Math.max(0,i-1)],b=points[i],c=points[Math.min(n,i+1)],d=points[Math.min(n,i+2)];
 return [0,1].map(k=>.5*((2*b[k])+(-a[k]+c[k])*u+(2*a[k]-5*b[k]+4*c[k]-d[k])*u*u+(-a[k]+3*b[k]-3*c[k]+d[k])*u*u*u));
}
const features=cfg.features.map(f=>({...f,curve:f.points.map(mapRef)}));
function nearestCurve(x,z,curve){
 let best={distance:Infinity,at:0,nearest:null};
 for(let i=0;i<36;i++){
  const p=splinePoint(curve,i/35),d=Math.hypot(p[0]-x,p[1]-z);
  if(d<best.distance)best={distance:d,at:i/35,nearest:p};
 }
 return best;
}
function sculpt(p,strength){
 const [x,y,z]=p,b=cfg.mapping.targetBindRegion;
 const inX=smooth((x-b.xMin)/.023)*smooth((b.xMax-x)/.023);
 const inZ=smooth((z-b.zBottom)/.025)*smooth((b.zTop-z)/.025);
 const front=smooth((cfg.mapping.frontYMax-y)/.050);
 const mask=inX*inZ*front;
 if(mask<.00002)return [0,0,0];
 let dy=0,tx=0,tz=0,active=0;
 for(const f of features){
  const n=nearestCurve(x,z,f.curve),s=f.width||.013,fall=Math.exp(-.5*(n.distance/s)**2);
  const envelope=smooth(Math.min(n.at,1-n.at)*16),v=fall*envelope;
  if(v<1e-4)continue;
  const sign=f.kind==='recess'?1:-1;
  dy+=f.depth*v; // physically negative-Y face: positive Y is recess
  active++;
  if(f.kind==='raised_ridge'||f.kind==='transverse_ridge'){
    const vdir=sub([x,0,z],[n.nearest[0],0,n.nearest[1]]);
    const side=Math.max(-1,Math.min(1,vdir[0]/Math.max(.002,n.distance)));
    tx+=.0015*side*v;tz+=.00055*v*Math.sin(n.at*Math.PI*2);
  }
 }
 // Full strength still bounded: underlying model is a plausible *hypothesis*.
 // This is not calibrated photogrammetry.
 const applied=mask*strength;
 return [clip(tx*applied,-.003,.003),clip(dy*applied,-.016,.016),clip(tz*applied,-.002,.002)];
}
function shapeStats(before,after,indices){
 let worstDot=1,minimumArea=Infinity,changedFaces=0,folds=0;
 for(let i=0;i<indices.length;i+=3){
  const ids=indices.slice(i,i+3),A=ids.map(j=>before[j]),B=ids.map(j=>after[j]);
  const na=cross(sub(A[1],A[0]),sub(A[2],A[0]));
  const nb=cross(sub(B[1],B[0]),sub(B[2],B[0]));
  const a=length(na),b=length(nb);
  if(a<1e-9)continue;
  const angle=dot(na,nb)/(a*Math.max(b,1e-12));
  worstDot=Math.min(worstDot,angle);minimumArea=Math.min(minimumArea,b/a);
  if(angle<.65||b/a<.40)folds++;
  if(ids.some(j=>length(sub(before[j],after[j]))>1e-7))changedFaces++;
 }
 return {worstFaceDot:worstDot,minimumAreaRatio:minimumArea,changedFaces,folds};
}
function build(input,outDir,mode){
 fail(['sculpt','guarded'].includes(mode),'mode sculpt|guarded');
 fail(fs.existsSync(input),'missing source GLB');
 fail(!fs.existsSync(outDir),'output exists');
 const q=load(input),mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 fail(mi>=0,'body missing');
 const primitive=q.g.meshes[mi].primitives[0],mesh=extract(q,mi,0);
 fail(mesh.indices.length===3396&&q.g.skins.some(s=>s.joints.length===63),'budget or skin mismatch');
 let others=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)for(const p of m.primitives)others+=q.g.accessors[p.indices].count/3});
 fail(others===968,'head-hair triangles mismatch');
 const groups=new Map();
 mesh.positions.forEach((p,i)=>{const k=key(p);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i)});
 const before=mesh.positions,positions=before.map(p=>p.slice()),strength=mode==='sculpt'?1:.62;
 let movedGroups=0,movedUV=0,maxMove=0;
 for(const members of groups.values()){
  const p=members.reduce((a,i)=>add(a,mul(before[i],1/members.length)),[0,0,0]);
  const delta=sculpt(p,strength);
  if(length(delta)<1e-8)continue;
  movedGroups++;maxMove=Math.max(maxMove,length(delta));
  for(const i of members){positions[i]=add(p,delta);movedUV++}
 }
 fail(movedGroups>=30,'too few physical vertices');
 // Scale back local distortion without accidentally changing the 2,100 triangle budget.
 const safe=shapeStats(before,positions,mesh.indices);
 fail(safe.folds===0&&safe.worstFaceDot>.64&&safe.minimumAreaRatio>.42,'unsafe candidate geometry '+JSON.stringify(safe));
 // Recompute the physical normals with shared coordinates across UV seams.
 const accum=new Map();
 for(let fi=0;fi<mesh.indices.length;fi+=3){
  const ids=mesh.indices.slice(fi,fi+3),a=positions[ids[0]],b=positions[ids[1]],c=positions[ids[2]];
  const n=cross(sub(b,a),sub(c,a));
  for(const id of ids){const k=key(before[id]);accum.set(k,add(accum.get(k)||[0,0,0],n))}
 }
 const newNormals=mesh.normals.map((n,i)=>{
  const base=unit(n),a=unit(accum.get(key(before[i]))||n);
  const signed=dot(base,a)<0?mul(a,-1):a;
  return unit(add(mul(base,.12),mul(signed,.88)));
 });
 const originalTangents=primitive.attributes.TANGENT==null?null:values(q,primitive.attributes.TANGENT);
 const tangent=originalTangents?.map((t,i)=>{
  const n=newNormals[i],v=t.slice(0,3),orth=sub(v,mul(n,dot(v,n)));
  return [...unit(length(orth)>1e-8?orth:cross(n,[1,0,0])),t[3]>=0?1:-1]
 });
 const builder=new Builder(q),target=builder.g.meshes[mi].primitives[0];
 target.attributes.POSITION=builder.addAccessor(positions,'VEC3',5126,34962);
 target.attributes.NORMAL=builder.addAccessor(newNormals,'VEC3',5126,34962);
 if(tangent)target.attributes.TANGENT=builder.addAccessor(tangent,'VEC4',5126,34962);
 builder.g.asset.generator='R36MC landmark-guided asymmetric physical sculpture; reference depth is hypothetical';
 const output='R36MC_'+mode.toUpperCase()+'_2100_FULL.glb';
 fs.mkdirSync(outDir,{recursive:true});
 const saved=builder.save(path.join(outDir,output));
 // An independent, inspectable clay model: pure neutral material and normal map disabled.
 const clay=new Builder(q),clayBody=clay.g.meshes[mi].primitives[0];
 clayBody.attributes.POSITION=clay.addAccessor(positions,'VEC3',5126,34962);
 clayBody.attributes.NORMAL=clay.addAccessor(newNormals,'VEC3',5126,34962);
 if(tangent)clayBody.attributes.TANGENT=clay.addAccessor(tangent,'VEC4',5126,34962);
 const material=JSON.parse(JSON.stringify(clay.g.materials[clayBody.material]));
 material.name='R36MC_CLAY_NO_COLOR_NO_NORMAL_MAP';
 delete material.normalTexture;
 delete material.occlusionTexture;
 delete material.emissiveTexture;
 delete material.emissiveFactor;
 material.pbrMetallicRoughness={baseColorFactor:[.72,.72,.72,1],metallicFactor:0,roughnessFactor:.92};
 clayBody.material=clay.g.materials.length;clay.g.materials.push(material);
 const clayFile='R36MC_'+mode.toUpperCase()+'_CLAY_2100_FULL.glb';
 const claySaved=clay.save(path.join(outDir,clayFile));
 const result={version:'R36MC',mode,source:input.split('/').pop(),sourceSHA256:q.sha,
  triangles:2100,bodyTriangles:1132,headHairTriangles:968,bones:63,
  featureCount:features.length,topologyRetained:true,UVAndSkinRetained:true,
  physicalVertexGroups:groups.size,movedGroups,movedUV,maxMove,shapeStats:safe,
  model:output,modelSHA256:saved.sha,modelBytes:saved.bytes,
  clayModel:clayFile,claySHA256:claySaved.sha,clayBytes:claySaved.bytes,
  note:'This does not claim precise measured anatomy; 2D hand-set contour model hypothesis.',
  qualityApproved:false};
 fs.writeFileSync(path.join(outDir,'R36MC_'+mode.toUpperCase()+'.report.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({mode,changedFaces:safe.changedFaces,movedGroups,maxMove,clay:claySaved.bytes,model:saved.bytes}));
 return result;
}
if(require.main===module)try{fail(process.argv.length===5,'node build_r36mc.cjs INPUT.glb OUT_DIR sculpt|guarded');build(...process.argv.slice(2));}
catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={build,sculpt,shapeStats};
