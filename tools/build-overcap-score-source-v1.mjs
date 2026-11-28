// V162: hash-bound raw score facts and captain-rank rules.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
const sha=b=>createHash('sha256').update(b).digest('hex');
const arg=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
const root=arg('source'),yaml=createRequire(import.meta.url)(arg('yaml')||'js-yaml');assert(root);
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json'));
const lock=JSON.parse(fs.readFileSync('tools/headless-simulator/native/source.lock.json'));
assert.equal(sha(fs.readFileSync(path.join(root,'metadata.yml'))),data.meta.source.metadataSha256);
assert.equal(sha(fs.readFileSync('tools/headless-simulator/native/'+lock.archive)),lock.archiveSha256);
const files=data.meta.source.rules,points={},eventPoints={},conflicts={},rankRows=[];
assert.deepEqual(fs.readdirSync(path.join(root,'Ruleset')).filter(f=>f.toLowerCase().endsWith('.rul')).sort(),files.map(f=>f.file).sort());
function score(table,section,r){
 const id=r.name||r.delete;if(!id)return;
 if(r.delete){delete table[id];return;}
 if(r.refNode){conflicts[section+':'+id]='inheritance';return;}
 if(Object.hasOwn(r,'points')){
  assert(Number.isSafeInteger(r.points));
  if(Object.hasOwn(table,id)&&table[id]!==r.points&&table[id]!==0)conflicts[section+':'+id]='explicit point override';
  table[id]=r.points;
 }else if(!Object.hasOwn(table,id))table[id]=0;
}
for(const f of files){
 const b=fs.readFileSync(path.join(root,'Ruleset',f.file));assert.equal(sha(b),f.sha256,f.file);
 yaml.loadAll(b.toString('utf8').replace(/^\uFEFF/,''),doc=>{
  for(const [section,table] of [['research',points],['events',eventPoints]])for(const r of doc?.[section]||[])score(table,section,r);
  for(const section of ['research','events','eventScripts'])for(const r of doc?.[section]||[]){
   const id=r.name||r.type;if(!/^STR_CAPTAINS_RANK_0[1-5]$/.test(id||''))continue;
   assert(!r.refNode&&!r.delete&&!rankRows.some(x=>x.section===section&&x.id===id));rankRows.push({section,id,file:f.file,sha256:f.sha256,raw:r});
  }
 },{json:true});
}
assert.equal(rankRows.length,15);
const report={schema:'ATLAS_OVERCAP_SCORE_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:files,engineArchiveSha256:lock.archiveSha256,points,eventPoints,conflicts,rankRows,engineEvidence:['SavedGame.cpp:1530-1585,2527-2530,3130-3140','GeoscapeState.cpp:3589,4028-4057','GeoscapeEventState.cpp:191-206,434-493','SavedGame.cpp:1114-1124'],scope:'Raw point facts only. Monthly regional activities and research duration not modeled.'};
const out='tools/data/overcap-score-source-v1-'+sha(JSON.stringify(report)).slice(0,20)+'.json.gz';
if(fs.existsSync(out))assert.deepEqual(JSON.parse(gunzipSync(fs.readFileSync(out))),report);else fs.writeFileSync(out,gzipSync(JSON.stringify(report)+'\n'),{flag:'wx'});
console.log(JSON.stringify({out,researchCount:Object.keys(points).length,eventCount:Object.keys(eventPoints).length,conflicts:Object.keys(conflicts).length,rankRows:rankRows.length,bytes:fs.statSync(out).size}));
