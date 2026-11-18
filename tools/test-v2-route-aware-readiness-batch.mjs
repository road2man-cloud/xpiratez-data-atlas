import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRouteAwareReadinessBatch }
  from '../public/manufacture-v2/planner/route-aware-readiness-batch.mjs';
import { buildManufacturingReadinessChecklist }
  from '../public/manufacture-v2/planner/manufacturing-readiness-checklist.mjs';

const rootRecipeId='STR_FACTORY';
const itemMap=new Map([['STR_A',{}],['STR_ORE',{}]]);
const evidence=(plan)=>({
  schema:'xpiratez-v2-route-evidence/v1',
  recipeIds:['STR_FACTORY'],
  facilityEvidenceSource:'no-single-base-selected',
  researchEvidenceSource:'no-discovered-data',
  facilities:[{recipeId:'STR_FACTORY',functionId:'WORKS',status:'unverified'}],
  research:[{id:'STR_RESEARCH',name:'제조 연구',status:'unverified'}],
  unresolvedResearch:[]
});
const planner={
  itemMap,
  listProducers(id) {
    return id==='STR_A'?[{recipeId:'STR_A_RECIPE'}]:[];
  },
  plan(recipeId,options) {
    assert.equal(recipeId,rootRecipeId);
    const inv=options.inventory||{},crafted=options.choices?.STR_A==='STR_A_RECIPE';
    const shortage=Math.max(0,10-(inv.STR_A||0));
    const oreShortage=Math.max(0,shortage*2-(inv.STR_ORE||0));
    return {
      schema:'xpiratez-v2-manufacture-plan/v1',rootRecipeId,
      external:crafted?
        (oreShortage?[{id:'STR_ORE',name:'광석',quantity:oreShortage,
          reasons:['external'],listedUnitBuy:3}]:[]):
        (shortage?[{id:'STR_A',name:'재료 A',quantity:shortage,
          reasons:['external-choice'],listedUnitBuy:null}]:[]),
      totals:{declaredCost:crafted?200:100,declaredTime:crafted?16:8},
      flags:crafted?['unknown-facility']:[],
      tree:{kind:'recipe',id:'STR_FACTORY',inputs:[]},
      research:{ids:[{id:'STR_RESEARCH',name:'제조 연구'}],unresolved:[]}
    };
  }
};
const inventory={STR_A:1};
const originalPlan=planner.plan(rootRecipeId,{inventory,choices:{}});
const routeChoices={STR_A:'STR_A_RECIPE'};
const routeBaseline=planner.plan(rootRecipeId,{inventory,choices:routeChoices});
const originalChecklist=buildManufacturingReadinessChecklist(originalPlan,evidence(originalPlan));
const routeChecklist=buildManufacturingReadinessChecklist(routeBaseline,evidence(routeBaseline));
const args=()=>({
  planner,originalPlan,originalChecklist,routeBaseline,routeChecklist,
  inventory,choices:routeChoices,selectedIds:['STR_ORE'],
  requestedQuantities:new Map([['STR_ORE',6]]),
  batches:1,maxDepth:3,evidenceForPlan:evidence
});

test('route edit exposes a new material and batches only its actual route shortage',()=>{
  const snapshot=JSON.stringify({inventory,originalPlan,routeBaseline,routeChecklist});
  const {report,after,basket}=calculateRouteAwareReadinessBatch(args());
  assert.equal(report.schema,'xpiratez-v2-route-aware-readiness-batch/v1');
  assert.equal(report.sourceVersion,'v.o2');
  assert.equal(report.original.shortageUnits,9);
  assert.equal(report.routeOnly.shortageUnits,18);
  assert.equal(report.routeAndAcquisition.shortageUnits,12);
  assert.equal(report.acquiredHypothetically[0].id,'STR_ORE');
  assert.equal(report.acquiredHypothetically[0].quantity,6);
  assert.equal(report.acquiredHypothetically[0].target,6);
  assert.equal(report.stockDraft,'STR_ORE=6');
  assert.equal(report.routeChoices.STR_A,'STR_A_RECIPE');
  assert.equal(report.hypotheticalScenario.routeChoices.STR_A,'STR_A_RECIPE');
  assert(report.routeOnlyChanges.added.some(x=>x.requirementId==='STR_ORE'));
  assert(report.routeOnlyChanges.removed.some(x=>x.requirementId==='STR_A'));
  assert(report.acquisitionChanges.changed.some(x=>x.current.requirementId==='STR_ORE'));
  assert.equal(report.finalChecklist.totals.shortageUnits,12);
  assert.equal(after.external[0].quantity,12);
  assert.equal(basket.inventory.STR_ORE,6);
  assert.equal(JSON.stringify({inventory,originalPlan,routeBaseline,routeChecklist}),snapshot);
});

test('does not accidentally add old candidate stock to the new route shortage',()=>{
  const {report}=calculateRouteAwareReadinessBatch({
    ...args(),selectedIds:['STR_ORE'],
    requestedQuantities:{STR_ORE:4}
  });
  assert.equal(report.routeOnly.shortageUnits,18);
  assert.equal(report.routeAndAcquisition.shortageUnits,14);
  assert.equal(report.stockDraft,'STR_ORE=4');
  assert.equal(inventory.STR_A,1);
});

test('rejects material from original route if edited route does not need it',()=>{
  assert.throws(()=>calculateRouteAwareReadinessBatch({
    ...args(),selectedIds:['STR_A'],requestedQuantities:{STR_A:3}
  }),/체크리스트에 없는/);
});

test('detects stale edited route baseline before making acquisitions',()=>{
  assert.throws(()=>calculateRouteAwareReadinessBatch({
    ...args(),routeBaseline:{
      ...routeBaseline,
      external:[{...routeBaseline.external[0],quantity:15}]
    }
  }),/다시 계산/);
});

test('rejects invalid route choices and partial quantities',()=>{
  assert.throws(()=>calculateRouteAwareReadinessBatch({
    ...args(),choices:{STR_A:'STR_NONEXISTENT'}
  }),/경로와 맞지 않는/);
  assert.throws(()=>calculateRouteAwareReadinessBatch({
    ...args(),requestedQuantities:{STR_ORE:19}
  }),/가상 확보 수량/);
  assert.throws(()=>calculateRouteAwareReadinessBatch({
    ...args(),requestedQuantities:{STR_ORE:0}
  }),/가상 확보 수량/);
});

test('does not compare reports from different root goals or mismatched checklist',()=>{
  assert.throws(()=>calculateRouteAwareReadinessBatch({
    ...args(),routeChecklist:{...routeChecklist,rootRecipeId:'STR_UNRELATED'}
  }),/같은 v.o2/);
  assert.throws(()=>calculateRouteAwareReadinessBatch({
    ...args(),originalPlan:{...originalPlan,sourceVersion:'v.o1.1.1',schema:'legacy'}
  }),/같은 v.o2/);
});
