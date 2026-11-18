import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReadinessBatch, calculateReadinessBatch }
  from '../public/manufacture-v2/planner/readiness-acquisition-batch.mjs';
import { buildManufacturingReadinessChecklist }
  from '../public/manufacture-v2/planner/manufacturing-readiness-checklist.mjs';

const materials=[
  {id:'STR_A',name:'재료 A',quantity:8,reasons:['external-choice'],
    listedUnitBuy:10,listedBuySubtotal:80},
  {id:'STR_B',name:'재료 B',quantity:6,reasons:['depth-limit'],
    listedUnitBuy:null,listedBuySubtotal:null}
];
const evidence={
  schema:'xpiratez-v2-route-evidence/v1',
  facilityEvidenceSource:'no-single-base-selected',
  researchEvidenceSource:'no-discovered-data',
  recipeIds:['STR_ROOT'],
  facilities:[
    {recipeId:'STR_ROOT',functionId:'WORKS',status:'unverified'}
  ],
  research:[{id:'STR_RESEARCH',name:'연구',status:'unverified'}],
  unresolvedResearch:[]
};
const plan=(external=materials)=>({
  schema:'xpiratez-v2-manufacture-plan/v1',
  rootRecipeId:'STR_ROOT',external,
  totals:{declaredCost:120,declaredTime:10},
  flags:['unspecified-time']
});
const original=plan();
const originalChecklist=buildManufacturingReadinessChecklist(original,evidence);
const itemIds=new Map([
  ['STR_A',{}],['STR_B',{}],['STR_C',{}]
]);
const inventory={STR_A:2,STR_B:1};
const currentArgs=()=>({
  checklist:originalChecklist,plan:original,inventory,itemIds,
  selectedIds:new Set(['STR_A','STR_B']),
  requestedQuantities:new Map([['STR_A',3],['STR_B',2]])
});

test('a two-material selection creates exact nonmutating stock targets',()=>{
  const beforeInventory=JSON.stringify(inventory);
  const draft=prepareReadinessBatch(currentArgs());
  assert.equal(draft.selectedKinds,2);
  assert.equal(draft.selectedUnits,5);
  assert.deepEqual(draft.inventory,{STR_A:5,STR_B:3});
  assert.deepEqual(draft.additions.map(row=>[row.id,row.previous,row.target]),
    [['STR_A',2,5],['STR_B',1,3]]);
  assert.equal(JSON.stringify(inventory),beforeInventory);
});

test('independent simulation reports shortage and outstanding task changes',()=>{
  const snapshot=JSON.stringify({original,inventory,originalChecklist});
  const afterFor=stock=>plan([
    {...materials[0],quantity:Math.max(0,materials[0].quantity-(stock.STR_A-2))},
    {...materials[1],quantity:Math.max(0,materials[1].quantity-(stock.STR_B-1))}
  ].filter(row=>row.quantity>0));
  const completed=calculateReadinessBatch({
    ...currentArgs(),planWithInventory:afterFor,evidenceForPlan:()=>evidence
  });
  assert.equal(completed.report.schema,'xpiratez-v2-readiness-acquisition-batch/v1');
  assert.equal(completed.report.sourceVersion,'v.o2');
  assert.equal(completed.report.before.shortageUnits,14);
  assert.equal(completed.report.after.shortageUnits,9);
  assert.equal(completed.report.before.tasks,5);
  assert.equal(completed.report.after.tasks,5);
  assert.equal(completed.report.changedTasks.length,2);
  assert.equal(completed.report.newlyRequired.length,0);
  assert.equal(completed.report.noLongerListed.length,0);
  assert.equal(completed.report.stockDraft,'STR_A=5\nSTR_B=3');
  assert.equal(completed.report.acquiredHypothetically[0].listedUnitBuy,10);
  assert.equal(completed.report.acquiredHypothetically[0].listedBuyReference,30);
  assert.equal(completed.report.acquiredHypothetically[1].listedUnitBuy,null);
  assert.equal(completed.report.acquiredHypothetically[1].listedBuyReference,null);
  assert.equal(completed.report.hypotheticalScenario.evidence.schema,
    'xpiratez-v2-route-evidence/v1');
  assert.equal(completed.report.hypotheticalScenario.checklist.rootRecipeId,
    'STR_ROOT');
  assert.equal(JSON.stringify({original,inventory,originalChecklist}),snapshot);
});

test('revealed cascading shortage is not mislabeled as acquired',()=>{
  const completed=calculateReadinessBatch({
    ...currentArgs(),
    selectedIds:['STR_A'],requestedQuantities:{STR_A:8},
    planWithInventory:()=>plan([
      {id:'STR_B',name:'재료 B',quantity:6,reasons:['depth-limit']},
      {id:'STR_C',name:'숨겨진 재료 C',quantity:2,reasons:['external-choice']}
    ]),
    evidenceForPlan:()=>evidence
  });
  assert.equal(completed.report.after.shortageUnits,8);
  assert(completed.report.newlyRequired.some(row=>row.requirementId==='STR_C'));
  assert(completed.report.noLongerListed.some(row=>row.requirementId==='STR_A'));
  assert(completed.report.caveat.includes('가상 재고'));
});

test('cannot use stale checklist, other ID or invalid partial quantities',()=>{
  assert.throws(()=>prepareReadinessBatch({
    ...currentArgs(),plan:plan([{...materials[0],quantity:7},materials[1]])
  }),/다시 계산/);
  assert.throws(()=>prepareReadinessBatch({
    ...currentArgs(),selectedIds:['STR_RESEARCH']
  }),/체크리스트에 없는/);
  for(const value of [-1,0,1.2,'2',9]){
    assert.throws(()=>prepareReadinessBatch({
      ...currentArgs(),selectedIds:['STR_A'],
      requestedQuantities:{STR_A:value}
    }),/가상 확보 수량/);
  }
  assert.throws(()=>prepareReadinessBatch({
    ...currentArgs(),selectedIds:[]
  }),/선택/);
  assert.throws(()=>prepareReadinessBatch({
    ...currentArgs(),inventory:{STR_A:9999999,STR_B:1},
    selectedIds:['STR_A'],requestedQuantities:{STR_A:3}
  }),/10,000,000/);
});

test('rejects mismatched simulation result without treating it as a saved action',()=>{
  assert.throws(()=>calculateReadinessBatch({
    ...currentArgs(),
    planWithInventory:()=>({...original,rootRecipeId:'STR_WRONG'}),
    evidenceForPlan:()=>evidence
  }),/일치하지 않습니다/);
  assert.throws(()=>calculateReadinessBatch({
    ...currentArgs(),planWithInventory:null,evidenceForPlan:()=>evidence
  }),/계산 함수/);
});
