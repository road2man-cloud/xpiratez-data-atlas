// Full-coverage regression for X-Piratez v.o2 source-specific stat/cap
// chronology, with hard refusal to certify any incomplete final maximum.
import assert from "node:assert/strict";
import fs from "node:fs";
import {buildOriginCapTimeline,originBirthCapSnapshot,
  compactOriginCapTimeline,checkPublishedMaximumCertificate,FINAL_STATS}
  from "../public/soldiers/modern/origin-stat-cap-chronology.js";
import {auditSingleSameBodyTraining,birthOnlyTrainingAudit}
  from "../public/soldiers/modern/origin-same-body-bridge.js";
import {validateOriginProgression} from "../public/soldiers/modern/origin-progress-ui.js";

const data=JSON.parse(fs.readFileSync(
  "public/data/soldiers-modern-index.json","utf8"));
const report=JSON.parse(fs.readFileSync(
  "public/data/soldier-acquisition-progression-20261102.json","utf8"));
const old=JSON.parse(fs.readFileSync(
  "public/data/soldier-research-maxima-20261101.json","utf8"));
const profileById=new Map(data.profiles.map(p=>[p.id,p]));
const soldierById=new Map(data.soldiers.map(s=>[s.id,s]));
const published=new Map(report.rows.map(r=>[r.id,r]));
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const pure=x=>Object.fromEntries(FINAL_STATS.map(k=>[k,n(x?.[k])]));
const unchanged=(x,y)=>assert.deepEqual(x,y);
const checkOneTimeline=(timeline,origin)=>{
  assert.equal(timeline.status,"STRUCTURAL_STAT_CAP_PROJECTION_ONLY");
  assert.equal(timeline.rootProfileId,origin.id);
  assert.equal(timeline.proofComplete,false);
  assert.equal(timeline.trainingOrderVerified,false);
  assert.equal(timeline.finalStats,null);
  assert.equal(timeline.finalSum,null);
  assert.equal(timeline.certifiedMaximum,null);
  assert.equal(timeline.stages[0].action.sourceId,origin.id);
  assert.equal(timeline.stages[0].body,origin.soldierType);
  assert.deepEqual(timeline.stages.map(s=>s.index),
    Array.from({length:timeline.stages.length},(_,i)=>i));
  assert.equal(timeline.stageCount,timeline.stages.length);
  for(const [i,step] of timeline.stages.entries()){
    const soldier=soldierById.get(step.body);
    assert(soldier,"Every stage must keep a real soldier body from this ruleset");
    unchanged(step.rawGrowthCaps,pure(soldier.statCaps));
    unchanged(step.physicalTrainingCaps,pure(soldier.trainingStatCaps));
    unchanged(step.maxCreationStats,pure(soldier.maxStats));
    assert.equal(step.numericStatus,"CONDITIONAL_INTERVAL_ONLY");
    assert.equal(step.finalizedCurrentStats,null);
    assert.equal(step.certifiedMaxStats,null);
    assert(Object.values(step.proof).every(v=>v===false),
      "No sourced, exact or optimality proof was supplied");
    const born=step.currentRawInterval;
    for(const k of FINAL_STATS){
      assert.equal(step.effectiveCapReference[k],
        step.rawGrowthCaps[k]+step.uniquePermanentBonus[k],
        "SoldierBonus changes the EFFECTIVE REFERENCE not raw engine growth cap");
      assert.equal(step.effectiveCurrentInterval.min[k],Math.max(
        k==="health"?1:0,born.min[k]+step.uniquePermanentBonus[k]));
      assert.equal(step.effectiveCurrentInterval.max[k],Math.max(
        k==="health"?1:0,born.max[k]+step.uniquePermanentBonus[k]));
      if(i>0){
        assert.equal(step.deltaFromPreviousStage.rawGrowthCap[k],
          step.rawGrowthCaps[k]-timeline.stages[i-1].rawGrowthCaps[k]);
        assert.equal(step.deltaFromPreviousStage.permanentBonus[k],
          step.uniquePermanentBonus[k]-
          timeline.stages[i-1].uniquePermanentBonus[k]);
      }
    }
    if(i>0&&step.body===timeline.stages[i-1].body){
      unchanged(step.rawGrowthCaps,timeline.stages[i-1].rawGrowthCaps);
      unchanged(step.physicalTrainingCaps,
        timeline.stages[i-1].physicalTrainingCaps);
    }
    assert.deepEqual(step.requiredResearch,
      [...step.requiredResearch].sort(),
      "Research requirements must remain recorded at the correct stage");
  }
  const last=timeline.stages.at(-1);
  unchanged(timeline.terminalCapSnapshot.rawGrowthCaps,last.rawGrowthCaps);
  unchanged(timeline.terminalCapSnapshot.effectiveCapReference,
    last.effectiveCapReference);
  unchanged(timeline.terminalCapSnapshot.currentRawInterval,
    last.currentRawInterval);
  unchanged(timeline.terminalCapSnapshot.effectiveCurrentInterval,
    last.effectiveCurrentInterval);
};

assert.equal(data.meta.mod.version,"v.o2");
assert.equal(FINAL_STATS.length,11);
assert(!FINAL_STATS.includes("mana"));
assert.equal(data.profiles.length,72);
assert.equal(report.rows.length,112);
const counts={births:0,bodyPaths:0,selectedTrainingPaths:0,
  stagesExamined:0,rawCapChangesAtSameBody:0};
for(const profile of data.profiles){
  const row=published.get(profile.id);
  assert(row&&row.kind==="SOURCE_SPAWN");
  const expected=originBirthCapSnapshot(data,profile);
  unchanged(row.birthStatCapSnapshot,expected);
  const timeline=buildOriginCapTimeline(data,profile);
  checkOneTimeline(timeline,profile);
  unchanged(timeline.stages[0].rawGrowthCaps,expected.rawGrowthCaps);
  unchanged(timeline.stages[0].uniquePermanentBonus,
    expected.birthPermanentBonus);
  counts.births++;
  counts.stagesExamined+=timeline.stageCount;
}
for(const row of report.rows.filter(r=>
  r.kind==="TYPE_CHANGE_WITH_UNRESOLVED_PARENT")){
  for(const c of row.candidateSourceAncestry.candidates){
    const origin=profileById.get(c.rootProfileId);
    assert(origin,"No anonymous type/body maximum may serve as origin");
    const body=buildOriginCapTimeline(data,origin,{typeChanges:c.steps});
    checkOneTimeline(body,origin);
    unchanged(compactOriginCapTimeline(body),c.conditionalBodyStatCapTimeline);
    assert.equal(body.terminalType,row.soldierType);
    counts.bodyPaths++;
    counts.stagesExamined+=body.stageCount;
    const training=c.optionalSameBodyTrainingAudit
      .strongestOneTargetStructuralCandidate;
    const selected=training?buildOriginCapTimeline(data,origin,
      {typeChanges:c.steps,sameBodyInsert:training}):null;
    unchanged(selected?compactOriginCapTimeline(selected):null,
      c.conditionalOneTrainingStatCapTimeline);
    if(selected){
      checkOneTimeline(selected,origin);
      assert.equal(selected.terminalType,row.soldierType);
      assert.equal(selected.stageCount,body.stageCount+
        training.prerequisiteAndTargetIds.length);
      counts.selectedTrainingPaths++;
      counts.stagesExamined+=selected.stageCount;
    }
  }
}
assert.deepEqual(report.summary.chronologicalStatCapAudit,{
  birthProfiles:72,rootedConversionCandidates:401,
  oneTrainingScenarioCandidates:401,provisionalStageSnapshots:3559,
  exactObservedFinalStats:0,
  chronologicallyExecutedStatPlans:0,globalMaximaCertified:0
});
assert.deepEqual({births:counts.births,bodyPaths:counts.bodyPaths,
  selectedTrainingPaths:counts.selectedTrainingPaths},
  {births:72,bodyPaths:401,selectedTrainingPaths:401});

const peasant=profileById.get("direct:STR_SOLDIER_PEASANT");
const clone=profileById.get("manufacture:STR_THEBAN_ASSAULT_CLONE");
const half=profileById.get("manufacture:STR_HALF_UBER_GIRL_RECRUITMENT");
const p0=originBirthCapSnapshot(data,peasant);
const c0=originBirthCapSnapshot(data,clone);
const h0=originBirthCapSnapshot(data,half);
assert.equal(p0.rawGrowthCaps.health,55);
assert.equal(c0.rawGrowthCaps.health,55);
assert.equal(h0.rawGrowthCaps.health,55);
assert.equal(p0.effectiveCapReference.health,55);
assert.equal(c0.effectiveCapReference.health,65);
assert.equal(h0.effectiveCapReference.health,65);
assert.notDeepEqual(p0.rawCurrentInterval,c0.rawCurrentInterval,
  "A clone's actual birth range must not be replaced by ordinary Peasant roll");
assert.notDeepEqual(p0.rawCurrentInterval,h0.rawCurrentInterval,
  "Manufactured special recruit remains source-specific");

const battle=birthOnlyTrainingAudit(data,peasant,{includeAll:true})
  .targetWitnesses.find(w=>w.targetId==="STR_BATTLE_FORM_AUGMENTATION");
const changed=buildOriginCapTimeline(data,peasant,
  {sameBodyInsert:battle});
assert.equal(changed.stageCount,2);
assert.equal(changed.stages[0].rawGrowthCaps.health,55);
assert.equal(changed.stages[1].rawGrowthCaps.health,55);
assert.equal(changed.stages[1].uniquePermanentBonus.health,15);
assert.equal(changed.stages[1].effectiveCapReference.health,70);
assert.equal(changed.stages[1].effectiveCurrentInterval.max.health,
  changed.stages[1].currentRawInterval.max.health+15);
assert.equal(changed.stages[1].proof.naturalGrowth,false);

const military=birthOnlyTrainingAudit(data,peasant,{includeAll:true})
  .targetWitnesses.find(w=>w.targetId==="STR_MILITARY_DRILL_TRAINING");
assert.deepEqual(military.prerequisiteAndTargetIds,[
  "STR_BASIC_FIREARMS_TRAINING","STR_BOOT_CAMP_TRAINING",
  "STR_MILITARY_DRILL_TRAINING"
]);
const drill=buildOriginCapTimeline(data,peasant,
  {sameBodyInsert:military,previewGrowth:false});
assert.deepEqual(drill.stages.map(s=>s.action.id||s.action.sourceId),[
  peasant.id,...military.prerequisiteAndTargetIds
]);
assert.equal(drill.stages.at(-1).rawGrowthCaps.tu,80);
assert.equal(drill.stages.at(-1).currentRawInterval.max.tu,60);
assert.equal(drill.stages.at(-1).effectiveCurrentInterval.max.tu,60);
assert.equal(drill.stages.at(-1).numericStatus,"CONDITIONAL_INTERVAL_ONLY");
assert.equal(drill.finalStats,null);

const spectreRow=published.get("transform:STR_SPECTRE_SUMMONING:from:STR_SOLDIER_PEASANT");
const spectreCandidate=spectreRow.candidateSourceAncestry.candidates.find(c=>
  c.rootProfileId===peasant.id);
const beforeReset=buildOriginCapTimeline(data,peasant,{
  typeChanges:spectreCandidate.steps,
  sameBodyInsert:{targetId:"STR_BATTLE_FORM_AUGMENTATION",
    beforeBodyChangeIndex:0,
    prerequisiteAndTargetIds:["STR_BATTLE_FORM_AUGMENTATION"]}});
assert.equal(beforeReset.stages[1].uniquePermanentBonus.health,15);
assert.equal(beforeReset.stages.at(-1).uniquePermanentBonus.health,0);
assert(beforeReset.stages.at(-1).history.includes("STR_SPECTRE_SUMMONING"));
assert(!beforeReset.stages.at(-1).history.includes("STR_BATTLE_FORM_AUGMENTATION"));
assert.equal(beforeReset.requiresVitalStatusProof,true);
assert.notDeepEqual(beforeReset.stages[0].rawGrowthCaps,
  beforeReset.stages.at(-1).rawGrowthCaps,
  "Body change must switch actual RuleSoldier statCaps");
for(const k of FINAL_STATS){
  assert.equal(beforeReset.stages.at(-1).rawGrowthCaps[k],
    soldierById.get("STR_SOLDIER_SPECTRE").statCaps[k]);
}

const chortRow=published.get("transform:STR_CHORT_SUMMONING:from:STR_SOLDIER_PEASANT");
const chortCandidate=chortRow.candidateSourceAncestry.candidates.find(c=>
  c.rootProfileId===peasant.id);
const chortBest=auditSingleSameBodyTraining(data,peasant,chortCandidate,
  {includeAll:true}).targetWitnesses.find(w=>
    w.targetId==="STR_BRIDES_TO_THE_QUEEN");
const chort=buildOriginCapTimeline(data,peasant,{
  typeChanges:chortCandidate.steps,sameBodyInsert:chortBest});
assert.deepEqual(chort.stages.map(s=>s.action.id||s.action.sourceId),[
  peasant.id,"STR_CHORT_SUMMONING","STR_NEPOTISM",
  "STR_PERSONAL_ATTENTION","STR_BRIDES_TO_THE_QUEEN"]);
assert.deepEqual(chort.requiredResearch.slice().sort(),[
  ...chort.requiredResearch].sort());
assert(chort.stages.at(-1).requiredResearch.includes("STR_BRIDES_TO_THE_QUEEN"));
assert.equal(chort.finalSum,null);
assert.equal(chort.certifiedMaximum,null);

const fabricated={
  status:"EXECUTABLE_MAXIMUM_CERTIFIED",ruleset:"v.o2",
  sourceHashes:data.meta.source.rules,
  researchChronologyVerified:true,
  medalAndMaterialProven:true,combatGrowthProven:true,
  realSaveVerified:true,globalOptimalityVerified:true,
  maximum:999999,finalStats:Object.fromEntries(FINAL_STATS.map(k=>[k,99999]))
};
assert.equal(checkPublishedMaximumCertificate(fabricated,data).kind,"unverified",
  "Self-attested booleans or an arbitrary score are not game replay or a global optimum proof");
assert.equal(checkPublishedMaximumCertificate(null,data).kind,"unverified");
assert.deepEqual(validateOriginProgression(report,data,old),
  {rows:112,births:72,transformBranches:40,verified:0});
console.log("PASS ALL origins: "+counts.births+" independent births / "+
  counts.bodyPaths+" source-rooted type-change chains / "+
  counts.selectedTrainingPaths+" single-training cap scenarios, "+
  counts.stagesExamined+" non-certifying stage projections");
console.log("PASS source-specific current stats vs raw statCaps vs physical caps vs "+
  "unique SoldierBonus reference, sequence-sensitive percent/flat changes, "+
  "reset, initial traits, 11 stats, zero forged maxima");
