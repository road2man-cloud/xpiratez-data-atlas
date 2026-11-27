'use strict';
/* R36KT: correct glTF LINEAR baseColorFactor -> sRGB texture encoding and
 * propagate actual donor material onto visible anterior pelvic skin. Preserve
 * the R36KS closed 2,088 triangle mesh and 2048 source-detail atlas.
 */
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const {load,extract}=require('./glb_io.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const encodeLinear=x=>Math.round(255*(x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055));
function need(b,msg){if(!b)throw Error(msg)}
function crc(buf){let c=0xffffffff;for(const v of buf){c^=v;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0}
function chunk(tag,data){const head=Buffer.alloc(4),t=Buffer.from(tag),end=Buffer.alloc(4);head.writeUInt32BE(data.length);end.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([head,t,data,end])}
function parsePng(buf){
 need(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'not PNG');let at=8,meta=null,w=0,h=0,idats=[];
 while(at<buf.length){const n=buf.readUInt32BE(at),t=buf.toString('ascii',at+4,at+8),data=buf.subarray(at+8,at+8+n);
 if(t==='IHDR'){meta=Buffer.from(data);w=data.readUInt32BE(0);h=data.readUInt32BE(4);need(data[8]===8&&data[9]===6&&data[12]===0,'expected filter0 RGBA PNG');}
 if(t==='IDAT')idats.push(data);at+=n+12;if(t==='IEND')break}
 need(w===2048&&h===2048,'2048 PNG required');
 const data=zlib.inflateSync(Buffer.concat(idats)),stride=8193;need(data.length===2048*stride,'PNG size');
 for(let y=0;y<2048;y++)need(data[y*stride]===0,'filter0 required');
 return {meta,data,stride};
}
function png(p){return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',p.meta),chunk('IDAT',zlib.deflateSync(p.data,{level:7})),chunk('IEND',Buffer.alloc(0))]);}
const ix=(p,x,y)=>y*p.stride+1+x*4;
function adjust(file,donor,dest,{spread=.65,pigment=.72,light=.80}={}){
 need(!fs.existsSync(dest),'output exists');
 const original=load(file),high=load(donor),g=original.g,body=extract(original,1,0),tri=body.indices.length/3;
 need(tri===1120&&g.extras.r36ks?.originalTriangleCount===2088,'R36KS input expected');
 const material=g.materials.find(m=>m.name==='R36KP_BAKED_SKIN_2048'),pigmentLinear=high.g.materials[extract(high,3,1).mat].pbrMetallicRoughness.baseColorFactor.slice(0,3);
 need(material&&pigmentLinear.length===3,'missing donor palette');
 const pigmentEncoded=pigmentLinear.map(encodeLinear);
 const resources={};
 for(const im of g.images){
  if(['body_color','body_emissive','body_orm'].includes(im.name)){
   const v=g.bufferViews[im.bufferView];
   resources[im.name]={im,viewIndex:im.bufferView,png:parsePng(original.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))};
  }
 }
 need(Object.keys(resources).length===3,'material atlas missing');
 const col=resources.body_color.png,emi=resources.body_emissive.png,orm=resources.body_orm.png;
 const previousEmission=Buffer.from(emi.data);
 emi.data.fill(0);
 for(let j=0;j<2048;j++)for(let i=0;i<2048;i++)emi.data[j*emi.stride+1+i*4+3]=255;
 const cols=Math.ceil(Math.sqrt(tri)),tile=Math.floor(2048/cols),pad=Math.max(2,Math.ceil(tile*.05)),span=tile-2*pad;
 let n=0,localEmission=0,sum=0;
 for(let fi=0;fi<tri;fi++){
  const face=body.indices.slice(fi*3,fi*3+3),P=face.map(id=>body.positions[id]),N=face.map(id=>body.normals[id]),x0=fi%cols*tile,y0=Math.floor(fi/cols)*tile;
  for(let dy=0;dy<tile;dy++)for(let dx=0;dx<tile;dx++){
   const u=(dx+.5-pad)/span,v=(dy+.5-pad)/span;
   if(u<0||v<0||u+v>1)continue;
   const weights=[1-u-v,u,v];
   const pos=[0,1,2].map(k=>P.reduce((s,p,i)=>s+p[k]*weights[i],0));
   const norm=[0,1,2].map(k=>N.reduce((s,p,i)=>s+p[k]*weights[i],0)),[x,y,z]=pos;
   // Source core bounds span x -0.172..0.174, z 0.724..1.081.
   // Confine broader pigment to the anterior surface, not the back/legs.
   const facing=Math.max(0,Math.min(1,(-norm[1]-.1)/.55));if(facing===0)continue;
   const region=(1-smooth(.065,.13,Math.abs(x)))*smooth(.76,.865,z)*(1-smooth(1.007,1.095,z));
   if(region<.003)continue;
   const a=ix(col,x0+dx,y0+dy),prev=previousEmission[a]/255;
   const oldMask=Math.max(prev/.71,0);
   const influence=clamp(Math.max(oldMask,region*spread)*facing);
   const newMask=clamp(influence);
   if(newMask<.016)continue;
   n++;sum+=newMask;
   const mix=clamp(pigment*newMask);
   for(let k=0;k<3;k++){
    const target=pigmentEncoded[k];
    col.data[a+k]=Math.round(col.data[a+k]*(1-mix)+target*mix);
    // Normal maps from actual high-poly reference remain unchanged.
    emi.data[a+k]=Math.round(pigmentEncoded[k]*newMask);
   }
   // Prevent the old deep fake ambient-occlusion channel from blackening
   // the newly transferred source pigment.
   orm.data[a]=Math.round(orm.data[a]*(1-newMask)+255*newMask);
   orm.data[a+1]=Math.round(orm.data[a+1]*(1-newMask)+238*newMask);
   localEmission++;
  }
 }
 function gutter(p){
  for(let fi=0;fi<tri;fi++){
   const x0=fi%cols*tile,y0=Math.floor(fi/cols)*tile;
   for(let dy=0;dy<tile;dy++)for(let dx=0;dx<tile;dx++){
    let u=(dx+.5-pad)/span,v=(dy+.5-pad)/span;
    if(u>=0&&v>=0&&u+v<=1)continue;
    u=Math.max(0,u);v=Math.max(0,v);if(u+v>1){let q=u+v;u/=q;v/=q;}u*=.95;v*=.95;
    const sx=clamp(Math.floor(pad+u*span),0,tile-1),sy=clamp(Math.floor(pad+v*span),0,tile-1);
    const a=ix(p,x0+dx,y0+dy),b=ix(p,x0+sx,y0+sy);
    p.data.copy(p.data,a,b,b+4);
   }
  }
 }
 gutter(col);gutter(emi);gutter(orm);
 const output=new Map([['body_color',png(col)],['body_emissive',png(emi)],['body_orm',png(orm)]]);
 const chunks=[];let total=0;
 function add(buf){let padding=(4-total%4)%4;if(padding){chunks.push(Buffer.alloc(padding));total+=padding;}const start=total;chunks.push(buf);total+=buf.length;return start}
 for(let k=0;k<g.bufferViews.length;k++){const view=g.bufferViews[k],start=view.byteOffset||0;
  const name=Object.keys(resources).find(x=>resources[x].viewIndex===k);
  const bytes=output.get(name)||original.bin.subarray(start,start+view.byteLength);
  view.byteOffset=add(bytes);view.byteLength=bytes.length;
 }
 const bin=Buffer.concat(chunks);g.buffers[0].byteLength=bin.length;
 material.emissiveFactor=[light,light*.8,light*.67];
 g.asset.generator='R36KT donor-material correct linear->sRGB color and visible anterior transfer';
 g.extras.r36kt={source:original.sha,donor:high.sha,sourceAnatomyTriangles:6044,renderTriangles:2088,coreOriginalLinearRGB:pigmentLinear,coreTextureSRGB:pigmentEncoded,
  pigments:'Donor-derived color + original high poly core normal-map retained; expanded anterior projection',
  spread,pigment,light,affectedPixels:n,averageInfluence:n?sum/n:0,meshAndUVUnchanged:true,
  caveats:['Texture cannot cover the physical gap between thighs','The expanded surface tint is an artistic source-guided feather, not a scan-calibrated anatomical map']};
 const j=Buffer.from(JSON.stringify(g)),jp=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
 const glb=Buffer.alloc(28+jp.length+bp.length);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(jp.length,12);glb.write('JSON',16);jp.copy(glb,20);
 const off=20+jp.length;glb.writeUInt32LE(bp.length,off);glb.write('BIN\0',off+4,'binary');bp.copy(glb,off+8);
 fs.writeFileSync(dest,glb);
 return {file:dest,sha256:sha(glb),bytes:glb.length,changedPixels:n,meanInfluence:n?sum/n:0,linear:pigmentLinear,srgb:pigmentEncoded,params:{spread,pigment,light}};
}
function main(){
 const [file,donor,dir]=process.argv.slice(2);need(file&&donor&&dir,'usage r36kt_pigment_spread.cjs R36KS.glb R36JB.glb FRESH_OUT');
 need(!fs.existsSync(dir),'dir exists');fs.mkdirSync(dir,{recursive:true});
 const natural=adjust(file,donor,path.join(dir,'R36KT_F11_SOURCE_SKIN_2088TRI.glb'),{spread:.85,pigment:.82,light:.92});
 const softer=adjust(file,donor,path.join(dir,'R36KT_F11_SOFT_SKIN_2088TRI.glb'),{spread:.50,pigment:.60,light:.64});
 const report={version:'R36KT',actualTriangles:2088,donorSourceMaterial:true,nominalPolygonBudget:2100,natural,softer};
 fs.writeFileSync(path.join(dir,'PRODUCTION_REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
try{main()}catch(e){console.error(e.stack||e);process.exit(1)}
