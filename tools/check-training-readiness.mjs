import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {parseQuantifiedEvidence,assessTrainingReadiness} from "../public/trainings/readiness.js";
import {buildChoiceIndex} from "../public/captains/choice-simulator-core.js";
import {parseXpiratezSave} from "../public/captains/save-import-core.js";

const d=JSON.parse(fs.readFileSync("public/data/trainings-index.json","utf8"));
const compact=JSON.parse(gunzipSync(fs.readFileSync("public/data/trainings-runtime.json.gz")));
const byId=new Map(d.transformations.map(t=>[t.id,t]));
const compactById=new Map(compact.transformations.map(t=>[t.id,t]));
const get=id=>byId.get(id);
const cases=d.transformations;
const count=test=>cases.filter(test).length;
assert.equal(cases.length,83);
assert.equal(count(t=>Object.values(t.requiredMinStats||{}).some(x=>x>0)),29);
assert.equal(count(t=>t.minRank!=null),15);
assert.equal(count(t=>t.requiredCommendations.length>0),8);
assert.equal(count(t=>t.requiredItems.length>0),60);
assert.equal(count(t=>t.requiresBaseFunc.length>0),33);
for(const t of cases)
  assert.equal(compactById.get(t.id).needsCorpseRecovered,t.rawRule?.needsCorpseRecovered===true,
    "Corpse condition missing in compact data: "+t.id);

const input=parseQuantifiedEvidence("STR_GOVT_CORPSE=0;STR_HANDLE:1\nLIB=1");
assert.equal(input.get("STR_GOVT_CORPSE"),0);
assert.equal(input.get("STR_HANDLE"),1);
assert.equal(input.get("LIB"),1);
for(const sample of ["STR_A=-2","STR_A=1\nSTR_A=2","STR_A=Infinity",
  "STR_A=1.5","STR_A","<img src=x onerror=alert(1)>"])
  assert.throws(()=>parseQuantifiedEvidence(sample),/입력|중복|수량/);
const empty=assessTrainingReadiness(get("STR_SIMPLETON_TRAINING"));
assert.equal(empty.researchKind,"not-loaded");
assert.equal(empty.missing.length,0,"Unknown evidence must never be treated as a failure");
assert.equal(empty.unknown.length,3);
const saved={completed:new Set(["STR_SIMPLETON_TRAINING"]),disabled:new Set(["STR_PERSON_OF_CULTURE_TRAINING"])};
const simpleton=assessTrainingReadiness(get("STR_SIMPLETON_TRAINING"),{research:saved});
assert.equal(simpleton.researchKind,"met");
assert.equal(simpleton.unknown.length,2,"Inventory not inferred from research ownership");
const culture=assessTrainingReadiness(get("STR_PERSON_OF_CULTURE_TRAINING"),{
  research:saved,stats:{psiStrength:40},baseFuncs:new Map([["LIB",1]]),
  items:new Map([["STR_PORN",25]])
});
assert.equal(culture.researchKind,"blocked");
assert.equal(culture.blocked[0].id,"STR_PERSON_OF_CULTURE_TRAINING");
assert(culture.missing.some(x=>x.id==="psiStrength"&&x.needed===45));
assert.equal(culture.met.filter(x=>["item","facility"].includes(x.kind)).length,2);
const red=assessTrainingReadiness(get("STR_RED_KNIGHT"),{
  research:{completed:new Set(),disabled:new Set()},
  rank:2,stats:{melee:90},medals:parseQuantifiedEvidence("STR_MEDAL_STATGAIN_NAME=1"),
  items:new Map([["STR_GLAMOUR",5]]),baseFuncs:new Map([["DOJO",1]])
});
assert(red.missing.some(x=>x.kind==="rank"&&x.needed===3));
assert(red.missing.some(x=>x.kind==="item"&&x.needed===20));
assert(red.met.some(x=>x.kind==="medal"&&x.needed===1));
assert(!red.missing.some(x=>x.kind==="stat-min"));
const before=assessTrainingReadiness(get("STR_GUN_KATA_TRAINING"),{stats:new Map([["psiStrength",40]])});
assert(before.missing.some(x=>x.kind==="stat-min"));
const after=assessTrainingReadiness(get("STR_GUN_KATA_TRAINING"),{
  stats:new Map([["psiStrength",40]]),unitValid:false});
assert.equal(after.missing.length,0);
assert(after.unknown.some(x=>x.kind==="stat-min"),"Do not apply stale unit stats after a transformation");
const corpse=compactById.get("STR_SLEEPING_BEAUTY_REVIVAL");
assert(assessTrainingReadiness(corpse,{condition:"dead",corpseRecovered:false})
  .missing.some(x=>x.kind==="corpse"));
assert(assessTrainingReadiness(corpse,{condition:"dead",corpseRecovered:true})
  .met.some(x=>x.kind==="corpse"));
assert(!assessTrainingReadiness(corpse,{condition:"healthy",corpseRecovered:false})
  .all.some(x=>x.kind==="corpse"));
const recovered=assessTrainingReadiness(get("STR_BREAD_AND_FISHES_TRAINING"),{
  research:{completed:new Set(),disabled:new Set()},
  items:new Map([["STR_MUTANT_FISH",5],["STR_LEEK",0]])
});
assert(recovered.missing.find(x=>x.kind==="item"&&x.id==="STR_LEEK"));
assert(recovered.unknown.find(x=>x.kind==="item"&&x.id==="STR_CABBAGE"));
const progress=JSON.parse(fs.readFileSync("public/data/choice-simulator-index.json","utf8"));
const index=buildChoiceIndex(progress.topics,{inline:true});
const sample=["---","name: Audit only","---","difficulty: 2","funds: 10000",
  "discovered: [STR_SIMPLETON_TRAINING]",
  "researchRuleStatus: {STR_PERSON_OF_CULTURE_TRAINING: 2}",
  "bases:","  - name: Test","    research:","      - project: STR_MILITARY_DRILL_TRAINING"].join("\n");
const loaded=parseXpiratezSave(sample,index);
assert(loaded.completed.includes("STR_SIMPLETON_TRAINING"));
assert(loaded.disabled.includes("STR_PERSON_OF_CULTURE_TRAINING"));
assert(!loaded.completed.includes("STR_MILITARY_DRILL_TRAINING"),
  "Ongoing research is not completed evidence");
const snapshot={completed:new Set(loaded.completed),disabled:new Set(loaded.disabled)};
assert.equal(assessTrainingReadiness(get("STR_PERSON_OF_CULTURE_TRAINING"),{research:snapshot}).researchKind,"blocked");
assert.equal(assessTrainingReadiness(get("STR_MILITARY_DRILL_TRAINING"),{research:snapshot}).researchKind,"missing");
console.log("OK readiness evidence: 83 transformations, 29 stat / 15 rank / 8 medal / 60 material / 33 facility gates; no missing-equals-zero, private research snapshot, corpse and staged-unit uncertainty");
