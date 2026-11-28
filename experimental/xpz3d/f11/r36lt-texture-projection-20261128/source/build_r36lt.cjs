'use strict';
/**
 * R36LT: RGBA reference-detail projection into the original UV atlas.
 * Unlike authored light strokes this transfers actual image pixels.
 * Node.js only. No topology, rig, UV, palette-wide or face/hair edits.
 * Usage:
 * node build_r36lt.cjs SOURCE.glb REFERENCE_RGBA.png CONFIG.json OUTPUT_DIR
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const {decodePNG,encodePNG}=require('../../r36lp-skin-rebake-20261128/source/build_r36lp.cjs');
const assert=(v,s)=>{if(!v)throw Error(s)};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function embedded(q,id){
 const tex=q.g.textures[id],img=q.g.images[tex.source];
 assert(img.mimeType==='image/png'&&Number.isInteger(img.bufferView),'embedded PNG required');
 const view=q.g.bufferViews[img.bufferView],start=view.byteOffset||0;
 return decodePNG(q.bin.subarray(start,start+view.byteLength));
}
function sample(img,u,v){
 const x=clamp(u,0,1)*(img.w-1),y=clamp(v,0,1)*(img.h-1);
 const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,img.w-1),y1=Math.min(y0+1,img.h-1);
 const tx=x-x0,ty=y-y0,a=[0,0,0,0];
 for(const [xx,yy,w] of [[x0,y0,(1-tx)*(1-ty)],[x1,y0,tx*(1-ty)],[x0,y1,(1-tx)*ty],[x1,y1,tx*ty]]){
   const p=(yy*img.w+xx)*4;for(let k=0;k<4;k++)a[k]+=img.pix[p+k]*w;
 }
 return a;
}
function bake(mesh,atlas,detail,cfg){
 assert(atlas.w===2048&&atlas.h===2048,'requires 2048 atlas');
 assert(detail.w>1&&detail.h>1,'reference PNG dimensions invalid');
 const box=cfg.bounds;
 assert(box&&box.xMin<box.xMax&&box.zMin<box.zMax,'invalid x/z projection bounds');
 const front=cfg.frontY;
 assert(typeof front==='number','frontY required');
 const depth=Math.max(.000001,cfg.frontFeather??.055);
 const edge=clamp(cfg.edgeFeather??.09,.001,.4),opacity=clamp(cfg.opacity??1);
 const out=Buffer.from(atlas.pix),hit=new Uint8Array(atlas.w*atlas.h);
 let changed=0,covered=0,minY=Infinity,maxY=-Infinity;
 const {indices,positions,uvs}=mesh,w=atlas.w,h=atlas.h;
 for(let i=0;i<indices.length;i+=3){
   const ids=indices.slice(i,i+3),p=ids.map(j=>positions[j]),uv=ids.map(j=>[uvs[j][0]*w,(1-uvs[j][1])*h]);
   const [a,b,c]=uv,det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
   if(Math.abs(det)<1e-8)continue;
   const loX=Math.max(0,Math.floor(Math.min(...uv.map(v=>v[0])))),hiX=Math.min(w-1,Math.ceil(Math.max(...uv.map(v=>v[0]))));
   const loY=Math.max(0,Math.floor(Math.min(...uv.map(v=>v[1])))),hiY=Math.min(h-1,Math.ceil(Math.max(...uv.map(v=>v[1]))));
   for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
     const xx=x+.5,yy=y+.5;
     const u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/det;
     const v=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/det;
     const t=1-u-v;if(Math.min(u,v,t)<0)continue;
     const j=y*w+x;if(hit[j])continue;hit[j]=1;
     const P=[0,1,2].map(k=>u*p[0][k]+v*p[1][k]+t*p[2][k]);
     const du=(P[0]-box.xMin)/(box.xMax-box.xMin);
     const dv=(box.zMax-P[2])/(box.zMax-box.zMin);
     if(du<=0||du>=1||dv<=0||dv>=1)continue;
     // Exclude rear body surfaces; side of front plane is configurable.
     const distance=cfg.frontDirection==='positive'?(P[1]-front):(front-P[1]);
     if(distance<=0)continue;
     const frontGate=smooth(distance/depth);
     const edgeGate=smooth(Math.min(du,1-du,dv,1-dv)/edge);
     const s=sample(detail,du,dv),alpha=(s[3]/255)*frontGate*edgeGate*opacity;
     if(alpha<1/255)continue;
     covered++;const off=j*4;
     for(let k=0;k<3;k++)out[off+k]=Math.round(out[off+k]*(1-alpha)+s[k]*alpha);
     changed++;minY=Math.min(minY,P[1]);maxY=Math.max(maxY,P[1]);
   }
 }
 assert(changed>0,'no pixels projected; inspect projection bounds/front plane');
 return {pix:out,metrics:{projectedPixels:changed,coveredPixels:covered,bodyTriangles:indices.length/3,meshFrontYRange:[minY,maxY],referencePixels:[detail.w,detail.h]}};
}
function build(input,reference,config,outDir){
 for(const f of [input,reference,config])assert(fs.existsSync(f),'missing input: '+f);
 assert(!fs.existsSync(outDir),'output directory already exists: '+outDir);
 const cfg=JSON.parse(fs.readFileSync(config,'utf8')),q=load(input);
 const mi=q.g.meshes.findIndex(m=>String(m.name).includes('R36KP_CONTINUOUS_SKIN'));
 assert(mi>=0,'body mesh not found');
 const body=extract(q,mi,0),p=q.g.meshes[mi].primitives[0];
 assert(body.indices.length===3396,'body triangle budget changed');
 assert(q.g.skins.some(s=>s.joints.length===63),'63 bone rig unavailable');
 let rest=0;q.g.meshes.forEach((m,i)=>{if(i!==mi)m.primitives.forEach(v=>rest+=q.g.accessors[v.indices].count/3)});
 assert(rest===968,'face/hair budget changed');
 const mat=q.g.materials[p.material],base=embedded(q,mat.pbrMetallicRoughness.baseColorTexture.index);
 const detail=decodePNG(fs.readFileSync(reference));
 const result=bake(body,base,detail,cfg),b=new Builder(q);
 fs.mkdirSync(outDir,{recursive:true});
 const png=encodePNG(result.pix,base.w,base.h);
 const pngFile='R36LT_PROJECTED_COLOR_2048.png';fs.writeFileSync(path.join(outDir,pngFile),png);
 const id=b.addTexture('R36LT_REFERENCE_IMAGE_DETAIL',png);
 b.g.materials[p.material].pbrMetallicRoughness.baseColorTexture={...mat.pbrMetallicRoughness.baseColorTexture,index:id};
 b.g.asset.generator='R36LT actual RGBA-image-to-UV transfer; geometry and rig untouched';
 b.g.extras={...(b.g.extras||{}),r36lt:{sourceSHA256:q.sha,referenceSHA256:sha(fs.readFileSync(reference)),projection:cfg,metrics:result.metrics}};
 const glb=b.save(path.join(outDir,'R36LT_PROJECTED_2100_FULL.glb'));
 const report={...result.metrics,glb:path.basename(glb.file),glbBytes:glb.bytes,glbSHA256:glb.sha,colorSHA256:sha(png),triangles:2100,joints:63,geometryPreserved:true,normalAndORMPreserved:true,rendererQA:'not run'};
 fs.writeFileSync(path.join(outDir,'R36LT_PROJECTED.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));return report;
}
if(require.main===module)try{const a=process.argv.slice(2);assert(a.length===4,'usage: node build_r36lt.cjs source.glb reference.png config.json output_dir');build(...a)}
catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={bake,build};
