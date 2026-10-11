import fs from "node:fs";
import assert from "node:assert/strict";
import {routeContext,trainingRouteAccess} from "../public/trainings/route-access.js";
import {auditSoldierBuild} from "../public/soldiers/branch-audit.js";
import {divergentPathCompatibility} from "../public/trainings/planner.js";

const training=JSON.parse(fs.readFileSync("public/data/trainings-index.json","utf8"));
const soldiers=JSON.parse(fs.readFileSync("public/data/soldiers-index.json","utf8"));
const gates=JSON.parse(fs.readFileSync("public/data/training-path-gates.json","utf8"));
assert.equal(gates.schemaVersion,1);
assert.equal(gates.modVersion,"v.o1.1.1");
assert.equal(gates.trainingRulesSha256,training.meta.sha256);
// An unlock is not a valid alternate path if its source simultaneously
// disables the target. This invariant must agree with the research/choice DB.
const syntheticGraph={
  PATH_A:{disables:["PATH_B"]},PATH_B:{disables:["PATH_A"]},
  UNSAFE:{disables:["TARGET"]},SAFE:{},
  TARGET:{prerequisites:["PATH_A"]},
  HARD_TARGET:{prerequisites:["PATH_A"],strictRequires:["PATH_A"]}
};
function syntheticAccess(target,unlockers){
  const data={researchGraph:syntheticGraph,
    routeChoices:[{id:"path",choices:[{id:"PATH_A"},{id:"PATH_B"}]}],
    alternativeSources:{[target]:{unlockers}}};
  return trainingRouteAccess({id:"TEST_TRANSFORM",researchRoots:[target]},
    routeContext(data,{path:"PATH_B"}),data);
}
assert(syntheticAccess("TARGET",["UNSAFE"]).blocked,
  "A grantor that also disables the target must NOT bypass a conflicting prerequisite");
assert(syntheticAccess("TARGET",["MISSING"]).blocked,
  "Unknown alternative grantors must not silently bypass a disabled prerequisite");
assert(!syntheticAccess("TARGET",["SAFE"]).blocked,
  "A safe reachable explicit unlock must bypass nominal dependencies");
assert(syntheticAccess("HARD_TARGET",["SAFE"]).blocked,
  "Even a safe unlock must not bypass hard requires");
const choices=training.routeChoices.find(g=>g.id==="path").choices.map(x=>x.id);
assert.deepEqual(gates.paths.map(x=>x.id),choices);
const full=(1<<choices.length)-1;
function pairCheck(...ids){return divergentPathCompatibility(ids,gates);}
assert(!pairCheck("STR_SCHOOL_OF_HARD_KNOCKS","STR_REVOLUTIONARY_TRAINING").compatible,
  "Training planner allowed Male-only Hard Knocks + Peasant-only Revolution");
assert(!pairCheck("STR_BONDING_CEREMONY","STR_MAGOS_CEREMONY").compatible,
  "Training planner allowed Male-only Bonding + Hybrid-only Magos");
assert(pairCheck("STR_OFFICER_TRAINING","STR_REVOLUTIONARY_TRAINING").compatible,
  "Officer must work on Peasant path");
assert(pairCheck("STR_OFFICER_TRAINING","STR_SCHOOL_OF_HARD_KNOCKS").compatible,
  "Officer must work on Male path");
assert.deepEqual(pairCheck("STR_OFFICER_TRAINING","STR_REVOLUTIONARY_TRAINING").paths.map(x=>x.id),
  ["STR_PEASANT_REVOLUTION_PREQ"]);
assert(pairCheck("STR_HERO_RED_TRAINING","STR_SCHOOL_OF_HARD_KNOCKS").compatible,
  "Red Codex Hero and Male training should be compatible");
function allowedPaths(id){
  return choices.filter((_,i)=>(gates.masks[id]??full)&(1<<i));
}
const male="STR_WE_NEED_MALE_TOUCH_PREQ",peasant="STR_PEASANT_REVOLUTION_PREQ",hybrid="STR_HYBRID_PATH_PREQ";
assert.deepEqual(allowedPaths("STR_SCHOOL_OF_HARD_KNOCKS"),[male],"Hard Knocks must require Male Soldiers");
assert.deepEqual(allowedPaths("STR_BONDING_CEREMONY"),[male],"Bonding must require Male Soldiers");
assert.deepEqual(allowedPaths("STR_REVOLUTIONARY_TRAINING"),[peasant],"Revolution must require Peasant Revolution");
assert.deepEqual(allowedPaths("STR_MAGOS_CEREMONY"),[hybrid],"Magos must require Hybrid");
assert.deepEqual(allowedPaths("STR_PSYCHONAUT_TRAINING"),[hybrid],"Psychonaut must require Hybrid");
assert.deepEqual(allowedPaths("STR_OFFICER_TRAINING"),[male,peasant],"Officer must have TWO distinct entry routes");
assert(!allowedPaths("STR_PURE_MAIDEN_TRAINING").includes(peasant),"Peasant explicitly blocks Pure Maiden");
assert(allowedPaths("STR_HERO_RED_TRAINING").length===5,"Red Codex hero buff must not be spuriously path-locked");
const contexts=choices.map(x=>routeContext(training,{path:x}));
for(const t of training.transformations){
  let expected=0;
  for(let i=0;i<contexts.length;i++)
    if(!trainingRouteAccess(t,contexts[i],training).blocked)expected|=(1<<i);
  assert.equal(gates.masks[t.id]??full,expected,"Stale or incorrect divergent path classification: "+t.id);
}
const byId=new Map(soldiers.transformations.map(x=>[x.id,x]));
const p=soldiers.profiles.find(x=>x.saintSlots)||soldiers.profiles[0];
const audit=(ids,path="")=>auditSoldierBuild(p,ids,byId,gates,path);
assert(audit(["STR_SCHOOL_OF_HARD_KNOCKS","STR_REVOLUTIONARY_TRAINING"]).hard.some(x=>x.code==="diverging-path-conflict"));
assert(audit(["STR_BONDING_CEREMONY","STR_MAGOS_CEREMONY"]).hard.some(x=>x.code==="diverging-path-conflict"));
assert(audit(["STR_PURE_MAIDEN_TRAINING","STR_REVOLUTIONARY_TRAINING"]).hard.some(x=>x.code==="diverging-path-conflict"));
assert(!audit(["STR_OFFICER_TRAINING","STR_REVOLUTIONARY_TRAINING"]).hard.some(x=>x.code==="diverging-path-conflict"));
assert(!audit(["STR_OFFICER_TRAINING","STR_SCHOOL_OF_HARD_KNOCKS"]).hard.some(x=>x.code==="diverging-path-conflict"));
assert(audit(["STR_SCHOOL_OF_HARD_KNOCKS"],peasant).hard.some(x=>x.code==="selected-diverging-path"));
assert(!audit(["STR_SCHOOL_OF_HARD_KNOCKS"],male).hard.some(x=>x.code==="selected-diverging-path"));
assert(audit(["STR_OFFICER_TRAINING"],hybrid).hard.some(x=>x.code==="selected-diverging-path"));
assert(!audit(["STR_OFFICER_TRAINING"],peasant).hard.some(x=>x.code==="selected-diverging-path"));
const sets=new Map(soldiers.enhancementBuildSets.map(x=>[x.id,x]));
let examined=0,newlyBlocked=0,pathConflict=0;
for(const profile of soldiers.profiles)for(const combo of sets.get(profile.enhancementBuildSetId).combinations){
  examined++;
  const old=auditSoldierBuild(profile,combo.transformationIds,byId);
  const fresh=auditSoldierBuild(profile,combo.transformationIds,byId,gates);
  const possible=choices.filter((_,i)=>combo.transformationIds.every(id=>
    (gates.masks[id]??full)&(1<<i)));
  const routeConflicts=fresh.hard.filter(x=>x.code==="diverging-path-conflict");
  assert.equal(routeConflicts.length,Number(possible.length===0),
    "Unaccounted trait path conflict: "+profile.sourceId+" / "+combo.id);
  if(routeConflicts.length){pathConflict++;if(!old.hard.length)newlyBlocked++;}
}
assert.equal(examined,1841);
assert(newlyBlocked>=80,"Known unfiltered branch-incompatible final builds were lost unexpectedly");
const markup=fs.readFileSync("public/soldiers/index.html","utf8");
const browser=fs.readFileSync("public/soldiers/app.js","utf8");
assert(markup.includes('id="finalPathFilter"'));
assert(browser.includes('training-path-gates.json')&&browser.includes('updateBranchAudits()'));
const planner=fs.readFileSync("public/trainings/app.js","utf8");
assert(planner.includes('pathIssues([...selected,...plan.steps])'),
  "Training planner must reject incompatibility introduced by auto-added prerequisites");
console.log("OK trait/path exclusivity: "+training.transformations.length+" source transformations / "+
  choices.length+" mutually exclusive paths / "+Object.keys(gates.masks).length+
  " constrained transformations / "+examined+" final combinations / "+pathConflict+
  " divergent-path collisions ("+newlyBlocked+" missed by previous filter); Male/Peasant/Hybrid, Officer dual-unlock, Red Hero regression");
