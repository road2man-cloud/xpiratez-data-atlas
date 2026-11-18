import test from 'node:test';
import assert from 'node:assert/strict';
import { exploreExternalCandidates, rankExternalCandidates,
  MAX_EXPLORE_ITEMS, MAX_EXPLORE_CANDIDATES }
  from '../public/manufacture-v2/planner/external-candidate-explorer.mjs';

const entries = [
  {id:'STR_A',name:'재료 A',quantity:8},
  {id:'STR_B',name:'재료 B',quantity:6},
  {id:'STR_C',name:'재료 C',quantity:4}
];
const baseline = (external=entries)=>({
  rootRecipeId:'STR_TEST_RECIPE',external,
  totals:{declaredCost:20,declaredTime:5},flags:[]
});
function mockPlanner(before, calls) {
  return inventory=>{
    calls.push({...inventory});
    return {
      rootRecipeId:before.rootRecipeId,
      external:before.external.map(row=>({
        ...row,quantity:Math.max(0,row.quantity-(inventory[row.id]||0))
      })).filter(row=>row.quantity),
      totals:{declaredCost:20,declaredTime:5},flags:[]
    };
  };
}
function explore(before, ids, extra={}) {
  const calls=[];
  const result=exploreExternalCandidates({
    before,inventory:{},itemIds:new Set(before.external.map(row=>row.id)),
    selectedIds:ids,planWithInventory:mockPlanner(before,calls),
    ...extra
  });
  return {result,calls};
}

test('three selected materials evaluate every singleton, pair and full basket',()=>{
  const {result,calls}=explore(baseline(),['STR_A','STR_B','STR_C'],{
    requestedQuantities:{STR_A:3,STR_B:2,STR_C:1}
  });
  assert.equal(result.sourceVersion,'v.o2');
  assert.equal(result.candidateCount,7);
  assert.equal(result.successes,7);
  assert.equal(calls.length,7);
  assert.equal(result.failures.length,0);
  assert.equal(result.omittedItems,0);
  assert.deepEqual(result.candidates.map(x=>x.type).sort(),
    ['single','single','single','pair','pair','pair','all'].sort());
  const full=result.candidates.find(x=>x.type==='all');
  assert.equal(full.acquiredUnits,6);
  assert.equal(full.shortageUnits,12);
  assert.equal(full.reducedUnits,6);
  assert.equal(full.reductionPerAcquiredUnit,1);
  assert.deepEqual(calls[0],{STR_A:3});
  assert.deepEqual(calls[1],{STR_B:2});
  assert.deepEqual(calls[2],{STR_C:1});
});

test('exploration never mutates original inventory or baseline plan',()=>{
  const before=baseline();
  const stock={STR_A:1,STR_B:2};
  const snapshot=JSON.stringify(before),stockSnapshot=JSON.stringify(stock);
  const calls=[];
  const result=exploreExternalCandidates({
    before,inventory:stock,itemIds:new Set(['STR_A','STR_B','STR_C']),
    selectedIds:new Set(['STR_A','STR_B']),
    requestedQuantities:new Map([['STR_A',2],['STR_B',1]]),
    planWithInventory:mockPlanner(before,calls)
  });
  assert.equal(result.candidateCount,3);
  assert.equal(JSON.stringify(before),snapshot);
  assert.equal(JSON.stringify(stock),stockSnapshot);
  assert(calls.every(item=>item.STR_A>=1&&item.STR_B>=2));
});

test('search is capped at six materials and 22 calculations',()=>{
  const many=Array.from({length:8},(_,i)=>({
    id:'STR_'+String.fromCharCode(65+i),
    name:'재료 '+i,quantity:8-i
  }));
  const {result,calls}=explore(baseline(many),many.map(row=>row.id));
  assert.equal(MAX_EXPLORE_ITEMS,6);
  assert.equal(MAX_EXPLORE_CANDIDATES,22);
  assert.equal(result.examinedItems,6);
  assert.equal(result.selectedTotal,8);
  assert.equal(result.omittedItems,2);
  assert.equal(result.candidateCount,22);
  assert.equal(calls.length,22);
  assert(result.candidates.every(candidate=>candidate.acquiredKinds<=6));
  assert(!result.candidates.some(candidate=>
    candidate.additions.some(item=>['STR_G','STR_H'].includes(item.id))));
});

test('candidate sort order stays deterministic and preserves original array',()=>{
  const input=[
    {key:'A',reducedUnits:4,reducedKinds:1,acquiredUnits:3,
      reductionPerAcquiredUnit:4/3,shortageUnits:8,shortageKinds:2},
    {key:'B',reducedUnits:4,reducedKinds:1,acquiredUnits:2,
      reductionPerAcquiredUnit:2,shortageUnits:8,shortageKinds:2},
    {key:'C',reducedUnits:6,reducedKinds:2,acquiredUnits:6,
      reductionPerAcquiredUnit:1,shortageUnits:6,shortageKinds:1}
  ];
  assert.deepEqual(rankExternalCandidates(input,'reduction').map(x=>x.key),
    ['C','B','A']);
  assert.deepEqual(rankExternalCandidates(input,'efficiency').map(x=>x.key),
    ['B','A','C']);
  assert.deepEqual(rankExternalCandidates(input,'remaining').map(x=>x.key),
    ['C','B','A']);
  assert.deepEqual(rankExternalCandidates(input,'acquired').map(x=>x.key),
    ['B','A','C']);
  assert.deepEqual(input.map(x=>x.key),['A','B','C']);
  assert.throws(()=>rankExternalCandidates(input,'cost-optimal'),/정렬/);
});

test('invalid quantities do not launch any calculator calls',()=>{
  const calls=[];
  assert.throws(()=>exploreExternalCandidates({
    before:baseline(),inventory:{},itemIds:new Set(['STR_A','STR_B','STR_C']),
    selectedIds:['STR_A','STR_B'],requestedQuantities:{STR_A:100},
    planWithInventory:mockPlanner(baseline(),calls)
  }),/가상 확보 수량/);
  assert.equal(calls.length,0);
});

test('one candidate failure is reported without discarding successful combinations',()=>{
  const before=baseline(),calls=[];
  const result=exploreExternalCandidates({
    before,inventory:{},itemIds:new Set(['STR_A','STR_B','STR_C']),
    selectedIds:['STR_A','STR_B'],
    planWithInventory:inventory=>{
      calls.push({...inventory});
      if(inventory.STR_A && inventory.STR_B)throw new Error('계획 복잡도 한계');
      return mockPlanner(before,[])(inventory);
    }
  });
  assert.equal(result.candidateCount,3);
  assert.equal(result.successes,2);
  assert.equal(result.failures.length,1);
  assert.equal(result.failures[0].error,'계획 복잡도 한계');
  assert.equal(calls.length,3);
});
