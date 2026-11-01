// Regression for research-exclusivity maximum soldier stats on the existing
// X-Piratez 2.1 soldier page. Run together with the existing modern tests.
import assert from "node:assert/strict";
import fs from "node:fs";
import {validateResearchMaxima,maximaTableRows,MAXIMA_STATS}
  from "../public/soldiers/modern/maxima-compare.js";
import {permanentResearchTransformLocks,directResearchTransformLocks,nominalResearchTransformRisks,RESEARCH_LOCK_CASES}
  from "../public/soldiers/modern/research-training-locks.js";
import {eligibleTransformation,initialState}
  from "../public/soldiers/modern/eligibility.js";
import {completeResearchDisables,researchSourceDetail}
  from "../public/soldiers/modern/research-exclusion-audit.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const report=JSON.parse(fs.readFileSync("public/data/soldier-research-maxima-20261101.json","utf8"));
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
console.log("PASS 29 class maxima, 11 stats, 441 audited source exclusions (134 mutual pairs, 172 directional, 1 self), six permanent research training locks, and live planner enforcement");
