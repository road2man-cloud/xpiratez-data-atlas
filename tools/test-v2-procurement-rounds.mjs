import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createManufacturingPlanner } from '../public/manufacture-v2/planner/planner-core.mjs';
import { exploreProcurementRounds } from '../public/manufacture-v2/planner/procurement-rounds-core.mjs';

const base = fileURLToPath(new URL('../public/data/',import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(base+name+'-v2-index.json','utf8'));
const planner=createManufacturingPlanner({
  items:read('items'),research:read('research'),manufacture:read('manufacture')
});
const settings={jobs:[{key:'new',recipeId:'STR_3RL_HE_XXX',batches:1}],
  inventory:{},maxDepth:0};

test('bounded acquisition search starts with missing materials and does not mutate inventory',()=>{
  const original=structuredClone(settings);
  const result=exploreProcurementRounds(planner,settings);
  assert.equal(result.schema,'xpiratez-v2-procurement-rounds/v1');
  assert(result.rounds.length>=1&&result.rounds.length<=4);
  assert(result.final.summary.afterExternalUnits <= result.final.summary.beforeExternalUnits);
  assert.deepEqual(settings,original);
  assert(result.rounds[0].unresolvedKinds>0);
  assert(Object.keys(result.additions).length>0);
});
test('round caps and invalid keys are rejected',()=>{
  for(const rounds of [0,9,2.5])
    assert.throws(()=>exploreProcurementRounds(planner,settings,{}, {},{maxRounds:rounds}),/1~8/);
  assert.throws(()=>exploreProcurementRounds(planner,settings,{}, {STR_UNKNOWN:1}),/2.1/);
});
test('existing virtual additions remain in proposal and cumulative quantity is bounded',()=>{
  const res=exploreProcurementRounds(planner,settings,{}, {STR_CHEMICALS:2}, {maxRounds:2});
  assert(res.additions.STR_CHEMICALS>=2);
  assert(res.rounds.length<=2);
});
test('no external material produces zero-round additions, without claiming facility readiness',()=>{
  const required=planner.recipeMap.get('STR_3RL_HE_XXX')?.fields?.requiredItems;
  assert(required && Object.keys(required).length>0);
  const held=Object.fromEntries(Object.entries(required).map(([id,n])=>[id,n]));
  const result=exploreProcurementRounds(planner,{...settings,inventory:held});
  assert.equal(result.stopReason,'no-external-shortage');
  assert.equal(result.final.summary.afterExternalUnits,0);
  assert.deepEqual(result.additions,{});
});
