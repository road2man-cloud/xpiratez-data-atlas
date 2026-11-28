'use strict';
/**
 * R36MB: transport source-image tangent-space normal details from R36LX onto
 * R36MA's physically sculpted surface, then rebake the UV-image seams.
 *
 * Two actual, topologically matching skinned GLBs are used:
 *  SOURCE R36LX (original image/old tangent frame)
 *  TARGET R36MA (updated geometry/tangent frame)
 *
 * This is image detail retargeting, NOT drawing synthetic diffuse shading.
 * node build_r36mb.cjs SOURCE_R36LX.glb TARGET_R36MA.glb OUTPUT_DIR [0.72]
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder,values}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const {triangleFrame,texToWorld,worldToTex,rebake}=require('../../r36ma-seam-rebake-20261128/source/build_r36ma.cjs');
const ensure=(v,s)=>{if(!v)throw Error(s)};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const length=p=>Math.hypot(...p);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=a=>{const l=length(a);return l>1e-9?a.map(x=>x/l):[0,0,1]};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function embedded(q,i){
 const tex=q.g.textures[i],im=q.g.images[tex.source];
 ensure(im.mimeType==='image/png'&&Number.isInteger(im.bufferView),'PNG material image required');
 const bv=q.g.bufferViews[im.bufferView],o=bv.byteOffset||0;
 return decodePNG(q.bin.subarray(o,o+bv.byteLength));
}
function getBody(q){
 const mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 ensure(mi>=0,'skinned continuous body mesh is missing');
 const p=q.g.meshes[mi].primitives[0],mesh=extract(q,mi,0);
 mesh.tangents=p.attributes.TANGENT!=null?values(q,p.attributes.TANGENT):null;
 ensure(mesh.tangents&&mesh.tangents.length===mesh.positions.length,'tangent frame must be present');
 ensure(mesh.indices.length===3396&&q.g.skins.some(s=>s.joints.length===63),'body/rig mismatch');
 let others=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)for(const item of m.primitives)others+=q.g.accessors[item.indices].count/3});
 ensure(others===968,'head/hair mesh triangle budget changed');
 return {mi,p,mesh};
}
function compareTopology(a,b){
 ensure(a.indices.length===b.indices.length&&a.positions.length===b.positions.length,'vertex/face count mismatch');
 let changedPositions=0,changedNormals=0,maxPositionDelta=0,maxTangentAngle=0;
 for(let i=0;i<a.indices.length;i++)ensure(a.indices[i]===b.indices[i],'triangle index mapping differs '+i);
 for(let i=0;i<a.positions.length;i++){
  ensure(length(sub(a.uvs[i],b.uvs[i]))<2e-6,'UV map differs '+i);
  ensure(a.joints[i].every((v,k)=>v===b.joints[i][k]),'bone indices differ '+i);
  ensure(length(sub(a.weights[i],b.weights[i]))<1e-5,'skin weights differ '+i);
  const d=length(sub(a.positions[i],b.positions[i]));
  if(d>1e-6)changedPositions++;
  if(length(sub(a.normals[i],b.normals[i]))>1e-5)changedNormals++;
  maxPositionDelta=Math.max(maxPositionDelta,d);
  const an=norm(a.tangents[i].slice(0,3)),bn=norm(b.tangents[i].slice(0,3));
  maxTangentAngle=Math.max(maxTangentAngle,Math.acos(clamp(dot(an,bn),-1,1)));
 }
 ensure(changedPositions>=80&&changedNormals>=200,'source and target are not different physically sculpted models');
 return {changedPositionVertices:changedPositions,changedNormalVertices:changedNormals,
  maxPositionDelta,maxTangentRotationDegrees:maxTangentAngle*180/Math.PI};
}
function transfer(oldMesh,newMesh,oldNormal,degree=.72){
 ensure(degree>0&&degree<=1,'transport strength must be 0..1');
 const w=oldNormal.w,h=oldNormal.h;
 ensure(w===2048&&h===2048,'expected 2048x2048 image');
 const dst=Buffer.from(oldNormal.pix),heat=Buffer.alloc(w*h*4),seen=new Uint8Array(w*h);
 let trianglesConsidered=0,trianglesWithPixels=0,activePixels=0,changedPixels=0;
 let rotationSum=0,maxRotationDeg=0,channelDelta=0,overlapPixels=0,skippedNearFlat=0;
 const positions=oldMesh.positions,indices=oldMesh.indices,uvs=oldMesh.uvs;
 for(let fi=0;fi<indices.length/3;fi++){
  const ids=indices.slice(fi*3,fi*3+3);
  const moved=ids.some(id=>length(sub(oldMesh.positions[id],newMesh.positions[id]))>1e-6||
                      length(sub(oldMesh.normals[id],newMesh.normals[id]))>1e-5||
                      length(sub(oldMesh.tangents[id].slice(0,3),newMesh.tangents[id].slice(0,3)))>1e-5);
  if(!moved)continue;
  trianglesConsidered++;
  const pts=ids.map(id=>[uvs[id][0]*w,(1-uvs[id][1])*h]);
  const den=(pts[1][1]-pts[2][1])*(pts[0][0]-pts[2][0])+
    (pts[2][0]-pts[1][0])*(pts[0][1]-pts[2][1]);
  if(Math.abs(den)<1e-8)continue;
  const x0=Math.max(0,Math.floor(Math.min(...pts.map(p=>p[0]))));
  const x1=Math.min(w-1,Math.ceil(Math.max(...pts.map(p=>p[0]))));
  const y0=Math.max(0,Math.floor(Math.min(...pts.map(p=>p[1]))));
  const y1=Math.min(h-1,Math.ceil(Math.max(...pts.map(p=>p[1]))));
  let triActive=0;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const xx=x+.5,yy=y+.5;
   const a=((pts[1][1]-pts[2][1])*(xx-pts[2][0])+(pts[2][0]-pts[1][0])*(yy-pts[2][1]))/den;
   const b=((pts[2][1]-pts[0][1])*(xx-pts[2][0])+(pts[0][0]-pts[2][0])*(yy-pts[2][1]))/den;
   const c=1-a-b;
   if(Math.min(a,b,c)<-1e-7)continue;
   const px=y*w+x;if(seen[px]){overlapPixels++;continue}
   seen[px]=1;
   const oldFrame=triangleFrame(oldMesh,ids,[a,b,c]);
   const newFrame=triangleFrame(newMesh,ids,[a,b,c]);
   const tangentAngle=Math.acos(clamp(dot(oldFrame.n,newFrame.n),-1,1));
   if(tangentAngle<1e-5){skippedNearFlat++;continue}
   const pixel=4*px,src=[oldNormal.pix[pixel],oldNormal.pix[pixel+1],oldNormal.pix[pixel+2]];
   const world=texToWorld(src,oldFrame);
   const inNew=worldToTex(world,newFrame);
   const oldVector=norm(src.map(v=>v/127.5-1));
   const mappedVector=norm(inNew.map(v=>v/127.5-1));
   // Retain part of original image's surface-relative microstructure while
   // preserving most of its original physical (bind-space) orientation.
   const result=norm(oldVector.map((v,k)=>v*(1-degree)+mappedVector[k]*degree));
   const encoded=result.map(v=>Math.round(clamp((v*.5+.5)*255,0,255)));
   const maxChange=38;
   let modified=false;
   for(let k=0;k<3;k++){
    const bounded=Math.round(clamp(encoded[k],src[k]-maxChange,src[k]+maxChange));
    if(bounded!==src[k])modified=true;
    channelDelta+=Math.abs(bounded-src[k]);dst[pixel+k]=bounded;
   }
   if(modified)changedPixels++;
   const deg=tangentAngle*180/Math.PI;
   const heatVal=Math.round(clamp(deg*18,0,255));
   heat[pixel]=heatVal;heat[pixel+1]=0;heat[pixel+2]=255-heatVal;heat[pixel+3]=255;
   rotationSum+=deg;maxRotationDeg=Math.max(maxRotationDeg,deg);
   activePixels++;triActive++;
  }
  if(triActive)trianglesWithPixels++;
 }
 ensure(trianglesWithPixels>=40&&activePixels>=5000,'too few image texels reoriented');
 ensure(changedPixels>1000,'image normal map unchanged');
 return {normal:dst,heat,stats:{trianglesConsidered,trianglesWithPixels,activePixels,
  changedPixels,skippedNearFlat,overlapPixels,meanSourceToTargetNormalRotationDegrees:rotationSum/Math.max(1,activePixels),
  maxSourceToTargetNormalRotationDegrees:maxRotationDeg,
  meanAbsoluteRGB8Change:channelDelta/(3*Math.max(1,activePixels)),
  strength:degree,orientationPreservation:'source image normal -> old TBN -> 3D -> new TBN'}};
}
function build(sourceFile,targetFile,outDir,strength=.72){
 for(const p of [sourceFile,targetFile])ensure(fs.existsSync(p),'input not found '+p);
 ensure(!fs.existsSync(outDir),'refusing overwrite');
 const source=load(sourceFile),target=load(targetFile);
 const a=getBody(source),b=getBody(target),diff=compareTopology(a.mesh,b.mesh);
 const oldMat=source.g.materials[a.p.material],newMat=target.g.materials[b.p.material];
 const oldN=embedded(source,oldMat.normalTexture.index);
 const targetC=embedded(target,newMat.pbrMetallicRoughness.baseColorTexture.index);
 const transferResult=transfer(a.mesh,b.mesh,oldN,strength);
 const updated=rebake(b.mesh,targetC,{w:oldN.w,h:oldN.h,pix:transferResult.normal},6);
 const builder=new Builder(target),materials=builder.g.materials[b.p.material],files={};
 fs.mkdirSync(outDir,{recursive:true});
 for(const [kind,pixels] of [['COLOR',updated.color],['NORMAL',updated.normal],
                            ['FRAME_ROTATION_HEAT',transferResult.heat]]){
  const png=encodePNG(pixels,2048,2048),file='R36MB_'+kind+'_2048.png';
  fs.writeFileSync(path.join(outDir,file),png);
  files[kind]={file,bytes:png.length,sha256:hash(png)};
  if(kind==='FRAME_ROTATION_HEAT')continue;
  const tex=builder.addTexture('R36MB_'+kind,png);
  if(kind==='COLOR')materials.pbrMetallicRoughness.baseColorTexture.index=tex;
  else materials.normalTexture.index=tex;
 }
 const glbFile='R36MB_FRAME_ALIGNED_2100_FULL.glb';
 builder.g.asset.generator='R36MB image normal texture transported across R36LX to R36MA geometric tangent frames';
 const output=builder.save(path.join(outDir,glbFile));
 const report={version:'R36MB',source:path.basename(sourceFile),sourceSHA256:source.sha,
  target:path.basename(targetFile),targetSHA256:target.sha,
  output:glbFile,outputSHA256:output.sha,outputBytes:output.bytes,
  triangles:2100,bodyTriangles:1132,headHairTriangles:968,joints:63,
  physicallySculptedGeometryPreserved:true,UVAndSkinWeightsPreserved:true,
  allImagePixelsFromExistingXpiratezAtlas:true,
  sourceVsTarget:diff,transport:transferResult.stats,seams:updated.metrics,
  images:files,visualQA:'not run',S2EngineQA:'not run',
  limitation:'Transport of image-space surface normals; no new source photograph or photo-measured geometric depth'};
 fs.writeFileSync(path.join(outDir,'R36MB_FRAME_ALIGNED.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({glb:glbFile,bytes:output.bytes,sha256:output.sha,
  frameReorientedPixels:transferResult.stats.changedPixels,
  seamEdges:updated.metrics.edgesRebaked,
  normalChangedAtSeams:updated.metrics.changedNormalPixels}));
 return report;
}
if(require.main===module)try{
 const args=process.argv.slice(2);
 ensure(args.length>=3&&args.length<=4,'usage: node build_r36mb.cjs R36LX.glb R36MA.glb OUTPUT_DIR [strength]');
 build(args[0],args[1],args[2],args[3]==null?.72:Number(args[3]));
}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={build,compareTopology,transfer};
