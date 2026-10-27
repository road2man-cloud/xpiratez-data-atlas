// Compare only source-backed X-Piratez 2.1 route eligibility.
// 'Excluded' means a PROVEN rule-level exclusion. A future requirement or
// initial-history conflict alone is never relabeled as permanently impossible.
import {initialState,structuralTransformationVerdict,eligibleTransformation,researchPlan} from "./eligibility.js";
const exists=x=>Array.isArray(x)?x:[];

export const DEFAULT_PROFILES={
  gal:"base:STR_SOLDIER",
  half:"manufacture:STR_HALF_UBER_GIRL_RECRUITMENT"
};

function gate(t,state,data){
  const structure=structuralTransformationVerdict(t,state,data);
  if(structure.kind==="blocked"){
    return {kind:"excluded",label:"확정 제외",reason:structure.reason,
      proof:structure.proof||"병종 계보",originallyAccessible:false};
  }
  const inherited=exists(t.forbiddenPreviousTransformations)
    .filter(id=>state.history.has(id));
  const missing=exists(t.requiredPreviousTransformations)
    .filter(id=>!state.history.has(id));
  const verdict=eligibleTransformation(t,state,data,{mode:"future"});
  // A reset or body-changing path could restore access after an inherited
  // conflict. Do NOT use a direct block to assert a lifetime impossibility.
  if(inherited.length)return {kind:"history",label:"초기 이력 충돌",
    reason:inherited.join(", ")+" · 초기 변신 기록과 충돌 (이력 초기화 가능성 별도)",
    originallyAccessible:true};
  if(structure.kind==="conditional")return {kind:"body-change",label:"병종 전환 필요",
    reason:structure.path.join(" → ")+" · 이후 필요조건 재계산",originallyAccessible:true};
  if(missing.length)return {kind:"prerequisite",label:"선행 변신 필요",
    reason:missing.join(", "),originallyAccessible:true};
  if(verdict.kind==="blocked")return {kind:"research-conflict",label:"연구 경로 충돌",
    reason:(verdict.blockers||[]).join(" · ")||"연구·이벤트 경로 탐색 필요",
    originallyAccessible:true};
  if(verdict.kind==="conditional")return {kind:"conditional",label:"미래 조건부",
    reason:(verdict.conditions||[]).slice(0,3).join(" · "),
    originallyAccessible:true};
  return {kind:"rule-ready",label:"규칙상 후보",
    reason:"실제 지급·성장·선장 분기는 아직 증명되지 않음",
    originallyAccessible:true};
}
// Save-aware EVIDENCE about research only. Current completion of a research
// flag doesn't prove a FUTURE transformation can be executed (body, medals,
// materials, time, rewards, choice history and physical unit are separate).
export function assessCampaignResearch(data,save,transformation){
  if(!save?.research)return {kind:"no-save",label:"세이브 미적용",reason:"로컬 세이브 필요"};
  const goals=exists(transformation.requires);
  if(goals.includes("STR_UNAVAILABLE"))
    return {kind:"internal",label:"내부 전용",reason:"STR_UNAVAILABLE"};
  const completed=new Set(exists(save.research.completed));
  const disabled=new Set(exists(save.research.disabled));
  const overlap=goals.filter(id=>completed.has(id)&&disabled.has(id));
  if(overlap.length)return {kind:"ambiguous",label:"완료·폐쇄 기록 중복",
    reason:overlap.join(", ")+" · 세이브 기록 상태 상충"};
  const already=goals.filter(id=>completed.has(id));
  const plan=researchPlan(goals,data.researchRules,{
    researched:[...completed],disabled:[...disabled],
    goalSemantics:"simultaneous",eventResearchSources:data.eventResearchSources
  });
  if(plan.kind==="blocked")return {kind:"closed",label:"연구 직접 차단 확인",
    reason:plan.blocked.join(" · "),completed:already.length};
  if(already.length===goals.length)return {kind:"complete",label:"요구 연구 완료",
    reason:"연구 플래그 "+goals.length+"개 보유 · 변신 자격/재료는 별개",completed:already.length};
  if(plan.diagnosticBlockers.length)return {kind:"nominal",label:"명목 선행망 충돌",
    reason:plan.diagnosticBlockers.slice(0,2).join(" · ")+
      " · 이벤트·우회 지급을 증명하거나 배제하지 못함",completed:already.length};
  const rewards=goals.flatMap(id=>exists(data.eventResearchSources?.[id])
    .map(x=>x.event));
  if(rewards.length)return {kind:"event",label:"이벤트 직접 지급 후보",
    reason:[...new Set(rewards)].slice(0,3).join(", ")+" · 발생 보장 아님",completed:already.length};
  return {kind:"pending",label:"향후 연구 미완료",
    reason:"미완료 "+goals.filter(id=>!completed.has(id)).slice(0,4).join(", ")+
      " · 다른 숨은 분기·전리품 조건은 아직 미검증",completed:already.length};
}

export function compareSoldierFutureRoutes(data,profileIds=DEFAULT_PROFILES){
  const gal=initialState(data,profileIds.gal),half=initialState(data,profileIds.half);
  if(!gal.soldierType||!half.soldierType)throw Error("Unknown soldier route");
  const rows=(data.transformations||[]).map(t=>{
    const a=gate(t,gal,data),b=gate(t,half,data);
    return {id:t.id,koName:t.koName,gal:a,half:b,different:a.kind!==b.kind};
  });
  const counts=key=>({
    excluded:rows.filter(r=>r[key].kind==="excluded").length,
    candidates:rows.filter(r=>r[key].kind!=="excluded").length,
    inheritedHistory:rows.filter(r=>r[key].kind==="history").length,
    futureConditional:rows.filter(r=>r[key].kind==="conditional").length
  });
  return {rows,different:rows.filter(r=>r.different).length,
    profileIds,gal:counts("gal"),half:counts("half")};
}
