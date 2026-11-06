import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {originRankingCandidates} from '../public/soldiers/modern/shared-terminal-targets.js';
import {DISPLAY_STATS} from '../public/soldiers/modern/score-12.js';
import {compareEqualScoreOriginRoutes,preferredOriginCandidate,routeTieEvidence,
  sameRouteStatVector} from '../public/soldiers/modern/origin-route-tiebreak.js';

function candidate(id, transforms, excluded=[], total=1254, allocation={}){
  const stats=Object.fromEntries(DISPLAY_STATS.map(k=>[k,0]));
  stats.firing=total;Object.assign(stats,allocation);
  return {id,finalSoldierType:'STR_SOLDIER_TEST',growth:{kind:'conditional-upper-envelope',total,stats},
    display:{total,stats},steps:transforms.map(transform=>({type:'transform',transform})),
    trainingExclusions:excluded.map(x=>({id:'gate',excludes:[{id:x}]}))};
}
const cultural=candidate('culture+other',['CULTURE','OTHER']);
const short=candidate('other',['OTHER']);
const score=c=>c.growth.total;
assert(sameRouteStatVector(cultural,short));
assert.equal(preferredOriginCandidate(cultural,short,score),short,
  'Same 12-stat ceiling must prefer fewer training stages');
assert.equal(preferredOriginCandidate(short,cultural,score),short,
  'Strict tie-break must not depend on insertion order');
const fewerExclusions=candidate('less',['A','B'],[]);
const manyExclusions=candidate('more',['A'],['CHOICE_X']);
assert.equal(preferredOriginCandidate(manyExclusions,fewerExclusions,score),fewerExclusions,
  'Confirmed blocked training choices outrank step count');
const stronger=candidate('strong',['A','B','C'],['X'],1255);
assert.equal(preferredOriginCandidate(short,stronger,score),stronger,
  'Never sacrifice an otherwise higher ceiling to minimize training');
const differentVector=candidate('different',['Z'],[],1254,{firing:1244,melee:10});
assert(!sameRouteStatVector(cultural,differentVector));
assert.equal(preferredOriginCandidate(cultural,differentVector,score),cultural,
  'Same total with changed combat stats is not a proven equivalent result');
const differentBody={...short,id:'identical-stats-other-body',finalSoldierType:'STR_SOLDIER_OTHER',
  steps:[],trainingExclusions:[]};
assert(!sameRouteStatVector(cultural,differentBody),
  'Identical 12 stats from different soldier bodies are not the same outcome');
assert.equal(preferredOriginCandidate(cultural,differentBody,score),cultural,
  'A different final body must not displace an earlier route just because it has fewer steps');
assert.equal(preferredOriginCandidate(differentBody,cultural,score),differentBody,
  'Unranked final-body choices must preserve original candidate order');
assert(!sameRouteStatVector({...short,finalSoldierType:null},short),
  'Unknown final body is not eligible for a certified tie-break');
const tied=routeTieEvidence([cultural,short,differentVector,differentBody,stronger],short,score);
assert.equal(tied.equalTotal.length,4);
assert.equal(tied.sameVector.length,2);
assert.equal(tied.differentVector.length,2);
assert.equal(compareEqualScoreOriginRoutes(candidate('one',['A']),candidate('two',['B'])),0,
  'Research, cost and time cannot be guessed as tie-breakers');
assert.equal(preferredOriginCandidate(short,{id:'unknown',steps:[]},()=>0,'provisional'),short,
  'Missing provisional vector must preserve the existing candidate');
assert.equal(preferredOriginCandidate(short,differentVector,score,'provisional'),short);

// Source-backed regression: registered research witnesses are preserved, not abbreviated.
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const compatible=c=>c.campaignContext?.kind==='compatible';
assert.equal(report.records.length,72);
let ordinaryCount=0,topTieOrigins=0,changedVectorOrigins=0,exactPeerOrigins=0;
for(const record of report.records){
  const candidates=originRankingCandidates(record,compatible).map(c=>({
    ...c,growth:projectCandidateGrowthLimit(record,c,data)
  }));
  ordinaryCount+=candidates.length;
  const selected=candidates.reduce((a,b)=>preferredOriginCandidate(a,b,score),null);
  assert(selected && selected.growth.kind==='conditional-upper-envelope');
  const evidence=routeTieEvidence(candidates,selected,score);
  if(evidence.equalTotal.length>1)topTieOrigins++;
  if(evidence.differentVector.length)changedVectorOrigins++;
  if(evidence.sameVector.length>1)exactPeerOrigins++;
  for(const peer of evidence.sameVector){
    assert(sameRouteStatVector(selected,peer));
    assert.equal(peer.growth.total,selected.growth.total);
  }
  assert.equal(candidates.length,record.candidates.filter(compatible)
    .filter(c=>c.finalSoldierType!=='STR_SOLDIER_CHORT').length);
}
assert.equal(ordinaryCount,4306);
assert.equal(topTieOrigins,52);
assert.equal(changedVectorOrigins,9);
assert.equal(exactPeerOrigins,50);
console.log('PASS 72 birth origins: 4306 candidates, 52 top-score tie origins, 50 with same-12-stat alternatives, 9 with different-stat equal totals; no invented training costs');
