// Regression for research-exclusivity maximum soldier stats on the existing
// X-Piratez 2.1 soldier page. Run together with the existing modern tests.
import assert from "node:assert/strict";
import fs from "node:fs";
import {validateResearchMaxima,maximaTableRows,MAXIMA_STATS}
  from "../public/soldiers/modern/maxima-compare.js";
import {permanentResearchTransformLocks,nominalResearchTransformRisks,RESEARCH_LOCK_CASES}
  from "../public/soldiers/modern/research-training-locks.js";
import {eligibleTransformation,initialState}
  from "../public/soldiers/modern/eligibility.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const report=JSON.parse(fs.readFileSync("public/data/soldier-research-maxima-20261101.json","utf8"));
const check=validateResearchMaxima(report,data);
assert.equal(check.classes,29);
assert.equal(check.sourceExclusions,441);
assert.equal(MAXIMA_STATS.length,11);
assert.equal(report.rows.length,29);
const best=report.rows.find(x=>x.id==="STR_SOLDIER_DAMSEL");
const hero=report.rows.find(x=>x.id==="STR_SOLDIER_HERO");
assert.equal(best.score,411);
assert.equal(hero.score,300);
assert.equal(report.rows.find(x=>x.id==="STR_SOLDIER_PEASANT").score,276);
assert.equal(report.rows.find(x=>x.id==="STR_SOLDIER_SLAVE").score,275);
assert.equal(report.rows.find(x=>x.id==="STR_SOLDIER_GNOME").score,268);
assert.equal(best.transformations.length,18);
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
const heroState=initialState(data,"base:STR_SOLDIER_HERO");
heroState.history=new Map([["STR_HERO_RED_TRAINING",1]]);
const green=data.transformations.find(t=>t.id==="STR_HERO_GREEN_TRAINING");
const blocked=eligibleTransformation(green,heroState,data,{mode:"future"});
assert.equal(blocked.kind,"blocked");
assert(blocked.blockers.some(s=>s.includes("STR_CODEX_RED")&&s.includes("STR_CODEX_GREEN")));
assert.equal(new Set(report.rows.map(x=>x.id)).size,29);
console.log("PASS 29 class maxima, 11 stats, computed caps, all score sums, six reciprocal research locks, and live trainer enforcement");
