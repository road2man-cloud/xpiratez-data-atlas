// Independent, focused assault-clone coverage audit.
// A chronological rules replay is NOT a proof that a campaign can supply
// its research, money, facilities, month schedule and random event outcomes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {initialState,eligibleTransformation,applyTransformation} from '../public/soldiers/modern/eligibility.js';
import {replayOriginWitness} from '../public/soldiers/modern/origin-witness.js';

const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const data=read('public/data/soldiers-modern-index.json');
const registry=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json'));
const catalogue=read('public/data/soldier-source-catalog.json');
data.sourceItemIds=new Set(catalogue.itemIds);
data.originRows=registry.records.map(x=>x.sourceProof);
const id='manufacture:STR_THEBAN_ASSAULT_CLONE';
const profile=data.profiles.find(p=>p.id===id);
const record=registry.records.find(p=>p.profileId===id);
assert(profile&&record&&registry.records.length===72,'Source profile and all 72 origins must remain indexed');
assert.equal(record.name,'돌격 클론');
assert.equal(record.soldierType,'STR_SOLDIER_PEASANT');
assert.equal(profile.traitCounts.STR_THEBAN_ASSAULT_CLONE,1);

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cache=new Map();
let conditionallyReplayed=0,realWorldCertified=0,deepOrdinary=0;
const depths={},assumptions={};
for(const c of record.candidates){
  const result=replayOriginWitness(c.steps,data,{birthCache:cache,requireCompatibleContext:true});
  assert(result.ok&&result.exact&&result.campaignCompatible===true,
    'Chronological conditional witness did not independently replay: '+c.id+' '+result.reason);
  assert.deepEqual(result.raw,c.raw);
  assert.deepEqual(result.stats,c.stats);
  assert.equal(result.total,c.total);
  assert.equal(c.resultHash,digest({steps:c.steps,raw:c.raw,stats:c.stats,total:c.total,branches:c.branchChoices}),
    'Published result hash differs from replayed path');
  assert.equal(c.certifiedMaximum,false,'Conditional paths cannot be labeled globally certified');
  assert.equal(c.startsWithNoResearch,true);
  assert.equal(c.researchSequenceComplete,true);
  assert.equal(result.conditional,true,'Unexpected fully observed non-conditional campaign');
  for(const step of c.assumptions||[])assumptions[step.type]=(assumptions[step.type]||0)+1;
  depths[c.transforms.length]=(depths[c.transforms.length]||0)+1;
  if(c.transforms.length>=4&&c.finalSoldierType!=='STR_SOLDIER_CHORT')deepOrdinary++;
  conditionallyReplayed++;
  if(!result.conditional)realWorldCertified++;
}
// Structural upper bound: do not claim these are research-/resource-complete
// campaigns. This shows exactly how many first two training combinations the
// old 12-wide, 8-beam search did not retain.
const start=initialState(data,profile,{band:'min'});
const available=(state,used)=>data.transformations.filter(t=>
  !used.has(t.id)&&!t.createsClone&&!t.producedItem&&
  eligibleTransformation(t,state,data,{mode:'future'}).kind!=='blocked');
const initial=available(start,new Set());
const pairs=new Set();
for(const first of initial){
  const next=applyTransformation(first,start,data,{mode:'future'});
  assert.notEqual(next.verdict.kind,'blocked');
  for(const second of available(next.state,new Set([first.id])))
    pairs.add(first.id+'>'+second.id);
}
const witnessedPairs=new Set(record.candidates.filter(c=>c.transforms.length===2)
  .map(c=>c.transforms.join('>')));
const twoStageGaps=[...pairs].filter(x=>!witnessedPairs.has(x));
assert.equal(initial.length,15);
assert.equal(pairs.size,187);
assert(record.candidates.length>=116,'Regression: verified five-to-seven-step clone paths disappeared');
assert(record.candidates.some(c=>c.transforms.length>=7&&c.finalSoldierType!=='STR_SOLDIER_CHORT'),
  'At least one independent, campaign-consistent seven-step non-Chort clone witness must replay');
assert(deepOrdinary>=4,'Regression: newly recovered ordinary four-stage paths disappeared');
assert(twoStageGaps.length>0&&record.searchScope.globalOptimumProven===false,
  'Never silently mark incomplete structural or research search globally complete');
assert.equal(realWorldCertified,0);
const summary={
  kind:'xpz-assault-clone-search-coverage-v1',
  sourceVersion:registry.sourceVersion,origin:id,
  indexedResearchRules:Object.keys(data.researchRules).length,
  indexedBonusRules:data.bonuses.length,
  registeredOriginCandidates:record.candidates.length,
  exactConditionalChronologyReplays:conditionallyReplayed,
  verifiedRealCampaignCompletions:realWorldCertified,
  certifiedGlobalMaximumRoutes:0,
  candidateTransformDepths:depths,
  ordinaryPathsAtDepthFourOrMore:deepOrdinary,
  firstStepStructurallyConditional:initial.length,
  twoStepStructurallyConditional:pairs.size,
  twoStepStandaloneCandidatesWitnessed:witnessedPairs.size,
  unrepresentedTwoStepStructuralPairs:twoStageGaps.length,
  missingExamples:twoStageGaps.slice(0,12),
  assumptionTypes:assumptions,
  searchScope:record.searchScope,
  warning:'Structural possibilities omit future research, resources, rank, health, medals and RNG. Valid replayed paths are still conditional; not an exhaustive path count or an OXCE save-game completion certificate.'
};
if(process.argv.includes('--check-published')){
  assert.deepEqual(read('public/data/soldier-assault-clone-coverage.json'),summary,
    'Published assault-clone coverage is stale relative to source witnesses');
}
console.log(JSON.stringify(summary,null,2));
