import assert from "node:assert/strict";
import fs from "node:fs";
import {auditMultiPrerequisiteBranches} from "./research-branch-audit.mjs";
import {buildChoiceIndex,computeChoiceScenario,choiceStatus} from "../public/captains/choice-simulator-core.js";

const runtime=JSON.parse(fs.readFileSync("public/data/choice-simulator-index.json","utf8"));
const catalog=JSON.parse(fs.readFileSync("public/data/research-branch-conflicts.json","utf8"));
assert.deepEqual(catalog,auditMultiPrerequisiteBranches(runtime.topics),
  "The published collision catalog must exactly match the effective OXCE research rules");
assert.equal(catalog.meta.total,4612);
assert.equal(catalog.meta.multipleCount,1777);
assert.equal(catalog.meta.conflictCount,42);
assert.equal(catalog.meta.selfLockCount,4);
assert.equal(catalog.meta.hardConflictCount,0);
assert.equal(catalog.meta.unsafeUnlockCount,0);
assert.equal(catalog.meta.affected,catalog.affected.length);
assert(catalog.affected.every(row=>row.unlockSources.length>0),
  "Every known conflicting multi-prerequisite target needs an alternative unlock source");
const names=catalog.affected.map(x=>x.id);
assert.equal(new Set(names).size,names.length);
for(const id of ["STR_CAPTAIN_PERSONALITY_TEST_DONE","STR_CROWNING_UC",
  "STR_CAPTAIN_DUMBLAZY","STR_CODEX_GR_GD","STR_BOUNTY_HUNTING_CHALLENGE_DONE","STR_GDXCAR_EX_PREQ"]){
  assert(names.includes(id),"Canonical conflicting branch was dropped: "+id);
}
for(const id of ["STR_CAPTAIN_DOUBLEGOLD","STR_CAPTAIN_DOUBLEGREEN","STR_CAPTAIN_DOUBLERED","STR_CAPTAIN_DOUBLEGRAY"])
  assert(catalog.affected.find(row=>row.id===id)?.selfLocks.length>0,"Missed self-disabling nominal prerequisite: "+id);

const index=buildChoiceIndex(runtime.topics,{inline:true,unresolvedByField:runtime.unresolvedByField});
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
assert(branchUI.includes("renderMultiPrerequisites()")&&branchUI.includes("research-branch-conflicts.json"),
  "Branch simulator must classify the published collision list");
assert(branchHTML.includes('id="choiceMultiPrerequisite"'));
assert(researchHTML.includes('data-mode="research"'));
console.log("[research-branch-audit] OK "+catalog.meta.total+" rules / "+catalog.meta.multipleCount+
  " multi-prerequisite topics / "+catalog.meta.affected+" directed conflicts / "+
  catalog.meta.selfLockCount+" self-disabling nominal prerequisites; tested unsafe unlock, hard requires and mirrored UI");
