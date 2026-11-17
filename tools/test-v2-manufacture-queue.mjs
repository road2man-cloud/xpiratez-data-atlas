import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createManufacturingPlanner} from '../public/manufacture-v2/planner/planner-core.mjs';
import {simulateManufacturingQueue,compareManufacturingQueueOrders,buildProcurementChecklist} from '../public/manufacture-v2/planner/queue-core.mjs';
const data=fileURLToPath(new URL('../public/data/',import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(data+name+'-v2-index.json','utf8'));
const planner=createManufacturingPlanner({items:read('items'),research:read('research'),manufacture:read('manufacture')});
const make=()=>({inventory:{STR_CHEMICALS:40},jobs:[
 {key:'saved-0',source:'saved',recipeId:'STR_3RL_HE_XXX',batches:1},
 {key:'new',source:'new',recipeId:'STR_3RL_HE_XXX',batches:1}
],maxDepth:0});
test('sequential hypothetical orders deduct shared stock once and do not claim historical spent',()=>{
 const result=simulateManufacturingQueue(planner,make());
 assert.equal(result.jobs.length,2);
 const first=result.jobs[0],second=result.jobs[1];
 assert.equal(first.requestedBatches,1);
 assert.equal(second.requestedBatches,1);
 assert.equal(first.nestedPlan.rootRecipeId,'STR_3RL_HE_XXX');
 assert.equal(result.scenarioType,'additional-production-only');
 assert(!Object.hasOwn(first,'spent'));
 assert.equal(Object.keys(result.inventory.usedStarting).includes('STR_CHEMICALS'),true);
 const usage=result.inventory.usedStarting.STR_CHEMICALS;
 assert(usage>0&&usage<=40);
 assert(result.inventory.remainingStarting.STR_CHEMICALS===40-usage ||
   (40-usage===0&&!Object.hasOwn(result.inventory.remainingStarting,'STR_CHEMICALS')));
});
test('the same starting inventory is reusable in separate simulations, not shared between runs',()=>{
 const a=simulateManufacturingQueue(planner,make());
 const b=simulateManufacturingQueue(planner,make());
 assert.deepEqual(a.inventory.usedStarting,b.inventory.usedStarting);
 assert.deepEqual(a.external,b.external);
});
test('unregistered recipes and invalid quantities fail closed',()=>{
 const base=make();
 assert.throws(()=>simulateManufacturingQueue(planner,{...base,jobs:[{recipeId:'STR_UNKNOWN',batches:1}]}),/등록되지 않은/);
 assert.throws(()=>simulateManufacturingQueue(planner,{...base,jobs:[{recipeId:'STR_3RL_HE_XXX',batches:0}]}),/1~100/);
 assert.throws(()=>simulateManufacturingQueue(planner,{...base,jobs:[{recipeId:'STR_3RL_HE_XXX',batches:1},{recipeId:'STR_3RL_HE_XXX',batches:1}].map(x=>({...x,key:'duplicate'}))}),/중복/);
});
test('simulation preserves explicit recipe conditions but never emits an ETA',()=>{
 const out=simulateManufacturingQueue(planner,make());
 assert(out.jobs.every(x=>x.missingFacilityFunctions&&x.researchAbsentFromDiscovered));
 assert.equal(out.estimatedFinish,undefined);
 assert.equal(out.jobs[0].remainingBatches,undefined);
 assert(out.caveat.includes('미완료'));
});

const mockPlanner=({withFacilityRequirement=false,withResearch=false}={})=>{
  const manifest='verified-v.o2-fixture';
  const mkMeta=(kind)=>({schema:'xpiratez-v2-mod-'+kind+'/v1',sourceVersion:'v.o2',
    sourceManifestSha256:manifest,itemIndexSha256:'matching-item-data'});
  const root=(id,fields)=>({id,koName:id,sourceFiles:['Fixture.rul'],fields,
    links:{unlockedByResearch:[]}});
  return createManufacturingPlanner({
    items:{meta:{...mkMeta('items')},items:['A','B'].map(id=>({id,koName:id,fields:{}}))},
    research:{meta:mkMeta('research'),entries:withResearch?[{id:'R1',fields:{cost:20,dependencies:[]}}]:[]},
    manufacture:{meta:mkMeta('manufacture'),entries:[
      root('MAKE_A',{cost:5,time:2,requiredItems:{B:1},producedItems:{A:1},
        ...(withFacilityRequirement?{requiresBaseFunc:['SHOP']}:{}),
        ...(withResearch?{requires:['R1']}:{} )}),
      root('USE_A',{cost:3,time:1,requiredItems:{A:1}})
    ]}
  });
};
const orderSetup={jobs:[
  {key:'saved',source:'saved',recipeId:'MAKE_A',batches:1},
  {key:'new',source:'new',recipeId:'USE_A',batches:1}
],inventory:{B:1},maxDepth:0};

test('order comparison detects stock transfer available only when producer runs first',()=>{
  const p=mockPlanner();
  const first=simulateManufacturingQueue(p,orderSetup);
  assert.deepEqual(first.external,[]);
  assert.equal(first.jobs[1].earlierPlannedStockUsed,1);
  const compare=compareManufacturingQueueOrders(p,orderSetup,{},'new');
  assert.equal(compare.differences.length,1);
  assert.deepEqual(compare.differences.map(x=>({id:x.id,newFirst:x.newFirst,newLast:x.newLast})),
    [{id:'A',newFirst:1,newLast:0}]);
  assert.deepEqual(compare.newFirst.inventory.usedStarting,{B:1});
  assert.deepEqual(compare.newLast.inventory.usedStarting,{B:1});
  assert.deepEqual(compare.newLast.external,[]);
});

test('missing ingredients prevent transferring fictional unfinished production',()=>{
  const p=mockPlanner();
  const out=simulateManufacturingQueue(p,{...orderSetup,inventory:{}});
  assert.equal(out.jobs[0].futureOutputsBlocked,true);
  assert.deepEqual(out.external.map(x=>x.id),['A','B']);
  assert.equal(out.jobs[1].earlierPlannedStockUsed,0);
  assert.deepEqual(out.inventory.futureUnspentOutputs,{});
});

test('missing explicit facility or discovered research blocks optimistic output transfer',()=>{
  const base={facilitiesPresent:true,facilities:[]};
  const facilitiesIndex={facilities:[]};
  const p=mockPlanner({withFacilityRequirement:true});
  const out=simulateManufacturingQueue(p,orderSetup,{base,facilitiesIndex});
  assert.equal(out.jobs[0].futureOutputsBlocked,true);
  assert.deepEqual(out.jobs[0].missingFacilityFunctions,['SHOP']);
  assert.equal(out.jobs[1].earlierPlannedStockUsed,0);
  const research=mockPlanner({withResearch:true});
  const evidence=simulateManufacturingQueue(research,
    {...orderSetup,saveDiscoveredResearchIds:[]});
  assert.deepEqual(evidence.jobs[0].researchAbsentFromDiscovered,['R1']);
  assert.equal(evidence.jobs[0].futureOutputsBlocked,true);
});

test('alternative comparison rejects an absent or ambiguous new target',()=>{
  const p=mockPlanner();
  assert.throws(()=>compareManufacturingQueueOrders(p,orderSetup,{},'missing'),/하나/);
  assert.throws(()=>compareManufacturingQueueOrders(p,
    {...orderSetup,jobs:[...orderSetup.jobs,orderSetup.jobs[1]]},{},'new'),/하나/);
});

test('procurement checklist prioritizes first blocked order and attributes shared shortages',()=>{
 const p=mockPlanner();
 const a=simulateManufacturingQueue(p,{jobs:[
   {key:'first',recipeId:'USE_A',batches:2},
   {key:'second',recipeId:'USE_A',batches:3}
 ],inventory:{},maxDepth:0});
 const list=buildProcurementChecklist(p,a);
 assert.equal(list.schema,'xpiratez-v2-procurement-checklist/v1');
 assert.deepEqual(list.entries.map(x=>({id:x.id,quantity:x.quantity,first:x.firstNeededOrder,positions:x.affectedJobs.map(y=>y.position)})),
   [{id:'A',quantity:5,first:1,positions:[1,2]}]);
 assert.equal(list.totals.unresolvedUnits,5);
 assert.equal(list.totals.pricedKinds,0);
 assert.equal(list.entries[0].referenceBuySubtotal,null);
});

test('procurement checklist is independent of saved order progress and rejects untrusted results',()=>{
 const p=mockPlanner();
 const first=simulateManufacturingQueue(p,{jobs:[
   {key:'j1',source:'saved',recipeId:'USE_A',batches:1},
   {key:'j2',source:'new',recipeId:'MAKE_A',batches:1}
 ],inventory:{},maxDepth:0});
 const list=buildProcurementChecklist(p,first);
 assert.deepEqual(list.entries.map(x=>x.id),['A','B']);
 assert.deepEqual(list.entries.map(x=>x.firstNeededOrder),[1,2]);
 assert.throws(()=>buildProcurementChecklist(p,{schema:'legacy-1.1',jobs:[],external:[]}),/2.1/);
});
