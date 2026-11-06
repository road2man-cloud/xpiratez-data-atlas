import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EDUCATION_IDS,educationBranchReport,educationCapReference,
  trainingHistory,auditCandidateFutureChoices} from '../public/soldiers/modern/education-endgame.js';
import {excludedTrainingCount,preferredOriginCandidate} from '../public/soldiers/modern/origin-route-tiebreak.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
assert.equal(data.meta.mod.version,'v.o2');
assert.equal(data.transformations.length,83);
const report=body=>Object.fromEntries(educationBranchReport(data,{soldierType:body}).map(x=>[x.id,x]));
const peasant=report('STR_SOLDIER_PEASANT'),damsel=report('STR_SOLDIER_DAMSEL');
const [culture,military,simpleton]=EDUCATION_IDS;
assert(peasant[culture].available&&peasant[military].available&&peasant[simpleton].available);
assert.equal(report('STR_SOLDIER_LAMIA')[military].available,false);
assert.equal(report('STR_SOLDIER_NEKOMIMI')[culture].available,false);

for(const body of [peasant,damsel]){
  const c=body[culture],m=body[military],s=body[simpleton];
  assert.deepEqual({direct:c.capReference.cappedDirect.psiStrength,
    permanent:c.capReference.permanent.psiStrength,
    final:c.capReference.combined.psiStrength},
  {direct:2,permanent:1,final:3});
  assert.equal(c.capReference.combined.firing,1);
  assert.equal(c.capReference.combined.melee,1);
  assert.equal(c.capReference.combined.mana,5);
  assert(c.capReference.requirementMayFail.includes('psiStrength'),
    'Do not claim cultural education is automatically eligible at a raw Psi cap below 45');
  assert.equal(m.capReference.cappedDirect.stamina,0);
  assert.equal(m.capReference.cappedDirect.tu,0);
  assert.equal(m.capReference.combined.psiStrength,-10);
  assert.equal(m.capReference.combined.mana,10);
  assert.equal(s.capReference.combined.tu,-3);
  assert.equal(s.capReference.combined.psiSkill,-7);
  assert.equal(s.capReference.combined.mana,7);
  assert(c.directBlocks.some(x=>x.id===military));
  assert(c.directBlocks.some(x=>x.id==='STR_NEPOTISM'));
  assert(c.chainBlocks.some(x=>x.id==='STR_BRIDES_TO_THE_QUEEN'));
  assert(m.directBlocks.some(x=>x.id===culture));
  assert(m.directBlocks.some(x=>x.id==='STR_BREAD_AND_FISHES_TRAINING'));
  assert.deepEqual(s.directBlocks.map(x=>x.id).sort(),[culture,military].sort());
  assert(!s.directBlocks.some(x=>x.id==='STR_NEPOTISM'));
  assert(!s.chainBlocks.some(x=>x.id==='STR_BRIDES_TO_THE_QUEEN'));
}
assert(peasant[military].directBlocks.some(x=>x.id==='STR_THEBAN_ASSAULT_CLONE'));
assert(peasant[military].directBlocks.some(x=>x.id==='STR_NIGHTSHADE_AUGMENTATION'));
assert(damsel[military].directBlocks.some(x=>x.id==='STR_MAGICIENNE_TRAINING'));
assert(damsel[military].chainBlocks.some(x=>x.id==='STR_PURE_MAIDEN_TRAINING'));
assert(damsel[military].prerequisites.map(x=>x.id).includes('STR_BOOT_CAMP_TRAINING'));
assert(damsel[military].prerequisites.map(x=>x.id).includes('STR_BASIC_FIREARMS_TRAINING'));
assert(peasant[culture].prerequisites.length===0);
assert(peasant[culture].requiredItems.some(([id,n])=>id==='STR_PORN'&&n===25));
assert(peasant[military].cost===10000);
assert(peasant[simpleton].requiredItems.some(([id,n])=>id==='STR_GOVT_CORPSE'&&n===10));
assert(peasant[military].directUnlocks.length===0);
const lamia=report('STR_SOLDIER_LAMIA');
assert.equal(lamia[culture].capReference.combined.psiStrength,1);
assert(lamia[simpleton].directBlocks.some(x=>x.id===culture));
const cat=report('STR_SOLDIER_NEKOMIMI');
assert(cat[military].directBlocks.some(x=>x.id==='STR_HERBALIST_TRAINING'));
assert(cat[military].directBlocks.some(x=>x.id==='STR_SWIFTPAW_TRAINING'));

const history=trainingHistory(data,[culture,'STR_CHORT_SUMMONING']);
assert(!history.has(culture),'reset transformations remove previous education history');
const future=auditCandidateFutureChoices(data,{
  finalSoldierType:'STR_SOLDIER_PEASANT',transforms:[culture]
});
assert.equal(future.kind,'structural-only');
assert(future.direct.some(x=>x.id==='STR_NEPOTISM'));
assert(future.indirect.some(x=>x.id==='STR_BRIDES_TO_THE_QUEEN'));
assert.equal(excludedTrainingCount({futureOptions:future}),future.total);
const source={finalSoldierType:'STR_SOLDIER_PEASANT',transforms:[],
  growth:{kind:'conditional-upper-envelope',total:500,stats:Object.fromEntries([
    'tu','stamina','health','bravery','reactions','firing','throwing','melee',
    'strength','psiStrength','psiSkill','mana'].map(k=>[k,50]))}};
const fewer={...source,id:'more-options',
  futureOptions:auditCandidateFutureChoices(data,source)};
const more={...source,id:'culture-locks',transforms:[culture],
  futureOptions:future};
assert(excludedTrainingCount(fewer)<excludedTrainingCount(more));
assert.equal(preferredOriginCandidate(more,fewer,x=>x.growth.total).id,'more-options');

const peasantRule=data.soldiers.find(x=>x.id==='STR_SOLDIER_PEASANT');
const milRule=data.transformations.find(x=>x.id===military);
const cultureRule=data.transformations.find(x=>x.id===culture);
assert.equal(educationCapReference(cultureRule,peasantRule).cappedDirect.psiStrength,2);
assert.equal(educationCapReference(milRule,peasantRule).cappedDirect.psiStrength,0);

console.log('PASS: 83 source rules, three mutually exclusive education choices, cap-vs-trait, body-specific direct/indirect blocking, reset and same-outcome tie break');
