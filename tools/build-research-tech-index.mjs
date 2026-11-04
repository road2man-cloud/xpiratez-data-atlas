// Build a version-isolated, source-backed research path index for the legacy
// item/research DB. Never import the modern v.o2 choice runtime into this graph.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const root=path.resolve('public/items/data');
const index=JSON.parse(fs.readFileSync(path.join(root,'research-index.json'),'utf8'));
const buckets='0123456789abcdef'.split('');
const list=x=>Array.isArray(x)?x:typeof x==='string'?[x]:[];
const strings=x=>[...new Set(list(x).filter(v=>typeof v==='string'&&v))];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const details=new Map(),files={};
for(const bucket of buckets){
  const file=path.join(root,'research-chunks',bucket+'.json');
  const contents=fs.readFileSync(file);
  files[bucket]=sha(contents);
  const chunk=JSON.parse(contents).details;
  for(const [id,record] of Object.entries(chunk)){
    assert(!details.has(id),'Duplicate research topic '+id);
    assert.equal(record.id,id,'Corrupt chunk research ID '+id);
    assert.equal(record.bucket,bucket,'Wrong chunk bucket '+id);
    details.set(id,record);
  }
}
assert.equal(details.size,index.index.length,'Research index / chunks topic count drift');
const topics={};
for(const entry of index.index){
  const d=details.get(entry.id);
  assert(d,'Research row missing from chunks: '+entry.id);
  assert.equal(d.koName,entry.koName,'Research name drift: '+entry.id);
  const raw=d.raw||{};
  const guarded={};
  for(const [guard,candidates] of Object.entries(d.getOneFreeProtected||raw.getOneFreeProtected||{})){
    const ids=strings(candidates);
    if(ids.length)guarded[guard]=ids;
  }
  const fields={
    id:d.id,name:d.koName,english:d.enName,
    cost:d.cost,needItem:!!d.needItem,destroyItem:!!d.destroyItem,
    neededItem:raw.neededItem||null,
    dependencies:strings(d.dependencies||raw.dependencies),
    requires:strings(raw.requires),
    requiresBaseFunc:strings(raw.requiresBaseFunc),
    unlocks:strings(d.unlocks||raw.unlocks),
    getOneFree:strings(d.getOneFree||raw.getOneFree),
    getOneFreeProtected:guarded,
    disables:strings(raw.disables),
    reenables:strings(raw.reenables),
    lookup:typeof raw.lookup==='string'?raw.lookup:null,
    sourceFiles:strings(d.sourceFiles)
  };
  topics[d.id]=fields;
}
assert.equal(Object.keys(topics).length,index.index.length);
const result={meta:{
  schemaVersion:1,sourceVersion:index.meta.mod.version,
  requiredEngine:index.meta.mod.requiredExtendedVersion,
  sourceMetadataSha256:index.meta.source.metadataSha256,
  researchCount:index.index.length,
  chunkSha256:files,
  scope:'Legacy research rules only. Does not certify mission/event grants or route availability.'
},topics};
const output=path.resolve('public/research/acquisition-index.json');
const serialized=JSON.stringify(result)+'\n';
const zipped=zlib.gzipSync(Buffer.from(serialized),{level:9,mtime:0});
if(process.argv.includes('--check')){
  assert.equal(fs.readFileSync(output,'utf8'),serialized,
    'Legacy research path index stale: npm run build:research:tech');
  assert.deepEqual(fs.readFileSync(output+'.gz'),zipped,
    'Legacy compressed research path index stale: npm run build:research:tech');
  console.log('PASS legacy acquisition index matches original research chunks: '+details.size+' topics');
}else{
  fs.writeFileSync(output,serialized);
  fs.writeFileSync(output+'.gz',zipped);
  console.log('Built legacy research path index: '+details.size+' topics, '+Buffer.byteLength(serialized)+' bytes / gzip '+zipped.length+' bytes');
}
