'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),dir=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const source='r21AO-F11-user101-native-skin-bowl-r22-dome.glb',candidate='r21AO-F11-user101-native-retopo-r23-lbsweld.glb';
const r22=fs.readFileSync(path.join(dir,source)),r23=fs.readFileSync(path.join(dir,candidate));
if(sha(r22)!=='15451f69e5c9e6041463ad15ce8668939a3f604c14ce65e5d601fdd3ceb1cb41')throw Error('Unexpected source');
if(sha(r23)!=='f7e0a3d16712abfa21ce4b3a4faedea55b3fb77dac0400f64575423838db7132')throw Error('Unexpected candidate');
const trim=read('rev95-user-trim-101faces-20261116T152807Z.json');
if(sha(fs.readFileSync(path.join(dir,'rev95-user-trim-101faces-20261116T152807Z.json')))!=='624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5')throw Error('Trim source changed');
function glb(b){
 if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(8)!==b.length)throw Error('Invalid GLB magic/length');
 const n=b.readUInt32LE(12),doc=JSON.parse(b.toString('utf8',20,20+n)),binOffset=28+n,bin=b.subarray(binOffset+8,binOffset+8+b.readUInt32LE(binOffset)),ndim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},size={5121:1,5123:2,5125:4,5126:4},fn={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
 function get(i){const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],dim=ndim[a.type],sz=size[a.componentType],stride=v.byteStride||dim*sz,offset=(v.byteOffset||0)+(a.byteOffset||0),rows=[];
  for(let j=0;j<a.count;j++){let r=[];for(let k=0;k<dim;k++)r.push(bin[fn[a.componentType]](offset+j*stride+k*sz));rows.push(dim===1?r[0]:r);}
  return rows;}
 return{doc,get};
}
const A=glb(r22),B=glb(r23),pa=A.doc.meshes[0].primitives,pb=B.doc.meshes[0].primitives;
const getP=(p,g,k)=>g.get(p.attributes[k]),getM=(p,g,k)=>g.get(p.targets[0][k]);
if(pb.length!==24||B.doc.skins[0].joints.length!==63)throw Error('GLB geometry/skeleton count mismatch');
const o=getP(pa[0],A,'WEIGHTS_0'),n=getP(pb[0],B,'WEIGHTS_0'),changes=[];for(let i=0;i<o.length;i++)if(JSON.stringify(o[i])!==JSON.stringify(n[i]))changes.push({i,old:o[i],now:n[i]});console.log(JSON.stringify({total:changes.length,changes:changes.slice(0,35)},null,2));