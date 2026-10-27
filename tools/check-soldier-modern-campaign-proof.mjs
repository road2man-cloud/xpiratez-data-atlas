import assert from "node:assert/strict";
import fs from "node:fs";
import {initialState} from "../public/soldiers/modern/eligibility.js";
import {verifyCampaignSequence} from "../public/soldiers/modern/campaign-proof.js";
const actual=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
let tests=0;
function test(label,run){run();tests++;console.log("PASS "+label)}
const synthetic={
  soldiers:[{id:"GAL",minStats:{health:1},avgStats:{health:20},maxStats:{health:50},
    allowPromotion:true,armor:null,statCaps:{}}],
  profiles:[],
  bonuses:[{id:"BONUS",stats:{firing:5}}],
  transformations:[
    {id:"T_A",allowsLiveSoldiers:true,allowedSoldierTypes:["GAL"],
      requires:["A"],requiredItems:{},requiredCommendations:{},requiredMinStats:{},
      requiredMaxStats:null,cost:0,soldierBonusType:"BONUS",flatOverallStatChange:{}},
    {id:"T_B",allowsLiveSoldiers:true,allowedSoldierTypes:["GAL"],
      requires:["B"],requiredItems:{},requiredCommendations:{},requiredMinStats:{},
      requiredMaxStats:null,cost:0,soldierBonusType:null,flatOverallStatChange:{}}
  ],
  researchRules:{A:{cost:5},B:{cost:5,disables:["A"]},C:{cost:5}},
  armorCatalog:[],itemSupply:{},researchEventSources:{}
};
function world(extra={}){
  const member=initialState(synthetic,"base:GAL");member.currentStats.health=20;member.initialStats.health=20;member.exactStats=true;
  return {month:6,researched:new Set(),disabled:new Set(),items:{},facilities:[],
    baseFunctions:new Set(),generatedEvents:{},funds:500,score:0,difficulty:0,
    soldiers:[{id:"S",state:member,commendations:{}}],...extra};
}
test("chronological research A -> transform -> research B preserves history",()=>{
  const result=verifyCampaignSequence([
    ],[],synthetic); // intentionally empty route baseline
  assert.equal(result.kind,"ruleset-consistent");
  const done=verifyCampaignSequence(world(),[
    {type:"research",id:"A"},{type:"transform",soldier:"S",transform:"T_A"},
    {type:"research",id:"B"}
  ],synthetic);
  assert.equal(done.kind,"ruleset-consistent");
  assert(done.world.disabled.has("A"));
  assert(!done.world.researched.has("A"));
  assert(done.world.soldiers[0].state.history.has("T_A"));
  assert(done.world.soldiers[0].state.bonusIds.has("BONUS"));
});
test("cannot reuse research after it is disabled by subsequent research",()=>{
  const result=verifyCampaignSequence(world(),[
    {type:"research",id:"A"},{type:"research",id:"B"},
    {type:"transform",soldier:"S",transform:"T_A"}],synthetic);
  assert.equal(result.kind,"blocked");
  assert(result.trace.at(-1).reason.some(x=>x.includes("미완료 연구")));
});
test("direct research without prerequisites stops at the first invalid step",()=>{
  const result=verifyCampaignSequence(world(),[
    {type:"research",id:"A"},{type:"research",id:"MISSING"},
    {type:"research",id:"B"}],synthetic);
  assert.equal(result.kind,"unknown");
  assert.equal(result.trace.length,2);
  assert(result.world.researched.has("A"));
});
test("one-way disable does not retroactively invalidate earlier transformations",()=>{
  const done=verifyCampaignSequence(world(),[
    {type:"research",id:"A"},{type:"transform",soldier:"S",transform:"T_A"},
    {type:"research",id:"B"},{type:"transform",soldier:"S",transform:"T_B"}],synthetic);
  assert.equal(done.kind,"ruleset-consistent");
  assert.equal(done.world.soldiers[0].state.history.size,2);
});
test("protected free research requires both researched source and guard",()=>{
  const r={...synthetic,researchRules:{...synthetic.researchRules,CODEX:{
    cost:4,needItem:true,neededItem:"CODEX",requiresBaseFunc:["CPU"],
    getOneFreeProtected:{GUARD:["DARK"]}},GUARD:{},DARK:{}}};
  const w=world({researched:new Set(["CODEX","GUARD"]),items:{CODEX:1},
    baseFunctions:new Set(["CPU"])});
  const good=verifyCampaignSequence(w,[
    {type:"freeResearch",source:"CODEX",research:"DARK"}],r);
  assert.equal(good.kind,"ruleset-consistent");
  assert(good.world.researched.has("DARK"));
  const bad=verifyCampaignSequence(world({researched:new Set(["CODEX"]),
    items:{CODEX:1},baseFunctions:new Set(["CPU"])}),[
      {type:"freeResearch",source:"CODEX",research:"DARK"}],r);
  assert.equal(bad.kind,"blocked");
});
test("event script negative research gate rejects an already chosen branch",()=>{
  const route=actual.eventResearchSources.STR_CAPTAIN_SAINT[0];
  const deps=["STR_CAPTAIN_RED","STR_CAPTAIN_GREEN","STR_CAPTAIN_GRAY",
    "STR_CAPTAIN_GOLD","STR_CAPTAINS_LOG_01"];
  const a=world({researched:new Set(deps),disabled:new Set(["STR_CAPTAIN_PUSSY"])});
  const step={type:"eventResearch",event:route.event,script:"STR_CAPTAIN_SAINT",research:"STR_CAPTAIN_SAINT"};
  const pass=verifyCampaignSequence(a,[step],actual);
  assert.equal(pass.kind,"ruleset-consistent");
  assert(pass.world.researched.has("STR_CAPTAIN_SAINT"));
  const fail=verifyCampaignSequence(world({researched:new Set([...deps,"STR_CAPTAIN_PUSSY"])}),[step],actual);
  assert.equal(fail.kind,"blocked");
});
test("event cannot directly grant a disabled research",()=>{
  const route=actual.eventResearchSources.STR_CAPTAIN_SAINT[0];
  const deps=["STR_CAPTAIN_RED","STR_CAPTAIN_GREEN","STR_CAPTAIN_GRAY",
    "STR_CAPTAIN_GOLD","STR_CAPTAINS_LOG_01"];
  const w=world({researched:new Set(deps),disabled:new Set(["STR_CAPTAIN_PUSSY","STR_CAPTAIN_SAINT"])});
  const result=verifyCampaignSequence(w,[{
    type:"eventResearch",event:route.event,script:"STR_CAPTAIN_SAINT",research:"STR_CAPTAIN_SAINT"}],actual);
  assert.equal(result.kind,"blocked");
});
test("no random outcome can be silently certified",()=>{
  const example=Object.entries(actual.eventResearchSources).flatMap(([id,events])=>
    events.flatMap(e=>e.scripts.filter(s=>s.mode==="oneTimeRandom").map(s=>({id,event:e.event,script:s.script}))))[0];
  assert(example);
  const result=verifyCampaignSequence(world(),[{
    type:"eventResearch",event:example.event,script:example.script,research:example.id}],actual);
  assert.notEqual(result.kind,"ruleset-consistent");
});
test("manufacture consumes resources and assigns only available armor to correct soldier",()=>{
  const r={...synthetic,
    itemSupply:{ARMOR:{exists:true,manufacture:[{
      id:"MAKE_ARMOR",quantity:1,requires:["A"],requiresBaseFunc:["WORK"],
      requiredItems:{FABRIC:2},cost:5}]}},
    armorCatalog:[{id:"A_ARMOR",storeItem:"ARMOR",soldierTypes:["GAL"],stats:{firing:10}}]};
  const w=world({researched:new Set(["A"]),items:{FABRIC:4},baseFunctions:new Set(["WORK"])});
  const result=verifyCampaignSequence(w,[
    {type:"manufacture",item:"ARMOR",recipe:"MAKE_ARMOR",count:2},
    {type:"equip",soldier:"S",armor:"A_ARMOR"}],r);
  assert.equal(result.kind,"ruleset-consistent");
  assert.equal(result.world.items.FABRIC,0);
  assert.equal(result.world.items.ARMOR,1);
  assert.equal(result.world.soldiers[0].state.armorId,"A_ARMOR");
});
test("insufficient materials stops manufacture before item creation",()=>{
  const r={...synthetic,itemSupply:{ARMOR:{manufacture:[{
    id:"MAKE_ARMOR",quantity:1,requiredItems:{FABRIC:2}}]}}};
  const result=verifyCampaignSequence(world({items:{FABRIC:1}}),[
    {type:"manufacture",item:"ARMOR",recipe:"MAKE_ARMOR"}],r);
  assert.equal(result.kind,"blocked");
  assert(!result.world.items.ARMOR);
});
test("time cannot be reversed to re-open expired events",()=>{
  const result=verifyCampaignSequence(world({month:12}),[{type:"advanceMonth",month:4}],synthetic);
  assert.equal(result.kind,"blocked");
});
test("wrong soldier armor cannot be equipped",()=>{
  const r={...synthetic,armorCatalog:[{id:"P_ONLY",storeItem:"ARMOR",soldierTypes:["PEASANT"]}]};
  const result=verifyCampaignSequence(world({items:{ARMOR:1}}),[
    {type:"equip",soldier:"S",armor:"P_ONLY"}],r);
  assert.equal(result.kind,"blocked");
});
console.log(JSON.stringify({result:"PASS",tests}));
