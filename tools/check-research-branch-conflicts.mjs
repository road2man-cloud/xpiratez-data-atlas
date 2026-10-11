import assert from "node:assert/strict";
import fs from "node:fs";
import {auditMultiPrerequisiteBranches} from "./research-branch-audit.mjs";
import {auditResearchCycles,publishedResearchEventGrants} from "./research-cycle-audit.mjs";
import {buildChoiceIndex,computeChoiceScenario,choiceStatus} from "../public/captains/choice-simulator-core.js";

const runtime=JSON.parse(fs.readFileSync("public/data/choice-simulator-index.json","utf8"));
const catalog=JSON.parse(fs.readFileSync("public/data/research-branch-conflicts.json","utf8"));
const recomputed=auditMultiPrerequisiteBranches(runtime.topics);
const cycles=auditResearchCycles(runtime.topics,publishedResearchEventGrants());
recomputed.schemaVersion=3;
recomputed.cycles=cycles.groups;
Object.assign(recomputed.meta,{cycleGroups:cycles.groupCount,cycleTopics:cycles.topicCount,
  cycleGroupsWithoutIndexedEscape:cycles.noIndexedEscape});
assert.deepEqual(catalog,recomputed,
  "The published conflicts and cycles must exactly match effective rules and event grants");
assert.equal(catalog.schemaVersion,3);
assert.equal(catalog.meta.cycleGroups,7);
assert.equal(catalog.meta.cycleTopics,95);
assert.equal(catalog.meta.cycleGroupsWithoutIndexedEscape,0);
const cycleIds=new Set(catalog.cycles.flatMap(g=>g.memberIds));
assert.equal(cycleIds.size,95);
const byTopic=new Map(runtime.topics.map(t=>[t.id,t]));
for(const group of catalog.cycles){
  assert(group.memberIds.length>1&&group.witness.length>=3,"Cycle is not a closed directed loop");
  assert.equal(group.witness[0],group.witness.at(-1));
  for(let k=1;k<group.witness.length;k++){
    const source=byTopic.get(group.witness[k-1]);
    assert([...(source?.dependencies||[]),...(source?.requires||[])].includes(group.witness[k]),
      "Cycle proof contains non-prerequisite edge: "+group.witness[k-1]);
  }
  assert(Object.values(group.externalSourceCounts).some(n=>n>0),
    "A cycle without an indexed external grant needs an explicit unknown-path warning");
}
const ninja=catalog.cycles.find(g=>g.memberIds.includes("STR_NINJA_WAR_READY"));
assert(ninja?.memberIds.includes("STR_NINJA_WAR"));
assert(ninja.externalSourceExamples.events.some(e=>e.eventId==="STR_NINJA_WAR_READY"));
assert(ninja.externalSourceExamples.events.some(e=>e.eventId==="STR_GODS_WILL_BE_WATCHING"));
const syntheticCycles=auditResearchCycles([
 {id:"A",dependencies:["B"]},{id:"B",dependencies:["A"]},
 {id:"UNLOCK",unlocks:["A"]},{id:"C",dependencies:["D"]},{id:"D",dependencies:["C"]}
],{B:[{id:"GRANT_B",koName:"B event"}]});
assert.equal(syntheticCycles.groupCount,2);
assert.equal(syntheticCycles.topicCount,4);
assert.equal(syntheticCycles.noIndexedEscape,1);
assert(syntheticCycles.groups.find(g=>g.memberIds.includes("A")).externalSourceCounts.unlocks===1);
assert.equal(catalog.meta.total,4612);
assert.equal(catalog.meta.multipleCount,1777);
assert.equal(catalog.meta.conflictCount,42);
assert.equal(catalog.meta.selfLockCount,4);
assert.equal(catalog.meta.hardConflictCount,0);
assert.equal(catalog.meta.unsafeUnlockCount,0);
assert.equal(catalog.meta.selfDisablingSourceTargets,3);
assert.equal(catalog.meta.selfDisablingSourceEdges,3);
for(const targetId of ["STR_CAPTAIN_GOLD","STR_CAPTAIN_DOUBLEGOLD","STR_SAVVYNESS"]){
  const r=catalog.affected.find(x=>x.id===targetId);
  assert(r?.selfDisablingUnlockSources.includes("STR_CAPTAIN_GOLD_UP"),"Missing self-disabling source: "+targetId);
  assert(!r.unlockSources.includes("STR_CAPTAIN_GOLD_UP"),"Self-disabled source cannot supply persistent unlocks: "+targetId);
}
assert.equal(catalog.meta.nestedConflictTargets,8);
assert.equal(catalog.meta.nestedConflictRoutes,16);
assert.equal(catalog.meta.nestedConflictSources,7);
assert.equal(catalog.meta.affected,catalog.affected.length);
assert(catalog.affected.every(row=>row.unlockSources.length>0),
  "Every known conflicting multi-prerequisite target needs an alternative unlock source");
const names=catalog.affected.map(x=>x.id);
assert.equal(new Set(names).size,names.length);
const byId=new Map(catalog.affected.map(x=>[x.id,x]));
for(const row of catalog.affected){
  for(const issue of row.unlockSourceConflicts){
    assert(row.unlockSources.includes(issue.source),"Nested source is not an unlocker: "+issue.source);
    assert(byId.get(issue.source)?.conflicts.length>0,
      "Nested source does not have a proven nominal direct conflict: "+issue.source);
    assert(issue.pairCount>0);
  }
}
for(const id of ["STR_CAPTAIN_GOLD","STR_CAPTAIN_GREEN","STR_CAPTAIN_RED","STR_CAPTAIN_GRAY",
  "STR_HONOR","STR_CREATIVITY","STR_JUSTICE","STR_SAVVYNESS"])
  assert(byId.get(id)?.unlockSourceConflicts.length>0,"Nested conflict missing for "+id);
for(const id of ["STR_CAPTAIN_PERSONALITY_TEST_DONE","STR_CROWNING_UC",
  "STR_CAPTAIN_DUMBLAZY","STR_CODEX_GR_GD","STR_BOUNTY_HUNTING_CHALLENGE_DONE","STR_GDXCAR_EX_PREQ"]){
  assert(names.includes(id),"Canonical conflicting branch was dropped: "+id);
}
for(const id of ["STR_CAPTAIN_DOUBLEGOLD","STR_CAPTAIN_DOUBLEGREEN","STR_CAPTAIN_DOUBLERED","STR_CAPTAIN_DOUBLEGRAY"])
  assert(catalog.affected.find(row=>row.id===id)?.selfLocks.length>0,"Missed self-disabling nominal prerequisite: "+id);

const index=buildChoiceIndex(runtime.topics,{inline:true,unresolvedByField:runtime.unresolvedByField});
// Exercise EVERY published safe target-to-unlocker edge under the engine's
// assumed-completion model. This proves dependency bypass, NOT that the
// source itself can be earned on a particular captain path.
let verifiedBypassEdges=0;
for(const row of catalog.affected){
  for(const source of row.unlockSources){
    const scenario=computeChoiceScenario(index,[],[source]);
    const candidate=choiceStatus(index,scenario,row.id);
    assert(scenario.completed.has(source),"Safe provider is directly disabled in an empty scenario: "+source);
    assert(candidate.unlockedBy?.includes(source),"Expected engine unlock bypass: "+source+" -> "+row.id);
    assert.equal(candidate.missingDependencies.length,0,"Incoming unlock should bypass all nominal dependencies: "+row.id);
    verifiedBypassEdges++;
  }
}
assert(verifiedBypassEdges>100,"Expected substantial multi-prerequisite bypass regression coverage");
const target=catalog.affected.find(row=>row.id==="STR_CAPTAIN_DUMBLAZY");
assert(target.unlockSources.includes("STR_CAPTAIN_DUMBASS"));
const missing=choiceStatus(index,computeChoiceScenario(index),"STR_CAPTAIN_DUMBLAZY");
assert(missing.missingDependencies.length>0);
const chosen=computeChoiceScenario(index,[],["STR_CAPTAIN_DUMBASS"]);
const bypass=choiceStatus(index,chosen,"STR_CAPTAIN_DUMBLAZY");
assert.equal(bypass.kind,"candidate");
assert.equal(bypass.missingDependencies.length,0);
assert(bypass.unlockedBy.includes("STR_CAPTAIN_DUMBASS"));
const other=choiceStatus(index,chosen,"STR_CAPTAIN_LAZYASS");
assert.equal(other.kind,"blocked");
const abandoned=computeChoiceScenario(index,[],["STR_CAPTAIN_DUMBASS","STR_CAPTAIN_LAZYASS"]);
assert.deepEqual(abandoned.steps,["STR_CAPTAIN_DUMBASS"]);

const synthetic=[
 {id:"A",disables:["B"]},{id:"B",disables:["A"]},
 {id:"ONE",dependencies:["A","B"]},
 {id:"LOCK",unlocks:["ONE","HARD"],disables:["B"]},
 {id:"HARD",dependencies:["A"],requires:["B"]},
 {id:"NO_ROUTE",dependencies:["A","B"]},
 {id:"SELF",unlocks:["ONE"],disables:["ONE"]}
];
const audit=auditMultiPrerequisiteBranches(synthetic);
assert.equal(audit.meta.conflictCount,3);
assert.equal(audit.meta.hardConflictCount,1);
assert.equal(audit.affected.find(x=>x.id==="NO_ROUTE").unlockSources.length,0);
assert(audit.affected.find(x=>x.id==="ONE").unsafeUnlockSources.includes("SELF"),
  "An unlocker that disables the target must not count as a safe route");
assert.equal(audit.affected.find(x=>x.id==="ONE").unlockSources.length,1);
const nestedAudit=auditMultiPrerequisiteBranches([
  {id:"A",disables:["B"]},{id:"B",disables:["A"]},
  {id:"TARGET",dependencies:["A","B"]},
  {id:"UNLOCKER",dependencies:["A","B"],unlocks:["TARGET"]},
  {id:"ROOT",unlocks:["UNLOCKER"]}
]);
assert.equal(nestedAudit.meta.nestedConflictTargets,1);
assert.deepEqual(nestedAudit.affected.find(x=>x.id==="TARGET")?.unlockSourceConflicts,
  [{source:"UNLOCKER",pairCount:1}],"A direct unlocker can itself need a separate unlock bypass");
const selfDisableFixture=[
  {id:"A",disables:["B"]},{id:"B",disables:["A"]},
  {id:"TARGET",dependencies:["A","B"]},
  {id:"SELF_OFF",unlocks:["TARGET"],disables:["SELF_OFF"]},
  {id:"PERSISTENT",unlocks:["TARGET"]}
];
const selfDisableAudit=auditMultiPrerequisiteBranches(selfDisableFixture);
const selfRow=selfDisableAudit.affected.find(x=>x.id==="TARGET");
assert.deepEqual(selfRow.selfDisablingUnlockSources,["SELF_OFF"]);
assert.deepEqual(selfRow.unlockSources,["PERSISTENT"]);
assert.equal(selfDisableAudit.meta.selfDisablingSourceTargets,1);
const selfIndex=buildChoiceIndex(selfDisableFixture,{inline:true});
const selfState=computeChoiceScenario(selfIndex,[],["SELF_OFF"]);
assert(!selfState.completed.has("SELF_OFF")&&selfState.disabled.has("SELF_OFF"));
assert.equal(choiceStatus(selfIndex,selfState,"TARGET").missingDependencies.length,2,
  "A completed source that disables itself cannot bypass target dependencies");
const syntheticGraph=buildChoiceIndex(synthetic,{inline:true});
const unlocked=computeChoiceScenario(syntheticGraph,[],["LOCK"]);
assert.equal(choiceStatus(syntheticGraph,unlocked,"ONE").missingDependencies.length,0);
const hard=choiceStatus(syntheticGraph,unlocked,"HARD");
assert.equal(hard.kind,"path-risk");
assert.deepEqual(hard.missingRequires,["B"]);
assert.equal(hard.nominal.kind,"requires");

const researchUI=fs.readFileSync("public/items/app.js","utf8");
const branchUI=fs.readFileSync("public/captains/choice-simulator.js","utf8");
const researchHTML=fs.readFileSync("public/research/index.html","utf8");
const branchHTML=fs.readFileSync("public/captains/index.html","utf8");
assert(researchUI.includes('data-filter="branch"')&&researchUI.includes("researchBranchConflictMarkup(d)"),
  "Research filter and detail must surface alternative branches");
assert(researchUI.includes('value="cycle"')&&researchUI.includes("researchCycleMarkup(d)"),
  "Research database must expose nominal dependency cycles and their escape mechanisms");
assert(branchUI.includes("cycleReportMarkup()")&&branchUI.includes("choiceCycleGroups"),
  "Branch simulator must disclose the seven nominal research cycles");
assert(researchUI.includes('value="nested"')&&researchUI.includes("unlockSourceConflicts")&&
  researchUI.includes('value="self-source"')&&researchUI.includes("자기 배제하는 해금 출처"),
  "Nested unlock-source warnings must be filterable and explained in research DB");
assert(branchUI.includes("renderMultiPrerequisites()")&&branchUI.includes("research-branch-conflicts.json")&&
  branchUI.includes("직접 배제")&&branchUI.includes("출처 자체도 명목 선행 충돌"),
  "Branch simulator must classify the published collision list");
assert(branchHTML.includes('id="choiceMultiPrerequisite"'));
assert(researchHTML.includes('data-mode="research"'));
console.log("[research-branch-audit] OK "+catalog.meta.total+" rules / "+catalog.meta.multipleCount+
  " multi-prerequisite topics / "+catalog.meta.affected+" directed conflicts / "+
  catalog.meta.selfLockCount+" self-disabling nominal prerequisites / "+catalog.meta.nestedConflictTargets+
  " targets with upstream unlock-source conflict / "+catalog.meta.selfDisablingSourceTargets+
  " targets with self-disabling unlockers / "+catalog.meta.cycleGroups+
  " cyclic nominal-dependency components ("+catalog.meta.cycleTopics+" rules) / "+verifiedBypassEdges+
  " engine bypass edges; tested unsafe unlock, hard requires, nested sources and mirrored UI");
