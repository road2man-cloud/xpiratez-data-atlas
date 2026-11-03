// Describe source gaps using exact v.o2 item, event and mission-success
// provenance. A missing needItem never becomes a fictional supplied item.
const arr=x=>Array.isArray(x)?x:[];
export function classifyResearchSupplyGap(id,rule,{itemIds=[],itemSupply={},eventResearchSources={},missionResearchSources={}}={}){
  if(!id)return {kind:'UNRESOLVED_ID',reason:'분석 대상 연구 ID가 제공되지 않음'};
  if(!rule)return {kind:'RULE_NOT_INDEXED',
    reason:'2.1 원본 연구 규칙에 ID가 없음. 임무/이벤트 또는 오탈자 여부를 별도 검증해야 함'};
  const needed=rule.neededItem||id;
  const items=itemIds instanceof Set?itemIds:new Set(itemIds);
  const hasItem=items.has(needed)||!!itemSupply?.[needed];
  const eventSources=arr(eventResearchSources[id]);
  const missions=arr(missionResearchSources[id])
    .filter(x=>x.reward==='mission-success'&&arr(x.scripts).length);
  if(rule.needItem&&!hasItem&&missions.length)
    return {kind:'MISSION_SUCCESS_REWARD_CONDITIONAL',neededItem:needed,
      missions:missions.map(x=>({deployment:x.deployment,scripts:x.scripts.map(s=>s.script)})),
      reason:'원본 v.o2 임무 승리 시 무료 연구 지급 경로는 확인됨. 실제 임무 출현·선행 연구·시간 창·승리 결과가 재생 검증되기 전까지 확정 획득으로 인정하지 않음'};
  if(rule.needItem&&!hasItem){
    return {kind:'UNBACKED_SAMPLE_TOKEN',neededItem:needed,events:eventSources.map(e=>e.event),
      reason:'2.1 needItem 표본 '+needed+'이(가) 실제 아이템 원본·색인 공급 목록에 없음. 임무 완료 플래그, 이벤트 직접 지급 또는 별도 모드 스크립트 근거가 확인되기 전까지 연구실 수급 불가로 유지'};
  }
  if(rule.cost===0&&!eventSources.length){
    return {kind:'AUTO_QUEUE_SOURCE_UNVERIFIED',neededItem:rule.needItem?needed:null,
      reason:'비용 0 연구는 일반 연구실 수동 완료로 가정할 수 없음. 선행 완료·직접 unlocks·lookup·기지 기능에 따른 자동 큐 또는 실제 이벤트 출처 확인 필요'};
  }
  if(eventSources.length){
    return {kind:'EVENT_CHRONOLOGY_UNRESOLVED',events:eventSources.map(e=>e.event),
      reason:'직접 이벤트 지급 후보는 존재하지만 월별 조건·음성 가드·발생 결과를 실제 가능한 순서로 재생하지 못함'};
  }
  return {kind:'SOURCE_ROUTE_UNRESOLVED',
    reason:'연구실·무료 추첨·직접 해금·자동 큐의 대체 경로를 한정 탐색에서 완성하지 못함. 영구 불가능 증거 아님'};
}
