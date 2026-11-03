// Regression for the first previously-unresolved Nekomimi warrior origin.
// In particular, a long research path must not become a direct grant just
// because the goal planner found a favorable ordering.
import assert from "node:assert/strict";
import fs from "node:fs";
import {foundationWorld,applyOriginWitnessStep,replayOriginWitness,WITNESS_STATS}
  from "../public/soldiers/modern/origin-witness.js";
import {researchBranchEvidence} from "../public/soldiers/modern/origin-branch-evidence.js";

const load=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const data=load("public/data/soldiers-modern-index.json");
const sources=load("public/data/soldier-source-catalog.json");
const ledger=load("public/data/soldier-acquisition-progression-20261102.json");
const report=load("public/data/soldier-origin-candidates.json");
data.originRows=ledger.rows;
data.sourceItemIds=new Set(sources.itemIds);
assert.equal(data.meta.mod.version,"v.o2");
assert.deepEqual(data.meta.source.rules,sources.sourceHashes);
assert.equal(report.summary.profiles,72);
assert.equal(report.summary.certifiedMaxima,0);
const profileId="manufacture:STR_CATGIRL_WARRIOR_RECRUITMENT";
const row=report.records.find(x=>x.profileId===profileId);
assert(row&&row.candidates.length,"Origin must have at least one chronological candidate");
assert.equal(row.status,"PROVISIONAL_CONDITIONAL");
assert.equal(row.certifiedMaximum,false);
assert.equal(row.unresolved,null);
const first=row.candidates.find(x=>x.id==="5ccdf897181fa48819d9");
assert(first,"Preserve the earliest 620-point same-soldier route for reproducibility");
assert.equal(first.total,620);
assert.equal(first.steps.length,515);
assert.equal(first.researchCount,627);
assert.equal(first.transforms.length,0);
assert.equal(first.startsWithNoResearch,true);
assert.equal(first.certifiedMaximum,false);
assert.equal(first.stats.psiSkill,0);
assert.equal(WITNESS_STATS.length,11);
assert(first.limitations.some(s=>s.includes("미실측")));
const replay=replayOriginWitness(first.steps,data);
assert(replay.ok,replay.reason);
assert(replay.exact);
assert(replay.conditional);
assert.equal(replay.certifiedMaximum,false);
assert.deepEqual(replay.stats,first.stats);
assert.equal(replay.total,620);
assert.deepEqual(researchBranchEvidence(replay,data.researchRules),first.branchChoices);

let world=foundationWorld(),eventBefore,finalResearchBefore,recruitBefore;
let deadlineStep,finalResearchStep,recruitStep;
let startResearchCount=world.researched.size;
for(const [i,step] of first.steps.entries()){
  if(step.type==="eventResearch"&&step.event==="STR_ENJOYING_THE_DREAM"){
    deadlineStep=step;
    eventBefore=structuredClone(world);
    assert.equal(world.month,20,"The event is conditionally available only in month 20");
    assert.equal(step.assumeOutcome,true);
  }
  if(step.type==="research"&&step.id==="STR_CATGIRL_WARRIOR_RECRUITMENT"){
    finalResearchStep=step;
    finalResearchBefore=structuredClone(world);
    assert(world.researched.has("STR_SPACE_RADIO"));
    assert(world.researched.has("STR_SCHOOLING_2_B"));
    assert(world.researched.has("STR_CATGIRL_RECRUITMENT"));
    assert(world.baseFunctions.has("WAVE2"));
  }
  if(step.type==="recruit"){
    recruitStep=step;
    recruitBefore=structuredClone(world);
    assert.equal(step.profile,profileId);
    assert.equal(world.soldiers.length,0);
    assert(world.researched.has("STR_CATGIRL_WARRIOR_RECRUITMENT"));
    assert(world.items.STR_GLAMOUR>=100);
  }
  const next=applyOriginWitnessStep(world,step,data);
  assert(next.ok, "Step "+i+": "+next.reason);
  world=next.world;
}
assert.equal(startResearchCount,0);
assert.equal(world.soldiers.length,1);
assert.equal(world.soldiers[0].state.soldierType,"STR_SOLDIER_NEKOMIMI_W");
assert.equal(world.month,24);
assert(eventBefore&&deadlineStep&&finalResearchBefore&&finalResearchStep&&recruitBefore&&recruitStep);

const delayed=applyOriginWitnessStep(eventBefore,
  {type:"advanceMonth",month:24,assumeContinuity:true},data);
assert(delayed.ok);
const tooLate=applyOriginWitnessStep(delayed.world,deadlineStep,data);
assert.equal(tooLate.ok,false,"Month-20 event must fail when attempted after month 24");
assert.match(tooLate.reason,/이벤트 종료/);

const withoutBase=structuredClone(finalResearchBefore);
withoutBase.baseFunctions.delete("WAVE2");
const baseViolation=applyOriginWitnessStep(withoutBase,finalResearchStep,data);
assert.equal(baseViolation.ok,false,"Missing required base function must block lab research");

const withoutResearch=structuredClone(finalResearchBefore);
for(const id of data.researchRules.STR_CATGIRL_WARRIOR_RECRUITMENT.dependencies)
  withoutResearch.researched.delete(id);
const premature=applyOriginWitnessStep(withoutResearch,finalResearchStep,data);
assert.equal(premature.ok,false,"Missing all direct requirements must block the research");

const withoutMaterials=structuredClone(recruitBefore);
withoutMaterials.items.STR_GLAMOUR=0;
const withoutGlamour=applyOriginWitnessStep(withoutMaterials,recruitStep,data);
assert.equal(withoutGlamour.ok,false,"Do not fabricate manufacturing material for a new soldier");
assert.match(withoutGlamour.reason,/출생 재료 부족/);
assert(row.candidates.some(c=>c.id===first.id&&c.total===620));
console.log("PASS Nekomimi warrior: zero research -> 515 chronological steps / 627 completed topics -> birth, conditional total 620");
console.log("PASS counterexamples: month-20 deadline, missing lab function, missing research and manufacturing materials all rejected");
console.log("PASS unrelated 71 origins and higher scoring future candidates may remain independently registered");
