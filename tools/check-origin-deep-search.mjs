// Guard the expanded, conditional origin search against accidental regression.
// 12-stat scores are reconstructed from the signed 11-stat witness, never from
// a blend of different soldiers, transforms or research branches.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {spawnSync} from 'node:child_process';
import {projectCandidateStats} from '../public/soldiers/modern/score-12.js';

const read=p=>decodeOriginReport(fs.readFileSync(p,'utf8'));
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
// Never mistake a handful of deeply explored origins for a complete roster.
// The registry may later resolve more than 66 origins, but every resolved
// origin must already have its own separately replayed deep-search record.
const resolved=report.records.filter(row=>row.candidates.length>0);
const deep=resolved.filter(row=>row.searchScope?.mode==='bounded-beam'&&
  row.searchScope.maxLayers>=4&&row.searchScope.globalOptimumProven===false);
assert(resolved.length>=66,'Lost a previously resolved origin');
assert.equal(deep.length,resolved.length,
  'A resolved origin was published without a bounded four-stage deep search');
assert.equal(report.summary.withCompleteResearch,resolved.length);
assert.equal(report.summary.unresolved,72-resolved.length);
for(const row of report.records.filter(r=>!r.candidates.length)){
  assert.equal(row.searchScope?.mode,'acquisition-unresolved',
    'An unacquired soldier cannot be counted as a deep growth search');
  assert.equal(row.searchScope.maxLayers,0);
}
assert(report.summary.witnesses>=4123,
  'Previously replayed valid growth options disappeared (one Brazil/Italy start-conflict was rejected)');
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
console.log('PASS all '+deep.length+' resolved origins have independent four-stage deep-search records; '+checked+' initial 12-stat score regression floors preserved');
console.log('PASS 72 profiles / '+report.summary.witnesses+' conditional witnesses / 0 global maximum certificates');
console.log('PASS deep search requires an explicit origin and cannot silently overwrite all other records');
