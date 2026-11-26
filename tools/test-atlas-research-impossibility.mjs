import assert from "node:assert/strict";
import {createResearchImpossibilityIndex,createReachabilityAwareSuccessorIndex} from "./atlas-research-impossibility.mjs";
const rule=overrides=>({requires:[],dependencies:[],disables:[],reenables:[],unlocks:[],lookup:null,getOneFree:[],getOneFreeProtected:{},sequentialGetOneFree:false,repeatable:false,needItem:false,destroyItem:false,returnsItem:false,neededItem:null,requiresBaseFunc:[],cost:1,...overrides});
const data={researchRules:{
 LOCK:rule(), BLOCKED:rule({dependencies:["LOCK"]}), AFTER:rule({dependencies:["BLOCKED"]}),
 FREE:rule({dependencies:["LOCK"]}), EVENT:rule({dependencies:["LOCK"]}), MISSION:rule({dependencies:["LOCK"]}),
 LOOKUP:rule({dependencies:["LOCK"]}), UNLOCK:rule({dependencies:["LOCK"]}), PROTECTED:rule({requires:["LOCK"]}),
 REVIVABLE:rule(), REENABLE:rule({reenables:["REVIVABLE"]}),
 SOURCE:rule({getOneFree:["FREE"],getOneFreeProtected:{LOCK:["PROTECTED"]},lookup:"LOOKUP",unlocks:["UNLOCK"]}),
 DISCOVERED:rule(), NEED_DISCOVERY:rule({dependencies:["DISCOVERED"]}),
 CYCLE1:rule({reenables:["CYCLE2"]}),CYCLE2:rule({reenables:["CYCLE1"]}),
 },eventResearchSources:{EVENT:[{}]},missionResearchSources:{MISSION:[{}]},transformations:[
 {id:"S1",allowedSoldierTypes:["BODY"],requires:["AFTER"],allowsLiveSoldiers:true},
 {id:"S2",allowedSoldierTypes:["OTHER"],requires:["EVENT"],allowsLiveSoldiers:true},
 ]};
const researched=new Set(["DISCOVERED"]),disabled=new Set(["LOCK","REVIVABLE","DISCOVERED","CYCLE1","CYCLE2"]);
const index=createResearchImpossibilityIndex(data),result=index.analyze(researched,disabled);
for(const k of ["LOCK","BLOCKED","AFTER","DISCOVERED"])assert(result.has(k),k);
for(const k of ["FREE","EVENT","MISSION","LOOKUP","UNLOCK","PROTECTED","REVIVABLE","NEED_DISCOVERY","CYCLE1","CYCLE2"])assert(!result.has(k),k);
assert.deepEqual(Object.keys(index.receipt(result,"AFTER").nodes).sort(),["AFTER","BLOCKED","LOCK"]);
assert.equal(index.analyze(researched,disabled),result);
const partial=createResearchImpossibilityIndex({...data,missionResearchSources:undefined}).analyze(researched,disabled);
assert(partial.has("LOCK"));assert(!partial.has("BLOCKED"));
const unknown=createResearchImpossibilityIndex({...data,researchRules:{...data.researchRules,EXTRA:rule({unknownEngineField:true})}}).analyze(researched,disabled);
assert.equal(unknown.size,0);
const first=createReachabilityAwareSuccessorIndex(data),a={history:new Set(),historyKnown:true,active:new Set(),researched,disabled,raw:Array(12).fill(50),capRaw:Array(12).fill(50)};
assert(first.assess({...a,body:"BODY"}).closed);
assert(!first.assess({...a,body:"OTHER"}).closed);
assert(!first.assess({...a,body:"BODY",raw:Array(12).fill(49)}).closed);
assert(!first.assess({...a,body:"BODY",historyKnown:false}).closed);
console.log("Research reachability regression passed (disabled, dependency, alternate grants, unknown indexes, exact growth/history).");
