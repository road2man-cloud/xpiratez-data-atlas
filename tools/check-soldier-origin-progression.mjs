// Guard source-specific 2.1 acquisition audit against silent promotion of
// legacy body maxima, birth-history leaks and false numerical certainty.
import fs from "node:fs";
import assert from "node:assert/strict";
import {buildSoldierOriginProgression,STATS} from "./build-soldier-origin-progression.mjs";
import {enumerateSourceBodyChangeLineages}
  from "./soldier-origin-lineage-census.mjs";
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
assert.equal(data.meta.mod.version,"v.o2");
assert.equal(published.sourceVersion,data.meta.mod.version);
assert.deepEqual(published.sourceHashes,data.meta.source.rules);
assert(!published.source.some(x=>/public\/data\/(?:manufacture|event)[-/]/.test(x)),
  "1.1.1 manufacture/event catalogs must not serve as 2.1 acquisition evidence");
const byId=new Map(published.rows.map(r=>[r.id,r]));
assert.equal(published.classes.length,29);
assert.equal(new Set(published.classes.map(r=>r.soldierType)).size,29);
assert.equal(STATS.length,11);
assert(!STATS.includes("mana"));
assert.equal(published.rows.filter(r=>r.kind==="SOURCE_SPAWN").length,72);
assert.equal(published.rows.filter(r=>r.kind==="TYPE_CHANGE_WITH_UNRESOLVED_PARENT").length,40);
const lineage=enumerateSourceBodyChangeLineages(data);
assert.deepEqual(published.summary.sourceRootedAncestry,lineage.summary);
assert.deepEqual({
  roots:lineage.summary.originalSpawnProfiles,
  rules:lineage.summary.examinedBodyChangeRules,
  edges:lineage.summary.incomingEdges,
  candidates:lineage.summary.sourceAnchoredCandidates,
  longest:lineage.summary.longestBodyChangeChain,
  reset:lineage.summary.candidatesWithHistoryReset,
  postDeath:lineage.summary.candidatesRequiringUnverifiedPostDeathContinuity,
  verified:lineage.summary.fullyExecutedCandidates
},{roots:72,rules:7,edges:40,candidates:401,longest:5,reset:375,
  postDeath:204,verified:0});
for(const edge of lineage.branches){
  const row=published.rows.find(x=>x.id===edge.id);
  assert(row,"source-rooted edge exists in the 112-row ledger: "+edge.id);
  assert.deepEqual(row.candidateSourceAncestry,edge,
    "bounded source chain must remain separate for each incoming edge: "+edge.id);
}
const unlinked=lineage.branches.find(x=>
  x.id==="transform:STR_SPECTRE_SUMMONING:from:STR_SOLDIER_SPECTRE");
assert.equal(unlinked.candidateCount,0);
assert(unlinked.noRecordedPathMeaning.includes("NOT proven impossible"));
assert.equal(published.summary.birthProfilesWithAlreadyCompletedCandidate,17);
assert.equal(published.summary.candidateTransformationsAlreadyCompleted,26);
assert.equal(published.summary.birthProfilesWithDirectForbiddenCandidate,15);
assert.equal(published.summary.directlyForbiddenCandidateTrainings,40);
assert.equal(published.summary.birthProfilesWithResearchHistoryConflict,0);
assert(published.rows.every(r=>r.proof.status!=="불가능 판정"),
  "birth-history diagnostics cannot certify absolute impossibility");
assert(published.rows.every(r=>r.proof.status==="미검증"&&
  !r.proof.chronologicalReplay&&!r.proof.finalStatsVerified&&!r.proof.saveVerified&&
  r.finalStats===null&&r.finalSum===null&&
  r.provisionalBodyBonusCandidate.attributableToThisPerson===false));
for(const p of data.profiles){
  const r=byId.get(p.id),born=initialState(data,p);
  assert(r&&r.soldierType===p.soldierType,"missing source "+p.id);
  if(p.sourceType==="manufacture")assert.deepEqual(
    r.prerequisites.items,p.acquisitionRequiredItems,
    "2.1 source manufacturer gates differ from published record: "+p.id);
  if(p.sourceType==="event")assert.equal(
    r.prerequisites.event.alternatives.length,p.acquisitionEventScripts.length,
    "2.1 alternative event script count differs: "+p.id);
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
assert(assault.legacyCandidateBirthHistoryAudit.directHistoryConflicts.some(x=>
  x.target==="STR_BATTLE_FORM_AUGMENTATION"&&
  x.priorHistory.includes("STR_THEBAN_ASSAULT_CLONE")),
  "Theban clone must not inherit ordinary Peasant's incompatible training opportunity");
assert.equal(peasant.legacyCandidateBirthHistoryAudit.directHistoryConflicts.length,0);
assert(half.legacyCandidateBirthHistoryAudit.alreadyCompleted.includes("STR_UBERIZATION"));
assert(half.legacyCandidateBirthHistoryAudit.alreadyCompleted.includes("STR_MILITIA_TRAINING"));
assert(assault.initialBonuses.some(x=>x.id==="STR_THEBAN_ASSAULT_CLONE"));
assert.deepEqual(assault.prerequisites.items,{"STR_THEBAN_ASSAULT_CLONE_LICENSE":1});
assert(assault.prerequisites.research.includes("STR_THEBAN_ASSAULT_CLONE_LICENSE"),
  "same license ID appears as research gate AND physical item; do not merge them");
assert.equal(assault.prerequisites.cost,10000);
const licenseSupply=assault.prerequisites.itemSources.STR_THEBAN_ASSAULT_CLONE_LICENSE;
assert(licenseSupply.eventGrants.some(x=>x.event==="STR_START_COUNTRY_EGYPT_EVENT"&&
  x.grants.some(g=>g.mode==="everyMulti"&&g.count===12)));
assert(licenseSupply.eventGrants.some(x=>x.event==="STR_REVOLUTIONARY_SPEECH_THEBES"&&
  x.grants.some(g=>g.count===1)));
assert.equal(published.summary.manufacturingProfilesWithMaterials,48);
assert.equal(published.summary.eventOriginsWithTriggerEvidence,9);
const nigeria=byId.get("event:STR_START_COUNTRY_NIGERIA_EVENT");
assert.equal(nigeria.prerequisites.event.firstMonth,0);
assert.equal(nigeria.prerequisites.event.lastMonth,0);
assert.equal(nigeria.prerequisites.event.oneTime,false,
  "bounded country-start timing does not mean OXCE one-time scheduler");
assert(nigeria.prerequisites.event.positiveTriggers.some(x=>
  x.kind==="xcomBaseInCountryTriggers"&&x.id==="STR_NIGERIA"));
assert(!peasant.initialHistory.some(x=>x.id==="STR_THEBAN_ASSAULT_CLONE"));
const jungle=byId.get("manufacture:STR_JUNGLEFIGHTER_GIRL_RECRUITMENT");
assert.equal(jungle.birth.max.psiSkill,0,
  "born effective PsiSkill is zero when untrained even with a positive bonus");
assert.equal(jungle.bornPermanentBonus.psiSkill,3,
  "listed bonus must remain distinct from actual PsiSkill at birth");
const hound=byId.get("event:STR_CODEX_BONUS_G5");
assert(hound.initialHistory.some(x=>x.id==="STR_HERO_RED_TRAINING"));
assert(hound.initialBonuses.some(x=>x.id==="STR_BLESSING_OF_WAR"));
assert.equal(hound.prerequisites.event.minExecutionOdds,23);
assert(hound.prerequisites.event.positiveTriggers.some(x=>
  x.kind==="researchTriggers"&&x.id==="STR_GODS_E5"));
assert(hound.prerequisites.event.negativeTriggers.some(x=>
  x.kind==="researchTriggers"&&x.id==="STR_CAPTAIN_SAINT"));
assert.equal(hound.finalStats,null);
const fighter=byId.get("event:STR_MRSHAN_FIGHTER_EVENT");
assert.equal(fighter.prerequisites.event.alternativeCount,3,
  "event script branches must remain independent, never AND-combined");
assert.equal(fighter.prerequisites.event.alternatives.length,3);
assert(fighter.prerequisites.event.alternatives.some(x=>
  x.script==="STR_MRSHAN_FIGHTER_EVENT_CATPATH_2"&&x.firstMonth===24));
assert.equal(fighter.prerequisites.event.positiveTriggers.length,0,
  "mutually independent source-script research gates must not be conjoined");
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
mustReject("status-only promotion without evidence",r=>{r.rows[0].proof.status="실행 경로 검증";});
mustReject("cannot migrate peasant birth to other profile",r=>{
  r.rows.find(x=>x.id===half.id).birth=r.rows.find(x=>x.id===peasant.id).birth;
});
mustReject("cannot give assault clone an ordinary peasant birth",r=>{
  r.rows.find(x=>x.id===assault.id).birth=r.rows.find(x=>x.id===peasant.id).birth;
});
mustReject("cannot waive physical clone license",r=>{
  r.rows.find(x=>x.id===assault.id).prerequisites.items={};
});
mustReject("cannot import old-version source provenance",r=>{
  r.sourceVersion="v.o1.1.1";
});
mustReject("cannot replace v.o2 script odds with old DB odds",r=>{
  r.rows.find(x=>x.id===hound.id).prerequisites.event.alternatives[0].executionOdds=100;
});
mustReject("cannot remove another event script alternative",r=>{
  r.rows.find(x=>x.id===fighter.id).prerequisites.event.alternatives.pop();
});
mustReject("cannot erase event branch exclusivity",r=>{
  r.rows.find(x=>x.id===hound.id).prerequisites.event.negativeTriggers=[];
});
mustReject("cannot inherit event transformation into recruitment",r=>{
  r.rows.find(x=>x.id===peasant.id).initialHistory=hound.initialHistory;
});
mustReject("cannot silently retain reset history",r=>{
  r.rows.find(x=>x.sourceId==="STR_CHORT_SUMMONING").initialHistory=
    [{id:"STR_RED_KNIGHT",count:1}];
});
mustReject("cannot claim final class aggregate",r=>{r.classes[0].verifiedMaximum=5000;});
mustReject("cannot silently erase clone's inherited forbidden history",r=>{
  r.rows.find(x=>x.id===assault.id)
    .legacyCandidateBirthHistoryAudit.directHistoryConflicts=[];
});
mustReject("cannot count already-owned transformation as a new opportunity",r=>{
  r.rows.find(x=>x.id===half.id)
    .legacyCandidateBirthHistoryAudit.alreadyCompleted=[];
});
mustReject("cannot falsify direct-history audit aggregate",r=>{
  r.summary.birthProfilesWithDirectForbiddenCandidate=0;
});
mustReject("cannot claim acquisition branch has inherited legacy theoretical maximum",r=>{
  r.rows[0].provisionalBodyBonusCandidate.attributableToThisPerson=true;
});
const lineageRowId="transform:STR_SHADE_EMBODIMENT:from:STR_SOLDIER_SPECTRE";
const lineageRow=published.rows.find(r=>r.id===lineageRowId);
assert.equal(lineageRow.candidateSourceAncestry.candidateCount,68);
assert(lineageRow.candidateSourceAncestry.candidates.some(c=>
  c.rootProfileId==="direct:STR_SOLDIER_PEASANT"&&
  c.steps.some(s=>s.transformationId==="STR_SPECTRE_SUMMONING")&&
  c.vitalContinuityUnverified));
mustReject("cannot invent an unrelated original source",r=>{
  r.rows.find(x=>x.id===lineageRowId)
    .candidateSourceAncestry.candidates[0].rootProfileId="direct:STR_SOLDIER_CHORT";
});
mustReject("cannot silently change a body conversion's target",r=>{
  r.rows.find(x=>x.id===lineageRowId)
    .candidateSourceAncestry.candidates[0].steps.at(-1).toType="STR_SOLDIER_CHORT";
});
mustReject("cannot turn a type-only candidate into a verified campaign",r=>{
  r.rows.find(x=>x.id===lineageRowId)
    .candidateSourceAncestry.candidates[0].proof.research=true;
});
mustReject("cannot forge history resets",r=>{
  r.rows.find(x=>x.id===lineageRowId)
    .candidateSourceAncestry.candidates[0].steps[0].historyReset=false;
});
mustReject("cannot inflate root-anchored candidate count",r=>{
  r.summary.sourceRootedAncestry.sourceAnchoredCandidates=999;
});
mustReject("cannot erase one conditional original-source route",r=>{
  r.rows.find(x=>x.id===lineageRowId).candidateSourceAncestry.candidates.pop();
});
mustReject("cannot claim post-corpse living status was executed",r=>{
  const x=r.rows.find(y=>y.id===lineageRowId).candidateSourceAncestry.candidates
    .find(y=>y.vitalContinuityUnverified);
  x.vitalContinuityUnverified=false;
});
// Cross-check the independent source-first ledger already in the same atlas.
const ledger=buildAcquisitionLedger(data);
assert.deepEqual(validateAcquisitionLedger(ledger,data),ledger.summary);
assert.equal(ledger.summary.explicitProfiles,72);
assert.equal(ledger.summary.incomingEdges,40);
assert.equal(ledger.summary.executed,0);
const ledgerById=new Map(ledger.entries.map(x=>[x.id,x]));
for(const p of data.profiles){
  const a=byId.get(p.id),b=ledgerById.get(p.id);
  assert(a&&b,"disagreement in independent acquisition provenance: "+p.id);
  assert.deepEqual(a.birth,b.birth.effective,"birth stat intervals differ: "+p.id);
  assert.equal(a.soldierType,b.soldierType);
  assert.equal(b.finalStats,null);
  for(const x of a.initialHistory)assert.equal(b.birth.history[x.id],x.count);
  for(const x of a.initialBonuses)assert.equal(b.birth.traits[x.id],x.count);
}
for(const edge of ledger.entries.filter(x=>x.transformationId)){
  const a=byId.get("transform:"+edge.transformationId+":from:"+edge.parentType);
  assert(a&&a.sourceId===edge.transformationId&&
    a.parentSoldierType===edge.parentType&&
    a.soldierType===edge.soldierType&&
    a.prerequisites.reset===edge.resetHistory,
    "transformation parent edge disagreement: "+edge.id);
}
console.log("PASS source-first independent ledger reconciled: 72 births / 40 transform edges, no certified stat leakage");
console.log("PASS origin progression 29 classes, 72 birth profiles, 40 transform sources, 11 stats, birth+history+trait provenance, history resets, 11 false-certification/mixing regressions; 17 pre-owned candidate profiles and 15 origin-history direct contraindications (not absolute impossibility)");
