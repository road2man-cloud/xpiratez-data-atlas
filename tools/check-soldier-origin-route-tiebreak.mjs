import assert from 'node:assert/strict';
import {DISPLAY_STATS,displayTotal} from '../public/soldiers/modern/score-12.js';
import {compareEqualScoreOriginRoutes,sameProjectedOutcome,preferredOriginCandidate} from '../public/soldiers/modern/origin-route-tiebreak.js';
const vector=(total,split=false)=>Object.fromEntries(DISPLAY_STATS.map((key,i)=>
  [key,i===0?total-(split?10:0):i===1&&split?10:0]));
const candidate=(id,transforms,excluded=[],total=1254,split=false,finalSoldierType='SOLDIER')=>({
  id,finalSoldierType,growth:{kind:'conditional-upper-envelope',total,stats:vector(total,split)},
  steps:transforms.map(transform=>({type:'transform',transform})),
  trainingExclusions:excluded.map(id=>({id:'gate',excludes:[{id}]}))
});
const score=c=>c.growth.total,stats=c=>c.growth.stats;
const cultural=candidate('culture+other',['CULTURE','OTHER']);
const short=candidate('other',['OTHER']);
assert.equal(preferredOriginCandidate(cultural,short,score,stats),short,
  'Equivalent final body and 12-stat vector must prefer fewer steps');
assert.equal(preferredOriginCandidate(short,cultural,score,stats),short,
  'Preference must not depend on source order for equivalent routes');
const fewerExclusions=candidate('less',['A','B']);
const manyExclusions=candidate('more',['A'],['CHOICE_X']);
assert.equal(preferredOriginCandidate(manyExclusions,fewerExclusions,score,stats),fewerExclusions,
  'Known exclusion loss takes precedence over stage count for equivalent outcomes');
const stronger=candidate('strong',['A','B','C'],['X'],1255);
assert.equal(preferredOriginCandidate(short,stronger,score,stats),stronger,
  'Never trade higher ceiling for fewer stages');
const splitVector=candidate('different-distribution',[],[],1254,true);
assert.equal(displayTotal(splitVector.growth.stats),1254);
assert.equal(sameProjectedOutcome(cultural,splitVector),false);
assert.equal(compareEqualScoreOriginRoutes(cultural,splitVector,stats),0,
  'Equal totals with different 12-stat distributions are not interchangeable');
assert.equal(preferredOriginCandidate(cultural,splitVector,score,stats),cultural,
  'Different combat stat distribution must not displace a longer earlier route');
assert.equal(preferredOriginCandidate(splitVector,cultural,score,stats),splitVector,
  'Different stat distributions retain source order');
const differentBody=candidate('other-final-body',[],[],1254,false,'OTHER_BODY');
assert.equal(sameProjectedOutcome(cultural,differentBody),false);
assert.equal(preferredOriginCandidate(cultural,differentBody,score,stats),cultural,
  'An equal numerical outcome on a different final body must not count as the same route');
const unknownA=candidate('one',['A']),unknownB=candidate('two',['B']);
assert.equal(compareEqualScoreOriginRoutes(unknownA,unknownB,stats),0,
  'Unknown research resource/time cost must not be invented');
assert.equal(preferredOriginCandidate(unknownA,unknownB,score,stats),unknownA);
console.log('Origin route efficiency and 12-stat/body equivalence regression: PASS');
