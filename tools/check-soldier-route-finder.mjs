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
// Private saves are never checked in or tied to a developer's absolute path.
// Explicitly request a strict local replay with:
//   XPIRATEZ_SAVE_PATH=<private path> XPIRATEZ_REQUIRE_SAVE=1 node tools/check-soldier-route-finder.mjs
// Missing evidence must be visible, not silently treated as a passed save test.
const savePath=process.env.XPIRATEZ_SAVE_PATH||"";
const requireSave=process.env.XPIRATEZ_REQUIRE_SAVE==="1";
if(!savePath||!fs.existsSync(savePath)){
  if(requireSave)throw new Error("Required local campaign save unavailable: set XPIRATEZ_SAVE_PATH to an existing .sav file");
  console.log("SKIP local campaign save: XPIRATEZ_SAVE_PATH missing or inaccessible (synthetic tests still ran)");
}else{
  const s=importModernSave(fs.readFileSync(savePath,"utf8"),actual);
  const goal="STR_BASIC_FIREARMS_TRAINING";
  assert(actual.transformations.some(x=>x.id===goal),"missing target training rule");
  let tested=0;
  const categories=[
    {label:"STR_SOLDIER",matches:x=>x.type==="STR_SOLDIER"},
    {label:"STR_SOLDIER_PEASANT (origin unproven)",
      matches:x=>x.type==="STR_SOLDIER_PEASANT"},
    {label:"HALF_UBER_PEASANT (history + bonus confirmed)",
      matches:x=>x.type==="STR_SOLDIER_PEASANT"&&
        Number(x.previousTransformations?.STR_UBERIZATION)>0&&
        Number(x.transformationBonuses?.STR_HALF_UBER)>0}
  ];
  for(const category of categories){
    let choice=null;
    for(let baseIndex=0;baseIndex<s.personnel.bases.length&&!choice;baseIndex++){
      const soldierIndex=s.personnel.bases[baseIndex].soldiers
        .findIndex(category.matches);
      if(soldierIndex>=0)choice=modernSoldierProof(actual,s,baseIndex,soldierIndex);
    }
    if(choice?.kind!=="proof"){
      console.log("SKIP local save "+category.label+": no matching, fully identified station unit");
      continue;
    }
    const w={month:s.monthsPassed,researched:new Set(s.research.completed),
      disabled:new Set(s.research.disabled),generatedEvents:s.generatedEvents,
      items:Object.fromEntries(choice.base.items),
      activeResearch:choice.base.researchComplete?
        new Set(choice.base.researchProjects):null,
      baseFunctions:new Set(choice.options.baseFunctions),funds:s.funds,
      // Unknown country/region base functions and future RNG cannot certify
      // a real-game final ability, even when a structural witness is found.
      autoZeroEvidence:false,evidenceComplete:false,
      soldiers:[{id:"selected",state:choice.state,
        commendations:choice.options.commendations}]};
    const p=searchChronologicalRoute(actual,w,{soldierId:"selected",
      goals:[goal],maxDepth:6,maxStates:80,maxAttempts:1000});
    assert(["excluded","inconclusive","conditional","witness"].includes(p.kind));
    if(p.kind==="witness"){
      const replay=verifyCampaignSequence(w,p.steps,actual);
      assert.equal(replay.kind,"ruleset-consistent");
    }
    tested++;
    console.log("PASS private campaign "+category.label+": "+p.kind+
      "; examined "+(p.deterministic?.examined||0)+
      "; active research "+(choice.base.researchComplete?"known":"unknown")+
      "; personal save content not exported");
  }
  if(requireSave)assert(tested>0,"required save contains no supported Gal or Peasant sample");
  console.log("Local campaign samples checked: "+tested+" (never substituted for a named baseline)");
}
console.log("PASS bounded chronological witness search: 9 independent synthetic scenarios");
