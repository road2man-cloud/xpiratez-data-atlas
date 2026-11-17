import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createManufacturingPlanner } from '../public/manufacture-v2/planner/planner-core.mjs';
import { simulateManufacturingQueue } from '../public/manufacture-v2/planner/queue-core.mjs';
import { compareProcurementAcquisitions } from '../public/manufacture-v2/planner/procurement-whatif-core.mjs';

const mock=()=>{
  const manifest='verified-v.o2-fixture';
  const meta=kind=>({schema:'xpiratez-v2-mod-'+kind+'/v1',sourceVersion:'v.o2',
    sourceManifestSha256:manifest,itemIndexSha256:'matching-item-data'});
  const recipe=(id,fields)=>({id,koName:id,sourceFiles:['Fixture.rul'],
    fields,links:{unlockedByResearch:[]}});
  return createManufacturingPlanner({
    items:{meta:meta('items'),items:[
      {id:'A',koName:'A',fields:{costBuy:12}},
      {id:'B',koName:'B',fields:{}}
    ]},
    research:{meta:meta('research'),entries:[]},
    manufacture:{meta:meta('manufacture'),entries:[
      recipe('USE_A',{requiredItems:{A:3},cost:10,time:2}),
      recipe('MAKE_A',{requiredItems:{B:1},producedItems:{A:2},cost:15,time:4})
    ]}
  });
};
const scenario=()=>{
  return {jobs:[{key:'new',source:'new',recipeId:'USE_A',batches:2}],
    maxDepth:0,inventory:{A:2}};
};
test('virtual acquisitions reduce only hypothetical external demand, leaving save inventory immutable',()=>{
  const p=mock(), settings=scenario();
  const saved=structuredClone(settings);
  const initial=simulateManufacturingQueue(p,settings);
  const report=compareProcurementAcquisitions(p,settings,{}, {A:4},initial);
  assert.deepEqual(settings,saved);
  assert.equal(report.summary.beforeExternalUnits,4);
  assert.equal(report.summary.afterExternalUnits,0);
  assert.equal(report.summary.jobsWithNoExternalMaterialsBefore,0);
  assert.equal(report.summary.jobsWithNoExternalMaterialsAfter,1);
  assert.deepEqual(report.differences.map(x=>({id:x.id,before:x.before,after:x.after,added:x.added})),
    [{id:'A',before:4,after:0,added:4}]);
  assert.equal(report.acquisitionReference.fullReference,48);
  assert.equal(report.summary.beforeDeclaredManufactureCost,report.summary.afterDeclaredManufactureCost);
  assert.deepEqual(settings.inventory,{A:2});
  assert.equal(initial.external[0].quantity,4);
});
test('partial acquisition leaves accurate residual shortages and per-job evidence',()=>{
  const p=mock(),settings=scenario();
  const r=compareProcurementAcquisitions(p,settings,{}, {A:2});
  assert.equal(r.summary.afterExternalUnits,2);
  assert.equal(r.jobChanges[0].afterExternalUnits,2);
  assert.equal(r.differences[0].shortageReduction,2);
  assert.equal(r.acquisitionReference.fullReference,24);
});
test('acquiring multiple items keeps unknown item unit price unspecified',()=>{
  const p=mock(),settings=scenario();
  const r=compareProcurementAcquisitions(p,settings,{}, {A:1,B:1});
  assert.equal(r.acquisitionReference.pricedKinds,1);
  assert.equal(r.acquisitionReference.totalKinds,2);
  assert.equal(r.acquisitionReference.fullReference,null);
  assert.equal(r.acquisitionReference.knownReferenceSubtotal,12);
  assert.equal(r.additions.find(x=>x.id==='B').referenceBuySubtotal,null);
});
test('rejects cross-version ids, negative, fractional, over-cap and original stock overflow',()=>{
  const p=mock(),settings=scenario();
  for(const additions of [{STR_LEGACY:1},{A:-1},{A:0.5},{A:10000001},{A:NaN}]){
    assert.throws(()=>compareProcurementAcquisitions(p,settings,{},additions));
  }
  assert.throws(()=>compareProcurementAcquisitions(p,
    {...settings,inventory:{A:10000000}}, {},{A:1}),/초과/);
  assert.throws(()=>compareProcurementAcquisitions(p,settings,{},['A',3]),/객체/);
});
test('zero additions reproduce the baseline and do not hallucinate material resolution',()=>{
  const p=mock(),settings=scenario();
  const r=compareProcurementAcquisitions(p,settings,{}, {A:0});
  assert.deepEqual(r.additions,[]);
  assert.deepEqual(r.before.external,r.after.external);
  assert.equal(r.summary.afterExternalUnits,4);
});
test('real v.o2 manufacturing data supports procurement deltas without legacy items',()=>{
  const root=fileURLToPath(new URL('../public/data/',import.meta.url));
  const read=name=>JSON.parse(fs.readFileSync(root+name+'-v2-index.json','utf8'));
  const p=createManufacturingPlanner({
    items:read('items'), research:read('research'), manufacture:read('manufacture')
  });
  const settings={
    jobs:[{key:'target',recipeId:'STR_3RL_HE_XXX',batches:1}],
    inventory:{},maxDepth:0
  };
  const base=simulateManufacturingQueue(p,settings);
  assert(base.external.length>0);
  const item=base.external[0];
  const result=compareProcurementAcquisitions(p,settings,{}, {[item.id]:item.quantity},base);
  assert(result.summary.afterExternalUnits<=result.summary.beforeExternalUnits);
  assert.equal(result.schema,'xpiratez-v2-procurement-whatif/v1');
});
