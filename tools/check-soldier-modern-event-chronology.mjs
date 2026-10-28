import assert from "node:assert/strict";
import fs from "node:fs";
import {importModernSave} from "../public/soldiers/modern/save-adapter.js";
import {eventScriptVerdict,evaluateEventResearch,researchStep,replayResearchSequence}
  from "../public/soldiers/modern/event-chronology.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log("PASS "+name)};
const fake={event:"EV",script:"SC",mode:"weighted",monthWeights:[
  {month:0,weight:1,totalWeight:6},{month:4,weight:0,totalWeight:5},{month:8,weight:3,totalWeight:5}
],firstMonth:0,lastMonth:12,executionOdds:100,researchPositive:["A"],researchNegative:["B"]};
const base={month:2,researched:new Set(["A"]),disabled:new Set(),items:{},facilities:[],generatedEvents:{}};
test("replay of current month selects previous monthly table",()=>{
  const v=eventScriptVerdict(fake,base,{mode:"current"});
  assert.equal(v.weight,1);
  assert.equal(v.totalWeight,6);
  assert.equal(v.kind,"conditional","successful chance is not guaranteed");
});
test("replaced weight table blocks zero-weight event even when earlier weight exists",()=>{
  const v=eventScriptVerdict(fake,{...base,month:5},{mode:"current"});
  assert.equal(v.kind,"blocked");
  assert(v.blocked.some(x=>x.includes("가중치 0")));
});
test("future weighted path can await the later nonzero window",()=>{
  const v=eventScriptVerdict(fake,{...base,month:5},{mode:"future"});
  assert.equal(v.kind,"conditional");
  assert(v.pending.some(x=>x.includes("미래 월")));
});
test("expired event cannot be revived by later research",()=>{
  const v=eventScriptVerdict(fake,{...base,month:13},{mode:"future"});
  assert.equal(v.kind,"blocked");
  assert(v.blocked.some(x=>x.includes("종료")));
});
test("negative research is directional and can be chronological",()=>{
  const at=eventScriptVerdict(fake,{...base,researched:new Set(["A","B"])},{mode:"current"});
  assert.equal(at.kind,"blocked");
  const future=eventScriptVerdict(fake,{...base,researched:new Set(["A","B"])},{mode:"future"});
  assert.equal(future.kind,"conditional");
});
test("disabled positive research fails an established no-reenable future path",()=>{
  const v=eventScriptVerdict(fake,{...base,researched:new Set(),disabled:new Set(["A"])},
    {mode:"future",reenablers:{A:[]}});
  assert.equal(v.kind,"blocked");
});
test("one-time sequential predecessors enforced in order",()=>{
  const rule={event:"C",script:"S",mode:"oneTimeSequential",oneTimeEarlier:["A","B"],
    executionOdds:100};
  const v=eventScriptVerdict(rule,{...base,generatedEvents:{A:1}},{mode:"current"});
  assert.equal(v.kind,"blocked");
  assert(v.blocked.some(x=>x.includes("B")));
  const ready=eventScriptVerdict(rule,{...base,generatedEvents:{A:1,B:1}},{mode:"current"});
  assert.equal(ready.kind,"eligible");
});
test("one-time event cannot be generated a second time",()=>{
  const rule={event:"A",mode:"oneTimeRandom",oneTimeWeight:1,executionOdds:100};
  const v=eventScriptVerdict(rule,{...base,generatedEvents:{A:1}},{mode:"future"});
  assert.equal(v.kind,"blocked");
});
test("zero-cost event-only research cannot be silently completed in a lab",()=>{
  const st={researched:new Set(),disabled:new Set()};
  const rules={FLAG:{cost:0,requires:[],dependencies:[]}};
  assert.equal(researchStep(st,"FLAG",rules,{method:"research"}).kind,"conditional");
  assert.equal(researchStep(st,"FLAG",rules,{method:"event"}).kind,"applied");
});
test("research gift for disabled topic is rejected without checking dependency path",()=>{
  const st={researched:new Set(),disabled:new Set(["R"])};
  assert.equal(researchStep(st,"R",{R:{dependencies:["X"]}},{method:"event"}).kind,"blocked");
});
test("event gift can grant research without satisfying normal dependencies",()=>{
  const st={researched:new Set(),disabled:new Set()};
  const r={R:{dependencies:["X"],requires:["Y"]}};
  assert.equal(researchStep(st,"R",r,{method:"research"}).kind,"blocked");
  const applied=researchStep(st,"R",r,{method:"event"});
  assert.equal(applied.kind,"applied");
  assert(applied.state.researched.has("R"));
});
test("normal research respects alternative unlock instead of requiring all dependencies",()=>{
  const r={A:{dependencies:["X"]},U:{unlocks:["A"]}};
  const state={researched:new Set(["U"]),disabled:new Set()};
  assert.equal(researchStep(state,"A",r,{method:"research"}).kind,"applied");
});
test("research disables removes earlier discovery and never retroactively removes history",()=>{
  const state={researched:new Set(["A"]),disabled:new Set(),history:new Map([["T",1]])};
  const r={A:{},B:{disables:["A"]},C:{requires:["A"]}};
  const done=researchStep(state,"B",r);
  assert.equal(done.kind,"applied");
  assert(done.state.disabled.has("A"));
  assert(!done.state.researched.has("A"));
  assert.equal(done.state.history.get("T"),1);
  assert.equal(researchStep(done.state,"C",r).kind,"blocked");
});
test("reenable reopens a project but does not recover completed status",()=>{
  const r={A:{},B:{disables:["A"]},C:{reenables:["A"]}};
  const rr=replayResearchSequence(["B","C"],{researched:new Set(["A"]),disabled:new Set()},r);
  assert.equal(rr.kind,"applied");
  assert.equal(rr.state.disabled.has("A"),false);
  assert.equal(rr.state.researched.has("A"),false);
});
test("completed research re-run requires separate proof of new getOneFree",()=>{
  const state={researched:new Set(["A"]),disabled:new Set()};
  assert.equal(researchStep(state,"A",{A:{}}).kind,"blocked");
});
test("real red captain saint event requires all positives and absent captain pussy",()=>{
  const route=data.eventResearchSources.STR_CAPTAIN_SAINT.find(x=>x.event==="STR_CAPTAIN_SAINT");
  const script=route.scripts.find(x=>x.script==="STR_CAPTAIN_SAINT");
  assert(script);
  const v=eventScriptVerdict({...script,eventId:"STR_CAPTAIN_SAINT"},{
    month:6,researched:new Set(["STR_CAPTAIN_RED","STR_CAPTAIN_GREEN","STR_CAPTAIN_GRAY","STR_CAPTAIN_GOLD","STR_CAPTAINS_LOG_01"]),
    disabled:new Set(["STR_CAPTAIN_PUSSY"]),generatedEvents:{}
  },{mode:"current"});
  assert.equal(v.kind,"eligible");
  const forbidden=eventScriptVerdict({...script,eventId:"STR_CAPTAIN_SAINT"},{
    month:6,researched:new Set(["STR_CAPTAIN_RED","STR_CAPTAIN_GREEN","STR_CAPTAIN_GRAY","STR_CAPTAIN_GOLD","STR_CAPTAINS_LOG_01","STR_CAPTAIN_PUSSY"]),
    disabled:new Set(),generatedEvents:{}
  },{mode:"current"});
  assert.equal(forbidden.kind,"blocked");
});
// Optional local integration fixture; never hardcode a private campaign path.
const privateSave=process.env.XPZ_PRIVATE_SAVE_PATH;
if(privateSave&&fs.existsSync(privateSave))
test("opt-in private save event-gate consistency",()=>{
  const save=importModernSave(fs.readFileSync(privateSave,"utf8"),data);
  const r=data.eventResearchSources.STR_CAPTAIN_SAINT[0];
  const script=r.scripts[0];
  const current=eventScriptVerdict({...script,eventId:r.event},{
    month:save.monthsPassed,
    researched:new Set(save.research.completed),
    disabled:new Set(save.research.disabled),
    generatedEvents:save.generatedEvents
  },{mode:"current"});
  assert(["eligible","conditional","blocked"].includes(current.kind));
  const hasAllRequired=script.researchPositive.every(id=>
    save.research.completed.includes(id)&&!save.research.disabled.includes(id));
  if(!hasAllRequired)assert(current.kind!=="eligible",
    "missing current positive research must never be marked eligible");
});
test("real research direct payout candidate is singular, even for multi-entry list",()=>{
  const item=Object.values(data.eventResearchSources).flat().find(x=>x.choiceCount>1);
  assert(item,"expected X-Piratez multi-research event");
  assert.equal(item.resultMode,"oneRandomResearch");
  assert(item.choiceCount>1);
});
test("disabled research event is not silently treated as available",()=>{
  const st={disabled:new Set(["STR_CAPTAIN_SAINT"]),researched:new Set()};
  const v=evaluateEventResearch("STR_CAPTAIN_SAINT",data.eventResearchSources.STR_CAPTAIN_SAINT,st);
  assert.equal(v.kind,"blocked");
});
console.log(JSON.stringify({result:"PASS",tests:passed,sourceEvents:Object.keys(data.eventResearchSources).length}));
