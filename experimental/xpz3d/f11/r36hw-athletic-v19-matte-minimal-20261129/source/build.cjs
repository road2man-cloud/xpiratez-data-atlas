// V19 minimal matte sportswear, Node.js without dependencies.
function build(src){
 const dv=new DataView(src.buffer,src.byteOffset,src.byteLength),l=dv.getUint32(12,true),base=28+l;
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==src.length||dv.getUint32(16,true)!==0x4e4f534a||dv.getUint32(24+l,true)!==0x004e4942||base+dv.getUint32(20+l,true)!==src.length)throw Error("Invalid GLB");
 const j=JSON.parse(String.fromCharCode(...src.subarray(20,20+l))),orig=JSON.parse(JSON.stringify(j)),bin=src.slice(base),b=new DataView(bin.buffer),prim=j.meshes[0].primitives.find(p=>p.material===18),mat=j.materials[18];
 if(!prim||prim.attributes.POSITION!==34||prim.attributes.COLOR_0!==38||prim.indices!==41||mat.alphaMode!=="OPAQUE"||mat.pbrMetallicRoughness.baseColorTexture)throw Error("Unexpected model");
 const a=j.accessors[34],c=j.accessors[38],v=j.bufferViews[a.bufferView],cv=j.bufferViews[c.bufferView],ia=j.accessors[41],iv=j.bufferViews[ia.bufferView];
 if(a.componentType!==5126||c.componentType!==5121||!c.normalized||ia.componentType!==5123)throw Error("Accessor types");
 const addr=(a,v,i,s)=>(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||s);
 const p=Array.from({length:a.count},(_,i)=>{const q=addr(a,v,i,12);return [b.getFloat32(q,true),b.getFloat32(q+4,true),b.getFloat32(q+8,true)]});
 const colors=p.map((_,i)=>Array.from(bin.subarray(addr(c,cv,i,4),addr(c,cv,i,4)+4)));
 const ids=Array.from({length:ia.count},(_,i)=>b.getUint16(addr(ia,iv,i,2),true));
 const groups=new Map(),keys=p.map((q,i)=>{const k=q.map(x=>Math.round(x*1e5)).join(",");if(!groups.has(k))groups.set(k,{ids:[],neighbors:new Set()});groups.get(k).ids.push(i);return k});
 for(let i=0;i<ids.length;i+=3)for(let e=0;e<3;e++){const x=keys[ids[i+e]],y=keys[ids[i+(e+1)%3]];if(x!==y){groups.get(x).neighbors.add(y);groups.get(y).neighbors.add(x)}}
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
 let lockedGroups=0;
 for(const [k,g] of groups){g.rgb=[0,1,2].map(n=>g.ids.reduce((s,i)=>s+colors[i][n],0)/g.ids.length);const [x,y,z]=p[g.ids[0]];g.lock=Math.max(smooth(.53,.62,Math.abs(x)),1-smooth(.17,.29,z),smooth(1.45,1.52,z)*(1-smooth(.08,.14,Math.abs(x))));if(g.lock>.99)lockedGroups++}
 const before=new Map([...groups].map(([k,g])=>[k,g.rgb.slice()]));let cur=before;
 for(let pass=0;pass<3;pass++){const next=new Map();for(const [k,g] of groups){const q=cur.get(k);let sum=[0,0,0],n=0;for(const nk of g.neighbors){const ng=groups.get(nk);if(ng.lock>.2||Math.abs(ng.lock-g.lock)>.25)continue;const t=cur.get(nk);for(let c=0;c<3;c++)sum[c]+=t[c];n++}const alpha=.28*(1-g.lock);next.set(k,n?q.map((v,c)=>v*(1-alpha)+sum[c]/n*alpha):q.slice())}cur=next}
 let modified=0,maxDelta=0,lockedVertices=0;
 for(const [k,g] of groups){if(g.lock>.99){lockedVertices+=g.ids.length;continue}const q=cur.get(k);for(const i of g.ids){const o=addr(c,cv,i,4);let change=false;for(let k=0;k<3;k++){const val=clamp(Math.round(q[k]),0,255);maxDelta=Math.max(maxDelta,Math.abs(val-bin[o+k]));if(val!==bin[o+k]){change=true;bin[o+k]=val}}if(change)modified++}}
 for(let i=0;i<a.count;i++)if(bin[addr(c,cv,i,4)+3]!==255)throw Error("Garment alpha changed");
 function rms(m){let sum=0,n=0;for(const [k,g] of groups){if(g.lock>.2)continue;for(const t of g.neighbors){if(k>=t||groups.get(t).lock>.2)continue;sum+=m.get(k).reduce((s,x,c)=>s+(x-m.get(t)[c])**2,0);n++}}return Math.sqrt(sum/(3*n))}
 const after=new Map([...groups].map(([k,g])=>[k,[0,1,2].map(ch=>g.ids.reduce((s,i)=>s+bin[addr(c,cv,i,4)+ch],0)/g.ids.length)]));
 mat.name="R36HW_V19_OPAQUE_MATTE_BRONZE_SPORTSWEAR";
 mat.pbrMetallicRoughness.baseColorFactor=[.32,.23,.105,1];
 mat.pbrMetallicRoughness.roughnessFactor=.96;
 mat.normalTexture.scale=.25;
 j.asset.generator="R36HW V19 minimal matte sportswear";
 const changedViews=[];for(let i=0;i<j.bufferViews.length;i++){const v=j.bufferViews[i],o=v.byteOffset||0;if(!bin.subarray(o,o+v.byteLength).every((x,k)=>x===src[base+o+k]))changedViews.push(i)}
 if(changedViews.length!==1||changedViews[0]!==c.bufferView||JSON.stringify(j.meshes)!==JSON.stringify(orig.meshes)||JSON.stringify(j.skins)!==JSON.stringify(orig.skins)||JSON.stringify(j.nodes)!==JSON.stringify(orig.nodes)||JSON.stringify(j.accessors)!==JSON.stringify(orig.accessors))throw Error("Unexpected modification");
 const triangles=j.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+j.accessors[p.indices].count/3,0);if(triangles!==2100||j.skins[0].joints.length!==63)throw Error("Budget");
 const t=JSON.stringify(j),jb=new Uint8Array((t.length+3)&~3).fill(32);for(let i=0;i<t.length;i++){if(t.charCodeAt(i)>127)throw Error("Non ASCII JSON");jb[i]=t.charCodeAt(i)}
 const out=new Uint8Array(28+jb.length+bin.length),h=new DataView(out.buffer);[0x46546c67,2,out.length,jb.length,0x4e4f534a].forEach((x,i)=>h.setUint32(i*4,x,true));out.set(jb,20);h.setUint32(20+jb.length,bin.length,true);h.setUint32(24+jb.length,0x004e4942,true);out.set(bin,28+jb.length);
 const r0=rms(before),r1=rms(after);if(r1>=r0)throw Error("Color smoothing regressed");
 return {glb:out,report:{schema:"r36hw-v19-matte-v1",sourceVersion:"V17",sourceBlob:"c1aef49ea29fd67e2c34a841aaf2f9d147c72b1f",sourceBytes:src.length,outputBytes:out.length,triangles,joints:j.skins[0].joints.length,garmentVertices:a.count,weldedGroups:groups.size,lockedGroups,lockedVertices,modifiedColorVertices:modified,maxRgbChannelDelta:maxDelta,neighborRgbRmsBefore:r0,neighborRgbRmsAfter:r1,neighborRgbRmsReductionPercent:100*(1-r1/r0),changedViews,unchangedViews:j.bufferViews.length-changedViews.length,materialBefore:orig.materials[18],materialAfter:mat,printAtlasUsed:false,geometryAndRigUnchanged:true,opaque:true,nativeS2:false,nativeRender:false}};
}
module.exports={build};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const input=process.argv[2],out=process.argv[3]||path.join(__dirname,'../output');if(!input)throw Error('Usage: node build.cjs V17.glb [output dir]');const b=fs.readFileSync(input),hash=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');if(hash!=='c1aef49ea29fd67e2c34a841aaf2f9d147c72b1f')throw Error('Wrong input '+hash);const r=build(b);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'R36HW_F11_ATHLETIC_SUIT_V19_MATTE.glb'),r.glb);const reports=path.resolve(out,'../reports');fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'build.json'),JSON.stringify(r.report,null,2)+'\n');}
