// Lossless archival transport for the produced V126–V129 artifacts.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
const hash=(b,algo='sha256')=>createHash(algo).update(b).digest('hex');
const blob=b=>hash(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b]),'sha1');
const base=path.resolve(process.argv[2]||'docs/career-batches');
const out=path.join(base,'v129-publication');fs.mkdirSync(out,{recursive:true});
const files=[],sources=[];
for(const v of [126,127,128,129]){
 const dir=path.join(base,'v'+v+'-run1');
 const graph='campaign-forward-research-graph-v'+v+'.json.gz',index='campaign-forward-research-index-v'+v+'.json';
 const names=fs.readdirSync(dir).sort();
 assert(names.includes(graph)&&names.includes(index));
 const gz=fs.readFileSync(path.join(dir,graph)),idx=JSON.parse(fs.readFileSync(path.join(dir,index),'utf8'));
 assert.equal(hash(gz),idx.graphSha256);
 const g=JSON.parse(gunzipSync(gz));assert.equal(g.version,v);assert.equal(g.sourceFingerprint,idx.sourceFingerprint);
 function stage(name,bytes,destination){
  fs.writeFileSync(path.join(out,name),bytes);
  files.push({name,destination,bytes:bytes.length,sha256:hash(bytes),gitBlobSha:blob(bytes)});
 }
 for(const n of [graph,index])stage(n,fs.readFileSync(path.join(dir,n)),'public/data/'+n);
 const entries=names.filter(n=>n!==graph&&n!==index).map(n=>{
  const b=fs.readFileSync(path.join(dir,n));return {name:n,bytes:b.length,sha256:hash(b),base64:b.toString('base64')};
 });
 const payload={schema:'XPZ_CAMPAIGN_FORWARD_EVIDENCE_ARCHIVE_V1',version:v,sourceFingerprint:idx.sourceFingerprint,graphSha256:idx.graphSha256,entries,gameCertified:false,registered:false};
 const archive=gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});
 const decoded=JSON.parse(gunzipSync(archive));for(const e of decoded.entries){const b=Buffer.from(e.base64,'base64');assert.equal(b.length,e.bytes);assert.equal(hash(b),e.sha256);}
 stage('v'+v+'-evidence-archive.json.gz',archive,'docs/career-batches/v'+v+'-evidence-archive.json.gz');
 sources.push({version:v,sourceFingerprint:idx.sourceFingerprint,graphSha256:idx.graphSha256,entries:entries.map(({base64,...rest})=>rest)});
}
const manifest={schema:'XPZ_CAMPAIGN_FORWARD_PUBLICATION_V1',files,sources,gameCertified:false,registered:false,notes:'Exact original evidence bytes recoverable from archive entries. This is production evidence, not native certification or public-site registration.'};
fs.writeFileSync(path.join(out,'v129-publication-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({files,sources:sources.map(s=>({version:s.version,evidenceFiles:s.entries.length}))}));
