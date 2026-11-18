import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRouteActionBoard,projectRouteActionBoard,routeActionReviewCsvRows,restoreRouteActionReview}
  from '../public/manufacture-v2/planner/route-action-board.mjs';

const workflow={
  schema:'xpiratez-v2-route-material-workflow/v1',
  sourceVersion:'v.o2',rootRecipeId:'STR_FACTORY',
  materials:[
    {id:'STR_ORE',name:'광석',totalAcquisition:4,remainingShortage:0,
      categoryLabel:'제조 확장 깊이 제한',action:'실제 광석 확보 근거 확인'},
    {id:'STR_OTHER',name:'미해결 재료',totalAcquisition:0,remainingShortage:2,
      categoryLabel:'제조 경로 오류',action:'잘못된 제조 경로 확인'},
    {id:'STR_PRODUCT',name:'제조 결과품',totalAcquisition:1,
      remainingShortage:0,categoryLabel:'외부 조달 가정',action:'확보 방식 확인'}
  ],
  recipeSequenceAfter:[
    {position:1,recipeId:'STR_SUB',recipeName:'하위 제조',batches:2,
      inputMaterials:[{id:'STR_ORE',status:'stock-covered'}],
      prerequisiteStepNumbers:[],prerequisiteResearch:['STR_R1']},
    {position:2,recipeId:'STR_FACTORY',recipeName:'목표 제조',batches:1,
      inputMaterials:[{id:'STR_PRODUCT',status:'manufactured'}],
      prerequisiteStepNumbers:[1],prerequisiteResearch:[]}
  ]
};
const checklist={
  schema:'xpiratez-v2-single-goal-readiness-checklist/v1',
  sourceVersion:'v.o2',rootRecipeId:'STR_FACTORY',
  tasks:[
    {category:'material',key:'material::STR_ORE',requirementId:'STR_ORE',quantity:4},
    {category:'facility',key:'facility::WORKS',requirementId:'WORKS',
      title:'작업 시설',categoryLabel:'시설',status:'pending',
      statusLabel:'건설 중',action:'시설 상태 확인',recipeIds:['STR_SUB']},
    {category:'research',key:'research::STR_R1',requirementId:'STR_R1',
      title:'연구 확인',categoryLabel:'연구',status:'unverified',
      statusLabel:'근거 없음',action:'연구 목록 확인'},
    {category:'rule',key:'rule::unspecified-time',requirementId:'unspecified-time',
      title:'작업량 미선언',categoryLabel:'규칙',status:'rule-flag',
      statusLabel:'불확실',action:'규칙 참조 확인'}
  ]
};

test('creates a dependency-first review board for materials, conditions and recipes',()=>{
  const snapshot=JSON.stringify({workflow,checklist});
  const board=buildRouteActionBoard({workflow,finalChecklist:checklist});
  assert.equal(board.schema,'xpiratez-v2-route-action-board/v1');
  assert.deepEqual(board.summary,{
    tasks:8,material:3,condition:3,recipe:2,dependencyLinks:4
  });
  assert.deepEqual(board.tasks.map(t=>t.type),[
    'material','material','material','condition','condition','condition',
    'recipe','recipe'
  ]);
  const sub=board.tasks.find(t=>t.id==='recipe::1');
  assert.deepEqual(sub.dependsOn,[
    'condition::facility::WORKS','condition::research::STR_R1',
    'material::STR_ORE'
  ]);
  const root=board.tasks.find(t=>t.id==='recipe::2');
  assert.deepEqual(root.dependsOn,['recipe::1']);
  assert(!root.dependsOn.includes('material::STR_PRODUCT'));
  assert(board.tasks.every((t,i)=>t.order===i+1));
  assert.equal(JSON.stringify({workflow,checklist}),snapshot);
});

test('review marks only change the projected notes, not dependencies or simulated state',()=>{
  const board=buildRouteActionBoard({workflow,finalChecklist:checklist});
  const previous=JSON.stringify(board);
  const marked=new Set(['material::STR_ORE','condition::facility::WORKS']);
  const notes=new Map([['material::STR_ORE','광석 수급 확인할 것']]);
  const review=projectRouteActionBoard(board,{reviewed:marked,notes});
  assert.equal(review.schema,'xpiratez-v2-route-action-review/v1');
  assert.equal(review.summary.reviewed,2);
  assert.equal(review.summary.unreviewed,6);
  assert.equal(review.tasks.find(x=>x.id==='material::STR_ORE').note,
    '광석 수급 확인할 것');
  const sub=review.tasks.find(x=>x.id==='recipe::1');
  assert.deepEqual(sub.unreviewedPrerequisiteIds,['condition::research::STR_R1']);
  assert.equal(sub.prerequisiteReviewCount,2);
  assert.equal(sub.reviewed,false);
  marked.add('condition::research::STR_R1');
  const updated=projectRouteActionBoard(board,{reviewed:marked,notes});
  assert.deepEqual(updated.tasks.find(x=>x.id==='recipe::1')
    .unreviewedPrerequisiteIds,[]);
  assert.equal(updated.tasks.find(x=>x.id==='recipe::2').reviewed,false);
  assert.deepEqual(updated.tasks.find(x=>x.id==='recipe::2')
    .unreviewedPrerequisiteIds,['recipe::1']);
  assert.equal(JSON.stringify(board),previous);
});

test('CSV exports all review statuses and notes, not just rendered table rows',()=>{
  const board=buildRouteActionBoard({workflow,finalChecklist:checklist});
  const review=projectRouteActionBoard(board,{
    reviewed:['material::STR_ORE'],
    notes:{'material::STR_ORE':'구매 경로 확인'}
  });
  const rows=routeActionReviewCsvRows(review);
  assert.equal(rows.length,board.tasks.length+1);
  assert(rows[0].includes('사용자 검토 표시'));
  assert(rows[0].includes('선행 작업 ID'));
  const ore=rows.find(row=>row[2]==='STR_ORE'&&row[1]==='material');
  assert.equal(ore[9],'검토 표시');
  assert.equal(ore[10],'구매 경로 확인');
  const sub=rows.find(row=>row[2]==='STR_SUB');
  assert.equal(sub[8].includes('condition::research::STR_R1'),true);
  assert(sub[7].includes('material::STR_ORE'));
});

test('saved review notes can be restored only onto the identical action graph',()=>{
  const board=buildRouteActionBoard({workflow,finalChecklist:checklist});
  const written=projectRouteActionBoard(board,{
    reviewed:['material::STR_ORE','recipe::1'],
    notes:{'material::STR_ORE':'실제 재료 목록과 비교'}
  });
  const restored=restoreRouteActionReview(board,JSON.parse(JSON.stringify(written)));
  assert.deepEqual([...restored.reviewed].sort(),['material::STR_ORE','recipe::1']);
  assert.equal(restored.notes.get('material::STR_ORE'),'실제 재료 목록과 비교');
  assert.equal(restored.notes.size,1);
  const alternate=buildRouteActionBoard({
    workflow:{...workflow,recipeSequenceAfter:[
      {...workflow.recipeSequenceAfter[0],batches:3},
      workflow.recipeSequenceAfter[1]
    ]},
    finalChecklist:checklist
  });
  assert.throws(()=>restoreRouteActionReview(alternate,written),
    /현재 조달·제조 경로/);
  assert.throws(()=>restoreRouteActionReview(board,{
    ...written,rootRecipeId:'STR_OTHER'
  }),/같은 제조 목표/);
  assert.throws(()=>restoreRouteActionReview(board,{
    ...written,tasks:written.tasks.map((x,i)=>
      i===0?{...x,dependsOn:['fabricated::dependency']}:x)
  }),/현재 조달·제조 경로/);
});

test('unknown review keys, oversized notes, stale or invalid prerequisites fail closed',()=>{
  const board=buildRouteActionBoard({workflow,finalChecklist:checklist});
  assert.throws(()=>projectRouteActionBoard(board,{
    reviewed:['material::STR_UNRELATED']
  }),/다른 제조 목표/);
  assert.throws(()=>projectRouteActionBoard(board,{
    notes:{'material::STR_ORE':'A'.repeat(301)}
  }),/메모 ID 또는 길이/);
  assert.throws(()=>buildRouteActionBoard({
    workflow:{...workflow,rootRecipeId:'STR_OTHER'},
    finalChecklist:checklist
  }),/같은 v.o2/);
  assert.throws(()=>buildRouteActionBoard({
    workflow:{...workflow,recipeSequenceAfter:[{
      ...workflow.recipeSequenceAfter[0],prerequisiteStepNumbers:[3]
    }]},
    finalChecklist:checklist
  }),/선행 하위 제조식/);
  assert.throws(()=>routeActionReviewCsvRows({schema:'old'}),
    /내보낼 제조 작업표/);
});
