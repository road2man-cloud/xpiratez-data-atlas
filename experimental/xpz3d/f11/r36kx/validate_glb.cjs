const fs=require('node:fs'),path=require('node:path');
const validator=require('./viewer_deps/node_modules/gltf-validator');
(async()=>{for(const size of [1024,512]){
 const file=`R36KX_F11_COMPACT_NORMAL_${size}_2100TRI.glb`,data=fs.readFileSync(path.join(__dirname,'output',file));
 const report=await validator.validateBytes(new Uint8Array(data),{uri:file,maxIssues:200});
 fs.writeFileSync(path.join(__dirname,'output',`R36KX_${size}_VALIDATOR.json`),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({size,errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,codes:[...new Set(report.issues.messages.map(m=>m.code))]}));
 if(report.issues.numErrors)process.exitCode=1;
}})().catch(e=>{console.error(e);process.exitCode=1;});
