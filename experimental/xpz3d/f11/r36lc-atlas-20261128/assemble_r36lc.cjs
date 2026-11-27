'use strict';
/* Reassembles GitHub-backed R36LC GLB chunks. Node.js only. No network required.
   Integrity: SHA-256 for every reconstructed GLB (no overwrites of mismatched data).
   Usage: node assemble_r36lc.cjs
*/
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'ARTIFACTS.json'),'utf8'));
for(const spec of manifest.files){
 const dest=path.join(root,spec.output);
 const parts=spec.parts.map(item=>fs.readFileSync(path.join(root,item.path)));
 const combined=Buffer.concat(parts);
 const hash=crypto.createHash('sha256').update(combined).digest('hex');
 if(combined.length!==spec.bytes||hash!==spec.sha256)
  throw Error('Corrupt R36LC binary: '+spec.output+' '+combined.length+' / '+hash);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 if(fs.existsSync(dest)){
   const existing=fs.readFileSync(dest);
   const oldHash=crypto.createHash('sha256').update(existing).digest('hex');
   if(oldHash!==hash)throw Error('Refusing to replace existing model: '+dest);
   console.log('UNCHANGED',spec.output,hash);
 }else{
   fs.writeFileSync(dest,combined);
   console.log('ASSEMBLED',spec.output,combined.length,hash);
 }
}
console.log('R36LC_ARTIFACTS_VERIFIED',manifest.files.length);
