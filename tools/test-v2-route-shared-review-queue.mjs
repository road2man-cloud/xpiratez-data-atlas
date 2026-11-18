import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSharedReviewIndex,projectSharedReviewQueue,sharedReviewQueueCsvRows
} from '../public/manufacture-v2/planner/route-shared-review-queue.mjs';

const task=(id,type,requirementId,dependsOn=[],extra={})=>({
  id,type,requirementId,dependsOn,label:requirementId,
  action:'근거를 확인',sourceStatus:'unverified',
  quantity:type==='material'?2:null,...extra
});
const board={
  schema:'xpiratez-v2-route-action-board/v1',sourceVersion:'v.o2',
  rootRecipeId:'STR_ROOT',tasks:[
    task('material::STR_SHARED','material','STR_SHARED'),
    task('material::STR_REPEAT','material','STR_REPEAT'),
    task('material::STR_SINGLE','material','STR_SINGLE'),
    task('condition::orphan','condition','STR_UNKNOWN'),
    task('condition::research','condition','STR_RESEARCH'),
    task('recipe::1','recipe','STR_A',
      ['material::STR_SHARED','condition::research']),
    task('recipe::2','recipe','STR_B',
      ['material::STR_SHARED','condition::research']),
    task('recipe::3','recipe','STR_ROOT',['recipe::1','recipe::2']),
    task('recipe::4','recipe','STR_REPEAT',['material::STR_REPEAT']),
    task('recipe::5','recipe','STR_REPEAT',['material::STR_REPEAT']),
    task('recipe::6','recipe','STR_SINGLE',['material::STR_SINGLE'])
  ]
};

test('shared material and condition appear once across two branches and diamond ancestry',()=>{
  const original=JSON.stringify(board);
  const index=buildSharedReviewIndex(board);
  assert.equal(index.tasks.length,5);
  const shared=index.tasks.find(x=>x.taskId==='material::STR_SHARED');
  assert.equal(shared.sharing,'multi-recipe');
  assert.deepEqual(shared.affectedRecipeIds,['STR_A','STR_B','STR_ROOT']);
  assert.deepEqual(shared.affectedRecipeTaskIds,['recipe::1','recipe::2','recipe::3']);
  assert.equal(shared.affectedOccurrences,3);
  const research=index.tasks.find(x=>x.taskId==='condition::research');
  assert.equal(research.affectedRecipeKinds,3);
  assert.deepEqual(research.affectedRecipeTaskIds,shared.affectedRecipeTaskIds);
  assert.equal(JSON.stringify(board),original);
});

test('repeated recipe occurrences and unlinked condition remain distinguishable',()=>{
  const index=buildSharedReviewIndex(board);
  const repeat=index.tasks.find(x=>x.taskId==='material::STR_REPEAT');
  assert.equal(repeat.sharing,'repeated-occurrence');
  assert.deepEqual(repeat.affectedRecipeIds,['STR_REPEAT']);
  assert.deepEqual(repeat.affectedRecipeTaskIds,['recipe::4','recipe::5']);
  const single=index.tasks.find(x=>x.taskId==='material::STR_SINGLE');
  assert.equal(single.sharing,'single');
  const orphan=index.tasks.find(x=>x.taskId==='condition::orphan');
  assert.equal(orphan.sharing,'unlinked');
  assert.deepEqual(orphan.affectedRecipeIds,[]);
});

test('checked state is projected without mutating current board or changing unrelated tasks',()=>{
  const index=buildSharedReviewIndex(board);
  const indexJson=JSON.stringify(index);
  const first=projectSharedReviewQueue(index,{
    reviewed:new Set(['material::STR_SHARED','recipe::3'])
  });
  assert.equal(first.summary.taskCount,5);
  assert.equal(first.summary.reviewed,1);
  assert.equal(first.summary.pending,4);
  assert.equal(first.summary.shared,2);
  assert.equal(first.summary.repeated,1);
  assert.equal(first.summary.unlinked,1);
  assert.equal(first.tasks.at(-1).taskId,'material::STR_SHARED');
  assert.deepEqual(first.tasks.filter(x=>x.reviewed).map(x=>x.taskId),
    ['material::STR_SHARED']);
  const after=projectSharedReviewQueue(index,{reviewed:[]});
  assert.equal(after.summary.pending,5);
  assert.equal(JSON.stringify(index),indexJson);
  const csv=sharedReviewQueueCsvRows(first);
  assert.equal(csv.length,6);
  assert(csv.some(row=>row[1]==='material::STR_SHARED'&&
    row[0]==='검토 표시됨'&&row[6]===3));
  assert(csv.some(row=>row[1]==='material::STR_REPEAT'&&
    row[7]===2&&row[8]==='STR_REPEAT'));
});

test('rejects cross-version, stale reviews, duplicates and forward prerequisite edges',()=>{
  assert.throws(()=>buildSharedReviewIndex({...board,sourceVersion:'v.o1.1'}),
    /v.o2/);
  assert.throws(()=>buildSharedReviewIndex({...board,tasks:[
    board.tasks[0],board.tasks[0]
  ]}),/ID 또는 선행/);
  assert.throws(()=>buildSharedReviewIndex({...board,tasks:[
    task('recipe::x','recipe','STR_X',['material::LATER']),
    task('material::LATER','material','STR_LATER')
  ]}),/ID 또는 선행/);
  const index=buildSharedReviewIndex(board);
  assert.throws(()=>projectSharedReviewQueue(index,{reviewed:['not-existing']}),
    /다른 제조 작업표/);
  assert.throws(()=>sharedReviewQueueCsvRows({schema:'invalid'}),/올바르지/);
});

test('joins source-aligned v.o2 ledger and facility/research evidence without guessing missing amounts',()=>{
  const stock={
    schema:'xpiratez-v2-route-acquisition-ledger/v1',
    sourceVersion:'v.o2',rootRecipeId:'STR_ROOT',
    materials:[{id:'STR_SHARED',startingInventory:3,
      initialAcquisition:1,rounds:[1,0],totalAcquisition:2,
      hypotheticalStockTarget:5,remainingShortage:4,
      referenceUnitBuy:12,referenceSubtotal:24}]
  };
  const checklist={
    schema:'xpiratez-v2-single-goal-readiness-checklist/v1',
    sourceVersion:'v.o2',rootRecipeId:'STR_ROOT',
    tasks:[
      {category:'research',key:'research',requirementId:'STR_RESEARCH',
        categoryLabel:'연구 근거',status:'notInDiscovered',
        statusLabel:'discovered에 없음',evidence:'선택 세이브의 발견 목록 미확인',
        action:'연구 해금 조건 확인',recipeIds:['STR_A','STR_B']},
      {category:'material',key:'material::STR_SHARED',requirementId:'STR_SHARED'},
      {category:'facility',key:'orphan',requirementId:'STR_UNKNOWN',
        categoryLabel:'시설 기능',status:'pending',statusLabel:'건설 중',
        evidence:'완공 시점 미확인',action:'시설 완공 확인'}
    ]
  };
  const source=JSON.stringify({stock,checklist,board});
  const index=buildSharedReviewIndex(board,{ledger:stock,checklist});
  const queue=projectSharedReviewQueue(index,{
    reviewed:['material::STR_SHARED','recipe::3'],
    notes:new Map([['material::STR_SHARED','세이브 확인 전'],
      ['condition::research','연구 근거 검토 중']])
  });
  const shared=queue.tasks.find(x=>x.taskId==='material::STR_SHARED');
  assert.equal(shared.note,'세이브 확인 전');
  assert.deepEqual(shared.ledger.stages,[1,1,0]);
  assert.equal(shared.ledger.startingInventory,3);
  assert.equal(shared.ledger.totalAcquisition,2);
  assert.equal(shared.ledger.hypotheticalStockTarget,5);
  assert.equal(shared.ledger.remainingShortage,4);
  assert.equal(queue.summary.ledgerShortageKinds,1);
  assert.equal(queue.summary.ledgerShortageUnits,4);
  assert.equal(queue.summary.conditionsWithEvidence,2);
  assert.equal(queue.summary.ledgerUnknownKinds,2);
  const noStock=queue.tasks.find(x=>x.taskId==='material::STR_REPEAT');
  assert.equal(noStock.ledger,null);
  const research=queue.tasks.find(x=>x.taskId==='condition::research');
  assert.equal(research.condition.category,'research');
  assert.equal(research.condition.status,'notInDiscovered');
  assert.equal(research.condition.statusLabel,'discovered에 없음');
  assert.equal(research.condition.evidence,'선택 세이브의 발견 목록 미확인');
  assert.equal(research.note,'연구 근거 검토 중');
  assert(queue.tasks.find(x=>x.taskId==='condition::orphan').condition);
  const csv=sharedReviewQueueCsvRows(queue);
  assert.equal(csv.length,6);
  const header=csv[0],row=csv.find(x=>x[1]==='material::STR_SHARED');
  assert.equal(row[header.indexOf('입력 재고')],3);
  assert.equal(row[header.indexOf('남은 부족')],4);
  assert.equal(row[header.indexOf('단계별 확보 수량')],'1; 1; 0');
  assert.equal(row[header.indexOf('현재 메모')],'세이브 확인 전');
  const injected=projectSharedReviewQueue(index,{
    notes:{'material::STR_SHARED':'=HYPERLINK("bad")'}
  });
  const memoRow=sharedReviewQueueCsvRows(injected)
    .find(x=>x[1]==='material::STR_SHARED');
  assert.equal(memoRow[header.indexOf('현재 메모')],
    '\'=HYPERLINK("bad")');
  assert.equal(JSON.stringify({stock,checklist,board}),source);
});

test('rejects mismatched or corrupted source ledgers and checklist evidence',()=>{
  const valid={
    schema:'xpiratez-v2-route-acquisition-ledger/v1',
    sourceVersion:'v.o2',rootRecipeId:'STR_ROOT',
    materials:[{id:'STR_SHARED',startingInventory:1,
      initialAcquisition:1,rounds:[],totalAcquisition:1,
      hypotheticalStockTarget:2,remainingShortage:0}]
  };
  assert.throws(()=>buildSharedReviewIndex(board,{ledger:{...valid,rootRecipeId:'OTHER'}}),
    /조달 원장/);
  assert.throws(()=>buildSharedReviewIndex(board,{ledger:{
    ...valid,materials:[valid.materials[0],valid.materials[0]]
  }}),/중복 ID/);
  assert.throws(()=>buildSharedReviewIndex(board,{ledger:{
    ...valid,materials:[{...valid.materials[0],hypotheticalStockTarget:3}]
  }}),/수량/);
  const checklist={
    schema:'xpiratez-v2-single-goal-readiness-checklist/v1',
    sourceVersion:'v.o2',rootRecipeId:'STR_ROOT',
    tasks:[{category:'research',key:'research',
      requirementId:'STR_RESEARCH'}]
  };
  assert.throws(()=>buildSharedReviewIndex(board,{checklist:{
    ...checklist,sourceVersion:'v.o1.1'
  }}),/v.o2/);
  assert.throws(()=>buildSharedReviewIndex(board,{checklist:{
    ...checklist,tasks:[checklist.tasks[0],checklist.tasks[0]]
  }}),/중복/);
  const index=buildSharedReviewIndex(board);
  assert.throws(()=>projectSharedReviewQueue(index,{notes:{
    'unknown':'비정상'
  }}),/검토 메모/);
  assert.throws(()=>projectSharedReviewQueue(index,{notes:{
    'condition::research':'x'.repeat(301)
  }}),/검토 메모/);
});

test('changing a dependency only updates its actual downstream recipe group',()=>{
  const current={...board,tasks:board.tasks.map(x=>x.id==='recipe::2'?
    {...x,dependsOn:['condition::research']}:x)};
  const after=buildSharedReviewIndex(current);
  const shared=after.tasks.find(x=>x.taskId==='material::STR_SHARED');
  assert.deepEqual(shared.affectedRecipeIds,['STR_A','STR_ROOT']);
  assert.deepEqual(shared.affectedRecipeTaskIds,['recipe::1','recipe::3']);
  const research=after.tasks.find(x=>x.taskId==='condition::research');
  assert.deepEqual(research.affectedRecipeIds,['STR_A','STR_B','STR_ROOT']);
});
