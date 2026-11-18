// Single-goal X-Piratez v.o2 handoff checklist: material verification,
// explicit rule/save evidence, and dependency-first expanded recipe steps.
// A "reviewed" mark is a local user note, never a game-state operation.
const WORKFLOW='xpiratez-v2-route-material-workflow/v1';
const CHECKLIST='xpiratez-v2-single-goal-readiness-checklist/v1';
const BOARD='xpiratez-v2-route-action-board/v1';
const MAX_TASKS=6500;
const byId=(a,b)=>a.localeCompare(b,'en');
const unique=values=>[...new Set(values)].sort(byId);
const safeId=value=>typeof value==='string' && value.length>0 &&
  value.length<=512;
const positiveInt=value=>Number.isSafeInteger(value)&&value>0;
const evidenceKinds=new Set(['facility','research','reference','rule']);

function task(source){
  return {
    id:source.id,order:source.order,type:source.type,
    label:source.label,requirementId:source.requirementId,
    action:source.action,detail:source.detail,
    quantity:source.quantity??null,relatedRecipeIds:source.relatedRecipeIds||[],
    dependsOn:source.dependsOn||[],
    sourceStatus:source.sourceStatus||'unverified'
  };
}
export function buildRouteActionBoard({workflow,finalChecklist}){
  if(workflow?.schema!==WORKFLOW || finalChecklist?.schema!==CHECKLIST ||
      workflow.sourceVersion!=='v.o2'||finalChecklist.sourceVersion!=='v.o2'||
      workflow.rootRecipeId!==finalChecklist.rootRecipeId ||
      !Array.isArray(workflow.materials)||
      !Array.isArray(workflow.recipeSequenceAfter)||
      !Array.isArray(finalChecklist.tasks))
    throw new Error('같은 v.o2 제조 목표의 조달·제조 순서와 조건 체크리스트가 필요합니다.');
  const rows=[],seen=new Set();
  const append=source=>{
    if(!safeId(source.id)||seen.has(source.id)||rows.length>=MAX_TASKS ||
      source.dependsOn.some(id=>!seen.has(id)))
      throw new Error('작업표 ID 중복·순서·의존관계를 확인할 수 없습니다.');
    const row=task({...source,order:rows.length+1});
    seen.add(row.id);rows.push(row);
    return row;
  };
  const materials=[...workflow.materials].sort((a,b)=>
    b.remainingShortage-a.remainingShortage||
    b.totalAcquisition-a.totalAcquisition||byId(a.id,b.id));
  const materialIdToTask=new Map();
  for(const row of materials){
    if(!safeId(row.id)||!Number.isSafeInteger(row.totalAcquisition)||
       row.totalAcquisition<0||!Number.isSafeInteger(row.remainingShortage)||
       row.remainingShortage<0)
      throw new Error('가상 조달 재료 수량 또는 ID가 올바르지 않습니다.');
    const id='material::'+row.id;
    const detail= row.remainingShortage?
      '남은 외부 부족 '+row.remainingShortage+'개 · '+
        (row.totalAcquisition?'가상 확보 '+row.totalAcquisition+'개':'가상 확보 0개'):
      '가상 확보 '+row.totalAcquisition+'개 · 실제 확보 근거 미확인';
    append({
      id,type:'material',label:row.name||row.id,requirementId:row.id,
      action:row.action||'실제 획득 경로와 수량 확인',
      detail:detail+' · '+(row.categoryLabel||'규칙 근거 확인'),
      quantity:row.totalAcquisition,
      sourceStatus:row.remainingShortage?'simulated-shortage':'hypothetical-acquisition',
      dependsOn:[]
    });
    materialIdToTask.set(row.id,id);
  }
  for(const row of finalChecklist.tasks){
    if(!evidenceKinds.has(row.category))continue;
    if(!safeId(row.key)||!safeId(row.requirementId))
      throw new Error('연구·시설 조건 참조 ID가 올바르지 않습니다.');
    const id='condition::'+row.key;
    append({
      id,type:'condition',label:row.title||row.requirementId,
      requirementId:row.requirementId,
      action:row.action||'규칙·세이브 조건 확인',
      detail:(row.categoryLabel||row.category)+' · '+
        (row.statusLabel||'근거 확인 필요'),
      sourceStatus:row.status||'unverified',
      relatedRecipeIds:Array.isArray(row.recipeIds)?unique(row.recipeIds):[],
      dependsOn:[]
    });
  }
  const positionId=new Map();
  let previous=0;
  for(const step of workflow.recipeSequenceAfter){
    if(!positiveInt(step.position)||step.position<=previous ||
       !safeId(step.recipeId)||!positiveInt(step.batches)||
       !Array.isArray(step.prerequisiteStepNumbers)||
       !Array.isArray(step.inputMaterials))
      throw new Error('제조식 참조 순서가 올바르지 않습니다.');
    previous=step.position;
    const id='recipe::'+step.position;
    const dependencies=[];
    for(const pos of step.prerequisiteStepNumbers){
      if(!positiveInt(pos)||!positionId.has(pos))
        throw new Error('선행 하위 제조식의 참조가 잘못되었습니다.');
      dependencies.push(positionId.get(pos));
    }
    // A parent that manufactures a material through its child already links
    // the child step. Only stock/external paths link to a material review.
    for(const input of step.inputMaterials){
      if(input.status!=='manufactured' && materialIdToTask.has(input.id))
        dependencies.push(materialIdToTask.get(input.id));
    }
    for(const condition of finalChecklist.tasks){
      if(!evidenceKinds.has(condition.category))continue;
      const matchesFacility=condition.category==='facility' &&
        Array.isArray(condition.recipeIds) &&
        condition.recipeIds.includes(step.recipeId);
      const matchesResearch=condition.category==='research' &&
        Array.isArray(step.prerequisiteResearch) &&
        step.prerequisiteResearch.includes(condition.requirementId);
      if(matchesFacility||matchesResearch){
        const id='condition::'+condition.key;
        if(seen.has(id))dependencies.push(id);
      }
    }
    append({
      id,type:'recipe',label:step.recipeName||step.recipeId,
      requirementId:step.recipeId,
      action:'하위 의존 항목 및 실제 연구·시설·재료를 확인한 뒤 제조식 수행 여부 판단',
      detail:'참고 단계 #'+step.position+' · '+step.batches+
        '회 · 게임 제조 가능성 미확인',
      quantity:step.batches,
      relatedRecipeIds:[step.recipeId],
      dependsOn:unique(dependencies),
      sourceStatus:'simulated-recipe'
    });
    positionId.set(step.position,id);
  }
  const counts={
    material:rows.filter(x=>x.type==='material').length,
    condition:rows.filter(x=>x.type==='condition').length,
    recipe:rows.filter(x=>x.type==='recipe').length
  };
  return {
    schema:BOARD,sourceVersion:'v.o2',rootRecipeId:workflow.rootRecipeId,
    tasks:rows,summary:{tasks:rows.length,...counts,
      dependencyLinks:rows.reduce((n,x)=>n+x.dependsOn.length,0)},
    caveat:'선행 관계는 확장된 단일 제조식과 조달·연구·시설 확인 업무의 참고 순서입니다. 검토 표시·메모는 사용자 로컬 작업표이며 실제 확보, 완료, 제조 가능 또는 게임 상태를 변경하거나 입증하지 않습니다.'
  };
}
function normalizeNotes(notes){
  if(notes instanceof Map)return notes;
  if(notes&&typeof notes==='object'&&!Array.isArray(notes))
    return new Map(Object.entries(notes));
  return new Map();
}
function checkedSet(reviewed){
  return reviewed instanceof Set?reviewed:new Set(Array.isArray(reviewed)?reviewed:[]);
}
export function projectRouteActionBoard(board,{reviewed=[],notes={}}={}){
  if(board?.schema!==BOARD||!Array.isArray(board.tasks))
    throw new Error('2.1 제조 작업표가 필요합니다.');
  const checked=checkedSet(reviewed),memo=normalizeNotes(notes);
  const keys=new Set(board.tasks.map(x=>x.id));
  if([...checked].some(x=>!keys.has(x)))
    throw new Error('다른 제조 목표의 검토 표시가 섞였습니다.');
  if([...memo].some(([key,val])=>!keys.has(key)||typeof val!=='string'||
    val.length>300))
    throw new Error('작업표의 메모 ID 또는 길이가 올바르지 않습니다.');
  return {
    schema:'xpiratez-v2-route-action-review/v1',
    sourceVersion:'v.o2',rootRecipeId:board.rootRecipeId,
    summary:{...board.summary,reviewed:checked.size,
      unreviewed:board.tasks.length-checked.size},
    tasks:board.tasks.map(row=>{
      const pending=row.dependsOn.filter(id=>!checked.has(id));
      return {...row,reviewed:checked.has(row.id),
        note:memo.get(row.id)||'',
        unreviewedPrerequisiteIds:pending,
        prerequisiteReviewCount:row.dependsOn.length-pending.length
      };
    }),
    caveat:'선행 항목에 검토 표시를 했더라도 재료·연구·시설 확보나 실제 게임 내 제조 가능 여부가 확인되는 것은 아닙니다.'
  };
}
export function restoreRouteActionReview(board,exported) {
  if(board?.schema!==BOARD ||
    exported?.schema!=='xpiratez-v2-route-action-review/v1' ||
    exported.sourceVersion!=='v.o2' ||
    exported.rootRecipeId!==board.rootRecipeId ||
    !Array.isArray(exported.tasks) ||
    exported.tasks.length!==board.tasks.length)
    throw new Error('같은 제조 목표·작업 개수의 검토 JSON만 불러올 수 있습니다.');
  const reviewed=new Set(),notes=new Map();
  for(const [index,row] of exported.tasks.entries()){
    const current=board.tasks[index];
    if(row?.id!==current.id || row.order!==current.order ||
       row.type!==current.type || row.label!==current.label ||
       row.action!==current.action || row.detail!==current.detail ||
       row.requirementId!==current.requirementId ||
       row.quantity!==current.quantity ||
       row.sourceStatus!==current.sourceStatus ||
       JSON.stringify(row.dependsOn)!==JSON.stringify(current.dependsOn) ||
       JSON.stringify(row.relatedRecipeIds)!==JSON.stringify(current.relatedRecipeIds) ||
       typeof row.reviewed!=='boolean' ||
       typeof row.note!=='string'||row.note.length>300)
      throw new Error('현재 조달·제조 경로와 다른 검토 JSON입니다. 다시 계산한 작업에 이전 표시를 섞을 수 없습니다.');
    if(row.reviewed)reviewed.add(row.id);
    if(row.note)notes.set(row.id,row.note);
  }
  return {reviewed,notes};
}
export function routeActionReviewCsvRows(review) {
  if(review?.schema!=='xpiratez-v2-route-action-review/v1' ||
     !Array.isArray(review.tasks))
    throw new Error('내보낼 제조 작업표가 올바르지 않습니다.');
  return [[
    '작업 순서','작업 구분','ID','이름','가상 수량/횟수',
    '확인할 일','원본 규칙/계획 상태','선행 작업 ID',
    '검토되지 않은 선행 작업','사용자 검토 표시','검토 메모'
  ],...review.tasks.map(row=>[
    row.order,row.type,row.requirementId,row.label,row.quantity,
    row.action,row.sourceStatus,row.dependsOn.join('; '),
    row.unreviewedPrerequisiteIds.join('; '),
    row.reviewed?'검토 표시':'미검토',row.note
  ])];
}
