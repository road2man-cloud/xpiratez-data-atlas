// Audit all original source-backed witnesses before treating equal totals as equivalent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {originRankingCandidates} from '../public/soldiers/modern/shared-terminal-targets.js';
import {candidateMatchesCampaign} from '../public/soldiers/modern/origin-campaign-context.js';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {projectCandidateStats} from '../public/soldiers/modern/score-12.js';
import {preferredOriginCandidate,sameProjectedOutcome,transformationCount,excludedTrainingCount} from '../public/soldiers/modern/origin-route-tiebreak.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
assert.equal(report.records.length,72);
const score=c=>c.growth?.total??-1;
let count=0,changed=0,sameTotalDifferentVectors=0,multipleEquivalent=0,originsWithTies=0;
const changes=[];
for(const record of report.records){
  const candidates=originRankingCandidates(record,candidateMatchesCampaign);
  for(const c of candidates){
    c.growth=projectCandidateGrowthLimit(record,c,data);
    c.display=projectCandidateStats(record,c,data);
    assert.equal(c.growth.kind,'conditional-upper-envelope',c.id);
  }
  count+=candidates.length;
  const baseline=candidates.reduce((win,c)=>!win||score(c)>score(win)?c:win,null);
  const preferred=candidates.reduce((win,c)=>
    preferredOriginCandidate(win,c,score,x=>x.growth?.stats),null);
  assert.equal(score(preferred),score(baseline),'An efficiency tie-break cannot reduce the ceiling: '+record.profileId);
  if(!preferred)continue;
  const sameTotal=candidates.filter(c=>score(c)===score(preferred));
  const sameVector=sameTotal.filter(c=>sameProjectedOutcome(c,preferred));
  if(sameVector.length>1)multipleEquivalent++;
  if(sameTotal.length>1)originsWithTies++;
  sameTotalDifferentVectors+=sameTotal.length-sameVector.length;
  if(preferred!==baseline){
    changed++;
    assert(sameProjectedOutcome(preferred,baseline),
      'New preferred path may only replace a completely equivalent 12-stat vector');
    const reducedExcluded=excludedTrainingCount(preferred)<excludedTrainingCount(baseline);
    const reducedTransforms=excludedTrainingCount(preferred)===excludedTrainingCount(baseline)&&
      transformationCount(preferred)<transformationCount(baseline);
    assert(reducedExcluded||reducedTransforms,
      'New preference must have a source-backed efficiency improvement');
    changes.push({origin:record.profileId,name:record.name,
      ceiling:score(preferred),priorTraining:transformationCount(baseline),
      chosenTraining:transformationCount(preferred),
      priorExcluded:excludedTrainingCount(baseline),
      chosenExcluded:excludedTrainingCount(preferred)});
  }
}
assert.equal(count,4306,'Existing independent candidates must remain intact');
console.log(JSON.stringify({status:'PASS',origins:72,candidates:count,changed,
  originsWithTies,multipleEquivalent,sameTotalDifferentVectors,changes:changes.slice(0,20)},null,2));
