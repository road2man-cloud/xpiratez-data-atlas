// R36HW V18: deterministic opaque apparel UV print bake, Node.js.
function build(src){
 const concat=(...a)=>{const b=new Uint8Array(a.reduce((s,v)=>s+v.length,0));let i=0;for(const v of a){b.set(v,i);i+=v.length}return b},utf=s=>Uint8Array.from([...s].map(c=>c.charCodeAt(0))),u32=(n,le=false)=>{const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,n,le);return a},pad=(a,f=0)=>{const b=new Uint8Array((a.length+3)&~3);b.fill(f);b.set(a);return b},same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
 const dv=new DataView(src.buffer,src.byteOffset,src.byteLength),l=dv.getUint32(12,true),base=28+l;
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==src.length||dv.getUint32(16,true)!==0x4e4f534a||dv.getUint32(24+l,true)!==0x004e4942||base+dv.getUint32(20+l,true)!==src.length)throw Error("invalid source");
 const j=JSON.parse(String.fromCharCode(...src.subarray(20,20+l))),old=JSON.parse(JSON.stringify(j)),bin=src.slice(base),prim=j.meshes[0].primitives.find(p=>p.material===18);
 if(!prim||prim.attributes.POSITION!==34||prim.attributes.TEXCOORD_0!==39||prim.indices!==41||j.skins[0].joints.length!==63||j.materials[18].alphaMode!=="OPAQUE")throw Error("unexpected model");
 const tris=j.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+j.accessors[p.indices].count/3,0);if(tris!==2100)throw Error("triangle count");
 function read(id){const a=j.accessors[id],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],sz={5121:1,5123:2,5126:4}[a.componentType];return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>{const o=base+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*sz)+k*sz;return sz===1?dv.getUint8(o):sz===2?dv.getUint16(o,true):dv.getFloat32(o,true)}))}
 const p=read(34),uv=read(39),ix=read(41).flat(),W=512,H=512,tex=new Uint8Array(W*H*3).fill(255),mask=new Uint8Array(W*H),features=new Uint8Array(W*H);let overlap=0,deg=0;
 // All print details are apparel design elements, evaluated in model space, then baked into UV space.
 function print(x,y,z){
   const ax=Math.abs(x),front=1-smooth(-.073,-.022,y),torso=(1-smooth(.15,.205,ax))*smooth(1.03,1.10,z)*(1-smooth(1.48,1.53,z));
   // One continuous chest chevron, broad chest panel, narrow decorative edge.
   const chestLine=1.385+.27*ax;
   const chest=front*torso*(1-smooth(.018,.038,Math.abs(z-chestLine)));
   const edge=front*torso*(1-smooth(.002,.007,Math.abs(Math.abs(z-chestLine)-.027)));
   // Waist seam follows the garment, front and rear, not skin anatomy.
   const waist=(1-smooth(.15,.205,ax))*(1-smooth(.008,.019,Math.abs(z-1.055)));
   // A small geometric diamond emblem at mid-torso, printed on the fabric.
   const dm=Math.abs(x)/.023+Math.abs(z-1.205)/.025;
   const logo=front*(1-smooth(.78,1.1,dm)),logoInner=front*(1-smooth(.31,.52,dm));
   const side=smooth(.115,.175,ax)*smooth(1.10,1.17,z)*(1-smooth(1.38,1.45,z));
   let out=[1,1,1];
   for(let k=0;k<3;k++){
     out[k]*=1-chest*[.20,.25,.32][k];
     out[k]*=1-edge*[.34,.38,.41][k];
     out[k]*=1-waist*[.38,.43,.50][k];
     out[k]*=1-side*[.10,.15,.20][k];
     out[k]=out[k]*(1-logo)+[.42,.50,.62][k]*logo;
     out[k]=out[k]*(1-logoInner)+[.98,.92,.77][k]*logoInner;
   }
   const feature=logo>.12?3:waist>.12?2:chest>.12||edge>.12?1:side>.12?4:0;
   return {rgb:out.map(v=>Math.round(clamp(v,0,1)*255)),feature};
 }
 for(let q=0;q<ix.length;q+=3){
   const ids=ix.slice(q,q+3),a=uv[ids[0]].map(v=>v*W),b=uv[ids[1]].map(v=>v*W),c=uv[ids[2]].map(v=>v*W);
   const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9){deg++;continue}
   const x0=clamp(Math.floor(Math.min(a[0],b[0],c[0])),0,W-1),x1=clamp(Math.ceil(Math.max(a[0],b[0],c[0])),0,W-1),y0=clamp(Math.floor(Math.min(a[1],b[1],c[1])),0,H-1),y1=clamp(Math.ceil(Math.max(a[1],b[1],c[1])),0,H-1);
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
     const px=x+.5,py=y+.5,w0=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den,w1=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den,w2=1-w0-w1;
     if(Math.min(w0,w1,w2)<-1e-7)continue;
     const i=y*W+x;if(mask[i])overlap++;
     const pt=[0,1,2].map(k=>p[ids[0]][k]*w0+p[ids[1]][k]*w1+p[ids[2]][k]*w2),d=print(...pt);
     tex.set(d.rgb,i*3);mask[i]=1;features[i]=d.feature;
   }
 }
 const covered=mask.reduce((a,b)=>a+b,0),counts={chestChevron:0,waistSeam:0,diamondEmblem:0,sidePanel:0};for(let i=0;i<mask.length;i++)if(mask[i]&&features[i])counts[["chestChevron","waistSeam","diamondEmblem","sidePanel"][features[i]-1]]++;
 if(covered<10000||Object.values(counts).some(n=>n<5))throw Error("missing print coverage "+JSON.stringify(counts));
 let padded=0;for(let pass=0;pass<4;pass++){const prev=mask.slice();for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(prev[i])continue;const ns=[];if(x>0)ns.push(i-1);if(x<W-1)ns.push(i+1);if(y>0)ns.push(i-W);if(y<H-1)ns.push(i+W);const a=ns.find(k=>prev[k]);if(a!==undefined){tex.set(tex.subarray(a*3,a*3+3),i*3);mask[i]=1;padded++}}}
 const raw=new Uint8Array(H*(1+W*3));for(let y=0;y<H;y++)raw.set(tex.subarray(y*W*3,(y+1)*W*3),y*(1+W*3)+1);
 function deflate(data){
  const bytes=[];let acc=0,bits=0;const write=(n,k)=>{acc|=n<<bits;bits+=k;while(bits>=8){bytes.push(acc&255);acc>>>=8;bits-=8}},rev=(v,n)=>{let r=0;for(let i=0;i<n;i++){r=(r<<1)|(v&1);v>>>=1}return r};
  const lit=v=>{if(v<144)write(rev(48+v,8),8);else if(v<256)write(rev(400+v-144,9),9);else if(v<280)write(rev(v-256,7),7);else write(rev(192+v-280,8),8)};
  const L=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],LE=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],D=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],DE=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const hash=i=>data[i]*65536+data[i+1]*256+data[i+2],dict=new Map();write(1,1);write(1,2);
  for(let i=0;i<data.length;){let n=0,d=0;if(i+2<data.length){const k=hash(i),p=dict.get(k);if(p!==undefined&&i-p<=32768){let m=0;while(m<258&&i+m<data.length&&data[p+m]===data[i+m])m++;if(m>=3){n=m;d=i-p}}}
    if(n>=3){let l=L.length-1;while(L[l]>n)l--;lit(257+l);write(n-L[l],LE[l]);let e=D.length-1;while(D[e]>d)e--;write(rev(e,5),5);write(d-D[e],DE[e]);for(let k=0;k<n&&i+k+2<data.length;k++)dict.set(hash(i+k),i+k);i+=n}else{lit(data[i]);if(i+2<data.length)dict.set(hash(i),i);i++}}
  lit(256);if(bits)bytes.push(acc&255);let a=1,b=0;for(const v of data){a=(a+v)%65521;b=(b+a)%65521}return concat(Uint8Array.of(0x78,0x01),Uint8Array.from(bytes),u32((b<<16)|a))
 }
 const crc=a=>{let c=0xffffffff;for(const x of a){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0},chunk=(type,data)=>{const b=concat(utf(type),data);return concat(u32(data.length),b,u32(crc(b)))};
 const z=deflate(raw);
 // Independent decoder for this single fixed-Huffman DEFLATE stream.
 function inflateFixed(z,expected){
  let bit=16;const rd=n=>{let v=0;for(let i=0;i<n;i++,bit++)v|=((z[bit>>3]>>(bit&7))&1)<<i;return v},rev=(v,n)=>{let r=0;for(let i=0;i<n;i++){r=(r<<1)|(v&1);v>>>=1}return r},table=new Map();
  for(let v=0;v<288;v++){let n,c;if(v<144){n=8;c=48+v}else if(v<256){n=9;c=400+v-144}else if(v<280){n=7;c=v-256}else{n=8;c=192+v-280}table.set(n*1024+rev(c,n),v)}
  const L=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],LE=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],D=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],DE=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  if(rd(1)!==1||rd(2)!==1)throw Error("deflate header");const out=new Uint8Array(expected.length);let p=0;
  for(;;){let c=0,v;for(let n=1;n<=9;n++){c|=rd(1)<<(n-1);if(table.has(n*1024+c)){v=table.get(n*1024+c);break}}if(v===undefined)throw Error("invalid symbol");if(v===256)break;if(v<256){if(p>=out.length)throw Error("overflow");out[p++]=v}else{const i=v-257,n=L[i]+rd(LE[i]),k=rev(rd(5),5),d=D[k]+rd(DE[k]);if(d>p||p+n>out.length)throw Error("bad reference");for(let a=0;a<n;a++){out[p]=out[p-d];p++}}}if(p!==expected.length||!same(out,expected))throw Error("PNG roundtrip mismatch");
 }
 inflateFixed(z,raw);
 const png=concat(Uint8Array.of(137,80,78,71,13,10,26,10),chunk("IHDR",concat(u32(W),u32(H),Uint8Array.of(8,2,0,0,0))),chunk("IDAT",z),chunk("IEND",new Uint8Array()));
 // Append one new image; existing binary and all original views remain byte-identical.
 const imageView=j.bufferViews.length,imageIndex=j.images.length,textureIndex=j.textures.length;
 j.bufferViews.push({buffer:0,byteOffset:bin.length,byteLength:png.length});
 j.images.push({bufferView:imageView,mimeType:"image/png",name:"V18 printed sportswear panels RGB"});
 j.textures.push({sampler:3,source:imageIndex});
 const mat=j.materials[18];mat.name="R36HW_V18_OPAQUE_PRINTED_OCHRE_SPORTSWEAR";mat.pbrMetallicRoughness.baseColorFactor=[.56,.34,.14,1];mat.pbrMetallicRoughness.baseColorTexture={index:textureIndex,texCoord:0};mat.alphaMode="OPAQUE";
 const newBin=concat(bin,pad(png));j.buffers[0].byteLength=newBin.length;j.asset.generator="R36HW V18 UV print bake";
 if(!same(newBin.subarray(0,bin.length),bin)||JSON.stringify(old.accessors)!==JSON.stringify(j.accessors)||JSON.stringify(old.nodes)!==JSON.stringify(j.nodes)||JSON.stringify(old.skins)!==JSON.stringify(j.skins)||JSON.stringify(old.meshes)!==JSON.stringify(j.meshes))throw Error("source geometry altered");
 const jb=pad(utf(JSON.stringify(j)),32),glb=concat(u32(0x46546c67,true),u32(2,true),u32(28+jb.length+newBin.length,true),u32(jb.length,true),u32(0x4e4f534a,true),jb,u32(newBin.length,true),u32(0x004e4942,true),newBin);
 return {glb,png,report:{schema:"r36hw-v18-print-v1",sourceBlob:"c1aef49ea29fd67e2c34a841aaf2f9d147c72b1f",sourceBytes:src.length,outputBytes:glb.length,triangles:tris,joints:j.skins[0].joints.length,garmentVertices:p.length,uvTriangles:ix.length/3,degenerateUvTriangles:deg,coveredTexels:covered,overlapSamples:overlap,paddingTexels:padded,features:counts,texture:{width:W,height:H,channels:3,bytes:png.length,imageIndex,textureIndex,imageView,decodedPixelRoundtrip:true},sourcePalette:{file:"body500_F11_pir.gif",size:[320,200],background:[0,255,0],nonBackgroundPixels:2650,frequentColors:[{rgb:[124,80,36],count:339},{rgb:[136,96,44],count:328},{rgb:[112,68,28],count:291},{rgb:[104,56,24],count:256},{rgb:[92,44,16],count:244},{rgb:[148,112,56],count:200}],usage:"visual hue reference only; not photometric calibration"},materialBefore:old.materials[18],materialAfter:mat,allOriginalBinaryBytesPreserved:true,originalViewsPreserved:old.bufferViews.length,newViews:1,meshRigUvUnchanged:true,opaque:true,nativeS2:false,nativeRender:false,visualApproval:false}};
}
module.exports={build};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const input=process.argv[2],out=process.argv[3]||path.join(__dirname,'../output');if(!input)throw Error('Usage: node build.cjs V17.glb [output dir]');const b=fs.readFileSync(input),hash=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');if(hash!=='c1aef49ea29fd67e2c34a841aaf2f9d147c72b1f')throw Error('Bad source blob '+hash);const r=build(b);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'R36HW_F11_ATHLETIC_SUIT_V18_PRINT.glb'),r.glb);fs.writeFileSync(path.join(out,'athletic-basecolor-v18.png'),r.png);const reports=path.resolve(out,'../reports');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'build.json'),JSON.stringify(r.report,null,2)+'\n');console.log(JSON.stringify(r.report,null,2));}
