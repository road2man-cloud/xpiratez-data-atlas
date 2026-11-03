import fs from 'node:fs';
import assert from 'node:assert/strict';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {projectCandidateStats,DISPLAY_STATS,displayTotal} from '../public/soldiers/modern/score-12.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
assert.equal(report.sourceVersion,'v.o2');
assert.equal(report.records.length,72);
assert.equal(report.summary.certifiedMaxima,0);
let counted=0,increased=0,nonready=0,unresolved=0;
for(const record of report.records){
  if(!record.candidates.length){unresolved++;continue;}
  let bestGrowth=-1,bestUngrown=-1;
  for(const candidate of record.candidates){
    assert.equal(candidate.certifiedMaximum,false,'An unproven route cannot become a certified final');
    const projection=projectCandidateGrowthLimit(record,candidate,data);
    if(projection.kind!=='conditional-upper-envelope'){nonready++;continue;}
    const ungrown=projectCandidateStats(record,candidate,data);
    assert.equal(projection.total,displayTotal(projection.stats));
    assert.equal(projection.stages.length,candidate.transforms.length);
    assert(DISPLAY_STATS.every(k=>Number.isInteger(projection.stats[k])));
    assert(projection.total>=ungrown.total,'Conditional growth cannot lower a given candidate: '+candidate.id);
    assert(projection.caveat.includes('동시 달성')&&projection.caveat.includes('전역 최적성'));
    if(projection.total>ungrown.total)increased++;
    bestGrowth=Math.max(bestGrowth,projection.total);
    bestUngrown=Math.max(bestUngrown,ungrown.total);
    counted++;
  }
  assert(bestGrowth>=bestUngrown,'The best growth projection cannot be smaller than the best ungrown path');
}
// Real 2.1 exception cases must not use a low-stat positive bonus to
// inflate an unrelated above-cap high-stat endpoint.
for(const [id,rawCap,expected] of [
  ['manufacture:STR_SYNTH_RECRUITMENT',601,623],
  ['manufacture:STR_SOLDIER_TYPE_SYNTH_REPAIR',601,623],
  ['manufacture:STR_THEBAN_ASSAULT_CLONE',501,501],
  ['event:STR_MRSHAN_FIGHTER_EVENT',501,501]
]){
  const record=report.records.find(r=>r.profileId===id);
  assert(record?.candidates?.length,'Known special origin missing: '+id);
  const growth=record.candidates.map(c=>projectCandidateGrowthLimit(record,c,data));
  assert(growth.every(g=>g.kind==='conditional-upper-envelope'));
  assert(growth.every(g=>g.raw.stamina<=rawCap),
    'A raw stamina cap-overshoot or soft-limit cannot be compounded: '+id);
  const maximum=Math.max(...growth.map(g=>g.stats.stamina));
  assert.equal(maximum,expected,'Stamina changed unexpectedly: '+id);
}
assert.equal(nonready,0,'Previously validated growth routes unexpectedly lost usable caps');
assert.equal(counted,report.summary.witnesses);
assert(increased>0);
assert(unresolved>=0);
console.log('PASS growth ceiling: '+counted+' independently sourced candidates across 72 origins; '+increased+' have additional natural growth potential, '+unresolved+' unresolved origins stay blank; zero final certificates');
