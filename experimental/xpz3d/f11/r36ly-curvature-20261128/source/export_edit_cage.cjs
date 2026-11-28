'use strict';
/**
 * R36LY editable geometry cage: export the actual deformed body-region faces
 * as OBJ, together with a lossless source <-> variant vertex correspondence.
 * This is an artist hand-off artifact; use the GLB for skinning/animation.
 *
 * node export_edit_cage.cjs BEFORE.glb AFTER.glb OUT_DIR LABEL
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {load,extract}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
const insist=(v,s)=>{if(!v)throw Error(s)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function body(q){
 const mi=q.g.meshes.findIndex(m=>(m.name||'').includes('R36KP_CONTINUOUS_SKIN'));
 insist(mi>=0,'cannot find continuous body');
 return {mesh:extract(q,mi,0),mi};
}
function exportCage(beforeFile,afterFile,outDir,label){
 insist(fs.existsSync(beforeFile)&&fs.existsSync(afterFile),'missing base or sculpt GLB');
 insist(/^[A-Z0-9_]{3,45}$/.test(label),'invalid label');
 insist(!fs.existsSync(outDir),'refusing overwrite cage directory');
 const before=load(beforeFile),after=load(afterFile),a=body(before).mesh,b=body(after).mesh;
 insist(a.indices.length===3396&&b.indices.length===3396,'body triangle budget changed');
 insist(a.positions.length===b.positions.length&&a.normals.length===b.normals.length,'vertex count changed');
 insist(before.g.skins.some(s=>s.joints.length===63)&&after.g.skins.some(s=>s.joints.length===63),'63 bone skin lost');
 let sameUV=true,sameIndex=true,sameSkin=true;
 for(let k=0;k<a.indices.length;k++)if(a.indices[k]!==b.indices[k])sameIndex=false;
 for(let i=0;i<a.positions.length;i++){
  if(dist(a.uvs[i],b.uvs[i])>1e-8)sameUV=false;
  if(dist(a.joints[i],b.joints[i])>0||dist(a.weights[i],b.weights[i])>1e-5)sameSkin=false;
 }
 insist(sameUV&&sameIndex&&sameSkin,'input/output UV topology or skin not matching');
 const moved=new Set();
 for(let i=0;i<a.positions.length;i++)if(dist(a.positions[i],b.positions[i])>1e-7)moved.add(i);
 insist(moved.size>=80,'too few real deformed cage vertices');
 const faces=[];
 for(let t=0;t<a.indices.length;t+=3){
  const ids=a.indices.slice(t,t+3);
  if(ids.some(id=>moved.has(id)))faces.push({triangle:t/3,ids});
 }
 insist(faces.length>30,'not enough editable faces');
 const included=new Set(faces.flatMap(f=>f.ids));
 const ordered=[...included].sort((x,y)=>x-y),objIndex=new Map(ordered.map((id,i)=>[id,i+1]));
 const lines=['# R36LY control cage (BODY ONLY, has no skinning); use GLB for actual rig','# Label '+label,
  '# Source '+sha(before.raw),'# Sculpt '+sha(after.raw),'o R36LY_'+label+'_CENTER_CAGE'];
 for(const id of ordered)lines.push('v '+b.positions[id].map(x=>x.toFixed(9)).join(' '));
 for(const id of ordered)lines.push('vt '+b.uvs[id].map(x=>x.toFixed(9)).join(' '));
 for(const id of ordered)lines.push('vn '+b.normals[id].map(x=>x.toFixed(9)).join(' '));
 lines.push('s 1');
 for(const face of faces){
  lines.push('# Original body triangle '+face.triangle);
  lines.push('f '+face.ids.map(id=>{const n=objIndex.get(id);return n+'/'+n+'/'+n;}).join(' '));
 }
 const cage=lines.join('\n')+'\n';
 const pointRows=ordered.map(id=>{
  const old=a.positions[id],now=b.positions[id];return{
   originalVertexIndex:id,cageVertexIndex:objIndex.get(id),
   originalPosition:old,sculptedPosition:now,
   delta:now.map((v,i)=>v-old[i]),originalNormal:a.normals[id],
   sculptedNormal:b.normals[id],uv:a.uvs[id],
   joints:a.joints[id],weights:a.weights[id],
   changed:moved.has(id)};
 });
 fs.mkdirSync(outDir,{recursive:true});
 const objName='R36LY_'+label+'_CENTER_CAGE.obj',jsonName='R36LY_'+label+'_EDIT_CAGE.json';
 fs.writeFileSync(path.join(outDir,objName),cage);
 const data={version:'R36LY-EDIT-CAGE',label,sourceSHA256:before.sha,sculptSHA256:after.sha,
  geometryPatch:true,originalTriangleCount:1132,originalSkinJoints:63,
  trianglesIncluded:faces.length,verticesIncluded:ordered.length,
  movedVertexCount:moved.size,uvTopologyIdentical:sameUV,indicesIdentical:sameIndex,skinWeightsIdentical:sameSkin,
  maxDisplacement:Math.max(...pointRows.map(v=>Math.hypot(...v.delta))),
  format:'source-indexed OBJ cage + JSON vertex lookup',objName,
  triangles:faces,vertices:pointRows,limitation:'OBJ patch is not a skinned character; retain original GLB for production'};
 fs.writeFileSync(path.join(outDir,jsonName),JSON.stringify(data,null,2)+'\n');
 console.log(JSON.stringify({label,objName,jsonName,triangles:data.trianglesIncluded,
  points:data.verticesIncluded,moved:data.movedVertexCount,maxDisplacement:data.maxDisplacement}));
 return data;
}
if(require.main===module)try{
 insist(process.argv.length===6,'usage: node export_edit_cage.cjs INPUT.glb SCULPT.glb OUT_DIR LABEL');
 exportCage(...process.argv.slice(2));
}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={exportCage};
