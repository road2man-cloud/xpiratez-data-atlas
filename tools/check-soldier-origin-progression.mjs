// Guard source-specific 2.1 acquisition audit against silent promotion of
// legacy body maxima, birth-history leaks and false numerical certainty.
import fs from "node:fs";
import assert from "node:assert/strict";
import {buildSoldierOriginProgression,STATS} from "./build-soldier-origin-progression.mjs";
import {validateOriginProgression} from "../public/soldiers/modern/origin-progress-ui.js";
import {initialState,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {buildAcquisitionLedger,validateAcquisitionLedger}
  from "../public/soldiers/modern/acquisition-maxima.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const max=JSON.parse(fs.readFileSync("public/data/soldier-research-maxima-20261101.json","utf8"));
const published=JSON.parse(fs.readFileSync("public/data/soldier-acquisition-progression-20261102.json","utf8"));
const computed=buildSoldierOriginProgression(data,max);
assert.deepEqual(published,computed,
  "published report must be re-generated from the current 2.1 source");
const result=validateOriginProgression(published,data,max);
assert.deepEqual(result,{rows:112,births:72,transformBranches:40,verified:0});
const byId=new Map(published.rows.map(r=>[r.id,r]));
assert.equal(published.classes.length,29);
assert.equal(new Set(published.classes.map(r=>r.soldierType)).size,29);
assert.equal(STATS.length,11);
assert(!STATS.includes("mana"));
assert.equal(published.rows.filter(r=>r.kind==="SOURCE_SPAWN").length,72);
assert.equal(published.rows.filter(r=>r.kind==="TYPE_CHANGE_WITH_UNRESOLVED_PARENT").length,40);
assert(published.rows.every(r=>r.proof.status==="미검증"&&
  !r.proof.chronologicalReplay&&!r.proof.finalStatsVerified&&!r.proof.saveVerified&&
  r.finalStats===null&&r.finalSum===null&&
  r.provisionalBodyBonusCandidate.attributableToThisPerson===false));
for(const p of data.profiles){
  const r=byId.get(p.id),born=initialState(data,p);
  assert(r&&r.soldierType===p.soldierType,"missing source "+p.id);
  assert.deepEqual(r.initialHistory,Object.entries(p.previousTransformations||{})
    .filter(([,n])=>Number(n)>0).map(([id,count])=>({id,count:Number(count)})));
  assert.deepEqual(r.initialBonuses,Object.entries(p.traitCounts||{})
    .filter(([,n])=>Number(n)>0).map(([id,count])=>({id,count:Number(count)})));
  const bonuses=bonusStats(born,data);
  for(const k of STATS){
    assert.equal(r.bornPermanentBonus[k],Number(bonuses[k]||0),
      p.id+" bonus must be counted once: "+k);
    for(const b of ["min","avg","max"])assert.equal(
      r.birth[b][k],p.effectiveStats[b][k],
      p.id+" source-specific spawn "+b+" "+k);
    assert(r.naturalGrowthUpper.physicalThenBattle[k]>=r.birth.max[k]||
      r.naturalGrowthUpper.physicalThenBattle[k]+1>=r.birth.max[k],
      p.id+" upper should not erase birth overcaps: "+k);
  }
}
const half=byId.get("manufacture:STR_HALF_UBER_GIRL_RECRUITMENT");
const peasant=byId.get("direct:STR_SOLDIER_PEASANT");
assert.equal(half.soldierType,peasant.soldierType);
assert.notDeepEqual(half.birth,peasant.birth,
  "a higher-growth birth is NOT interchangeable with same-class direct recruitment");
assert(half.initialHistory.some(x=>x.id==="STR_UBERIZATION"));
assert(!peasant.initialHistory.some(x=>x.id==="STR_UBERIZATION"));
const assault=byId.get("manufacture:STR_THEBAN_ASSAULT_CLONE");
assert(assault&&assault.soldierType===peasant.soldierType);
assert.equal(assault.rank,1);
assert.equal(peasant.rank,0);
assert.equal(assault.birth.max.firing,80);
assert.equal(peasant.birth.max.firing,36);
assert.equal(assault.birth.max.health,55);
assert.equal(peasant.birth.max.health,40);
assert.equal(assault.birth.max.melee,80);
assert.equal(peasant.birth.max.melee,36);
assert(assault.initialHistory.some(x=>x.id==="STR_THEBAN_ASSAULT_CLONE"));
assert(assault.initialBonuses.some(x=>x.id==="STR_THEBAN_ASSAULT_CLONE"));
assert(!peasant.initialHistory.some(x=>x.id==="STR_THEBAN_ASSAULT_CLONE"));
const jungle=byId.get("manufacture:STR_JUNGLEFIGHTER_GIRL_RECRUITMENT");
assert.equal(jungle.birth.max.psiSkill,0,
  "born effective PsiSkill is zero when untrained even with a positive bonus");
assert.equal(jungle.bornPermanentBonus.psiSkill,3,
  "listed bonus must remain distinct from actual PsiSkill at birth");
const hound=byId.get("event:STR_CODEX_BONUS_G5");
assert(hound.initialHistory.some(x=>x.id==="STR_HERO_RED_TRAINING"));
assert(hound.initialBonuses.some(x=>x.id==="STR_BLESSING_OF_WAR"));
assert.equal(hound.finalStats,null);
for(const [id,expected] of [
  ["STR_CHORT_SUMMONING",true],
  ["STR_ANG_102",true],
  ["STR_SPECTRE_SUMMONING",true],
  ["STR_WEIRDGAL_TRANSFORMATION",false]
]){
  const incoming=published.rows.filter(r=>r.sourceId===id);
  assert(incoming.length>0);
  assert(incoming.every(r=>r.prerequisites.reset===expected&&
    r.proof.resetPreviousHistory===expected&&r.initialHistory===null&&
    r.parentAcquisitionProfiles.every(pid=>data.profiles.some(p=>p.id===pid))),
    id+" source-parent history must not be copied into new body");
}
function mustReject(reason,mutator){
  const bad=structuredClone(published);
  mutator(bad);
  assert.throws(()=>validateOriginProgression(bad,data,max),undefined,reason);
}
mustReject("false final stats",r=>{r.rows[0].finalStats=Object.fromEntries(STATS.map(k=>[k,999]));});
mustReject("false certification",r=>{r.rows[0].proof.status="실행 경로 검증";r.rows[0].proof.chronologicalReplay=true;});
mustReject("cannot migrate peasant birth to other profile",r=>{
  r.rows.find(x=>x.id===half.id).birth=r.rows.find(x=>x.id===peasant.id).birth;
});
mustReject("cannot give assault clone an ordinary peasant birth",r=>{
  r.rows.find(x=>x.id===assault.id).birth=r.rows.find(x=>x.id===peasant.id).birth;
});
mustReject("cannot inherit event transformation into recruitment",r=>{
  r.rows.find(x=>x.id===peasant.id).initialHistory=hound.initialHistory;
});
mustReject("cannot silently retain reset history",r=>{
  r.rows.find(x=>x.sourceId==="STR_CHORT_SUMMONING").initialHistory=
    [{id:"STR_RED_KNIGHT",count:1}];
});
mustReject("cannot claim final class aggregate",r=>{r.classes[0].verifiedMaximum=5000;});
mustReject("cannot claim acquisition branch has inherited legacy theoretical maximum",r=>{
  r.rows[0].provisionalBodyBonusCandidate.attributableToThisPerson=true;
});
console.log("PASS origin progression 29 classes, 72 birth profiles, 40 transform sources, 11 stats, birth+history+trait provenance, history resets, 8 false-certification/mixing regressions");
