import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildManufacturingActionBoard} from '../public/manufacture-v2/planner/procurement-actions-core.mjs';
const evidence={
  schema:'xpiratez-v2-manufacture-evidence-matrix/v1',
  jobs:[
    {key:'one',missingFunctions:['SHOP'],researchNotDiscovered:['R1'],
      blockingFlags:['depth-limit'],facilityState:'declared-missing',researchState:'not-in-discovered'},
    {key:'two',missingFunctions:['SHOP'],researchNotDiscovered:['R1'],
      blockingFlags:[],facilityState:'declared-missing',researchState:'not-in-discovered'},
    {key:'three',missingFunctions:[],researchNotDiscovered:[],
      blockingFlags:[],facilityState:'not-checked',researchState:'not-checked'}
  ]
};
const comparison={
  schema:'xpiratez-v2-procurement-whatif/v1',
  after:{jobs:[
    {key:'one',external:[{id:'A',name:'Item A',quantity:2}]},
    {key:'two',external:[{id:'A',name:'Item A',quantity:3},{id:'B',name:'Item B',quantity:1}]},
    {key:'three',external:[]}
  ]}
};
test('groups shared shortages, facilities and research into actionable cross-order entries',()=>{
  const board=buildManufacturingActionBoard(evidence,comparison);
  const a=board.entries.find(x=>x.type==='material'&&x.id==='A');
  assert.equal(a.totalQuantity,5);
  assert.equal(a.firstAffectedOrder,1);
  assert.deepEqual(a.affectedOrders.map(x=>x.key),['one','two']);
  assert.equal(board.entries.filter(x=>x.type==='facility'&&x.id==='SHOP').length,1);
  assert.equal(board.entries.filter(x=>x.type==='research'&&x.id==='R1').length,1);
  assert.equal(board.summary.materialUnits,6);
  assert.equal(board.summary.affectedOrders,3);
});
test('unknown evidence is a request to check, never a declared missing gate',()=>{
  const board=buildManufacturingActionBoard(evidence,comparison);
  const third=board.entries.filter(x=>x.firstAffectedOrder===3);
  assert(third.some(x=>x.id==='facility-roster'));
  assert(third.some(x=>x.id==='research-discovered'));
  assert(!third.some(x=>x.type==='facility'));
});
test('invalid schema, queue mismatch, and malformed shortage refuse action generation',()=>{
  assert.throws(()=>buildManufacturingActionBoard({...evidence,schema:'v1.1'},comparison),/2.1/);
  assert.throws(()=>buildManufacturingActionBoard(evidence,{
    ...comparison,after:{jobs:[{key:'unmatched',external:[]}]}
  }),/2.1|일치/);
  assert.throws(()=>buildManufacturingActionBoard(evidence,{
    ...comparison,after:{jobs:[
      {...comparison.after.jobs[0],external:[{id:'A',quantity:-1}]},
      ...comparison.after.jobs.slice(1)
    ]}
  }),/수량/);
});
