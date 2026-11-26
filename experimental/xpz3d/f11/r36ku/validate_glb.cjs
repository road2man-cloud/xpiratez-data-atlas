const fs=require('fs');
const validator=require('./viewer_deps/node_modules/gltf-validator');
(async()=>{
 for(const size of [1024,512]){
  const path=`output/R36KU_F11_BALANCED_DETAIL_${size}_2100TRI.glb`;
  const r=await validator.validateBytes(new Uint8Array(fs.readFileSync(path)),{uri:path,maxIssues:2000});
  fs.writeFileSync(`output/R36KU_${size}_GLTF_VALIDATOR.json`,JSON.stringify(r,null,2));
  console.log(JSON.stringify({size,errors:r.issues.numErrors,warnings:r.issues.numWarnings,messages:r.issues.messages.slice(0,15)}));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
