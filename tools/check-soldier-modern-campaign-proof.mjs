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
test("automatic zero-cost flags require explicit complete base evidence and stay conditional",()=>{
  const data={...synthetic,researchRules:{
    SOURCE:{cost:5,unlocks:["PROTECTED"]},GUARD:{cost:5},
    PROTECTED:{cost:0,requires:["GUARD"],dependencies:["OTHER"]},
    SAMPLE:{cost:0,dependencies:["SOURCE"],needItem:true,neededItem:"SPECIMEN"}
  }};
  const base=world({researched:new Set(["GUARD"]),items:{SPECIMEN:1}});
  const without=verifyCampaignSequence(base,[{type:"research",id:"SOURCE"}],data);
  assert(!without.world.researched.has("PROTECTED"));
  const withEvidence=verifyCampaignSequence(world({researched:new Set(["GUARD"]),
    items:{SPECIMEN:1},activeResearch:new Set(),autoZeroEvidence:true}),
    [{type:"research",id:"SOURCE"}],data);
  assert.equal(withEvidence.kind,"conditional");
  assert(withEvidence.world.researched.has("PROTECTED"));
  assert(withEvidence.world.researched.has("SAMPLE"));
  const missingSample=verifyCampaignSequence(world({researched:new Set(["GUARD"]),
    items:{},activeResearch:new Set(),autoZeroEvidence:true}),
    [{type:"research",id:"SOURCE"}],data);
  assert(!missingSample.world.researched.has("SAMPLE"));
  const unknownProjects=verifyCampaignSequence(world({researched:new Set(["GUARD"]),
    items:{SPECIMEN:1},autoZeroEvidence:true}),
    [{type:"research",id:"SOURCE"}],data);
  assert(!unknownProjects.world.researched.has("PROTECTED"));
});
test("reenabled zero-cost topic is evaluated from the source's pre-completion state",()=>{
  const data={...synthetic,researchRules:{
    SOURCE:{cost:5,reenables:["Z"]},
    Z:{cost:0,dependencies:["SOURCE"]}
  }};
  const result=verifyCampaignSequence(world({disabled:new Set(["Z"]),
    activeResearch:new Set(),autoZeroEvidence:true}),
    [{type:"research",id:"SOURCE"}],data);
  assert.equal(result.kind,"conditional");
  assert(result.world.researched.has("Z"));
  assert(!result.world.disabled.has("Z"));
});
test("queued-but-disabled discovery stays separate from usable research",()=>{
  const data={...synthetic,researchRules:{
    A:{cost:5},B:{cost:0,dependencies:["A"],disables:["C"]},
    C:{cost:0,dependencies:["A"]}
  }};
  const done=verifyCampaignSequence(world({activeResearch:new Set(),autoZeroEvidence:true}),
    [{type:"research",id:"A"}],data);
  assert.equal(done.kind,"conditional");
  assert(done.world.researched.has("C"));
  assert(done.world.disabled.has("C"));
  assert(done.trace[0].notes.some(s=>s.includes("C")&&s.includes("폐쇄")));
});
test("base lab getOneFree resolves BEFORE the source and its auto cascade",()=>{
  const data={...synthetic,researchRules:{
    SOURCE:{cost:5,getOneFree:["GIFT"]},
    ZERO:{cost:0,dependencies:["SOURCE"],disables:["GIFT"]},GIFT:{cost:5}
  }};
  const start=world({activeResearch:new Set(),autoZeroEvidence:true});
  const pending=verifyCampaignSequence(start,[{type:"research",id:"SOURCE"}],data);
  assert.equal(pending.kind,"conditional");
  assert.equal(pending.world.pendingFree.phase,"before-source");
  assert(!pending.world.researched.has("SOURCE"));
  const done=verifyCampaignSequence(start,[{type:"research",id:"SOURCE"},
    {type:"freeResearch",source:"SOURCE",research:"GIFT"}],data);
  assert.equal(done.kind,"conditional");
  assert(done.world.researched.has("SOURCE"));
  assert(done.world.researched.has("ZERO"));
  assert(done.world.disabled.has("GIFT"));
  assert.equal(done.world.pendingFree,null);
});
test("base source cannot claim newly opened protected free award retroactively",()=>{
  const data={...synthetic,researchRules:{
    SOURCE:{cost:5,getOneFreeProtected:{GUARD:["GIFT"]}},
    GUARD:{cost:0,dependencies:["SOURCE"]},GIFT:{cost:5}
  }};
  const start=world({activeResearch:new Set(),autoZeroEvidence:true});
  const done=verifyCampaignSequence(start,[{type:"research",id:"SOURCE"}],data);
  assert.equal(done.kind,"conditional");
  assert(done.world.researched.has("GUARD"));
  assert.equal(done.world.pendingFree,null);
  const invalid=verifyCampaignSequence(start,[{type:"research",id:"SOURCE"},
    {type:"freeResearch",source:"SOURCE",research:"GIFT"}],data);
  assert.equal(invalid.kind,"blocked");
});
test("event research grants protected free AFTER its zero-cost cascade",()=>{
  const data={...synthetic,researchRules:{
    SOURCE:{cost:5,getOneFreeProtected:{GUARD:["GIFT"]}},
    GUARD:{cost:0,dependencies:["SOURCE"]},GIFT:{cost:5}
  },eventResearchSources:{SOURCE:[{event:"E",choiceCount:1,scripts:[{
    script:"E",mode:"fixed",firstMonth:0,executionOdds:100}]}]}};
  const start=world({activeResearch:new Set(),autoZeroEvidence:true});
  const steps=[{type:"eventResearch",event:"E",script:"E",research:"SOURCE",assumeOutcome:true},
    {type:"freeResearch",source:"SOURCE",research:"GIFT"}];
  const done=verifyCampaignSequence(start,steps,data);
  assert.equal(done.kind,"conditional");
  assert(done.world.researched.has("GUARD"));
  assert(done.world.researched.has("GIFT"));
});
test("auto-zero discoveries with getOneFree never auto-award the RNG reward",()=>{
  const data={...synthetic,researchRules:{
    SOURCE:{cost:5},ZERO:{cost:0,dependencies:["SOURCE"],
      getOneFree:["RANDOM_A","RANDOM_B"]},
    RANDOM_A:{cost:5},RANDOM_B:{cost:5}
  }};
  const done=verifyCampaignSequence(world({activeResearch:new Set(),autoZeroEvidence:true}),
    [{type:"research",id:"SOURCE"}],data);
  assert.equal(done.kind,"conditional");
  assert(done.world.researched.has("ZERO"));
  assert(!done.world.researched.has("RANDOM_A"));
  assert(!done.world.researched.has("RANDOM_B"));
  assert.equal(done.world.pendingFree,null);
  assert(done.trace[0].notes.some(s=>s.includes("getOneFree")&&s.includes("추첨하지")));
});
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
  const w=world({researched:new Set(["GUARD"]),items:{CODEX:1},
    baseFunctions:new Set(["CPU"])});
  const good=verifyCampaignSequence(w,[
    {type:"research",id:"CODEX"},
    {type:"freeResearch",source:"CODEX",research:"DARK"}],r);
  assert.equal(good.kind,"ruleset-consistent");
  assert(good.world.researched.has("DARK"));
  const bad=verifyCampaignSequence(world({items:{CODEX:1},
    baseFunctions:new Set(["CPU"])}),[
      {type:"research",id:"CODEX"},
      {type:"freeResearch",source:"CODEX",research:"DARK"}],r);
  assert.equal(bad.kind,"blocked");
  // A reward from a research already completed in the save has no token.
  const historical=verifyCampaignSequence(world({researched:new Set(["CODEX","GUARD"])}),[
    {type:"freeResearch",source:"CODEX",research:"DARK"}],r);
  assert.equal(historical.kind,"blocked");
  const expired=verifyCampaignSequence(w,[
    {type:"research",id:"CODEX"},{type:"research",id:"C"},
    {type:"freeResearch",source:"CODEX",research:"DARK"}],r);
  assert.equal(expired.kind,"blocked");
  const repeated=verifyCampaignSequence(w,[
    {type:"research",id:"CODEX"},
    {type:"freeResearch",source:"CODEX",research:"DARK"},
    {type:"freeResearch",source:"CODEX",research:"DARK"}],r);
  assert.equal(repeated.kind,"blocked");
});
test("event script negative research gate rejects an already chosen branch",()=>{
  const route=actual.eventResearchSources.STR_CAPTAIN_SAINT[0];
  const deps=["STR_CAPTAIN_RED","STR_CAPTAIN_GREEN","STR_CAPTAIN_GRAY",
    "STR_CAPTAIN_GOLD","STR_CAPTAINS_LOG_01"];
  const a=world({researched:new Set(deps),disabled:new Set(["STR_CAPTAIN_PUSSY"])});
  const step={type:"eventResearch",event:route.event,script:"STR_CAPTAIN_SAINT",research:"STR_CAPTAIN_SAINT",assumeOutcome:true};
  const pass=verifyCampaignSequence(a,[step],actual);
  assert.equal(pass.kind,"conditional","Even a triggered event is not guaranteed to occur in future");
  const missingAssumption=verifyCampaignSequence(a,[{...step,assumeOutcome:false}],actual);
  assert.equal(missingAssumption.kind,"conditional");
  assert(!missingAssumption.world.researched.has("STR_CAPTAIN_SAINT"));
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
test("clone transformation is not a continuation of the same soldier",()=>{
  const r={...synthetic,transformations:[{
    id:"CLONE",createsClone:true,allowsLiveSoldiers:true,
    allowedSoldierTypes:["GAL"],requiredItems:{},
    requiredCommendations:{},requiredMinStats:{},requiredMaxStats:null,cost:0
  }]};
  const result=verifyCampaignSequence(world(),[
    {type:"transform",soldier:"S",transform:"CLONE"}],r);
  assert.equal(result.kind,"blocked");
  assert(!result.world.soldiers[0].state.history.has("CLONE"));
});
test("free grant is selected at source completion, not after its guard appeared",()=>{
  const r={...synthetic,researchRules:{CODEX:{getOneFreeProtected:{GUARD:["DARK"]}},
    GUARD:{},DARK:{}}};
  const result=verifyCampaignSequence(world(),[
    {type:"research",id:"CODEX"},{type:"research",id:"GUARD"},
    {type:"freeResearch",source:"CODEX",research:"DARK"}],r);
  assert.equal(result.kind,"blocked");
});
test("even deterministic event triggers are still conditional on event scheduler",()=>{
  const route=actual.eventResearchSources.STR_CAPTAIN_SAINT[0];
  const deps=["STR_CAPTAIN_RED","STR_CAPTAIN_GREEN","STR_CAPTAIN_GRAY",
    "STR_CAPTAIN_GOLD","STR_CAPTAINS_LOG_01"];
  const w=world({researched:new Set(deps),disabled:new Set(["STR_CAPTAIN_PUSSY"]),
    generatedEvents:null});
  const step={type:"eventResearch",event:route.event,script:"STR_CAPTAIN_SAINT",
    research:"STR_CAPTAIN_SAINT"};
  const missing=verifyCampaignSequence(w,[step],actual);
  assert.equal(missing.kind,"conditional");
  const assumed=verifyCampaignSequence(w,[{...step,assumeOutcome:true}],actual);
  assert.equal(assumed.kind,"conditional");
  assert(assumed.world.researched.has("STR_CAPTAIN_SAINT"));
  assert.equal(assumed.world.generatedEvents,null,
    "unknown historical event list must not be replaced by a falsely complete map");
});
test("wrong soldier armor cannot be equipped",()=>{
  const r={...synthetic,armorCatalog:[{id:"P_ONLY",storeItem:"ARMOR",soldierTypes:["PEASANT"]}]};
  const result=verifyCampaignSequence(world({items:{ARMOR:1}}),[
    {type:"equip",soldier:"S",armor:"P_ONLY"}],r);
  assert.equal(result.kind,"blocked");
});
console.log(JSON.stringify({result:"PASS",tests}));
