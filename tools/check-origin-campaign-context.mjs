// Falsification tests for shared campaign assumptions and newly completed births.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {auditOriginCampaignContext,candidateMatchesCampaign} from '../public/soldiers/modern/origin-campaign-context.js';
import {foundationWorld,applyOriginWitnessStep,replayOriginWitness,MAX_ORIGIN_WITNESS_STEPS}
  from '../public/soldiers/modern/origin-witness.js';
const read=p=>decodeOriginReport(fs.readFileSync(p,'utf8'));
const data=read('public/data/soldiers-modern-index.json');
const catalog=read('public/data/soldier-source-catalog.json');
const report=read('public/data/soldier-origin-candidates.json');
data.originRows=report.records.map(r=>r.sourceProof);
data.sourceItemIds=new Set(catalog.itemIds);
const event=(research,event,script)=>({type:'eventResearch',research,event,script,assumeOutcome:true});
const easy=event('STR_CLOAKING_DEVICE','STR_ENJOYING_THE_DREAM','STR_ENJOYING_THE_DREAM');
const harder=event('STR_WASTELAND_PRIESTESS','STR_BLESSINGS','STR_BLESSINGS');
const impossible=auditOriginCampaignContext([easy,harder],data);
assert.equal(impossible.kind,'inconsistent');
assert.deepEqual(impossible.allowedDifficulties,[]);
assert.equal(impossible.conflicts[0].minimum,1);
assert.equal(impossible.conflicts[0].maximum,0);
assert.equal(auditOriginCampaignContext([easy],data).kind,'compatible');
assert.deepEqual(auditOriginCampaignContext([easy],data).allowedDifficulties,[0]);
assert.deepEqual(auditOriginCampaignContext([harder],data).allowedDifficulties,[1,2,3,4]);
assert.equal(auditOriginCampaignContext([
  {type:'campaignContext',difficulty:1,assumption:true},easy],data).kind,'inconsistent');
assert.equal(auditOriginCampaignContext([{type:'advanceMonth',month:2},
  {type:'campaignContext',difficulty:1,assumption:true}],data).kind,'inconsistent');
assert.equal(auditOriginCampaignContext([event('NONEXISTENT','NONEXISTENT','X')],data).kind,'unknown');
assert.equal(candidateMatchesCampaign({}),false);
assert.equal(candidateMatchesCampaign({campaignContext:impossible}),false);
assert.equal(replayOriginWitness([easy,harder],data,{requireCompatibleContext:true}).ok,false);
assert.equal(replayOriginWitness(Array.from({length:MAX_ORIGIN_WITNESS_STEPS+1},()=>({type:'advanceMonth',month:0})),data).ok,false);
let world=foundationWorld();
const start=applyOriginWitnessStep(world,{type:'campaignContext',difficulty:1,assumption:true},data);
assert(start.ok);assert.equal(world.difficulty,undefined,'Configuration is copy-on-write');
assert.equal(applyOriginWitnessStep(start.world,{type:'campaignContext',difficulty:0,assumption:true},data).ok,false);
assert.equal(applyOriginWitnessStep(world,{type:'campaignContext',difficulty:1},data).ok,false);

let compatible=0,excluded=0,unknown=0;
for(const row of report.records){
  const contexts=[...row.candidates,...(row.rejectedCandidates||[])].map(c=>{
    const audit=auditOriginCampaignContext(c.steps,data);
    assert.deepEqual(c.campaignContext,audit,'Published context must match actual original scripts '+c.id);
    assert.equal(row.candidates.includes(c),audit.kind==='compatible',
      'Counterexamples must be stored outside the active comparison list');
    if(audit.kind==='compatible')compatible++;
    else if(audit.kind==='inconsistent')excluded++;
    else unknown++;
    return audit;
  });
  assert(contexts.some(x=>x.kind==='compatible'),'Every original birth needs a compatible conditional route: '+row.profileId);
  assert(candidateMatchesCampaign(row.candidates.find(c=>c.id===row.bestCandidateId)),
    'An archived difficulty conflict must never be the registered best candidate');
}
assert.equal(report.records.length,72);
assert.equal(report.summary.withCompatibleResearch,72);
assert.equal(report.summary.compatibleWitnesses,compatible);
assert.equal(report.summary.excludedDifficultyWitnesses,excluded);
assert.equal(report.summary.unknownContextWitnesses,unknown);
assert.equal(excluded,127,'Retain the 127 historical counterexamples rather than silently deleting evidence');
assert.equal(unknown,0);
assert.equal(report.summary.certifiedMaxima,0);
for(const id of ['manufacture:STR_ZOMBIE_EMBODIMENT','manufacture:STR_RECRUIT_KILLBOT',
  'manufacture:STR_SDD_SUMMONING','direct:STR_SOLDIER_DOLL','manufacture:STR_XENFORCER_REPAIR',
  'manufacture:STR_THEBAN_ASSAULT_CATGIRL_RECRUITMENT',
  'manufacture:STR_POLTERGEIST_EMBODIMENT','manufacture:STR_TURANIAN_UBER_RECRUITMENT']){
  const row=report.records.find(r=>r.profileId===id);
  const c=row.candidates.find(c=>c.campaignContext.kind==='compatible'&&c.steps[0]?.type==='campaignContext');
  assert(c,'New/repaired source-specific context '+id);
  const result=replayOriginWitness(c.steps,data,{requireCompatibleContext:true});
  assert(result.ok&&result.exact&&result.conditional,result.reason);
  assert.equal(result.certifiedMaximum,false);
  assert.deepEqual(result.stats,c.stats);
  assert.equal(result.world.difficulty,1);
  assert.equal(c.steps.filter(s=>s.type==='recruit').length,1);
  assert.equal(c.steps.find(s=>s.type==='recruit').profile,id);
  assert(c.steps.some(s=>s.type==='externalInputs'),
    'Unsourced materials must remain explicit assumptions, never silently certified');
}
console.log('PASS joint campaign context: all 72 births have replayed compatible conditional routes; '+excluded+
  ' historical difficulty contradictions excluded; immutable difficulty, missing source and >'+MAX_ORIGIN_WITNESS_STEPS+' steps fail closed');
