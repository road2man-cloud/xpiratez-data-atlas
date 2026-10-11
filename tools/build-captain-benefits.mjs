// Effective-rules-derived Captain branch payoff provenance.
// Lists *candidate routes*, not guaranteed events or automatic research awards.
import fs from "node:fs";
import zlib from "node:zlib";
import vm from "node:vm";
import assert from "node:assert/strict";
import {buildChoiceIndex,computeChoiceScenario} from "../public/captains/choice-simulator-core.js";

const dataDir="public/data";
const captainSrc=fs.readFileSync("public/captains/captain-rows.js","utf8");
const context={window:{}};
vm.runInNewContext(captainSrc,context,{timeout:1200});
const rows=context.window.CAPTAIN_ROWS;
const runtime=JSON.parse(fs.readFileSync(dataDir+"/choice-simulator-index.json","utf8"));
const index=buildChoiceIndex(runtime.topics,{inline:true,unresolvedByField:runtime.unresolvedByField});
const byId=index.byId;
const training=JSON.parse(fs.readFileSync(dataDir+"/trainings-index.json","utf8"));
const c11=training.transformations.find(t=>t.id==="STR_CAPTAINS_11");
const c11bonus=training.bonuses.STR_CAPTAINS_11;
const ids=xs=>Array.isArray(xs)?xs:[];
const label=id=>{const name=byId.get(id)?.koName;return name&&name!==id?name:id};
const eventDetails=[];
for(const bucket of "0123456789abcdef"){
  const file=dataDir+"/event-chunks/"+bucket+".json.gz";
  const contents=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  eventDetails.push(...Object.values(contents.details||{}));
}
assert.equal(eventDetails.length,792,"Event corpus changed: update output and tests");

// Captain branch comparisons must not omit events with zero positive research
// triggers: those are shared/global opportunities, NOT branch-specific perks.
// The ordinary Knock Knock family is a particularly important example.
const commonKnockScriptIds=["STR_KNOCK_KNOCK_0","STR_KNOCK_KNOCK_1","STR_KNOCK_KNOCK_2"];
const commonKnockScripts=new Map();
const commonKnockOutcomes=[];
for(const event of eventDetails){
  const matching=ids(event.scripts).filter(s=>commonKnockScriptIds.includes(s.id));
  if(!matching.length)continue;
  commonKnockOutcomes.push({
    id:event.id,name:event.koName||event.id,
    researchRewards:ids(event.effects?.researchRewards).length,
    itemRewards:ids(event.effects?.guaranteedItems).length
  });
  for(const s of matching){
    const triggers=ids(s.triggerMaps?.researchTriggers);
    const positive=triggers.filter(t=>t.value===true).map(t=>t.id);
    const forbidden=triggers.filter(t=>t.value===false).map(t=>t.id);
    assert.deepEqual(positive,[],"Common Knock Knock must have no positive research prerequisites: "+s.id);
    assert.deepEqual(forbidden,["STR_CAPTAIN_SOREASS"],
      "Common Knock Knock exclusions changed: "+s.id+" / "+event.id);
    const value={id:s.id,required:positive,forbidden,conditions:s.conditions||{}};
    if(commonKnockScripts.has(s.id))
      assert.deepEqual(value,commonKnockScripts.get(s.id),"Common visitor gates differ: "+s.id);
    else commonKnockScripts.set(s.id,value);
  }
}
assert.equal(commonKnockScripts.size,3,"Missing default Knock Knock script");
assert(commonKnockOutcomes.length>=8,"Expected distinct global Knock Knock visitors");
const commonKnock={
  scripts:commonKnockScriptIds.map(id=>commonKnockScripts.get(id)),
  outcomes:commonKnockOutcomes.sort((a,b)=>a.id.localeCompare(b.id)),
  excludedResearch:["STR_CAPTAIN_SOREASS"]
};

const prefixes={
  initial:[],class:["STR_CAPTAIN_PUSSY","STR_CAPTAIN_PUSSY_UP"],
  unclassed:["STR_CAPTAIN_PUSSY","STR_CAPTAIN_PUSSY_UP","STR_CAPTAIN_UNCLASSED_UP","STR_CAPTAIN_UNCLASSED"],
  pure:["STR_CAPTAIN_PUSSY","STR_CAPTAIN_PUSSY_UP","STR_CAPTAIN_UNCLASSED_UP","STR_CAPTAIN_UNCLASSED",
    "STR_CAPTAIN_PURE_UP","STR_CAPTAIN_PURE"]
};
function choiceId(row){return "STR_CAPTAIN_"+row.code}
function eventRewards(event) {
  const e=event.effects||{};
  return {
    research:ids(e.researchRewards).map(x=>({id:x.id,name:x.koName||label(x.id)})),
    guaranteedItems:ids(e.guaranteedItems).map(x=>({id:x.id,name:x.koName||x.id,qty:x.qty})),
    randomItems:ids(e.randomItems?.list).map(x=>({id:x.id,name:x.koName||x.id,weight:x.weight,totalWeight:e.randomItems?.totalWeight})),
    randomBundles:ids(e.randomItems?.multi).map(x=>({index:x.index,items:ids(x.items).map(y=>({id:y.id,name:y.koName||y.id,qty:y.qty}))})),
    funds:Number(e.funds)||0,points:Number(e.points)||0,
    spawnedPersonType:e.spawnedPersonType||null,
    spawnedPersons:e.spawnedPersons||null,
    spawnedSoldier:e.spawnedSoldier||null
  };
}
function score(e){
  const out=e.reward;
  const feature={"STR_CAPTAINS_11":1000,"STR_KNOCK_KNOCK_ROGUE_CLONE":900,
    "STR_KNOCK_KNOCK_ORTHODOX_MAGE_DAMSEL":890,"STR_SAINTS_REINFORCEMENTS":850,
    "STR_CAPTAIN_ULTIMATE_EVENT":840};
  return (feature[e.id]||0)+(out.research.length?100:0)+
    out.guaranteedItems.length*20+out.randomItems.length*7+
    (out.funds>0?55:0)+(out.points>0?15:0)+
    (out.spawnedPersonType||out.spawnedSoldier?70:0);
}
function scriptsFor(event,roots,canBeCompleted,state){
  const result=[];
  for(const script of event.scripts||[]){
    const triggers=ids(script.triggerMaps?.researchTriggers);
    const trueReq=triggers.filter(x=>x.value===true).map(x=>x.id);
    const falseReq=triggers.filter(x=>x.value===false).map(x=>x.id);
    const matches=trueReq.filter(x=>canBeCompleted.has(x));
    if(!matches.length)continue;
    // A script requiring an already-disabled flag cannot fire on this captain path.
    if(trueReq.some(id=>state.disabled.has(id)))continue;
    if(falseReq.some(id=>state.completed.has(id)))continue;
    // These are exclusive stage-entry facts, not free-floating research IDs.
    // PUSSY_UP requires the Pussy stage; Saint's own event demands Pussy=false.
    if(trueReq.includes("STR_CAPTAIN_PUSSY_UP")&&!state.completed.has("STR_CAPTAIN_PUSSY"))continue;
    if(trueReq.includes("STR_CAPTAIN_SAINT")&&state.completed.has("STR_CAPTAIN_PUSSY"))continue;
    if(trueReq.includes("STR_CAPTAIN_UNCLASSED")&&!state.completed.has("STR_CAPTAIN_UNCLASSED_UP"))continue;
    if(trueReq.includes("STR_CAPTAIN_PURE")&&!state.completed.has("STR_CAPTAIN_PURE_UP"))continue;
    if(trueReq.some(id=>trueReq.some(peer=>peer!==id&&ids(byId.get(id)?.disables).includes(peer))))continue;
    result.push({
      id:script.id,
      mode:matches.includes(roots)?"selected-branch":"subsequent-unlock",
      via:matches,
      required:trueReq,
      forbidden:falseReq,
      requiredItems:ids(script.triggerMaps?.itemTriggers).map(x=>({id:x.id,value:x.value})),
      otherTriggerKinds:Object.keys(script.triggerMaps||{}).filter(x=>
        x!=="researchTriggers"&&x!=="itemTriggers"&&ids(script.triggerMaps[x]).length>0),
      conditions:script.conditions||{},
      eventWeights:ids(script.eventWeights).flatMap(x=>ids(x.entries)
        .filter(entry=>entry.eventId===event.id)
        .map(entry=>({weight:entry.weight,totalWeight:x.totalWeight,bucket:x.bucket}))),
      oneTimeRandom:ids(script.oneTimeRandomEvents?.entries).some(x=>x.eventId===event.id),
      oneTimeSequential:ids(script.oneTimeSequentialEvents).includes(event.id)
    });
  }
  return result;
}
const featuredTrain={
  id:c11.id,koName:c11.koName,enName:c11.enName,
  cost:c11.cost,time:c11.transferTime,
  requiredItems:c11.requiredItems.map(x=>({id:x.id,name:x.koName,qty:x.amount})),
  eligibleSoldierTypes:c11.allowedSoldierTypes.length,
  soldierBonus:{...c11bonus.stats,recovery:c11bonus.recovery,frontArmor:c11bonus.frontArmor,sideArmor:c11bonus.sideArmor}
};
const stageIds=new Set(rows.map(choiceId));
assert.equal(rows.length,22);assert.equal(stageIds.size,22);
for(const id of stageIds)assert(byId.has(id),"Unrecognized captain choice: "+id);
const result=[];
for(const row of rows){
  const id=choiceId(row),topic=byId.get(id);
  const applied=computeChoiceScenario(index,[],[...prefixes[row.stage],id]);
  // Some final choice topics disable their own discovered flag; this is NOT a
  // persistent unlocked-by source, even if the rule declares unlocks.
  const selfDisabled=ids(topic.disables).includes(id);
  const unlocked=ids(topic.unlocks).map(x=>({id:x,name:label(x),status:applied.disabled.has(x)?"disabled":"candidate"}));
  const anchors=new Set([id,...unlocked.filter(x=>x.status!=="disabled").map(x=>x.id)]);
  if(selfDisabled)for(const entry of unlocked)anchors.delete(entry.id);
  const events=[];
  for(const event of eventDetails){
    const paths=scriptsFor(event,id,anchors,applied);
    if(!paths.length)continue;
    const reward=eventRewards(event);
    events.push({id:event.id,name:event.koName||event.id,roles:ids(event.roles),
      reward,paths,score:0});
  }
  for(const e of events)e.score=score(e);
  events.sort((a,b)=>b.score-a.score||
    (b.paths.some(p=>p.mode==="selected-branch")?1:0)-(a.paths.some(p=>p.mode==="selected-branch")?1:0)||
    a.id.localeCompare(b.id));
  result.push({
    choiceId:id,rowId:row.id,stage:row.stage,
    branchStatus:applied.disabled.has(id)?"self-disabled-final-flag":"stage-completed",
    enteredAfter:prefixes[row.stage],
    commonKnockKnock:{eligible:!applied.completed.has("STR_CAPTAIN_SOREASS"),
      blockers:commonKnock.excludedResearch.filter(x=>applied.completed.has(x)),
      outcomeCount:commonKnockOutcomes.length},
    unlocks:unlocked,
    directDisables:ids(topic.disables).map(x=>({id:x,name:label(x)})),
    events,
    categories:{
      eventTotal:events.length,
      directEvents:events.filter(e=>e.paths.some(p=>p.mode==="selected-branch")).length,
      downstreamEvents:events.filter(e=>e.paths.some(p=>p.mode==="subsequent-unlock")).length,
      rewardEvents:events.filter(e=>e.reward.research.length||e.reward.guaranteedItems.length||
        e.reward.randomItems.length||e.reward.randomBundles.length||e.reward.funds>0||
        e.reward.spawnedPersons||e.reward.spawnedSoldier).length
    }
  });
}
const slimReward=reward=>({
  research:reward.research.slice(0,5),researchTotal:reward.research.length,
  guaranteedItems:reward.guaranteedItems.slice(0,5),guaranteedTotal:reward.guaranteedItems.length,
  randomItems:reward.randomItems.slice(0,3),randomTotal:reward.randomItems.length,
  randomBundles:reward.randomBundles.slice(0,2),randomBundleTotal:reward.randomBundles.length,
  funds:reward.funds,points:reward.points,
  spawnedPersonType:reward.spawnedPersonType,spawnedPersons:reward.spawnedPersons,spawnedSoldier:reward.spawnedSoldier
});
const compactEvents=result.map(row=>{
  const events=row.events.map(e=>({id:e.id,name:e.name,roles:e.roles,
    reward:slimReward(e.reward),paths:e.paths.map(p=>({id:p.id,mode:p.mode,via:p.via,
      required:p.required,forbidden:p.forbidden,requiredItems:p.requiredItems,
      otherTriggerKinds:p.otherTriggerKinds,conditions:p.conditions,
      eventWeights:p.eventWeights,oneTimeRandom:p.oneTimeRandom,oneTimeSequential:p.oneTimeSequential}))}));
  const path=dataDir+"/captain-benefits/"+row.rowId+".json";
  fs.mkdirSync(dataDir+"/captain-benefits",{recursive:true});
  fs.writeFileSync(path,JSON.stringify({schemaVersion:1,choiceId:row.choiceId,rowId:row.rowId,events}));
  return {rowId:row.rowId,choiceId:row.choiceId,
    eventSearch:events.map(e=>e.id+" "+e.name).join(" "),
    featured:row.events.slice(0,3).map(e=>({id:e.id,name:e.name,
      route:e.paths.some(p=>p.mode==="selected-branch")?"selected-branch":"subsequent-unlock",
      researchCount:e.reward.research.length,itemCount:e.reward.guaranteedItems.length,
      funds:e.reward.funds})),
    eventCount:events.length};
});
// Codex god bonuses are event gates, not eight exclusive captain branches.
// G7 has three weighted outcomes, including the dangerous third outcome.
const godBonusRe=/^STR_CODEX_BONUS_G([1-8])([ABC]?)$/;
const godRewardEvents=eventDetails.filter(e=>godBonusRe.test(e.id));
assert.equal(godRewardEvents.length,14,"Codex G1-G8 outcome count changed");
const godRewards=godRewardEvents.map(e=>{
  const [,ordinal,variant]=e.id.match(godBonusRe);
  const script=ids(e.scripts).find(s=>ids(s.eventWeights).some(w=>
    ids(w.entries).some(x=>x.eventId===e.id)));
  assert(script,"Missing direct G reward script for "+e.id);
  const triggers=ids(script.triggerMaps?.researchTriggers);
  const needed=triggers.filter(x=>x.value===true);
  const excluded=triggers.filter(x=>x.value===false);
  const items=ids(script.triggerMaps?.itemTriggers);
  assert(excluded.some(x=>x.id==="STR_CAPTAIN_SAINT")&&
    needed.some(x=>x.id==="STR_GODS_E"+ordinal),"Missing god or Saint gate: "+e.id);
  assert.equal(script.conditions?.executionOdds,23,"Changed executionOdds: "+e.id);
  const captain=needed.find(x=>/^STR_CAPTAIN_(DUMBLAZY|SOREDUMB|JACKSORE|JACKLAZY)$/.test(x.id));
  const codex=items.find(x=>/^STR_CODEX_(GOLD|GREEN|RED|GRAY)$/.test(x.id)&&x.value===true);
  assert(codex,"Missing retained Codex item: "+e.id);
  const weights=ids(script.eventWeights).flatMap(x=>ids(x.entries)
    .filter(w=>w.eventId===e.id)
    .map(w=>({weight:w.weight,totalWeight:x.totalWeight,bucket:x.bucket})));
  assert.equal(weights.length,1,"Unexpected outcome weight count: "+e.id);
  return {
    id:e.id,group:"G"+ordinal,variant:variant||null,
    name:e.koName||e.id,scriptId:script.id,roles:ids(e.roles),
    captainTrait:captain?.id||null,codexItem:codex.id,
    requiredResearch:needed.map(x=>({id:x.id,name:x.koName||label(x.id)})),
    forbiddenResearch:excluded.map(x=>({id:x.id,name:x.koName||label(x.id)})),
    requiredItems:items.map(x=>({id:x.id,name:x.koName||label(x.id),value:x.value})),
    odds:script.conditions.executionOdds,weight:weights[0],
    reward:slimReward(eventRewards(e))
  };
}).sort((a,b)=>Number(a.group.slice(1))-Number(b.group.slice(1))||
  (a.variant||"").localeCompare(b.variant||""));
assert.equal(new Set(godRewards.map(x=>x.group)).size,8,"G1-G8 coverage changed");
const godRewardCandidates=row=>godRewards
  .filter(g=>!g.captainTrait||row.events.some(e=>e.id===g.id))
  .map(g=>g.id);
const output={schemaVersion:1,meta:{captains:22,events:eventDetails.length,
  totalRelatedEvents:result.reduce((n,x)=>n+x.events.length,0),
  source:"Official effective research + event scripts; conditional candidate routes, not earned rewards",
  captainElevenEvent:"STR_CAPTAINS_11",commonKnockKnockEvents:commonKnockOutcomes.length,
  codexGodOutcomes:godRewards.length},
  special:{captainsElevenTraining:featuredTrain,commonKnockKnock:commonKnock,godRewards},
  rows:result.map((r,i)=>({...r,events:undefined,eventSearch:compactEvents[i].eventSearch,
    featured:compactEvents[i].featured,godRewardCandidates:godRewardCandidates(r)}))};
const thief=result.find(x=>x.rowId==="thief");
assert(thief?.events.some(e=>e.id==="STR_CAPTAINS_11"&&e.paths.some(x=>x.mode==="selected-branch")));
const jackpot=thief.events.find(e=>e.id==="STR_CAPTAINS_11");
assert(jackpot?.reward.guaranteedItems.some(x=>x.id==="STR_CAPTAINS_11_TOKEN"&&x.qty===11));
assert(jackpot?.paths.some(x=>["STR_CAPTAINS_LOG_01","STR_CAPTAINS_RANK_02","STR_TROPHY_GAMBLER","STR_BOUNTY_HUNTING_C_PASS"].every(g=>x.required.includes(g))));
const nonThief=result.filter(x=>x.rowId!=="thief");
assert(!result.find(x=>x.rowId==="jackass")?.events.some(e=>e.id==="STR_KNOCK_KNOCK_ORTHODOX_MAGE_DAMSEL"),
  "Non-Pussy captain cannot take the Pussy+JackLazy Orthodox Mage event");
assert(nonThief.every(x=>!x.events.some(e=>e.id==="STR_CAPTAINS_11")),
  "Captain's 11 was incorrectly exposed as another captain's branch perk");
const file=dataDir+"/captain-benefits-index.json";
fs.writeFileSync(file,JSON.stringify(output));
console.log("Built "+file+" "+(fs.statSync(file).size/1024).toFixed(1)+" KiB plus 22 on-demand event detail chunks");
console.log("Captain choices "+result.length+"; source events "+
  result.reduce((n,x)=>n+x.events.length,0)+
  "; direct "+result.reduce((n,x)=>n+x.categories.directEvents,0)+
  "; unlock-dependent "+result.reduce((n,x)=>n+x.categories.downstreamEvents,0));
for(const row of result)console.log("BENEFIT "+row.rowId+": "+row.events.length+
  " events / "+row.unlocks.length+" unlock candidates / "+row.directDisables.length+" disables; leaders "+
  row.events.slice(0,5).map(e=>e.id).join(", "));
