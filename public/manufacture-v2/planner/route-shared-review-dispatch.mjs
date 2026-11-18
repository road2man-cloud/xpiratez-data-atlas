// Evidence-led, locally editable review dispatch derived from the current v.o2
// shared-review workbench. This is a task order, never an engine action.
const INPUT='xpiratez-v2-route-shared-review-queue/v1';
const OUTPUT='xpiratez-v2-route-review-dispatch/v1';
const LIMIT=6500;
const byId=(a,b)=>a.localeCompare(b,'en');
const groupOrder=[
  'virtual-shortage','facility-check','research-check','rule-check',
  'virtual-acquisition','material-reference','condition-reference',
  'independent-check','reviewed'
];
const groupInfo={
  'virtual-shortage':{label:'가상 계산 후 남은 부족 재료',instruction:'실제 확보·제조·구매 경로의 존재와 필요 수량 검토'},
  'facility-check':{label:'시설 기능·완공 근거 검토',instruction:'해당 기지의 시설 기능과 완공 상태 확인'},
  'research-check':{label:'연구·해금 근거 검토',instruction:'연구 목록·연구 선행관계와 실제 해금 여부 확인'},
  'rule-check':{label:'규칙·기타 조건 검토',instruction:'규칙 해석과 미해결 조건 확인'},
  'virtual-acquisition':{label:'가상 확보 재료의 실제 경로 검토',instruction:'가상 확보는 실제 보유가 아님: 확보 경로·수량 점검'},
  'material-reference':{label:'조달 원장 자료 보완',instruction:'원장 미기재 또는 가상 재고 참고 근거 확인'},
  'condition-reference':{label:'조건 근거 미기재',instruction:'연구·시설의 대응 체크리스트 근거 확인'},
  'independent-check':{label:'현재 제조식에 연결되지 않은 작업',instruction:'현재 경로에 독립적으로 요구되는지 확인'},
  reviewed:{label:'사용자가 검토 표시한 작업',instruction:'검토 메모만 보존하며 실제 완료 여부를 입증하지 않음'}
};
const amount=x=>Number.isSafeInteger(x)&&x>=0&&x<=10000000;
const value=x=>typeof x==='string'&&x.length>0&&x.length<=2048;

function classify(task){
  if(task.reviewed)return 'reviewed';
  if(task.type==='material'&&task.ledger?.remainingShortage>0)
    return 'virtual-shortage';
  if(!task.affectedRecipeTaskIds.length)return 'independent-check';
  if(task.type==='material'){
    if(task.ledger?.totalAcquisition>0)return 'virtual-acquisition';
    return 'material-reference';
  }
  if(!task.condition)return 'condition-reference';
  if(task.condition.category==='facility')return 'facility-check';
  if(task.condition.category==='research'||task.condition.category==='reference')
    return 'research-check';
  return 'rule-check';
}
export function buildSharedReviewDispatch(shared){
  if(shared?.schema!==INPUT||shared.sourceVersion!=='v.o2'||
    !value(shared.rootRecipeId)||!Array.isArray(shared.tasks)||
    shared.tasks.length>LIMIT)throw new Error('현재 v.o2 공통 검토 작업 목록이 필요합니다.');
  const seen=new Set();
  const tasks=shared.tasks.map(task=>{
    if(!value(task?.taskId)||seen.has(task.taskId)||
      !value(task.requirementId)||!['material','condition'].includes(task.type)||
      !Array.isArray(task.affectedRecipeIds)||!Array.isArray(task.affectedRecipeTaskIds)||
      task.affectedRecipeIds.some(id=>!value(id))||
      task.affectedRecipeTaskIds.some(id=>!value(id))||
      !amount(task.affectedRecipeKinds)||!amount(task.affectedOccurrences)||
      task.affectedRecipeKinds!==new Set(task.affectedRecipeIds).size||
      task.affectedOccurrences!==new Set(task.affectedRecipeTaskIds).size||
      typeof task.reviewed!=='boolean'||
      typeof task.note!=='string'||task.note.length>300)
      throw new Error('공통 검토 작업 중복 또는 근거 참조가 올바르지 않습니다.');
    seen.add(task.taskId);
    const groupId=classify(task);
    return {
      taskId:task.taskId,requirementId:task.requirementId,
      type:task.type,label:task.label,reviewed:task.reviewed,
      note:task.note,groupId,groupLabel:groupInfo[groupId].label,
      recommendedAction:task.condition?.action||task.action||
        groupInfo[groupId].instruction,
      affectedRecipeIds:[...task.affectedRecipeIds],
      affectedRecipeTaskIds:[...task.affectedRecipeTaskIds],
      affectedRecipeKinds:task.affectedRecipeKinds,
      affectedOccurrences:task.affectedOccurrences,
      startingInventory:task.ledger?.startingInventory??null,
      virtualAcquired:task.ledger?.totalAcquisition??null,
      remainingShortage:task.ledger?.remainingShortage??null,
      conditionCategory:task.condition?.category||null,
      conditionStatus:task.condition?.statusLabel||null,
      conditionEvidence:task.condition?.evidence||null,
      // These are origin-grounded numbers/statuses, not evidence of in-game readiness.
      caveat:'가상 수량·조건 근거는 사용자 검토 참고용이며 게임 상태를 변경하지 않습니다.'
    };
  });
  tasks.sort((a,b)=>groupOrder.indexOf(a.groupId)-groupOrder.indexOf(b.groupId)||
    b.affectedRecipeKinds-a.affectedRecipeKinds||
    b.affectedOccurrences-a.affectedOccurrences||
    (b.remainingShortage??-1)-(a.remainingShortage??-1)||
    byId(a.requirementId,b.requirementId)||byId(a.taskId,b.taskId));
  const groups=groupOrder.map(id=>{
    const rows=tasks.filter(task=>task.groupId===id);
    return {
      id,label:groupInfo[id].label,instruction:groupInfo[id].instruction,
      count:rows.length,pending:rows.filter(row=>!row.reviewed).length,
      affectedRecipeKinds:new Set(rows.flatMap(row=>row.affectedRecipeIds)).size
    };
  }).filter(group=>group.count);
  return {
    schema:OUTPUT,sourceVersion:'v.o2',rootRecipeId:shared.rootRecipeId,
    summary:{
      all:tasks.length,unchecked:tasks.filter(task=>!task.reviewed).length,
      groups:groups.length,
      shortageKinds:tasks.filter(task=>task.type==='material'&&
        task.remainingShortage>0).length,
      shortageUnits:tasks.reduce((n,task)=>n+
        (task.type==='material'?(task.remainingShortage||0):0),0),
      uncheckedShortageKinds:tasks.filter(task=>task.groupId==='virtual-shortage').length,
      uncheckedShortageUnits:tasks.reduce((n,task)=>n+
        (task.groupId==='virtual-shortage'?task.remainingShortage:0),0),
      reviewed:tasks.filter(task=>task.reviewed).length
    },
    groups,tasks,
    caution:'검토 우선순위는 현재 가상 제조 계산에서 실제 근거를 확인하기 위한 순서 제안입니다. 사용자가 표시한 검토 완료는 실제 재료 획득·연구 해금·시설 완공 또는 제조 가능을 뜻하지 않습니다.'
  };
}
const csvSafe=x=>{
  if(typeof x!=='string')return x;
  return /^\s*[=+@\-\t\r]/.test(x)?"'"+x:x;
};
export function sharedReviewDispatchCsvRows(dispatch){
  if(dispatch?.schema!==OUTPUT||dispatch.sourceVersion!=='v.o2'||
    !Array.isArray(dispatch.tasks))throw new Error('검토 실행 작업표 내보내기 자료가 올바르지 않습니다.');
  const cols=['순서','작업 그룹','검토 상태','작업 ID','재료·조건 ID','이름',
    '확인해야 할 내용','관련 제조식 종류','관련 제조식 ID',
    '관련 현재 제조식 작업 ID','입력 재고','가상 확보 수량','남은 부족',
    '조건 종류','조건 근거 상태','조건 상세 근거','사용자 메모'];
  return [cols,...dispatch.tasks.map((row,i)=>[
    i+1,csvSafe(row.groupLabel),row.reviewed?'검토 표시':'미검토',
    csvSafe(row.taskId),csvSafe(row.requirementId),csvSafe(row.label),
    csvSafe(row.recommendedAction),row.affectedRecipeKinds,
    csvSafe(row.affectedRecipeIds.join('; ')),
    csvSafe(row.affectedRecipeTaskIds.join('; ')),
    row.startingInventory,row.virtualAcquired,row.remainingShortage,
    csvSafe(row.conditionCategory||''),csvSafe(row.conditionStatus||''),
    csvSafe(row.conditionEvidence||''),csvSafe(row.note)
  ])];
}
