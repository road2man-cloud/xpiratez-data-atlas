import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {parseXpiratezSave} from "../public/captains/save-import-core.js";
import {
  makeResearch21Index,research21State,evaluateResearch21,applyResearch21,findResearch21
} from "../public/research/exclusivity-21.js";
const filename="public/data/research-exclusivity-21.json";
const source=JSON.parse(fs.readFileSync(filename,"utf8"));
const index=makeResearch21Index(source);
assert.equal(source.modVersion,"X-Piratez 2.1");
assert.equal(source.engineVersion,"OXCE 8.7.1");
assert(source.stats.researchCount>4600);
assert.equal(source.stats.researchCount,Object.keys(source.research).length);
assert.equal(gunzipSync(fs.readFileSync(filename+".gz")).toString("utf8"),
  fs.readFileSync(filename,"utf8"));
assert.equal(source.research.STR_CODEX_RED.getOneFreeProtected.STR_SHADOW_CHASING[0],"STR_DARK_STAR");
assert(source.research.STR_CAPTAIN_LAZYASS.disables.includes("STR_CAPTAIN_DUMBASS"));
assert(source.research.STR_EMBRACE_THE_POWER.disables.includes("STR_REJECT_THE_POWER"));
assert(source.events.some(x=>x.id==="STR_GOLD_AT_SEANS_NEW_FACES"&&
  x.researchList.includes("STR_VIP_014")&&x.researchList.length>1));
const r=(completed=[],disabled=[],monthsPassed=6)=>research21State(index,{completed,disabled,monthsPassed});
const lazy=r(["STR_CAPTAIN_LAZYASS"],source.research.STR_CAPTAIN_LAZYASS.disables);
assert.equal(evaluateResearch21(index,lazy,"STR_CAPTAIN_DUMBASS").kind,"disabled");
assert.equal(evaluateResearch21(index,lazy,"STR_CAPTAIN_PUSSY").kind,"disabled");
assert(!evaluateResearch21(index,lazy,"STR_CAPTAIN_RED").disabled);
const blocked=r(["STR_EMBRACE_THE_POWER","STR_CODEX_RED"],
  ["STR_REJECT_THE_POWER"]);
assert.equal(evaluateResearch21(index,blocked,"STR_REJECT_THE_POWER").kind,"disabled");
assert.equal(applyResearch21(index,blocked,"STR_REJECT_THE_POWER",{mode:"grant"}).ok,false);
const future=r(["STR_CODEX_RED","STR_SHADOW_CHASING"],["STR_REJECT_THE_POWER"]);
const dark=evaluateResearch21(index,future,"STR_DARK_STAR");
assert.equal(dark.kind,"grant-candidate");
const redFree=dark.free.find(x=>x.parent==="STR_CODEX_RED"&&x.guard==="STR_SHADOW_CHASING");
assert(redFree?.candidate&&redFree.targetTickets>0&&redFree.chance>0);
assert(!evaluateResearch21(index,r(["STR_CODEX_RED"]),"STR_DARK_STAR").free
  .some(x=>x.candidate));
const grant=applyResearch21(index,future,"STR_DARK_STAR",{mode:"grant",source:"STR_CODEX_RED"});
assert(grant.ok&&grant.conditional&&grant.state.completed.has("STR_DARK_STAR"));
const redRepeat=applyResearch21(index,future,"STR_CODEX_RED",{mode:"repeat"});
assert(redRepeat.ok&&redRepeat.lottery?.outcomes?.some(x=>x.id==="STR_DARK_STAR"));
const gold=evaluateResearch21(index,r(["STR_CAPTAIN_GOLD"]),"STR_VIP_014");
assert(gold.events.some(x=>x.eventId==="STR_GOLD_AT_SEANS_NEW_FACES"&&
  x.ready&&x.selectedChance>0&&x.selectedChance<1));
const redAwake=evaluateResearch21(index,r(["STR_CODEX_RED","STR_SHADOW_CHASING","STR_PSI_LAB"]),"STR_CODEX_RED_AWAKENED");
assert(redAwake.events.some(x=>x.eventId==="STR_CODEX_RED_AWAKENS"&&
  x.ready&&x.missingItems.includes("STR_CODEX_RED")));
const saint=evaluateResearch21(index,r(["STR_CAPTAIN_GREEN","STR_CAPTAIN_GRAY","STR_CAPTAIN_GOLD","STR_CAPTAINS_LOG_01"]),"STR_CAPTAIN_SAINT");
assert(saint.events.some(x=>x.eventId==="STR_CAPTAIN_SAINT"&&x.missing.includes("STR_CAPTAIN_RED")));
assert.equal(findResearch21(index,"STR_DARK_STAR")[0].id,"STR_DARK_STAR");
const mk=(id,fields={})=>({
 id,name:id,cost:1,dependencies:[],requires:[],disables:[],reenables:[],unlocks:[],
 getOneFree:[],getOneFreeProtected:{},needItem:false,neededItem:id,requiresBaseFunc:[],
 ...fields
});
const local=makeResearch21Index({
 schemaVersion:1,modVersion:"X-Piratez 2.1",
 research:{
  A:mk("A",{disables:["B"]}),B:mk("B"),C:mk("C",{reenables:["B"]}),
  EXCL:mk("EXCL",{disables:["EXCL"],unlocks:["TARGET"]}),
  TARGET:mk("TARGET",{dependencies:["B"]}),
  UNLOCK:mk("UNLOCK",{unlocks:["HARD"]}),
  HARD:mk("HARD",{dependencies:["A"],requires:["B"]}),
  EVENTBLOCKED:mk("EVENTBLOCKED")
 },
 events:[{id:"EVENT",script:"EVENT",mode:"oneTimeRandom",researchList:["EVENTBLOCKED"],
  researchPositive:["A"],researchNegative:["B"],itemPositive:[],itemNegative:[],
  facilityPositive:[],facilityNegative:[],firstMonth:0,lastMonth:8,executionOdds:50,
  otherConditions:[]}]
});
let x=research21State(local);
const a=applyResearch21(local,x,"A");
assert(a.ok&&a.state.disabled.has("B"));
assert(!applyResearch21(local,a.state,"B").ok);
const c=applyResearch21(local,a.state,"C");
assert(c.ok&&c.state.disabled.has("B")===false&&c.reenabled.includes("B"));
assert.equal(evaluateResearch21(local,c.state,"TARGET").kind,"missing-prerequisites");
const unlock=applyResearch21(local,c.state,"UNLOCK");
assert(unlock.ok);
assert.equal(evaluateResearch21(local,unlock.state,"HARD").kind,"missing-prerequisites");
const b=applyResearch21(local,unlock.state,"B");
assert(b.ok);
assert.equal(evaluateResearch21(local,b.state,"HARD").kind,"ready");
const self=applyResearch21(local,research21State(local),"EXCL");
assert(self.ok&&!self.state.completed.has("EXCL")&&self.state.disabled.has("EXCL"));
assert.equal(evaluateResearch21(local,self.state,"TARGET").unlockedBy.length,0);
const ev=evaluateResearch21(local,a.state,"EVENTBLOCKED").events[0];
assert(ev.ready&&ev.oneTimeUnverified&&ev.conditional);
const evExpired=evaluateResearch21(local,research21State(local,{completed:["A"],monthsPassed:9}),"EVENTBLOCKED").events[0];
assert(evExpired.expired&&!evExpired.ready);
const evNegative=evaluateResearch21(local,research21State(local,{completed:["A","B"],monthsPassed:4}),"EVENTBLOCKED").events[0];
assert(evNegative.forbidden.includes("B")&&!evNegative.ready);
const savedArg=process.argv.indexOf("--save");
if(savedArg>=0){
  const p=process.argv[savedArg+1];
  const parsed=parseXpiratezSave(fs.readFileSync(p,"utf8"),index.choice);
  const actual=research21State(index,{completed:parsed.completed,disabled:parsed.disabled});
  assert(actual.completed.has("STR_CAPTAIN_LAZYASS"));
  assert(actual.disabled.has("STR_CAPTAIN_DUMBASS"));
  assert(actual.disabled.has("STR_REJECT_THE_POWER"));
  assert.equal(evaluateResearch21(index,actual,"STR_REJECT_THE_POWER").kind,"disabled");
  console.log("Actual local-save state validated without copying the save:",parsed.completed.length,"completed,",parsed.disabled.length,"disabled");
}
const html=fs.readFileSync("public/research/index.html","utf8");
assert(html.includes("id=\"researchExclusivity21\"")&&html.includes("./exclusivity-21-ui.js"));
assert(fs.readFileSync("public/research/exclusivity-21-ui.js","utf8").includes("parseXpiratezSave"));
console.log("[research-21-exclusivity] OK",source.stats.researchCount,
  "research,",source.stats.disableEdges,"disables,",source.stats.protectedSources,
  "protected grantors,",source.stats.scriptedEventPaths,"scripted event paths; save/privacy and time-order scenarios");
