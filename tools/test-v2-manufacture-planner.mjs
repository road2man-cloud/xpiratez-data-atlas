import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createManufacturingPlanner } from '../public/manufacture-v2/planner/planner-core.mjs';

const root=fileURLToPath(new URL('../public/data/',import.meta.url));
const read=n=>JSON.parse(fs.readFileSync(root+n+'-v2-index.json','utf8'));
const make=(recipes,research=[],items=[])=>createManufacturingPlanner({
  manufacture:{meta:{schema:'xpiratez-v2-mod-manufacture/v1',sourceVersion:'v.o2',sourceManifestSha256:'hash',itemIndexSha256:'itemhash'},entries:recipes},
  research:{meta:{schema:'xpiratez-v2-mod-research/v1',sourceVersion:'v.o2',sourceManifestSha256:'hash',itemIndexSha256:'itemhash'},entries:research},
  items:{meta:{schema:'xpiratez-v2-mod-items/v1',sourceVersion:'v.o2',sourceManifestSha256:'hash'},items}
});
const item=id=>({id,koName:id,fields:{costBuy:100}});
const recipe=(id,fields)=>({id,koName:id,sourceFiles:['Piratez.rul'],fields,links:{unlockedByResearch:[]}});

test('exact explicit yields round up to whole batches, preserving production surplus',()=>{
  const p=make([
    recipe('ROOT',{cost:100,time:20,requiredItems:{A:13}}),
    recipe('CRAFT_A',{cost:8,time:5,producedItems:{A:5},requiredItems:{B:2}})
  ],[],[item('A'),item('B')]);
  const out=p.plan('ROOT',{maxDepth:3});
  assert.equal(out.totals.declaredCost,124);
  assert.equal(out.totals.declaredTime,35);
  assert.equal(out.totals.batches,4);
  assert.equal(out.tree.inputs[0].neededBatches,3);
  assert.equal(out.tree.inputs[0].extra,2);
  assert.equal(out.external[0].quantity,6);
  assert.deepEqual(out.extraOutputs.map(x=>x.quantity),[2]);
});
test('ambiguous yields remain external until a candidate is chosen',()=>{
  const p=make([
    recipe('ROOT',{cost:10,time:2,requiredItems:{A:6}}),
    recipe('A1',{cost:7,time:3,producedItems:{A:2}}),
    recipe('A2',{cost:9,time:1,producedItems:{A:4}})
  ],[],[item('A')]);
  const initial=p.plan('ROOT');
  assert(initial.flags.includes('ambiguous-producer'));
  assert.equal(initial.selections[0].candidates.length,2);
  assert.equal(initial.totals.declaredCost,10);
  const chosen=p.plan('ROOT',{choices:{A:'A2'}});
  assert.equal(chosen.totals.declaredCost,28);
  assert.equal(chosen.tree.inputs[0].neededBatches,2);
  assert.equal(chosen.tree.inputs[0].extra,2);
  const direct=p.plan('ROOT',{choices:{A:'external'}});
  assert.equal(direct.external[0].quantity,6);
  assert.equal(direct.totals.declaredCost,10);
});
test('unverified implicit yields are off by default and remain flagged when enabled',()=>{
  const p=make([
    recipe('ROOT',{cost:10,time:1,requiredItems:{A:2}}),
    recipe('A',{cost:2,time:4,requiredItems:{B:1}})
  ],[],[item('A'),item('B')]);
  assert.equal(p.plan('ROOT').tree.inputs[0].status,'unsupported-output');
  const assumed=p.plan('ROOT',{assumeImplicit:true});
  assert.equal(assumed.tree.inputs[0].status,'manufactured');
  assert.equal(assumed.tree.inputs[0].neededBatches,2);
  assert(assumed.flags.includes('assumed-yield'));
  assert.equal(assumed.totals.declaredCost,14);
});
test('cycle cutoffs and max-depth leave inputs externally unresolved',()=>{
  const p=make([
    recipe('ROOT',{cost:10,time:1,requiredItems:{A:1}}),
    recipe('A1',{cost:2,time:4,producedItems:{A:1},requiredItems:{B:1}}),
    recipe('B1',{cost:3,time:4,producedItems:{B:1},requiredItems:{A:1}})
  ],[],[item('A'),item('B')]);
  const out=p.plan('ROOT',{maxDepth:6});
  assert(out.flags.includes('cycle'));
  assert.equal(out.external.find(x=>x.id==='A').quantity,1);
  const limited=p.plan('ROOT',{maxDepth:1});
  assert(limited.flags.includes('depth-limit'));
  assert.equal(limited.external.find(x=>x.id==='B').quantity,1);
});
test('research closure reports known references, unknown dependencies and cycles separately',()=>{
  const p=make([recipe('ROOT',{cost:20,time:1,requires:['R1']})],[
    {id:'R1',fields:{cost:30,dependencies:['R2','UNKNOWN']}},
    {id:'R2',fields:{dependencies:['R1']}}
  ],[]);
  const out=p.plan('ROOT');
  assert.deepEqual(out.research.ids.map(x=>x.id),['R1','R2']);
  assert.deepEqual(out.research.unresolved,['UNKNOWN']);
  assert(out.flags.includes('research-cycle'));
  assert(out.flags.includes('unresolved-research'));
});
test('refuses mismatched 1.1 data and invalid batch settings',()=>{
  assert.throws(()=>createManufacturingPlanner({
    manufacture:{meta:{schema:'xpiratez-v2-mod-manufacture/v1',sourceVersion:'v.o1.1.1'}},
    research:{meta:{schema:'xpiratez-v2-mod-research/v1',sourceVersion:'v.o2'}},
    items:{meta:{schema:'xpiratez-v2-mod-items/v1',sourceVersion:'v.o2'}}
  }),/2.1/);
  const p=make([recipe('ROOT',{cost:10,time:1})],[],[]);
  assert.throws(()=>p.plan('ROOT',{batches:101}),/1~100/);
  assert.throws(()=>p.plan('ROOT',{maxDepth:7}),/0~6/);
});
test('full v.o2 dataset can build real resource route without legacy DB',()=>{
  const p=createManufacturingPlanner({
    manufacture:read('manufacture'),research:read('research'),items:read('items')
  });
  const result=p.plan('STR_3RL_HE_XXX',{maxDepth:2});
  assert.equal(result.rootRecipeId,'STR_3RL_HE_XXX');
  assert.equal(result.totals.declaredCost,10000);
  assert(result.selections.some(x=>x.id==='STR_CHEMICALS'));
  const chosen=p.plan('STR_3RL_HE_XXX',{maxDepth:2,choices:{STR_CHEMICALS:'STR_CHEMICALS_XXX'}});
  assert.equal(chosen.tree.inputs[0].recipeId,'STR_CHEMICALS_XXX');
  assert(chosen.totals.declaredCost>result.totals.declaredCost);
});

test('shared remaining yield prevents duplicate manufacturing across sibling branches',()=>{
  const p=make([
    recipe('ROOT',{cost:100,time:10,requiredItems:{B:1,C:1}}),
    recipe('MAKE_B',{cost:20,time:3,producedItems:{B:1},requiredItems:{A:2}}),
    recipe('MAKE_C',{cost:30,time:4,producedItems:{C:1},requiredItems:{A:3}}),
    recipe('MAKE_A',{cost:7,time:1,producedItems:{A:5}})
  ],[],[item('A'),item('B'),item('C')]);
  const plan=p.plan('ROOT',{maxDepth:4});
  assert.equal(plan.totals.declaredCost,157);
  assert.equal(plan.totals.batches,4);
  assert.equal(plan.external.length,0);
  const a=plan.consolidated.find(x=>x.id==='A');
  assert.equal(a.demand,5);
  assert.equal(a.produced,5);
  assert.equal(a.surplusUsed,5);
  assert.equal(a.remainingProduced,0);
  assert.equal(plan.extraOutputs.length,0);
});
test('explicit coproducts satisfy sibling demand before another producer is scheduled',()=>{
  const p=make([
    recipe('ROOT',{cost:25,time:1,requiredItems:{Y:3,X:1}}),
    recipe('MAKE_X',{cost:12,time:4,producedItems:{X:1,Y:4}}),
    recipe('MAKE_Y',{cost:50,time:5,producedItems:{Y:3}})
  ],[],[item('X'),item('Y')]);
  const out=p.plan('ROOT',{maxDepth:2});
  assert.equal(out.totals.declaredCost,37);
  assert.equal(out.totals.batches,2);
  assert.equal(out.external.length,0);
  assert.deepEqual(out.tree.inputs.map(x=>x.id),['X','Y']);
  assert.equal(out.tree.inputs[1].status,'stock-covered');
  assert.equal(out.tree.inputs[1].surplusUsed,3);
  assert.equal(out.consolidated.find(x=>x.id==='Y').remainingProduced,1);
  assert.deepEqual(out.extraOutputs.map(x=>[x.id,x.quantity]),[['Y',1]]);
});
test('initial inventory is deducted before manufacturing and untouched leftovers persist',()=>{
  const p=make([
    recipe('ROOT',{cost:100,time:10,requiredItems:{A:8,B:2}}),
    recipe('A_MAKE',{cost:4,time:2,producedItems:{A:5},requiredItems:{C:2}})
  ],[],[item('A'),item('B'),item('C')]);
  const out=p.plan('ROOT',{inventory:{A:3,B:5},maxDepth:3});
  assert.equal(out.totals.declaredCost,104);
  assert.equal(out.inventory.consumed.A,3);
  assert.equal(out.inventory.consumed.B,2);
  assert.equal(out.inventory.remaining.B,3);
  assert.equal(out.external.find(x=>x.id==='C').quantity,2);
  const row=out.consolidated.find(x=>x.id==='A');
  assert.equal(row.demand,8);
  assert.equal(row.initialUsed,3);
  assert.equal(row.surplusUsed,5);
  assert.equal(row.remainingProduced,0);
  assert.equal(out.tree.inputs.find(x=>x.id==='A').deficit,5);
  const unchanged=p.plan('ROOT',{inventory:{A:3,B:5},maxDepth:3});
  assert.equal(unchanged.inventory.consumed.A,3); // stock must not leak between plans
});
test('comparison alternatives use independent inventories with declared scenario costs',()=>{
  const p=make([
    recipe('ROOT',{cost:10,time:2,requiredItems:{A:6}}),
    recipe('A1',{cost:7,time:3,producedItems:{A:2}}),
    recipe('A2',{cost:9,time:1,producedItems:{A:4}})
  ],[],[item('A')]);
  const report=p.compareAlternatives('ROOT','A',{inventory:{A:2}});
  assert.equal(report.totalCandidates,2);
  const a1=report.scenarios.find(x=>x.recipeId==='A1');
  const a2=report.scenarios.find(x=>x.recipeId==='A2');
  assert.equal(a1.declaredManufactureCost,24);
  assert.equal(a2.declaredManufactureCost,19);
  assert.equal(a1.declaredManufactureTime,8);
  assert.equal(a2.declaredManufactureTime,3);
  assert.deepEqual(a1.remainingStock,{});
  assert.deepEqual(a2.remainingStock,{});
});
test('inventory rejects unknown 1.1 IDs, fractional, negative, too-large and overflowing batch inputs',()=>{
  const p=make([recipe('ROOT',{cost:5,time:3,requiredItems:{A:2}})],[],[item('A')]);
  for(const value of [-1,0.1,10000001,Number.MAX_SAFE_INTEGER+1])
    assert.throws(()=>p.plan('ROOT',{inventory:{A:value}}),/재고 수량/);
  assert.throws(()=>p.plan('ROOT',{inventory:{STR_UNVERIFIED_1_1:1}}),/2.1 아이템/);
  assert.throws(()=>p.plan('ROOT',{inventory:['A',3]}),/수량 객체/);
});
