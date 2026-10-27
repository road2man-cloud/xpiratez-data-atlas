import fs from "node:fs";
import assert from "node:assert/strict";
import {initialState} from "../public/soldiers/modern/eligibility.js";
import {verifyCampaignSequence} from "../public/soldiers/modern/campaign-proof.js";
import {searchChronologicalRoute} from "../public/soldiers/modern/route-finder.js";
import {importModernSave,modernSoldierProof} from "../public/soldiers/modern/save-adapter.js";
const actual=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const R={soldiers:[{id:"GAL",minStats:{},avgStats:{tu:45,stamina:55,health:30,bravery:50,
  reactions:45,firing:60,throwing:40,strength:30,psiStrength:40,psiSkill:0,melee:40,mana:50},
  maxStats:{},statCaps:{},allowPromotion:true}],profiles:[],bonuses:[],
  transformations:[
    {id:"T_A",allowsLiveSoldiers:true,allowedSoldierTypes:["GAL"],
      requires:["A"],requiredItems:{},requiredCommendations:{},requiredMinStats:{},cost:0},
    {id:"T_B",allowsLiveSoldiers:true,allowedSoldierTypes:["GAL"],
      requires:["B"],requiredPreviousTransformations:["T_A"],
      requiredItems:{},requiredCommendations:{},requiredMinStats:{},cost:0}
  ],
  researchRules:{A:{cost:5},B:{cost:5,disables:["A"]}},
  itemSupply:{},eventResearchSources:{},armorCatalog:[]};
const makeWorld=(data=R,options={})=>{
  const state=initialState(data,"base:GAL");
  state.exactStats=true;
  state.status="healthy";
  return {month:6,researched:new Set(),disabled:new Set(),items:{},baseFunctions:new Set(),
    facilities:[],funds:250,generatedEvents:{},evidenceComplete:true,
    soldiers:[{id:"S",state,commendations:{}}],...options};
};
const test=(name,fun)=>{fun();console.log("PASS "+name)};
test("find ordered research and two transformations without erasing old history",()=>{
  const w=makeWorld();
  const before=JSON.stringify([...w.researched]);
  const p=searchChronologicalRoute(R,w,{soldierId:"S",goals:["T_A","T_B"]});
  assert.equal(p.kind,"witness",JSON.stringify(p).slice(0,1000));
  assert.deepEqual(p.steps.map(x=>x.type+":"+(x.id||x.transform)),
    ["research:A","transform:T_A","research:B","transform:T_B"]);
  assert(p.replay.world.soldiers[0].state.history.has("T_A"));
  assert(p.replay.world.disabled.has("A"));
  assert.equal(JSON.stringify([...w.researched]),before,"search must not mutate supplied save snapshot");
  assert.equal(p.replay.kind,"ruleset-consistent");
});
test("disabled earlier research never becomes an invented viable path",()=>{
  const w=makeWorld(R,{researched:new Set(["B"]),disabled:new Set(["A"])});
  const p=searchChronologicalRoute(R,w,{soldierId:"S",goals:["T_A"],maxStates:100});
  assert.equal(p.kind,"inconclusive");
  assert(p.reason.some(x=>x.includes("영구 상호배제 증명이 아닙니다")));
});
test("clone target is excluded from same-soldier growth",()=>{
  const data={...R,transformations:[{...R.transformations[0],id:"CLONE",
    createsClone:true,requires:[]}]};
  const p=searchChronologicalRoute(data,makeWorld(data),{soldierId:"S",goals:["CLONE"]});
  assert.equal(p.kind,"excluded");
});
test("manufacturing must consume resources in the correct order",()=>{
  const t={...R.transformations[0],requiredItems:{ARMOR:2}};
  const data={...R,transformations:[t],
    itemSupply:{ARMOR:{manufacture:[{id:"MAKE_ARMOR",quantity:1,
      requiredItems:{FABRIC:2},cost:3}]}}};
  const p=searchChronologicalRoute(data,makeWorld(data,{researched:new Set(["A"]),
    items:{FABRIC:4}}),{soldierId:"S",goals:["T_A"]});
  assert.equal(p.kind,"witness",JSON.stringify(p).slice(0,1100));
  assert(p.steps.some(x=>x.type==="manufacture"&&x.count===2));
  assert.equal(p.replay.world.items.FABRIC,0);
  assert.equal(p.replay.world.items.ARMOR,0);
});
test("conditional-only event research is never elevated to exact witness",()=>{
  const data={...R,researchRules:{R:{cost:0}},
    transformations:[{...R.transformations[0],requires:["R"]}],
    eventResearchSources:{R:[{event:"EV",choiceCount:1,scripts:[{
      event:"EV",script:"SCRIPT",mode:"oneTimeRandom",oneTimeWeight:1,
      executionOdds:100,firstMonth:0,lastMonth:8
    }]}]}};
  const p=searchChronologicalRoute(data,makeWorld(data,{generatedEvents:null}),{
    soldierId:"S",goals:["T_A"],maxDepth:4});
  assert.equal(p.kind,"conditional",JSON.stringify(p).slice(0,1100));
  assert(p.steps.some(x=>x.type==="eventResearch"));
  assert(p.assumptions.some(x=>x.includes("이력")||x.includes("스케줄러")));
  assert.equal(p.replay.world.generatedEvents,null);
});
test("event already generated cannot be selected even conditionally",()=>{
  const data={...R,researchRules:{R:{cost:0}},
    transformations:[{...R.transformations[0],requires:["R"]}],
    eventResearchSources:{R:[{event:"EV",choiceCount:1,scripts:[{
      event:"EV",script:"SCRIPT",mode:"oneTimeRandom",oneTimeWeight:1,executionOdds:100
    }]}]}};
  const p=searchChronologicalRoute(data,makeWorld(data,{generatedEvents:{EV:1}}),{
    soldierId:"S",goals:["T_A"],maxDepth:4});
  assert.equal(p.kind,"inconclusive");
});
test("protected getOneFree is only available on source completion, with RNG marked",()=>{
  const data={...R,researchRules:{
    SOURCE:{cost:5,getOneFree:["A","B"]},A:{cost:0},B:{cost:0}},
    transformations:[{...R.transformations[0],requires:["B"]}]};
  const first=searchChronologicalRoute(data,makeWorld(data),{
    soldierId:"S",goals:["T_A"],maxDepth:5});
  assert.equal(first.kind,"conditional",JSON.stringify(first).slice(0,1000));
  assert(first.steps.some(x=>x.type==="freeResearch"&&x.research==="B"));
  assert(first.assumptions.some(x=>x.includes("무작위")));
  const historical=searchChronologicalRoute(data,makeWorld(data,{
    researched:new Set(["SOURCE"])}),{soldierId:"S",goals:["T_A"],maxDepth:5});
  assert.equal(historical.kind,"inconclusive",
    "completed research in save must not fabricate a pending free-research token");
});
test("search budget exhaustion never proves a path is impossible",()=>{
  const p=searchChronologicalRoute(R,makeWorld(),{
    soldierId:"S",goals:["T_A","T_B"],maxDepth:1,maxStates:10});
  assert.equal(p.kind,"inconclusive");
  assert(p.reason.some(x=>x.includes("영구 상호배제")));
});
test("incomplete base inventory never upgrades model witness to verified",()=>{
  const p=searchChronologicalRoute(R,makeWorld(R,{evidenceComplete:false}),{
    soldierId:"S",goals:["T_A"]});
  assert.equal(p.kind,"conditional");
});
const path="C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/piratez/35_.sav";
if(fs.existsSync(path)){
  const s=importModernSave(fs.readFileSync(path,"utf8"),actual);
  const proof=modernSoldierProof(actual,s,0,0);
  const stock=Object.fromEntries(proof.base.items);
  const w={month:s.monthsPassed,researched:new Set(s.research.completed),
    disabled:new Set(s.research.disabled),
    generatedEvents:s.generatedEvents,items:stock,
    baseFunctions:new Set(proof.options.baseFunctions),
    funds:s.funds,evidenceComplete:proof.base.itemsComplete&&
      proof.state.exactStats&&proof.options.medalsKnown,
    soldiers:[{id:"real",state:proof.state,commendations:proof.options.commendations}]};
  const t=actual.transformations.find(x=>x.id==="STR_BASIC_FIREARMS_TRAINING");
  const p=searchChronologicalRoute(actual,w,{soldierId:"real",
    goals:[t.id],maxDepth:6,maxStates:80,maxAttempts:1000});
  assert(["excluded","inconclusive","conditional","witness"].includes(p.kind));
  if(p.kind==="witness"){
    const replay=verifyCampaignSequence(w,p.steps,actual);
    assert.equal(replay.kind,"ruleset-consistent");
  }
  console.log("PASS actual local 35_.sav strict route search: "+p.kind+
    ", expanded "+(p.deterministic?.examined||0)+" nodes; no save content exported");
}
console.log("PASS bounded chronological witness search: 9 independent synthetic scenarios");
