import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareExternalBasket, compareExternalBasket }
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
