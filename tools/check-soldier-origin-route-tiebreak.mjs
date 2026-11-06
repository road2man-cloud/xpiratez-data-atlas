import assert from 'node:assert/strict';
import {DISPLAY_STATS} from '../public/soldiers/modern/score-12.js';
import {compareEqualScoreOriginRoutes,preferredOriginCandidate,sameRouteStatVector} from '../public/soldiers/modern/origin-route-tiebreak.js';

const makeStats=total=>Object.fromEntries(DISPLAY_STATS.map((key,i)=>[key,i===0?total:0]));
const shifted=total=>({...makeStats(total),[DISPLAY_STATS[0]]:total-1,[DISPLAY_STATS[1]]:1});
const candidate=(id,transformIds,excludedIds=[],total=1254,{growthStats,provisionalStats}={})=>({
  id,
  growth:{kind:'conditional-upper-envelope',total,stats:growthStats||makeStats(total)},
  display:{total,stats:provisionalStats||makeStats(total)},
  steps:transformIds.map(transform=>({type:'transform',transform})),
  trainingExclusions:excludedIds.map(id=>({id:'gate',excludes:[{id}]}))
});
const cultural=candidate('culture+other',['CULTURE','OTHER']);
const short=candidate('other',['OTHER']);
const score=c=>c.growth.total;
assert.equal(preferredOriginCandidate(cultural,short,score),short,
  'Same vector and ceiling must prefer fewer training/transform stages');
assert.equal(preferredOriginCandidate(short,cultural,score),short,
  'Strict tie-break is not dependent on candidate insertion order');
const fewerExclusions=candidate('less',['A','B'],[]);
const manyExclusions=candidate('more',['A'],['CHOICE_X']);
assert.equal(preferredOriginCandidate(manyExclusions,fewerExclusions,score),fewerExclusions,
  'Confirmed recorded lost choices outrank raw step count for identical vectors');
const stronger=candidate('strong',['A','B','C'],['X'],1255);
assert.equal(preferredOriginCandidate(short,stronger,score),stronger,
  'Never trade a higher ceiling for fewer steps');
const unknowableA=candidate('one',['A'],[]);
const unknowableB=candidate('two',['B'],[]);
assert.equal(compareEqualScoreOriginRoutes(unknowableA,unknowableB),0,
  'Unknown research cost/time must not be fabricated as a ranking');
assert.equal(preferredOriginCandidate(unknowableA,unknowableB,score),unknowableA);
const different=candidate('same sum but different distribution',[],[],1254,
  {growthStats:shifted(1254)});
assert.equal(sameRouteStatVector(cultural,different),false);
assert.equal(compareEqualScoreOriginRoutes(different,cultural),0,
  'A different stat allocation is not equivalent even if its sum matches');
assert.equal(preferredOriginCandidate(cultural,different,score),cultural,
  'Do not replace one tactical stat vector with another merely to reduce steps');
assert.equal(preferredOriginCandidate(different,cultural,score),different,
  'A stat-vector tradeoff has no invented ordering independent of source order');
assert.equal(preferredOriginCandidate(cultural,different,c=>c.display.total,'provisional'),different,
  'Provisional stat vectors, not growth stat vectors, control provisional ties');
const missingVector=candidate('missing stat evidence',[]);
delete missingVector.growth.stats;
assert.equal(preferredOriginCandidate(cultural,missingVector,score),cultural,
  'Missing stats never prove two equal-score paths equivalent');
console.log('Origin tie-break vector-aware conservative regression: PASS');
