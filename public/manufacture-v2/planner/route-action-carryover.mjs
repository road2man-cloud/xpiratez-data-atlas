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
  const marked=exported.tasks.filter(x=>x.reviewed||x.note);
  for(const {row:oldRow,token} of saved.records){
    if(!oldRow.reviewed && !oldRow.note)continue;
    const oldGroup=saved.bySignature.get(token),
      newGroup=current.bySignature.get(token)||[];
    if(oldGroup.length!==1 || newGroup.length!==1){
      skipped.push({
        oldId:oldRow.id,label:oldRow.label,type:oldRow.type,
        reviewed:oldRow.reviewed,hasNote:!!oldRow.note,
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
    excludedNotes:skipped.filter(x=>x.hasNote).length
  };
  return {
    schema:PREVIEW,sourceVersion:'v.o2',
    rootRecipeId:board.rootRecipeId,
    counts,matched,skipped,
    // Deliberately kept as a runtime-only identity guard; not an export.
    currentBoard:board,
    caveat:'이전 검토 기록은 실제 게임 상태의 증거가 아닙니다. 의미·수량·상태·모든 선행 작업이 동일한 단일 항목만 선택적으로 재사용합니다. 중복 제조식은 임의로 대응시키지 않습니다.'
  };
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
