// Regression for research-exclusivity maximum soldier stats on the existing
// X-Piratez 2.1 soldier page. Run together with the existing modern tests.
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {validateResearchMaxima,validateResearchTriage,maximaTableRows,MAXIMA_STATS}
  from "../public/soldiers/modern/maxima-compare.js";
import {permanentResearchTransformLocks,directResearchTransformLocks,nominalResearchTransformRisks,RESEARCH_LOCK_CASES}
  from "../public/soldiers/modern/research-training-locks.js";
import {eligibleTransformation,initialState}
  from "../public/soldiers/modern/eligibility.js";
import {completeResearchDisables,researchSourceDetail}
  from "../public/soldiers/modern/research-exclusion-audit.js";
import {routeContext,trainingRouteAccess}
  from "../public/trainings/route-access.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const report=JSON.parse(fs.readFileSync("public/data/soldier-research-maxima-20261101.json","utf8"));
const triage=JSON.parse(fs.readFileSync("public/data/soldier-research-triage-20261101.json","utf8"));
const calculatedTriage=JSON.parse(execFileSync(process.execPath,
  ["tools/audit-soldier-maxima-research-roots.mjs","--json"],{
    encoding:"utf8",maxBuffer:1024*1024,timeout:90000
  }));
assert.deepEqual(triage,calculatedTriage,
  "Published root research / event and six-group choice audit must match source calculation");
const byClass=validateResearchTriage(triage,report);
assert.equal(byClass.size,29);
assert.equal(triage.summary.saveVerified,0);
assert.equal(triage.summary.chronologyExecuted,0);
assert.equal(triage.summary.sourceEventGrantRows,19);
for(const route of triage.rows){
  const done=new Set();
  for(const id of route.historyOrder){
    const t=data.transformations.find(x=>x.id===id);
    assert(t,"Unknown transformation in ordered witness "+id);
    assert((t.requiredPreviousTransformations||[]).every(x=>done.has(x)),
      route.id+" missing required past transformation before "+id);
    assert((t.forbiddenPreviousTransformations||[]).every(x=>x===id||!done.has(x)),
      route.id+" has forbidden already-completed training before "+id);
    done.add(id);
  }
  assert.equal(done.size,route.transformationGoals);
}
assert.equal(triage.summary.nominalUnscheduledRows,0);
for(const id of ["STR_SOLDIER_DAMSEL","STR_SOLDIER_HERO"]){
  const provenance=byClass.get(id);
  assert.equal(provenance.proofStatus,"UNPROVEN");
  assert.equal(provenance.branchChoice.captain,"STR_CAPTAIN_THIEF");
  assert(provenance.eventGrantGoals.some(x=>x.id==="STR_CAPTAINS_11"));
}
assert.equal(byClass.get("STR_SOLDIER_HERO").branchChoice.codex,
  "STR_CODEX_RED_AWAKENED");
assert.equal(byClass.get("STR_SOLDIER_DAMSEL").branchChoice.queen,
  "STR_QUEEN_SAVAGE");
const check=validateResearchMaxima(report,data);
assert.equal(check.classes,29);
assert.equal(check.sourceExclusions,441);
const fullAudit=completeResearchDisables(data.researchRules);
assert.equal(fullAudit.counts.namedResearch,4654);
assert.equal(fullAudit.counts.directEdges,441);
assert.equal(fullAudit.counts.reciprocalPairs,134);
assert.equal(fullAudit.counts.onewayEdges,172);
assert.equal(fullAudit.counts.selfEdges,1);
const codexResearch=researchSourceDetail("STR_CODEX_GREEN",data);
assert(codexResearch.disables.includes("STR_CODEX_RED"));
assert(codexResearch.disables.includes("STR_CODEX_GOLD"));
const sludge=researchSourceDetail("STR_SLUDGE_VATS",data);
assert(sludge.dependencies.includes("STR_CODEX_GREEN"));
assert(fullAudit.pairs.some(x=>x.source==="STR_CODEX_RED"&&
  x.target==="STR_CODEX_GREEN"&&x.type==="reciprocal"));

assert.equal(MAXIMA_STATS.length,11);
assert.equal(report.rows.length,29);
const best=report.rows.find(x=>x.id==="STR_SOLDIER_DAMSEL");
const hero=report.rows.find(x=>x.id==="STR_SOLDIER_HERO");
assert.equal(best.score,411);
assert.equal(hero.score,282);
assert.equal(report.rows.find(x=>x.id==="STR_SOLDIER_PEASANT").score,261);
assert.equal(report.rows.find(x=>x.id==="STR_SOLDIER_SLAVE").score,275);
assert.equal(report.rows.find(x=>x.id==="STR_SOLDIER_GNOME").score,268);
assert.equal(best.transformations.length,18);
assert.equal(report.audit.verifiedInSaveCount,0,
  "No static maximum may be passed off as a save-verified route");
assert(report.audit.provenInvalidPriorRows.includes("STR_SOLDIER_HERO:300"));
assert(report.audit.provenInvalidPriorRows.includes("STR_SOLDIER_PEASANT:276"));
// Verify one terminal captain choice can accommodate the WHOLE recommended
// set, not merely that each of the trainings is independently reachable.
const trainingData=JSON.parse(fs.readFileSync("public/data/trainings-index.json","utf8"));
const trainingById=new Map(trainingData.transformations.map(t=>[t.id,t]));
const captainBranches=trainingData.routeChoices.find(g=>g.id==="captain").choices
  .map(c=>c.id).filter(id=>id!=="STR_CAPTAIN_PUSSY");
function allowedWithCaptain(steps,captain){
  const context=routeContext(trainingData,{captain});
  return steps.every(id=>{
    const source=trainingById.get(id);
    assert(source,"Missing source transformation "+id);
    return !trainingRouteAccess(source,context,trainingData).blocked;
  });
}
for(const row of report.rows){
  const valid=captainBranches.filter(cap=>allowedWithCaptain(row.transformations,cap));
  assert(valid.length>0,
    row.id+" has ZERO achievable captain branches; candidate includes mutually exclusive gated event rewards");
  // At least one alternative within EACH major research choice group must
  // remain compatible with the selected transformations. This is a necessary
  // condition, not a time-ordered source acquisition certificate.
  for(const group of trainingData.routeChoices){
    const candidates=group.choices.map(c=>c.id)
      .filter(id=>group.id!=="captain"||id!=="STR_CAPTAIN_PUSSY");
    const compatible=candidates.filter(choice=>{
      const context=routeContext(trainingData,{[group.id]:choice});
      return row.transformations.every(id=>
        !trainingRouteAccess(trainingById.get(id),context,trainingData).blocked);
    });
    assert(compatible.length>0,
      row.id+" has NO known compatible branch for "+group.id+
      " (invalid research/loot event path)");
  }
}
for(const id of ["STR_SOLDIER_HERO","STR_SOLDIER_PEASANT"]){
  const existing=report.rows.find(x=>x.id===id);
  assert(!existing.transformations.includes("STR_CAPTAINS_11")||
    !existing.transformations.includes("STR_BREAD_AND_FISHES_TRAINING"),
    id+" must not combine thief-only Captain's 11 with priest-only Bread and Fishes");
}
assert(captainBranches.every(c=>!allowedWithCaptain([
  "STR_CAPTAINS_11","STR_BREAD_AND_FISHES_TRAINING"],c)),
  "Prior illegal 300/276 combinations must be rejected by every terminal captain choice");
assert(!hero.transformations.includes("STR_HERO_GREEN_TRAINING")||
       !hero.transformations.includes("STR_HERO_RED_TRAINING"));
assert(!hero.transformations.includes("STR_HERO_GOLD_TRAINING")||
       !hero.transformations.includes("STR_HERO_RED_TRAINING"));
for(const row of report.rows){
  assert.equal(row.solverStatus,0,row.id+" must be optimized");
  assert.equal(Object.keys(row.bonus).length,11,row.id+" score fields");
  assert.equal(row.score,MAXIMA_STATS.reduce((sum,k)=>sum+row.bonus[k],0));
  assert(row.unreachableResearchRoots instanceof Array,
    row.id+" must disclose unresolved research roots");
}
const table=maximaTableRows(report,data);
assert.equal(table.length,29);
assert.equal(table[0].score,411);
assert.equal(table[0].values.tu,
  data.soldiers.find(s=>s.id===best.id).statCaps.tu+best.bonus.tu);
assert.equal(maximaTableRows(report,data,"bonus")[0].values.tu,best.bonus.tu);
assert.equal(maximaTableRows(report,data,"bonus","STR_SOLDIER_HERO").length,1);
for(const pair of RESEARCH_LOCK_CASES){
  assert(data.researchRules[pair.from].disables.includes(pair.to),
    pair.from+" must disable "+pair.to);
  assert(data.researchRules[pair.to].disables.includes(pair.from),
    pair.to+" must disable "+pair.from);
  const blocker=permanentResearchTransformLocks(new Set([pair.a]),
    pair.b,data.researchRules);
  assert(blocker.length>0,pair.a+" + "+pair.b+" should be blocked");
  assert.equal(permanentResearchTransformLocks(new Set([pair.b]),
    pair.a,data.researchRules).length,1);
}
assert.equal(permanentResearchTransformLocks(
  new Set(["STR_HERO_GREEN_TRAINING"]),"STR_GREEN_BEAUTY",
  data.researchRules).length,0,"matching green branch may coexist");
assert(nominalResearchTransformRisks(
  new Set(["STR_PURE_MAIDEN_TRAINING"]),"STR_REVOLUTIONARY_TRAINING").length);
// Automatic direct-requires graph rejects every reciprocal pair, with no
// hand-maintained research ID list, while preserving directional sequencing.
const pairsData={researchRules:{A:{disables:["B"]},B:{disables:["A"]}},
  transformations:[{id:"TA",requires:["A"]},{id:"TB",requires:["B"]}]};
assert.equal(directResearchTransformLocks(new Map([["TA",1]]),"TB",pairsData).length,1);
const oneWayData={...pairsData,researchRules:{A:{disables:["B"]},B:{disables:[]}}};
assert.equal(directResearchTransformLocks(new Map([["TA",1]]),"TB",oneWayData).length,0);
const canReenable={...pairsData,researchRules:{...pairsData.researchRules,C:{reenables:["B"]}}};
assert.equal(directResearchTransformLocks(new Map([["TA",1]]),"TB",canReenable).length,0);
const heroState=initialState(data,"base:STR_SOLDIER_HERO");
heroState.history=new Map([["STR_HERO_RED_TRAINING",1]]);
const green=data.transformations.find(t=>t.id==="STR_HERO_GREEN_TRAINING");
const blocked=eligibleTransformation(green,heroState,data,{mode:"future"});
assert.equal(blocked.kind,"blocked");
assert(blocked.blockers.some(s=>s.includes("STR_CODEX_RED")&&s.includes("STR_CODEX_GREEN")));
assert.equal(new Set(report.rows.map(x=>x.id)).size,29);
console.log("PASS 29 conditional class candidates and 11 stats; source-backed thief/priest route conflict rejected, 441 research disables, six permanent training locks, and live planner enforcement");
