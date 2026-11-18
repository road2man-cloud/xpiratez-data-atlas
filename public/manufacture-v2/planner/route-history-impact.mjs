// Pure cross-revision impact index for the local v.o2 review archive.
// Same-recipe-ID references are navigation hints, not proof of equivalence.
const SCHEMA='xpiratez-v2-route-review-history/v1';
const LIMIT=12000;
const compare=(a,b)=>a.localeCompare(b,'en');

export function summarizeRouteHistoryImpact(history){
  if(history?.schema!==SCHEMA||history.sourceVersion!=='v.o2'||
    typeof history.rootRecipeId!=='string'||!history.rootRecipeId||
    !Array.isArray(history.entries)||history.entries.length>LIMIT||
    !Array.isArray(history.events))
    throw new Error('제조 검토 보관함의 v.o2 누적 기록이 필요합니다.');
  const revisions=new Set(history.events.map(x=>x.revision));
  const recipes=new Map(),unattributed=[];
  for(const entry of history.entries){
    if(!entry||!Number.isSafeInteger(entry.revision)||
      !revisions.has(entry.revision)||
      typeof entry.requirementId!=='string'||
      !Array.isArray(entry.affectedRecipeIds)||
      entry.affectedRecipeIds.some(id=>typeof id!=='string'||!id)||
      typeof entry.note!=='string'||typeof entry.reviewed!=='boolean')
      throw new Error('제조 검토 보관함의 영향 참조가 올바르지 않습니다.');
    const ids=[...new Set(entry.affectedRecipeIds)].sort(compare);
    if(!ids.length)unattributed.push(entry);
    for(const recipeId of ids){
      let row=recipes.get(recipeId);
      if(!row){
        row={recipeId,entries:0,notes:0,reviewed:0,
          revisions:new Set(),materialIds:new Set(),
          conditionIds:new Set(),sourceTaskIds:new Set(),
          latestRevision:0};
        recipes.set(recipeId,row);
      }
      row.entries++;
      if(entry.note)row.notes++;
      if(entry.reviewed)row.reviewed++;
      row.revisions.add(entry.revision);
      row.sourceTaskIds.add(entry.oldId);
      if(entry.type==='material')row.materialIds.add(entry.requirementId);
      if(entry.type==='condition')row.conditionIds.add(entry.requirementId);
      row.latestRevision=Math.max(row.latestRevision,entry.revision);
    }
  }
  const items=[...recipes.values()].map(row=>({
    recipeId:row.recipeId,entries:row.entries,notes:row.notes,
    reviewed:row.reviewed,revisionCount:row.revisions.size,
    revisions:[...row.revisions].sort((a,b)=>a-b),
    materialIds:[...row.materialIds].sort(compare),
    conditionIds:[...row.conditionIds].sort(compare),
    sourceTaskIds:[...row.sourceTaskIds].sort(compare),
    latestRevision:row.latestRevision
  })).sort((a,b)=>b.entries-a.entries||b.latestRevision-a.latestRevision||
    compare(a.recipeId,b.recipeId));
  return {
    schema:'xpiratez-v2-route-history-impact/v1',sourceVersion:'v.o2',
    rootRecipeId:history.rootRecipeId,
    summary:{recipeKinds:items.length,attributedEntries:history.entries.length-unattributed.length,
      unattributedEntries:unattributed.length,events:history.events.length},
    recipes:items,
    caveat:'누적 제외 기록에 표시된 과거 제조식 영향 범위입니다. 현재 제조 가능성·조건 충족·동일한 작업 의미를 확정하지 않습니다.'
  };
}

export function routeHistoryImpactCsvRows(report){
  if(report?.schema!=='xpiratez-v2-route-history-impact/v1'||
    report.sourceVersion!=='v.o2'||!Array.isArray(report.recipes))
    throw new Error('제조식 영향 분석 결과가 올바르지 않습니다.');
  return [
    ['제조식 ID','누적 제외 기록','이전 메모 존재','이전 검토 표시',
      '영향이 기록된 변경 차수','변경 차수 목록','마지막 변경 차수',
      '관련 재료 ID','관련 조건 ID','이전 작업 ID'],
    ...report.recipes.map(row=>[
      row.recipeId,row.entries,row.notes,row.reviewed,row.revisionCount,
      row.revisions.join('; '),row.latestRevision,
      row.materialIds.join('; '),row.conditionIds.join('; '),
      row.sourceTaskIds.join('; ')
    ])
  ];
}
