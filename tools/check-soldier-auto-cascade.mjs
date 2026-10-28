import assert from "node:assert/strict";
import fs from "node:fs";
import {inspectAutoZeroCascade,inspectInvariantAutoZeroCascade,
  inspectAutoZeroSourcesForTransform}
 from "../public/soldiers/modern/auto-zero-cascade.js";
const tests=[];
function test(name,fn){fn();tests.push(name);console.log("PASS "+name)}
const rules={
  SOURCE:{cost:10,unlocks:["PROTECTED"]},
  GUARD:{cost:5},
  PROTECTED:{cost:0,requires:["GUARD"],dependencies:["OTHER"]},
  UNPROTECTED:{cost:0,dependencies:["SOURCE"],unlocks:["LATER"]},
  LATER:{cost:0,requires:["GUARD"],dependencies:["OTHER"]},
  OTHER:{cost:5},
  SAMPLE:{cost:0,dependencies:["SOURCE"],needItem:true,neededItem:"SPECIMEN"},
  LAB:{cost:0,dependencies:["SOURCE"],requiresBaseFunc:["BIO_LAB"]},
  DEAD:{cost:0,dependencies:["SOURCE"]},
  RELIVE:{cost:0,dependencies:["SOURCE"],reenables:["DEAD"]}
};
const d={researchRules:rules,transformations:[{id:"FINISH",requires:["PROTECTED","SAMPLE"]}]};
const w=(data={})=>({researched:new Set(["GUARD"]),disabled:new Set(),items:{SPECIMEN:1},
  baseFunctions:new Set(["BIO_LAB"]),activeResearch:new Set(),...data});
const o={inventoryKnown:true,functionsKnown:true,activeResearchKnown:true,maxSteps:30};
test("all unknown country and region function assignments yield the same flags",()=>{
  const data={researchRules:{SOURCE:{cost:5},FREE:{cost:0,dependencies:["SOURCE"]},
    BLOCKED:{cost:0,dependencies:["UNREACHED"],requiresBaseFunc:["GEO"]}}};
  const start={researched:new Set(),disabled:new Set(),items:{},
    activeResearch:new Set(),baseFunctions:new Set()};
  const before=new Set(start.baseFunctions);
  const got=inspectInvariantAutoZeroCascade(data,"SOURCE",start,{
    inventoryKnown:true,activeResearchKnown:true,maxSteps:20});
  assert.equal(got.kind,"conditional");
  assert.equal(got.invariantAcrossBaseFunctions,true);
  assert.equal(got.variantCount,2);
  assert(got.finalState.researched.has("FREE"));
  assert.deepEqual(start.baseFunctions,before);
});
test("possible geography-dependent flag prevents any certified auto chain",()=>{
  const data={researchRules:{SOURCE:{cost:5},FREE:{cost:0,dependencies:["SOURCE"]},
    GEO_ONLY:{cost:0,dependencies:["SOURCE"],requiresBaseFunc:["GEO"]}}};
  const start={researched:new Set(),disabled:new Set(),items:{},
    activeResearch:new Set(),baseFunctions:new Set()};
  const got=inspectInvariantAutoZeroCascade(data,"SOURCE",start,{
    inventoryKnown:true,activeResearchKnown:true,maxSteps:20});
  assert.equal(got.kind,"uncertain-functions");
  assert.equal(got.variantCount,2);
  assert.equal(got.finalState,undefined);
  assert.equal(inspectInvariantAutoZeroCascade(data,"SOURCE",start,{
    inventoryKnown:false,activeResearchKnown:true}).kind,"unverified");
});
test("research completion cascades zero-cost unprotected and direct protected flags",()=>{
  const result=inspectAutoZeroCascade(d,"SOURCE",w(),o);
  assert.equal(result.kind,"conditional");
  assert.equal(result.steps[0].id,"SOURCE");
  assert(result.automatic.includes("PROTECTED"));
  assert(result.automatic.includes("UNPROTECTED"));
  assert(result.automatic.includes("SAMPLE"));
  assert(result.automatic.includes("LAB"));
  assert(result.automatic.includes("LATER"));
  const protectedStep=result.steps.find(x=>x.id==="PROTECTED");
  assert.equal(protectedStep.queuedBy,"SOURCE");
  const later=result.steps.find(x=>x.id==="LATER");
  assert.equal(later.queuedBy,"UNPROTECTED");
  assert(!result.automatic.includes("OTHER"),"missing paid research never appears in a zero-cost chain");
  assert(result.unverified.some(x=>x.includes("실제 완료")));
});
test("protected zero-cost prerequisite without direct unlock cannot be granted",()=>{
  const data={researchRules:{A:{cost:5},GUARD:{cost:5},PROTECTED:{
    cost:0,requires:["GUARD"],dependencies:["A"]}}};
  const result=inspectAutoZeroCascade(data,"A",w(),o);
  assert.deepEqual(result.automatic,[]);
});
test("protected bypasses nominal dependencies only via immediate explicit unlock",()=>{
  const source={researchRules:{A:{cost:5,unlocks:["P"]},GUARD:{cost:5},
    P:{cost:0,requires:["GUARD"],dependencies:["MISSING"]}}};
  assert.deepEqual(inspectAutoZeroCascade(source,"A",w(),o).automatic,["P"]);
  assert.deepEqual(inspectAutoZeroCascade(source,"A",w({researched:new Set()}),o).automatic,[]);
});
test("disabled auto flag cannot be accidentally resurrected by cascade",()=>{
  const x=inspectAutoZeroCascade(d,"SOURCE",w({
    disabled:new Set(["PROTECTED","SAMPLE"])}),o);
  assert(!x.automatic.includes("PROTECTED"));
  assert(!x.automatic.includes("SAMPLE"));
});
test("source already researched cannot retroactively auto-grant",()=>{
  const a=inspectAutoZeroCascade(d,"SOURCE",w({
    researched:new Set(["GUARD","SOURCE"])}),o);
  assert.equal(a.kind,"already-researched");
  assert.deepEqual(a.steps,[]);
});
test("same base sample is required even if other bases might have it",()=>{
  const a=inspectAutoZeroCascade(d,"SOURCE",w({items:{}}),o);
  assert(!a.automatic.includes("SAMPLE"));
  assert(a.automatic.includes("LAB"));
});
test("current base facility functions gate zero-cost topics",()=>{
  const a=inspectAutoZeroCascade(d,"SOURCE",w({baseFunctions:new Set()}),o);
  assert(!a.automatic.includes("LAB"));
});
test("ongoing project in same base does not enter free completion queue",()=>{
  const a=inspectAutoZeroCascade(d,"SOURCE",w({
    activeResearch:new Set(["SAMPLE"])}),o);
  assert(!a.automatic.includes("SAMPLE"));
});
test("source completion can close projects before searching zero-cost candidates",()=>{
  const data={researchRules:{START:{cost:5,disables:["Z"]},Z:{cost:0,dependencies:["START"]}}};
  const a=inspectAutoZeroCascade(data,"START",w(),o);
  assert(!a.automatic.includes("Z"));
});
test("zero cost follow-up disables are processed chronologically",()=>{
  const data={researchRules:{A:{cost:5},B:{cost:0,dependencies:["A"],disables:["C"]},
    C:{cost:0,dependencies:["A"]}}};
  const a=inspectAutoZeroCascade(data,"A",w(),o);
  assert.deepEqual(a.automatic,["B"]);
  assert(a.steps.some(s=>s.id==="C"&&s.disabledWhenPopped));
  assert(a.finalState.researched.has("C"),"OXCE processes a topic already queued even after disable");
  assert(a.finalState.disabled.has("C"),"being queued does not clear the disabled status");
  assert(a.notices.some(x=>x.includes("C")));
});
test("OXCE std::map research order is ordinal, not locale-dependent",()=>{
  const data={researchRules:{A:{cost:5},a_LATER:{cost:0,dependencies:["A"]},
    Z_FIRST:{cost:0,dependencies:["A"],disables:["a_LATER"]}}};
  const result=inspectAutoZeroCascade(data,"A",w(),o);
  assert.deepEqual(result.steps.map(s=>s.id),["A","Z_FIRST","a_LATER"]);
  assert(result.finalState.researched.has("a_LATER"));
  assert(result.finalState.disabled.has("a_LATER"));
  assert(!result.automatic.includes("a_LATER"));
});
test("previously discovered zero topic can re-run for new protected unlock",()=>{
  const data={researchRules:{GUARD:{cost:5},OLD:{cost:0,unlocks:["P"]},
    P:{cost:0,requires:["GUARD"],dependencies:["MISSING"]}}};
  const result=inspectAutoZeroCascade(data,"GUARD",
    w({researched:new Set(["OLD"])}),o);
  assert(result.steps.some(s=>s.id==="OLD"&&s.kind==="revisited-zero"));
  assert(result.automatic.includes("P"));
  assert(result.finalState.researched.has("P"));
});
test("repeatable source cannot be treated as a simple first-time auto queue",()=>{
  const rulebook={researchRules:{
    REPEATABLE:{cost:5,repeatable:true},
    ZERO:{cost:0,dependencies:["REPEATABLE"]}
  }};
  const answer=inspectAutoZeroCascade(rulebook,"REPEATABLE",w(),o);
  assert.equal(answer.kind,"unverified");
  assert.deepEqual(answer.steps,[]);
});
test("zero-cost chain does not pretend a free-research RNG grant is automatic",()=>{
  const rulebook={researchRules:{
    SOURCE:{cost:5},FOLLOWUP:{cost:0,dependencies:["SOURCE"],
      getOneFree:["RANDOM_A","RANDOM_B"]},
    RANDOM_A:{cost:5},RANDOM_B:{cost:5}
  }};
  const answer=inspectAutoZeroCascade(rulebook,"SOURCE",w(),o);
  assert(answer.automatic.includes("FOLLOWUP"));
  assert(!answer.automatic.includes("RANDOM_A"));
  assert(!answer.automatic.includes("RANDOM_B"));
  assert(answer.notices.some(x=>x.includes("자동 추첨하지 않음")));
});
test("auto cascade completion is bounded and never mutates input",()=>{
  const source=w();
  const before=[...source.researched];
  const a=inspectAutoZeroCascade(d,"SOURCE",source,{...o,maxSteps:2});
  assert(a.incomplete);
  assert(a.steps.length===2);
  assert.deepEqual([...source.researched],before);
});
test("unknown active research remains explicit uncertainty, never certified",()=>{
  const a=inspectAutoZeroCascade(d,"SOURCE",w(),{
    inventoryKnown:true,functionsKnown:true,activeResearchKnown:false});
  assert(a.automatic.includes("SAMPLE"));
  assert(a.unverified.some(x=>x.includes("진행 중인 연구")));
  assert.equal(a.kind,"conditional");
});
test("the transformation source inspector supplies potential chains only",()=>{
  const result=inspectAutoZeroSourcesForTransform(d,"FINISH",w(),o);
  assert(result.targets.includes("PROTECTED"));
  assert(result.sources.some(x=>x.source==="SOURCE"&&x.produced.includes("PROTECTED")));
  assert(result.sources.every(x=>x.kind==="conditional"));
});
test("real X-Piratez 2.1 research cache recognizes 2040 zero-cost flags",()=>{
  const real=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
  assert.equal(Object.values(real.researchRules).filter(x=>x.cost===0).length,2040);
  const inspect=inspectAutoZeroSourcesForTransform(real,"STR_HIGH_MAGOS_CEREMONY",
    {researched:new Set(),disabled:new Set(),items:{},
      baseFunctions:new Set(),activeResearch:new Set()},o);
  assert.deepEqual(inspect.targets,["STR_HIGH_MAGOS"]);
  assert(inspect.simulations.some(x=>x.source==="STR_BUGEYE_WIZARD_SPECIALIZATION"));
  assert(inspect.sources.some(x=>x.produced.includes("STR_HIGH_MAGOS")),
    "if the wizard specialization completes, the no-item zero-cost descendant is a conditional candidate");
  assert(!inspect.sources.some(x=>x.kind==="witness"));
  const unavailable=inspectAutoZeroSourcesForTransform(real,"STR_CAREER_SOLDIER",
    {researched:new Set(),disabled:new Set(),items:{},
      baseFunctions:new Set(),activeResearch:new Set()},o);
  assert.equal(unavailable.sources.length,0);
});
console.log(JSON.stringify({status:"PASS",checks:tests.length,
  note:"no automatic zero-cost result is elevated to a verified future campaign witness"}));
