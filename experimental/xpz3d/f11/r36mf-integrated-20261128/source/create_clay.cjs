'use strict';
/**
 * Extract a neutral material-only GLB from any complete skinned character.
 * Keep original vertex/index/skin/joints/anims; drop all texture references.
 * It is essential to assess shape WITHOUT original photo/normal-map illusion.
 */
const fs=require('fs'),path=require('path');
const {load,Builder}=require('../../r36kz-chest-center-shape-20261128/source/glb_io.cjs');
function build(input,output){
 if(!fs.existsSync(input))throw Error('input GLB missing');
 if(fs.existsSync(output))throw Error('refusing overwrite clay model');
 const q=load(input),b=new Builder(q),count=q.g.meshes.flatMap(x=>x.primitives).length;
 b.g.materials=[{name:'R36MF_FULL_CLAY_NO_TEXTURE',pbrMetallicRoughness:{
  baseColorFactor:[.68,.68,.68,1],metallicFactor:0,roughnessFactor:.9},doubleSided:true}];
 for(const mesh of b.g.meshes)for(const p of mesh.primitives)p.material=0;
 b.g.asset.generator='R36MF all-body neutral clay for visual geometry QA without texture or normal map';
 const outputInfo=b.save(output);
 console.log(JSON.stringify({output,bytes:outputInfo.bytes,sha256:outputInfo.sha,primitives:count,
  geometryAccessorsOriginal:true,skins:q.g.skins?.length||0}));
 return outputInfo;
}
if(require.main===module)try{
 if(process.argv.length!==4)throw Error('usage: node create_clay.cjs TEXTURED.glb CLAY.glb');
 build(process.argv[2],process.argv[3]);
}catch(e){console.error(e.stack||e);process.exitCode=1}
module.exports={build};
