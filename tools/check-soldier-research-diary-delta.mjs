import assert from "node:assert/strict";
import fs from "node:fs";
import {compareResearchDiarySnapshots} from "./research-diary-delta.mjs";
import {importModernSave} from "../public/soldiers/modern/save-adapter.js";
const data={researchRules:{
  OLD:{cost:5},SOURCE:{cost:10},ZERO:{cost:0,dependencies:["SOURCE"]}
},baseFacilityFunctions:{},transformations:[],soldiers:[]};
const event=(id,sourceType=0,sourceName="",day=25)=>({
  id,sourceType,sourceName,year:2601,month:7,day
});
const base=(items={})=>({items:new Map(Object.entries(items)),
  researchProjects:new Set(),itemsComplete:true,
  researchComplete:true,facilitiesComplete:true,facilities:[]});
const before={
  monthsPassed:6,
  research:{completed:["OLD"],disabled:[],diary:[event("OLD",0,"",24)],
    unparsedDiaryCount:0,unknownDiaryCount:0},
  personnel:{bases:[base()]}
};
const after={
  monthsPassed:6,
  research:{completed:["OLD","SOURCE","ZERO"],disabled:[],
    diary:[...before.research.diary,event("SOURCE"),event("ZERO",2,"SOURCE")],
    unparsedDiaryCount:0,unknownDiaryCount:0},
  personnel:{bases:[base()]}
};
const observe=(b=before,a=after,rules=data)=>compareResearchDiarySnapshots(rules,b,a);
const same=observe();
assert.equal(same.kind,"observed-diary-prefix");
assert.equal(same.oldDiaryCount,1);
assert.equal(same.newDiaryCount,3);
assert.deepEqual(same.newCompleted,["SOURCE","ZERO"]);
assert.equal(same.observedAutomatic.length,1);
assert.equal(same.observedAutomatic[0].verdict,"observed-free-after");
assert.equal(same.observedAutomatic[0].model,"candidate-consistent");
assert.deepEqual(same.observedAutomatic[0].candidateModelBases,[0]);
assert.equal(same.diaryPrefix,true);
assert(!JSON.stringify(same).includes("path"));
assert.equal(observe(before,{...after,monthsPassed:5}).kind,"unverified");
assert.equal(observe(before,{...after,research:{
  ...after.research,diary:[event("WRONG",0,"",24),...after.research.diary.slice(1)]
}}).kind,"unverified");
assert.equal(observe({...before,research:{...before.research,unparsedDiaryCount:1}},after).kind,"unverified");
const noSource=observe(before,{...after,research:{
  ...after.research,diary:[...before.research.diary,event("ZERO",2,"SOURCE")]
}});
assert.equal(noSource.observedAutomatic[0].verdict,"observed-diary-but-unverified");
const incompleteBase=observe({...before,personnel:{bases:[
  {...base(),researchComplete:false}
]}},after);
assert.equal(incompleteBase.observedAutomatic[0].model,"not-established");
const sampleData={...data,researchRules:{
  ...data.researchRules,ZERO:{cost:0,dependencies:["SOURCE"],needItem:true,neededItem:"SPECIMEN"}
}};
const separateStock=observe({...before,personnel:{bases:[
  base(),base({SPECIMEN:1})
]}},after,sampleData);
assert.deepEqual(separateStock.observedAutomatic[0].candidateModelBases,[1],
  "a second base specimen must never be borrowed to validate the first base");
const emptyLog=observe({...before,research:{...before.research,diary:[]}},after);
assert.equal(emptyLog.kind,"unverified","an empty original diary cannot prove lineage");
const fixtureData=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const fixture=importModernSave(fs.readFileSync("tools/fixtures/modern-2.1-test.sav","utf8"),fixtureData);
assert.equal(observe(fixture,fixture,fixtureData).kind,"unverified",
  "absence of appended diary cannot prove a newly witnessed auto cascade");
console.log("PASS two-save research diary prefix, FREE_AFTER provenance, base-scoped conditional reconstruction, unknown/mismatched states, privacy-safe output");
