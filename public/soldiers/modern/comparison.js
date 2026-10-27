// Compare only source-backed X-Piratez 2.1 route eligibility.
// 'Excluded' means a PROVEN rule-level exclusion. A future requirement or
// initial-history conflict alone is never relabeled as permanently impossible.
import {initialState,structuralTransformationVerdict,eligibleTransformation} from "./eligibility.js";
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
