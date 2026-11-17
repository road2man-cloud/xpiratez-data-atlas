import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseSavedBaseOperations, facilityReadiness, productionOrders } from '../public/manufacture-v2/planner/save-operations-core.mjs';

const fixture = `version: Extended 8.7.1
mods:
  - 'piratez ver: v.o2'
---
difficulty: 1
bases:
  - lon: 0.1
    name: Fixture One
    facilities:
      - type: STR_RED_FORGE
        x: 0
        y: 0
      - type: STR_STILL
        buildTime: 8
        x: 1
        y: 0
    items: {}
    productions:
      - item: STR_3RL_HE_XXX
        assigned: 7
        spent: 140
        amount: 12
        infinite: false
  - lon: 0.2
    name: Fixture Two
    facilities: []
    items: {}
    productions: []
discovered:
  - STR_3RL
`;
const catalog={facilities:[
  {id:'STR_RED_FORGE',fields:{provideBaseFunc:['WORKS','SHOP']}},
  {id:'STR_STILL',fields:{provideBaseFunc:['ALKO']}}
]};
const recipe={id:'STR_TEST',fields:{requiresBaseFunc:['WORKS','ALKO']}};
test('base-level facility instances and order fields are extracted without nested inventory',()=>{
  const bases=parseSavedBaseOperations(fixture);
  assert.equal(bases.length,2);
  assert.equal(bases[0].facilities.length,2);
  assert.equal(bases[0].productions.length,1);
  assert.deepEqual(bases[0].productions[0],{
    item:'STR_3RL_HE_XXX', assigned:7, spent:140, amount:12, infinite:false
  });
  assert.equal(bases[1].facilitiesPresent,true);
  assert.equal(bases[1].productionsPresent,true);
  assert.deepEqual(bases[1].facilities,[]);
});
test('only completed-instance explicit functions meet factory requirements',()=>{
  const b=parseSavedBaseOperations(fixture)[0];
  const result=facilityReadiness(b,catalog,recipe);
  assert.deepEqual(result.required,['WORKS','ALKO']);
  assert(result.provided.includes('WORKS'));
  assert(!result.provided.includes('ALKO'));
  assert.deepEqual(result.missing,['ALKO']);
  assert(result.pending.includes('ALKO'));
});
test('saved production orders are not fabricated as completion times',()=>{
  const b=parseSavedBaseOperations(fixture)[0];
  const result=productionOrders(b,{entries:[{id:'STR_3RL_HE_XXX',koName:'고폭 로켓',fields:{}}]});
  assert.equal(result[0].catalogued,true);
  assert.equal(result[0].assigned,7);
  assert.equal(result[0].spent,140);
  assert.equal(result[0].amount,12);
  assert.equal(result[0].remainingTime,undefined);
  assert.equal(result[0].name,'고폭 로켓');
});
test('unknown facility types and unknown orders are identified without inventing capabilities',()=>{
  const b={facilitiesPresent:true,facilities:[{type:'STR_EXTRA_MOD'}],
    productions:[{item:'STR_UNVERIFIED',assigned:1}]};
  const result=facilityReadiness(b,catalog,recipe);
  assert.deepEqual(result.unrecognizedFacilities,['STR_EXTRA_MOD']);
  assert.deepEqual(result.missing,['WORKS','ALKO']);
  assert.equal(productionOrders(b,{entries:[]})[0].catalogued,false);
});
test('invalid saved facility/order quantities are refused',()=>{
  assert.throws(()=>parseSavedBaseOperations(fixture.replace('assigned: 7','assigned: -1')),/assigned/);
  assert.throws(()=>parseSavedBaseOperations(fixture.replace('spent: 140','spent: infinite')),/spent/);
  assert.throws(()=>parseSavedBaseOperations(fixture.replace('infinite: false','infinite: maybe')),/불리언/);
});
const local=process.env.XPIRATEZ_V2_SAVE;
if(local){
  const require=createRequire(import.meta.url);
  const yaml=require('js-yaml');
  test('local 2.1 base facilities and orders match full YAML save without publishing it',()=>{
    const raw=fs.readFileSync(local,'utf8');
    const docs=[];
    yaml.loadAll(raw,x=>docs.push(x),{json:true});
    const parsed=parseSavedBaseOperations(raw);
    assert.equal(parsed.length,docs[1].bases.length);
    parsed.forEach((base,i)=>{
      assert.deepEqual(base.facilities.map(x=>x.type),(docs[1].bases[i].facilities||[]).map(x=>x.type));
      assert.deepEqual(base.productions.map(x=>x.item),(docs[1].bases[i].productions||[]).map(x=>x.item));
      assert.equal(base.productions.length,(docs[1].bases[i].productions||[]).length);
      for(let j=0;j<base.productions.length;j++){
        const original=docs[1].bases[i].productions[j];
        for(const k of ['assigned','spent','amount','infinite','sell'])
          assert.equal(base.productions[j][k],original[k]);
      }
    });
  });
}
