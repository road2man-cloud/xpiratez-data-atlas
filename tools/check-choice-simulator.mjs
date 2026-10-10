import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildChoiceIndex, choiceLabel, computeChoiceScenario, choiceStatus,
  choiceImpact, parseCompletedResearch
} from "../public/captains/choice-simulator-core.js";

const topics=JSON.parse(fs.readFileSync("public/data/progression-research.json","utf8")).topics;
const graph=buildChoiceIndex(topics);
assert.equal(graph.topics.length,4612);
assert.equal(graph.byId.size,4612);
const rules=(id)=>graph.byId.get(id);
const scenario=(prior=[],steps=[],options={})=>computeChoiceScenario(graph,prior,steps,options);
const status=(state,id)=>choiceStatus(graph,state,id);
const chosen=(state,id)=>state.completed.has(id);
const blocked=(state,id)=>status(state,id).kind==="blocked";

const base=scenario();
assert.equal(base.completed.size,0);
assert.notEqual(status(base,"STR_CAPTAIN_JACKASS").kind,"blocked");
assert.equal(status(base,"STR_CAPTAIN_DUMBASS").kind!=="blocked",true);
assert.equal(status(base,"NO_SUCH_TOPIC").kind,"unknown");

const jack=scenario([],["STR_CAPTAIN_JACKASS"]);
assert.equal(blocked(jack,"STR_CAPTAIN_DUMBASS"),true);
assert.equal(blocked(jack,"STR_CAPTAIN_PUSSY"),true);
assert.equal(blocked(jack,"STR_HOTEL"),true);
assert.equal(chosen(jack,"STR_CAPTAIN_JACKASS"),true);
assert.equal(status(jack,"STR_HOTEL").blockers[0],"STR_CAPTAIN_JACKASS");

const rejected=scenario([],["STR_CAPTAIN_JACKASS","STR_CAPTAIN_DUMBASS"]);
assert.deepEqual(rejected.steps,["STR_CAPTAIN_JACKASS"]);
assert.equal(rejected.skipped.length,1);
assert.equal(rejected.skipped[0].kind,"blocked");

const reOrdered=scenario([],["STR_CAPTAIN_DUMBASS","STR_CAPTAIN_JACKASS"]);
assert.deepEqual(reOrdered.steps,["STR_CAPTAIN_DUMBASS"]);
const oneWayFirst=scenario([],["STR_HOTEL","STR_CAPTAIN_JACKASS"]);
assert.deepEqual(oneWayFirst.steps,["STR_HOTEL","STR_CAPTAIN_JACKASS"]);
assert.equal(status(oneWayFirst,"STR_HOTEL").kind,"blocked");
assert.equal(oneWayFirst.erased.some(x=>x.id==="STR_HOTEL"&&x.by==="STR_CAPTAIN_JACKASS"),true);
assert.equal(chosen(oneWayFirst,"STR_HOTEL"),false);
assert.deepEqual(status(oneWayFirst,"STR_HOTEL").blockers,["STR_CAPTAIN_JACKASS"]);
assert.equal(rules("STR_HOTEL").disables.includes("STR_CAPTAIN_JACKASS"),false);

const pastConflict=scenario(["STR_CAPTAIN_JACKASS","STR_CAPTAIN_DUMBASS"]);
assert.equal(pastConflict.past.length,2);
assert.equal(pastConflict.priorConflicts.length,2);
assert.equal(pastConflict.skipped.length,0);
assert.equal(status(pastConflict,"STR_CAPTAIN_DUMBASS").kind,"completed");

const codex=scenario([],["STR_CHOOSE_GOLD_QUERY"]);
for(const color of ["GREEN","RED","GRAY"])
  assert.equal(blocked(codex,"STR_CHOOSE_"+color+"_QUERY"),true);
const noCodexBlocked=scenario();
for(const color of ["GREEN","RED","GRAY"])
  assert.equal(blocked(noCodexBlocked,"STR_CHOOSE_"+color+"_QUERY"),false);
for(const color of ["GREEN","RED","GRAY"])
  assert.equal(rules("STR_CODEX_"+color+"_EXP").disables.some(x=>x.endsWith("_EXP")),false);

const rejectPower=scenario([],["STR_REJECT_THE_POWER"]);
assert.equal(blocked(rejectPower,"STR_TINY_DRILL_INVESTIGATION"),true);
assert.equal(status(rejectPower,"STR_CHOOSE_GOLD_QUERY").kind,"path-risk");
assert.equal(status(rejectPower,"STR_CHOOSE_GOLD_QUERY").nominal.missing,"STR_TINY_DRILL_INVESTIGATION");
const embracePower=scenario([],["STR_EMBRACE_THE_POWER"]);
assert.notEqual(status(embracePower,"STR_TINY_DRILL_INVESTIGATION").kind,"blocked");

const docThenAurora=scenario([],["STR_GDX_012","STR_TEC_168","STR_GDX_018"]);
assert.deepEqual(docThenAurora.steps,["STR_GDX_012","STR_TEC_168","STR_GDX_018"]);
assert.equal(status(docThenAurora,"STR_GDX_012").kind,"blocked");
assert.equal(docThenAurora.erased.some(x=>x.id==="STR_GDX_012"&&x.by==="STR_TEC_168"),true);
assert.equal(status(docThenAurora,"STR_GDX_012").blockers.includes("STR_TEC_168"),true);
assert.equal(status(docThenAurora,"STR_GDX_018").kind,"completed");

const auroraThenDoc=scenario([],["STR_TEC_168","STR_GDX_012"]);
assert.equal(auroraThenDoc.steps.length,1);
assert.equal(auroraThenDoc.skipped[0].kind,"blocked");
assert.equal(status(auroraThenDoc,"STR_GDX_012").blockers[0],"STR_TEC_168");
assert.equal(status(auroraThenDoc,"STR_GDX_018").kind,"pending");
const route169=scenario([],["STR_TEC_169"]);
assert.equal(blocked(route169,"STR_GDX_018"),true);
assert.equal(blocked(route169,"STR_TEC_178"),true);

const savedDoctor=scenario(["STR_GDX_012"],["STR_TEC_168"]);
assert.equal(savedDoctor.past.length,1);
assert.deepEqual(savedDoctor.steps,["STR_TEC_168"]);
assert.equal(status(savedDoctor,"STR_GDX_012").kind,"blocked");
assert.equal(savedDoctor.erased[0].origin,"past");

const impact=choiceImpact(graph,scenario(),"STR_TEC_168",[
  "STR_GDX_012","STR_GDX_013","STR_GDX_014","STR_GDX_015","STR_GDX_016","STR_GDX_017"]);
assert.equal(impact.newSurface.length,6);
assert.equal(impact.newDirect.length,7);
assert.equal(choiceImpact(graph,scenario(["STR_GDX_012"]),"STR_TEC_168").alreadyCompleted.length,1);
assert.equal(impact.alreadyCompleted.length,0);
assert.equal(scenario().completed.size,0);

const snapshot=scenario(["STR_GDX_012"],[],{snapshot:true,disabledIds:["STR_TEC_169","STR_GDX_013"]});
assert.equal(chosen(snapshot,"STR_GDX_012"),true);
assert.equal(status(snapshot,"STR_GDX_013").kind,"blocked");
assert.equal(status(snapshot,"STR_GDX_013").fromSave,true);
assert.equal(status(snapshot,"STR_GDX_014").kind!=="blocked",true);
assert.equal(snapshot.priorConflicts.length,0);
const snapshotNext=scenario(["STR_GDX_012"],["STR_TEC_168"],{snapshot:true,disabledIds:["STR_TEC_169"]});
assert.equal(status(snapshotNext,"STR_GDX_012").kind,"blocked");
assert.equal(snapshotNext.erased.length,1);
const synthetic=buildChoiceIndex([
  {id:"A",disables:[{id:"B"}],reenables:[]},
  {id:"B",disables:[],reenables:[{id:"A"}]},
  {id:"C",disables:[],reenables:[{id:"B"}]}
]);
const reenable=computeChoiceScenario(synthetic,[],["A","C","B"]);
assert.deepEqual(reenable.steps,["A","C","B"]);
assert.equal(reenable.disabled.has("B"),false);
assert.equal(reenable.disabled.has("A"),false);
const parsed=parseCompletedResearch(graph,"STR_CAPTAIN_SOREASS, STR_TEC_168\nSTR_TEC_168 INVALID_ID");
assert.deepEqual(parsed.ids,["STR_CAPTAIN_SOREASS","STR_TEC_168"]);
assert.deepEqual(parsed.unknown,["INVALID_ID"]);
assert.equal(parsed.malformed,false);
assert.deepEqual(parseCompletedResearch(graph,'{"completed":["STR_CAPTAIN_JACKASS"]}').ids,["STR_CAPTAIN_JACKASS"]);
assert.equal(parseCompletedResearch(graph,'{"completed":[42]}').malformed,false);
assert.equal(parseCompletedResearch(graph,'{"foo":["STR_CAPTAIN_JACKASS"]}').malformed,true);
assert.equal(parseCompletedResearch(graph,'{"completed":').malformed,true);
assert.equal(choiceLabel(graph,"STR_CAPTAIN_JACKASS").length>0,true);

for(const file of ["choice-simulator.js","choice-simulator-core.js","save-import-core.js","app.js","extra-choices.js","index.html","styles.css"]){
  assert.equal(
    fs.readFileSync("public/captains/"+file,"utf8"),
    fs.readFileSync("modules/captains/"+file,"utf8"),
    "Module and public choice simulator mirrors differ: "+file
  );
}
const html=fs.readFileSync("public/captains/index.html","utf8");
for(const token of ["id=\"choiceSimulator\"","id=\"choiceScenarioBlocked\"","type=\"module\" src=\"choice-simulator.js"]){
  assert(html.includes(token),"Missing simulator UI token "+token);
}
console.log("OK chronological choices: 4612 topics; retroactive un-research, save status=2, reenables, directional exclusions, undo and mirrored UI");
