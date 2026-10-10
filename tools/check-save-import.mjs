import assert from "node:assert/strict";
import fs from "node:fs";
import {buildChoiceIndex,computeChoiceScenario,choiceStatus} from "../public/captains/choice-simulator-core.js";
import {parseXpiratezSave} from "../public/captains/save-import-core.js";

const topics=JSON.parse(fs.readFileSync("public/data/progression-research.json","utf8")).topics;
const graph=buildChoiceIndex(topics);
const yaml=[
"---","name: \"44.sav\"","mods:","  - piratez ver: o1.1.1","time:","  day: 29","  month: 1",
"---","difficulty: 3","funds: 123456","bases:","  - name: Hidden Base",
"    research:","      - project: STR_CAPTAIN_LAZYASS",
"discovered:","  - STR_GDX_012","  - STR_CAPTAIN_SOREASS","  - STR_UNKNOWN_CUSTOM",
"researchRuleStatus:","  STR_TEC_169: 2","  STR_GDX_013: 2",
"  STR_GDX_018: 3","  STR_UNKNOWN_BLOCK: 2",
"researchDiary:",
"  - {date: [2601, 1, 17], name: STR_GDX_012, sourceType: 0, sourceName: Pirate Base}",
"  - {date: [2601, 1, 29], name: STR_TEC_168, sourceType: 4, sourceName: STR_AURORA_EVENT}",
"  - {date: [2601, 1, 29], name: STR_UNKNOWN_CUSTOM, sourceType: 2, sourceName: STR_GDX_012}",
"poppedResearch:","  - STR_GDX_016",
"---","battleGame:","  turn: 8"
].join("\n")+"\n";
const parsed=parseXpiratezSave(yaml,graph);
assert.deepEqual(parsed.completed,["STR_GDX_012","STR_CAPTAIN_SOREASS"]);
assert.deepEqual(parsed.disabled,["STR_TEC_169","STR_GDX_013"]);
assert.deepEqual(parsed.unknownCompleted,["STR_UNKNOWN_CUSTOM"]);
assert.deepEqual(parsed.unknownDisabled,["STR_UNKNOWN_BLOCK"]);
assert.equal(parsed.overlaps.length,0);
assert.equal(parsed.meta.rawCompleted,3);
assert.equal(parsed.meta.rawStatuses,4);
assert.equal(parsed.warnings.length,2);
assert.equal(parsed.diary.length,2);
assert.equal(parsed.unknownDiaryCount,1);
assert.equal(parsed.unparsedDiaryCount,0);
assert.equal(parsed.meta.rawDiary,3);
assert.equal(parsed.diary[0].year,2601);
assert.equal(parsed.diary[0].sourceType,0);
assert.equal(parsed.diary[1].sourceType,4);
assert.equal(parsed.disableCauses.find(x=>x.id==="STR_TEC_169")?.source.id,"STR_TEC_168");
assert.equal(parsed.disableCauses.find(x=>x.id==="STR_GDX_013")?.source.id,"STR_TEC_168");
assert.equal(parsed.lostChoices.length,0);
assert.equal(parsed.completed.includes("STR_CAPTAIN_LAZYASS"),false);
assert.equal(parsed.completed.includes("STR_GDX_016"),false);
const snapshot=computeChoiceScenario(graph,parsed.completed,[],{snapshot:true,disabledIds:parsed.disabled});
assert.equal(choiceStatus(graph,snapshot,"STR_GDX_012").kind,"completed");
assert.equal(choiceStatus(graph,snapshot,"STR_GDX_013").fromSave,true);
assert.equal(choiceStatus(graph,snapshot,"STR_TEC_169").kind,"blocked");
assert.notEqual(choiceStatus(graph,snapshot,"STR_GDX_018").kind,"blocked");
const advanced=computeChoiceScenario(graph,parsed.completed,["STR_TEC_168"],{snapshot:true,disabledIds:parsed.disabled});
assert.equal(choiceStatus(graph,advanced,"STR_GDX_012").kind,"blocked");
assert.equal(advanced.erased[0].by,"STR_TEC_168");
assert.equal(advanced.completed.has("STR_GDX_012"),false);
assert.equal(advanced.disabled.has("STR_GDX_012"),true);
const flow=parseXpiratezSave([
"name: Old Save","---","difficulty: 1",
"discovered: [STR_CAPTAIN_JACKASS, \"STR_CUNNING\"]",
"researchRuleStatus: {STR_CAPTAIN_DUMBASS: 2, STR_CAPTAIN_SOREASS: 3}"
].join("\n")+"\n",graph);
assert.deepEqual(flow.completed,["STR_CAPTAIN_JACKASS","STR_CUNNING"]);
assert.deepEqual(flow.disabled,["STR_CAPTAIN_DUMBASS"]);
const empty=parseXpiratezSave(["name: Fresh","---","difficulty: 0","funds: 1000","researchRuleStatus: {}"].join("\n"),graph);
assert.deepEqual(empty.completed,[]);
assert.deepEqual(empty.disabled,[]);
assert.ok(empty.warnings.some(x=>x.includes("비어")));
for(const sample of [
  "arbitrary text / not a save",
  ["name: Not a saved game","---","discovered:","  - STR_CAPTAIN_JACKASS"].join("\n"),
  ["name: Hello","---","difficulty: 1","discovered:","  - unsafe value here"].join("\n"),
  ["name: Hello","---","difficulty: 1","researchRuleStatus:","  STR_HOTEL: two"].join("\n")
])assert.throws(()=>parseXpiratezSave(sample,graph));
assert.throws(()=>parseXpiratezSave(["name: Hello","---","difficulty: 1","discovered: [STR_GDX_012]","discovered: [STR_GDX_013]"].join("\n"),graph),/중복/);
const historicalSave=parseXpiratezSave([
"name: Prior Branch","---","difficulty: 1",
"discovered: [STR_TEC_168]","researchRuleStatus: {STR_GDX_012: 2}",
"researchDiary:",
"  - {date: [2601, 1, 17], name: STR_GDX_012, sourceType: 0, sourceName: Pirate Base}",
"  - {date: [2601, 1, 29], name: STR_TEC_168, sourceType: 4, sourceName: STR_AURORA_EVENT}"
].join("\n")+"\n",graph);
assert.equal(historicalSave.lostChoices.length,1);
assert.equal(historicalSave.lostChoices[0].id,"STR_GDX_012");
assert.equal(historicalSave.disableCauses[0].source.id,"STR_TEC_168");
const blockDiary=parseXpiratezSave([
"name: Block diary","---","difficulty: 1","discovered: [STR_TEC_168]",
"researchRuleStatus: {STR_GDX_012: 2}","researchDiary:",
"  - date: [2601, 1, 29]","    name: STR_TEC_168","    sourceType: 3","    sourceName: STR_AURORA_MISSION"
].join("\n")+"\n",graph);
assert.equal(blockDiary.diary.length,1);
assert.equal(blockDiary.diary[0].sourceType,3);
assert.equal(blockDiary.disableCauses[0].source.id,"STR_TEC_168");
const malformedDiary=parseXpiratezSave([
"name: Bad diary","---","difficulty: 1","discovered: [STR_GDX_012]",
"researchDiary:","  - {date: [what], name: STR_GDX_012, sourceType: 0}"
].join("\n")+"\n",graph);
assert.equal(malformedDiary.unparsedDiaryCount,1);
assert.equal(malformedDiary.completed[0],"STR_GDX_012");
assert.throws(()=>parseXpiratezSave(yaml+"\0",graph));
assert.throws(()=>parseXpiratezSave(yaml+"\uFFFD",graph));
console.log("OK .sav import: root-only discovered/status, OXCE flow/block researchDiary with date/sourceType, corroborated historical disable candidates, malformed diary isolation");
