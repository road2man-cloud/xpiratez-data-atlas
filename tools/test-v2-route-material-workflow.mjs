import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteAcquisitionLedger }
  from '../public/manufacture-v2/planner/route-acquisition-ledger.mjs';
import { buildRouteMaterialWorkflow,routeMaterialWorkflowCsvRows }
  from '../public/manufacture-v2/planner/route-material-workflow.mjs';

const mat=(id,quantity,status='external',children=[])=>({
  kind:'item',id,name:id,quantity,status,
  inventoryUsed:0,surplusUsed:0,children
});
const rec=(id,count,inputs=[],extra={})=>({
  kind:'recipe',id,name:id,count,
  cost:3*count,time:2*count,
  inputs,prerequisites:[],...extra
});
const root='STR_ROOT';
const routeBaseline={
  rootRecipeId:root,
  external:[{id:'STR_ORE',name:'광석',quantity:4,reasons:['depth-limit']}],
  tree:rec(root,1,[
    mat('STR_A',2,'manufactured',[
      rec('STR_MAKE_A',2,[mat('STR_ORE',4,'depth-limit')])
    ]),
    mat('STR_B',1,'manufactured',[rec('STR_MAKE_B',1)])
  ])
};
const finalPlan={
  rootRecipeId:root,
  external:[{id:'STR_UNKNOWN',name:'미해결 재료',quantity:1,
    reasons:['invalid-choice']}],
  tree:rec(root,1,[
    mat('STR_A',2,'stock-covered'),
    mat('STR_B',1,'manufactured',[rec('STR_MAKE_B',1,[
      mat('STR_WOOD',2,'stock-covered')
    ])])
  ]),
  inventory:{consumed:{STR_A:2,STR_WOOD:2}}
};
const cascadeReport={
  schema:'xpiratez-v2-route-aware-cascade/v1',sourceVersion:'v.o2',
  rootRecipeId:root,
  initialAcquired:[{id:'STR_ORE',name:'광석',quantity:3}],
  history:[{
    round:1,
    shortageBefore:{kinds:2,units:3},
    shortageBeforeDetails:[
      {id:'STR_ORE',name:'광석',quantity:1,reasons:['depth-limit']},
      {id:'STR_WOOD',name:'나무',quantity:2,reasons:['choice-required']}
    ],
    added:[
      {id:'STR_ORE',name:'광석',quantity:1},
      {id:'STR_WOOD',name:'나무',quantity:2}
    ],
    addedUnits:3,addedKinds:2,
    shortageAfter:{kinds:1,units:1},
    newlyExposed:[{id:'STR_UNKNOWN',name:'미해결 재료',quantity:1,
      reasons:['invalid-choice']}]
  }],
  acquiredHypothetically:[
    {id:'STR_ORE',name:'광석',quantity:4,previous:1,target:5,
      firstPass:3,listedUnitBuy:12},
    {id:'STR_WOOD',name:'나무',quantity:2,previous:0,target:2,
      firstPass:0,listedUnitBuy:null}
  ],
  remainingExternal:[{id:'STR_UNKNOWN',name:'미해결 재료',quantity:1}],
  routeOnly:{shortageKinds:1,shortageUnits:4},
  routeAndAcquisition:{shortageKinds:1,shortageUnits:1},
  stopped:'round-limit'
};
const ready=()=>{
  const report={...cascadeReport};
  report.acquisitionLedger=buildRouteAcquisitionLedger(report,{STR_ORE:1});
  return report;
};

test('grounded procurement categories do not claim availability',()=>{
  const report=ready();
  const snapshot=JSON.stringify({report,routeBaseline,finalPlan});
  const workflow=buildRouteMaterialWorkflow({report,routeBaseline,finalPlan});
  assert.equal(workflow.schema,'xpiratez-v2-route-material-workflow/v1');
  const ids=Object.fromEntries(workflow.materials.map(x=>[x.id,x]));
  assert.equal(ids.STR_ORE.categoryId,'depth-limit');
  assert.equal(ids.STR_WOOD.categoryId,'choice-needed');
  assert.equal(ids.STR_UNKNOWN.categoryId,'route-invalid');
  assert.equal(ids.STR_UNKNOWN.origin,'unresolved-only');
  assert.equal(ids.STR_WOOD.origin,'later-round');
  assert.equal(ids.STR_ORE.origin,'initial-selected');
  assert.equal(ids.STR_ORE.totalAcquisition,4);
  assert.equal(ids.STR_ORE.hypotheticalStockTarget,5);
  assert.equal(ids.STR_UNKNOWN.remainingShortage,1);
  assert(workflow.materials.every(x=>x.availability==='unverified'));
  assert.deepEqual(workflow.procurementGroups.map(x=>x.id),
    ['route-invalid','choice-needed','depth-limit']);
  assert.equal(workflow.summary.materialKinds,3);
  assert.equal(workflow.summary.hypotheticalAcquisitionUnits,6);
  assert.equal(workflow.summary.remainingShortageUnits,1);
  assert.equal(JSON.stringify({report,routeBaseline,finalPlan}),snapshot);
});

test('manufacturing order shows children before parents with dependency step references',()=>{
  const workflow=buildRouteMaterialWorkflow({
    report:ready(),routeBaseline,finalPlan
  });
  assert.deepEqual(workflow.recipeSequenceBefore.map(x=>[x.position,x.recipeId]),
    [[1,'STR_MAKE_A'],[2,'STR_MAKE_B'],[3,root]]);
  assert.deepEqual(workflow.recipeSequenceAfter.map(x=>[x.position,x.recipeId]),
    [[1,'STR_MAKE_B'],[2,root]]);
  assert.deepEqual(workflow.recipeSequenceAfter[1].prerequisiteStepNumbers,[1]);
  assert.equal(workflow.recipeSequenceAfter[0].inputMaterials[0].status,'stock-covered');
  assert.deepEqual(workflow.recipeChanges.map(x=>[
    x.recipeId,x.beforeBatches,x.afterBatches
  ]),[['STR_MAKE_A',2,0]]);
  assert.deepEqual(workflow.stockConsumption.map(x=>[
    x.id,x.quantityFromPlannedStock
  ]),[['STR_A',2],['STR_WOOD',2]]);
});

test('work-order CSV includes materials and recipes with no fabricated price',()=>{
  const workflow=buildRouteMaterialWorkflow({
    report:ready(),routeBaseline,finalPlan
  });
  const csv=routeMaterialWorkflowCsvRows(workflow);
  assert.equal(csv[0][0],'종류');
  assert.equal(csv[0][10],'하위 제조식 선행 순서');
  assert.equal(csv.length,1+3+2);
  const wood=csv.find(x=>x[2]==='STR_WOOD');
  assert.equal(wood[4],'복수 제조 경로 선택 필요');
  assert.equal(wood[7],2);
  const rootRow=csv.find(x=>x[2]===root);
  assert.equal(rootRow[0],'제조식');
  assert.equal(rootRow[1],2);
  assert.equal(rootRow[10],'1');
  assert.equal(rootRow[9],1);
});

test('multiple reasons show the blocking route issue instead of implying purchase',()=>{
  const before={
    ...routeBaseline,
    external:[{...routeBaseline.external[0],
      reasons:['user-external','invalid-choice','depth-limit']}]
  };
  const workflow=buildRouteMaterialWorkflow({
    report:ready(),routeBaseline:before,finalPlan
  });
  const ore=workflow.materials.find(x=>x.id==='STR_ORE');
  assert.equal(ore.categoryId,'route-invalid');
  assert.equal(workflow.procurementGroups.find(x=>x.id==='route-invalid').label,
    '선택한 경로 오류');
  assert(ore.reasonIds.includes('user-external'));
  assert.equal(ore.availability,'unverified');
});

test('cannot use a different recipe or invented recipe node count',()=>{
  const report=ready();
  assert.throws(()=>buildRouteMaterialWorkflow({
    report,routeBaseline,finalPlan:{...finalPlan,rootRecipeId:'OTHER'}
  }),/같은 제조 목표/);
  assert.throws(()=>buildRouteMaterialWorkflow({
    report,routeBaseline:{...routeBaseline,tree:rec(root,1,[
      mat('STR_A',1,'manufactured',[{kind:'recipe',id:'BROKEN',inputs:[]}])
    ])},finalPlan
  }),/제조 순서/);
  assert.throws(()=>routeMaterialWorkflowCsvRows({schema:'incorrect'}),/유효하지 않습니다/);
});
