// Regression for a previously unresolved v.o2 origin. Ordered goals are
// searched from zero research; no grants are added outside the verifier.
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {foundationWorld,applyOriginWitnessStep,replayOriginWitness,WITNESS_STATS}
  from '../public/soldiers/modern/origin-witness.js';

const read=p=>decodeOriginReport(fs.readFileSync(p,'utf8'));
const data=read('public/data/soldiers-modern-index.json');
const catalog=read('public/data/soldier-source-catalog.json');
const report=read('public/data/soldier-origin-candidates.json');
data.sourceItemIds=new Set(catalog.itemIds);
data.originRows=report.records.map(r=>r.sourceProof);
const profileId='manufacture:STR_POLTERGEIST_EMBODIMENT';
const record=report.records.find(r=>r.profileId===profileId);
assert(record?.candidates.length>=5,'The five validated origin paths must not disappear');
assert.equal(record.status,'PROVISIONAL_CONDITIONAL');
assert.equal(record.certifiedMaximum,false);
assert.equal(record.unresolved,null);
assert.deepEqual(record.researchBottlenecks,[]);
const candidate=record.candidates.find(c=>c.id===record.bestCandidateId);
assert(candidate&&candidate.total>=453,'Do not regress the current best conditional path');
assert.equal(candidate.startsWithNoResearch,true);
assert.equal(candidate.certifiedMaximum,false);
assert(candidate.limitations.some(x=>x.includes('미실측')));

// Audit the original known path even when a later agent finds a better one.
const original=(record.rejectedCandidates||[]).find(c=>c.id==='304ec34d86e0d69ff116');
assert(original,'Preserve the first numerical 453-point record as a difficulty counterexample');
assert.equal(original.campaignContext.kind,'inconsistent');
assert.equal(candidate.campaignContext.kind,'compatible');
assert.equal(replayOriginWitness(original.steps,data,{requireCompatibleContext:true}).ok,false,
  'A numerically replayable archived record must not be admitted as a same-campaign route');
assert.equal(original.total,453);
assert.deepEqual(original.transforms,['STR_MMA_TRAINING','STR_PROUD_WARRIOR']);
assert.equal(original.researchCount,433);
assert.equal(original.steps.length,339);
const replay=replayOriginWitness(original.steps,data);
assert(replay.ok,replay.reason);
assert.equal(replay.exact,true);
assert.equal(replay.conditional,true);
assert.equal(replay.certifiedMaximum,false);
assert.deepEqual(replay.stats,original.stats);
assert.equal(replay.total,453);
assert.equal(WITNESS_STATS.length,11);

let world=foundationWorld(),beforeEvent,beforeSource,beforePayout,afterPayout;
assert.equal(world.researched.size,0);
assert.equal(world.soldiers.length,0);
let lastMonth=world.month,eventAt=-1,payoutAt=-1,lateAt=-1,birthAt=-1;
for(const [i,step] of original.steps.entries()){
  if(step.type==='eventResearch'&&step.event==='STR_ENJOYING_THE_DREAM'){
    beforeEvent=structuredClone(world);eventAt=i;
    assert.equal(world.month,20,'The only selected event window is month 20');
    assert.equal(step.assumeOutcome,true,'The event outcome remains an explicit RNG assumption');
  }
  if(step.type==='research'&&step.id==='STR_SECTOID_MEDIC')beforeSource=structuredClone(world);
  if(step.type==='freeResearch'&&step.research==='STR_ACADEMY_MED_KNOWHOW'){
    beforePayout=structuredClone(world);payoutAt=i;
    assert(world.researched.has('STR_INTERROGATION'),'Protected free award needs its actual guard');
    assert.equal(world.pendingFree?.source,'STR_SECTOID_MEDIC');
    assert(world.pendingFree.choices.includes('STR_ACADEMY_MED_KNOWHOW'));
    assert.equal(step.assumeOutcome,true,'One favorable result cannot be presented as guaranteed');
  }
  if(step.type==='advanceMonth'&&step.month===24)lateAt=i;
  if(step.type==='recruit'){
    birthAt=i;
    assert.equal(step.profile,profileId);
    assert.equal(world.soldiers.length,0,'No pre-birth growth or medals');
    assert(world.researched.has('STR_POLTERGEIST_EMBODIMENT'));
    assert(!world.disabled.has('STR_POLTERGEIST_EMBODIMENT'));
  }
  const next=applyOriginWitnessStep(world,step,data);
  assert(next.ok,'Step '+i+': '+next.reason);
  world=next.world;
  assert(world.month>=lastMonth,'The chronology must never turn the clock backwards');
  lastMonth=world.month;
  if(i===payoutAt)afterPayout=structuredClone(world);
}
assert(eventAt>=0&&payoutAt>eventAt&&lateAt>payoutAt&&birthAt>lateAt);
assert(beforeSource&&beforePayout&&afterPayout);

// Counterexample 1: the same event attempted after month 24 is rejected.
const delayed=applyOriginWitnessStep(beforeEvent,{type:'advanceMonth',month:24,assumeContinuity:true},data);
assert(delayed.ok);
const missed=applyOriginWitnessStep(delayed.world,original.steps[eventAt],data);
assert.equal(missed.ok,false);
assert.match(missed.reason,/이벤트 종료/);
assert.equal(missed.world.month,24,'A failed deadline cannot rewind the campaign');

// Counterexample 2: completing the source before the guard does not provide
// a retroactive protected prize. This is deliberately an invalid alternative,
// never a new candidate or an alteration of the published source rules.
const withoutGuard=structuredClone(beforeSource);
withoutGuard.researched.delete('STR_INTERROGATION');
const unprotected=applyOriginWitnessStep(withoutGuard,{type:'research',id:'STR_SECTOID_MEDIC'},data);
assert(unprotected.ok,unprotected.reason);
assert(!unprotected.world.pendingFree?.choices.includes('STR_ACADEMY_MED_KNOWHOW'));
const forbidden=applyOriginWitnessStep(unprotected.world,original.steps[payoutAt],data);
assert.equal(forbidden.ok,false);
assert.match(forbidden.reason,/무료 연구 보상 목록에 없음/);
const reused=applyOriginWitnessStep(afterPayout,original.steps[payoutAt],data);
assert.equal(reused.ok,false,'A one-shot payout cannot be reused later');
assert.match(reused.reason,/일회성 무료 보상 추첨 증거 없음/);
assert.equal(report.summary.certifiedMaxima,0);
// CLI ordering hints cannot become global grants or modify unrelated profiles.
const fileDigest=()=>createHash('sha256').update(fs.readFileSync('public/data/soldier-origin-candidates.json')).digest('hex');
const originalDigest=fileDigest();
for(const [args,message] of [
  [['--research-first=STR_PSI_INITIATION','--check'],'--research-first requires --profile'],
  [['--profile='+profileId,'--research-first=STR_UNAVAILABLE','--check'],'Unknown or unavailable ordered research goal'],
  [['--profile='+profileId,'--research-first=STR_NONEXISTENT_TEST','--check'],'Unknown or unavailable ordered research goal']
]){
  const attempt=spawnSync(process.execPath,['tools/build-soldier-origin-candidates.mjs',...args],
    {encoding:'utf8',timeout:30000,maxBuffer:1000000});
  assert.equal(attempt.status,1,attempt.error?.message||'Invalid CLI request must fail');
  assert(attempt.stderr.includes(message),attempt.stderr);
}
assert.equal(fileDigest(),originalDigest,'Rejected CLI goals must not alter any candidate');
console.log('PASS Poltergeist: repaired compatible route >=453; historical 433-research/453-point record retained but excluded for conflicting difficulty');
console.log('PASS causal counterexamples: expired month-20 event, missing protected guard, reused free-reward token rejected');
console.log('PASS previous search failure was not impossibility; origin acquisition and five candidate histories retained');
