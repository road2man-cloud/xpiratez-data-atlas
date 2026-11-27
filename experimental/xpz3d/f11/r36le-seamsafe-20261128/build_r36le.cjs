'use strict';
/**
 * R36LE: publishable, reversible material-sampling improvement to the
 * complete R36LC character. Node.js only; no Blender, Python, new sculpt,
 * polygon change, texture repaint, or dependency on private Windows paths.
 *
 * Run: node experimental/xpz3d/f11/r36le-seamsafe-20261128/build_r36le.cjs
 *
 * Triangular UV islands are only 60px per atlas tile with ~3px gutters.
 * Trilinear mipmaps can mix colors from adjacent islands when projected at
 * a distance. This optional, bilinear-only sampler tests the aliasing/mip
 * tradeoff without pretending that physical dark openings can be painted.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {load,Builder,values}=require('../r36lc-atlas-20261128/source/glb_io.cjs');
const root=__dirname,lc=path.resolve(root,'../r36lc-atlas-20261128');
const outDir=path.join(root,'output');
const manifest=JSON.parse(fs.readFileSync(path.join(lc,'ARTIFACTS.json'),'utf8'));
const pair=[
 {source:'output/stable/R36LC_BALANCED_SKIN_2100TRI.glb',name:'R36LE_SEAMSAFE_SKIN_2100TRI.glb'},
 {source:'output/balanced/R36LC_BALANCED_2100_SURFACE_FLOW.glb',name:'R36LE_SEAMSAFE_FLOW_2100TRI.glb'}
];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function check(cond,msg){if(!cond)throw Error(msg);}
function sourceArchive(spec){
 const combined=Buffer.concat(spec.parts.map(p=>{
  const file=path.join(lc,p.path);
  check(fs.existsSync(file),'Missing R36LC source chunk: '+file);
  const raw=fs.readFileSync(file);
  const gitBlob=crypto.createHash('sha1').update(Buffer.concat([
   Buffer.from('blob '+raw.length+'\0','utf8'),raw
  ])).digest('hex');
  check(gitBlob===p.git_blob_sha,'Chunk blob SHA mismatch: '+p.path);
  return raw;
 }));
 check(combined.length===spec.bytes,'Source GLB byte count mismatch: '+spec.output);
 check(hash(combined)===spec.sha256,'Source GLB SHA256 mismatch: '+spec.output);
 return combined;
}
function accessorSummary(q){
 return q.g.meshes.map(mesh=>({
  name:mesh.name,
  primitives:(mesh.primitives||[]).map(p=>({
   indices:p.indices,
   position:p.attributes.POSITION,
   normal:p.attributes.NORMAL,
   uv:p.attributes.TEXCOORD_0,
   joints:p.attributes.JOINTS_0,
   weights:p.attributes.WEIGHTS_0
  }))
 }));
}
function validateSkeleton(q){
 const budget=q.g.extras?.r36kp?.budget;
 check(budget&&budget.head===968&&budget.body===1132&&budget.total===2100,'R36LC source budget changed');
 const nodes=q.g.nodes||[];
 const skinNode=nodes.find(n=>n.name==='R36KP_GAME_SKIN_WITH_EMBEDDED_ANATOMY');
 check(skinNode&&Number.isInteger(skinNode.skin),'missing character skin node');
 const skin=q.g.skins[skinNode.skin];
 check(skin&&skin.joints.length===63,'R36LC skeleton changed');
 const body=q.g.meshes.find(x=>x.name==='R36KP_CONTINUOUS_SKIN_WITH_POSTERIOR_SUPERIOR_CORE');
 check(body&&body.primitives.length===1,'unexpected body geometry');
 const indexCount=q.g.accessors[body.primitives[0].indices].count;
 check(indexCount===1132*3,'body triangle budget changed');
 return {budget,rigJoints:skin.joints.length,bodyTriangles:indexCount/3,headTriangles:budget.head,bodyNodeName:skinNode.name};
}
function patch(q,sourceSha){
 const b=new Builder(q),g=b.g;
 const materials=g.materials||[];
 const matId=materials.findIndex(m=>m.name==='R36KP_BAKED_SKIN_2048');
 check(matId>=0,'R36LC skin material not found');
 const mat=materials[matId],pbr=mat.pbrMetallicRoughness;
 check(pbr?.baseColorTexture&&pbr?.metallicRoughnessTexture&&mat.normalTexture&&mat.occlusionTexture,
  'R36LC expected body PBR maps missing');
 const sourceSamplerMap=new Map(),refs=[
  pbr.baseColorTexture,pbr.metallicRoughnessTexture,mat.normalTexture,mat.occlusionTexture
 ];
 const samplerId=(g.samplers??=[]).push({
  name:'R36LE_BODY_BILINEAR_CLAMP_NO_MIP',
  magFilter:9729,minFilter:9729,wrapS:33071,wrapT:33071
 })-1;
 const textureIdMap=new Map();
 for(const ref of refs){
  const old=ref.index;
  check(g.textures[old]&&Number.isInteger(g.textures[old].source),'Texture source missing '+old);
  if(!textureIdMap.has(old)){
   const n=g.textures.push({...g.textures[old],
    name:'R36LE_BILINEAR_'+(g.textures[old].name||old),sampler:samplerId})-1;
   textureIdMap.set(old,n);
  }
  ref.index=textureIdMap.get(old);
 }
 const textureChanges=[...textureIdMap].map(([oldIndex,newIndex])=>({
  oldIndex,newIndex,embeddedImage:g.textures[newIndex].source
 }));
 g.asset.generator='R36LE non-destructive 2100-triangle whole-character bilinear seam-safe sampler';
 g.extras={...(g.extras||{}),r36le:{
  version:'R36LE',sourceVersion:'R36LC',sourceSHA256:sourceSha,
  strategy:'body-only bilinear sampler; clamp edges; no mipmap sample blending',
  sampledAreas:['body base color','body normal','body metallic-roughness','body occlusion'],
  unchanged:['head/face/hair','body geometry','bone rig','skinning','UV','embedded PNG image bytes'],
  caveat:'Potential distance shimmer; compare against R36LC original trilinear. Does not close geometric gaps.'
 }};
 return {builder:b,samplerId,textureChanges};
}
function generate(){
 fs.mkdirSync(outDir,{recursive:true});
 const report={format:'R36LE_MATERIAL_PRODUCTION_V1',date:'2026-11-28',
  sourceRepo:'road2man-cloud/xpiratez-data-atlas',
  baseline:'R36LC',purpose:'Prevent cross-island mipmap bleed on actual full-character GLBs',
  variants:[],limitations:['Appearance requires side-by-side runtime visual inspection','No S2 engine test','No geometric gap is closed']};
 for(const row of pair){
  const spec=manifest.files.find(x=>x.output===row.source);
  check(spec,'R36LC manifest entry missing '+row.source);
  const bytes=sourceArchive(spec);
  // Isolate original archive without touching the R36LC source path.
  const temp=path.join(outDir,'.source_'+path.basename(row.source));
  if(fs.existsSync(temp))check(hash(fs.readFileSync(temp))===spec.sha256,'Refuse to use altered source cache');
  else fs.writeFileSync(temp,bytes);
  const q=load(temp),signature=validateSkeleton(q);
  check(q.sha===spec.sha256,'Source checksum changed on disk');
  const shape=JSON.stringify(accessorSummary(q));
  const {builder,textureChanges,samplerId}=patch(q,spec.sha256);
  const dest=path.join(outDir,row.name);
  check(!fs.existsSync(dest),'Will not overwrite an existing output GLB: '+dest);
  const made=builder.save(dest);
  const next=load(dest);
  check(next.bin.equals(q.bin),'Binary geometry/images changed');
  check(JSON.stringify(accessorSummary(next))===shape,'Geometry accessor references changed');
  check(JSON.stringify(next.g.skins)===JSON.stringify(q.g.skins),'Skin rig changed');
  check(JSON.stringify(next.g.nodes)===JSON.stringify(q.g.nodes),'Scene node hierarchy changed');
  check(next.g.images.length===q.g.images.length,'Image slots changed');
  check(next.g.materials.length===q.g.materials.length,'Head/material count changed');
  report.variants.push({file:'output/'+row.name,bytes:made.bytes,sha256:made.sha,
   sourceFile:row.source,sourceSha256:q.sha,originalBinSha256:hash(q.bin),
   samplerId,textureChanges,geometryAndEmbeddedTexturesIdentical:true,
   ...signature});
  console.log('R36LE_PRODUCED',row.name,made.bytes,made.sha);
 }
 fs.writeFileSync(path.join(root,'R36LE_PRODUCTION_REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log('R36LE_PRODUCTION_COMPLETE',report.variants.length);
}
try{generate();}catch(e){console.error(e.stack||e);process.exitCode=1;}
