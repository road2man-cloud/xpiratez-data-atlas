import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManufacturingReadinessChecklist, compareManufacturingChecklists }
  from '../public/manufacture-v2/planner/manufacturing-readiness-checklist.mjs';

const plan={
  schema:'xpiratez-v2-manufacture-plan/v1',
  rootRecipeId:'STR_FACTORY',
  external:[
    {id:'STR_CHEMICALS',name:'화학물질',quantity:12,
      reasons:['depth-limit'],listedUnitBuy:8,listedBuySubtotal:96},
    {id:'STR_METAL',name:'고철',quantity:3,
      reasons:['external'],listedUnitBuy:null,listedBuySubtotal:null}
  ],
  flags:['depth-limit','unspecified-time']
};
const evidence={
  schema:'xpiratez-v2-route-evidence/v1',
  recipeIds:['STR_FACTORY','STR_SUB'],
  facilityEvidenceSource:'saved-single-base',
  researchEvidenceSource:'saved-discovered',
  facilities:[
    {recipeId:'STR_FACTORY',functionId:'WORKS',status:'confirmed'},
    {recipeId:'STR_SUB',functionId:'WORKS',status:'confirmed'},
    {recipeId:'STR_FACTORY',functionId:'ALKO',status:'pending'},
    {recipeId:'STR_SUB',functionId:'ALKO',status:'pending'},
    {recipeId:'STR_SUB',functionId:'SHOP',status:'notObserved'}
  ],
  research:[
    {id:'STR_DISC',name:'확인된 연구',status:'confirmed'},
    {id:'STR_UNSEEN',name:'미관측 연구',status:'notInDiscovered'},
    {id:'STR_NO_SAVE',name:'미확인 연구',status:'unverified'}
  ],
  unresolvedResearch:[{id:'STR_BAD',status:'unknown-reference'}]
};

test('builds one unified prioritized list without double-counting shared facility requirements',()=>{
  const snapshot=JSON.stringify({plan,evidence});
  const result=buildManufacturingReadinessChecklist(plan,evidence);
  assert.equal(result.schema,'xpiratez-v2-single-goal-readiness-checklist/v1');
  assert.equal(result.totals.shortageKinds,2);
  assert.equal(result.totals.shortageUnits,15);
  assert.equal(result.totals.facilityFunctions,2);
  assert.equal(result.totals.researchReferences,3);
  assert.equal(result.totals.unverifiedRuleFlags,2);
  assert.equal(result.totals.tasks,9);
  assert.deepEqual(result.tasks.slice(0,2).map(x=>x.category),
    ['material','material']);
  const alko=result.tasks.find(x=>x.key==='facility::ALKO');
  assert.equal(alko.status,'pending');
  assert.equal(alko.priority,2);
  assert.deepEqual(alko.recipeIds,['STR_FACTORY','STR_SUB']);
  assert(!result.tasks.some(x=>x.key==='facility::WORKS'));
  assert(result.tasks.some(x=>x.key==='research::STR_UNSEEN' &&
    x.status==='notInDiscovered'));
  assert(!result.tasks.some(x=>x.key==='research::STR_DISC'));
  assert.equal(result.tasks.find(x=>x.key==='material::STR_CHEMICALS').listedBuySubtotal,96);
  assert.equal(JSON.stringify({plan,evidence}),snapshot);
});

test('missing single-base evidence is a verification task rather than a false blocker',()=>{
  const unknown={
    ...evidence,facilityEvidenceSource:'no-single-base-selected',
    researchEvidenceSource:'no-discovered-data',
    facilities:[{recipeId:'STR_FACTORY',functionId:'WORKS',status:'unverified'}],
    research:[{id:'STR_UNSEEN',name:'기술',status:'unverified'}],
    unresolvedResearch:[]
  };
  const result=buildManufacturingReadinessChecklist(plan,unknown);
  assert.equal(result.groups.facility.kinds,1);
  assert.equal(result.tasks.find(x=>x.key==='facility::WORKS').status,'unverified');
  assert(result.tasks.find(x=>x.key==='facility::WORKS').action.includes('근거 확인'));
  assert.equal(result.tasks.find(x=>x.key==='research::STR_UNSEEN').status,'unverified');
  assert(!result.tasks.some(x=>x.status==='blocked' || x.status==='impossible'));
});

test('comparing checklists reports additions, removals and changed shortages separately',()=>{
  const before=buildManufacturingReadinessChecklist(plan,evidence);
  const modified={
    ...plan,external:[
      {id:'STR_CHEMICALS',name:'화학물질',quantity:7,reasons:['depth-limit']},
      {id:'STR_NEW',name:'신규',quantity:2,reasons:['external-choice']}
    ],
    flags:['depth-limit']
  };
  const later=buildManufacturingReadinessChecklist(modified,evidence);
  const diff=compareManufacturingChecklists(before,later);
  assert.equal(diff.schema,'xpiratez-v2-checklist-changes/v1');
  assert.deepEqual(diff.added.map(x=>x.key),['material::STR_NEW']);
  assert.deepEqual(diff.removed.map(x=>x.key),
    ['material::STR_METAL','rule::unspecified-time']);
  assert.deepEqual(diff.changed.map(x=>[x.key,x.previous.quantity,x.current.quantity]),
    [['material::STR_CHEMICALS',12,7]]);
  assert.equal(before.totals.shortageUnits,15);
  assert.equal(later.totals.shortageUnits,9);
});

test('rejects contradictory v.o2 plan and evidence payloads',()=>{
  assert.throws(()=>buildManufacturingReadinessChecklist({...plan,schema:'old'},evidence),
    /v.o2 제조 계획/);
  assert.throws(()=>buildManufacturingReadinessChecklist(plan,{...evidence,schema:'old'}),
    /v.o2 제조 계획/);
  assert.throws(()=>buildManufacturingReadinessChecklist({
    ...plan,external:[plan.external[0],plan.external[0]]
  },evidence),/부족 재료/);
  assert.throws(()=>buildManufacturingReadinessChecklist({
    ...plan,external:[{id:'STR_CHEMICALS',quantity:0}]
  },evidence),/부족 재료/);
  assert.throws(()=>compareManufacturingChecklists(
    buildManufacturingReadinessChecklist(plan,evidence),
    {...buildManufacturingReadinessChecklist(plan,evidence),rootRecipeId:'STR_OTHER'}
  ),/동일 제조 목표/);
});
