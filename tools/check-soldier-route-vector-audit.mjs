// Source-backed census of equivalent 12-stat training alternatives.
// Never modifies archived 2.1 chronological witnesses or certifies global maxima.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {originRankingCandidates} from '../public/soldiers/modern/shared-terminal-targets.js';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {projectCandidateStats} from '../public/soldiers/modern/score-12.js';
import {preferredOriginCandidate,sameStatVector,transformationCount,excludedTrainingCount} from '../public/soldiers/modern/origin-route-tiebreak.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
assert.equal(report.records.length,72);
const score=c=>c.growth?.kind==='conditional-upper-envelope'?c.growth.total:-1;
let counted=0,changed=0,originsWithTies=0,identicalVectorTies=0,sameTotalDifferentVectors=0;
const changes=[];
for(const record of report.records){
  const candidates=originRankingCandidates(record,c=>c.campaignContext?.kind==='compatible');
  for(const c of candidates){
    c.growth=projectCandidateGrowthLimit(record,c,data);
    c.display=projectCandidateStats(record,c,data);
    assert.equal(c.growth.kind,'conditional-upper-envelope',c.id);
  }
  counted+=candidates.length;
  const baseline=candidates.reduce((win,c)=>!win||score(c)>score(win)?c:win,null);
  const preferred=candidates.reduce((win,c)=>preferredOriginCandidate(win,c,score),null);
  assert.equal(score(preferred),score(baseline),'Efficiency tie-break cannot lower ceiling: '+record.profileId);
  if(!preferred)continue;
  const ties=candidates.filter(c=>score(c)===score(preferred));
  const same=tie=>sameStatVector(tie,preferred);
  const exact=ties.filter(same);
  if(ties.length>1)originsWithTies++;
  if(exact.length>1)identicalVectorTies++;
  sameTotalDifferentVectors+=ties.length-exact.length;
  if(preferred!==baseline){
    changed++;
    assert(sameStatVector(preferred,baseline),'Chosen path must match all twelve stats AND body');
    const fewerExclusions=excludedTrainingCount(preferred)<excludedTrainingCount(baseline);
    const fewerStages=excludedTrainingCount(preferred)===excludedTrainingCount(baseline)&&
      transformationCount(preferred)<transformationCount(baseline);
    assert(fewerExclusions||fewerStages,'No demonstrable route efficiency improvement');
    changes.push({id:record.profileId,ceiling:score(preferred),
      previousSteps:transformationCount(baseline),chosenSteps:transformationCount(preferred)});
  }
}
assert.equal(counted,4306,'Do not silently delete independent source candidates');
for(const id of ['manufacture:STR_POLTERGEIST_EMBODIMENT','direct:STR_SOLDIER_DOLL']){
  assert(changes.some(c=>c.id===id),'Previously confirmed efficient alternative disappeared: '+id);
}
assert(sameTotalDifferentVectors>0,'Census must exercise same-total, different-stat counterexamples');
console.log(JSON.stringify({result:'PASS',origins:72,candidates:counted,changed,
  originsWithTies,identicalVectorTies,sameTotalDifferentVectors,changes},null,2));
