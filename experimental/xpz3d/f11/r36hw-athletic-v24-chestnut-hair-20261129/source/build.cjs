// V24 hair atlas correction. Node.js, no external dependencies.
function build(src){
 const assert=(ok,msg)=>{if(!ok)throw Error(msg)},same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]),join=xs=>{let a=new Uint8Array(xs.reduce((s,x)=>s+x.length,0)),p=0;for(const x of xs){a.set(x,p);p+=x.length}return a},be=n=>{let a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,n);return a};
 const LB=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],LE=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],DB=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],DE=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],fixed=Array.from({length:288},(_,i)=>i<144?8:i<256?9:i<280?7:8);
 function adler(x){let a=1,b=0;for(const v of x){a=(a+v)%65521;b=(b+a)%65521}return ((b<<16)|a)>>>0}
 function crc(x){let c=0xffffffff;for(const v of x){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
 function codes(lens){let count=Array(16).fill(0),next=Array(16).fill(0),c=0;for(const n of lens)if(n)count[n]++;for(let n=1;n<=15;n++){c=(c+count[n-1])<<1;next[n]=c}return lens.map(n=>n?[next[n]++,n]:null)}
 function inflate(z,max){
  assert(z.length>6&&(z[0]&15)===8&&((z[0]*256+z[1])%31)===0&&!(z[1]&32),"zlib header");
  let bit=16;const end=(z.length-4)*8,rd=n=>{assert(bit+n<=end,"deflate EOF");let v=0;for(let i=0;i<n;i++,bit++)v|=((z[bit>>3]>>(bit&7))&1)<<i;return v};
  const tree=lens=>new Map(codes(lens).flatMap((c,i)=>c?[[(1<<c[1])|c[0],i]]:[]));
  function sym(t){let c=1;for(let n=1;n<=15;n++){c=(c<<1)|rd(1);if(t.has(c))return t.get(c)}throw Error("bad Huffman code")}
  const order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],out=new Uint8Array(max);let p=0,last=0;const push=v=>{assert(p<max,"inflate overflow");out[p++]=v};
  while(!last){last=rd(1);const type=rd(2);if(type===0){bit=(bit+7)&~7;const n=rd(16);assert((n^65535)===rd(16),"stored length");for(let i=0;i<n;i++)push(rd(8));continue}let lt,dt;assert(type!==3,"block");
   if(type===1){lt=tree(fixed);dt=tree(Array(32).fill(5))}
   else{const nl=rd(5)+257,nd=rd(5)+1,nc=rd(4)+4,cl=Array(19).fill(0);for(let k=0;k<nc;k++)cl[order[k]]=rd(3);const ct=tree(cl),lens=[];while(lens.length<nl+nd){let s=sym(ct);if(s<16)lens.push(s);else{let n,v;if(s===16){assert(lens.length,"repeat");n=rd(2)+3;v=lens.at(-1)}else if(s===17){n=rd(3)+3;v=0}else{assert(s===18,"symbol");n=rd(7)+11;v=0}while(n--)lens.push(v)}assert(lens.length<=nl+nd,"length overflow")}lt=tree(lens.slice(0,nl));dt=tree(lens.slice(nl))}
   for(;;){let s=sym(lt);if(s<256){push(s);continue}if(s===256)break;let n=s-257;assert(n<LB.length,"length");let count=LB[n]+rd(LE[n]),ds=sym(dt);assert(ds<DB.length,"distance");let dist=DB[ds]+rd(DE[ds]);assert(dist<=p,"backref");while(count--)push(out[p-dist])}}
  assert(p===max&&adler(out)===new DataView(z.buffer,z.byteOffset,z.byteLength).getUint32(z.length-4),"inflate checksum");return out;
 }
 function pngDecode(bytes){assert(same(bytes.subarray(0,8),[137,80,78,71,13,10,26,10]),"PNG signature");const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=8,w,h,ch,ids=[];
  while(p+12<=bytes.length){let n=d.getUint32(p),t=String.fromCharCode(...bytes.subarray(p+4,p+8)),c=bytes.subarray(p+8,p+8+n);assert(p+12+n<=bytes.length&&crc(bytes.subarray(p+4,p+8+n))===d.getUint32(p+8+n),"PNG CRC");if(t==="IHDR"){w=d.getUint32(p+8);h=d.getUint32(p+12);ch=c[9]===2?3:c[9]===6?4:0;assert(c[8]===8&&ch&&c[12]===0,"PNG layout")}if(t==="IDAT")ids.push(c);p+=12+n;if(t==="IEND")break}
  assert(w>0&&h>0&&w<=4096&&h<=4096,"PNG dimensions");const row=w*ch,raw=inflate(join(ids),h*(row+1)),pix=new Uint8Array(h*row);let o=0;
  for(let y=0;y<h;y++){let f=raw[o++];assert(f<=4,"PNG filter");for(let x=0;x<row;x++){let i=y*row+x,a=x>=ch?pix[i-ch]:0,b=y?pix[i-row]:0,c=y&&x>=ch?pix[i-row-ch]:0,v=raw[o++];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=Math.floor((a+b)/2);else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c}pix[i]=v&255}}return {w,h,ch,pix};
 }
 function deflate(raw){const lc=codes(fixed),dc=codes(Array(32).fill(5)),bytes=[];let b=0,n=0;function put(v,k){for(let i=0;i<k;i++){b|=((v>>i)&1)<<n;if(++n===8){bytes.push(b);b=0;n=0}}}function code(c){for(let k=c[1]-1;k>=0;k--)put((c[0]>>k)&1,1)}
  put(1,1);put(1,2);const last=new Int32Array(65536).fill(-1),hash=i=>((raw[i]*251+raw[i+1])*251+raw[i+2])&65535;let p=0;
  while(p<raw.length){let run=0,dist=0;if(p+2<raw.length){const h=hash(p),q=last[h];if(q>=0&&p-q<=32768){let m=Math.min(258,raw.length-p);while(run<m&&raw[p+run]===raw[q+run])run++;dist=p-q}}
   if(run>=3){let a=0,b=0;while(a+1<LB.length&&LB[a+1]<=run)a++;while(b+1<DB.length&&DB[b+1]<=dist)b++;code(lc[257+a]);put(run-LB[a],LE[a]);code(dc[b]);put(dist-DB[b],DE[b]);for(let k=0;k<run&&p+k+2<raw.length;k++)last[hash(p+k)]=p+k;p+=run}
   else{code(lc[raw[p]]);if(p+2<raw.length)last[hash(p)]=p;p++}}
  code(lc[256]);if(n)bytes.push(b);return join([Uint8Array.of(0x78,0x01),Uint8Array.from(bytes),be(adler(raw))]);
 }
 function pngEncode(w,h,ch,pix){const row=w*ch,raw=new Uint8Array(h*(row+1));for(let y=0;y<h;y++){let best=null,score=Infinity,bestF=0;for(let f=0;f<=2;f++){let a=new Uint8Array(row),s=0;for(let x=0;x<row;x++){let i=y*row+x,v=(pix[i]-(f===1&&x>=ch?pix[i-ch]:f===2&&y?pix[i-row]:0))&255;a[x]=v;s+=Math.min(v,256-v)}if(s<score){score=s;best=a;bestF=f}}let o=y*(row+1);raw[o]=bestF;raw.set(best,o+1)}
  const z=deflate(raw);assert(same(inflate(z,raw.length),raw),"encoded deflate roundtrip");const chunk=(t,c)=>{const data=join([Uint8Array.from([...t].map(x=>x.charCodeAt(0))),c]);return join([be(c.length),data,be(crc(data))])};
  const ihdr=join([be(w),be(h),Uint8Array.of(8,ch===3?2:6,0,0,0)]);return join([Uint8Array.of(137,80,78,71,13,10,26,10),chunk("IHDR",ihdr),chunk("IDAT",z),chunk("IEND",new Uint8Array(0))]);
 }
 const d=new DataView(src.buffer,src.byteOffset,src.byteLength),jl=d.getUint32(12,true),base=28+jl;
 assert(d.getUint32(0,true)===0x46546c67&&d.getUint32(4,true)===2&&d.getUint32(8,true)===src.length&&d.getUint32(16,true)===0x4e4f534a&&d.getUint32(24+jl,true)===0x004e4942&&base+d.getUint32(20+jl,true)===src.length,"GLB");
 const j=JSON.parse(String.fromCharCode(...src.subarray(20,20+jl))),orig=JSON.parse(JSON.stringify(j)),bin=src.subarray(base),image=j.images[j.textures[j.materials[1].pbrMetallicRoughness.baseColorTexture.index].source],vi=image.bufferView,v=j.bufferViews[vi];
 assert(vi===7&&image.mimeType==="image/png"&&j.materials[18].alphaMode==="OPAQUE"&&j.skins[0].joints.length===63,"source");
 const old=pngDecode(bin.subarray(v.byteOffset,v.byteOffset+v.byteLength)),pix=old.pix.slice(),npx=old.w*old.h,clamp=x=>Math.max(0,Math.min(255,Math.round(x)));
 assert(old.w===256&&old.h===256&&old.ch===3,"hair layout");
 const sums0=[0,0,0],sums1=[0,0,0];let green0=0,green1=0,changed=0,lo=255,hi=0;
 for(let i=0;i<pix.length;i+=old.ch){const r=pix[i],g=pix[i+1],b=pix[i+2],l=.2126*r+.7152*g+.0722*b;lo=Math.min(lo,l);hi=Math.max(hi,l);const rgb=[clamp(1.52*l+6),clamp(1.05*l+3),clamp(.68*l+1)];if(g>r+5&&g>b+5)green0++;if(rgb[1]>rgb[0]+5&&rgb[1]>rgb[2]+5)green1++;if(rgb.some((v,k)=>v!==pix[i+k]))changed++;for(let k=0;k<3;k++){sums0[k]+=pix[i+k];pix[i+k]=rgb[k];sums1[k]+=rgb[k]}}
 assert(green0>0&&green1===0&&changed>npx*.9,"recolor did not improve green cast");
 const png=pngEncode(old.w,old.h,old.ch,pix),round=pngDecode(png);assert(same(round.pix,pix),"PNG roundtrip");
 const start=v.byteOffset,oldEnd=(start+v.byteLength+3)&~3,newEnd=(start+png.length+3)&~3,pad=new Uint8Array(newEnd-start-png.length),shift=newEnd-oldEnd,newBin=join([bin.subarray(0,start),png,pad,bin.subarray(oldEnd)]);
 v.byteLength=png.length;for(let k=0;k<j.bufferViews.length;k++)if(k!==vi){const w=j.bufferViews[k],o=w.byteOffset||0;assert(o+w.byteLength<=start||o>=oldEnd,"overlapping views");if(o>=oldEnd)w.byteOffset=o+shift}
 j.buffers[0].byteLength=newBin.length;image.name="F11 V24 chestnut hair strand atlas";j.asset.generator="R36HW V24 chestnut hair atlas correction";
 let preserved=0;for(let k=0;k<j.bufferViews.length;k++)if(k!==vi){const a=orig.bufferViews[k],b=j.bufferViews[k],ao=a.byteOffset||0,bo=b.byteOffset||0;assert(same(bin.subarray(ao,ao+a.byteLength),newBin.subarray(bo,bo+b.byteLength)),"non-hair view changed");preserved++}
 for(const k of ["meshes","skins","nodes","accessors","materials","textures","samplers"])assert(JSON.stringify(j[k])===JSON.stringify(orig[k]),k+" changed");
 const triangles=j.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+j.accessors[p.indices].count/3,0);assert(triangles===2100,"triangle budget");
 const js=JSON.stringify(j),jb=new Uint8Array((js.length+3)&~3).fill(32);for(let i=0;i<js.length;i++){assert(js.charCodeAt(i)<128,"non ASCII");jb[i]=js.charCodeAt(i)}
 const glb=new Uint8Array(28+jb.length+newBin.length),h=new DataView(glb.buffer);[0x46546c67,2,glb.length,jb.length,0x4e4f534a].forEach((x,i)=>h.setUint32(i*4,x,true));glb.set(jb,20);h.setUint32(20+jb.length,newBin.length,true);h.setUint32(24+jb.length,0x004e4942,true);glb.set(newBin,28+jb.length);
 return {glb,png,report:{schema:"r36hw-v24-chestnut-hair-v1",sourceBlob:"285a8539e2687d47f7ca65a034605b0eeec93ead",sourceVersion:"V21",sourceBytes:src.length,outputBytes:glb.length,triangles,joints:63,hairAtlas:{width:old.w,height:old.h,oldBytes:orig.bufferViews[vi].byteLength,newBytes:png.length,changedPixels:changed,totalPixels:npx,oldAverageRgb:sums0.map(v=>+(v/npx).toFixed(2)),newAverageRgb:sums1.map(v=>+(v/npx).toFixed(2)),oldGreenDominantPixels:green0,newGreenDominantPixels:green1,sourceLumaRange:[lo,hi],paletteMapping:"RGB = [1.52L+6, 1.05L+3, 0.68L+1], clamped; L = source Rec.709 weighted byte intensity",pngRoundtripExact:true},preservedNonHairBufferViews:preserved,geometryRigMaterialsUnchanged:true,faceAndSkinUnchanged:true,opaqueOutfitUnchanged:true,nativeRender:false,referenceColorCalibration:false}};
}
module.exports={build};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const input=process.argv[2],out=process.argv[3]||path.resolve(__dirname,'../output');if(!input)throw Error('Usage: node build.cjs V21.glb [output directory]');const b=fs.readFileSync(input),sha=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');if(sha!=='285a8539e2687d47f7ca65a034605b0eeec93ead')throw Error('Wrong source '+sha);const r=build(b);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'R36HW_F11_ATHLETIC_SUIT_V24_CHESTNUT.glb'),r.glb);fs.writeFileSync(path.join(out,'hair-chestnut.png'),r.png);const reports=path.resolve(out,'../reports');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'build.json'),JSON.stringify(r.report,null,2)+'\n');}
