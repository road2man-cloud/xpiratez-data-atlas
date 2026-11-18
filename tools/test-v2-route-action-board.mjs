import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRouteActionBoard,projectRouteActionBoard,routeActionReviewCsvRows,restoreRouteActionReview}
  from '../public/manufacture-v2/planner/route-action-board.mjs';
import {previewRouteActionCarryover,applyRouteActionCarryover,routeActionCarryoverAudit,routeActionCarryoverAuditCsvRows}
  from '../public/manufacture-v2/planner/route-action-carryover.mjs';
import {snapshotRouteActionReview,refreshRouteActionReview,routeActionRefreshCsvRows}
  from '../public/manufacture-v2/planner/route-action-refresh.mjs';

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

test('selectively carries reviewed recipe occurrences across harmless display-position shifts',()=>{
  const oldBoard=buildRouteActionBoard({workflow,finalChecklist:checklist});
  const saved=projectRouteActionBoard(oldBoard,{
    reviewed:['material::STR_ORE','recipe::1','recipe::2'],
    notes:{
      'material::STR_ORE':'광석 상태 점검',
      'recipe::1':'하위 제조 절차 확인',
      'recipe::2':'상위 제조 절차 확인'
    }
  });
  const shifted={
    ...workflow,
    recipeSequenceAfter:[
      {position:1,recipeId:'STR_EXTRA',recipeName:'새 무관한 제조',
        batches:1,inputMaterials:[],prerequisiteStepNumbers:[],
        prerequisiteResearch:[]},
      {...workflow.recipeSequenceAfter[0],position:2},
      {...workflow.recipeSequenceAfter[1],position:3,
        prerequisiteStepNumbers:[2]}
    ]
  };
  const current=buildRouteActionBoard({workflow:shifted,finalChecklist:checklist});
  const preview=previewRouteActionCarryover(current,saved);
  assert.equal(preview.schema,'xpiratez-v2-route-review-carryover/v1');
  assert.equal(preview.counts.priorAnnotated,3);
  assert.equal(preview.counts.eligible,3);
  assert.equal(preview.counts.positionMoved,2);
  assert.equal(preview.counts.excluded,0);
  assert(preview.matched.some(x=>x.oldId==='recipe::1'&&x.currentId==='recipe::2'));
  assert(preview.matched.some(x=>x.oldId==='recipe::2'&&x.currentId==='recipe::3'));
  const priorCurrent=JSON.stringify(current);
  const priorSaved=JSON.stringify(saved);
  const merged=applyRouteActionCarryover(current,preview,{
    reviewed:new Set(['condition::rule::unspecified-time']),
    notes:new Map([['recipe::3','현재 작업자의 새 메모']])
  });
  assert.equal(merged.counts.addedReviews,3);
  assert.equal(merged.counts.addedNotes,2);
  assert.equal(merged.counts.preservedNotes,1);
  assert(merged.reviewed.has('recipe::2'));
  assert(merged.reviewed.has('recipe::3'));
  assert(merged.reviewed.has('material::STR_ORE'));
  assert.equal(merged.notes.get('recipe::2'),'하위 제조 절차 확인');
  assert.equal(merged.notes.get('recipe::3'),'현재 작업자의 새 메모');
  assert.equal(JSON.stringify(current),priorCurrent);
  assert.equal(JSON.stringify(saved),priorSaved);
});

test('changed material quantities invalidate dependent recipes but keep independent condition notes',()=>{
  const old=buildRouteActionBoard({workflow,finalChecklist:checklist});
  const saved=projectRouteActionBoard(old,{
    reviewed:['material::STR_ORE','condition::research::STR_R1','recipe::1','recipe::2'],
    notes:{
      'material::STR_ORE':'4개 가정 점검',
      'condition::research::STR_R1':'연구 참조 기록',
      'recipe::1':'제조 순서 메모'
    }
  });
  const modified={...workflow,materials:workflow.materials.map(x=>
    x.id==='STR_ORE'?{...x,totalAcquisition:3}:x)};
  const current=buildRouteActionBoard({workflow:modified,finalChecklist:checklist});
  const preview=previewRouteActionCarryover(current,saved);
  assert.equal(preview.counts.eligible,1);
  assert.equal(preview.counts.eligibleReviewed,1);
  assert.equal(preview.counts.excluded,3);
  const ore=preview.skipped.find(x=>x.oldId==='material::STR_ORE');
  assert.deepEqual(ore.affectedRecipeIds,['STR_FACTORY','STR_SUB']);
  assert.deepEqual(ore.currentRecipeTaskIds,['recipe::2','recipe::1']);
  assert.deepEqual(ore.missingRecipeIds,[]);
  assert.equal(preview.counts.excludedAffectedRecipeKinds,2);
  const audit=routeActionCarryoverAudit(preview);
  assert.deepEqual(audit.skipped.find(x=>x.oldId==='material::STR_ORE')
    .affectedRecipeIds,['STR_FACTORY','STR_SUB']);
  assert(routeActionCarryoverAuditCsvRows(preview)
    .some(row=>row[0]==='제외'&&row[3]==='material::STR_ORE'&&
      row[9].includes('STR_FACTORY')&&row[10].includes('recipe::2')));
  assert.equal(preview.matched[0].currentId,'condition::research::STR_R1');
  const merged=applyRouteActionCarryover(current,preview);
  assert(merged.reviewed.has('condition::research::STR_R1'));
  assert(!merged.reviewed.has('material::STR_ORE'));
  assert(!merged.reviewed.has('recipe::1'));
  assert(!merged.reviewed.has('recipe::2'));
});

test('ambiguous repeated recipe occurrences are skipped, not assigned arbitrarily',()=>{
  const original=buildRouteActionBoard({workflow,finalChecklist:checklist});
  const saved=projectRouteActionBoard(original,{
    reviewed:['recipe::1','condition::research::STR_R1']
  });
  const repeated={
    ...workflow,recipeSequenceAfter:[
      workflow.recipeSequenceAfter[0],
      {...workflow.recipeSequenceAfter[0],position:2},
      {...workflow.recipeSequenceAfter[1],position:3,
        prerequisiteStepNumbers:[1]}
    ]
  };
  const current=buildRouteActionBoard({workflow:repeated,finalChecklist:checklist});
  const preview=previewRouteActionCarryover(current,saved);
  assert.equal(preview.counts.eligible,1);
  assert.equal(preview.counts.excluded,1);
  assert(preview.skipped.some(x=>x.oldId==='recipe::1'&&x.reason.includes('구분 불가')));
  const skipped=preview.skipped.find(x=>x.oldId==='recipe::1');
  assert.deepEqual(skipped.currentRecipeTaskIds,['recipe::3','recipe::1','recipe::2']);
  assert.deepEqual(skipped.affectedRecipeIds,['STR_FACTORY','STR_SUB']);
});

test('unsafe carry-over is rejected without altering current notes or checkmarks',()=>{
  const board=buildRouteActionBoard({workflow,finalChecklist:checklist});
  const saved=projectRouteActionBoard(board,{reviewed:['material::STR_ORE']});
  assert.throws(()=>previewRouteActionCarryover(board,{
    ...saved,rootRecipeId:'STR_DIFFERENT'
  }),/같은 v.o2/);
  assert.throws(()=>previewRouteActionCarryover(board,{
    ...saved,tasks:saved.tasks.map((x,i)=>i===0?{...x,note:'N'.repeat(301)}:x)
  }),/올바르지 않은 체크 또는 메모/);
  assert.throws(()=>previewRouteActionCarryover(board,{
    ...saved,tasks:saved.tasks.map((x,i)=>i===7?
      {...x,dependsOn:['does-not-exist']}:x)
  }),/선행 작업 참조/);
  const preview=previewRouteActionCarryover(board,saved);
  const another=buildRouteActionBoard({workflow,finalChecklist:checklist});
  assert.throws(()=>applyRouteActionCarryover(another,preview),/다시 선택적 비교/);
  const currentReviewed=new Set(['recipe::2']);
  const currentNotes=new Map([['material::STR_ORE','새 계산기의 메모']]);
  const applied=applyRouteActionCarryover(board,preview,{
    reviewed:currentReviewed,notes:currentNotes
  });
  assert.equal(applied.notes.get('material::STR_ORE'),'새 계산기의 메모');
  assert.deepEqual([...currentReviewed],['recipe::2']);
  assert.equal(currentNotes.size,1);
});

test('editing a material quantity selectively preserves independent review annotations',()=>{
  const before=buildRouteActionBoard({workflow,finalChecklist:checklist});
  const source=snapshotRouteActionReview(before,{
    reviewed:new Set(['material::STR_ORE','condition::research::STR_R1',
      'recipe::1','recipe::2']),
    notes:new Map([
      ['material::STR_ORE','예전 광석 검토 메모'],
      ['condition::research::STR_R1','유지 가능한 연구 검토 메모'],
      ['recipe::2','예전 상위 제조 메모']
    ])
  });
  const sourceCopy=JSON.stringify(source);
  const changed={...workflow,materials:workflow.materials.map(row=>
    row.id==='STR_ORE'?{...row,totalAcquisition:5}:row)};
  const now=buildRouteActionBoard({workflow:changed,finalChecklist:checklist});
  const beforeNew=JSON.stringify(now);
  const refresh=refreshRouteActionReview(now,source);
  assert.equal(refresh.schema,'xpiratez-v2-route-action-refresh/v1');
  assert.equal(refresh.counts.restoredReviews,1);
  assert.equal(refresh.counts.restoredNotes,1);
  assert.equal(refresh.counts.changedCurrent,3);
  assert.equal(refresh.counts.newCurrent,0);
  assert(refresh.reviewed.has('condition::research::STR_R1'));
  assert(!refresh.reviewed.has('material::STR_ORE'));
  assert(!refresh.reviewed.has('recipe::1'));
  assert(!refresh.reviewed.has('recipe::2'));
  assert.equal(refresh.notes.get('condition::research::STR_R1'),
    '유지 가능한 연구 검토 메모');
  assert(!refresh.notes.has('material::STR_ORE'));
  assert.equal(refresh.priorReview.tasks.find(x=>x.id==='material::STR_ORE').note,
    '예전 광석 검토 메모');
  assert.deepEqual(refresh.changes.filter(x=>x.kind==='changed')
    .map(x=>x.id).sort(),['material::STR_ORE','recipe::1','recipe::2']);
  const csv=routeActionRefreshCsvRows(refresh);
  assert.equal(csv.length,now.tasks.length+1);
  assert(csv.some(x=>x[0]==='recipe::2'&&x[4]==='changed'));
  assert.equal(JSON.stringify(source),sourceCopy);
  assert.equal(JSON.stringify(now),beforeNew);
});

test('repositioned recipes carry unique notes and newly introduced nodes require recheck',()=>{
  const prior=buildRouteActionBoard({workflow,finalChecklist:checklist});
  const saved=snapshotRouteActionReview(prior,{
    reviewed:['recipe::1','recipe::2'],
    notes:{'recipe::1':'하위 작업 메모'}
  });
  const shifted={...workflow,recipeSequenceAfter:[
    {position:1,recipeId:'STR_EXTRA',recipeName:'새로운 제조식',batches:1,
      inputMaterials:[],prerequisiteStepNumbers:[],prerequisiteResearch:[]},
    {...workflow.recipeSequenceAfter[0],position:2},
    {...workflow.recipeSequenceAfter[1],position:3,prerequisiteStepNumbers:[2]}
  ]};
  const current=buildRouteActionBoard({workflow:shifted,finalChecklist:checklist});
  const result=refreshRouteActionReview(current,saved);
  assert(result.reviewed.has('recipe::2'));
  assert(result.reviewed.has('recipe::3'));
  assert(!result.reviewed.has('recipe::1'));
  assert.equal(result.notes.get('recipe::2'),'하위 작업 메모');
  assert.equal(result.changes.find(x=>x.id==='recipe::1').kind,'new');
  assert.equal(result.changes.find(x=>x.id==='recipe::2').kind,'unchanged');
  assert.equal(result.counts.newCurrent,1);
  assert.equal(result.counts.restoredReviews,2);
  assert.throws(()=>refreshRouteActionReview(current,{
    ...saved,rootRecipeId:'STR_UNRELATED'
  }),/같은 v.o2/);
  assert.throws(()=>routeActionRefreshCsvRows({schema:'invalid'}),/올바르지/);
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

test('carry-over audit exports all decisions without leaking notes or board reference',()=>{
  const board=buildRouteActionBoard({workflow,finalChecklist:checklist});
  const saved=projectRouteActionBoard(board,{
    reviewed:['material::STR_ORE','recipe::1'],
    notes:{'material::STR_ORE':'민감한 개인 메모'}
  });
  const changed=buildRouteActionBoard({
    workflow:{...workflow,materials:workflow.materials.map(x=>
      x.id==='STR_ORE'?{...x,totalAcquisition:5}:x)},
    finalChecklist:checklist
  });
  const preview=previewRouteActionCarryover(changed,saved);
  const audit=routeActionCarryoverAudit(preview);
  assert.equal(audit.counts.excluded,preview.counts.excluded);
  assert.equal(audit.matched.length+audit.skipped.length,2);
  assert(audit.skipped.some(x=>x.reason));
  assert(!JSON.stringify(audit).includes('민감한 개인 메모'));
  assert(!('currentBoard' in audit));
  const csv=routeActionCarryoverAuditCsvRows(preview);
  assert.equal(csv.length,3);
  assert(csv.some(x=>x[0]==='제외'&&x[8]));
  assert.throws(()=>routeActionCarryoverAudit({schema:'wrong'}),/올바르지/);
});
