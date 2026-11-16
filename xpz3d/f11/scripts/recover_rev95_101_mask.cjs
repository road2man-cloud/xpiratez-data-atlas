'use strict';
// XPZ3D F11 strict rescue: recover only a verified 101-face user deletion list.
// Usage: node recover_rev95_101_mask.cjs <folder or file> [more folders/files]
// Output is not a user-final rev96 GLB. It is a source-validated, non-overwriting
// 101-face deletion list plus any verified full manual sculpt JSON that was found.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sourceGLB=path.resolve(__dirname,'../F11_Web_Review_ghpages_20261105/f11/r21al/r21AO-F11-skin-separated-rev92-base.glb');
const outputFolder=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!fs.existsSync(sourceGLB))throw Error('Source rev92 GLB missing: '+sourceGLB);
const baseBytes=fs.readFileSync(sourceGLB);
const jlen=baseBytes.readUInt32LE(12);
const base=JSON.parse(baseBytes.toString('utf8',20,20+jlen));
const bin=baseBytes.subarray(28+jlen,28+jlen+baseBytes.readUInt32LE(20+jlen));
const ps=base.meshes[0].primitives;
if(base.skins[0].joints.length!==63||ps.reduce((x,p)=>x+base.accessors[p.indices].count/3,0)!==3647)throw Error('Bad base rig/topology');
function indices(p){
 const a=base.accessors[p.indices],v=base.bufferViews[a.bufferView],sz={5121:1,5123:2,5125:4}[a.componentType],reader={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE'}[a.componentType];
 if(!reader)throw Error('Bad original index format');
 return Array.from({length:a.count},(_,i)=>bin[reader]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||sz)));
}
const originals=ps.map(indices);
function checkMask(list){
 if(!Array.isArray(list)||list.length!==101)return null;
 const keys=new Set(),faces=[];
 for(const entry of list){
  const pi=Number(entry.primitive),fi=Number(entry.triangle??entry.face);
  if(!Number.isInteger(pi)||!Number.isInteger(fi)||!ps[pi]||fi<0||fi>=originals[pi].length/3)return null;
  if(ps[pi].extras?.layer==='garment')return null;
  const id=pi+':'+fi;if(keys.has(id))return null;
  const vertices=originals[pi].slice(fi*3,fi*3+3);
  if(Array.isArray(entry.vertices)&&vertices.join(',')!==entry.vertices.join(','))return null;
  keys.add(id);faces.push({primitive:pi,triangle:fi,vertices,layer:entry.layer||ps[pi].extras?.layer||null});
 }
 return faces.sort((a,b)=>a.primitive-b.primitive||a.triangle-b.triangle);
}
function decodeCandidate(bytes,extension){
 if(extension==='.glb'){
  if(bytes.toString('ascii',0,4)!=='glTF')return null;
  const d=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  if(d.skins?.[0]?.joints?.length!==63)return null;
  return {list:d.extras?.removedFaces||d.extras?.deletedFaces,
   userControls:null,positions:null,source:d.extras?.sourceGLB,
   bakedTriangles:d.meshes?.[0]?.primitives?.reduce((n,p)=>n+(d.accessors[p.indices]?.count||0)/3,0),kind:'glb-export'};
 }
 let text=bytes.toString('utf8'),data;
 try{data=JSON.parse(text.replace(/^\uFEFF/,''));}catch{
  // Pasted text often wraps a JSON payload in prose; extract a balanced object
  // starting at a schema declaration without executing arbitrary source text.
  const at=text.indexOf('XPZ3D.F11.ManualSculpt.v1');if(at<0)return null;
  let start=text.lastIndexOf('{',at),end=-1,depth=0,inString=false,escape=false;
  for(let i=start;i<Math.min(text.length,start+6000000);i++){
   const c=text[i];if(inString){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')inString=false;continue;}
   if(c==='"'){inString=true;continue;}if(c==='{')depth++;else if(c==='}'&&!--depth){end=i+1;break;}
  }
  if(end<0)return null;try{data=JSON.parse(text.slice(start,end));}catch{return null;}
 }
 return {list:data.deletedFaces||data.removedFaces||data.extras?.removedFaces,
 userControls:data.controls,positions:data.positions,source:data.sourceGLB,
 kind:data.schema==='XPZ3D.F11.ManualSculpt.v1'?'manual-json':'other-json',data};
}
function walk(p,level,fn){
 if(level>11)return;
 let st;try{st=fs.statSync(p)}catch{return;}
 if(st.isDirectory()){
  if(/node_modules|\.git|\.cache|cache|system volume information/i.test(path.basename(p)))return;
  let list;try{list=fs.readdirSync(p)}catch{return;}
  for(const child of list)walk(path.join(p,child),level+1,fn);
  return;
 }
 if(!st.isFile()||st.size>12000000||st.size<60||!/\.(json|txt|glb)$/i.test(p))return;
 fn(p);
}
const roots=process.argv.slice(2);
if(!roots.length)throw Error('Pass one or more specific search folders or exact files');
let scanned=0,found=0,invalid101=0;const matches=[];
for(const root of roots)walk(path.resolve(root),0,p=>{
 scanned++;
 let bytes;try{bytes=fs.readFileSync(p)}catch{return;}
 if(!bytes.includes(Buffer.from('deletedFaces'))&&!bytes.includes(Buffer.from('removedFaces'))&&bytes.toString('ascii',0,4)!=='glTF')return;
 let item;try{item=decodeCandidate(bytes,path.extname(p).toLowerCase())}catch{return;}
 if(!item?.list||item.list.length!==101)return;
 found++;
 const normalized=checkMask(item.list);
 if(!normalized){invalid101++;matches.push({path:p,valid:false,reason:'face IDs/garment/vertices do not match exact rev92 GLB'});return;}
 const sourceName=path.basename(item.source||'');
 if(sourceName!==path.basename(sourceGLB)){invalid101++;matches.push({path:p,valid:false,reason:'source name mismatch'});return;}
 const controlsOk=item.userControls&&Object.keys(item.userControls).length===106;
 const positionsOk=Array.isArray(item.positions)&&item.positions.length===754;
 const full=controlsOk&&positionsOk&&item.kind==='manual-json';
 const manifest={schema:'XPZ3D.F11.Recovered101.v1',valid:true,kind:item.kind,sourceFile:p,
  sourceSha256:sha(bytes),sourceGLB,baseSha256:sha(baseBytes),
  deletedFaces:normalized,deletionCount:101,baseTriangles:3647,expectedAfterTrim:3546,
  has106Controls:!!controlsOk,has754Positions:!!positionsOk,hasOriginalManualJson:!!full,
  claim:'Recovered 101 verified face IDs only; not a completed stitched GLB'};
 const dest=path.join(outputFolder,'rev95-recovered-101-mask-'+sha(bytes).slice(0,12)+'.json');
 fs.writeFileSync(dest,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 if(full){
  const original=path.join(outputFolder,'rev95-recovered-full-user-trim-'+sha(bytes).slice(0,12)+'.json');
  fs.writeFileSync(original,JSON.stringify(item.data,null,2)+'\n',{flag:'wx'});
  manifest.fullInput=original;
 }
 matches.push({path:p,valid:true,maskOutput:dest,has106Controls:!!controlsOk,has754Positions:!!positionsOk,fullInput:manifest.fullInput||null});
});
console.log(JSON.stringify({scanned,foundWith101:found,invalid101,matches,sourceGlbSha256:sha(baseBytes)},null,2));
