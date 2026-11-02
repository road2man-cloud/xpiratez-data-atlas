// Exhaustive necessity audit for 72 real 2.1 births and all 401 source-rooted
// body-change chains + one extra same-body training. None are certified maxima.
import assert from "node:assert/strict";
import fs from "node:fs";
import {auditOriginResearchChronology,compactOriginResearchAudit,
  researchAccessIndex} from "../public/soldiers/modern/origin-research-chronology.js";
import {buildOriginCapTimeline}
  from "../public/soldiers/modern/origin-stat-cap-chronology.js";

const data=JSON.parse(fs.readFileSync(
  "public/data/soldiers-modern-index.json","utf8"));
const published=JSON.parse(fs.readFileSync(
  "public/data/soldier-acquisition-progression-20261102.json","utf8"));
const map=new Map(data.profiles.map(p=>[p.id,p]));
const seen=new Set();
const totals={births:0,bodyChains:0,trainingChains:0,
  alternatives:0,eventVariants:0,conditionalResearchGates:0,
  directContradicted:0,exactResearchReplays:0,certifiedFinals:0};
function inspect(a,profile,expected){
  assert.equal(a.rootProfileId,profile.id);
  assert.equal(a.scope,"DIRECT_DISABLE_NECESSITY_WITH_OPTIMISTIC_JIT_GRANTS_ONLY");
  assert.equal(a.actualResearchCompletionsReplayed,0);
  assert.equal(a.actualTrainingCompletionsReplayed,0);
  assert.equal(a.researchOrderExecuted,false);
  assert.equal(a.actualSaveVerified,false);
  assert.equal(a.globalMaximumProven,false);
  assert.equal(a.finalStats,null);
  assert.equal(a.finalSum,null);
  assert.equal(a.certifiedMaximum,null);
  assert.equal(a.researchAccessGates.length,
    a.requiredResearchAcrossAlternatives.length);
  assert.deepEqual(compactOriginResearchAudit(a),expected);
  totals.alternatives+=a.variants.length;
  totals.eventVariants+=a.variants.filter(v=>v.eventScriptId!==null).length;
  totals.conditionalResearchGates+=a.variants.reduce(
    (s,v)=>s+v.requiredResearch.length,0);
  if(a.allAlternativesContradicted)totals.directContradicted++;
  for(const v of a.variants){
    assert.equal(v.stepCount,a.stageCount);
    assert.equal(v.researchAcquisitionProven,false);
    assert.equal(v.conditionalOnly,true);
    assert.equal(v.finalStats,null);
    assert.equal(v.finalSum,null);
    assert.equal(v.certifiedMaximum,null);
    assert.equal(v.stages[0].actionKind,"sourceBirth");
    assert.equal(v.stages[0].actionId,profile.id);
    assert(v.stages.every(s=>!s.actuallyResearchedAtThisStage&&
      !s.allGrantAndResourceGatesProven));
    assert.deepEqual(v.requiredResearch,
      [...new Set(v.stages.flatMap(s=>s.requiredResearch))].sort());
    if(profile.sourceType==="event"){
      assert(v.eventScriptId);
      const script=profile.acquisitionEventScripts.find(x=>x.script===v.eventScriptId);
      assert(script,"Only original source-script alternatives may appear");
      assert.deepEqual(v.eventResearchPositive,[...new Set(script.researchPositive||[])].sort());
      assert.deepEqual(v.eventResearchNegative,[...new Set(script.researchNegative||[])].sort());
      assert.deepEqual(v.stages[0].eventScriptRequiredResearch,
        [...new Set(script.researchPositive||[])].sort());
    }else{
      assert.equal(v.eventScriptId,null);
      assert.equal(v.stages[0].eventScriptRequiredResearch.length,0);
    }
    for(const gate of a.researchAccessGates){
      assert.equal(gate.grantProven,false);
      assert.equal(gate.sourceChronologyProven,false);
      if(gate.ruleIndexed&&gate.zeroCost){
        assert.equal(gate.nonLabGrantMayBeNecessary,true);
        assert.equal(gate.labDirectAvailableWithoutProof,false);
      }
    }
  }
}
const idx=researchAccessIndex(data);
assert.equal(idx.count,Object.keys(data.researchRules).length);
assert.equal(idx.count,4654);
assert.equal(idx.reenables.length,0);
assert.equal(researchAccessIndex(data),idx,"Indexed research grants are reused across origins");
for(const row of published.rows.filter(x=>x.kind==="SOURCE_SPAWN")){
  const profile=map.get(row.id);assert(profile);
  inspect(auditOriginResearchChronology(data,profile),profile,
    row.birthResearchNecessityAudit);
  totals.births++;
}
for(const edge of published.rows.filter(x=>x.kind!=="SOURCE_SPAWN")){
  for(const candidate of edge.candidateSourceAncestry.candidates){
    const profile=map.get(candidate.rootProfileId);assert(profile);
    const signature=profile.id+">"+candidate.steps.map(x=>x.transformationId).join(">");
    assert(!seen.has(signature));seen.add(signature);
    inspect(auditOriginResearchChronology(data,profile,
      {typeChanges:candidate.steps}),profile,
      candidate.conditionalBodyResearchAudit);
    totals.bodyChains++;
    const training=candidate.optionalSameBodyTrainingAudit.strongestOneTargetStructuralCandidate;
    assert(training);
    inspect(auditOriginResearchChronology(data,profile,
      {typeChanges:candidate.steps,sameBodyInsert:training}),profile,
      candidate.conditionalOneTrainingResearchAudit);
    totals.trainingChains++;
  }
}
assert.deepEqual(totals,{
  births:72,bodyChains:401,trainingChains:401,
  alternatives:887,eventVariants:38,conditionalResearchGates:3731,
  directContradicted:0,exactResearchReplays:0,certifiedFinals:0
});
assert.deepEqual(published.summary.researchOrderNecessityAudit,{
  birthProfiles:72,rootedConversionCandidates:401,
  singleTrainingScenarios:401,researchScheduleAlternativesAudited:887,
  actualEventScriptVariantsAudited:38,
  conditionalMandatoryGrantGates:3731,directDisableContradictedScenarios:0,
  researchedInActualCampaign:0,fullyExecutedResearchPaths:0
});
const peasant=map.get("direct:STR_SOLDIER_PEASANT");
const fighter=map.get("event:STR_MRSHAN_FIGHTER_EVENT");
const hound=map.get("event:STR_CODEX_BONUS_G5");
assert(peasant&&fighter&&hound);
const peasantAudit=auditOriginResearchChronology(data,peasant);
assert.deepEqual(peasantAudit.requiredResearchAcrossAlternatives,
  ["STR_RECRUIT_PEASANTS"]);
assert(peasantAudit.variants.every(v=>
  v.status==="NO_DIRECT_DISABLE_CONTRADICTION_DETECTED"));
const fighterAudit=auditOriginResearchChronology(data,fighter);
assert.equal(fighterAudit.variants.length,3);
assert.deepEqual(fighterAudit.variants[0].eventResearchPositive,[
  "STR_CHRONICLES_001","STR_CONTACT_NEKOMIMI",
  "STR_CONTACT_SMUGGLERS","STR_HYPERWAVES","STR_NEKOMIMI"]);
assert.deepEqual(fighterAudit.variants[1].eventResearchPositive,
  ["STR_FIREFOX_TRANSPORT"]);
assert.deepEqual(fighterAudit.variants[2].eventResearchPositive,
  ["STR_FIREFOX_TRANSPORT"]);
assert(!fighterAudit.variants[1].requiredResearch.includes("STR_CONTACT_SMUGGLERS"),
  "Independent event script alternatives must NOT be AND-merged");
const houndAudit=auditOriginResearchChronology(data,hound);
assert(houndAudit.variants.some(v=>
  v.eventResearchNegative.includes("STR_CAPTAIN_SAINT")));
assert(houndAudit.variants.some(v=>
  v.eventResearchPositive.includes("STR_GODS_E5")));
const chort=published.rows.find(x=>
  x.id==="transform:STR_CHORT_SUMMONING:from:STR_SOLDIER_PEASANT");
const caseCandidate=chort.candidateSourceAncestry.candidates.find(x=>
  x.rootProfileId===peasant.id);
const w=caseCandidate.optionalSameBodyTrainingAudit.strongestOneTargetStructuralCandidate;
const sample=auditOriginResearchChronology(data,peasant,{
  typeChanges:caseCandidate.steps,sameBodyInsert:w});
assert(sample.researchAccessGates.some(g=>
  g.id==="STR_CHORT_SUMMONING"&&g.zeroCost&&g.needItem&&
  !g.grantProven&&!g.labDirectAvailableWithoutProof));
assert(sample.variants[0].stages.some(s=>
  s.actionId==="STR_CHORT_SUMMONING"&&
  s.optimisticallyActivated.includes("STR_CHORT_SUMMONING")));
assert.equal(sample.researchOrderExecuted,false);

// Engine-original red/green Codex disablers: immutable, un-reenabled research
// flags DO refute any FIXED same-body chronological chain requiring both.
const fake=(id,research)=>({
  id,koName:id,requires:[research],allowedSoldierTypes:[peasant.soldierType],
  allowsLiveSoldiers:true,allowsWoundedSoldiers:false,allowsDeadSoldiers:false,
  requiredPreviousTransformations:[],forbiddenPreviousTransformations:[],
  cost:0,requiredItems:{},requiredCommendations:{},requiredMinStats:{}
});
const red=fake("TEST_RED_TRAINING","STR_CODEX_RED");
const green=fake("TEST_GREEN_TRAINING","STR_CODEX_GREEN");
const synthetic={...data,transformations:[...data.transformations,red,green]};
function syntheticSequence(order){
  return auditOriginResearchChronology(synthetic,peasant,{
    sameBodyInsert:{beforeBodyChangeIndex:0,
      targetId:order.at(-1),prerequisiteAndTargetIds:order}});
}
for(const permutation of [[red.id,green.id],[green.id,red.id]]){
  const result=syntheticSequence(permutation);
  assert.equal(result.status,"ALL_EVENT_ALTERNATIVES_DIRECTLY_CONTRADICTED");
  assert(result.allAlternativesContradicted);
  assert.equal(result.variants[0].status,"DIRECT_DISABLING_CONTRADICTION");
  assert(result.variants[0].directDisableContradictions.some(x=>
    x.kind==="ALREADY_DISABLED_BY_REQUIRED_RESEARCH"&&
    x.stageIndex===2&&x.disablingStageIndex===1));
  assert.equal(result.researchOrderExecuted,false);
  assert.equal(result.certifiedMaximum,null);
}
// A one-way disabler is ORDER-SENSITIVE: grant the earlier victim to perform
// its training first; later research can remove that flag after use.
const fakeOneWayRules={...data.researchRules,
  TEST_A:{cost:5,disables:["TEST_B"],reenables:[]},
  TEST_B:{cost:5,disables:[],reenables:[]}};
const x=fake("TEST_TRAIN_A","TEST_A");
const y=fake("TEST_TRAIN_B","TEST_B");
const oneWay={...data,researchRules:fakeOneWayRules,
  transformations:[...data.transformations,x,y]};
function auditOneWay(order){
  return auditOriginResearchChronology(oneWay,peasant,{
    sameBodyInsert:{targetId:order.at(-1),beforeBodyChangeIndex:0,
      prerequisiteAndTargetIds:order}});
}
assert.equal(auditOneWay([y.id,x.id]).status,
  "NO_DIRECT_DISABLE_CONTRADICTION_DETECTED");
assert.equal(auditOneWay([x.id,y.id]).status,
  "ALL_EVENT_ALTERNATIVES_DIRECTLY_CONTRADICTED");
// When any explicit reenable exists, an unsimulated sequence can NEVER be
// promoted to a permanent impossibility certificate.
const withReenable={...synthetic,researchRules:{...data.researchRules,
  TEST_REENABLE:{cost:5,reenables:["STR_CODEX_GREEN"]}}};
const restore=auditOriginResearchChronology(withReenable,peasant,{
  sameBodyInsert:{targetId:green.id,beforeBodyChangeIndex:0,
    prerequisiteAndTargetIds:[red.id,green.id]}});
assert.equal(restore.status,"RESEARCH_ORDER_INCONCLUSIVE");
assert.equal(restore.variants[0].status,"INCONCLUSIVE_REENABLES_NOT_REPLAYED");
assert.equal(restore.allAlternativesContradicted,false);

// Event-source branches: an impossible script cannot erase a *different*
// alternative script that remains viable in the direct-disable relaxation.
const eventProfile={...fighter,acquisitionEventScripts:[
  {...fighter.acquisitionEventScripts[0],script:"TEST_MUTUALLY_EXCLUSIVE",
    researchPositive:["STR_CODEX_RED","STR_CODEX_GREEN"],
    researchNegative:[]},
  {...fighter.acquisitionEventScripts[1],script:"TEST_CHOICE_OTHER",
    researchPositive:["STR_CODEX_RED"],researchNegative:[]}
]};
const altData={...data,profiles:data.profiles.map(x=>
  x.id===fighter.id?eventProfile:x)};
const alt=auditOriginResearchChronology(altData,eventProfile);
assert.equal(alt.variants.length,2);
assert.equal(alt.variants[0].status,"DIRECT_DISABLING_CONTRADICTION");
assert.equal(alt.variants[1].status,"NO_DIRECT_DISABLE_CONTRADICTION_DETECTED");
assert.equal(alt.allAlternativesContradicted,false);
assert.equal(alt.status,"NO_DIRECT_DISABLE_CONTRADICTION_DETECTED");
const negProfile={...fighter,acquisitionEventScripts:[
  {...fighter.acquisitionEventScripts[0],script:"TEST_POSITIVE_NEGATIVE",
    researchPositive:["STR_CODEX_RED"],researchNegative:["STR_CODEX_RED"]}
]};
const negData={...data,profiles:data.profiles.map(x=>
  x.id===fighter.id?negProfile:x)};
const neg=auditOriginResearchChronology(negData,negProfile);
assert.equal(neg.variants[0].directDisableContradictions[0].kind,
  "EVENT_POSITIVE_AND_NEGATIVE_SAME_RESEARCH");
assert.equal(neg.allAlternativesContradicted,true);
const tampered=structuredClone(published);
tampered.rows.find(r=>r.id===fighter.id)
  .birthResearchNecessityAudit.variants.pop();
assert.notDeepEqual(tampered.rows.find(r=>r.id===fighter.id)
  .birthResearchNecessityAudit,
  compactOriginResearchAudit(fighterAudit));
assert.throws(()=>compactOriginResearchAudit({
  ...fighterAudit,finalStats:{health:999}
}),/certified maximum/);
console.log("PASS research-order necessity audit: "+totals.births+" independent births, "+
  totals.bodyChains+" body chains, "+totals.trainingChains+
  " single-training insertions, "+totals.alternatives+
  " relaxed research schedules ("+totals.eventVariants+
  " source event scripts), "+totals.conditionalResearchGates+
  " unproven mandatory grants");
console.log("PASS bidirectional and one-way excludes, event alternative OR vs AND, "+
  "positive/negative event trigger collision, reenable uncertainty, "+
  "zero-cost source ambiguity, no actual research grants or forged maximum");
