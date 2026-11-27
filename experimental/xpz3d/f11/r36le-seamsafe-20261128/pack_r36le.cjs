'use strict';
/* Repeatable R36LE GLB chunk exporter for GitHub-friendly browser streaming.
 * Node.js only. Does not modify existing source GLBs. Refuses to replace
 * bytes that differ from already-published data.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,manifest=JSON.parse(fs.readFileSync(path.join(root,'ARTIFACTS.json'),'utf8'));
const blobSha=b=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
const fileSha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const model of manifest.files){
 const original=fs.readFileSync(path.join(root,model.output));
 if(original.length!==model.bytes||fileSha(original)!==model.sha256)throw Error('GLB source hash mismatch: '+model.output);
 let offset=0;
 for(const part of model.parts){
  const data=original.subarray(offset,offset+part.bytes);
  if(blobSha(data)!==part.git_blob_sha)throw Error('Unexpected published Git blob hash: '+part.path);
  const target=path.join(root,part.path);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  if(fs.existsSync(target)){
   if(!fs.readFileSync(target).equals(data))throw Error('Refusing to overwrite different existing part: '+target);
  }else fs.writeFileSync(target,data);
  offset+=part.bytes;
 }
 if(offset!==original.length)throw Error('Part size mismatch: '+model.output);
 console.log('PACKED',model.output,model.parts.length,offset);
}
console.log('R36LE_ARCHIVE_PACK_OK');