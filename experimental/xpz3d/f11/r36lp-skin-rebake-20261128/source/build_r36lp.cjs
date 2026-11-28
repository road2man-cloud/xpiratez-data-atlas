'use strict';
/**
 * R36LP: continuous bind-space skin detail and 2048x2048 atlas rebake.
 * Input: R36LO_FRONT_DEFINED_2100_FULL.glb
 * Output: distinct complete GLB + body color/normal PNG + JSON report.
 * Uses only Node built-ins; preserves source geometry, rig, UV, skin, hair.
 */
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const {load,extract,Builder,values}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const need=(x,s)=>{if(!x)throw Error(s)};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const bell=(x,c,r)=>Math.exp(-.5*((x-c)/r)**2);
const lerp=(a,b,t)=>a+(b-a)*t;
const crc=(buf)=>{let c=0xffffffff;for(const x of buf){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0};
function pngChunk(tag,data){const name=Buffer.from(tag),head=Buffer.alloc(8),tail=Buffer.alloc(4);head.writeUInt32BE(data.length,0);name.copy(head,4);tail.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([head,data,tail])}
function encodePNG(pix,w,h){
 const scan=Buffer.alloc((w*4+1)*h);
 for(let y=0;y<h;y++){const off=y*(w*4+1);scan[off]=0;pix.copy(scan,off+1,y*w*4,(y+1)*w*4)}
 const info=Buffer.alloc(13);info.writeUInt32BE(w,0);info.writeUInt32BE(h,4);info[8]=8;info[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',info),pngChunk('IDAT',zlib.deflateSync(scan,{level:6})),pngChunk('IEND',Buffer.alloc(0))]);
}
function decodePNG(b){
 need(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG signature');
 let off=8,w=0,h=0,depth=0,type=0,interlace=0,idats=[];
 while(off+12<=b.length){const n=b.readUInt32BE(off),t=b.toString('ascii',off+4,off+8),d=b.subarray(off+8,off+8+n);off+=n+12;
  if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);depth=d[8];type=d[9];interlace=d[12]}
  if(t==='IDAT')idats.push(d);
  if(t==='IEND')break;
 }
 need(w===2048&&h===2048&&depth===8&&type===6&&interlace===0,'expected 2048 RGBA8 noninterlaced PNG');
 const raw=zlib.inflateSync(Buffer.concat(idats)),stride=w*4;
 need(raw.length===h*(stride+1),'PNG raw length mismatch');
 const pix=Buffer.alloc(w*h*4);let k=0;
 for(let y=0;y<h;y++){
  const filter=raw[k++],base=y*stride;
  for(let x=0;x<stride;x++){
   const a=x>=4?pix[base+x-4]:0,bp=y?pix[base+x-stride]:0,c=(y&&x>=4)?pix[base+x-stride-4]:0;
   let v=raw[k++];
   if(filter===1)v+=a;
   else if(filter===2)v+=bp;
   else if(filter===3)v+=Math.floor((a+bp)/2);
   else if(filter===4){const p=a+bp-c,pa=Math.abs(p-a),pb=Math.abs(p-bp),pc=Math.abs(p-c);v+=(pa<=pb&&pa<=pc)?a:pb<=pc?bp:c}
   else need(filter===0,'unsupported PNG filter '+filter);
   pix[base+x]=v&255;
  }
 }
 return {w,h,pix};
}
function embeddedPNG(q,textureId){
 const tex=q.g.textures[textureId],img=q.g.images[tex.source];
 need(img.mimeType==='image/png'&&img.bufferView!=null,'expected embedded PNG');
 const view=q.g.bufferViews[img.bufferView];return decodePNG(q.bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));
}
function skinMask(x,y,z){
 const ax=Math.abs(x);
 const a=(1-smooth(.081,.155,ax))*smooth(.725,.81,z)*(1-smooth(1.01,1.08,z));
 const front=1-smooth(-.045,.055,y);
 return clamp(a*front);
}
function pigment(x,y,z){
 // Light is represented by continuous 3D coordinates, never triangle IDs.
 // Small changes avoid undoing previous sprite-matched skin-palette work.
 const ax=Math.abs(x),asym=x>0?1:.94;
 const left=bell(ax,.030+.007*Math.sin((z-.79)*9),.018)*bell(z,.885,.091);
 const outside=bell(ax,.066,.030)*bell(z,.866,.11);
 const valley=bell(ax,.003,.012)*bell(z,.890,.097);
 const tone=(.017*left+.006*outside-.013*valley)*asym;
 const mottled=.0022*(Math.sin(x*115+z*69)+.5*Math.sin(x*243-z*157));
 return [tone+mottled*.80,tone*.73+mottled*.65,tone*.55+mottled*.50];
}
function normalPerturb(x,y,z){
 // Extremely mild, continuous pore/soft fold variation in tangent space.
 const m=skinMask(x,y,z);
 const u=.010*Math.sin(x*103+z*47)+.005*Math.sin(x*221-z*161);
 const v=.009*Math.sin(z*116-x*39)+.005*Math.cos(x*171+z*191);
 return [m*u,m*v];
}
function bindSpaceAtlas(mesh,colorMap,normalMap,mode){
 const w=colorMap.w,h=colorMap.h,col=Buffer.from(colorMap.pix),nm=Buffer.from(normalMap.pix);
 const marked=new Uint8Array(w*h),sum=[0,0,0],maxChange=[0,0,0];let changed=0,skipped=0,skinPixels=0;
 const indices=mesh.indices,uv=mesh.uvs,positions=mesh.positions;
 const sourceC=colorMap.pix,sourceN=normalMap.pix;
 const attenuation=mode==='balanced'?.28:.18;
 for(let f=0;f<indices.length;f+=3){
  const ids=indices.slice(f,f+3),t=ids.map(i=>[(uv[i][0])*w,(1-uv[i][1])*h]),p=ids.map(i=>positions[i]);
  const minX=Math.max(0,Math.floor(Math.min(...t.map(a=>a[0]))-1)),maxX=Math.min(w-1,Math.ceil(Math.max(...t.map(a=>a[0]))+1));
  const minY=Math.max(0,Math.floor(Math.min(...t.map(a=>a[1]))-1)),maxY=Math.min(h-1,Math.ceil(Math.max(...t.map(a=>a[1]))+1));
  const den=(t[1][1]-t[2][1])*(t[0][0]-t[2][0])+(t[2][0]-t[1][0])*(t[0][1]-t[2][1]);
  if(Math.abs(den)<1e-7){skipped++;continue}
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const px=x+.5,py=y+.5;
   const a=((t[1][1]-t[2][1])*(px-t[2][0])+(t[2][0]-t[1][0])*(py-t[2][1]))/den;
   const b=((t[2][1]-t[0][1])*(px-t[2][0])+(t[0][0]-t[2][0])*(py-t[2][1]))/den;
   const c=1-a-b;
   if(Math.min(a,b,c)<0)continue;
   const nPix=y*w+x;if(marked[nPix])continue;
   const q=[0,1,2].map(j=>p[0][j]*a+p[1][j]*b+p[2][j]*c);
   const mask=skinMask(...q);if(mask<.001)continue;
   marked[nPix]=1;skinPixels++;
   const tint=pigment(...q),i=nPix*4;
   // Intra-island lowpass avoids baked high-frequency texel speckles.
   const neighbor=(channel)=>{
    const aa=sourceC[i+channel],left=sourceC[(y*w+Math.max(0,x-1))*4+channel],
    right=sourceC[(y*w+Math.min(w-1,x+1))*4+channel],
    up=sourceC[(Math.max(0,y-1)*w+x)*4+channel],
    down=sourceC[(Math.min(h-1,y+1)*w+x)*4+channel];
    return .50*aa+.125*(left+right+up+down);
   };
   for(let k=0;k<3;k++){
    const old=sourceC[i+k],soft=lerp(old,neighbor(k),attenuation*mask);
    // Tint values are deliberately constrained to a few RGB8 steps.
    const next=clamp(Math.round(soft+255*tint[k]*mask*(mode==='balanced'?.50:.29)),0,255);
    col[i+k]=next;sum[k]+=next-old;maxChange[k]=Math.max(maxChange[k],Math.abs(next-old));
   }
   const [nu,nv]=normalPerturb(...q);
   const nx=(sourceN[i]/127.5)-1,ny=(sourceN[i+1]/127.5)-1;
   const flatten=mode==='balanced'?.22:.36;
   const tx=clamp(nx*(1-flatten*mask)+nu,-.7,.7);
   const ty=clamp(ny*(1-flatten*mask)+nv,-.7,.7);
   const tz=Math.sqrt(Math.max(0,1-tx*tx-ty*ty));
   nm[i]=clamp(Math.round((tx*.5+.5)*255),0,255);
   nm[i+1]=clamp(Math.round((ty*.5+.5)*255),0,255);
   nm[i+2]=clamp(Math.round((tz*.5+.5)*255),0,255);
   changed++;
  }
 }
 need(changed>1000,'rebake changed too few skin pixels '+changed);
 return {col,nm,stats:{version:'R36LP',mode,skinPixels,changedPixels:changed,degenerateUVTriangles:skipped,
   meanColorChangeRGB8:sum.map(x=>x/changed),maxColorChangeRGB8:maxChange,
   worldSpaceShading:true,sourceColorMostlyPreserved:true,normalFlattening:true,triangleBudgetUnchanged:true}};
}
function build(input,outDir,mode='balanced'){
 need(['balanced','gentle'].includes(mode),'unsupported mode');
 need(fs.existsSync(input),'input GLB unavailable');
 need(!fs.existsSync(outDir),'refusing overwrite output directory');
 const q=load(input),g=q.g;
 const mi=g.meshes.findIndex(x=>(x.name||'').includes('R36KP_CONTINUOUS_SKIN'));
 need(mi>=0,'integrated body not found');
 const pr=g.meshes[mi].primitives[0],mesh=extract(q,mi,0);
 need(mesh.indices.length===3396,'R36LO source must have 1132 body triangles');
 need(g.skins.some(s=>s.joints.length===63),'63 bone rig missing');
 let other=0;g.meshes.forEach((m,i)=>{if(i!==mi)for(const p of m.primitives)other+=g.accessors[p.indices].count/3});
 need(other===968,'R36HW head/hair changed');
 const material=g.materials[pr.material],colorTid=material.pbrMetallicRoughness.baseColorTexture.index,normalTid=material.normalTexture.index;
 const base=embeddedPNG(q,colorTid),normal=embeddedPNG(q,normalTid);
 const rebake=bindSpaceAtlas(mesh,base,normal,mode);
 fs.mkdirSync(outDir,{recursive:true});
 const baseName='R36LP_'+mode.toUpperCase()+'_2100_FULL';
 const colorPng=encodePNG(rebake.col,2048,2048),normalPng=encodePNG(rebake.nm,2048,2048);
 fs.writeFileSync(path.join(outDir,baseName+'_COLOR_2048.png'),colorPng);
 fs.writeFileSync(path.join(outDir,baseName+'_NORMAL_2048.png'),normalPng);
 const builder=new Builder(q),meta=builder.g,mat=meta.materials[pr.material];
 const colorNew=builder.addTexture(baseName+'_color',colorPng);
 const normalNew=builder.addTexture(baseName+'_normal',normalPng);
 mat.pbrMetallicRoughness.baseColorTexture={...mat.pbrMetallicRoughness.baseColorTexture,index:colorNew};
 mat.normalTexture={...mat.normalTexture,index:normalNew,scale:mode==='balanced'?.26:.19};
 if(mat.occlusionTexture)mat.occlusionTexture.strength=mode==='balanced'?.32:.25;
 meta.asset.generator='R36LP 2048 continuous bind-space skin material rebake / 2100 triangles';
 meta.extras={...(meta.extras||{}),r36lp:{mode,source:q.sha,colorSHA256:crypto.createHash('sha256').update(colorPng).digest('hex'),
  normalSHA256:crypto.createHash('sha256').update(normalPng).digest('hex'),stats:rebake.stats,
  triangles:2100,joints:63,bodyGeometryUnchanged:true,UVUnchanged:true,headHairUnchanged:true}};
 const glb=builder.save(path.join(outDir,baseName+'.glb'));
 const report={version:'R36LP',mode,input:path.basename(input),sourceSHA256:q.sha,
  glb:glb.file,bytes:glb.bytes,sha256:glb.sha,
  colorBytes:colorPng.length,normalBytes:normalPng.length,
  totalTriangles:2100,bodyTriangles:1132,headHairTriangles:968,joints:63,...rebake.stats,
  renderQA:'not run',s2EngineQA:'not run'};
 fs.writeFileSync(path.join(outDir,baseName+'.report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({glb:glb.file,sha256:glb.sha,bytes:glb.bytes,changedPixels:rebake.stats.changedPixels,meanColorChangeRGB8:rebake.stats.meanColorChangeRGB8}));
 return report;
}
if(require.main===module){try{const [a,b,c='balanced']=process.argv.slice(2);need(a&&b,'usage: node build_r36lp.cjs SOURCE.glb OUTPUT_DIR [balanced|gentle]');build(a,b,c)}catch(e){console.error(e.stack||e);process.exitCode=1}}
module.exports={build,decodePNG,encodePNG,bindSpaceAtlas,skinMask};
