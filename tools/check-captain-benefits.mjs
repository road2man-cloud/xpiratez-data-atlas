import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import vm from "node:vm";
import {buildChoiceIndex,computeChoiceScenario} from "../public/captains/choice-simulator-core.js";
const root="public/data/";
const index=JSON.parse(fs.readFileSync(root+"captain-benefits-index.json","utf8"));
const runtime=JSON.parse(fs.readFileSync(root+"choice-simulator-index.json","utf8"));
const byTopic=new Map(runtime.topics.map(x=>[x.id,x]));
const graph=buildChoiceIndex(runtime.topics,{inline:true,unresolvedByField:runtime.unresolvedByField});
const events=new Map();
for(const bucket of "0123456789abcdef")
  for(const event of Object.values(JSON.parse(zlib.gunzipSync(
    fs.readFileSync(root+"event-chunks/"+bucket+".json.gz"))).details||{}))
    events.set(event.id,event);
assert.equal(events.size,792);
assert.equal(index.schemaVersion,1);
assert.equal(index.meta.events,792);
assert.equal(index.rows.length,22);
const shared=index.special?.commonKnockKnock;
assert(shared,"Common events without positive captain gates must be published separately");
assert.equal(shared.scripts.length,3);
assert.deepEqual(shared.scripts.map(s=>s.id),
  ["STR_KNOCK_KNOCK_0","STR_KNOCK_KNOCK_1","STR_KNOCK_KNOCK_2"]);
assert.equal(shared.outcomes.length,index.meta.commonKnockKnockEvents);
assert.equal(shared.outcomes.length,21);
assert.deepEqual(shared.excludedResearch,["STR_CAPTAIN_SOREASS"]);
for(const script of shared.scripts){
  assert.deepEqual(script.required,[]);
  assert.deepEqual(script.forbidden,shared.excludedResearch);
  assert.equal(script.conditions.firstMonth,0);
  assert.equal(script.conditions.executionOdds,23);
}
for(const outcome of shared.outcomes){
  const source=events.get(outcome.id);
  assert(source,"Shared Knock Knock outcome missing from effective event DB: "+outcome.id);
  assert.equal((source.effects?.researchRewards||[]).length,outcome.researchRewards);
  assert.equal((source.effects?.guaranteedItems||[]).length,outcome.itemRewards);
  for(const script of shared.scripts)
    assert((source.scripts||[]).some(s=>s.id===script.id),
      "Shared event missing named script: "+outcome.id+" / "+script.id);
}
const names=new Set();
let total=0,direct=0,subsequent=0,rewards=0;
for(const row of index.rows){
  assert(!names.has(row.rowId),"Duplicate Captain: "+row.rowId);names.add(row.rowId);
  const topic=byTopic.get(row.choiceId);assert(topic,"Unknown effective Captain rule: "+row.choiceId);
  const state=computeChoiceScenario(graph,[],[...row.enteredAfter,row.choiceId]);
  assert.equal(row.commonKnockKnock?.eligible,!state.completed.has("STR_CAPTAIN_SOREASS"),
    "Incorrect common Knock Knock eligibility: "+row.rowId);
  assert.deepEqual(row.commonKnockKnock.blockers,
    state.completed.has("STR_CAPTAIN_SOREASS")?["STR_CAPTAIN_SOREASS"]:[]);
  assert.equal(row.commonKnockKnock.outcomeCount,shared.outcomes.length);
  const selfDisable=(topic.disables||[]).includes(row.choiceId);
  assert.equal(row.branchStatus,selfDisable?"self-disabled-final-flag":"stage-completed");
  assert(typeof row.eventSearch==="string");
  assert.deepEqual(row.unlocks.map(x=>x.id),topic.unlocks||[]);
  assert.deepEqual(row.directDisables.map(x=>x.id),topic.disables||[]);
  assert(!row.unlocks.some(x=>row.directDisables.some(d=>d.id===x.id&&x.status!=="disabled")),
    "Already disabled Captain unlock incorrectly marked available: "+row.rowId);
  const output=JSON.parse(fs.readFileSync(root+"captain-benefits/"+row.rowId+".json","utf8"));
  assert.equal(output.schemaVersion,1);assert.equal(output.choiceId,row.choiceId);assert.equal(output.rowId,row.rowId);
  assert.equal(row.categories.eventTotal,output.events.length);
  assert(output.events.length===new Set(output.events.map(x=>x.id)).size);
  total+=output.events.length;
  for(const e of output.events){
    const actual=events.get(e.id);assert(actual,"Unknown event: "+e.id);
    assert(row.eventSearch.includes(e.id)&&row.eventSearch.includes(e.name),
      "Source-backed event is missing from the branch-wide search index: "+row.rowId+" / "+e.id);
    if(e.reward.guaranteedTotal)assert.deepEqual(e.reward.guaranteedItems.map(x=>({id:x.id,qty:x.qty})),
      actual.effects.guaranteedItems.slice(0,5).map(x=>({id:x.id,qty:x.qty})));
    assert.equal(e.reward.guaranteedTotal,actual.effects?.guaranteedItems?.length||0);
    assert.equal(e.reward.researchTotal,actual.effects?.researchRewards?.length||0);
    assert.deepEqual(e.reward.research.map(x=>x.id),(actual.effects?.researchRewards||[]).slice(0,5).map(x=>x.id));
    assert.equal(e.reward.randomTotal,actual.effects?.randomItems?.list?.length||0);
    assert.equal(e.reward.funds,Number(actual.effects?.funds)||0);
    assert.equal(e.reward.points,Number(actual.effects?.points)||0);
    const uniquePath=new Set();
    for(const p of e.paths){
      assert(!uniquePath.has(p.id),"Duplicate event script "+e.id+"/"+p.id);
      uniquePath.add(p.id);
      const original=(actual.scripts||[]).find(x=>x.id===p.id);
      assert(original,"Non-existent script reference: "+e.id+" / "+p.id);
      const triggers=original.triggerMaps?.researchTriggers||[];
      assert.deepEqual(p.required,triggers.filter(x=>x.value===true).map(x=>x.id));
      assert.deepEqual(p.forbidden,triggers.filter(x=>x.value===false).map(x=>x.id));
      assert(p.via.length>0&&p.via.every(x=>p.required.includes(x)),
        "A candidate route must be anchored by a real positive trigger: "+e.id+"/"+p.id);
      assert.equal(p.mode,p.required.includes(row.choiceId)?"selected-branch":"subsequent-unlock");
      assert(p.required.every(id=>!state.disabled.has(id)),
        "Impossible positive gate shown as benefit after branch exclusions: "+row.rowId+" "+e.id);
      assert(p.forbidden.every(id=>!state.completed.has(id)),
        "Failed negative trigger shown as possible event: "+row.rowId+" "+e.id);
      if(p.mode==="subsequent-unlock")
        assert(p.via.some(x=>row.unlocks.some(u=>u.id===x&&u.status!=="disabled")),
          "Subsequent event has no relevant effective unlocker: "+row.rowId+" "+e.id+" "+p.id+" via "+p.via.join(","));
    }
    if(e.paths.some(x=>x.mode==="selected-branch"))direct++;
    if(e.paths.some(x=>x.mode==="subsequent-unlock"))subsequent++;
    if(e.reward.researchTotal||e.reward.guaranteedTotal||e.reward.randomTotal||e.reward.funds)rewards++;
  }
  assert.deepEqual(row.featured.map(x=>x.id),row.featured.map(x=>x.id));
}
assert.equal(total,index.meta.totalRelatedEvents);
assert(total>=500&&direct>=70&&rewards>=150);
const thief=index.rows.find(x=>x.rowId==="thief");
const priest=index.rows.find(x=>x.rowId==="priest");
const soreass=index.rows.find(x=>x.rowId==="soreass");
assert(thief&&priest&&soreass);
const captainVm={window:{}};
vm.runInNewContext(fs.readFileSync("public/captains/captain-rows.js","utf8"),captainVm);
const priestFeature=captainVm.window.CAPTAIN_ROWS.find(r=>r.id==="priest");
assert(priestFeature?.bread==="yes"&&priestFeature?.bunker==="yes",
  "Priest's visible primary perk must stay derived from bread/health training and bunker access");
assert.equal(thief.commonKnockKnock.eligible,true,"Thief wrongly denied ordinary Knock Knock");
assert.equal(priest.commonKnockKnock.eligible,true,"Priest wrongly denied ordinary Knock Knock");
assert.equal(soreass.commonKnockKnock.eligible,false,"Soreass bypassed default negative gate");
for(const row of [thief,priest]){
 const visits=JSON.parse(fs.readFileSync(root+"captain-benefits/"+row.rowId+".json","utf8")).events;
 const clone=visits.find(e=>e.id==="STR_KNOCK_KNOCK_ROGUE_CLONE");
 assert(clone?.paths.some(p=>p.required.includes("STR_CAPTAIN_DUMBLAZY")),
  "Rogue-clone visitor must be available *conditionally* after DumbLazy for "+row.rowId);
 assert(row.unlocks.some(u=>u.id==="STR_CAPTAIN_DUMBLAZY"&&u.status==="candidate"),
  "Both Thief and Priest must unlock possible DumbLazy route");
}
assert(!thief.directDisables.some(x=>x.id==="STR_CAPTAIN_DUMBLAZY"));
assert(!priest.directDisables.some(x=>x.id==="STR_CAPTAIN_DUMBLAZY"));
const thiefEvents=JSON.parse(fs.readFileSync(root+"captain-benefits/thief.json","utf8")).events;
const eleven=thiefEvents.find(x=>x.id==="STR_CAPTAINS_11");
assert(eleven,"Major Thief exclusive event must be present");
assert(eleven.paths.some(p=>p.mode==="selected-branch"&&
   ["STR_CAPTAIN_THIEF","STR_CAPTAINS_LOG_01","STR_CAPTAINS_RANK_02",
    "STR_TROPHY_GAMBLER","STR_BOUNTY_HUNTING_C_PASS"].every(x=>p.required.includes(x))&&
   p.forbidden.includes("STR_CAPTAINS_11")));
assert(eleven.reward.guaranteedItems.some(x=>x.id==="STR_CAPTAINS_11_TOKEN"&&x.qty===11));
assert(eleven.reward.research.some(x=>x.id==="STR_CAPTAINS_11"));
assert(thief.featured[0].id==="STR_CAPTAINS_11");
for(const row of index.rows.filter(x=>x.rowId!=="thief")){
 const e=JSON.parse(fs.readFileSync(root+"captain-benefits/"+row.rowId+".json","utf8")).events;
 assert(!e.some(x=>x.id==="STR_CAPTAINS_11"),"Captain's 11 leaked outside Thief: "+row.rowId);
}
const training=JSON.parse(fs.readFileSync(root+"trainings-index.json","utf8"));
const c11=training.transformations.find(x=>x.id==="STR_CAPTAINS_11");
assert(c11);
const trainingSummary=index.special.captainsElevenTraining;
assert.equal(trainingSummary.cost,100000);assert.equal(trainingSummary.time,500);
assert.deepEqual(trainingSummary.requiredItems.map(x=>({id:x.id,qty:x.qty})),
 c11.requiredItems.map(x=>({id:x.id,qty:x.amount})));
assert.equal(trainingSummary.eligibleSoldierTypes,c11.allowedSoldierTypes.length);
assert.deepEqual(trainingSummary.soldierBonus.recovery,training.bonuses.STR_CAPTAINS_11.recovery);
assert.equal(trainingSummary.soldierBonus.mana,20);
for(const path of ["app.js","benefits.js","captain-rows.js","styles.css","index.html"])
 assert.equal(fs.readFileSync("public/captains/"+path,"utf8"),
  fs.readFileSync("modules/captains/"+path,"utf8"),"Module and published page diverged: "+path);
const app=fs.readFileSync("public/captains/app.js","utf8");
const ui=fs.readFileSync("public/captains/benefits.js","utf8");
const css=fs.readFileSync("public/captains/styles.css","utf8");
assert(app.includes("CaptainBenefits?.matrixCell(r)")&&app.includes("CaptainBenefits?.renderDetail(r.id)"));
assert(ui.includes("captainsElevenMarkup")&&ui.includes("eventPath(p)")&&ui.includes("commonVisitorMarkup")&&ui.includes("직접 표시할 지급품 없음"));
assert(ui.includes('row.rowId==="priest"')&&ui.includes("건강미 훈련 · 벙커")&&
  ui.includes("sharedVisitorBadge(row)")&&ui.includes("benefit-visitor-primary")&&
  ui.includes("똑 똑(똑똑이) 방문")&&ui.includes("DumbLazy 연구 완료 후 외톨이 클론"),
  "Priest/Thief shared visitor UI must not depend on featured reward ranking");
assert(ui.includes("featuredName(indirect)")&&ui.includes("featuredName(direct)")&&
  ui.includes("STR_KNOCK_KNOCK_ROGUE_CLONE"),
  "Generic '똑 똑' headlines must distinguish each special reward");
assert(css.includes(".benefit-visitor-primary")&&css.includes(".benefit-visitor-yes"),
  "Common visitor must be visually prominent, not a tiny footnote");
assert(css.includes(".toolbar{position:static!important")&&css.includes(".captain-benefit-cell"));
console.log("OK captain benefit catalog: "+index.rows.length+" stage choices / "+events.size+" event rules / "+
  total+" candidate event associations ("+direct+" direct / "+subsequent+
  " unlock-dependent) / "+rewards+" reward-bearing / "+shared.outcomes.length+" shared Knock Knock outcomes; Captain's 11, Priest/Thief common visitor & DumbLazy, exact conditional gates, direct exclusions and mobile CSS");
