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
