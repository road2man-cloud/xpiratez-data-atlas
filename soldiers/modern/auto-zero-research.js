// Independent, conservative audit of zero-cost research rules in X-Piratez 2.1.
// OXCE SavedGame::addFinishedResearch() checks newly available cost-0 topics
// after a research completes. This audit does NOT manufacture completion or
// change a campaign witness: it describes the prerequisite gates only.
const arr=v=>Array.isArray(v)?v:[];
const asSet=v=>v instanceof Set?v:new Set(arr(v));
const count=(obj,id)=>Number(obj?.[id]||0);
export function zeroCostResearchGate(data,id,state={},options={}){
  const rules=data?.researchRules||{},rule=rules[id];
  if(!rule)return {id,kind:"unknown",reasons:["연구 규칙 없음"]};
  if(Number(rule.cost)!==0)return {id,kind:"not-zero-cost",reasons:["비용 0 자동 연구 대상 아님"]};
  const done=asSet(state.researched),disabled=asSet(state.disabled);
  const unlockers=Object.entries(rules).filter(([,r])=>arr(r.unlocks).includes(id))
    .map(([source])=>source);
  const finished=options.justFinished||null;
  const throughUnlock=finished!==null&&arr(rules[finished]?.unlocks).includes(id);
  const alreadyUnlock=unlockers.some(x=>done.has(x));
  const missingDeps=throughUnlock||alreadyUnlock?[]:
    arr(rule.dependencies).filter(x=>!done.has(x));
  const missingReq=arr(rule.requires).filter(x=>!done.has(x));
  const itemId=rule.neededItem||id;
  const inventoryKnown=options.inventoryKnown===true;
  const functionsKnown=options.functionsKnown===true;
  const missingItem=!!rule.needItem&&(inventoryKnown?count(state.items,itemId)<1:null);
  const missingFunctions=arr(rule.requiresBaseFunc).filter(x=>!asSet(state.baseFunctions).has(x));
  const reasons=[];
  let kind="candidate";
  if(id==="STR_UNAVAILABLE"){kind="internal-only";reasons.push("내부 전용 플래그: 일반 캠페인의 획득 증명으로 사용 금지")}
  else if(disabled.has(id)){kind="disabled-now";reasons.push("현재 영구 폐쇄 상태 (재활성화 근거 별도 필요)")}
  else if(done.has(id)){kind="completed";reasons.push("현재 세이브에서 연구 완료 확인")}
  else{
    if(missingDeps.length)reasons.push("미완료 dependencies: "+missingDeps.join(", "));
    if(missingReq.length)reasons.push("미완료 requires: "+missingReq.join(", "));
    if(rule.needItem){
      if(missingItem===true)reasons.push("선택 기지의 실물 표본 부족: "+itemId);
      else if(missingItem===null)reasons.push("선택 기지 실물 보유 확인 필요: "+itemId);
    }
    if(missingFunctions.length)reasons.push(
      (functionsKnown?"필수 기지 기능 부족: ":"기지 기능 확인 필요: ")+missingFunctions.join(", "));
    if(arr(rule.requires).length&&!throughUnlock)
      reasons.push("보호된 비용 0 연구는 직전 완료 연구의 직접 unlocks에 포함되어야 자동 처리");
    if(!finished)
      reasons.push("연구 완료 후에만 자동 처리 검토 (기존 연구 완료로 소급 지급 불가)");
    else if(finished===id)
      reasons.push("원천 연구와 대상 연구가 동일하므로 자동 지급 근거 없음");
    const unmet=missingDeps.length||missingReq.length||missingItem!==false&&!!rule.needItem||
      missingFunctions.length||arr(rule.requires).length&&!throughUnlock;
    kind=unmet?"gated":finished?"eligible-after-source":"pending-source";
    if(kind==="eligible-after-source")
      reasons.push("비용 0 자동 처리 후보: 다른 동시 자동 연구·상호배제 순서까지 검증해야 확정 가능");
  }
  return {
    id,kind,cost:0,itemId:rule.needItem?itemId:null,
    dependencies:arr(rule.dependencies),requires:arr(rule.requires),
    directUnlockers:unlockers,
    missingDependencies:missingDeps,missingRequirements:missingReq,
    missingItem,missingFunctions,
    researchEventSources:arr(data?.eventResearchSources?.[id]).length,
    reasons
  };
}
export function inspectTransformationZeroResearch(data,transformationId,state={},options={}){
  const row=arr(data?.transformations).find(x=>x.id===transformationId);
  if(!row)return [];
  return [...new Set(arr(row.requires).filter(id=>
    data?.researchRules?.[id]&&Number(data.researchRules[id].cost)===0))]
    .map(id=>zeroCostResearchGate(data,id,state,options));
}
