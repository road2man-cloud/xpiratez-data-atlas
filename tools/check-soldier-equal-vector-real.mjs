// Actual X-Piratez 2.1 counterexamples for same SUM / different stat-vector paths.
// Keep conditionally replayed birth witnesses untouched and never invent a winner.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {DISPLAY_STATS,projectCandidateStats} from '../public/soldiers/modern/score-12.js';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {originRankingCandidates} from '../public/soldiers/modern/shared-terminal-targets.js';
import {preferredOriginCandidate,compareEqualScoreOriginRoutes} from '../public/soldiers/modern/origin-route-tiebreak.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
let origins=0,growthSumTies=0,distinctVectorCases=0,vectorGroups=0;
for(const record of report.records){
  const choices=originRankingCandidates(record,c=>c.campaignContext?.kind==='compatible');
  assert(choices.length,'Origin has no independently comparable route: '+record.profileId);
  for(const choice of choices){
    choice.growth=projectCandidateGrowthLimit(record,choice,data);
    choice.display=projectCandidateStats(record,choice,data);
    assert.equal(choice.growth.kind,'conditional-upper-envelope');
  }
  const score=c=>c.growth.total;
  const maximum=Math.max(...choices.map(score));
  const top=choices.filter(c=>score(c)===maximum);
  const groups=new Map();
  for(const candidate of top){
    const key=DISPLAY_STATS.map(k=>candidate.growth.stats[k]).join(',');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(candidate);
  }
  const selected=choices.reduce((winner,c)=>preferredOriginCandidate(winner,c,score,'growth'),null);
  assert.equal(score(selected),maximum,'Top sum must not be lowered: '+record.profileId);
  const selectedKey=DISPLAY_STATS.map(k=>selected.growth.stats[k]).join(',');
  assert(groups.has(selectedKey));
  for(const [key,group] of groups){
    if(key===selectedKey)continue;
    const alternate=group[0];
    assert.equal(score(alternate),score(selected));
    assert.equal(compareEqualScoreOriginRoutes(alternate,selected,'growth'),0,
      'Equal totals with different stat allocations are not equivalent paths');
    assert.equal(preferredOriginCandidate(selected,alternate,score,'growth'),selected);
  }
  if(top.length>1)growthSumTies++;
  if(groups.size>1)distinctVectorCases++;
  vectorGroups+=groups.size;
  origins++;
}
assert.equal(origins,72);
assert(distinctVectorCases>0,'Actual 2.1 witnesses must exercise the different-vector counterexample');
console.log('PASS vector-safe 72-origin top paths: '+growthSumTies+
  ' births have multiple highest-score routes; '+distinctVectorCases+
  ' have same-sum/different-stat-vector choices ('+vectorGroups+' distinct score-max vectors)');
