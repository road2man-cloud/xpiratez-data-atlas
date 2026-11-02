import assert from "node:assert/strict";
import fs from "node:fs";
import {auditOriginPublication,verifyOriginPublicationAggregate,
  ORIGIN_EVIDENCE_LEVELS}
  from "../public/soldiers/modern/origin-evidence-gates.js";
import {validateOriginProgression}
  from "../public/soldiers/modern/origin-progress-ui.js";

const data=JSON.parse(fs.readFileSync(
  "public/data/soldiers-modern-index.json","utf8"));
const report=JSON.parse(fs.readFileSync(
  "public/data/soldier-acquisition-progression-20261102.json","utf8"));
const legacy=JSON.parse(fs.readFileSync(
  "public/data/soldier-research-maxima-20261101.json","utf8"));
const audit=verifyOriginPublicationAggregate(report,data);
assert.deepEqual(audit,{
  total:112,sourceProfiles:72,bodyBranches:40,
  directlyConflictedSources:15,eventSourceProfiles:9,
  unlinkedTypeChangeBranches:1,verifiedFinalRoutes:0,
  provenImpossibleRoutes:0,unverifiedFinalRoutes:112,
  status:"RULESET_INDEXED_BUT_FINAL_MAXIMA_UNVERIFIED"
});
assert.deepEqual(validateOriginProgression(report,data,legacy),{
  rows:112,births:72,transformBranches:40,verified:0
});
assert.deepEqual(Object.keys(ORIGIN_EVIDENCE_LEVELS).sort(),
  ["RULE_INDEXED","STRUCTURAL_MODEL","UNPROVEN"]);
assert.equal(new Set(report.rows.map(x=>x.id)).size,112);
for(const row of report.rows){
  const proof=auditOriginPublication(row,report,data);
  assert.equal(proof.originId,row.id);
  assert.equal(proof.finalStatus,"UNVERIFIED");
  assert.equal(proof.finalStatSum,null);
  assert.equal(proof.finalStats,null);
  assert.equal(proof.actualSaveWitness,false);
  assert.equal(proof.optimalityProven,false);
  assert.equal(proof.checklist.length,10);
  assert.equal(new Set(proof.checklist.map(x=>x.id)).size,10);
  assert.equal(proof.checklist.filter(x=>x.level==="UNPROVEN").length,
    proof.unresolvedRequirementCount);
  assert(proof.unresolvedRequirementCount>=7);
  assert.equal(proof.checklist.find(x=>x.id==="research").level,"UNPROVEN");
  assert.equal(proof.checklist.find(x=>x.id==="maximum").level,"UNPROVEN");
  assert.equal(proof.eventGuaranteed,false);
  assert.deepEqual(proof.sourcePaths,row.sourceFiles);
  const source=row.kind==="SOURCE_SPAWN";
  assert.equal(proof.ruleIndexedCount,source?2:1);
  assert.equal(proof.structuralOnlyCount,source?1:(
    row.candidateSourceAncestry.candidateCount?2:1));
}
const byId=new Map(report.rows.map(r=>[r.id,r]));
const clone=byId.get("manufacture:STR_THEBAN_ASSAULT_CLONE");
const peasant=byId.get("direct:STR_SOLDIER_PEASANT");
const special=byId.get("manufacture:STR_HALF_UBER_GIRL_RECRUITMENT");
const event=byId.get("event:STR_MRSHAN_FIGHTER_EVENT");
const hound=byId.get("event:STR_CODEX_BONUS_G5");
const noRoot=byId.get("transform:STR_SPECTRE_SUMMONING:from:STR_SOLDIER_SPECTRE");
for(const row of [clone,peasant,special,event,hound,noRoot])assert(row);
const c=auditOriginPublication(clone,report,data);
assert(c.directHistoryConflictCount>=7);
assert(c.directHistoryConflictIds.includes("STR_BATTLE_FORM_AUGMENTATION"));
assert.equal(auditOriginPublication(peasant,report,data).directHistoryConflictCount,0);
assert.equal(auditOriginPublication(event,report,data).eventAlternativeCount,3);
assert.equal(auditOriginPublication(hound,report,data).eventAlternativeCount,1);
const no=auditOriginPublication(noRoot,report,data);
assert.equal(no.unresolvedRequirementCount,8);
assert(no.conditionNotes.some(x=>x.includes("불가능 판정 아님")));
assert.equal(auditOriginPublication(special,report,data).finalStatSum,null);

function failRow(label,mutator){
  const bad=structuredClone(report);
  mutator(bad);
  assert.throws(()=>verifyOriginPublicationAggregate(bad,data),
    undefined,label);
}
failRow("cannot accept an invented individual maximum",r=>{
  r.rows.find(x=>x.id===clone.id).finalStats={health:999};
});
failRow("cannot accept forged source files",r=>{
  r.rows.find(x=>x.id===clone.id).sourceFiles=["Piratez_Events.rul"];
});
failRow("cannot bypass actual 2.1 rule hashes",r=>{
  r.sourceHashes[0]="not-2.1";
});
failRow("cannot treat prior 1.1.1 rules as 2.1",r=>{
  r.sourceVersion="v.o1.1.1";
});
failRow("cannot omit a mandatory 11-stat raw cap",r=>{
  delete r.rows.find(x=>x.id===clone.id).birthStatCapSnapshot.rawGrowthCaps.health;
});
failRow("cannot invent a perfect outcome",r=>{
  r.rows.find(x=>x.id===peasant.id).proof.finalStatsVerified=true;
});
failRow("cannot promote a missing parent to confirmed",r=>{
  r.rows.find(x=>x.id===noRoot.id).proof.status="실행 경로 검증";
});
failRow("cannot silently change a cloned body's identity",r=>{
  r.rows.find(x=>x.id===clone.id).soldierType="STR_SOLDIER_CHORT";
});
console.log("PASS evidence publication: 112 acquisition backgrounds, 72 births, 40 type-change edges, 10 per-origin proof gates");
console.log("PASS all final values fail closed, wrong source file/hash/version, unsourced cap, wrong body, invented certificate rejected");
