import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRouteWorkbench }
  from '../public/manufacture-v2/planner/candidate-route-workbench.mjs';

const rootRecipeId='STR_FACTORY';
const itemMap=new Map([['STR_A',{}],['STR_ORE',{}]]);
const planner={
  itemMap,
  listProducers(id){
    return id==='STR_A'?[{recipeId:'STR_A_RECIPE',name:'A 제조',
      yieldCount:1,costPerBatch:20,timePerBatch:4}]:[];
  },
  plan(recipeId,options) {
    assert.equal(recipeId,rootRecipeId);
    const inventory=options.inventory||{};
    const missing=Math.max(0,10-(inventory.STR_A||0));
    const crafted=options.choices?.STR_A==='STR_A_RECIPE';
    const external=missing?[{
      id:crafted?'STR_ORE':'STR_A',name:crafted?'광석':'재료 A',
      quantity:missing*(crafted?2:1)
    }]:[];
    return {
      rootRecipeId,external,
      totals:{declaredCost:crafted?100:40,declaredTime:crafted?22:8},
      flags:crafted?['시설 미확인']:[],
      tree:{inputs:[]}
    };
  }
};
const inventory={STR_A:1};
const currentPlan=planner.plan(rootRecipeId,{inventory,choices:{STR_A:'external'}});
const candidate={
  report:{sourceVersion:'v.o2',rootRecipeId},
  additions:[{id:'STR_A',quantity:4}]
};
const base=()=>({
  planner,candidate,currentPlan,inventory,
  choices:{STR_A:'external'},batches:1,maxDepth:2
});

test('workbench independently compares original, route-only and route+stock states',()=>{
  const input=base(),unchanged=JSON.stringify(inventory);
  const evaluated=calculateRouteWorkbench({
    ...input,choices:{STR_A:'STR_A_RECIPE'},
    requestedQuantities:new Map([['STR_A',4]]),selectedIds:['STR_A']
  });
  const {report,routeBaseline,acquisitionPlan}=evaluated;
  assert.equal(report.schema,'xpiratez-v2-route-workbench/v1');
  assert.equal(report.sourceVersion,'v.o2');
  assert.equal(report.activePlan.shortageUnits,9);
  assert.equal(report.editedRouteBeforeAcquisition.shortageUnits,18);
  assert.equal(report.editedRouteAfterAcquisition.shortageUnits,10);
  assert.equal(report.editedRouteBeforeAcquisition.declaredCost,100);
  assert.equal(report.editedRouteAfterAcquisition.flags.length,1);
  assert.equal(routeBaseline.external[0].id,'STR_ORE');
  assert.equal(acquisitionPlan.external[0].quantity,10);
  assert.deepEqual(report.shortageChanges.map(x=>[x.id,x.before,x.after]),
    [['STR_ORE',18,10]]);
  assert.equal(report.stockDraft,'STR_A=5');
  assert.equal(report.scenarioReport.routeChoices.STR_A,'STR_A_RECIPE');
  assert.equal(JSON.stringify(inventory),unchanged);
  assert.equal(currentPlan.external[0].quantity,9);
});

test('default choices preserve main route and quantity edits remain hypothetical',()=>{
  const result=calculateRouteWorkbench(base());
  assert.equal(result.report.activePlan.shortageUnits,9);
  assert.equal(result.report.editedRouteBeforeAcquisition.shortageUnits,9);
  assert.equal(result.report.editedRouteAfterAcquisition.shortageUnits,5);
  assert.equal(result.report.additions[0].quantity,4);
  assert.equal(inventory.STR_A,1);
});

test('disallows invalid producer routes and rejects stale material amounts',()=>{
  assert.throws(()=>calculateRouteWorkbench({
    ...base(),choices:{STR_A:'STR_FAKE_RECIPE'}
  }),/선택할 수 없는 제조 경로/);
  assert.throws(()=>calculateRouteWorkbench({
    ...base(),choices:{STR_INVALID:'external'}
  }),/선택할 수 없는 제조 경로/);
  assert.throws(()=>calculateRouteWorkbench({
    ...base(),requestedQuantities:new Map([['STR_A',20]]),
    selectedIds:['STR_A']
  }),/가상 확보 수량/);
  assert.throws(()=>calculateRouteWorkbench({
    ...base(),selectedIds:[]
  }),/하나 이상/);
  assert.equal(inventory.STR_A,1);
});

test('rejects unrelated or older source candidate before planning',()=>{
  assert.throws(()=>calculateRouteWorkbench({
    ...base(),candidate:{...candidate,report:{...candidate.report,rootRecipeId:'STR_OTHER'}}
  }),/현재 제조 목표/);
  assert.throws(()=>calculateRouteWorkbench({
    ...base(),candidate:{...candidate,report:{...candidate.report,sourceVersion:'v.o1.1.1'}}
  }),/현재 제조 목표/);
});
