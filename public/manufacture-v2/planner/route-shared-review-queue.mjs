// A single read-only task queue across the CURRENT v.o2 manufacturing graph.
// This groups identical task IDs (not display labels) and follows only actual
// prerequisite edges. A review checkmark is a personal note, not game readiness.
const BOARD='xpiratez-v2-route-action-board/v1';
const INDEX='xpiratez-v2-route-shared-review-index/v1';
const LEDGER='xpiratez-v2-route-acquisition-ledger/v1';
const CHECKLIST='xpiratez-v2-single-goal-readiness-checklist/v1';
const REPORT='xpiratez-v2-route-shared-review-queue/v1';
const LIMIT=6500;
const textId=value=>typeof value==='string'&&value.length>0&&value.length<=2048;
const byId=(a,b)=>a.localeCompare(b,'en');
const unique=values=>[...new Set(values)].sort(byId);

const nonnegative=value=>Number.isSafeInteger(value)&&value>=0&&value<=10000000;
const safeText=value=>typeof value==='string'?value:'';
function ledgerById(ledger,rootRecipeId){
  if(ledger===null)return null;
  if(ledger?.schema!==LEDGER||ledger.sourceVersion!=='v.o2'||
    ledger.rootRecipeId!==rootRecipeId||!Array.isArray(ledger.materials)||
    ledger.materials.length>5000)
    throw new Error('현재 제조 목표의 v.o2 조달 원장이 필요합니다.');
  const records=new Map();
  for(const row of ledger.materials){
    if(!textId(row?.id)||records.has(row.id)||![
      row.startingInventory,row.initialAcquisition,row.totalAcquisition,
      row.hypotheticalStockTarget,row.remainingShortage
    ].every(nonnegative)||row.totalAcquisition<row.initialAcquisition||
      row.startingInventory+row.totalAcquisition!==row.hypotheticalStockTarget||
      !Array.isArray(row.rounds)||row.rounds.some(n=>!nonnegative(n))||
      row.rounds.reduce((n,value)=>n+value,0)!==
        row.totalAcquisition-row.initialAcquisition)
      throw new Error('조달 원장의 중복 ID 또는 재고·가상 확보 수량이 올바르지 않습니다.');
    records.set(row.id,{
      startingInventory:row.startingInventory,
      firstPass:row.initialAcquisition,
      laterPasses:row.totalAcquisition-row.initialAcquisition,
      stages:[row.initialAcquisition,...row.rounds],
      totalAcquisition:row.totalAcquisition,
      hypotheticalStockTarget:row.hypotheticalStockTarget,
      remainingShortage:row.remainingShortage,
      listedUnitBuy:Number.isFinite(row.referenceUnitBuy)&&row.referenceUnitBuy>=0?
        row.referenceUnitBuy:null,
      listedSubtotal:Number.isFinite(row.referenceSubtotal)&&row.referenceSubtotal>=0?
        row.referenceSubtotal:null
    });
  }
  return records;
}
function conditionByTask(checklist,rootRecipeId){
  if(checklist===null)return null;
  if(checklist?.schema!==CHECKLIST||checklist.sourceVersion!=='v.o2'||
    checklist.rootRecipeId!==rootRecipeId||!Array.isArray(checklist.tasks)||
    checklist.tasks.length>LIMIT)
    throw new Error('같은 v.o2 목표의 연구·시설 조건 체크리스트가 필요합니다.');
  const records=new Map();
  for(const row of checklist.tasks){
    if(!['facility','research','reference','rule'].includes(row?.category))
      continue;
    const id='condition::'+row.key;
    if(!textId(row.key)||records.has(id)||!textId(row.requirementId))
      throw new Error('시설·연구·규칙 조건 ID가 중복되거나 올바르지 않습니다.');
    records.set(id,{
      category:row.category,
      categoryLabel:safeText(row.categoryLabel)||row.category,
      status:safeText(row.status)||'unverified',
      statusLabel:safeText(row.statusLabel)||safeText(row.status)||'근거 미확인',
      evidence:safeText(row.evidence)||'상세 근거 기록 없음',
      action:safeText(row.action)||'근거 확인 필요',
      recipeIds:Array.isArray(row.recipeIds)?unique(row.recipeIds.filter(textId)):[]
    });
  }
  return records;
}
export function buildSharedReviewIndex(board,{ledger=null,checklist=null}={}){
  if(board?.schema!==BOARD||board.sourceVersion!=='v.o2'||
    !textId(board.rootRecipeId)||!Array.isArray(board.tasks)||
    board.tasks.length>LIMIT)
    throw new Error('v.o2의 현재 제조 작업표가 필요합니다.');
  const materialEvidence=ledgerById(ledger,board.rootRecipeId);
  const conditionEvidence=conditionByTask(checklist,board.rootRecipeId);
  const positions=new Map(),impact=board.tasks.map(()=>new Set());
  for(const [i,row] of board.tasks.entries()){
    if(!textId(row?.id)||positions.has(row.id)||
      !textId(row.requirementId)||!textId(row.label)||
      !['material','condition','recipe'].includes(row.type)||
      !Array.isArray(row.dependsOn)||
      row.dependsOn.some(id=>!textId(id)||!positions.has(id)))
      throw new Error('현재 작업표의 작업 ID 또는 선행 의존 순서가 올바르지 않습니다.');
    positions.set(row.id,i);
  }
  // Work backwards from recipe occurrences through actual dependencies.
  // A Set prevents a diamond graph from counting one recipe twice.
  for(let i=board.tasks.length-1;i>=0;i--){
    const row=board.tasks[i];
    if(row.type==='recipe')impact[i].add(i);
    for(const dependency of row.dependsOn){
      for(const recipeIndex of impact[i])
        impact[positions.get(dependency)].add(recipeIndex);
    }
  }
  const tasks=board.tasks.flatMap((row,i)=>{
    if(row.type==='recipe')return [];
    const occurrenceIndexes=[...impact[i]].sort((a,b)=>a-b);
    const affectedRecipeTaskIds=occurrenceIndexes.map(j=>board.tasks[j].id);
    const affectedRecipeIds=unique(occurrenceIndexes.map(j=>board.tasks[j].requirementId));
    return [{
      taskId:row.id,type:row.type,requirementId:row.requirementId,
      label:row.label,sourceStatus:row.sourceStatus,
      quantity:row.quantity??null,action:row.action||'별도 근거 확인',
      ledger:row.type==='material'?materialEvidence?.get(row.requirementId)||null:null,
      condition:row.type==='condition'?conditionEvidence?.get(row.id)||null:null,
      affectedRecipeIds,affectedRecipeTaskIds,
      affectedRecipeKinds:affectedRecipeIds.length,
      affectedOccurrences:affectedRecipeTaskIds.length,
      sharing:affectedRecipeIds.length>=2?'multi-recipe':
        affectedRecipeTaskIds.length>=2?'repeated-occurrence':
        affectedRecipeTaskIds.length===1?'single':'unlinked'
    }];
  });
  return {
    schema:INDEX,sourceVersion:'v.o2',rootRecipeId:board.rootRecipeId,
    tasks,sourceTaskIds:board.tasks.map(x=>x.id),
    hasLedger:ledger!==null,hasChecklist:checklist!==null,
    caveat:'제조식 영향은 현재 작업표의 실제 선행 간선에 한정됩니다. 단독 작업을 임의 제조식에 연결하지 않으며, 검토 표시는 실제 게임 재료 확보·조건 충족을 뜻하지 않습니다.'
  };
}

function reviewNotes(notes){
  if(notes instanceof Map)return notes;
  if(notes&&typeof notes==='object'&&!Array.isArray(notes))
    return new Map(Object.entries(notes));
  return new Map();
}
export function projectSharedReviewQueue(index,{reviewed=[],notes=new Map()}={}){
  if(index?.schema!==INDEX||index.sourceVersion!=='v.o2'||
    !textId(index.rootRecipeId)||!Array.isArray(index.tasks))
    throw new Error('공통 검토 작업 인덱스가 올바르지 않습니다.');
  const checked=reviewed instanceof Set?reviewed:new Set(reviewed);
  if([...checked].some(id=>typeof id!=='string'))
    throw new Error('검토 표시 작업 ID가 올바르지 않습니다.');
  // A board also contains recipe review marks; those are intentionally
  // allowed, whereas an unknown source ID indicates stale state.
  const allTasks=index.sourceTaskIds?
    new Set(index.sourceTaskIds):null;
  if(allTasks&&[...checked].some(id=>!allTasks.has(id)))
    throw new Error('다른 제조 작업표의 검토 표시가 섞여 있습니다.');
  const annotations=reviewNotes(notes);
  if([...annotations].some(([id,value])=>
      !allTasks?.has(id)||typeof value!=='string'||value.length>300))
    throw new Error('다른 작업표의 검토 메모 또는 300자 초과 기록이 있습니다.');
  const priority={'multi-recipe':0,'repeated-occurrence':1,single:2,unlinked:3};
  const tasks=index.tasks.map(row=>({
    ...row,reviewed:checked.has(row.taskId),
    note:annotations.get(row.taskId)||''
  })).sort((a,b)=>Number(a.reviewed)-Number(b.reviewed)||
    ((a.ledger?.remainingShortage||0)>0?0:1)-
      ((b.ledger?.remainingShortage||0)>0?0:1)||
    priority[a.sharing]-priority[b.sharing]||
    b.affectedRecipeKinds-a.affectedRecipeKinds||
    b.affectedOccurrences-a.affectedOccurrences||
    (a.type==='material'?0:1)-(b.type==='material'?0:1)||
    byId(a.requirementId,b.requirementId)||
    byId(a.taskId,b.taskId));
  return {
    schema:REPORT,sourceVersion:'v.o2',rootRecipeId:index.rootRecipeId,
    summary:{
      taskCount:tasks.length,pending:tasks.filter(x=>!x.reviewed).length,
      reviewed:tasks.filter(x=>x.reviewed).length,
      shared:tasks.filter(x=>x.sharing==='multi-recipe').length,
      repeated:tasks.filter(x=>x.sharing==='repeated-occurrence').length,
      unlinked:tasks.filter(x=>x.sharing==='unlinked').length,
      ledgerShortageKinds:tasks.filter(x=>x.type==='material'&&
        x.ledger?.remainingShortage>0).length,
      ledgerShortageUnits:tasks.reduce((sum,row)=>
        sum+(row.type==='material'?(row.ledger?.remainingShortage||0):0),0),
      conditionsWithEvidence:tasks.filter(x=>
        x.type==='condition'&&x.condition!==null).length,
      ledgerUnknownKinds:tasks.filter(x=>
        x.type==='material'&&x.ledger===null).length
    },
    tasks,
    caveat:index.caveat
  };
}

// Avoid spreadsheet formula interpretation of user-entered memo text.
const spreadsheetMemo=value=>/^[\s]*[=+\-@]/.test(value)?"'"+value:value;
export function sharedReviewQueueCsvRows(report){
  if(report?.schema!==REPORT||report.sourceVersion!=='v.o2'||
    !Array.isArray(report.tasks))
    throw new Error('내보낼 공통 검토 작업 목록이 올바르지 않습니다.');
  return [
    ['검토 상태','작업 ID','작업 종류','재료/조건 ID','이름',
      '연결 범위','관련 제조식 종류','제조식 등장 횟수','제조식 ID',
      '현재 제조식 작업 ID','가상 재료 수량','현재 상태 근거','검토할 내용',
      '입력 재고','최초 가상 확보','추가 단계 가상 확보','누적 가상 확보',
      '가상 확보 후 재고','남은 부족','단계별 확보 수량',
      '조건 종류','조건 상태','조건 상태 한글','조건 근거',
      '조건 확인 동작','현재 메모'],
    ...report.tasks.map(row=>[
      row.reviewed?'검토 표시됨':'미검토',row.taskId,row.type,
      row.requirementId,row.label,row.sharing,row.affectedRecipeKinds,
      row.affectedOccurrences,row.affectedRecipeIds.join('; '),
      row.affectedRecipeTaskIds.join('; '),row.quantity,row.sourceStatus,row.action,
      row.ledger?.startingInventory??null,row.ledger?.firstPass??null,
      row.ledger?.laterPasses??null,row.ledger?.totalAcquisition??null,
      row.ledger?.hypotheticalStockTarget??null,row.ledger?.remainingShortage??null,
      row.ledger?.stages.join('; ')||'',
      row.condition?.categoryLabel||'',row.condition?.status||'',
      row.condition?.statusLabel||'',row.condition?.evidence||'',
      row.condition?.action||'',spreadsheetMemo(row.note)
    ])
  ];
}
