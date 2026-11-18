import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCandidateHandoff }
  from '../public/manufacture-v2/planner/external-candidate-handoff.mjs';

const external=[
  {id:'STR_ALPHA',name:'알파',quantity:9},
  {id:'STR_BETA',name:'베타',quantity:6}
];
const itemIds=new Set(['STR_ALPHA','STR_BETA']);
const candidate={
  report:{sourceVersion:'v.o2',rootRecipeId:'STR_FACTORY'},
  additions:[
    {id:'STR_BETA',quantity:2},
    {id:'STR_ALPHA',quantity:4}
  ]
};
const args=()=>({
  candidate,rootRecipeId:'STR_FACTORY',external,inventory:{STR_ALPHA:3},
  itemIds
});

test('turns explorer candidate into exact target stock draft, without mutating source',()=>{
  const inputs=args(),snapshot=JSON.stringify(inputs.inventory);
  const result=prepareCandidateHandoff(inputs);
  assert.equal(result.selectedUnits,6);
  assert.equal(result.selectedKinds,2);
  assert.deepEqual([...result.selectedIds].sort(),['STR_ALPHA','STR_BETA']);
  assert.equal(result.requestedQuantities.get('STR_ALPHA'),4);
  assert.equal(result.requestedQuantities.get('STR_BETA'),2);
  assert.deepEqual(result.additions.map(x=>x.target),[7,2]);
  assert.equal(result.stockText,'STR_ALPHA=7\nSTR_BETA=2');
  assert.equal(JSON.stringify(inputs.inventory),snapshot);
  assert.equal(candidate.additions[0].quantity,2);
});

test('refuses mismatched goal, legacy data, unknown materials, or stale shortage',()=>{
  assert.throws(()=>prepareCandidateHandoff({...args(),rootRecipeId:'OTHER'}),
    /현재 제조 목표/);
  assert.throws(()=>prepareCandidateHandoff({
    ...args(),candidate:{...candidate,report:{...candidate.report,sourceVersion:'v.o1'}}
  }),/현재 제조 목표/);
  assert.throws(()=>prepareCandidateHandoff({
    ...args(),itemIds:new Set(['STR_ALPHA'])
  }),/확보할 수 없는/);
  assert.throws(()=>prepareCandidateHandoff({
    ...args(),external:[{id:'STR_BETA',quantity:6}]
  }),/확보할 수 없는/);
  assert.throws(()=>prepareCandidateHandoff({
    ...args(),external:[{id:'STR_ALPHA',quantity:2},external[1]]
  }),/가상 확보 수량/);
});

test('rejects duplicate candidates and invalid quantities',()=>{
  const make=additions=>prepareCandidateHandoff({
    ...args(),candidate:{...candidate,additions}
  });
  assert.throws(()=>make([candidate.additions[0],candidate.additions[0]]),/중복/);
  assert.throws(()=>make([]),/확보할 재료가 없는/);
  assert.throws(()=>make([{id:'STR_ALPHA',quantity:0}]),/가상 확보 수량/);
  assert.throws(()=>make([{id:'STR_ALPHA',quantity:2.5}]),/가상 확보 수량/);
});

test('protects the stock cap before producing an input draft',()=>{
  assert.throws(()=>prepareCandidateHandoff({
    ...args(),inventory:{STR_ALPHA:9999999},
    candidate:{...candidate,additions:[{id:'STR_ALPHA',quantity:4}]}
  }),/10,000,000/);
});
