import assert from "node:assert/strict";
import fs from "node:fs";
import {zeroCostResearchGate,inspectTransformationZeroResearch}
  from "../public/soldiers/modern/auto-zero-research.js";
const tests=[];
function test(name,fn){fn();tests.push(name);console.log("PASS "+name)}
const data={
  researchRules:{
    INIT:{cost:5,unlocks:["SECRET"]},
    BASE:{cost:5},
    SECRET:{cost:0,requires:["BASE"],dependencies:["OTHER"]},
    OPEN:{cost:0,dependencies:["BASE"],needItem:true,
      neededItem:"EVIDENCE",requiresBaseFunc:["LIB"]},
    OTHER:{cost:5},BLOCK:{cost:5},
    CLOSED:{cost:0,dependencies:[],reenables:["BASE"]}
  },
  transformations:[{id:"T",requires:["SECRET","OPEN"]}]
};
const world=(extra={})=>({researched:new Set(["BASE"]),disabled:new Set(),
  items:{EVIDENCE:1},baseFunctions:new Set(["LIB"]),...extra});
const opts={inventoryKnown:true,functionsKnown:true};
test("cost-0 flag requires source completion and is never granted retroactively",()=>{
  const r=zeroCostResearchGate(data,"OPEN",world(),opts);
  assert.equal(r.kind,"pending-source");
  assert(r.reasons.some(x=>x.includes("소급 지급 불가")));
});
test("exact post-completion zero-cost source gate can be examined, not claimed as gained",()=>{
  const r=zeroCostResearchGate(data,"OPEN",world(),{...opts,justFinished:"BASE"});
  assert.equal(r.kind,"eligible-after-source");
  assert(!r.reasons.some(x=>x.includes("확정 획득")));
});
test("protective requires need the just-completed source to directly unlock",()=>{
  assert.equal(zeroCostResearchGate(data,"SECRET",world({researched:new Set(["BASE","OTHER"])}),
    {...opts,justFinished:"OTHER"}).kind,"gated");
  const missingRequires=zeroCostResearchGate(data,"SECRET",
    world({researched:new Set()}),{...opts,justFinished:"INIT"});
  assert.equal(missingRequires.kind,"gated",
    "even direct unlock cannot bypass the protected rule's requires");
});
test("protected direct unlock with fulfilled requires bypasses dependencies",()=>{
  const x=zeroCostResearchGate(data,"SECRET",world(),{...opts,justFinished:"INIT"});
  // Source INIT is a direct unlocker; OTHER not required.
  assert.equal(x.kind,"eligible-after-source");
  assert.deepEqual(x.missingDependencies,[]);
});
test("zero-cost auto cannot borrow needed sample from a different base",()=>{
  const x=zeroCostResearchGate(data,"OPEN",world({items:{}}),{...opts,justFinished:"BASE"});
  assert.equal(x.kind,"gated");
  assert.equal(x.missingItem,true);
});
test("unknown local storage remains unverified, not silently empty",()=>{
  const x=zeroCostResearchGate(data,"OPEN",world({items:null}),{
    inventoryKnown:false,functionsKnown:true,justFinished:"BASE"});
  assert.equal(x.kind,"gated");
  assert.equal(x.missingItem,null);
  assert(x.reasons.some(s=>s.includes("확인 필요")));
});
test("missing base functions block same-base automatic flags",()=>{
  const x=zeroCostResearchGate(data,"OPEN",world({baseFunctions:new Set()}),{
    ...opts,justFinished:"BASE"});
  assert.equal(x.kind,"gated");
  assert.deepEqual(x.missingFunctions,["LIB"]);
});
test("disabled zero-cost flags remain not-now rather than falsely permanent",()=>{
  const x=zeroCostResearchGate(data,"OPEN",world({disabled:new Set(["OPEN"])}),opts);
  assert.equal(x.kind,"disabled-now");
  assert(!x.reasons.some(s=>s.includes("영구 획득 불가능")));
});
test("internal-only unavailable is never declared collectible",()=>{
  const x=zeroCostResearchGate({researchRules:{STR_UNAVAILABLE:{cost:0}}},"STR_UNAVAILABLE",world(),opts);
  assert.equal(x.kind,"internal-only");
});
test("2.1 transformation zero-cost gates are indexed and do not invent research completion",()=>{
  const real=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
  const flagged=real.transformations.filter(t=>t.requires?.some(id=>
    real.researchRules[id]?.cost===0));
  assert.equal(flagged.length,11);
  assert.equal(Object.values(real.researchRules).filter(x=>x.cost===0).length,2040);
  const high=inspectTransformationZeroResearch(real,"STR_HIGH_MAGOS_CEREMONY",
    {researched:new Set(),disabled:new Set(),items:{},baseFunctions:new Set()},
    {inventoryKnown:true,functionsKnown:true});
  assert.equal(high.length,1);
  assert.equal(high[0].id,"STR_HIGH_MAGOS");
  assert(high[0].missingDependencies.includes("STR_BUGEYE_WIZARD_SPECIALIZATION"));
  const chort=inspectTransformationZeroResearch(real,"STR_CHORT_SUMMONING",
    {researched:new Set(),disabled:new Set(),items:{},baseFunctions:new Set()},
    {inventoryKnown:true,functionsKnown:true});
  assert.equal(chort[0].kind,"gated");
  assert.equal(chort[0].missingItem,true);
  const internal=inspectTransformationZeroResearch(real,"STR_CAREER_SOLDIER",
    {researched:new Set(),disabled:new Set(),items:{},baseFunctions:new Set()},
    {inventoryKnown:true,functionsKnown:true});
  assert.equal(internal[0].kind,"internal-only");
});
console.log(JSON.stringify({result:"PASS",tests:tests.length,
  game:"X-Piratez 2.1",autoZeroFlagCount:2040,transformationsUsingZeroCost:11}));
