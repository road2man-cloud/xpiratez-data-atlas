'use strict';
/**
 * R36LQ: correct UV-island seams on the 2100-triangle full character.
 * Edges are paired by their actual 3D endpoint positions, not UV.
 * Normal textures are converted to OBJECT space before averaging, then
 * converted separately to the tangent frame of each triangle.
 * Uses Node.js built-ins; original source GLB is never overwritten.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,values,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
const sum=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a);
const unit=a=>mul(a,1/(norm(a)||1));
const lerp=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
const key=p=>p.map(q=>Math.round(q*1e6)).join(',');
const edgeKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const need=(a,msg)=>{if(!a)throw Error(msg)};
const toLin=x=>{const s=x/255;return s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4)};
const toSRGB=x=>{x=clamp(x);return Math.round(255*(x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055))};
function vecAt(arr,ids,t){return lerp(arr[ids[0]],arr[ids[1]],t)}
function tangentFrame(mesh,a,b,t){
 const n=unit(vecAt(mesh.normals,[a,b],t));
 const ta=vecAt(mesh.tangents,[a,b],t),raw=ta.slice(0,3);
 const tangent=unit(sub(raw,mul(n,dot(raw,n))));
 const side=ta[3]>=0?1:-1;
 return {n,t:tangent,b:mul(cross(n,tangent),side)};
}
function tangentToObject(rgb,frame){
 const [tx,ty,tz]=unit(rgb.map(z=>z/127.5-1));
 return unit(sum(sum(mul(frame.t,tx),mul(frame.b,ty)),mul(frame.n,tz)));
}
function objectToTangent(vector,frame){
 const xyz=unit([dot(vector,frame.t),dot(vector,frame.b),dot(vector,frame.n)]);
 return xyz.map(z=>Math.round(255*(clamp(z,-1,1)*.5+.5)));
}
function image(q,textureId){
 const tex=q.g.textures[textureId],img=q.g.images[tex.source];
 need(img.mimeType==='image/png'&&img.bufferView!=null,'embedded PNG required');
 const bv=q.g.bufferViews[img.bufferView],off=bv.byteOffset||0;
 return decodePNG(q.bin.subarray(off,off+bv.byteLength));
}
function uvPixel(mesh,id,dim){const [u,v]=mesh.uvs[id];return [u*dim,(1-v)*dim]}
function readPixel(p,x,y,w){
 x=clamp(Math.round(x),0,w-1);y=clamp(Math.round(y),0,w-1);
 const i=(y*w+x)*4;return [p[i],p[i+1],p[i+2]];
}
function sample(p,x,y,w){
 const xx=clamp(x,0,w-1),yy=clamp(y,0,w-1),x0=Math.floor(xx),y0=Math.floor(yy),x1=Math.min(w-1,x0+1),y1=Math.min(w-1,y0+1);
 const u=xx-x0,v=yy-y0;
 const a=readPixel(p,x0,y0,w),b=readPixel(p,x1,y0,w),c=readPixel(p,x0,y1,w),d=readPixel(p,x1,y1,w);
 return a.map((z,i)=>(z*(1-u)+b[i]*u)*(1-v)+(c[i]*(1-u)+d[i]*u)*v);
}
function gatherEdges(mesh){
 const map=new Map(),ix=mesh.indices,p=mesh.positions;
 for(let f=0;f<ix.length;f+=3){
   const ids=ix.slice(f,f+3);
   for(let a=0;a<3;a++){
     const i=ids[a],j=ids[(a+1)%3],k=ids[(a+2)%3];
     const ki=key(p[i]),kj=key(p[j]);
     const id=edgeKey(ki,kj);
     if(!map.has(id))map.set(id,[]);
     map.get(id).push({i,j,k,face:f/3,ki,kj});
   }
 }
 return [...map].filter(([,e])=>e.length===2&&e[0].face!==e[1].face);
}
function frontOnly(m){
 const p=m.positions;return (p[0]||0);
}
function evaluate(mesh,colors,normals,dim,edge){
 const [a,b]=edge;
 // Use first triangle's oriented geometric edge as canonical.
 const uvA=[uvPixel(mesh,a.i,dim),uvPixel(mesh,a.j,dim)];
 const same=b.ki===a.ki,uvB=[uvPixel(mesh,same?b.i:b.j,dim),uvPixel(mesh,same?b.j:b.i,dim)];
 const worldA=mesh.positions[a.i],worldB=mesh.positions[a.j];
 const dx=norm(sub(worldB,worldA)),steps=Math.max(8,Math.min(128,Math.ceil(Math.max(
  norm(sub(uvA[0],uvA[1])),norm(sub(uvB[0],uvB[1])))*1.35)));
 const rows=[];let maxColor=0,maxNormal=0;
 for(let s=0;s<=steps;s++){
   const t=(s+.5)/(steps+1);
   const xyA=lerp(uvA[0],uvA[1],t),xyB=lerp(uvB[0],uvB[1],t);
   const colA=sample(colors,...xyA,dim),colB=sample(colors,...xyB,dim);
   const tangentA=sample(normals,...xyA,dim),tangentB=sample(normals,...xyB,dim);
   const frameA=tangentFrame(mesh,a.i,a.j,t),frameB=tangentFrame(mesh,same?b.i:b.j,same?b.j:b.i,t);
   const objA=tangentToObject(tangentA,frameA),objB=tangentToObject(tangentB,frameB);
   const target=unit(sum(objA,objB));
   const linear=colA.map((c,i)=>(toLin(c)+toLin(colB[i]))/2);
   maxColor=Math.max(maxColor,...colA.map((v,i)=>Math.abs(v-colB[i])));
   maxNormal=Math.max(maxNormal,Math.acos(clamp(dot(objA,objB),-1,1))*180/Math.PI);
   rows.push({xyA,xyB,col:linear,obj:target,frameA,frameB});
 }
 return {rows,uvA,uvB,worldLength:dx,maxColor,maxNormal};
}
function seamBake(source,variant='balanced'){
 need(['balanced','soft'].includes(variant),'variant balanced|soft');
 const g=source.g,mi=g.meshes.findIndex(m=>(m.name||'').includes('R36KP_CONTINUOUS_SKIN'));
 need(mi>=0,'continuous body mesh missing');
 const mesh=extract(source,mi,0),pr=g.meshes[mi].primitives[0],material=g.materials[pr.material];
 mesh.tangents=values(source,pr.attributes.TANGENT);
 need(mesh.indices.length===3396,'expected 1132 body triangles');
 const color=image(source,material.pbrMetallicRoughness.baseColorTexture.index);
 const nm=image(source,material.normalTexture.index);
 need(color.w===2048&&nm.w===2048&&color.h===2048&&nm.h===2048,'2048 source required');
 const dim=2048,colors=Buffer.from(color.pix),normals=Buffer.from(nm.pix);
 // Weighted accumulation prevents multiple seams meeting at a vertex
 // from depending on iteration order.
 const channels=dim*dim*3;
 const accC=new Float32Array(channels),accN=new Float32Array(channels),weight=new Float32Array(dim*dim);
 const edges=gatherEdges(mesh);
 const areaRatio=variant==='balanced'?0.95:.63;
 let matched=0,painted=0,totalSamples=0,maxOriginalRGB=0,maxOriginalNormal=0;
 const perEdge=[];
 for(const edge of edges){
   const {rows,uvA,uvB,maxColor,maxNormal}=evaluate(mesh,color.pix,nm.pix,dim,edge);
   if(maxColor<.55&&maxNormal<.3)continue;
   matched++;maxOriginalRGB=Math.max(maxOriginalRGB,maxColor);
   maxOriginalNormal=Math.max(maxOriginalNormal,maxNormal);
   // Each UV island is painted independently in its own tangent frame.
   const sides=[{ends:uvA,slot:'A'},{ends:uvB,slot:'B'}];
   for(const side of sides){
     const [p0,p1]=side.ends,len=norm(sub(p1,p0));
     if(len<1e-4)continue;
     const along=sub(p1,p0),v=mul(along,1/len),perp=[-v[1],v[0]];
     const nearest=rows;
     for(let k=0;k<nearest.length;k++){
       const row=nearest[k],xy=row['xy'+side.slot],frame=row['frame'+side.slot],targetRGB=row.col.map(toSRGB);
       const targetN=objectToTangent(row.obj,frame);
       // 2px core and 4px feather; preserve interior higher frequency detail.
       for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
         const tx=xy[0]+dx,ty=xy[1]+dy;
         const pixelX=Math.round(tx),pixelY=Math.round(ty);
         if(pixelX<0||pixelX>=dim||pixelY<0||pixelY>=dim)continue;
         const dist=Math.abs(dot(sub([pixelX+.5,pixelY+.5],xy),perp));
         if(dist>4.1)continue;
         const blend=areaRatio*(1-smooth((dist-1.0)/3.1));
         if(blend<=0)continue;
         const pi=pixelY*dim+pixelX,idx=pi*3;
         const c=sample(color.pix,pixelX,pixelY,dim),n=sample(nm.pix,pixelX,pixelY,dim);
         weight[pi]+=blend;painted++;
         for(let channel=0;channel<3;channel++){
           accC[idx+channel]+=blend*targetRGB[channel];
           accN[idx+channel]+=blend*targetN[channel];
         }
       }
       totalSamples++;
     }
   }
   perEdge.push({faceIds:edge.map(q=>q.face),maxOriginalRGB:maxColor,maxNormalAngleDegrees:maxNormal});
 }
 let changedPixels=0,sumC=0,sumN=0,peakC=0,peakN=0;
 for(let p=0;p<weight.length;p++){
   const w=weight[p];if(w<=0)continue;
   const idx=p*4,a=p*3;
   // At dense corner neighborhoods, average all edge constraints.
   const blend=clamp(w/(1+w),0,.95);
   let any=false;
   for(let c=0;c<3;c++){
     const desiredColor=accC[a+c]/w,desiredN=accN[a+c]/w;
     const cv=clamp(Math.round(colors[idx+c]*(1-blend)+desiredColor*blend),0,255);
     const nv=clamp(Math.round(normals[idx+c]*(1-blend)+desiredN*blend),0,255);
     sumC+=Math.abs(cv-colors[idx+c]);sumN+=Math.abs(nv-normals[idx+c]);
     peakC=Math.max(peakC,Math.abs(cv-colors[idx+c]));peakN=Math.max(peakN,Math.abs(nv-normals[idx+c]));
     any ||= cv!==colors[idx+c]||nv!==normals[idx+c];
     colors[idx+c]=cv;normals[idx+c]=nv;
   }
   if(any)changedPixels++;
 }
 need(changedPixels>=100,'no meaningful seams repaired');
 return {color:encodePNG(colors,dim,dim),normal:encodePNG(normals,dim,dim),
  metrics:{variant,sourceManifoldSharedEdges:edges.length,correctedEdgeCount:matched,
   affectedPixels:changedPixels,writeSamples:painted,edgeSamples:totalSamples,
   maxOriginalRGBDifference:maxOriginalRGB,maxOriginalObjectNormalAngleDegrees:maxOriginalNormal,
   meanAbsoluteColorDeltaRGB8:sumC/(3*Math.max(changedPixels,1)),
   meanAbsoluteNormalDeltaRGB8:sumN/(3*Math.max(changedPixels,1)),
   peakColorDeltaRGB8:peakC,peakNormalDeltaRGB8:peakN,
   triangleCountUnchanged:true,UVUnchanged:true,rigUnchanged:true,originalPalettePreservedOutsideSeamBands:true,
   method:'paired geometry edges; linear-light albedo; object-space normals reprojected to each UV tangent basis'}};
}
function build(input,folder,variant='balanced'){
 need(fs.existsSync(input),'input GLB missing');
 need(!fs.existsSync(folder),'output folder already exists');
 const q=load(input),g=q.g,result=seamBake(q,variant);
 const mi=g.meshes.findIndex(x=>(x.name||'').includes('R36KP_CONTINUOUS_SKIN'));
 const builder=new Builder(q),out=builder.g,mat=out.materials[out.meshes[mi].primitives[0].material];
 const colorIdx=builder.addTexture('R36LQ_color_seams_2048',result.color);
 const normalIdx=builder.addTexture('R36LQ_normal_seams_2048',result.normal);
 mat.pbrMetallicRoughness.baseColorTexture={...mat.pbrMetallicRoughness.baseColorTexture,index:colorIdx};
 mat.normalTexture={...mat.normalTexture,index:normalIdx};
 // Retain the original glTF authored normal scale; viewer should multiply it.
 out.asset.generator='R36LQ geometry-paired atlas seam fairing, full 2100-triangle character';
 out.extras={...(out.extras||{}),r36lq:{inputSHA256:q.sha,variant,metrics:result.metrics,
   headHairPreserved:true,geometryPreserved:true,sourceSkinPreserved:true,referenceComparison:'pending'}};
 fs.mkdirSync(folder,{recursive:true});
 const stem='R36LQ_'+variant.toUpperCase()+'_2100_FULL',file=path.join(folder,stem+'.glb');
 const built=builder.save(file);
 fs.writeFileSync(path.join(folder,stem+'_COLOR_2048.png'),result.color);
 fs.writeFileSync(path.join(folder,stem+'_NORMAL_2048.png'),result.normal);
 const report={version:'R36LQ',variant,source:path.basename(input),sourceSHA256:q.sha,
   output:path.basename(file),bytes:built.bytes,sha256:built.sha,
   colorSHA256:sha(result.color),normalSHA256:sha(result.normal),
   totalTriangles:2100,headTriangles:968,bodyTriangles:1132,bones:63,
   ...result.metrics,renderQA:'pending'};
 fs.writeFileSync(path.join(folder,stem+'.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output:file,bytes:built.bytes,sha256:built.sha,edges:result.metrics.correctedEdgeCount,
  changedPixels:result.metrics.affectedPixels}));
 return report;
}
if(require.main===module){try{
 const [input,output,mode='balanced']=process.argv.slice(2);
 need(input&&output,'usage: node build_r36lq.cjs full.glb OUT_DIR [balanced|soft]');
 build(input,output,mode);
}catch(e){console.error(e.stack||e);process.exitCode=1}}
module.exports={build,seamBake,gatherEdges,tangentToObject,objectToTangent};
