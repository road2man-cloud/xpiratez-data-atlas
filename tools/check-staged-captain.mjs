import assert from "node:assert/strict";
import fs from "node:fs";
import {buildChoiceIndex} from "../public/captains/choice-simulator-core.js";
import {validateCaptainStages,buildStagedCaptainContext} from "../public/trainings/staged-captain.js";
import {trainingRouteGate,routeEventReport} from "../public/trainings/route-gates.js";
const load=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const access=load("public/data/training-access.json"),data=load("public/data/trainings-index.json");
const index=buildChoiceIndex(load("public/data/progression-research.json").topics,
  load("public/data/choice-research-gates.json"));
const stages=validateCaptainStages(index,access.captainStages);
const create=(choice=[],opts={})=>buildStagedCaptainContext(index,stages,{stages:choice,...opts});
const t=id=>data.transformations.find(x=>x.id===id);
const accessFor=(id,ctx)=>trainingRouteGate(t(id),ctx,access);
const events=ctx=>routeEventReport(ctx,access);
assert.deepEqual(stages.map(x=>x.ids.length),[5,5,7,5]);
assert.equal(new Set(stages.flatMap(x=>x.ids)).size,22);
let terminal=0;
for(let stage=0;stage<4;stage++)for(const id of stages[stage].ids){
  const choice=stage===0?[id]:stage===1?["STR_CAPTAIN_PUSSY",id]:
    stage===2?["STR_CAPTAIN_PUSSY","STR_CAPTAIN_UNCLASSED_UP",id]:
    ["STR_CAPTAIN_PUSSY","STR_CAPTAIN_UNCLASSED_UP","STR_CAPTAIN_PURE_UP",id];
  const result=create(choice);
  assert.equal(result.invalid.length,0,id+" skipped due to conflicting research disables");
  assert.equal(result.route.id,id);
  if(result.route.isTerminal)terminal++;
}
assert.equal(terminal,19);
const partial=create(["STR_CAPTAIN_PUSSY"]);
assert.equal(partial.route.isTerminal,false);
assert.equal(accessFor("STR_CAPTAINS_11",partial).kind,"caution",
  "Unchosen thief class must stay reachable from Pussy stage");
const thief=create(["STR_CAPTAIN_PUSSY","STR_CAPTAIN_THIEF"],{
  companions:["STR_CAPTAIN_DUMBLAZY","STR_CAPTAIN_JACKLAZY"],saint:true});
assert.equal(thief.saintGoal,false);
assert.equal(accessFor("STR_CAPTAINS_11",thief).kind,"caution");
assert.equal(events(thief).rogueSaint.kind,"blocked");
assert.equal(events(thief).rogueDumbLazy.kind,"possible");
assert.equal(events(thief).orthodoxSaint.kind,"possible");
assert.equal(accessFor("STR_BREAD_AND_FISHES_TRAINING",thief).kind,"blocked");
assert.equal(accessFor("STR_PROUD_WARRIOR",thief).kind!=="blocked",true);
const priest=create(["STR_CAPTAIN_PUSSY","STR_CAPTAIN_PRIEST"]);
assert.equal(accessFor("STR_BREAD_AND_FISHES_TRAINING",priest).kind,"possible");
for(const [base,codex] of [
  ["STR_CAPTAIN_DUMBASS","GRAY"],["STR_CAPTAIN_JACKASS","GREEN"],
  ["STR_CAPTAIN_LAZYASS","RED"],["STR_CAPTAIN_SOREASS","GOLD"]
]){
  const single=create([base]);
  assert.equal(single.colors.length,3);
  assert.equal(single.saintPossible,false);
  assert.equal(create([base],{saint:true}).saintGoal,false);
  const blessed=create([base],{codex,saint:true,
    companions:base==="STR_CAPTAIN_DUMBASS"?["STR_CAPTAIN_DUMBLAZY"]:[]});
  assert.equal(blessed.invalid.length,0);
  assert.equal(blessed.saintGoal,true);
  assert.equal(blessed.colors.length,4);
  assert(blessed.state.completed.has("STR_TINY_DRILL_INVESTIGATION"));
  assert(blessed.state.disabled.has("STR_REJECT_THE_POWER"));
  assert.equal(events(blessed).rogueSaint.kind,"possible");
  assert.equal(events(blessed).saint.kind,"completed");
  assert.equal(accessFor("STR_PARIAH_TRAINING",blessed).kind,"blocked");
  assert.equal(accessFor("STR_CAPTAINS_11",blessed).kind,"blocked");
  assert.equal(create([base],{codex:single.colors[0],saint:true}).saintGoal,false);
}
const dumbSaint=create(["STR_CAPTAIN_DUMBASS"],{
  codex:"GRAY",saint:true,companions:["STR_CAPTAIN_DUMBLAZY"]});
assert.equal(events(dumbSaint).rogueDumbLazy.kind,"possible");
assert.equal(events(dumbSaint).rogueTrouble.kind,"possible");
assert.equal(events(dumbSaint).orthodoxSaint.kind,"possible");
const reject=create(["STR_CAPTAIN_DUMBASS"],{
  extraFlags:["STR_REJECT_THE_POWER"],codex:"GRAY",saint:true});
assert.equal(reject.codexBlocked,true,"Reject Power must close the Codex gate");
assert.equal(reject.saintGoal,false);
assert.equal(accessFor("STR_BRIDES_TO_THE_QUEEN",reject).kind,"blocked");
assert.equal(create(["STR_CAPTAIN_DUMBASS"],{extraFlags:["STR_CAPTAIN_THIEF","STR_CAPTAINS_11"]})
  .state.completed.has("STR_CAPTAINS_11"),false,"No forged captain reward flags");
const pure=create(["STR_CAPTAIN_PUSSY","STR_CAPTAIN_UNCLASSED_UP","STR_CAPTAIN_PURE_UP","STR_CAPTAIN_RED_UP"]);
assert.equal(pure.route.isTerminal,true);
assert.equal(pure.saintPossible,false);
const html=fs.readFileSync("public/trainings/index.html","utf8");
for(const id of ["captainStage0","captainStage1","captainStage2","captainStage3","captainCompanions","captainCodex","saintMilestone","researchRouteSelectors"])
  assert(html.includes('id="'+id+'"'));
console.log("OK staged captain planner: 22 choice nodes, 19 terminal paths, conditional extra traits/Codex/Saint, Savage exclusions, Thief-only 11, Orthodox and Rogue grants");
