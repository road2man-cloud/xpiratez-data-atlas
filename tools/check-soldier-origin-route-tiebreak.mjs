import assert from 'node:assert/strict';
import {compareEqualScoreOriginRoutes,preferredOriginCandidate} from '../public/soldiers/modern/origin-route-tiebreak.js';
const candidate = (id, transformIds, excludedIds = [], total = 1254) => ({
  id, growth:{kind:'conditional-upper-envelope',total},
  steps:transformIds.map(transform=>({type:'transform',transform})),
  trainingExclusions:excludedIds.map(id=>({id:'gate',excludes:[{id}]}))
});
const cultural = candidate('culture+other',['CULTURE','OTHER']);
const short = candidate('other',['OTHER']);
const score = c=>c.growth.total;
assert.equal(preferredOriginCandidate(cultural,short,score),short,
  'Equivalent ceiling must prefer fewer training/transform stages');
assert.equal(preferredOriginCandidate(short,cultural,score),short,
  'Route result must not depend on candidate insertion order for strict tie-break');
const fewerExclusions = candidate('less',['A','B'],[]);
const manyExclusions = candidate('more',['A'],['CHOICE_X']);
assert.equal(preferredOriginCandidate(manyExclusions,fewerExclusions,score),fewerExclusions,
  'Confirmed lost training choices outrank raw step count');
const stronger = candidate('strong',['A','B','C'],['X'],1255);
assert.equal(preferredOriginCandidate(short,stronger,score),stronger,
  'Never trade a higher ceiling for fewer steps');
const unknowableA = candidate('one',['A'],[]);
const unknowableB = candidate('two',['B'],[]);
assert.equal(compareEqualScoreOriginRoutes(unknowableA,unknowableB),0,
  'Unknown research cost/time must not be fabricated as a ranking');
assert.equal(preferredOriginCandidate(unknowableA,unknowableB,score),unknowableA);
console.log('Origin tie-break conservative regression: PASS');
