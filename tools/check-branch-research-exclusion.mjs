import assert from "node:assert/strict";
import fs from "node:fs";
import {createBranchResearchExclusion} from "./atlas-branch-research-exclusion.mjs";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const school="STR_SCHOOL_OF_HARD_KNOCKS",male="STR_WE_NEED_MALE_TOUCH",pre="STR_WE_NEED_MALE_TOUCH_PREQ";
const forbidden=new Set([pre]),empty=new Set();
const check=(d,active=empty,excluded=forbidden)=>createBranchResearchExclusion(d).prove(school,excluded,active);
assert(check(data)?.kind==="ALL_INDEXED_METHODS_BLOCKED");
assert.equal(check(data,new Set([male])),null);
assert.equal(check(data,empty,empty),null);
for(const field of ["unlocks","getOneFree","reenables"]){
 const d=structuredClone(data);d.researchRules.STR_TEST_ALT={dependencies:[],[field]:[school],cost:1};
 assert.equal(check(d),null,field+" escape");
}
for(const field of ["eventResearchSources","missionResearchSources"]){
 const d=structuredClone(data);d[field][school]=[{}];
 assert.equal(check(d),null,field+" escape");
}
const lookup=structuredClone(data);lookup.researchRules.STR_TEST_ALT={dependencies:[],lookup:school,cost:1};
assert.equal(check(lookup),null);
const protectedFree=structuredClone(data);protectedFree.researchRules.STR_TEST_ALT={dependencies:[],getOneFreeProtected:{STR_TEST_GUARD:[school]},cost:1};
assert.equal(check(protectedFree),null);
const unknown=structuredClone(data);unknown.researchRules[school].unknownSource=true;
assert.equal(check(unknown),null);
console.log("Branch exclusion: indexed proof, active veto, alternate awards, and unknown schema passed.");
