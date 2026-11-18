// Conservative review-note carry-over between DIFFERENT calculations of the
// same X-Piratez v.o2 manufacturing goal. Task identities are compared by
// immutable semantics AND recursively by prerequisite task identities.
// For ambiguous repeated recipe occurrences, NO automatic match is made.
// This operates only on local review notes; it never changes a game save.
const BOARD='xpiratez-v2-route-action-board/v1';
const REVIEW='xpiratez-v2-route-action-review/v1';
const PREVIEW='xpiratez-v2-route-review-carryover/v1';
const LIMIT=6500;
const validText=x=>typeof x==='string'&&x.length>0&&x.length<=2048;
const validKeys=x=>Array.isArray(x)&&x.every(validText);
const compareText=(a,b)=>a.localeCompare(b,'en');

function canonicalDetail(row) {
  if(row.type!=='recipe')return row.detail;
  // The numbered display position is not a production identity. The recipe
  // ID, batch quantity, source state, child graph and all other text MUST match.
  return row.detail.replace(/^참고 단계 #\d+ · /,'참고 단계 # · ');
}
function internGraph(rows,intern) {
  if(!Array.isArray(rows)||rows.length>LIMIT)
    throw new Error('검토 작업 수가 허용 상한을 넘었습니다.');
  const seen=new Map(),records=[],bySignature=new Map();
  for(const row of rows){
    if(!row||!validText(row.id)||seen.has(row.id)||
      !['material','condition','recipe'].includes(row.type)||
      !validText(row.label)||!validText(row.requirementId)||
      typeof row.action!=='string'||typeof row.detail!=='string'||
      typeof row.sourceStatus!=='string'||!validKeys(row.dependsOn)||
      !validKeys(row.relatedRecipeIds)||
      !(row.quantity===null||Number.isSafeInteger(row.quantity)&&row.quantity>=0))
      throw new Error('불러온 작업표의 참조 ID 또는 내용이 올바르지 않습니다.');
    // A task can depend only on earlier tasks. Enforce it on both graphs.
    const deps=[];
    for(const id of row.dependsOn){
      if(!seen.has(id))
        throw new Error('검토 작업표의 선행 작업 참조가 순서에 맞지 않습니다.');
      deps.push(seen.get(id));
    }
    const identity=JSON.stringify([
      row.type,row.type==='recipe'?null:row.id,row.requirementId,
      row.label,row.action,canonicalDetail(row),row.quantity,row.sourceStatus,
      [...row.relatedRecipeIds].sort(compareText),
      [...new Set(deps)].sort((a,b)=>a-b)
    ]);
    let token=intern.get(identity);
    if(token===undefined){
      token=intern.size+1;
      intern.set(identity,token);
    }
    seen.set(row.id,token);
    records.push({row,token});
    if(!bySignature.has(token))bySignature.set(token,[]);
    bySignature.get(token).push(row);
  }
  return {records,bySignature};
}

// The prior dependency graph provides traceable impact, not proof that
// every similarly named current recipe occurrence is identical.
function priorRecipeImpact(priorRows,currentRows) {
  const outgoing=new Map(priorRows.map(row=>[row.id,[]]));
  const previous=new Map(priorRows.map(row=>[row.id,row]));
  for(const row of priorRows)
    for(const dependency of row.dependsOn)
      outgoing.get(dependency).push(row.id);
  const currentRecipes=new Map();
  for(const row of currentRows){
    if(row.type!=='recipe')continue;
    const found=currentRecipes.get(row.requirementId)||[];
    found.push(row.id);currentRecipes.set(row.requirementId,found);
  }
  return oldId=>{
    const visited=new Set(),queue=[oldId],recipeIds=new Set();
    for(let index=0;index<queue.length;index++){
      const id=queue[index];
      if(visited.has(id))continue;
      visited.add(id);
      const row=previous.get(id);
      if(row.type==='recipe')recipeIds.add(row.requirementId);
      for(const related of row.relatedRecipeIds)recipeIds.add(related);
      for(const dependent of outgoing.get(id)||[])queue.push(dependent);
    }
    const affectedRecipeIds=[...recipeIds].sort(compareText);
    const currentRecipeTaskIds=affectedRecipeIds.flatMap(id=>currentRecipes.get(id)||[]);
    return {
      affectedRecipeIds,
      currentRecipeTaskIds,
      missingRecipeIds:affectedRecipeIds.filter(id=>!currentRecipes.has(id))
    };
  };
}
export function previewRouteActionCarryover(board,exported){
  if(board?.schema!==BOARD || exported?.schema!==REVIEW ||
    board.sourceVersion!=='v.o2'||exported.sourceVersion!=='v.o2'||
    board.rootRecipeId!==exported.rootRecipeId ||
    !Array.isArray(board.tasks)||!Array.isArray(exported.tasks))
    throw new Error('같은 v.o2 제조 목표의 현재 작업표와 검토 JSON이 필요합니다.');
  if(exported.tasks.some(x=>typeof x.reviewed!=='boolean'||
    typeof x.note!=='string'||x.note.length>300))
    throw new Error('검토 JSON에 올바르지 않은 체크 또는 메모가 포함되어 있습니다.');
  const dictionary=new Map();
  const saved=internGraph(exported.tasks,dictionary);
  const current=internGraph(board.tasks,dictionary);
  const matched=[],skipped=[];
  // Compare EVERY current task, not only tasks carrying prior annotations.
  // Recursively interned identities include material quantities, source
  // statuses and prerequisite signatures; harmless display shifts are ignored.
  const priorRequirements=new Map();
  for(const row of exported.tasks){
    const key=JSON.stringify([row.type,row.requirementId]);
    if(!priorRequirements.has(key))priorRequirements.set(key,[]);
    priorRequirements.get(key).push(row.id);
  }
  const currentChanges=current.records.map(({row,token})=>{
    const oldMatches=saved.bySignature.get(token)||[];
    const newMatches=current.bySignature.get(token)||[];
    const oldIds=priorRequirements.get(JSON.stringify([row.type,row.requirementId]))||[];
    const kind=(oldMatches.length===1&&newMatches.length===1)?'unchanged':
      (oldMatches.length>1||newMatches.length>1)?'ambiguous':
      oldIds.length?'changed':'new';
    return {
      id:row.id,type:row.type,requirementId:row.requirementId,
      label:row.label,kind,previousTaskIds:[...oldIds],
      reason:kind==='unchanged'?'동일한 작업 의미·수량·선행 조건':
        kind==='ambiguous'?'같은 의미의 작업이 여러 번 등장해 자동 대응 불가':
        kind==='changed'?'수량·상태·선행 제조 관계 등 작업 의미 변경':
        '이전 작업표에서 찾을 수 없는 신규 작업'
    };
  });
  const impact=priorRecipeImpact(exported.tasks,board.tasks);
  const marked=exported.tasks.filter(x=>x.reviewed||x.note);
  for(const {row:oldRow,token} of saved.records){
    if(!oldRow.reviewed && !oldRow.note)continue;
    const oldGroup=saved.bySignature.get(token),
      newGroup=current.bySignature.get(token)||[];
    if(oldGroup.length!==1 || newGroup.length!==1){
      skipped.push({
        oldId:oldRow.id,label:oldRow.label,type:oldRow.type,
        reviewed:oldRow.reviewed,hasNote:!!oldRow.note,
        ...impact(oldRow.id),
        reason:newGroup.length===0?'현재 계획에서 조건·수량·의존관계가 달라짐':
          '동일한 작업 의미의 반복 항목이 있어 안전하게 구분 불가'
      });
      continue;
    }
    const next=newGroup[0];
    matched.push({
      oldId:oldRow.id,currentId:next.id,type:next.type,
      label:next.label,reviewed:oldRow.reviewed,note:oldRow.note,
      positionChanged:oldRow.id!==next.id
    });
  }
  const counts={
    priorTasks:exported.tasks.length,currentTasks:board.tasks.length,
    priorAnnotated:marked.length,
    eligible:matched.length,
    eligibleReviewed:matched.filter(x=>x.reviewed).length,
    eligibleNotes:matched.filter(x=>!!x.note).length,
    positionMoved:matched.filter(x=>x.positionChanged).length,
    excluded:skipped.length,
    excludedReviewed:skipped.filter(x=>x.reviewed).length,
    excludedNotes:skipped.filter(x=>x.hasNote).length,
    excludedAffectedRecipeKinds:new Set(skipped.flatMap(x=>x.affectedRecipeIds)).size,
    excludedCurrentRecipeOccurrences:new Set(skipped.flatMap(x=>x.currentRecipeTaskIds)).size,
    unchangedCurrent:currentChanges.filter(x=>x.kind==='unchanged').length,
    changedCurrent:currentChanges.filter(x=>x.kind==='changed').length,
    ambiguousCurrent:currentChanges.filter(x=>x.kind==='ambiguous').length,
    newCurrent:currentChanges.filter(x=>x.kind==='new').length
  };
  return {
    schema:PREVIEW,sourceVersion:'v.o2',
    rootRecipeId:board.rootRecipeId,
    counts,matched,skipped,currentChanges,
    // Deliberately kept as a runtime-only identity guard; not an export.
    currentBoard:board,
    caveat:'이전 검토 기록은 실제 게임 상태의 증거가 아닙니다. 의미·수량·상태·모든 선행 작업이 동일한 단일 항목만 선택적으로 재사용합니다. 중복 제조식은 임의로 대응시키지 않습니다.'
  };
}
// Serializable audit: never export the in-memory board identity guard.
export function routeActionCarryoverAudit(preview) {
  if(preview?.schema!==PREVIEW||preview.sourceVersion!=='v.o2'||
     !Array.isArray(preview.matched)||!Array.isArray(preview.skipped)||
     !preview.counts||typeof preview.rootRecipeId!=='string')
    throw new Error('내보낼 검토 비교 결과가 올바르지 않습니다.');
  return {
    schema:'xpiratez-v2-route-carryover-audit/v1',
    sourceVersion:'v.o2',
    rootRecipeId:preview.rootRecipeId,
    counts:{...preview.counts},
    matched:preview.matched.map(({oldId,currentId,type,label,reviewed,note,positionChanged})=>({
      oldId,currentId,type,label,reviewed,hasNote:!!note,positionChanged
    })),
    skipped:preview.skipped.map(({oldId,label,type,reviewed,hasNote,reason,
      affectedRecipeIds,currentRecipeTaskIds,missingRecipeIds})=>({
      oldId,label,type,reviewed,hasNote,reason,
      affectedRecipeIds:[...affectedRecipeIds],
      currentRecipeTaskIds:[...currentRecipeTaskIds],
      missingRecipeIds:[...missingRecipeIds]
    })),
    caveat:'비교 판정의 보존용 기록이며 실제 게임의 제조 가능성 또는 확보 상태를 증명하지 않습니다. 메모 본문은 개인정보 보호를 위해 포함하지 않습니다.'
  };
}
export function routeActionCarryoverAuditCsvRows(preview) {
  const audit=routeActionCarryoverAudit(preview);
  return [
    ['판정','작업 구분','작업명','기존 작업 ID','현재 작업 ID','검토 표시','메모 존재','위치 변경','제외 사유','영향받는 기존 제조식 ID','현재 같은 ID 제조식 작업 ID','현재 없는 제조식 ID'],
    ...audit.skipped.map(x=>['제외',x.type,x.label,x.oldId,'',
      x.reviewed?'예':'아니요',x.hasNote?'예':'아니요','',x.reason,
      x.affectedRecipeIds.join('; '),x.currentRecipeTaskIds.join('; '),
      x.missingRecipeIds.join('; ')]),
    ...audit.matched.map(x=>['재사용 가능',x.type,x.label,x.oldId,x.currentId,
      x.reviewed?'예':'아니요',x.hasNote?'예':'아니요',
      x.positionChanged?'예':'아니요','','','',''])
  ];
}
export function applyRouteActionCarryover(board,preview,{
  reviewed=new Set(),notes=new Map()
}={}) {
  if(board?.schema!==BOARD||preview?.schema!==PREVIEW ||
    preview.currentBoard!==board ||
    preview.rootRecipeId!==board.rootRecipeId)
    throw new Error('현재 제조 작업표에서 다시 선택적 비교를 진행해야 합니다.');
  const nextReviewed=new Set(reviewed instanceof Set?reviewed:reviewed||[]);
  const nextNotes=new Map(notes instanceof Map?notes:Object.entries(notes||{}));
  const currentIds=new Set(board.tasks.map(row=>row.id));
  if([...nextReviewed].some(id=>!currentIds.has(id))||
     [...nextNotes].some(([id,note])=>!currentIds.has(id)||
       typeof note!=='string'||note.length>300))
    throw new Error('현재 제조 작업표의 기존 검토 메모를 확인할 수 없습니다.');
  let addedReviews=0,addedNotes=0,preservedNotes=0;
  for(const item of preview.matched){
    if(!currentIds.has(item.currentId))
      throw new Error('변경된 작업표에 이전 검토 메모를 적용할 수 없습니다.');
    if(item.reviewed&&!nextReviewed.has(item.currentId)){
      nextReviewed.add(item.currentId);addedReviews++;
    }
    if(item.note){
      if(!nextNotes.get(item.currentId)){
        nextNotes.set(item.currentId,item.note);addedNotes++;
      }else preservedNotes++;
    }
  }
  return {
    reviewed:nextReviewed,notes:nextNotes,
    counts:{...preview.counts,addedReviews,addedNotes,preservedNotes},
    caveat:'동일한 의미의 작업 기록만 복사했습니다. 현재 사용자 메모는 덮어쓰지 않았으며 게임 제조·재고 상태는 변경하지 않았습니다.'
  };
}
