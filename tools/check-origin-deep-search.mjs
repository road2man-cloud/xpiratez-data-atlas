// Guard the expanded, conditional origin search against accidental regression.
// 12-stat scores are reconstructed from the signed 11-stat witness, never from
// a blend of different soldiers, transforms or research branches.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {projectCandidateStats} from '../public/soldiers/modern/score-12.js';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const data=read('public/data/soldiers-modern-index.json');
const report=read('public/data/soldier-origin-candidates.json');
const floors=new Map([
  ['direct:STR_SOLDIER_X',{paths:38,total12:568}],
  ['direct:STR_SOLDIER_SLAVE',{paths:75,total12:540}],
  ['manufacture:STR_MILITIAMAN_RECRUITMENT',{paths:89,total12:674}],
  ['manufacture:STR_VOLUNTEER_SOLDIER_RECRUITMENT',{paths:75,total12:551}],
  ['manufacture:STR_SURVIVOR_RECRUITMENT',{paths:104,total12:1075}]
]);
assert.equal(report.sourceVersion,'v.o2');
assert.equal(report.summary.profiles,72);
assert.equal(report.summary.certifiedMaxima,0);
assert.equal(report.scope.globalOptimumProven,false);
assert.equal(report.summary.witnesses,
  report.records.reduce((sum,row)=>sum+row.candidates.length,0));
let checked=0;
for(const [id,{paths,total12}] of floors){
  const row=report.records.find(row=>row.profileId===id);
  assert(row,'Missing expanded origin: '+id);
  assert.equal(row.searchScope.mode,'bounded-beam');
  assert.equal(row.searchScope.globalOptimumProven,false);
  assert(row.searchScope.maxLayers>=4);
  assert(row.candidates.length>=paths,'Lost candidate paths: '+id);
  assert(row.candidates.some(c=>c.transforms.length>=4),'Lost a deep path: '+id);
  assert(row.candidates.every(c=>c.certifiedMaximum===false));
  const best=Math.max(...row.candidates.map(c=>projectCandidateStats(row,c,data).total));
  assert(best>=total12,'Lost a higher-scoring 12-stat route: '+id);
  checked++;
}
const invalid=spawnSync(process.execPath,
  ['tools/build-soldier-origin-candidates.mjs','--deep-search','--check'],
  {encoding:'utf8',timeout:30000,maxBuffer:1000000});
assert.equal(invalid.status,1,invalid.error?.message||'An unscoped deep scan must be rejected');
assert.match(invalid.stderr,/--deep-search requires --profile/);
console.log('PASS five expanded origins: '+checked+' scoped search records, 4-deep paths, verified 12-stat score floors');
console.log('PASS 72 profiles / '+report.summary.witnesses+' conditional witnesses / 0 global maximum certificates');
console.log('PASS deep search requires an explicit origin and cannot silently overwrite all other records');
