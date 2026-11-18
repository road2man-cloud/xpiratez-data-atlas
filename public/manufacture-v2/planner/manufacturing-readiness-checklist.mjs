// One-action checklist for a single X-Piratez v.o2 manufacturing scenario.
// This is a conservative planning aid, not a game-engine feasibility verdict.
// It combines unresolved external inputs, observable facility/research evidence
// and rule ambiguities without pooling different bases or mutating a save.
const byId=(a,b)=>a.localeCompare(b,'en');
const unique=values=>[...new Set(values)].sort(byId);
const label={
  material:'외부 재료',
  facility:'시설 기능',
  research:'연구 근거',
  reference:'미해결 연구 ID',
  rule:'규칙 확인'
};
const priority={
  material:1,
  pending:2,
  notObserved:3,
  notInDiscovered:4,
  unverifiedFacility:5,
  unverifiedResearch:6,
  unknownReference:7,
  rule:8
};
const statusText={
  shortage:'부족 (확보 경로 미확인)',
  pending:'건설 중 (완공 미확인)',
  notObserved:'기능 제공 미관측',
  unverified:'근거 없음',
  notInDiscovered:'discovered에 없음',
  'unknown-reference':'참조 인덱스 미해결',
  'rule-flag':'규칙 해석 필요'
};
const ruleActions={
  'depth-limit':'하위 제조 단계를 확장하거나 외부 확보 경로 확인',
  'ambiguous-producer':'복수 하위 제조 경로 중 하나를 명시적으로 선택',
  'invalid-choice':'선택한 하위 제조식이 현재 규칙의 산출 후보인지 확인',
  'unspecified-cost':'원본 규칙에서 명시되지 않은 제조비 확인',
  'unspecified-time':'원본 규칙에서 명시되지 않은 작업량 확인',
  'unverified-outputs':'확정되지 않은 산출물 및 확률적 제조 규칙 확인',
  'assumed-yield':'가정된 제조식 산출량의 실제 게임 동작 확인',
  'unresolved-research':'규칙상 연구 참조 ID와 의존관계 확인',
  'research-cycle':'순환된 연구 참조 및 해금 조건 확인',
  'cycle':'순환된 하위 제조식을 다른 경로로 처리',
  'node-budget':'계산 확장 상한에 걸려 누락된 제조 단계 확인',
  'unsafe-batches':'원본 요구량과 자동 확장 수량의 안전 범위 확인',
  'invalid-quantity':'원본 제조식의 requiredItems 수치 확인',
  'unsupported-requiredItems':'원본 제조식의 비표준 requiredItems 형식 확인',
  'untracked-or-invalid-output':'규칙에 선언된 공동 산출물과 수량 확인',
  'unsatisfied-output':'제조 산출량이 필요량을 충족하는지 재확인'
};
const itemsTotal=rows=>rows.reduce((sum,row)=>sum+(row.quantity||0),0);
const sortTasks=(a,b)=>a.priority-b.priority||
  a.category.localeCompare(b.category,'en')||byId(a.key,b.key);

const task=(fields)=>({
  key:fields.key,category:fields.category,
  categoryLabel:label[fields.category],
  priority:fields.priority,
  requirementId:fields.requirementId,
  title:fields.title,
  quantity:fields.quantity??null,
  status:fields.status,
  statusLabel:statusText[fields.status]||fields.status,
  action:fields.action,
  evidence:fields.evidence,
  recipeIds:unique(fields.recipeIds||[]),
  listedUnitBuy:fields.listedUnitBuy??null,
  listedBuySubtotal:fields.listedBuySubtotal??null
});

export function buildManufacturingReadinessChecklist(plan,evidence) {
  if(plan?.schema!=='xpiratez-v2-manufacture-plan/v1' ||
     !Array.isArray(plan.external) || !Array.isArray(plan.flags) ||
     evidence?.schema!=='xpiratez-v2-route-evidence/v1' ||
     !Array.isArray(evidence.facilities) || !Array.isArray(evidence.research) ||
     !Array.isArray(evidence.unresolvedResearch) ||
     !Array.isArray(evidence.recipeIds) || !plan.rootRecipeId)
    throw new Error('v.o2 제조 계획과 시설·연구 증거가 필요합니다.');
  if(plan.flags.some(value=>typeof value!=='string'))
    throw new Error('제조 계획의 규칙 표시가 올바르지 않습니다.');
  const entries=[],materialIds=new Set();
  for(const row of plan.external) {
    if(typeof row?.id!=='string'||!Number.isSafeInteger(row.quantity)||
       row.quantity<=0||materialIds.has(row.id))
      throw new Error('현재 제조 계획의 부족 재료가 올바르지 않습니다: '+String(row?.id));
    materialIds.add(row.id);
    entries.push(task({
      key:'material::'+row.id,category:'material',priority:priority.material,
      requirementId:row.id,title:row.name||row.id,quantity:row.quantity,
      status:'shortage',
      action:'부족 수량 '+row.quantity+'개의 실제 확보·제조·구매 경로 확인',
      evidence:'계산된 외부 조달 잔량 ('+
        (Array.isArray(row.reasons)?row.reasons.join(', '):'세부 사유 미확인')+')',
      listedUnitBuy:row.listedUnitBuy,listedBuySubtotal:row.listedBuySubtotal
    }));
  }
  // Facility functions are shared at a selected base. Collapse the same
  // required function across many expanded recipes while retaining links.
  const functions=new Map();
  const order={confirmed:0,pending:1,notObserved:2,unverified:3};
  for(const row of evidence.facilities){
    if(typeof row.functionId!=='string'||typeof row.recipeId!=='string')
      throw new Error('시설 기능 근거의 ID가 올바르지 않습니다.');
    if(row.status==='confirmed')continue;
    const previous=functions.get(row.functionId);
    if(!previous)functions.set(row.functionId,{
      ...row,recipeIds:[row.recipeId]
    });
    else {
      previous.recipeIds.push(row.recipeId);
      if((order[row.status]??3)>(order[previous.status]??3))
        previous.status=row.status;
    }
  }
  for(const [functionId,info] of functions){
    const fnPriority=info.status==='pending'?priority.pending:
      info.status==='notObserved'?priority.notObserved:priority.unverifiedFacility;
    const action=info.status==='pending'?
      '건설 중 시설의 실제 완공 여부 확인':
      info.status==='notObserved'?
        '해당 기능을 제공하는 시설이 선택 기지에 있는지 확인':
        '시설 목록·선택 기지·규칙상의 제공 기능 근거 확인';
    entries.push(task({
      key:'facility::'+functionId,category:'facility',priority:fnPriority,
      requirementId:functionId,title:functionId,status:info.status,action,
      recipeIds:info.recipeIds,
      evidence:evidence.facilityEvidenceSource+' · 요구 제조식 '+unique(info.recipeIds).length+'종'
    }));
  }
  for(const row of evidence.research){
    if(typeof row.id!=='string')throw new Error('연구 근거의 ID가 올바르지 않습니다.');
    if(row.status==='confirmed')continue;
    entries.push(task({
      key:'research::'+row.id,category:'research',
      priority:row.status==='notInDiscovered'?
        priority.notInDiscovered:priority.unverifiedResearch,
      requirementId:row.id,title:row.name||row.id,status:row.status,
      action:row.status==='notInDiscovered'?
        '세이브 discovered에 없어 연구 상태·해금 조건을 확인':
        '선택한 세이브의 discovered 연구 목록을 연결하여 확인',
      evidence:evidence.researchEvidenceSource
    }));
  }
  for(const row of evidence.unresolvedResearch){
    if(typeof row.id!=='string')throw new Error('미해결 연구 참조 ID가 올바르지 않습니다.');
    entries.push(task({
      key:'reference::'+row.id,category:'reference',priority:priority.unknownReference,
      requirementId:row.id,title:row.id,status:'unknown-reference',
      action:'2.1 연구 인덱스와 규칙상 참조·선행 ID를 확인',
      evidence:'연구 의존 관계에서 참조를 해석하지 못함'
    }));
  }
  for(const name of unique(plan.flags)) {
    entries.push(task({
      key:'rule::'+name,category:'rule',priority:priority.rule,
      requirementId:name,title:name,status:'rule-flag',
      action:ruleActions[name]||'규칙 조건과 엔진 동작을 확인',
      evidence:'계산 계획에서 기록한 불확실성 유형'
    }));
  }
  entries.sort(sortTasks);
  const groups=Object.fromEntries(Object.keys(label).map(category=>[
    category,{
      label:label[category],
      kinds:entries.filter(row=>row.category===category).length,
      units:category==='material'?
        itemsTotal(entries.filter(row=>row.category===category)):null
    }
  ]));
  return {
    schema:'xpiratez-v2-single-goal-readiness-checklist/v1',
    sourceVersion:'v.o2',
    rootRecipeId:plan.rootRecipeId,
    source:{
      facility:evidence.facilityEvidenceSource,
      research:evidence.researchEvidenceSource
    },
    totals:{
      tasks:entries.length,
      shortageKinds:groups.material.kinds,
      shortageUnits:groups.material.units,
      facilityFunctions:groups.facility.kinds,
      researchReferences:groups.research.kinds+groups.reference.kinds,
      unverifiedRuleFlags:groups.rule.kinds
    },
    groups,tasks:entries,
    caveat:'기지 내 실행 명령이나 제조 가능 판정이 아닌 확인·조달 작업 목록입니다. 아이템별 수량은 합산 참고값일 뿐 비용·가치 환산이 아닙니다. discovered 미관측은 연구 잠금의 증명이 아닙니다. 다른 기지의 시설은 합치지 않습니다.'
  };
}
export function compareManufacturingChecklists(before,after) {
  if(before?.schema!=='xpiratez-v2-single-goal-readiness-checklist/v1' ||
    after?.schema!==before.schema || before.rootRecipeId!==after.rootRecipeId)
    throw new Error('동일 제조 목표의 체크리스트끼리 비교해야 합니다.');
  const first=new Map(before.tasks.map(x=>[x.key,x]));
  const next=new Map(after.tasks.map(x=>[x.key,x]));
  const added=after.tasks.filter(row=>!first.has(row.key));
  const removed=before.tasks.filter(row=>!next.has(row.key));
  const changed=after.tasks.filter(row=>{
    const old=first.get(row.key);
    return !!old && (old.quantity!==row.quantity||
      old.status!==row.status||
      JSON.stringify(old.recipeIds)!==JSON.stringify(row.recipeIds));
  }).map(row=>({
    key:row.key,previous:first.get(row.key),current:row
  }));
  return {
    schema:'xpiratez-v2-checklist-changes/v1',
    rootRecipeId:before.rootRecipeId,added,removed,changed,
    caveat:'추가·제외·수량 변경은 서로 다른 가상 제조 계획의 차이이며 실제 작업 완료 기록이 아닙니다.'
  };
}
