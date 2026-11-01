// Acquisition-aware resolution of the four stat-entry deficits discovered
// in the 29 published soldier-class conditional maxima.
// Evidence is from the same effective 2.1 soldier, medal and event indexes.
// A bonus delivered by an EVENT-BORN soldier bypasses its transformation's
// manual requiredMinStats; an assumed medal tier is NOT a medal acquisition.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {initialState,eligibleTransformation,bonusStats}
  from "../public/soldiers/modern/eligibility.js";
import {verifyCampaignSequence}
  from "../public/soldiers/modern/campaign-proof.js";

const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const gate=JSON.parse(fs.readFileSync("public/data/soldier-stat-gate-audit-20261102.json","utf8"));
const maxima=JSON.parse(fs.readFileSync("public/data/soldier-research-maxima-20261101.json","utf8"));
const events=JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/events-index.json.gz"))).index;
const eventById=new Map(events.map(x=>[x.id,x]));
const eventBuckets=new Map();
function eventDetail(event){
  const index=eventById.get(event);
  assert(index,"Missing event index "+event);
  if(!eventBuckets.has(index.bucket)){
    const entries=JSON.parse(zlib.gunzipSync(fs.readFileSync(
      "public/data/event-chunks/"+index.bucket+".json.gz"))).details;
    eventBuckets.set(index.bucket,entries);
  }
  return eventBuckets.get(index.bucket)[event];
}
const m=n=>Number(n||0);
const arr=x=>Array.isArray(x)?x:[];
const TRANS=new Map(data.transformations.map(x=>[x.id,x]));
const BONUS=new Map(data.bonuses.map(x=>[x.id,x]));
const MEDALS=Object.entries(data.commendationIndex||{});
function medalEvidence(key,needed){
  return MEDALS.map(([id,record])=>{
    const levels=arr(record.bonusLevels).map((bonId,i)=>({
      level:i+1,gameLevel:i,bonusId:bonId,
      increase:m(BONUS.get(bonId)?.stats?.[key]),
      criteria:Object.entries(record.criteria||{}).filter(([,v])=>Array.isArray(v))
        .map(([kind,thresholds])=>({kind,threshold:thresholds[i]??null}))
    }));
    const matching=levels.find(x=>x.increase>=needed);
    const max=Math.max(0,...levels.map(x=>x.increase));
    return {id,koName:record.koName,enName:record.enName,max,
      firstEnough:matching||null,
      maxAtLevel:levels.findLast(x=>x.increase===max)?.level||0};
  }).filter(x=>x.max>0);
}
function syntheticBeforeGate(row,deficit,medal){
  const base=data.soldiers.find(s=>s.id===row.id);
  const state=initialState(data,"base:"+row.id,{rank:5});
  state.currentStats={...base.statCaps};
  state.initialStats={...base.maxStats};
  state.exactStats=true;
  const traitIds=new Set(row.transformations.filter(id=>id!==deficit.training)
    .map(id=>TRANS.get(id)?.soldierBonusType).filter(Boolean));
  state.bonusIds=traitIds;
  state.bonusCounts=new Map([...traitIds].map(id=>[id,1]));
  const t=TRANS.get(deficit.training);
  const medals=medal?{[medal.id]:medal.firstEnough.gameLevel}:{};
  const option={mode:"current",researched:t.requires,disabled:[],
    baseFunctions:t.requiresBaseFunc,items:t.requiredItems,
    funds:1000000000,commendations:medals,statsKnown:true};
  const verdict=eligibleTransformation(t,state,data,option);
  const observed=m(state.currentStats[deficit.key])+
    m(bonusStats(state,data,{commendations:medals})[deficit.key]);
  return {observed,minimum:deficit.required,
    minStatBlocked:verdict.blockers.some(x=>x.includes(
      deficit.key+" 최소 "+deficit.required+" 미달: ")),
    kind:verdict.kind,
    allBlockers:verdict.blockers.slice(0,7)};
}
function eventBornProfiles(row,deficit){
  const target=TRANS.get(deficit.training);
  return data.profiles.filter(p=>p.soldierType===row.id&&
    m(p.previousTransformations?.[deficit.training])>0&&
    m(p.traitCounts?.[target.soldierBonusType])>0).map(p=>{
      const e=eventById.get(p.sourceId);
      const detail=eventDetail(p.sourceId);
      const positives=detail.triggerSummary.positive.map(x=>({
        type:x.kind,id:x.id,value:x.value
      }));
      const negatives=detail.triggerSummary.negative.map(x=>({
        type:x.kind,id:x.id,value:x.value
      }));
      assert(detail.effects.spawnedSoldier.previousTransformations?.[deficit.training]===1);
      assert(detail.effects.spawnedSoldier.transformationBonuses?.[target.soldierBonusType]===1);
      assert(e&&e.hasRecruit&&e.spawnedPersonType===row.id,
        "Acquisition must be a documented source event "+p.id);
      return {profile:p.id,event:p.sourceId,eventKoName:e.koName,
        eventEnName:e.enName,awardedHistory:deficit.training,
        awardedBonus:target.soldierBonusType,
        bonusStrength:m(BONUS.get(target.soldierBonusType)?.stats?.strength),
        requiredPositiveTriggers:positives,
        requiredNegativeTriggers:negatives,
        minExecutionOdds:e.minExecutionOdds,maxExecutionOdds:e.maxExecutionOdds,
        positiveTriggers:e.positiveTriggerCount,
        negativeTriggers:e.negativeTriggerCount,
        conditional:true,guaranteed:false};
    });
}
function postEventContinuationReplay(){
  const p=data.profiles.find(x=>x.id==="event:STR_CODEX_BONUS_G5");
  assert(p,"Source 2.1 event-born hound profile missing");
  const state=initialState(data,p,{rank:0});
  // A hypothetical already received event hound. It is NOT evidence that
  // its 23%-odds event has ever happened. The seed assumes fixed AVG stats.
  state.exactStats=true;
  const world={month:100,
    researched:new Set(["STR_GLADIATOR_TRAINING","STR_CAPTAINS_11"]),
    disabled:new Set(),
    items:{STR_GLAMOUR:21,STR_CAPTAINS_11_TOKEN:1},
    baseFunctions:new Set(["DEN"]),
    funds:500000,
    generatedEvents:{STR_CODEX_BONUS_G5:1},
    evidenceComplete:false,
    soldiers:[{id:"HOUND",state,commendations:{}}]};
  const steps=["STR_GLADIATOR_TRAINING","STR_CAPTAINS_11"]
    .map(id=>({type:"transform",soldier:"HOUND",transform:id}));
  const result=verifyCampaignSequence(world,steps,data);
  assert.equal(result.kind,"ruleset-consistent",
    "Post-event hound continuation must replay with those assumed materials");
  assert(result.trace.every(x=>x.kind==="applied"));
  const end=result.world.soldiers[0].state;
  const sum=maxima.statKeys.reduce((n,key)=>n+m(bonusStats(end,data)[key]),0);
  assert.equal(sum,maxima.rows.find(x=>x.id==="STR_SOLDIER_BLOODOGE").score);
  assert.equal(end.history.get("STR_HERO_RED_TRAINING"),1,
    "Event-born pre-award should NOT be repeated");
  return {status:"ASSUMPTION_SEEDED_POST_EVENT_CONTINUATION",
    modeledSteps:steps,postEventEligible:true,postEventTotalPermanentBonus:sum,
    assumedStartingEvent:"STR_CODEX_BONUS_G5",
    assumedResearched:["STR_GLADIATOR_TRAINING","STR_CAPTAINS_11"],
    assumedItems:world.items,
    assumedFacilityFunctions:["DEN"],assumedFunds:world.funds,
    exactStatsMode:"AVG_SOURCE_STATS_ASSUMED",
    proofLimit:"Only the two later transforms were replayed. Prior event, captain research, item stock, facility, funds and overall campaign are NOT proved."};
}
const rows=gate.rows.filter(r=>r.deficits.length).map(flag=>{
  const row=maxima.rows.find(x=>x.id===flag.id);
  assert(row);
  const d=flag.deficits[0];
  const validMedals=medalEvidence(d.key,d.shortfall)
    .filter(x=>x.firstEnough).sort((a,b)=>
      a.firstEnough.level-b.firstEnough.level||
      m(a.firstEnough.criteria[0]?.threshold)-m(b.firstEnough.criteria[0]?.threshold)||
      a.id.localeCompare(b.id));
  const easy=validMedals.find(x=>x.id==="STR_MEDAL_SERVICE_TIME_NAME")||
    validMedals.find(x=>x.id==="STR_MEDAL_PRIMAL_NAME")||
    validMedals[0];
  const before=syntheticBeforeGate(row,d,null);
  assert.equal(before.observed,d.ceiling);
  assert(before.minStatBlocked,
    "Without medals/source exceptions gate must reject "+flag.id);
  const after=easy?syntheticBeforeGate(row,d,easy):null;
  if(after)assert(!after.minStatBlocked&&after.observed>=d.required,
    "Proposed medal tier must clear THAT stat gate "+flag.id);
  const all=medalEvidence(d.key,1).sort((a,b)=>b.max-a.max);
  const optimisticAllMedalCeiling=all.reduce((s,x)=>s+x.max,0);
  const top=[];let sum=0;
  for(const x of all){
    if(sum>=d.shortfall)break;
    top.push({id:x.id,koName:x.koName,max:x.max,
      maxAtLevel:x.maxAtLevel});
    sum+=x.max;
  }
  const eventBorn=eventBornProfiles(row,d);
  const postEventReplay=eventBorn.length?postEventContinuationReplay():null;
  return {id:flag.id,score:row.score,key:d.key,required:d.required,
    postEventReplay,
    selectedOnlyGenerousCeiling:d.ceiling,shortfall:d.shortfall,
    directAttempt:{source:"current OXCE mode eligibility",...before},
    minimalSingleMedalCandidate:easy?{
      id:easy.id,name:easy.koName,
      level:easy.firstEnough.level,
      engineLevel:easy.firstEnough.gameLevel,
      increase:easy.firstEnough.increase,
      criterion:easy.firstEnough.criteria
    }:null,
    hypotheticalMedalClearsGate:after,
    sourceBornAlternatives:eventBorn,
    absoluteAllMedalUpperBound:optimisticAllMedalCeiling,
    medalSourcesWithPositiveBonus:all.length,
    optimisticMinDistinctMedals:sum>=d.shortfall?top.length:null,
    optimisticMedalTopCombination:top,
    caveats:[
      "Medal criteria must be achieved by THIS soldier before the transformation. This is not verified.",
      "High medal levels, random loot, and equipment may be impossible or mutually exclusive; the optimistic sum does not prove access.",
      "An event-born soldier already contains the listed transformation history and bonus: do NOT apply it again.",
      "A synthetic stat-cap test is a gate calculation, not a real campaign save or chronology."
    ]};
});
assert.equal(rows.length,4);
const h=rows.find(x=>x.id==="STR_SOLDIER_BLOODOGE");
assert.equal(h.sourceBornAlternatives.length,1);
assert.equal(h.sourceBornAlternatives[0].event,"STR_CODEX_BONUS_G5");
assert.equal(h.sourceBornAlternatives[0].minExecutionOdds,23);
assert.equal(h.postEventReplay.status,"ASSUMPTION_SEEDED_POST_EVENT_CONTINUATION");
assert.equal(h.postEventReplay.postEventTotalPermanentBonus,131);
assert.deepEqual(h.sourceBornAlternatives[0].requiredPositiveTriggers.map(x=>x.id),
  ["STR_CODEX_RED","STR_GODS_E5","STR_CODEX_RED_AWAKENED"]);
assert.deepEqual(h.sourceBornAlternatives[0].requiredNegativeTriggers.map(x=>x.id),
  ["STR_CAPTAIN_SAINT"]);
const synth=rows.find(x=>x.id==="STR_SOLDIER_SYNTH");
assert.equal(synth.optimisticMinDistinctMedals,11);
assert.equal(synth.absoluteAllMedalUpperBound,52);
const cats=rows.filter(x=>x.id.startsWith("STR_SOLDIER_NEKOMIMI"));
assert.equal(cats.length,2);
for(const cat of cats){
  assert.equal(cat.minimalSingleMedalCandidate.id,"STR_MEDAL_SERVICE_TIME_NAME");
  assert.equal(cat.minimalSingleMedalCandidate.level,1);
  assert.equal(cat.minimalSingleMedalCandidate.criterion[0].threshold,6);
}
const report={schemaVersion:1,kind:"SOLDIER_MAXIMA_STAT_GATE_SOURCE_RESOLUTIONS",
  ruleset:"X-Piratez 2.1 / OXCE 8.7.1 effective indexes",
  evidence:"SOURCE-ATTESTED CONDITIONAL ALTERNATIVES, not achieved save",
  summary:{classesAudited:29,selectedOnlyDeficitClasses:rows.length,
    eventBornBypassCases:rows.filter(x=>x.sourceBornAlternatives.length).length,
    catMedalCases:cats.length,
    confirmedCompleteAcquisitionRoutes:0},
  rows};
if(process.argv.includes("--json"))process.stdout.write(JSON.stringify(report));
else{
  console.log("SOURCE GATE RESOLUTIONS",JSON.stringify(report.summary));
  for(const x of rows)console.log(x.id,"gap",x.shortfall,
    "medal",x.minimalSingleMedalCandidate?.id,x.minimalSingleMedalCandidate?.level,
    "eventBorn",x.sourceBornAlternatives.map(y=>y.event).join(","),
    "minMedalTypes",x.optimisticMinDistinctMedals,
    "allMedalCap",x.absoluteAllMedalUpperBound);
}
