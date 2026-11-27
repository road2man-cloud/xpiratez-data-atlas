'use strict';
/* R36KO: Repair adjacent triangle UV atlas gutters without re-decimating or
 * resampling the source surface. The unfilled outside-triangle pixels in the
 * previous bake caused black mipmap bleed; preserve every inside-triangle pixel.
 */
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const {load}=require('./glb_io.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function need(ok,msg){if(!ok)throw Error(msg)}
function crc(buf){let x=0xffffffff;for(const b of buf){x^=b;for(let k=0;k<8;k++)x=(x>>>1)^((x&1)?0xedb88320:0);}return (x^0xffffffff)>>>0;}
function chunk(tag,bytes){const name=Buffer.from(tag),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(bytes.length);c.writeUInt32BE(crc(Buffer.concat([name,bytes])));return Buffer.concat([n,name,bytes,c]);}
function parsePng(raw){
 need(raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG signature');
 let pos=8,width=0,height=0,idat=[],meta=null;
 while(pos<raw.length){const n=raw.readUInt32BE(pos),tag=raw.toString('ascii',pos+4,pos+8),data=raw.subarray(pos+8,pos+8+n);pos+=n+12;
 if(tag==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);meta=Buffer.from(data);need(data[8]===8&&data[9]===6&&data[12]===0,'expected RGBA8 noninterlaced');}
 if(tag==='IDAT')idat.push(data);if(tag==='IEND')break;}
 const pix=zlib.inflateSync(Buffer.concat(idat));need(pix.length===(width*4+1)*height,'PNG scanline size');
 for(let y=0;y<height;y++)need(pix[y*(width*4+1)]===0,'expected PNG filter 0');
 return {width,height,meta,pix};
}
function encodePng({meta,pix}){return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',meta),chunk('IDAT',zlib.deflateSync(pix,{level:7})),chunk('IEND',Buffer.alloc(0))]);}
function fixPng(data,triCount){
 const {width,height,pix,meta}=parsePng(data);
 need(width===height&&width===2048,'atlas must be 2048²');
 const cols=Math.ceil(Math.sqrt(triCount)),tile=Math.floor(width/cols),pad=Math.max(2,Math.ceil(tile*.05)),span=tile-2*pad;
 const rowPitch=width*4+1;
 const off=(x,y)=>y*rowPitch+1+4*x;
 let repaired=0,previousBlack=0,afterBlack=0,tiles=0;
 for(let fi=0;fi<triCount;fi++){
  const gx=fi%cols,gy=Math.floor(fi/cols),x0=gx*tile,y0=gy*tile;
  if(x0+tile>width||y0+tile>height)throw Error('tile bounds');
  for(let y=0;y<tile;y++){
   for(let x=0;x<tile;x++){
    const u=(x+.5-pad)/span,v=(y+.5-pad)/span;
    if(u>=0&&v>=0&&u+v<=1)continue; // preserve high-poly baked samples
    let a=Math.max(0,u),b=Math.max(0,v);
    if(a+b>1){const sum=a+b;a/=sum;b/=sum;}
    // Keep the gutter source at least two texels inside the triangle boundary.
    const inward=Math.max(0,1-3/span);a*=inward;b*=inward;
    let sx=Math.min(tile-1,Math.max(0,Math.floor(pad+a*span)));
    let sy=Math.min(tile-1,Math.max(0,Math.floor(pad+b*span)));
    if((sx+.5-pad)/span+(sy+.5-pad)/span>1){if(sx>pad)sx--;else if(sy>pad)sy--;}
    const to=off(x0+x,y0+y),from=off(x0+sx,y0+sy);
    if(pix[to]===0&&pix[to+1]===0&&pix[to+2]===0)previousBlack++;
    pix.copy(pix,to,from,from+4);repaired++;
    if(pix[to]===0&&pix[to+1]===0&&pix[to+2]===0)afterBlack++;
   }
  }tiles++;
 }
 return {bytes:encodePng({meta,pix}),report:{triCount,cols,tile,pad,span,repaired,previousBlack,afterBlack}};
}
function emitGlb(g,bin,dst){
 const json=Buffer.from(JSON.stringify(g),'utf8'),jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
 const out=Buffer.alloc(28+jp.length+bp.length);
 out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
 out.writeUInt32LE(jp.length,12);out.write('JSON',16);jp.copy(out,20);
 const index=20+jp.length;out.writeUInt32LE(bp.length,index);out.write('BIN\0',index+4,'binary');bp.copy(out,index+8);
 fs.writeFileSync(dst,out);return {bytes:out.length,sha256:sha(out)};
}
function run(){
 const src=path.resolve(process.argv[2]||''),dst=path.resolve(process.argv[3]||'');
 need(fs.existsSync(src)&&!fs.existsSync(dst),'source missing or destination exists');
 const q=load(src),g=q.g,old=q.bin,viewUpdates=new Map(),results=[],targetNames=new Map();
 const imageViews=new Map();
 for(let i=0;i<g.images.length;i++){
  const image=g.images[i],name=(image.name||'');
  const m=name.match(/^(body)_(color|normal|orm)$/);
  if(m)imageViews.set(image.bufferView,{name,triangles:1120});
 }
 need(imageViews.size===3,'expected three baked maps but found '+imageViews.size);
 const outDir=path.dirname(dst),texDir=path.join(outDir,'textures');
 fs.mkdirSync(texDir,{recursive:true});
 const pieces=[],align=(n)=>Math.ceil(n/4)*4;let off=0;
 for(let i=0;i<g.bufferViews.length;i++){
  const view=g.bufferViews[i],o=view.byteOffset||0,n=view.byteLength;
  need(o+n<=old.length,'bufferView out of range');
  let bytes=old.subarray(o,o+n),result;
  if(imageViews.has(i)){
   const info=imageViews.get(i);result=fixPng(bytes,info.triangles);
   bytes=result.bytes;
   const file=path.join(texDir,info.name+'_SEAMFIX_2048.png');fs.writeFileSync(file,bytes);
   results.push({name:info.name,file:path.relative(outDir,file),original:n,updated:bytes.length,sha256:sha(bytes),...result.report});
  }
  const padding=align(off)-off;if(padding){pieces.push(Buffer.alloc(padding));off+=padding;}
  view.byteOffset=off;view.byteLength=bytes.length;pieces.push(bytes);off+=bytes.length;
 }
 const packed=Buffer.concat(pieces);g.buffers[0].byteLength=packed.length;
 g.asset.generator='R36KO 2100 atlas-gutter repair + original highpoly reprojection';
 g.extras.r36koAtlasFix={version:'R36KO-LP2100-SEAMFIX',repairedImages:results.map(x=>x.name),transparent:false,
  activeTriangles:2098,notes:['Source body/core geometry untouched','Every triangle interior texel preserved','Gutters copied from verified inside-triangle texels; prevents black mipmap bleed','Not a topology seam weld']};
 const output=emitGlb(g,packed,dst);
 const report={source:src,destination:dst,originalSha256:q.sha,output,textureRepair:results,geometryChanged:false,bindingChanged:false};
 fs.writeFileSync(path.join(outDir,'R36KO_2100_SEAMFIX_REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output,repaired:results.map(x=>({name:x.name,previousBlack:x.previousBlack,afterBlack:x.afterBlack,repairedPixels:x.repaired}))},null,2));
}
run();
