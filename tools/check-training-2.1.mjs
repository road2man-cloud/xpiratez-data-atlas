import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateTrainingSource, classifyTraining, replayTrainingPlan,
  appendTrainingStep, futureOptions
} from "../public/trainings/training-2.1-core.js";
import {initialState} from "../public/soldiers/modern/eligibility.js";
import {importModernSave,modernSoldierProof} from "../public/soldiers/modern/save-adapter.js";

const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const audit=validateTrainingSource(data);
assert.equal(audit.transformations,83);
assert.equal(audit.profiles,72);
assert.equal(audit.soldiers,29);
assert.equal(audit.hash,data.meta.source.rules.find(x=>x.file==="Piratez_Transformations.rul").sha256);
for(const bad of [
  {...data,meta:{...data.meta,mod:{...data.meta.mod,version:"v.o1.1.1"}}},
  {...data,transformations:data.transformations.slice(1)},
  {...data,profiles:[...data.profiles,data.profiles[0]]},
  {...data,transformations:[...data.transformations.slice(0,82),data.transformations[0]]},
  {...data,meta:{...data.meta,source:{...data.meta.source,rules:[]}}}
])assert.throws(()=>validateTrainingSource(bad));

const peasant=data.profiles.find(x=>x.id==="direct:STR_SOLDIER_PEASANT");
const clone=data.profiles.find(x=>x.id==="manufacture:STR_THEBAN_ASSAULT_CLONE");
assert(peasant&&clone&&peasant.soldierType===clone.soldierType,
  "Same-body acquisition profiles must remain distinct");
const peasantState=initialState(data,peasant,{band:"avg"});
const cloneState=initialState(data,clone,{band:"avg"});
assert.notDeepEqual([...peasantState.history],[...cloneState.history]);
assert.notDeepEqual([...peasantState.bonusIds],[...cloneState.bonusIds]);
assert.notEqual(peasantState.rank,cloneState.rank);

const byId=new Map(data.transformations.map(t=>[t.id,t]));
const baseGun=byId.get("STR_BASIC_FIREARMS_TRAINING");
assert(baseGun);
const before=classifyTraining(baseGun,peasantState,data,futureOptions());
assert.equal(before.kind,"conditional");
assert(before.reasons.some(x=>x.includes("미증명")||x.includes("필요")));
const once=appendTrainingStep(data,peasantState,[],baseGun.id,futureOptions());
assert.equal(once.kind,"added");
assert(once.plan.state.history.has(baseGun.id));
assert.equal(once.plan.receipts.length,1);
assert.equal(once.plan.receipts[0].conditional,true);
const twice=appendTrainingStep(data,peasantState,once.steps,baseGun.id,futureOptions());
assert.equal(twice.kind,"rejected","Repeat training may never silently stack permanent bonuses");
const reverse=replayTrainingPlan(data,peasantState,[],futureOptions());
assert.equal(reverse.kind,"conditional-plan");
assert.equal(reverse.receipts.length,0);

const internal=byId.get("STR_CAREER_SOLDIER");
assert(internal&&internal.requires.includes("STR_UNAVAILABLE"));
assert.equal(classifyTraining(internal,peasantState,data,futureOptions()).kind,"excluded");
assert.equal(appendTrainingStep(data,peasantState,[],internal.id,futureOptions()).kind,"rejected");
const battleForm=byId.get("STR_BATTLE_FORM_AUGMENTATION");
assert(battleForm);
const directClone=classifyTraining(battleForm,cloneState,data,futureOptions());
const directPeasant=classifyTraining(battleForm,peasantState,data,futureOptions());
assert(directClone.kind==="excluded"||directClone.kind==="not-now");
assert.notDeepEqual({history:[...cloneState.history],kind:directClone.kind},
  {history:[...peasantState.history],kind:directPeasant.kind});

const cases=data.transformations.filter(t=>t.createsClone);
for(const t of cases.slice(0,3))assert.equal(appendTrainingStep(data,peasantState,[],t.id,futureOptions()).kind,"rejected");

const saveText=fs.readFileSync("tools/fixtures/modern-2.1-test.sav","utf8");
const save=importModernSave(saveText,data);
const baseIndex=save.personnel.bases.findIndex(b=>b.soldiers.length>0);
const savedProof=modernSoldierProof(data,save,baseIndex,0);
assert(savedProof?.kind==="proof");
assert.equal(savedProof.options.mode,"current");
assert.equal(futureOptions(savedProof.options).mode,"future");
assert.equal(futureOptions(savedProof.options).itemsKnown,false);
assert.equal(futureOptions(savedProof.options).baseFunctionsKnown,false);
assert.equal(futureOptions(savedProof.options).medalsKnown,false);
assert.throws(()=>importModernSave(saveText.replace("v.o2","v.o1.1.1"),data));

console.log("PASS 2.1-only training source: 83 rules, 72 distinct origins, SHA provenance, one-way history, no repeat/clone merging");
console.log("PASS training sequence: original current vs planned future, explicit research uncertainty, no false execution certification");
console.log("PASS actual 2.1 save parser, wrong-version rejection, no stale inventory as future proof");
