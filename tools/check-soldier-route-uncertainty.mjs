// Additional temporal and probabilistic search regression tests.
import assert from "node:assert/strict";
import {initialState} from "../public/soldiers/modern/eligibility.js";
import {searchChronologicalRoute} from "../public/soldiers/modern/route-finder.js";
import {verifyCampaignSequence} from "../public/soldiers/modern/campaign-proof.js";
const base={
  soldiers:[{id:"GAL",minStats:{health:10},avgStats:{health:30,firing:50},
    maxStats:{health:80},statCaps:{},allowPromotion:true}],
  profiles:[],bonuses:[],armorCatalog:[],
  researchRules:{R:{cost:0}},
  transformations:[{id:"T",allowedSoldierTypes:["GAL"],
    allowsLiveSoldiers:true,requires:["R"],requiredItems:{},
    requiredCommendations:{},requiredMinStats:{},cost:0}],
  itemSupply:{},eventResearchSources:{}
};
function world(data=base,overrides={}){
  const st=initialState(data,"base:GAL");
  st.exactStats=true;st.status="healthy";
  return {month:3,researched:new Set(),disabled:new Set(),funds:200,
    baseFunctions:new Set(),generatedEvents:{},items:{},evidenceComplete:true,
    soldiers:[{id:"S",state:st,commendations:{}}],...overrides};
}
function eq(name,condition){assert(condition,name);console.log("PASS "+name)}
function eventData(script){
  return {...base,eventResearchSources:{R:[{
    event:"EVENT",choiceCount:1,scripts:[{script:"ONE",executionOdds:100,...script}]
  }]}};
}
{
  const data=eventData({mode:"oneTimeRandom",oneTimeWeight:1,firstMonth:8,lastMonth:10});
  const start=world(data);
  const result=searchChronologicalRoute(data,start,{
    soldierId:"S",goals:["T"],maxDepth:5,maxStates:70,maxAttempts:800});
  eq("events can be considered in a later month without claiming certainty",
    result.kind==="conditional"&&result.steps?.some(x=>x.type==="advanceMonth"&&x.month===8)&&
    result.steps?.some(x=>x.type==="eventResearch")&&
    result.assumptions.some(s=>s.includes("기지 비용")));
  eq("conditional month action is chronological and replays through core rules",
    result.replay.kind==="conditional"&&result.replay.world.month===8);
  eq("search never mutates source save month",start.month===3);
}
{
  const data=eventData({mode:"weighted",monthWeights:[
    {month:0,weight:1,totalWeight:6},
    {month:4,weight:0,totalWeight:6},
    {month:9,weight:2,totalWeight:6}],
    firstMonth:0,lastMonth:11});
  const result=searchChronologicalRoute(data,world(data,{month:6}),{
    soldierId:"S",goals:["T"],maxDepth:5,maxStates:90,maxAttempts:1000});
  eq("weighted event zero-month gap advances only to next positive window",
    result.kind==="conditional"&&
    result.steps?.some(x=>x.type==="advanceMonth"&&x.month===9));
}
{
  const data=eventData({mode:"weighted",monthWeights:[
    {month:0,weight:1,totalWeight:6},
    {month:4,weight:0,totalWeight:6},
    {month:9,weight:2,totalWeight:6}],
    firstMonth:0,lastMonth:7});
  const result=searchChronologicalRoute(data,world(data,{month:6}),{
    soldierId:"S",goals:["T"],maxDepth:5,maxStates:90,maxAttempts:1000});
  eq("expired zero-weight event does not revive after the last month",
    result.kind==="inconclusive"&&!result.steps);
}
{
  const data={...base,researchRules:{A:{cost:5}},
    transformations:[{...base.transformations[0],requires:["A"],requiredItems:{PRIZE:2}}],
    itemSupply:{PRIZE:{randomManufacture:[{id:"OPEN_BOX",count:2,
      weight:1,weightTotal:34,requires:["A"],requiredItems:{BOX:1}}]}}};
  const start=world(data,{researched:new Set(["A"]),items:{BOX:1}});
  const conditional=searchChronologicalRoute(data,start,{soldierId:"S",goals:["T"],
    maxDepth:5,maxStates:60,maxAttempts:500});
  eq("random manufacture may supply required material only as conditional witness",
    conditional.kind==="conditional"&&
    conditional.steps?.some(x=>x.type==="manufacture"&&x.assumeOutcome===true&&
      x.recipe==="OPEN_BOX"&&x.weight===1&&x.weightTotal===34));
  eq("random manufacturer consumes real ingredients on replay",
    conditional.replay.world.items.BOX===0&&conditional.replay.world.items.PRIZE===0);
  const strict=searchChronologicalRoute(data,start,{soldierId:"S",goals:["T"],
    includeConditional:false,maxDepth:5,maxStates:60});
  eq("strict mode never promotes random manufacture to exact",
    strict.kind==="inconclusive");
  const missing=searchChronologicalRoute(data,world(data,{
    researched:new Set(["A"]),items:{}}),{soldierId:"S",goals:["T"],maxDepth:5});
  eq("missing lootbox cannot be silently fabricated by probabilistic reward",
    missing.kind==="inconclusive");
}
{
  const data={...base,researchRules:{A:{cost:5}},
    transformations:[{...base.transformations[0],requires:["A"],requiredItems:{PRIZE:2}}],
    itemSupply:{PRIZE:{randomManufacture:[
      {id:"OPEN_BOX",count:1,weight:1,weightTotal:10,
        requires:["A"],requiredItems:{BOX:1}},
      {id:"OPEN_BOX",count:3,weight:2,weightTotal:10,
        requires:["A"],requiredItems:{BOX:1}}
    ]}}};
  const result=searchChronologicalRoute(data,world(data,{
    researched:new Set(["A"]),items:{BOX:1}}),{
    soldierId:"S",goals:["T"],maxDepth:5,maxStates:60});
  eq("same recipe with multiple payout rows must not guess a variant",
    result.kind==="inconclusive"&&result.pools.ambiguousRandomRecipes===1&&
    result.sourceComplete===false);
}
{
  const data={...base,researchRules:{A:{cost:5}},
    transformations:[{...base.transformations[0],requires:["A"]}]};
  const result=searchChronologicalRoute(data,world(data,{
    researched:new Set(["A"])}),{soldierId:"S",goals:["T","T"],maxDepth:4});
  eq("repeated transformation goals are not silently deduplicated",
    result.kind==="witness"&&result.steps.filter(s=>s.type==="transform").length===2&&
    result.replay.world.soldiers[0].state.history.get("T")===2);
}
console.log("PASS time-window and random-acquisition route safety regressions");
