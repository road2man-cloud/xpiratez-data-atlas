'use strict';
/* Restore actual full-character R36LE GLBs from independently SHA-1
 * checked GitHub chunks. Requires Node.js only, without private donor files.
 * Run: node assemble_r36le.cjs
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'ARTIFACTS.json'),'utf8'));
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const gitBlob=bytes=>crypto.createHash('sha1').update(Buffer.concat([
 Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
for(const spec of manifest.files){
 const chunks=spec.parts.map(part=>{
  const src=path.join(root,part.path);
  const data=fs.readFileSync(src);
  if(part.bytes!==data.length||gitBlob(data)!==part.git_blob_sha)
   throw Error('R36LE archive part mismatch: '+part.path);
  return data;
 });
 const reconstructed=Buffer.concat(chunks);
 if(reconstructed.length!==spec.bytes||sha256(reconstructed)!==spec.sha256)
  throw Error('R36LE assembled model checksum failure: '+spec.output);
 const dest=path.join(root,spec.output);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 if(fs.existsSync(dest)){
  const old=fs.readFileSync(dest);
  if(sha256(old)!==spec.sha256)
   throw Error('Refusing to overwrite unexpected existing model: '+dest);
  console.log('UNCHANGED',spec.output,old.length);
 }else{
  fs.writeFileSync(dest,reconstructed);
  console.log('ASSEMBLED',spec.output,reconstructed.length,spec.sha256);
 }
}
console.log('R36LE_ASSEMBLY_COMPLETE',manifest.files.length);
