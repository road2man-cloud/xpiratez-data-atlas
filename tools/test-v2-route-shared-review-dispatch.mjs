import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSharedReviewDispatch,sharedReviewDispatchCsvRows}
  from '../public/manufacture-v2/planner/route-shared-review-dispatch.mjs';

const entry=(taskId,type,overrides={})=>({
  taskId,type,requirementId:taskId,label:taskId,
  reviewed:false,note:'',action:'게임 내 실제 상태를 확인',
  affectedRecipeIds:['STR_ROOT'],affectedRecipeTaskIds:['recipe::1'],
  affectedRecipeKinds:1,affectedOccurrences:1,
  ledger:null,condition:null,...overrides
});
const shared={
  schema:'xpiratez-v2-route-shared-review-queue/v1',sourceVersion:'v.o2',
  rootRecipeId:'STR_ROOT',
  tasks:[
    entry('material::ORE','material',{requirementId:'STR_ORE',
      affectedRecipeIds:['STR_CHILD','STR_ROOT'],
      affectedRecipeTaskIds:['recipe::1','recipe::2'],
      affectedRecipeKinds:2,affectedOccurrences:2,
      ledger:{startingInventory:1,totalAcquisition:3,remainingShortage:4}}),
    entry('material::OTHER','material',{
      affectedRecipeTaskIds:[],affectedRecipeIds:[],
      affectedRecipeKinds:0,affectedOccurrences:0,
      ledger:{startingInventory:2,totalAcquisition:0,remainingShortage:2}
    }),
    entry('condition::FACILITY','condition',{
      condition:{category:'facility',statusLabel:'건설 중',
        evidence:'선택 기지의 현재 시설 상태 미확인',action:'건설 완료 여부 확인'}
    }),
    entry('condition::RESEARCH','condition',{
      condition:{category:'research',statusLabel:'연구 근거 없음'}
    }),
    entry('condition::RULE','condition',{
      condition:{category:'rule',statusLabel:'규칙 해석 필요'}
    }),
    entry('material::VIRTUAL','material',{
      ledger:{startingInventory:0,totalAcquisition:3,remainingShortage:0}
    }),
    entry('material::UNKNOWN','material'),
    entry('condition::MISSING','condition'),
    entry('condition::INDEPENDENT','condition',{
      affectedRecipeIds:[],affectedRecipeTaskIds:[],
      affectedRecipeKinds:0,affectedOccurrences:0,
      condition:{category:'research',statusLabel:'근거 없음'}
    }),
    entry('material::REVIEWED','material',{
      reviewed:true,note:'검토 참고 메모',
      ledger:{startingInventory:0,totalAcquisition:0,remainingShortage:7}
    })
  ]
};
test('produces a stable priority work order with explicit evidence group distinctions',()=>{
  const saved=JSON.stringify(shared);
  const report=buildSharedReviewDispatch(shared);
  assert.equal(report.schema,'xpiratez-v2-route-review-dispatch/v1');
  assert.equal(report.summary.all,10);
  assert.equal(report.summary.unchecked,9);
  assert.equal(report.summary.reviewed,1);
  assert.equal(report.summary.shortageKinds,3);
  assert.equal(report.summary.shortageUnits,13);
  assert.equal(report.summary.uncheckedShortageKinds,2);
  assert.equal(report.summary.uncheckedShortageUnits,6);
  assert.deepEqual(report.tasks.slice(0,2).map(x=>x.taskId),
    ['material::ORE','material::OTHER']);
  assert.deepEqual(report.tasks.map(x=>x.groupId),[
    'virtual-shortage','virtual-shortage',
    'facility-check','research-check','rule-check',
    'virtual-acquisition','material-reference','condition-reference',
    'independent-check','reviewed'
  ]);
  assert.equal(report.tasks[0].affectedRecipeKinds,2);
  assert.equal(report.tasks[0].remainingShortage,4);
  assert.equal(report.tasks.find(x=>x.taskId==='material::UNKNOWN')
    .remainingShortage,null);
  assert.equal(report.tasks.find(x=>x.taskId==='condition::FACILITY')
    .conditionStatus,'건설 중');
  assert.equal(JSON.stringify(shared),saved);
});

test('preserves all results including checked items in complete export, preventing CSV formula injection',()=>{
  const report=buildSharedReviewDispatch({...shared,tasks:shared.tasks.map(x=>
    x.taskId==='condition::RULE'?{...x,note:'=HYPERLINK("malicious")'}:x)});
  const csv=sharedReviewDispatchCsvRows(report);
  const titles=csv[0],nameAt=titles.indexOf('사용자 메모');
  assert.equal(csv.length,11);
  const note=csv.find(x=>x[titles.indexOf('작업 ID')]==='condition::RULE');
  assert.equal(note[nameAt],'\'=HYPERLINK("malicious")');
  assert.equal(csv.at(-1)[titles.indexOf('검토 상태')],'검토 표시');
  assert(csv.every(x=>x.length===titles.length));
  assert(report.tasks.every(x=>!Object.hasOwn(x,'isManufacturable')));
});

test('rejects mixed versions, stale counts, duplicate task identities and invalid notes',()=>{
  assert.throws(()=>buildSharedReviewDispatch({...shared,sourceVersion:'v.o1.1'}),/v.o2/);
  assert.throws(()=>buildSharedReviewDispatch({...shared,tasks:[
    shared.tasks[0],shared.tasks[0]
  ]}),/중복/);
  assert.throws(()=>buildSharedReviewDispatch({...shared,tasks:[
    {...shared.tasks[0],affectedRecipeKinds:1}
  ]}),/참조/);
  assert.throws(()=>buildSharedReviewDispatch({...shared,tasks:[
    {...shared.tasks[0],note:'x'.repeat(301)}
  ]}),/참조/);
  assert.throws(()=>sharedReviewDispatchCsvRows({schema:'wrong'}),/올바르지/);
});
