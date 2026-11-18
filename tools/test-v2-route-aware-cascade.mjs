import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRouteAwareReadinessBatch }
  from '../public/manufacture-v2/planner/route-aware-cascade.mjs';
import { buildManufacturingReadinessChecklist }
  from '../public/manufacture-v2/planner/manufacturing-readiness-checklist.mjs';

const rootRecipeId='STR_MULTI';
const inventory={};
const choices={STR_A:'MAKE_A'};
const itemMap=new Map(['STR_A','STR_ORE','STR_WOOD','STR_MAGIC']
  .map(id=>[id,{}]));
const evidenceForPlan=()=>({
  schema:'xpiratez-v2-route-evidence/v1',
  recipeIds:[rootRecipeId],
  facilities:[],research:[],unresolvedResearch:[],
  researchEvidenceSource:'no-discovered-data',
  facilityEvidenceSource:'no-single-base-selected'
});
const row=(id,quantity)=>({id,name:id,quantity,reasons:['external']});
const planner={
  itemMap,
  name:id=>id,
  listProducers:id=>id==='STR_A'?[{recipeId:'MAKE_A'}]:[],
  plan(id,{inventory:stock={},choices:routes={}}){
    assert.equal(id,rootRecipeId);
    let external;
    if(routes.STR_A!=='MAKE_A')external=[row('STR_A',5)];
    else if((stock.STR_ORE||0)<4)external=[
      row('STR_ORE',4-(stock.STR_ORE||0)),
      ...((stock.STR_ORE||0)>=2?[row('STR_WOOD',3)]:[])
    ];
    else if((stock.STR_WOOD||0)<3)
      external=[row('STR_WOOD',3-(stock.STR_WOOD||0))];
    else if((stock.STR_MAGIC||0)<2)
      external=[row('STR_MAGIC',2-(stock.STR_MAGIC||0))];
    else external=[];
    return {
      schema:'xpiratez-v2-manufacture-plan/v1',rootRecipeId,
      external,totals:{declaredCost:44,declaredTime:3},
      flags:[],tree:{kind:'recipe',id:rootRecipeId,inputs:[]},
      research:{ids:[],unresolved:[]}
    };
  }
};
const originalPlan=planner.plan(rootRecipeId,{inventory});
const routeBaseline=planner.plan(rootRecipeId,{inventory,choices});
const originalChecklist=buildManufacturingReadinessChecklist(
  originalPlan,evidenceForPlan());
const routeChecklist=buildManufacturingReadinessChecklist(
  routeBaseline,evidenceForPlan());
const args=()=>({
  planner,originalPlan,routeBaseline,
  originalChecklist,routeChecklist,
  inventory,choices,selectedIds:['STR_ORE'],
  requestedQuantities:{STR_ORE:2},
  batches:1,maxDepth:3,evidenceForPlan
});

test('route-aware cascade tracks newly revealed shortages across separate rounds',()=>{
  const snapshot=JSON.stringify({inventory,choices,routeBaseline});
  const {report,after}=expandRouteAwareReadinessBatch({...args(),maxRounds:4});
  assert.equal(report.schema,'xpiratez-v2-route-aware-cascade/v1');
  assert.equal(report.stopped,'no-unresolved-materials');
  assert.equal(report.history.length,2);
  assert.equal(report.history[0].addedUnits,5);
  assert.equal(report.history[0].shortageBefore.units,5);
  assert.equal(report.history[0].newlyExposed[0].id,'STR_MAGIC');
  assert.equal(report.history[1].addedUnits,2);
  assert.equal(report.history[1].shortageAfter.units,0);
  assert.equal(report.routeOnly.shortageUnits,4);
  assert.equal(report.routeAndAcquisition.shortageUnits,0);
  assert.deepEqual(report.acquiredHypothetically.map(x=>[x.id,x.quantity,x.firstPass]),
    [['STR_MAGIC',2,0],['STR_ORE',4,2],['STR_WOOD',3,0]]);
  assert.equal(report.initialAcquired.length,1);
  assert.equal(report.initialAcquired[0].quantity,2);
  assert.equal(report.stockDraft,'STR_MAGIC=2\nSTR_ORE=4\nSTR_WOOD=3');
  assert.equal(report.finalChecklist.totals.shortageKinds,0);
  assert.equal(report.hypotheticalScenario.routeChoices.STR_A,'MAKE_A');
  assert.deepEqual(after.external,[]);
  assert.equal(JSON.stringify({inventory,choices,routeBaseline}),snapshot);
});

test('reaching maxRounds reports remaining shortages, never fake completion',()=>{
  const {report}=expandRouteAwareReadinessBatch({...args(),maxRounds:1});
  assert.equal(report.stopped,'round-limit');
  assert.equal(report.history.length,1);
  assert.deepEqual(report.remainingExternal.map(x=>[x.id,x.quantity]),
    [['STR_MAGIC',2]]);
  assert.equal(report.routeAndAcquisition.shortageUnits,2);
  assert.equal(report.acquiredHypothetically.find(x=>x.id==='STR_ORE').quantity,4);
});

test('when subsequent shortage is unknown to item catalogue, disclose the blocked pass',()=>{
  const custom={...planner,plan:(id,options)=>{
    const p=planner.plan(id,options);
    if(options.choices?.STR_A==='MAKE_A' && (options.inventory.STR_ORE||0)>=2)
      return {...p,external:[row('STR_UNINDEXED',5)]};
    return p;
  }};
  const customRouteBaseline=custom.plan(rootRecipeId,{inventory,choices});
  const {report}=expandRouteAwareReadinessBatch({
    ...args(),planner:custom,routeBaseline:customRouteBaseline,
    routeChecklist:buildManufacturingReadinessChecklist(
      customRouteBaseline,evidenceForPlan())
  });
  assert.equal(report.stopped,'stock-or-item-limit');
  assert.equal(report.history.length,0);
  assert.equal(report.remainingExternal[0].id,'STR_UNINDEXED');
});

test('invalid input amounts or invalid round limit fail before reporting success',()=>{
  for(const maxRounds of [0,-1,1.5,7])
    assert.throws(()=>expandRouteAwareReadinessBatch({...args(),maxRounds}),
      /1~6단계/);
  assert.throws(()=>expandRouteAwareReadinessBatch({
    ...args(),requestedQuantities:{STR_ORE:9}
  }),/가상 확보 수량/);
  assert.throws(()=>expandRouteAwareReadinessBatch({
    ...args(),choices:{STR_A:'NOT_MANUFACTURABLE'}
  }),/경로/);
});
