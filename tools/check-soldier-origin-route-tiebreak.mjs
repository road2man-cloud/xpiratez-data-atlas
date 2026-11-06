import assert from 'node:assert/strict';
import {DISPLAY_STATS,displayTotal} from '../public/soldiers/modern/score-12.js';
import {compareEqualScoreOriginRoutes,sameStatVector,preferredOriginCandidate} from '../public/soldiers/modern/origin-route-tiebreak.js';
const vector=(total,split=false)=>Object.fromEntries(DISPLAY_STATS.map((key,i)=>
  [key,i===0?total-(split?10:0):i===1&&split?10:0]));
const candidate=(id,transforms,excluded=[],total=1254,split=false,finalSoldierType='SOLDIER')=>({
  id,finalSoldierType,growth:{kind:'conditional-upper-envelope',total,stats:vector(total,split)},
  steps:transforms.map(transform=>({type:'transform',transform})),
  trainingExclusions:excluded.map(id=>({id:'gate',excludes:[{id}]}))
});
const score=c=>c.growth.total;
const cultural=candidate('culture+other',['CULTURE','OTHER']);
const short=candidate('other',['OTHER']);
assert.equal(preferredOriginCandidate(cultural,short,score),short,
  'Equivalent final body and 12-stat vector must prefer fewer steps');
assert.equal(preferredOriginCandidate(short,cultural,score),short,
  'Preference must not depend on source order for provably equivalent routes');
const fewerExclusions=candidate('less',['A','B']);
const manyExclusions=candidate('more',['A'],['CHOICE_X']);
assert.equal(preferredOriginCandidate(manyExclusions,fewerExclusions,score),fewerExclusions,
  'Known exclusion loss takes precedence over stage count for equivalent outcomes');
const stronger=candidate('strong',['A','B','C'],['X'],1255);
assert.equal(preferredOriginCandidate(short,stronger,score),stronger,
  'Never trade higher ceiling for fewer stages');
const splitVector=candidate('different-distribution',[],[],1254,true);
assert.equal(displayTotal(splitVector.growth.stats),1254);
assert.equal(sameStatVector(cultural,splitVector),false);
assert.equal(compareEqualScoreOriginRoutes(cultural,splitVector),0,
  'Equal totals with different 12-stat distributions are not interchangeable');
assert.equal(preferredOriginCandidate(cultural,splitVector,score),cultural);
assert.equal(preferredOriginCandidate(splitVector,cultural,score),splitVector);
const differentBody=candidate('other-final-body',[],[],1254,false,'OTHER_BODY');
assert.equal(sameStatVector(cultural,differentBody),false);
assert.equal(preferredOriginCandidate(cultural,differentBody,score),cultural,
  'Equal numerical outcomes on different bodies are distinct terminal paths');
const unverified={...short,growth:{kind:'unverified',total:1254}};
assert.equal(sameStatVector(unverified,short),false,'Unverified caps cannot prove equality');
const unknownA=candidate('one',['A']),unknownB=candidate('two',['B']);
assert.equal(compareEqualScoreOriginRoutes(unknownA,unknownB),0,
  'Unknown cost/time cannot become an arbitrary ranking');
assert.equal(preferredOriginCandidate(unknownA,unknownB,score),unknownA);
console.log('Origin route efficiency and 12-stat/body equivalence regression: PASS');
