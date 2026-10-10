// Ruleset-backed planning regression tests: directional exclusion, order,
// prerequisite chains, conversion, clone semantics, repeatable projects.
import fs from "node:fs";
import assert from "node:assert/strict";
import {initialState,evaluate,apply,replay,addWithPrerequisites,findResearchConflicts,compileRelations,excludedByPrior,newlyExcludedByPrior,exclusionChanges,traitStatsOf,traitSortValue} from "../public/trainings/planner.js";

const data=JSON.parse(fs.readFileSync("public/data/trainings-index.json","utf8"));
const soldier=JSON.parse(fs.readFileSync("public/data/soldiers-index.json","utf8"));
const byId=new Map(data.transformations.map(t=>[t.id,t]));
const all=new Set(byId.keys());
const verify=(c,m)=>assert.ok(c,m);
const nonzero=o=>Object.fromEntries(Object.entries(o||{}).filter(([,v])=>typeof v==="number"&&v!==0));
assert.equal(data.meta.mod.version,"v.o1.1.1");
assert.equal(data.transformations.length,83,"Official v.o1.1.1 transformation count");
assert.equal(data.transformations.length,soldier.transformations.length);
assert.equal(byId.size,data.transformations.length,"Unique transformations");
const sha=soldier.meta.source.rules.find(r=>r.file===data.meta.ruleFile)?.sha256;
assert.equal(data.meta.sha256,sha,"Official source version has changed");
assert.equal(data.profiles.length,soldier.profiles.length);
assert.equal(data.soldiers.length,soldier.soldiers.length);
const expectedPairs=data.transformations.reduce((v,t)=>v+t.forbiddenPreviousTransformations.filter(id=>all.has(id)).length,0);
assert.equal(data.counts.directionalExclusions,expectedPairs);
for(const t of data.transformations) {
  const canonical=soldier.transformations.find(x=>x.id===t.id);
  verify(canonical,"Unknown transformation "+t.id);
  for(const key of ["requiredPreviousTransformations","forbiddenPreviousTransformations","allowedSoldierTypes","forbiddenSoldierTypes","requiresBaseFunc","requires","producedSoldierType","soldierBonusType","flatOverallStatChange","traitStats"])
    assert.deepEqual(t[key],canonical[key],t.id+" drift in "+key);
  assert.deepEqual(nonzero(traitStatsOf(t,data.bonuses)),nonzero(t.traitStats),t.id+" SoldierBonus stats must match the published trait stats");
  assert.deepEqual(t.researchRoots,t.requires.filter(id=>data.researchGraph[id]),"Root research for "+t.id);
  for(const pre of t.requiredPreviousTransformations)verify(all.has(pre),"Missing prerequisite transformation "+t.id+":"+pre);
  for(const prior of t.forbiddenPreviousTransformations)verify(all.has(prior),"Unknown exclusion "+t.id+":"+prior);
  verify(t.rawRule.name===t.id,"Raw source mismatch "+t.id);
  verify(["훈련/교육","병종 전환","복제/소환","의식/개조"].includes(t.kind),"Unknown kind "+t.id);
}
const culture=byId.get("STR_PERSON_OF_CULTURE_TRAINING");
verify(culture,"Missing cultural education");
assert.deepEqual(culture.researchRoots,["STR_PERSON_OF_CULTURE_TRAINING"]);
verify(culture.requiresBaseFunc.includes("LIB"));
assert.equal(culture.requiredMinStats.psiStrength,45);
assert.equal(culture.transferTime,336);
assert.equal(culture.requiredItems.find(x=>x.id==="STR_PORN")?.amount,25);
assert.equal(culture.flatOverallStatChange.firing,2);
assert.equal(culture.traitStats.firing,1);
assert.equal(data.bonuses[culture.soldierBonusType].frontArmor,1);
assert.equal(traitSortValue(culture,data.bonuses,"firing"),1,"Trait firing +1 must not include direct firing +2");
assert.equal(culture.flatOverallStatChange.firing,2);
assert.deepEqual(traitStatsOf(culture,data.bonuses),data.bonuses[culture.soldierBonusType].stats);
assert.equal(traitSortValue(culture,data.bonuses,"total"),
  Object.values(traitStatsOf(culture,data.bonuses)).reduce((n,v)=>n+Math.max(0,v),0));
assert.equal(traitSortValue(culture,data.bonuses,"tu"),Number(traitStatsOf(culture,data.bonuses).tu||0));
const gal={soldierType:"STR_SOLDIER",previousTransformations:{}};
let initial=initialState(gal);
assert.deepEqual(evaluate(culture,initial),[]);
const afterCulture=apply(culture,initial);
verify(evaluate(byId.get("STR_NEPOTISM"),afterCulture).some(x=>x.code==="forbidden"),"Culture must prevent nepotism later");
verify(evaluate(byId.get("STR_MILITARY_DRILL_TRAINING"),afterCulture).some(x=>x.code==="forbidden"),"Culture must prevent military drill later");
const afterCultureBlocks=excludedByPrior(data.transformations,afterCulture);
for(const id of ["STR_NEPOTISM","STR_MILITARY_DRILL_TRAINING"]){
  verify(afterCultureBlocks.find(x=>x.id===id)?.blockedBy.includes(culture.id),"Missing concrete blocker for "+id);
  verify(newlyExcludedByPrior(data.transformations,initial,afterCulture).some(x=>x.id===id),"Missing newly excluded "+id);
}
assert.deepEqual(excludedByPrior(data.transformations,initial),[],"Fresh Gal must start without trained exclusions");
const bread=byId.get("STR_BREAD_AND_FISHES_TRAINING");
const afterBread=apply(bread,initial),afterBreadCulture=apply(culture,afterBread);
const breadChanges=exclusionChanges(data.transformations,afterBread,afterBreadCulture);
verify(excludedByPrior(data.transformations,afterBread).some(x=>x.id==="STR_MILITARY_DRILL_TRAINING"),
  "Bread and Fishes must already block military drill");
const sharedMilitary=breadChanges.additionalCauses.find(x=>x.id==="STR_MILITARY_DRILL_TRAINING");
verify(sharedMilitary?.blockedBy.includes(bread.id)&&sharedMilitary?.blockedBy.includes(culture.id),
  "Both steps must be credited for their shared exclusion");
assert.deepEqual(sharedMilitary.addedBy,[culture.id],"Only the latest step should be a NEW cause");
verify(!breadChanges.newlyBlocked.some(x=>x.id==="STR_MILITARY_DRILL_TRAINING"),
  "An existing blocked target must not count as a newly blocked target");
verify(breadChanges.newlyBlocked.some(x=>x.id==="STR_NEPOTISM"&&x.addedBy.includes(culture.id)),
  "Culture must still report genuinely new exclusions");
assert.deepEqual(exclusionChanges(data.transformations,afterBread,afterBread).additionalCauses,[],
  "A rerender must not invent newly added exclusion causes");
const afterNepotism=apply(byId.get("STR_NEPOTISM"),initial);
verify(evaluate(culture,afterNepotism).some(x=>x.code==="forbidden"),"Nepotism must prevent culture later");
assert.deepEqual(replay(gal,["STR_NEPOTISM"],byId).steps,["STR_NEPOTISM"]);
assert.throws(()=>replay(gal,["STR_NEPOTISM",culture.id],byId),/Cannot apply/);
const military=byId.get("STR_MILITARY_DRILL_TRAINING");
const planned=addWithPrerequisites(military,initial,byId);
verify(planned.state,"Three-stage military prerequisite route missing");
assert.deepEqual(planned.steps,["STR_BASIC_FIREARMS_TRAINING","STR_BOOT_CAMP_TRAINING","STR_MILITARY_DRILL_TRAINING"]);
verify(evaluate(culture,planned.state).some(x=>x.code==="forbidden"),"Military drill must prevent cultural education");
verify(newlyExcludedByPrior(data.transformations,initial,planned.state).some(x=>x.id===culture.id),"Full prerequisite chain did not exclude culture");
verify(addWithPrerequisites(military,afterCulture,byId).state===null,"Blocked prerequisite chain was allowed");
const weird=byId.get("STR_WEIRDGAL_TRANSFORMATION");
assert.deepEqual(evaluate(weird,initial),[]);
assert.equal(apply(weird,initial).soldierType,"STR_SOLDIER_W","Conversion must replace current type");
const tiger=byId.get("STR_TIGER_TOURS");
assert.deepEqual(evaluate(tiger,initial),[]);
assert.deepEqual(evaluate(tiger,apply(tiger,initial)),[],"Repeatable training wrongly made one-shot");
const reverseAsym=data.transformations.flatMap(t=>t.forbiddenPreviousTransformations.filter(other=>other!==t.id&&!byId.get(other)?.forbiddenPreviousTransformations.includes(t.id)).map(other=>({later:t.id,previous:other})));
verify(reverseAsym.length>0,"No asymmetry cases identified");
const A={id:"A",allowedSoldierTypes:[],forbiddenSoldierTypes:[],forbiddenPreviousTransformations:["B"],requiredPreviousTransformations:[],removeTransformations:[]};
const B={id:"B",allowedSoldierTypes:[],forbiddenSoldierTypes:[],forbiddenPreviousTransformations:[],requiredPreviousTransformations:[],removeTransformations:[]};
verify(evaluate(A,apply(B,initial)).some(x=>x.code==="forbidden"),"Order-specific block failed");
assert.deepEqual(evaluate(B,apply(A,initial)),[],"Directional exclusion was erroneously symmetrized");
assert.deepEqual(newlyExcludedByPrior([A,B],initial,apply(A,initial)),[],"One-way restriction cannot become symmetric");
assert.deepEqual(newlyExcludedByPrior([A,B],initial,apply(B,initial)),[{id:"A",blockedBy:["B"]}]);
const existingProfile=data.profiles.find(p=>Object.keys(p.previousTransformations).length>0);
verify(existingProfile,"Expected acquired profile with initial training history");
const initialProfileState=initialState(existingProfile);
const knownInitial=excludedByPrior(data.transformations,initialProfileState);
verify(knownInitial.length>0,"Acquisition history must create preexisting exclusions");
assert.deepEqual(newlyExcludedByPrior(data.transformations,initialProfileState,initialProfileState),[],"Preexisting blocks are not newly added");
const removes={id:"REMOVE",allowedSoldierTypes:[],forbiddenPreviousTransformations:[],requiredPreviousTransformations:[],removeTransformations:["B"]};
verify(!apply(removes,apply(B,initial)).prior.has("B"),"Removal of a previous transformation failed");
assert.deepEqual(exclusionChanges([A,B],apply(B,initial),apply(removes,apply(B,initial))).unblocked,
  [{id:"A",removedBy:["B"]}],"Removal must release a formerly excluded target");
const clone={id:"CLONE",createsClone:true,producedSoldierType:"SOME_CLONE",allowedSoldierTypes:[],requiredPreviousTransformations:[],forbiddenPreviousTransformations:[]};
assert.equal(apply(clone,initial).soldierType,initial.soldierType,"Clone changed source soldier type");
for(const t of data.transformations) {
  for(const id of t.researchRoots)verify(data.researchGraph[id],"Unresolved research root: "+t.id+" "+id);
}
const graph=data.researchGraph;
const conflicts=findResearchConflicts([culture,military],graph);
assert.ok(Array.isArray(conflicts));
const relations=compileRelations(data.transformations);
verify(relations.get(culture.id).blockedBy.includes("STR_NEPOTISM"),"Missing reverse lookup");
console.log("OK training DB: "+data.transformations.length+" verified effective transforms; "+expectedPairs+" directional excludes; "+reverseAsym.length+" asymmetric edges; new exclusions vs additional causes (Bread+Culture, military drill), release and initial profile; trait-only stat sort; military 3-step closure; culture/nepotism; repeat, type change, clone and research graph");
