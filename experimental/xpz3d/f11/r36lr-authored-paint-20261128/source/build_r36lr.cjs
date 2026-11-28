'use strict';
/**
 * R36LR full-character 2048 authored paint production.
 * Draws directed strokes onto inherited skin textures, without altering
 * face/hair primitives, shape, UVs, rig, or polygon count.
 * Builds from R36LQ BALANCED GLB using Node.js only.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const art=require('./paint_layers.cjs');
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const need=(a,s)=>{if(!a)throw Error(s)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function decodeEmbedded(src,textureId){
 const texture=src.g.textures[textureId],image=src.g.images[texture.source];
 need(image.mimeType==='image/png'&&image.bufferView!=null,'embedded RGBA png required');
 const v=src.g.bufferViews[image.bufferView],o=v.byteOffset||0;
 return decodePNG(src.bin.subarray(o,o+v.byteLength));
}
function paintPixels(mesh,maps,variant){
 const {w,h}=maps.color,indices=mesh.indices,pos=mesh.positions,uv=mesh.uvs;
 need(w===2048&&h===2048,'expected 2048 maps');
 const color=Buffer.from(maps.color.pix),normal=Buffer.from(maps.normal.pix),orm=Buffer.from(maps.orm.pix);
 const srcColor=maps.color.pix,srcNormal=maps.normal.pix,srcORM=maps.orm.pix;
 const layer={volume:0,shadow:0,highlight:0,warm:0,detail:0};
 const visited=new Uint8Array(w*h),type=variant==='art'?1:.65;
 let colored=0,normalEdited=0,roughEdited=0,maxDelta=0,meanDelta=0;
 let strokeCount=0,skippedFaces=0;const scratch=Buffer.alloc(w*h*4);
 for(let f=0;f<indices.length;f+=3){
   const ids=indices.slice(f,f+3),P=ids.map(i=>pos[i]),U=ids.map(i=>[uv[i][0]*w,(1-uv[i][1])*h]);
   const xs=U.map(x=>x[0]),ys=U.map(x=>x[1]),loX=Math.max(0,Math.floor(Math.min(...xs)-1)),hiX=Math.min(w-1,Math.ceil(Math.max(...xs)+1));
   const loY=Math.max(0,Math.floor(Math.min(...ys)-1)),hiY=Math.min(h-1,Math.ceil(Math.max(...ys)+1));
   const [a,b,c]=U,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
   if(Math.abs(den)<1e-7){skippedFaces++;continue}
   // Every pixel is painted at its real interpolated 3D position, not by triangle ID.
   for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
     const xx=x+.5,yy=y+.5;
     const u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;
     const v=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;
     const t=1-u-v;if(Math.min(u,v,t)<0)continue;
     const ix=y*w+x;if(visited[ix])continue;
     visited[ix]=1;
     const p=[0,1,2].map(k=>P[0][k]*u+P[1][k]*v+P[2][k]*t);
     const paint=art.paint(p,{strength:type,detail:variant==='art'?1:.65});
     if(!paint.strokeCount&&!paint.masks.shape)continue;
     const i=ix*4,mask=art.frontGate(p[1],p[2]);
     if(mask<.001)continue;
     strokeCount+=paint.strokeCount;
     const mt=paint.masks;
     for(const k of ['shadow','highlight','warm','detail'])if(mt[k]>.012)layer[k]++;
     if(mt.shape>.012)layer.volume++;
     let changed=false;
     for(let channel=0;channel<3;channel++){
       const old=srcColor[i+channel],n=clamp(Math.round(old+paint.color[channel]),0,255);
       color[i+channel]=n;const delta=Math.abs(n-old);meanDelta+=delta;maxDelta=Math.max(maxDelta,delta);if(delta)changed=true;
     }
     if(changed)colored++;
     // Very low-amplitude sculpted relief in tangent texture, retaining the
     // donor high-poly bake. Do not replace existing baked normals.
     const gx=paint.gradient[0],gz=paint.gradient[1],a=variant==='art'?.28:.17;
     const nx=(srcNormal[i]/127.5)-1,ny=(srcNormal[i+1]/127.5)-1;
     let tx=clamp(nx-a*gx,-.91,.91),ty=clamp(ny-a*gz,-.91,.91);
     const len=Math.hypot(tx,ty);if(len>.91){tx*=.91/len;ty*=.91/len}
     normal[i]=Math.round((tx*.5+.5)*255);
     normal[i+1]=Math.round((ty*.5+.5)*255);
     normal[i+2]=Math.round((Math.sqrt(1-tx*tx-ty*ty)*.5+.5)*255);
     if(normal[i]!==srcNormal[i]||normal[i+1]!==srcNormal[i+1]||normal[i+2]!==srcNormal[i+2])normalEdited++;
     // Correct glTF ORM: G = roughness, R = occlusion, B = metallic.
     const oldR=srcORM[i+1],newR=clamp(Math.round(oldR+paint.roughnessShift*type),150,245);
     orm[i+1]=newR;if(oldR!==newR)roughEdited++;
   }
 }
 need(colored>20000,'No meaningful authored painting: '+colored);
 return {color,normal,orm,metrics:{version:'R36LR',variant,paintedPixels:colored,normalEditedPixels:normalEdited,roughnessEditedPixels:roughEdited,
   meanAbsoluteColorChangeRGB8:meanDelta/(Math.max(1,colored)*3),maxColorDeltaRGB8:maxDelta,
   artStrokeHits:strokeCount,layerCoverage:layer,sourceTriangleCount:indices.length/3,degenerateUVFaces:skippedFaces}};
}
function build(input,outDir,variant='art'){
 need(['art','subtle'].includes(variant),'art or subtle variant');
 need(fs.existsSync(input),'source GLB missing');
 need(!fs.existsSync(outDir),'cannot overwrite existing folder');
 const q=load(input),mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 need(mi>=0,'continuous body primitive absent');
 const body=extract(q,mi,0),primitive=q.g.meshes[mi].primitives[0];
 need(body.indices.length===3396,'expected 1132 body triangles');
 need(q.g.skins.some(s=>s.joints.length===63),'original rig not available');
 let otherTris=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)m.primitives.forEach(p=>{otherTris+=q.g.accessors[p.indices].count/3})});
 need(otherTris===968,'R36HW head and hair must stay unchanged');
 const mat=q.g.materials[primitive.material];
 const sourceMaps={
   color:decodeEmbedded(q,mat.pbrMetallicRoughness.baseColorTexture.index),
   normal:decodeEmbedded(q,mat.normalTexture.index),
   orm:decodeEmbedded(q,mat.pbrMetallicRoughness.metallicRoughnessTexture.index)
 };
 const result=paintPixels(body,sourceMaps,variant),builder=new Builder(q),dest=builder.g,dmat=dest.materials[primitive.material];
 const stem='R36LR_'+variant.toUpperCase()+'_2100_FULL';
 const outputMaps={};
 fs.mkdirSync(outDir,{recursive:true});
 for(const name of ['color','normal','orm']){
   const png=encodePNG(result[name],2048,2048),file=stem+'_'+name.toUpperCase()+'_2048.png';
   fs.writeFileSync(path.join(outDir,file),png);
   outputMaps[name]={file,bytes:png.length,sha256:sha(png)};
 }
 const tCol=builder.addTexture(stem+'_PAINT_COLOR',fs.readFileSync(path.join(outDir,outputMaps.color.file)));
 const tNor=builder.addTexture(stem+'_PAINT_NORMAL',fs.readFileSync(path.join(outDir,outputMaps.normal.file)));
 const tORM=builder.addTexture(stem+'_PAINT_ORM',fs.readFileSync(path.join(outDir,outputMaps.orm.file)));
 dmat.pbrMetallicRoughness.baseColorTexture={...dmat.pbrMetallicRoughness.baseColorTexture,index:tCol};
 dmat.pbrMetallicRoughness.metallicRoughnessTexture={...dmat.pbrMetallicRoughness.metallicRoughnessTexture,index:tORM};
 dmat.normalTexture={...dmat.normalTexture,index:tNor};
 if(dmat.occlusionTexture)dmat.occlusionTexture={...dmat.occlusionTexture,index:tORM};
 dest.asset.generator='R36LR hand-authored directional body art layers / original 2100 triangle mesh';
 dest.extras={...(dest.extras||{}),r36lr:{variant,sourceSHA256:q.sha,
   artStyle:'directed contour/brush strokes plus source skin palette and high-poly relief',
   sourceRigPreserved:63,sourceMeshTrianglesPreserved:2100,originalHeadHairPreserved:true,
   metrics:result.metrics,maps:outputMaps}};
 const glb=builder.save(path.join(outDir,stem+'.glb'));
 const report={version:'R36LR',variant,input:path.basename(input),inputSHA256:q.sha,
  glb:path.basename(glb.file),glbBytes:glb.bytes,glbSHA256:glb.sha,
  wholeTriangleCount:2100,bodyTriangles:1132,headHairTriangles:968,joints:63,
  maps:outputMaps,painting:result.metrics,rendererQA:'not run',S2EngineQA:'not run'};
 fs.writeFileSync(path.join(outDir,stem+'.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({glb:glb.file,size:glb.bytes,painted:result.metrics.paintedPixels,
   normalChanged:result.metrics.normalEditedPixels,colorDelta:result.metrics.meanAbsoluteColorChangeRGB8}));
 return report;
}
if(require.main===module){
 try{const [input,outDir,variant='art']=process.argv.slice(2);need(input&&outDir,'usage: node build_r36lr.cjs input.glb outputDir [art|subtle]');build(input,outDir,variant)}
 catch(e){console.error(e.stack||e);process.exitCode=1}
}
module.exports={build,paintPixels};
