// Append-only, user-local review HISTORY for a single X-Piratez v.o2 recipe.
// Archived notes are NEVER automatically applied to a changed manufacturing
// plan. Explicit import/export operates only on local notes, not game saves.
const SCHEMA='xpiratez-v2-route-review-history/v1';
const REFRESH='xpiratez-v2-route-action-refresh/v1';
const REVIEW='xpiratez-v2-route-action-review/v1';
const MAX_EVENTS=1024,MAX_ENTRIES=12000;
const MAX_TEXT=2048;
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=MAX_TEXT;
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
const strings=xs=>Array.isArray(xs)&&xs.every(validId);
const stable=x=>JSON.stringify(x);
function newId(){
  return typeof globalThis.crypto?.randomUUID==='function'?
    globalThis.crypto.randomUUID():
    'local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
}
export function emptyRouteReviewHistory(rootRecipeId){
  if(!validId(rootRecipeId))throw new Error('제조 목표 ID가 올바르지 않습니다.');
  return {schema:SCHEMA,sourceVersion:'v.o2',rootRecipeId,
    historyId:newId(),events:[],entries:[],
    caveat:'현재 게임 제조 상태와 무관한 사용자 로컬 검토 기록입니다. 보관 메모는 새 제조식에 자동 적용되지 않습니다.'};
}
const eventFields=[
  'eventId','revision','priorTasks','currentTasks','eligible',
  'excluded','changedCurrent','newCurrent','ambiguousCurrent',
  'restoredReviews','restoredNotes'
];
const entryFields=[
  'eventId','revision','oldId','type','label','requirementId',
  'quantity','sourceStatus','reviewed','note','reason',
  'affectedRecipeIds','currentRecipeTaskIds','missingRecipeIds'
];
const pick=(x,keys)=>Object.fromEntries(keys.map(key=>[key,x[key]]));
function normalizedHistory(value,rootRecipeId){
  if(!validId(rootRecipeId)||value?.schema!==SCHEMA||value.sourceVersion!=='v.o2'||
     value.rootRecipeId!==rootRecipeId||!validId(value.historyId)||
     !Array.isArray(value.events)||!Array.isArray(value.entries)||
     value.events.length>MAX_EVENTS||value.entries.length>MAX_ENTRIES)
    throw new Error('같은 v.o2 제조 목표의 보관함 JSON만 불러올 수 있습니다.');
  const events=[],entries=[],eventIds=new Set();
  for(const row of value.events){
    if(!validId(row?.eventId)||eventIds.has(row.eventId)||
      !nonnegative(row.revision)||row.revision!==events.length+1||
      eventFields.slice(2).some(key=>!nonnegative(row[key])))
      throw new Error('검토 기록함의 변경 순서 또는 집계가 올바르지 않습니다.');
    eventIds.add(row.eventId);
    events.push(pick(row,eventFields));
  }
  for(const row of value.entries){
    if(!validId(row?.eventId)||!eventIds.has(row.eventId)||
      !nonnegative(row.revision)||row.revision<1||
      events[row.revision-1]?.eventId!==row.eventId||
      !validId(row.oldId)||!validId(row.requirementId)||
      !validId(row.label)||!['material','condition','recipe'].includes(row.type)||
      !(row.quantity===null||nonnegative(row.quantity))||
      typeof row.sourceStatus!=='string'||row.sourceStatus.length>MAX_TEXT||
      typeof row.reviewed!=='boolean'||typeof row.note!=='string'||
      row.note.length>300||(!row.reviewed&&!row.note)||
      !validId(row.reason)||!strings(row.affectedRecipeIds)||
      !strings(row.currentRecipeTaskIds)||!strings(row.missingRecipeIds))
      throw new Error('검토 기록함의 보존 메모 또는 작업 참조가 올바르지 않습니다.');
    entries.push({...pick(row,entryFields),
      affectedRecipeIds:[...row.affectedRecipeIds],
      currentRecipeTaskIds:[...row.currentRecipeTaskIds],
      missingRecipeIds:[...row.missingRecipeIds]});
  }
  for(const event of events){
    if(entries.filter(x=>x.eventId===event.eventId).length!==event.excluded)
      throw new Error('검토 기록함의 제외 작업 건수가 일치하지 않습니다.');
  }
  return {schema:SCHEMA,sourceVersion:'v.o2',rootRecipeId,
    historyId:value.historyId,events,entries,
    caveat:'현재 게임 제조 상태와 무관한 사용자 로컬 검토 기록입니다. 보관 메모는 새 제조식에 자동 적용되지 않습니다.'};
}
export function appendRouteReviewHistory(previous,refresh){
  if(refresh?.schema!==REFRESH||refresh.sourceVersion!=='v.o2'||
    !validId(refresh.rootRecipeId)||refresh.priorReview?.schema!==REVIEW||
    refresh.priorReview.sourceVersion!=='v.o2'||
    refresh.priorReview.rootRecipeId!==refresh.rootRecipeId||
    !Array.isArray(refresh.priorReview.tasks)||!Array.isArray(refresh.skipped)||
    !refresh.counts)
    throw new Error('정확한 재계산 검토 비교 결과가 필요합니다.');
  const history=previous?normalizedHistory(previous,refresh.rootRecipeId):
    emptyRouteReviewHistory(refresh.rootRecipeId);
  if(history.events.length>=MAX_EVENTS ||
     history.entries.length+refresh.skipped.length>MAX_ENTRIES)
    throw new Error('검토 기록함이 용량 상한에 도달했습니다. 전체 JSON 백업 후 별도 작업대에서 다시 시작하세요.');
  const lookup=new Map(refresh.priorReview.tasks.map(row=>[row.id,row]));
  const revision=history.events.length+1;
  const eventId=history.historyId+'/'+revision;
  const entries=refresh.skipped.map(row=>{
    const task=lookup.get(row.oldId);
    if(!task||!['material','condition','recipe'].includes(task.type)||
      task.type!==row.type||task.reviewed!==row.reviewed||
      (!!task.note)!==row.hasNote||!validId(task.id)||
      !validId(task.requirementId)||!validId(task.label)||
      !(task.quantity===null||nonnegative(task.quantity))||
      typeof task.sourceStatus!=='string'||task.sourceStatus.length>MAX_TEXT||
      typeof task.note!=='string'||task.note.length>300||
      (!task.reviewed&&!task.note)||!validId(row.reason)||
      !strings(row.affectedRecipeIds)||!strings(row.currentRecipeTaskIds)||
      !strings(row.missingRecipeIds))
      throw new Error('이전 검토 작업과 제외 판정의 근거가 일치하지 않습니다.');
    return {
      eventId,revision,oldId:task.id,type:task.type,label:task.label,
      requirementId:task.requirementId,quantity:task.quantity,
      sourceStatus:task.sourceStatus,reviewed:task.reviewed,note:task.note,
      reason:row.reason,affectedRecipeIds:[...row.affectedRecipeIds],
      currentRecipeTaskIds:[...row.currentRecipeTaskIds],
      missingRecipeIds:[...row.missingRecipeIds]
    };
  });
  if(entries.length!==refresh.counts.excluded)
    throw new Error('제외 검토 기록 수량이 재계산 결과와 다릅니다.');
  const c=refresh.counts;
  const event={eventId,revision,priorTasks:c.priorTasks,currentTasks:c.currentTasks,
    eligible:c.eligible,excluded:c.excluded,
    changedCurrent:c.changedCurrent,newCurrent:c.newCurrent,
    ambiguousCurrent:c.ambiguousCurrent,
    restoredReviews:c.restoredReviews,restoredNotes:c.restoredNotes};
  if(eventFields.slice(2).some(key=>!nonnegative(event[key])))
    throw new Error('재계산 검토 요약 숫자가 올바르지 않습니다.');
  return {...history,events:[...history.events,event],
    entries:[...history.entries,...entries]};
}
export function importRouteReviewHistory(value,rootRecipeId,existing=null){
  const incoming=normalizedHistory(value,rootRecipeId);
  if(!existing)return incoming;
  const current=normalizedHistory(existing,rootRecipeId);
  const priorEvents=new Map(current.events.map(x=>[x.eventId,x]));
  const oldEntries=new Map(current.events.map(ev=>[ev.eventId,
    current.entries.filter(x=>x.eventId===ev.eventId)]));
  const newEntries=new Map(incoming.events.map(ev=>[ev.eventId,
    incoming.entries.filter(x=>x.eventId===ev.eventId)]));
  const events=[...current.events],entries=[...current.entries];
  for(const event of incoming.events){
    const archiveEntry=newEntries.get(event.eventId);
    const known=priorEvents.get(event.eventId);
    if(known){
      const a={...known,revision:0};
      const b={...event,revision:0};
      const norm=x=>x.map(row=>({...row,revision:0}));
      if(stable(a)!==stable(b)||
        stable(norm(oldEntries.get(event.eventId)))!==stable(norm(archiveEntry)))
        throw new Error('동일한 변경 기록 ID에 상충하는 자료가 있어 병합하지 않았습니다.');
      continue;
    }
    if(events.length>=MAX_EVENTS||entries.length+archiveEntry.length>MAX_ENTRIES)
      throw new Error('검토 기록함 용량 상한을 넘는 병합입니다.');
    const revision=events.length+1;
    events.push({...event,revision});
    entries.push(...archiveEntry.map(x=>({...x,revision,
      affectedRecipeIds:[...x.affectedRecipeIds],
      currentRecipeTaskIds:[...x.currentRecipeTaskIds],
      missingRecipeIds:[...x.missingRecipeIds]})));
    priorEvents.set(event.eventId,event);
  }
  return {...current,events,entries};
}
export function routeReviewHistoryTimelineCsvRows(history){
  const current=normalizedHistory(history,history?.rootRecipeId);
  return [
    ['차수','이벤트 ID','변경 전 작업 수','변경 후 작업 수',
      '동일 의미 대응 건수','자동 제외 메모/검토 건수',
      '현재 변경 작업 수','현재 신규 작업 수','현재 중복/모호 작업 수',
      '복원된 검토 표시','복원된 메모'],
    ...current.events.map(row=>[
      row.revision,row.eventId,row.priorTasks,row.currentTasks,
      row.eligible,row.excluded,row.changedCurrent,row.newCurrent,
      row.ambiguousCurrent,row.restoredReviews,row.restoredNotes
    ])
  ];
}
export function routeReviewHistoryCsvRows(history){
  const current=normalizedHistory(history,history?.rootRecipeId);
  return [
    ['변경 차수','변경 이벤트 ID','기존 작업 ID','작업 구분','대상 ID','작업 이름',
      '이전 가상 수량','원본 상태','이전 검토 표시','이전 메모','제외 사유',
      '영향받는 제조식 ID','현재 계획의 참고 제조식 작업 ID','현재 계획에서 사라진 제조식 ID'],
    ...current.entries.map(row=>[
      row.revision,row.eventId,row.oldId,row.type,row.requirementId,
      row.label,row.quantity,row.sourceStatus,row.reviewed?'예':'아니요',
      row.note,row.reason,row.affectedRecipeIds.join('; '),
      row.currentRecipeTaskIds.join('; '),row.missingRecipeIds.join('; ')
    ])
  ];
}
