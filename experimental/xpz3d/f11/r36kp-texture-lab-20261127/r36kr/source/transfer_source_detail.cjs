'use strict';
/**
 * R36KR: project the SOURCE HIGH-POLYGON CENTRAL ANATOMY (6,044 triangles) to
 * the 2,088-triangle closed-body GLB's existing 2048 UV atlas.
 * Produces source-derived pigment + micro-relief normal + local occlusion
 * correction + a controlled local emissive lift, not a flat black cavity.
 * No added polygons, no detached central geometry, no UV/skin alteration.
 */
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const {load,extract}=require('./glb_io.cjs');
const {normal,cross,dot,v3,length}=require('./mesh_qem.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function need(x,msg){if(!x)throw Error(msg)}
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=(a,b,x)=>{let t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
function crc(buf){let c=0xffffffff;for(const v of buf){c^=v;for(let k=0;k<8;k++)c=c>>>1^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function pngChunk(t,data){const name=Buffer.from(t,'ascii'),head=Buffer.alloc(4),end=Buffer.alloc(4);head.writeUInt32BE(data.length);end.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([head,name,data,end]);}
function pngDecode(buf){
 need(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG signature');
 let at=8,header=null,compressed=[],w=0,h=0;
 while(at<buf.length){const n=buf.readUInt32BE(at),t=buf.toString('ascii',at+4,at+8),data=buf.subarray(at+8,at+8+n);
 if(t==='IHDR'){header=Buffer.from(data);w=data.readUInt32BE(0);h=data.readUInt32BE(4);need(data[8]===8&&data[9]===6&&data[12]===0,'RGBA8 PNG only');}
 if(t==='IDAT')compressed.push(data);at+=n+12;if(t==='IEND')break;}
 need(header&&w===2048&&h===2048,'2048 x 2048 atlas required');
 const data=zlib.inflateSync(Buffer.concat(compressed)),stride=w*4+1;
 need(data.length===stride*h,'PNG buffer size');
 for(let y=0;y<h;y++)need(data[y*stride]===0,'PNG filter 0 expected');
 return {header,w,h,stride,data};
}
function pngEncode(p){return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',p.header),pngChunk('IDAT',zlib.deflateSync(p.data,{level:7})),pngChunk('IEND',Buffer.alloc(0))]);}
function blankPng(){const header=Buffer.alloc(13);header.writeUInt32BE(2048,0);header.writeUInt32BE(2048,4);header[8]=8;header[9]=6;return {header,w:2048,h:2048,stride:8193,data:Buffer.alloc(8193*2048)};}
function outIndex(p,x,y){return y*p.stride+1+x*4;}
function rgb(p,x,y,values){const j=outIndex(p,x,y);for(let k=0;k<4;k++)p.data[j+k]=values[k]??255;}
function computeSourceField(body,core,{width=320,height=320,xmin=-.188,xmax=.188,zmin=.715,zmax=1.112,posterior=.020,superior=.026}={}){
 const bx=Float32Array.from({length:width*height},()=>Infinity),cx=Float32Array.from({length:width*height},()=>Infinity);
 const dx=(xmax-xmin)/width,dz=(zmax-zmin)/height;
 function raster(mesh,grid,shiftZ=0){
  let faceCount=0,pixelTests=0,pixelSets=0;
  const pos=mesh.positions,ix=mesh.indices;
  for(let k=0;k<ix.length;k+=3){
   const tri=ix.slice(k,k+3).map(i=>pos[i]),[a,b,c]=tri;
   // Shift HIGH-POLY core geometry superior, the body is unchanged.
   const za=a[2]+shiftZ,zb=b[2]+shiftZ,zc=c[2]+shiftZ;
   const minX=Math.min(a[0],b[0],c[0]),maxX=Math.max(a[0],b[0],c[0]);
   const minZ=Math.min(za,zb,zc),maxZ=Math.max(za,zb,zc);
   if(maxX<xmin||minX>xmax||maxZ<zmin||minZ>zmax)continue;
   const det=(zb-zc)*(a[0]-c[0])+(c[0]-b[0])*(za-zc);
   if(Math.abs(det)<1e-10)continue;
   faceCount++;
   const i0=Math.max(0,Math.floor((minX-xmin)/dx)-1),i1=Math.min(width-1,Math.ceil((maxX-xmin)/dx)+1);
   const j0=Math.max(0,Math.floor((minZ-zmin)/dz)-1),j1=Math.min(height-1,Math.ceil((maxZ-zmin)/dz)+1);
   for(let j=j0;j<=j1;j++){
    const z=zmin+(j+.5)*dz;
    for(let i=i0;i<=i1;i++){
     const x=xmin+(i+.5)*dx;
     const u=((zb-zc)*(x-c[0])+(c[0]-b[0])*(z-zc))/det;
     const v=((zc-za)*(x-c[0])+(a[0]-c[0])*(z-zc))/det;
     const w=1-u-v;
     pixelTests++;if(Math.min(u,v,w)<-0.0004)continue;
     const y=u*a[1]+v*b[1]+w*c[1];
     const at=j*width+i;if(y<grid[at]){grid[at]=y;pixelSets++;}
    }
   }
  }
  return {faceCount,pixelTests,pixelSets};
 }
 const sb=raster(body,bx),sc=raster(core,cx,superior);
 const relief=new Float32Array(width*height),mask=new Float32Array(width*height),rawHeight=new Float32Array(width*height);
 let valid=0,raised=0;
 for(let j=0;j<height;j++)for(let i=0;i<width;i++){
  const idx=j*width+i,x=xmin+(i+.5)*dx,z=zmin+(j+.5)*dz;
  if(!Number.isFinite(bx[idx])||!Number.isFinite(cx[idx]))continue;
  valid++;
  const diff=bx[idx]-(cx[idx]+posterior);
  rawHeight[idx]=diff;
  const rise=clamp(diff,-.004,.042);
  if(rise>.0015)raised++;
  const envelope=(1-smooth(.105,.174,Math.abs(x)))*smooth(.738,.81,z)*(1-smooth(1.07,1.111,z));
  mask[idx]=envelope*smooth(-.005,.023,rise);
  relief[idx]=Math.max(0,rise)*envelope;
 }
 // Two small passes suppress raster quantization while retaining creases.
 const smoothed=new Float32Array(relief.length);
 for(let j=1;j<height-1;j++)for(let i=1;i<width-1;i++){
  let sum=0,weight=0;
  for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
   const yy=clamp(j+oy,0,height-1),xx=clamp(i+ox,0,width-1);
   const w=(3-Math.abs(ox))*(3-Math.abs(oy));sum+=relief[yy*width+xx]*w;weight+=w;
  }
  smoothed[j*width+i]=sum/weight;
 }
 function sample(grid,x,z){
  const fx=(x-xmin)/dx-.5,fz=(z-zmin)/dz-.5,i=Math.floor(fx),j=Math.floor(fz);
  if(i<0||j<0||i>=width-1||j>=height-1)return 0;
  const tx=fx-i,tz=fz-j;
  return (grid[j*width+i]*(1-tx)+grid[j*width+i+1]*tx)*(1-tz)+
         (grid[(j+1)*width+i]*(1-tx)+grid[(j+1)*width+i+1]*tx)*tz;
 }
 function hit(x,z){const fx=(x-xmin)/dx-.5,fz=(z-zmin)/dz-.5,i=Math.round(fx),j=Math.round(fz);if(i<0||j<0||i>=width||j>=height)return null;const k=j*width+i;return Number.isFinite(bx[k])?{bodyY:bx[k],coreY:cx[k],mask:sample(mask,x,z),relief:sample(smoothed,x,z)}:null;}
 return {hit,sample,mask,relief,bx,cx,rawHeight,dx,dz,width,height,xmin,xmax,zmin,zmax,stats:{bodyRaster:sb,coreRaster:sc,valid,raised,coverageFraction:valid/(width*height),peakHeight:Math.max(...relief)}};
}
function main(){
 const [lowFile,donorFile,outDir]=process.argv.slice(2);
 need(lowFile&&donorFile&&outDir,'node transfer_source_detail.cjs INPUT_R36KQ.glb SOURCE_R36JB.glb FRESH_OUTPUT_DIR');
 need(!fs.existsSync(outDir),'output directory exists');fs.mkdirSync(outDir,{recursive:true});
 const low=load(lowFile),donor=load(donorFile);
 need(low.g.extras?.r36kp?.budget?.total===2088,'unexpected low-poly model');
 need(donor.g.meshes[3].primitives.length===2,'unexpected central donor');
 const core0=extract(donor,3,0),core1=extract(donor,3,1),body=extract(donor,2,0),lowMesh=extract(low,1,0);
 const merge=(a,b)=>({positions:[...a.positions,...b.positions],indices:[...a.indices,...b.indices.map(x=>x+a.positions.length)]});
 const core=merge(core0,core1),grid=computeSourceField(body,core);
 const imgByName=Object.fromEntries(low.g.images.map(im=>[im.name,im]));
 const imageBytes=name=>{const im=imgByName[name];need(im,'missing image '+name);const v=low.g.bufferViews[im.bufferView];return low.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);};
 const color=pngDecode(imageBytes('body_color')),normalMap=pngDecode(imageBytes('body_normal')),orm=pngDecode(imageBytes('body_orm')),emission=blankPng(),height=blankPng(),maskMap=blankPng();
 const tris=lowMesh.indices.length/3;
 need(tris===1120&&lowMesh.positions.length===3*tris,'UV island geometry mismatch');
 const cols=Math.ceil(Math.sqrt(tris)),tile=Math.floor(2048/cols),pad=Math.max(2,Math.ceil(tile*.05)),span=tile-2*pad;
 let candidatePixels=0,affectedPixels=0,sourcePixels=0,weightedMask=0,savedDark=0,positiveHeight=0;
 const coreMat=donor.g.materials[core1.mat].pbrMetallicRoughness.baseColorFactor.slice(0,3);
 // Source highpoly core pigment is an authored glTF baseColorFactor in sRGB.
 for(let fi=0;fi<tris;fi++){
  const x0=(fi%cols)*tile,y0=Math.floor(fi/cols)*tile,base=fi*3,P=lowMesh.positions.slice(base,base+3),N=lowMesh.normals.slice(base,base+3);
  const tan=lowMesh.uvs.slice(base,base+3),nrm=lowMesh.normals[base];
  const ax=normal(v3(P[1],P[0])); // source exporter tangent sign is stored on mesh
  const savedTangent=low.g.meshes[1].primitives[0].attributes.TANGENT;
  // Read actual tangent as sourced in GLB, not an invented UV direction.
  for(let dy=0;dy<tile;dy++)for(let dx=0;dx<tile;dx++){
   const u=(dx+.5-pad)/span,v=(dy+.5-pad)/span;if(u<0||v<0||u+v>1)continue;
   const w=[1-u-v,u,v],position=[0,1,2].map(k=>P.reduce((s,p,j)=>s+p[k]*w[j],0)),baseNormal=normal([0,1,2].map(k=>N.reduce((s,p,j)=>s+p[k]*w[j],0)));
   const [x,y,z]=position;if(Math.abs(x)>.19||z<.715||z>1.112||baseNormal[1]>-.18)continue;
   candidatePixels++;
   const found=grid.hit(x,z);if(!found||y-found.bodyY>.066||y-found.bodyY<-.092||found.mask<.015)continue;
   sourcePixels++;
   const m=clamp(found.mask,0,.92);weightedMask+=m;
   const ix=x0+dx,iy=y0+dy,off=outIndex(color,ix,iy);
   if(m>.10)affectedPixels++;
   const rel=clamp(found.relief,0,.04);
   // Detailed core pigmented layer: core material *actual source colour*
   // but keep a substantial portion of surrounding skin in the same pixels.
   const depthShade=1-.10*clamp(rel/.04);
   for(let k=0;k<3;k++){
    const previous=color.data[off+k]/255;
    const target=clamp(coreMat[k]*depthShade,.0,1);
    const mixed=previous*(1-.76*m)+target*.76*m;
    color.data[off+k]=Math.round(mixed*255);
   }
   // High density relief contributes slope of the *posterior/superior*
   // translated donor field. This is a tangent-space perturbation, not
   // additional 3D silhouette geometry.
   const eps=.0022;
   const slopeX=(grid.sample(grid.relief,x+eps,z)-grid.sample(grid.relief,x-eps,z))/(2*eps);
   const slopeZ=(grid.sample(grid.relief,x,z+eps)-grid.sample(grid.relief,x,z-eps))/(2*eps);
   // The source tangent basis is [P1-P0] and the inferred bitangent on UV[2].
   let t=normal(v3(ax,baseNormal.map(k=>k*dot(ax,baseNormal))));
   const sign=-1;
   const b=cross(baseNormal,t).map(q=>q*sign);
   const perturb=[-slopeX*0.22,0,-slopeZ*0.22];
   const tx=dot(perturb,t),ty=dot(perturb,b);
   const oldX=normalMap.data[off]/127.5-1,oldY=normalMap.data[off+1]/127.5-1;
   const nx=clamp(oldX*(1-.44*m)+tx*m,-.40,.40),ny=clamp(oldY*(1-.44*m)+ty*m,-.40,.40);
   const nz=Math.sqrt(1-nx*nx-ny*ny);
   normalMap.data[off]=Math.round(127.5*(nx+1));normalMap.data[off+1]=Math.round(127.5*(ny+1));normalMap.data[off+2]=Math.round(127.5*(nz+1));
   // Do not compound physical cavity darkness with a fake deep AO mask.
   orm.data[off]=Math.round(orm.data[off]*(1-m)+255*m);
   orm.data[off+1]=Math.round(orm.data[off+1]*(1-m)+235*m);
   // Localized weak emissive tint keeps a dark geometric recess readable.
   rgb(emission,ix,iy,[Math.round(255*.71*m),Math.round(255*.47*m),Math.round(255*.36*m),255]);
   const hval=clamp(rel/.04);
   rgb(height,ix,iy,[Math.round(255*hval),Math.round(255*hval),Math.round(255*hval),255]);
   rgb(maskMap,ix,iy,[Math.round(255*m),Math.round(255*m),Math.round(255*m),255]);
   if(rel>.003)positiveHeight++;
  }
 }
 // Expand each affected island's edge texels into the black/neutral gutters.
 function propagate(p,predicate){
  for(let fi=0;fi<tris;fi++){
   const x0=(fi%cols)*tile,y0=Math.floor(fi/cols)*tile;
   for(let j=0;j<tile;j++)for(let i=0;i<tile;i++){
    let u=(i+.5-pad)/span,v=(j+.5-pad)/span;if(u>=0&&v>=0&&u+v<=1)continue;
    u=Math.max(0,u);v=Math.max(0,v);const total=u+v;if(total>1){u/=total;v/=total;}
    u*=.96;v*=.96;
    const sx=clamp(Math.floor(pad+u*span),0,tile-1),sy=clamp(Math.floor(pad+v*span),0,tile-1);
    const dest=outIndex(p,x0+i,y0+j),source=outIndex(p,x0+sx,y0+sy);
    p.data.copy(p.data,dest,source,source+4);
   }
  }
 }
 for(const map of [color,normalMap,orm,emission,height,maskMap])propagate(map);
 const resultPngs={
  body_color:pngEncode(color),body_normal:pngEncode(normalMap),body_orm:pngEncode(orm),body_emissive:pngEncode(emission),
  source_height:pngEncode(height),source_mask:pngEncode(maskMap)};
 // Source pigments and height preview are kept as actual PNGs too, not a verbal claim.
 for(const [name,b]of Object.entries(resultPngs))fs.writeFileSync(path.join(outDir,name+'_2048.png'),b);
 // Repack every original view without touching geometry payload bytes, replacing
 // exactly three material image views and adding one emission image view.
 const g=low.g,views=g.bufferViews,bufferChunks=[],imgViewByName=new Map();
 for(const [name,img]of Object.entries(imgByName))imgViewByName.set(img.bufferView,name);
 let pos=0;
 function append(bytes){
  const padding=(4-pos%4)%4;if(padding){bufferChunks.push(Buffer.alloc(padding));pos+=padding}
  const begin=pos;bufferChunks.push(bytes);pos+=bytes.length;return begin;
 }
 for(let i=0;i<views.length;i++){
  const v=views[i],start=v.byteOffset||0,oldBytes=low.bin.subarray(start,start+v.byteLength),which=imgViewByName.get(i);
  const bytes=resultPngs[which]||oldBytes;v.byteOffset=append(bytes);v.byteLength=bytes.length;
 }
 const emissionBytes=resultPngs.body_emissive;
 const emissionView=views.push({buffer:0,byteOffset:append(emissionBytes),byteLength:emissionBytes.length})-1;
 const newImg=g.images.push({name:'body_emissive',mimeType:'image/png',bufferView:emissionView})-1;
 const newTexture=g.textures.push({name:'R36KR_HIGH_POLY_CORE_LIGHT',source:newImg,sampler:0})-1;
 const mat=g.materials.find(x=>x.name==='R36KP_BAKED_SKIN_2048');
 need(mat,'missing R36KP body material');
 mat.emissiveFactor=[.54,.48,.40];
 mat.emissiveTexture={index:newTexture};
 // Source color and normal are still visible; occlusion correction is local.
 const assembled=Buffer.concat(bufferChunks);g.buffers[0].byteLength=assembled.length;
 g.asset.generator='R36KR high-poly center pigment/height/normal transfer (posterior+superior)';
 g.extras.r36kr={sourceDonorSHA256:donor.sha,sourceLowSHA256:low.sha,
  preservedTriangles:2088,sourceAnatomyTriangles:6044,
  pigmentBaseColorFactor:coreMat,posterior:.020,superior:.026,
  sourceDerivedCentralPixels:sourcePixels,affectedPixels,meanDetailMask:sourcePixels?weightedMask/sourcePixels:0,
  normalMap2048:true,emissiveCenterOnly:true,addedCentralPolygons:0,
  caveats:['No new surface silhouette: geometry is the same low-poly closed body','Projection is 2.5D; hidden donor surfaces cannot be reconstructed','Source baseColorFactor was used with local recess shading; lighting is material-dependent','Engine material compatibility is not verified']};
 const jb=Buffer.from(JSON.stringify(g),'utf8'),jp=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,32)]);
 const bin=Buffer.concat([assembled,Buffer.alloc((4-assembled.length%4)%4)]),all=Buffer.alloc(28+jp.length+bin.length);
 all.write('glTF');all.writeUInt32LE(2,4);all.writeUInt32LE(all.length,8);all.writeUInt32LE(jp.length,12);all.write('JSON',16);jp.copy(all,20);
 const offset=20+jp.length;all.writeUInt32LE(bin.length,offset);all.write('BIN\0',offset+4,'binary');bin.copy(all,offset+8);
 const target=path.join(outDir,'R36KR_F11_HIGH_POLY_DETAIL_2088TRI.glb');fs.writeFileSync(target,all);
 const report={version:'R36KR',sourceLow:low.sha,sourceDonor:donor.sha,glb:target,sizeBytes:all.length,sha256:sha(all),
  triangleBudget:2100,activeTriangles:2088,centralOverlayTriangles:0,centerDepthModel:'2.5D forward height sampled from 6,044 source triangles',
  sourceMaterial:coreMat,grid:grid.stats,affectedPixels,positiveHeight,sourcePixels,candidatePixels,weightedMask,
  pigmentSample:color.data.subarray(0,0).length,
  textureFiles:Object.fromEntries(Object.entries(resultPngs).map(([k,v])=>[k,{bytes:v.length,sha256:sha(v)}])),
  note:'Transparent/hidden source features are not fully representable by texture; use R36KP fallback for native engine testing.'};
 fs.writeFileSync(path.join(outDir,'PRODUCTION_REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({glb:target,bytes:all.length,sourcePixels,affectedPixels,candidatePixels,grid:grid.stats},null,2));
}
try{main()}catch(e){console.error(e.stack||e);process.exit(1)}
