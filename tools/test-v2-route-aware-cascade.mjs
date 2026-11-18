import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRouteAwareReadinessBatch }
  from '../public/manufacture-v2/planner/route-aware-cascade.mjs';
import { buildRouteAcquisitionLedger,routeAcquisitionLedgerCsvRows }
  from '../public/manufacture-v2/planner/route-acquisition-ledger.mjs';
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
  assert.equal(report.acquisitionLedger.schema,'xpiratez-v2-route-acquisition-ledger/v1');
  assert.deepEqual(report.acquisitionLedger.stages.map(x=>x.addedUnits),[2,5,2]);
  assert.equal(report.acquisitionLedger.summary.totalAcquiredUnits,9);
  assert.equal(report.acquisitionLedger.summary.initialUnits,2);
  assert.equal(report.acquisitionLedger.summary.additionalUnits,7);
  assert.equal(report.acquisitionLedger.summary.remainingShortageUnits,0);
  assert.deepEqual(report.acquisitionLedger.materials.map(x=>[
    x.id,x.initialAcquisition,x.rounds,x.hypotheticalStockTarget
  ]),[
    ['STR_MAGIC',0,[0,2],2],
    ['STR_ORE',2,[2,0],4],
    ['STR_WOOD',0,[3,0],3]
  ]);
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
  assert.equal(report.acquisitionLedger.summary.remainingShortageUnits,2);
  assert.equal(report.acquisitionLedger.materials.find(x=>x.id==='STR_MAGIC').remainingShortage,2);
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
  assert.equal(report.acquisitionLedger.summary.remainingShortageKinds,1);
  assert.equal(report.acquisitionLedger.materials.find(x=>x.id==='STR_UNINDEXED').totalAcquisition,0);
  assert.equal(report.acquisitionLedger.materials.find(x=>x.id==='STR_UNINDEXED').remainingShortage,5);
});


test('per-stage CSV exports all additions and readable current-stock targets',()=>{
  const {report}=expandRouteAwareReadinessBatch({...args(),maxRounds:4});
  const rows=routeAcquisitionLedgerCsvRows(report.acquisitionLedger);
  const header=rows[0],items=rows.slice(1);
  assert.equal(items.length,3);
  assert(header.includes('최초 선택 가정'));
  assert(header.includes('추가 1단계 추가 가정'));
  assert(header.includes('추가 2단계 추가 가정'));
  assert(header.includes('확보 후 가상 재고'));
  const get=id=>items.find(row=>row[0]===id);
  const index=s=>header.indexOf(s);
  assert.equal(get('STR_ORE')[index('최초 선택 가정')],2);
  assert.equal(get('STR_ORE')[index('추가 1단계 추가 가정')],2);
  assert.equal(get('STR_WOOD')[index('추가 1단계 추가 가정')],3);
  assert.equal(get('STR_MAGIC')[index('추가 2단계 추가 가정')],2);
  assert.equal(get('STR_ORE')[index('총 추가 확보 가정')],4);
  assert.equal(get('STR_MAGIC')[index('확보 후 가상 재고')],2);
  assert.equal(get('STR_MAGIC')[index('반복 종료 시 남은 부족')],0);
});

test('starting inventory is not counted as a new acquisition',()=>{
  const stock={STR_ORE:1},startingPlan=planner.plan(rootRecipeId,{inventory:stock});
  const edited=planner.plan(rootRecipeId,{inventory:stock,choices});
  const {report}=expandRouteAwareReadinessBatch({
    ...args(),inventory:stock,originalPlan:startingPlan,routeBaseline:edited,
    originalChecklist:buildManufacturingReadinessChecklist(startingPlan,evidenceForPlan()),
    routeChecklist:buildManufacturingReadinessChecklist(edited,evidenceForPlan()),
    requestedQuantities:{STR_ORE:1}
  });
  const ore=report.acquisitionLedger.materials.find(row=>row.id==='STR_ORE');
  assert.equal(ore.startingInventory,1);
  assert.equal(ore.initialAcquisition,1);
  assert.equal(ore.totalAcquisition,3);
  assert.equal(ore.hypotheticalStockTarget,4);
  assert.equal(stock.STR_ORE,1);
  assert(report.stockDraft.includes('STR_ORE=4'));
});

test('known ruleset reference prices are never extrapolated into unknown items',()=>{
  const pricedPlanner={
    ...planner,
    itemMap:new Map([
      ['STR_A',{}],['STR_ORE',{fields:{costBuy:12}}],
      ['STR_WOOD',{fields:{costBuy:3}}],
      ['STR_MAGIC',{fields:{}}]
    ])
  };
  const {report}=expandRouteAwareReadinessBatch({
    ...args(),planner:pricedPlanner
  });
  const ledger=report.acquisitionLedger;
  assert.equal(ledger.summary.pricedKinds,2);
  assert.equal(ledger.summary.unpricedKinds,1);
  assert.equal(ledger.summary.knownReferenceSubtotal,57);
  assert.equal(ledger.summary.fullReferenceSubtotal,null);
  assert.equal(ledger.materials.find(x=>x.id==='STR_ORE').referenceSubtotal,48);
  assert.equal(ledger.materials.find(x=>x.id==='STR_MAGIC').referenceSubtotal,null);
});

test('ledger rejects corrupted cumulative assumptions rather than exporting a false plan',()=>{
  const {report}=expandRouteAwareReadinessBatch({...args()});
  const mutated={...report,acquiredHypothetically:report.acquiredHypothetically
    .map((x,i)=>i===0?{...x,quantity:x.quantity+1}:x)};
  assert.throws(()=>buildRouteAcquisitionLedger(mutated,{}),
    /일치하지 않습니다/);
  assert.throws(()=>buildRouteAcquisitionLedger({
    ...report,history:[{...report.history[0],round:2},...report.history.slice(1)]
  },{}),/단계 순서/);
  assert.throws(()=>buildRouteAcquisitionLedger(report,{STR_ORE:10000001}),
    /현재 재고/);
  assert.throws(()=>routeAcquisitionLedgerCsvRows({schema:'invalid'}),
    /단계별 조달 목록/);
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
