const fs=require('fs'),path=require('path');
const validator=require('./viewer_deps/node_modules/gltf-validator');
(async()=>{for(const size of [1024,512]){
 const file=path.join(__dirname,'output',`R36KV_F11_SHARED_UV_${size}_2100TRI.glb`);
 const result=await validator.validateBytes(new Uint8Array(fs.readFileSync(file)),{uri:path.basename(file),maxIssues:1000});
 fs.writeFileSync(path.join(__dirname,'output',`R36KV_${size}_VALIDATION.json`),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({size,errors:result.issues.numErrors,warnings:result.issues.numWarnings,codes:[...new Set(result.issues.messages.map(m=>m.code))]}));
 if(result.issues.numErrors)process.exitCode=1;
}})().catch(e=>{console.error(e);process.exitCode=1;});
