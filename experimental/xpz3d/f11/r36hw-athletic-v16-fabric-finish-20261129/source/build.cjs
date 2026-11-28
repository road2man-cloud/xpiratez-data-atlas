// R36HW V16. Node.js, no dependencies.
function build(src){
  const concat=(...a)=>{const b=new Uint8Array(a.reduce((s,v)=>s+v.length,0));let i=0;for(const v of a){b.set(v,i);i+=v.length}return b};
  const utf8=s=>{const a=[];for(const c of s){let n=c.codePointAt(0);if(n<128)a.push(n);else if(n<2048)a.push(192|(n>>6),128|(n&63));else if(n<65536)a.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else a.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63))}return Uint8Array.from(a)};
  const str=a=>{let s="";for(let i=0;i<a.length;){let x=a[i++],n=x;if(x>=240)n=((x&7)<<18)|((a[i++]&63)<<12)|((a[i++]&63)<<6)|(a[i++]&63);else if(x>=224)n=((x&15)<<12)|((a[i++]&63)<<6)|(a[i++]&63);else if(x>=192)n=((x&31)<<6)|(a[i++]&63);s+=String.fromCodePoint(n)}return s};
  const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  const u32=(n,le=false)=>{const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,n,le);return a};
  const pad=(a,f=0)=>{const b=new Uint8Array((a.length+3)&~3);b.fill(f);b.set(a);return b};
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const smooth=(a,b,x)=>{let t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
  const dv=new DataView(src.buffer,src.byteOffset,src.byteLength);
  if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==src.length)throw Error("Bad GLB");
  const len=dv.getUint32(12,true),binlen=dv.getUint32(20+len,true);
  if(dv.getUint32(16,true)!==0x4e4f534a||dv.getUint32(24+len,true)!==0x004e4942||28+len+binlen!==src.length)throw Error("Bad chunks");
  const j=JSON.parse(str(src.subarray(20,20+len))),original=JSON.parse(JSON.stringify(j)),old=src.slice(28+len,28+len+binlen),bin=old.slice(),b=new DataView(bin.buffer);
  const prim=j.meshes[0].primitives.find(p=>p.material===18);
  if(!prim||prim.attributes.POSITION!==34||prim.attributes.COLOR_0!==38||prim.attributes.TEXCOORD_0!==39||j.skins[0].joints.length!==63)throw Error("Unexpected layout");
  const triangles=j.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+j.accessors[p.indices].count/3,0);
  if(triangles!==2100||j.accessors[34].count!==706)throw Error("Unexpected counts");
  const pv=j.bufferViews[j.accessors[34].bufferView],cv=j.bufferViews[j.accessors[38].bufferView];
  if(j.accessors[38].componentType!==5121||!j.accessors[38].normalized||j.accessors[34].componentType!==5126)throw Error("Unexpected types");
  const base=(a,v,i,stride)=> (v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||stride);
  const pa=j.accessors[34],ca=j.accessors[38];
  let changed=0,counts={sleeveCuff:0,ankleCuff:0,collar:0,lowerLegSide:0},opaque=true;
  for(let i=0;i<pa.count;i++){
    const k=base(pa,pv,i,12),q=base(ca,cv,i,4);
    const x=b.getFloat32(k,true),y=b.getFloat32(k+4,true),z=b.getFloat32(k+8,true);
    const sleeve=smooth(.60,.72,Math.abs(x))*smooth(1.25,1.33,z);
    const ankle=1-smooth(.13,.24,z);
    const collar=smooth(1.49,1.53,z)*(1-smooth(.085,.14,Math.abs(x)));
    const side=smooth(.125,.175,Math.abs(x))*smooth(.25,.36,z)*(1-smooth(.61,.74,z));
    const t=Math.max(sleeve,ankle,collar,side*.65);
    if(sleeve>.1)counts.sleeveCuff++;if(ankle>.1)counts.ankleCuff++;if(collar>.1)counts.collar++;if(side>.1)counts.lowerLegSide++;
    let diff=false;
    for(let c=0;c<3;c++){const v=bin[q+c],target=Math.round(v*(1-t*[.67,.57,.45][c]));if(v!==target){bin[q+c]=target;diff=true}}
    if(bin[q+3]!==255)throw Error("Source color alpha not opaque");
    if(diff)changed++;
  }
  // Small periodic, non-directional fabric microfinish. RGB truecolor PNG, not an anatomy bake.
  const W=512,H=512,raw=new Uint8Array(H*(1+W*3));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=y*(1+W*3)+1+x*3;
    const a=2*Math.PI*((x+y)%8)/8,c=2*Math.PI*((x-y+8000)%8)/8;
    const nx=.035*Math.sin(a)+.013*Math.sin(c),ny=.035*Math.sin(a)-.013*Math.sin(c),nz=Math.sqrt(1-nx*nx-ny*ny);
    raw[p]=Math.round((nx*.5+.5)*255);raw[p+1]=Math.round((ny*.5+.5)*255);raw[p+2]=Math.round((nz*.5+.5)*255);
  }
  // zlib stream using fixed-Huffman DEFLATE with deterministic LZ77 dictionary.
  function deflate(data){
    const bytes=[];let acc=0,bits=0;const write=(n,k)=>{acc|=n<<bits;bits+=k;while(bits>=8){bytes.push(acc&255);acc>>>=8;bits-=8}};
    const rev=(v,n)=>{let r=0;for(let i=0;i<n;i++){r=(r<<1)|(v&1);v>>>=1}return r};
    const lit=v=>{if(v<144)write(rev(48+v,8),8);else if(v<256)write(rev(400+v-144,9),9);else if(v<280)write(rev(v-256,7),7);else write(rev(192+v-280,8),8)};
    const L=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],LE=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],D=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],DE=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
    const hash=i=>data[i]*65536+data[i+1]*256+data[i+2];
    const dict=new Map();write(1,1);write(1,2);
    for(let i=0;i<data.length;){let n=0,d=0;if(i+2<data.length){const k=hash(i),p=dict.get(k);if(p!==undefined&&i-p<=32768){let m=0;while(m<258&&i+m<data.length&&data[p+m]===data[i+m])m++;if(m>=3){n=m;d=i-p}}}
      if(n>=3){let l=L.length-1;while(L[l]>n)l--;lit(257+l);write(n-L[l],LE[l]);let e=D.length-1;while(D[e]>d)e--;write(rev(e,5),5);write(d-D[e],DE[e]);for(let k=0;k<n&&i+k+2<data.length;k++)dict.set(hash(i+k),i+k);i+=n}
      else{lit(data[i]);if(i+2<data.length)dict.set(hash(i),i);i++}
    }lit(256);if(bits)bytes.push(acc&255);
    let a=1,b=0;for(const v of data){a=(a+v)%65521;b=(b+a)%65521}return concat(Uint8Array.of(0x78,0x01),Uint8Array.from(bytes),u32((b<<16)|a));
  }
  const crc=a=>{let c=0xffffffff;for(const x of a){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0};
  const chunk=(type,data)=>{const b=concat(utf8(type),data);return concat(u32(data.length),b,u32(crc(b)))};
  const png=concat(Uint8Array.of(137,80,78,71,13,10,26,10),chunk("IHDR",concat(u32(W),u32(H),Uint8Array.of(8,2,0,0,0))),chunk("IDAT",deflate(raw)),chunk("IEND",new Uint8Array()));
  // Self-test the exact PNG zlib stream with an independent fixed-Huffman decoder.
  function inflateFixed(z,expected){
    let bit=16;const rd=n=>{let v=0;for(let i=0;i<n;i++,bit++)v|=((z[bit>>3]>>(bit&7))&1)<<i;return v};
    const rev=(v,n)=>{let r=0;for(let i=0;i<n;i++){r=(r<<1)|(v&1);v>>>=1}return r};
    const table=new Map();for(let v=0;v<288;v++){let n,c;if(v<144){n=8;c=48+v}else if(v<256){n=9;c=400+v-144}else if(v<280){n=7;c=v-256}else{n=8;c=192+v-280}table.set(n*1024+rev(c,n),v)}
    const L=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],LE=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],D=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],DE=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
    if(rd(1)!==1||rd(2)!==1)throw Error("Unexpected deflate header");
    const out=new Uint8Array(expected.length);let p=0;
    for(;;){let c=0,v;for(let n=1;n<=9;n++){c|=rd(1)<<(n-1);if(table.has(n*1024+c)){v=table.get(n*1024+c);break}}if(v===undefined)throw Error("Invalid Huffman symbol");if(v===256)break;if(v<256){if(p>=out.length)throw Error("Overflow");out[p++]=v}else{const i=v-257,n=L[i]+rd(LE[i]),k=rev(rd(5),5),d=D[k]+rd(DE[k]);if(d>p||p+n>out.length)throw Error("Invalid backreference");for(let a=0;a<n;a++){out[p]=out[p-d];p++}}}
    if(p!==out.length||!same(out,expected))throw Error("PNG decoded bytes mismatch");
  }
  const idatLen=new DataView(png.buffer).getUint32(33,false);
  inflateFixed(png.subarray(41,41+idatLen),raw);
  const normalView=j.images[j.textures[j.materials[18].normalTexture.index].source].bufferView;
  if(normalView!==37)throw Error("Unexpected normal texture");
  const ov=j.bufferViews[normalView],start=ov.byteOffset||0,end=(start+ov.byteLength+3)&~3;
  if(start%4)throw Error("Unaligned image view");
  const repl=pad(png),delta=repl.length-(end-start);
  const finalBin=concat(bin.subarray(0,start),repl,bin.subarray(end));
  ov.byteLength=png.length;
  for(let i=0;i<j.bufferViews.length;i++){if(i===normalView)continue;const v=j.bufferViews[i],p=v.byteOffset||0;if(p>=end)v.byteOffset=p+delta;else if(p+v.byteLength>start)throw Error("Overlapping views")}
  j.buffers[0].byteLength=finalBin.length;
  j.images[j.textures[j.materials[18].normalTexture.index].source].name="V16 subtle woven sportswear normal";
  const mat=j.materials[18];
  mat.name="R36HW_V16_OPAQUE_OCHRE_SPORTSWEAR";
  mat.alphaMode="OPAQUE";
  mat.pbrMetallicRoughness.baseColorFactor=[.51,.29,.11,1];
  mat.pbrMetallicRoughness.roughnessFactor=.88;
  mat.pbrMetallicRoughness.metallicFactor=0;
  mat.normalTexture.scale=.35;
  j.asset.generator="R36HW V16 deterministic sportswear finish";
  // Check exact byte retention for every unaffected view, including geometry, weights, skin and identity images.
  const preserved=[],modified=[];
  for(let i=0;i<j.bufferViews.length;i++){
    const a=original.bufferViews[i],v=j.bufferViews[i];
    const eq=same(old.subarray(a.byteOffset||0,(a.byteOffset||0)+a.byteLength),finalBin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));
    if(eq)preserved.push(i);else modified.push(i);
  }
  if(modified.join(",")!==[37,42].join(","))throw Error("Unexpected altered buffers "+modified);
  if(JSON.stringify(j.skins)!==JSON.stringify(original.skins)||JSON.stringify(j.nodes)!==JSON.stringify(original.nodes)||JSON.stringify(j.meshes)!==JSON.stringify(original.meshes)||JSON.stringify(j.accessors)!==JSON.stringify(original.accessors))throw Error("Geometry/rig changed");
  const jb=pad(utf8(JSON.stringify(j)),32),bb=pad(finalBin),glb=concat(u32(0x46546c67,true),u32(2,true),u32(28+jb.length+bb.length,true),u32(jb.length,true),u32(0x4e4f534a,true),jb,u32(bb.length,true),u32(0x004e4942,true),bb);
  return {glb,png,report:{schema:"r36hw-v16-build-v1",sourceBlob:"b824e5ec3d9564950909037a5f0ba2533593b8d3",sourceBytes:src.length,outputBytes:glb.length,triangles,joints:j.skins[0].joints.length,garmentVertices:pa.count,changedColorVertices:changed,trimAffectedCounts:counts,texture:{width:W,height:H,bytes:png.length,oldBytes:original.bufferViews[37].byteLength,kind:"procedural periodic microfinish RGB normal; no anatomy bake",decodedPixelRoundtrip:true},materialBefore:original.materials[18],materialAfter:mat,preservedBufferViews:preserved,modifiedBufferViews:modified,geometryRigAccessorsUnchanged:true,opaque:true,nativeS2:false,nativeRender:false,sourceSpriteCalibrated:false,visualApproval:false}};
}
module.exports={build};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const input=process.argv[2],out=process.argv[3]||path.join(__dirname,'../output');if(!input)throw Error('Usage: node build.cjs V14.glb [output directory]');const data=fs.readFileSync(input);const hash=crypto.createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');if(hash!=='b824e5ec3d9564950909037a5f0ba2533593b8d3')throw Error('Source blob mismatch '+hash);const r=build(data);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'R36HW_F11_ATHLETIC_SUIT_V16_FINISH.glb'),r.glb);fs.writeFileSync(path.join(out,'athletic-normal-v16.png'),r.png);const reports=path.resolve(out,'../reports');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'build.json'),JSON.stringify(r.report,null,2)+'\n');console.log(JSON.stringify(r.report,null,2));}
