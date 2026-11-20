import assert from 'node:assert/strict';
import {conditionBirthPairs,effectiveNewbornStat} from
  '../public/soldiers/modern/birth-selection.js';
import {BIRTH_STAT_KEYS,newbornRawPairs} from
  '../public/soldiers/modern/birth-rng-math.js';
import {registeredRouteDistribution} from
  '../public/soldiers/modern/route-roll-math.js';
import {candidateRollSummary,rankCandidateRollSummaries} from
  '../public/soldiers/modern/route-candidate-expectation.js';

const blank=Object.fromEntries(BIRTH_STAT_KEYS.map(k=>[k,k==='health'?1:k==='bravery'?10:0]));
const lo={...blank,tu:5},hi={...blank,tu:7};
const bonus={id:'B',stats:{tu:3,psiSkill:6}};
const birth={id:'X',soldierType:'S',currentStatsOverride:{},
  initialStatsBeforeTraits:{min:lo,max:hi},currentStatsBeforeTraits:{min:lo,max:hi},
  traitCounts:{},traitStats:{}};
const soldier={id:'S',minStats:lo,maxStats:hi,statCaps:{...hi,tu:10}};
const gate={id:'G',allowedSoldierTypes:['S'],requiredMinStats:{tu:7}};
const data={profiles:[birth],soldiers:[soldier],transformations:[gate],bonuses:[bonus]};
const path=(ids)=>({id:ids.join('-')||'empty',profileId:'X',
  transforms:ids,steps:ids.map(transform=>({type:'transform',transform})),
  finalSoldierType:'S',researchCount:0,assumptions:[]});
const none=path([]),gated=path(['G']);
const base=registeredRouteDistribution(data,'X',gated);
assert.equal(base.kind,'conditional-route-distribution');
assert(Math.abs(base.statGateProbability-1/3)<1e-12);
assert.equal(base.stats.tu,7);
const selected=registeredRouteDistribution(data,'X',gated,
  {birthSelection:{mode:'atLeast',stats:{tu:6}}});
assert.equal(selected.kind,'conditional-route-distribution');
assert(Math.abs(selected.birthSelectionProbability-2/3)<1e-12);
assert(Math.abs(selected.statGateProbability-.5)<1e-12);
assert(Math.abs(selected.jointStatEligibilityProbability-1/3)<1e-12);
assert.equal(selected.stats.tu,7);
const exact=registeredRouteDistribution(data,'X',gated,
  {birthSelection:{mode:'exact',stats:{tu:7}}});
assert.equal(exact.statGateProbability,1);
assert.equal(exact.birthSelectionProbability,1/3);
assert.equal(exact.jointStatEligibilityProbability,1/3);
assert.equal(registeredRouteDistribution(data,'X',gated,
  {birthSelection:{mode:'exact',stats:{tu:8}}}).kind,'birth-incompatible');
const gatedLow=registeredRouteDistribution(data,'X',gated,
  {birthSelection:{mode:'exact',stats:{tu:5}}});
assert.equal(gatedLow.kind,'stat-gated');
const conditionedMean=registeredRouteDistribution(data,'X',none,
  {birthSelection:{mode:'atLeast',stats:{tu:6}}});
assert(Math.abs(conditionedMean.stats.tu-6.5)<1e-12);
assert(Math.abs(registeredRouteDistribution(data,'X',none).stats.tu-6)<1e-12);
const raw=newbornRawPairs(data,'X');
assert.deepEqual(raw.tu.map(a=>a[0]),[5,6,7]);
const pairs=conditionBirthPairs(raw,{}, {mode:'exact',stats:{tu:6}});
assert.equal(pairs.kind,'conditioned-birth');
assert(Math.abs(pairs.selectionProbability-1/3)<1e-12);
assert.deepEqual(pairs.pairs.tu,[[6,6,1]]);
assert.equal(conditionBirthPairs(raw,{}, {mode:'exact',stats:{bravery:15}}).kind,
  'birth-incompatible');
assert.equal(conditionBirthPairs(raw,{}, {mode:'invalid',stats:{tu:6}}).kind,'unverified');
assert.equal(conditionBirthPairs(raw,{}, {mode:'exact',stats:{foo:6}}).kind,'unverified');
assert.equal(conditionBirthPairs(raw,{}, {mode:'exact',stats:{tu:6.5}}).kind,'unverified');
assert.deepEqual(conditionBirthPairs(raw,{},null).pairs,raw);
assert.equal(effectiveNewbornStat(0,'psiSkill',10),0);
assert.equal(effectiveNewbornStat(5,'tu',-10),0);
assert.equal(effectiveNewbornStat(0,'health',-10),1);

// Raw and original-initial stats can diverge for a fixed newborn current
// template. Conditioning must preserve the hidden initial roll correlation.
const clone={...birth,currentStatsOverride:{tu:12},
  currentStatsBeforeTraits:{min:{...lo,tu:12},max:{...hi,tu:12}}};
const cloneData={...data,profiles:[clone]};
const cloneObservation=conditionBirthPairs(newbornRawPairs(cloneData,'X'),{},
  {mode:'exact',stats:{tu:12}});
assert.equal(cloneObservation.selectionProbability,1);
assert.deepEqual(cloneObservation.pairs.tu.map(x=>x[1]),[5,6,7]);
const percentage={id:'EARNED',allowedSoldierTypes:['S'],percentGainedStatChange:{tu:100}};
const correlated=registeredRouteDistribution({...cloneData,transformations:[percentage]},'X',
  path(['EARNED']),{birthSelection:{mode:'exact',stats:{tu:12}}});
assert.equal(correlated.kind,'conditional-route-distribution');
assert(Math.abs(correlated.stats.tu-18)<1e-10);

const conditional=candidateRollSummary(data,'X',gated,
  {birthSelection:{mode:'atLeast',stats:{tu:6}}});
assert.equal(conditional.kind,'source-conditional-candidate');
assert(Math.abs(conditional.jointStatEligibilityProbability-1/3)<1e-12);
const ranking=rankCandidateRollSummaries([conditional],{objective:'total'});
assert.equal(ranking.kind,'conditional-candidate-ranking');
assert.equal(ranking.ranked[0].id,gated.id);
assert.equal(candidateRollSummary(data,'X',gated,
  {birthSelection:{mode:'exact',stats:{tu:8}}}).kind,'birth-incompatible');
console.log('PASS conditional birth selection: exact/atLeast, trait-effective display, zero-stat-gate vs birth-impossible, initial/current correlation, candidate ranking');
