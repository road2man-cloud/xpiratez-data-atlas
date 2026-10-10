// Regression for captain branches, event sources, and special peasant profiles.
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import {initialState,evaluate} from "../public/trainings/planner.js";
import {buildChoiceIndex} from "../public/captains/choice-simulator-core.js";
import {CAPTAIN_ROUTES,createRouteContext,trainingRouteGate,routeEventReport,
  eventAvailability,checkEventScript} from "../public/trainings/route-gates.js";

const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const data=read("public/data/trainings-index.json");
const access=read("public/data/training-access.json");
const graph=buildChoiceIndex(read("public/data/progression-research.json").topics,
  read("public/data/choice-research-gates.json"));
const byId=new Map(data.transformations.map(t=>[t.id,t]));
const p=id=>data.profiles.find(x=>x.sourceId===id);
const gate=(id,route)=>trainingRouteGate(byId.get(id),createRouteContext(graph,route),access);
const info=route=>routeEventReport(createRouteContext(graph,route),access);

assert.equal(access.meta.ruleSha256,data.meta.sha256);
assert.equal(access.meta.events,792);
assert.equal(access.researchEvents.STR_CAPTAINS_11.length,1,
  "Cap11 access must come from the actual event grant, not research flag existence");
assert(access.researchEvents.STR_CAPTAINS_11[0].scripts.some(
  s=>s.researchTriggers.STR_CAPTAIN_THIEF===true&&
    s.researchTriggers.STR_TROPHY_GAMBLER===true&&
    s.researchTriggers.STR_BOUNTY_HUNTING_C_PASS===true));
assert(access.researchEvents.STR_CAPTAIN_SAINT[0].scripts.some(
  s=>s.researchTriggers.STR_CAPTAIN_PUSSY===false&&
    s.researchTriggers.STR_CAPTAIN_RED===true&&
    s.researchTriggers.STR_CAPTAIN_GREEN===true&&
    s.researchTriggers.STR_CAPTAIN_GRAY===true&&
    s.researchTriggers.STR_CAPTAIN_GOLD===true));
const rogue=access.itemEvents.STR_ROGUE_CLONE;
assert(rogue.some(x=>x.id==="STR_SAINTS_REINFORCEMENTS"&&
  x.reward.kind==="random"&&x.reward.weight===1&&x.reward.totalWeight===31));
assert(rogue.some(x=>x.id==="STR_KNOCK_KNOCK_ROGUE_CLONE"&&
  x.reward.kind==="guaranteed"&&x.scripts.length===2&&
  x.scripts.every(s=>s.researchTriggers.STR_CAPTAIN_DUMBLAZY===true)));
assert(rogue.some(e=>e.id==="STR_TROUBLESEEKING_ALLY"&&e.reward.kind==="random"&&
  e.scripts.some(s=>s.researchTriggers.STR_CAPTAIN_DUMBASS===true&&
    s.researchTriggers.STR_CAPTAIN_SAINT===true)),
  "Dumbass + Saint must retain the third Rogue source from TroubleSeeking Ally");
assert(rogue.every(e=>e.scripts.every(s=>s.eventWeights.length>0)),
  "Rogue grant source must remain a repeatable weighted event, not one-time");

for(const route of CAPTAIN_ROUTES){
  const context=createRouteContext(graph,route.id);
  assert.deepEqual(context.invalid,[],route.id+" must be a compatible sequence of captain flags");
}
const defaultRoute=createRouteContext(graph,"ANY");
assert.equal(trainingRouteGate(byId.get("STR_CAPTAINS_11"),defaultRoute,access).kind,"unselected");
assert.equal(info("THIEF").eleven.kind,"possible");
assert.equal(info("THIEF").saint.kind,"blocked");
assert.equal(info("THIEF").rogueDumbLazy.kind,"possible");
assert.equal(info("THIEF").rogueSaint.kind,"blocked");
for(const r of ["DUMBASS_SAINT","LAZYASS_SAINT"]){
  const result=info(r);
  assert.equal(result.saint.kind,"completed",r+" should have earned Saint in scenario");
  assert.equal(result.rogueSaint.kind,"possible",r+" must retain repeatable Saint Rogue draw");
  assert.equal(result.rogueDumbLazy.kind,"possible",r+" must also retain DumbLazy Rogue draw");
  if(r==="DUMBASS_SAINT")assert.equal(result.rogueTrouble.kind,"possible", "Dumbass+Saint must also have TroubleSeeking Ally Rogue chance");
  assert.equal(result.eleven.kind,"blocked",r+" cannot get Thief-only Captain's 11");
  assert.equal(gate("STR_CAPTAINS_11",r).kind,"blocked");
  assert.notEqual(gate("STR_PROUD_WARRIOR",r).kind,"blocked",
    "Proud Warrior alternate source must not be auto-excluded");
}
for(const r of ["DUMBASS","LAZYASS","SOREASS","JACKASS","PRIEST","RULER","MAGE"]){
  assert.equal(gate("STR_CAPTAINS_11",r).kind,"blocked",r+" Captain 11 route leak");
}
assert.equal(gate("STR_CAPTAINS_11","THIEF").kind,"caution",
  "Thief qualifies for the eventual grant, but trophies/rank are still required");
assert.equal(gate("STR_BREAD_AND_FISHES_TRAINING","PRIEST").kind,"possible");
assert.equal(gate("STR_BREAD_AND_FISHES_TRAINING","THIEF").kind,"blocked");
assert.equal(gate("STR_MILITARY_DRILL_TRAINING","RULER").kind,"possible");
assert.equal(gate("STR_MILITARY_DRILL_TRAINING","DUMBASS_SAINT").kind,"blocked");
assert.notEqual(gate("STR_PROUD_WARRIOR","THIEF").kind,"blocked",
  "Proud Warrior has an alternate unlock and must not become a false hard exclusion");
assert.equal(info("SOREASS").rogueDumbLazy.kind,"blocked");
assert.equal(info("THIEF").rogueTrouble.kind,"blocked");

const clone=initialState(p("STR_THEBAN_ASSAULT_CLONE"));
const rogueProfile=initialState(p("STR_ROGUE_CLONE_RECRUITMENT"));
const jungle=initialState(p("STR_JUNGLEFIGHTER_GIRL_RECRUITMENT"));
for(const state of [clone,rogueProfile]){
  for(const id of ["STR_BREAD_AND_FISHES_TRAINING","STR_REVOLUTIONARY_TRAINING",
    "STR_NIGHTSHADE_AUGMENTATION","STR_BATTLE_FORM_AUGMENTATION",
    "STR_GREEN_BEAUTY","STR_MILITARY_DRILL_TRAINING"])
    assert(evaluate(byId.get(id),state).some(x=>x.code==="forbidden"),id+" clone history bypass");
  assert.equal(evaluate(byId.get("STR_CAPTAINS_11"),state).length,0,
    "Clone history should not itself block the Thief enhancement");
}
assert(rogueProfile.prior.has("STR_CAREER_SOLDIER"));
assert.equal(evaluate(byId.get("STR_BATTLE_FORM_AUGMENTATION"),jungle).length,0,
  "Unrelated peasant acquisition history is not Theban clone history");
for(const id of ["STR_THEBAN_ASSAULT_CLONE","STR_CAREER_SOLDIER","STR_LONE_WOLF"]){
  assert(byId.get(id).requires.includes("STR_UNAVAILABLE"));
  assert(evaluate(byId.get(id),initialState({soldierType:"STR_SOLDIER_PEASANT",previousTransformations:{}}))
    .some(x=>x.code==="unavailable"),"Internal-only transformation not blocked: "+id);
}
const negative=checkEventScript(
  {researchTriggers:{STR_CAPTAIN_PUSSY:false,STR_CAPTAIN_SAINT:false},itemTriggers:{}},
  createRouteContext(graph,"THIEF"));
assert.equal(negative.kind,"blocked","Saint source must respect Pussy false event trigger");
const itemUnknown=eventAvailability(access.itemEvents.STR_ROGUE_CLONE.filter(
  e=>e.id==="STR_SAINTS_REINFORCEMENTS"),createRouteContext(graph,"DUMBASS_SAINT"));
assert(itemUnknown.eligible.some(s=>s.itemUnknown.some(x=>x.id==="STR_LIZARDMAN_STATUE")),
  "Inventory condition must remain unknown in the branch-only scenario");
assert(access.itemEvents.STR_ORTHODOX_MAGE_DAMSEL?.some(e=>
  e.id==="STR_KNOCK_KNOCK_ORTHODOX_MAGE_DAMSEL"&&
  e.scripts.some(s=>s.researchTriggers.STR_CAPTAIN_DUMBASS===true&&s.researchTriggers.STR_CAPTAIN_SAINT===true)),
  "Dumbass + Saint Orthodox Mage item grant missing");
assert(access.itemEvents.STR_ORTHODOX_MAGE_DAMSEL?.some(e=>
  e.scripts.some(s=>s.researchTriggers.STR_CAPTAIN_PUSSY_UP===true&&s.researchTriggers.STR_CAPTAIN_JACKLAZY===true)),
  "Pussy + JackLazy non-Saint Orthodox Mage source missing");
for(const r of ["DUMBASS_SAINT","LAZYASS_SAINT","JACKASS_SAINT","SOREASS_SAINT"]){
  const context=createRouteContext(graph,r);
  assert(context.state.completed.has("STR_TINY_DRILL_INVESTIGATION"),
    r+" Saint Codex must pass through Tiny Drill Investigation");
  assert(context.state.disabled.has("STR_REJECT_THE_POWER"),
    r+" Saint must lock the Reject Power / Savage Queen route");
  assert.equal(gate("STR_PARIAH_TRAINING",r).kind,"blocked",
    r+" may not combine Saint with Savage Queen's Pariah");
  assert.equal(gate("STR_CAPTAINS_11",r).kind,"blocked");
}
const savage=createRouteContext(graph,"THIEF_SAVAGE");
assert(savage.state.completed.has("STR_REJECT_THE_POWER"));
assert(savage.state.completed.has("STR_QUEEN_SAVAGE"));
assert(savage.state.disabled.has("STR_TINY_DRILL_INVESTIGATION"));
assert.notEqual(gate("STR_PARIAH_TRAINING","THIEF_SAVAGE").kind,"blocked");
assert.equal(gate("STR_BRIDES_TO_THE_QUEEN","THIEF_SAVAGE").kind,"blocked",
  "Pussy Thief Savage Queen cannot unlock Codex-awakened Brides");
assert.equal(gate("STR_HERO_GOLD_TRAINING","THIEF_SAVAGE").kind,"blocked");
assert.equal(info("THIEF").orthodoxSaint.kind,"possible",
  "Thief must have JackLazy-derived alternate Orthodox Mage event");
assert.equal(info("THIEF_SAVAGE").orthodoxSaint.kind,"possible");
assert.equal(info("DUMBASS_SAINT").orthodoxSaint.kind,"possible");
assert.equal(info("JACKASS_SAINT").orthodoxSaint.kind,"blocked");
assert.equal(info("LAZYASS_SAINT").orthodoxSaint.kind,"blocked");
assert.equal(info("PRIEST").orthodoxSaint.kind,"blocked");

const markup=fs.readFileSync("public/trainings/index.html","utf8");
const app=fs.readFileSync("public/trainings/app.js","utf8");
assert(markup.includes('id="captainRoute"')&&markup.includes('id="routeAccessSummary"'));
assert(app.includes("trainingRouteGate")&&app.includes("planWithRoute"));
console.log("OK training route gates: "+CAPTAIN_ROUTES.length+" captain profiles, all four Saint/Gray-Green-Red-Gold vs Savage rejection, Thief's 11, Pussy/JackLazy Orthodox Mage, Priest/Ruler exclusivity, 3 internal-only transforms, clone and Proud Warrior alternate unlock");
