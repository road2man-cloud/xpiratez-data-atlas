import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareExternalBasket, compareExternalBasket, compareExternalBasketScenarios }
  from '../public/manufacture-v2/planner/external-basket-core.mjs';

const external=[
  {id:'STR_A',name:'가상 A',quantity:6},
  {id:'STR_B',name:'가상 B',quantity:4}
];
const itemIds=new Set(['STR_A','STR_B']);

test('multi-material acquisition recomputes stock in a copy and keeps inputs immutable',()=>{
  const stock={STR_A:3,STR_B:2};
  const basket=prepareExternalBasket({
    external,inventory:stock,selectedIds:new Set(['STR_A','STR_B']),itemIds
  });
  assert.deepEqual(stock,{STR_A:3,STR_B:2});
  assert.deepEqual(basket.inventory,{STR_A:9,STR_B:6});
  assert.equal(basket.selectedKinds,2);
  assert.equal(basket.selectedUnits,10);
  assert.deepEqual(basket.additions.map(x=>x.id),['STR_A','STR_B']);
  assert.deepEqual(basket.additions.map(x=>x.target),[9,6]);
});

test('selection must refer to a currently missing and catalogued item',()=>{
  assert.throws(()=>prepareExternalBasket({
    external,inventory:{},selectedIds:new Set(),itemIds
  }),/선택/);
  assert.throws(()=>prepareExternalBasket({
    external,inventory:{},selectedIds:new Set(['STR_STALE']),itemIds
  }),/확보할 수 없는/);
  assert.throws(()=>prepareExternalBasket({
    external,inventory:{},selectedIds:new Set(['STR_B']),itemIds:new Set(['STR_A'])
  }),/확보할 수 없는/);
});

test('cannot exceed inventory caps or fabricate an invalid shortage',()=>{
  assert.throws(()=>prepareExternalBasket({
    external,inventory:{STR_A:9999999},selectedIds:new Set(['STR_A']),itemIds
  }),/10,000,000/);
  assert.throws(()=>prepareExternalBasket({
    external:[{id:'STR_A',quantity:-3}],inventory:{},
    selectedIds:new Set(['STR_A']),itemIds
  }),/올바르지/);
  assert.throws(()=>prepareExternalBasket({
    external:[external[0],external[0]],inventory:{},
    selectedIds:new Set(['STR_A']),itemIds
  }),/중복/);
});

test('scenario reports newly revealed shortages and retains both sets of flags',()=>{
  const before={
    rootRecipeId:'STR_RECIPE',external:[{id:'STR_A',name:'가상 A',quantity:6}],
    totals:{declaredCost:100,declaredTime:3},flags:['불확실한 산출']
  };
  const after={
    rootRecipeId:'STR_RECIPE',external:[{id:'STR_B',name:'가상 B',quantity:2}],
    totals:{declaredCost:130,declaredTime:5},flags:['시설 조건 미확인']
  };
  const basket=prepareExternalBasket({
    external:before.external,inventory:{},selectedIds:new Set(['STR_A']),itemIds
  });
  const report=compareExternalBasket(before,after,basket);
  assert.equal(report.sourceVersion,'v.o2');
  assert.deepEqual(report.changes.map(x=>[x.id,x.before,x.after]),
    [['STR_A',6,0],['STR_B',0,2]]);
  assert.equal(report.initialShortage.units,6);
  assert.equal(report.hypotheticalShortage.units,2);
  assert.deepEqual(report.initialFlags,['불확실한 산출']);
  assert.deepEqual(report.hypotheticalFlags,['시설 조건 미확인']);
  assert.equal(before.external[0].quantity,6);
});

test('partial acquisition uses explicit per-item quantities and keeps the source unchanged',()=>{
  const original={STR_A:2,STR_B:1};
  const requested=new Map([['STR_A',2],['STR_B',1]]);
  const basket=prepareExternalBasket({
    external,inventory:original,selectedIds:new Set(['STR_A','STR_B']),
    requestedQuantities:requested,itemIds
  });
  assert.deepEqual(original,{STR_A:2,STR_B:1});
  assert.deepEqual(basket.inventory,{STR_A:4,STR_B:2});
  assert.equal(basket.selectedUnits,3);
  assert.deepEqual(basket.additions.map(x=>[x.id,x.quantity,x.shortage]),
    [['STR_A',2,6],['STR_B',1,4]]);
});

test('rejects zero, fractional and greater-than-shortage partial amounts',()=>{
  for(const amount of [0,-2,1.5,7,'3',NaN]){
    assert.throws(()=>prepareExternalBasket({
      external,inventory:{},selectedIds:new Set(['STR_A']),
      requestedQuantities:{STR_A:amount},itemIds
    }),/가상 확보 수량/);
  }
  assert.throws(()=>prepareExternalBasket({
    external,inventory:{STR_A:9999999},selectedIds:new Set(['STR_A']),
    requestedQuantities:{STR_A:2},itemIds
  }),/10,000,000/);
  const valid=prepareExternalBasket({
    external,inventory:{STR_A:9999999},selectedIds:new Set(['STR_A']),
    requestedQuantities:{STR_A:1},itemIds
  });
  assert.equal(valid.inventory.STR_A,10000000);
});

test('compares two independent saved baskets against the same baseline',()=>{
  const before={rootRecipeId:'STR_RECIPE',external,
    totals:{declaredCost:100,declaredTime:12},flags:[]};
  const basketA=prepareExternalBasket({
    external,inventory:{},selectedIds:['STR_A','STR_B'],
    requestedQuantities:{STR_A:2,STR_B:1},itemIds
  });
  const basketB=prepareExternalBasket({
    external,inventory:{},selectedIds:['STR_A','STR_B'],
    requestedQuantities:{STR_A:6,STR_B:4},itemIds
  });
  const afterA={rootRecipeId:'STR_RECIPE',
    external:[{id:'STR_A',name:'가상 A',quantity:4},{id:'STR_B',name:'가상 B',quantity:3}],
    totals:{declaredCost:102,declaredTime:13},flags:['불확실']};
  const afterB={rootRecipeId:'STR_RECIPE',external:[],
    totals:{declaredCost:100,declaredTime:12},flags:[]};
  const a=compareExternalBasket(before,afterA,basketA);
  const b=compareExternalBasket(before,afterB,basketB);
  const difference=compareExternalBasketScenarios(a,b);
  assert.equal(difference.schema,'xpiratez-v2-single-recipe-acquisition-scenarios/v1');
  assert.equal(difference.scenarioA.acquiredUnits,3);
  assert.equal(difference.scenarioB.acquiredUnits,10);
  assert.equal(difference.differenceBMinusA.shortageUnits,-7);
  assert.deepEqual(difference.materials.map(x=>[x.id,x.aShortage,x.bShortage]),
    [['STR_A',4,0],['STR_B',3,0]]);
  assert.equal(before.external[0].quantity,6);
});

test('refuses to compare A/B baskets with different initial plans',()=>{
  const basis={rootRecipeId:'STR_RECIPE',external,
    totals:{declaredCost:100,declaredTime:12},flags:[]};
  const altered={...basis,external:[{...external[0],quantity:5},external[1]]};
  const basket=prepareExternalBasket({
    external,inventory:{},selectedIds:new Set(['STR_A']),itemIds,
    requestedQuantities:{STR_A:1}
  });
  const a=compareExternalBasket(basis,basis,basket);
  const b=compareExternalBasket(altered,altered,basket);
  assert.throws(()=>compareExternalBasketScenarios(a,b),/같은 제조 목표/);
});
