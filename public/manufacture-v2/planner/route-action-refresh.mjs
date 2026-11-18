// Local, incremental review reconciliation for a single v.o2 goal.
// Only semantics-identical unique tasks inherit annotations automatically.
// Stale annotations remain in a separate prior snapshot for manual export;
// neither this module nor its caller changes any X-Piratez game state.
import {projectRouteActionBoard} from './route-action-board.mjs';
import {previewRouteActionCarryover,applyRouteActionCarryover}
  from './route-action-carryover.mjs';

const SCHEMA='xpiratez-v2-route-action-refresh/v1';

export function snapshotRouteActionReview(board,{reviewed=new Set(),notes=new Map()}={}){
  if(!board)return null;
  return projectRouteActionBoard(board,{reviewed,notes});
}

export function refreshRouteActionReview(board,priorReview){
  const preview=previewRouteActionCarryover(board,priorReview);
  const applied=applyRouteActionCarryover(board,preview);
  const changes=preview.currentChanges.map(row=>({
    id:row.id,requirementId:row.requirementId,type:row.type,
    label:row.label,kind:row.kind,reason:row.reason,
    previousTaskIds:[...row.previousTaskIds]
  }));
  const counts={
    ...preview.counts,
    restoredReviews:applied.counts.addedReviews,
    restoredNotes:applied.counts.addedNotes,
    recheckCurrent:changes.filter(row=>row.kind!=='unchanged').length
  };
  return {
    schema:SCHEMA,sourceVersion:'v.o2',rootRecipeId:board.rootRecipeId,
    reviewed:applied.reviewed,notes:applied.notes,
    changes,skipped:preview.skipped.map(x=>({...x})),counts,
    // Runtime-only previous snapshot supports export before discarded notes
    // are lost. It must never be treated as a current-board review.
    priorReview,
    caveat:'동일한 유일 작업만 검토 기록을 자동 이어받습니다. 변경·신규·중복 작업은 재검토 대상이며 이전 메모는 별도 보존합니다. 실제 게임의 제조·재고 완료 판정이 아닙니다.'
  };
}

export function routeActionRefreshCsvRows(refresh){
  if(refresh?.schema!==SCHEMA||refresh.sourceVersion!=='v.o2'||
    !Array.isArray(refresh.changes)||!refresh.counts)
    throw new Error('제조 작업표 변경 추적 결과가 올바르지 않습니다.');
  return [
    ['현재 작업 ID','구분','제조식/재료 ID','이름','변경 구분','변경 사유','이전 관련 작업 ID'],
    ...refresh.changes.map(row=>[
      row.id,row.type,row.requirementId,row.label,row.kind,row.reason,
      row.previousTaskIds.join('; ')
    ])
  ];
}
