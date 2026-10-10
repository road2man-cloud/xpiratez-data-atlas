// Hard research/event exclusions NOT modeled by soldierTransformation's
// forbiddenPreviousTransformations. A warning here is deliberately stricter
// than the theoretical, type-and-order-only enhancement enumerator.
// Do not classify Saint-POOL ITEM profiles as Saint-ONLY: the same physical
// recruitment item can also come from non-Saint events or manufacturing.
const CAPTAIN_LOCKS=new Map([
  ["STR_CAPTAINS_11",{captain:"THIEF",source:"STR_CAPTAINS_11 event requires STR_CAPTAIN_THIEF"}],
  ["STR_BREAD_AND_FISHES_TRAINING",{captain:"PRIEST",source:"STR_CAPTAIN_PRIEST"}],
  ["STR_MILITARY_DRILL_TRAINING",{captain:"RULER",source:"STR_CAPTAIN_RULER"}]
]);
const CODEX_ONLY=["STR_BRIDES_TO_THE_QUEEN","STR_HERO_GOLD_TRAINING","STR_HERO_GREEN_TRAINING","STR_HERO_RED_TRAINING"];
const names=x=>Array.isArray(x)?x:[];
export function auditSoldierBuild(profile,transformationIds,transformations){
  const ids=new Set(names(transformationIds));
  const byId=transformations instanceof Map?transformations:new Map(names(transformations).map(t=>[t.id,t]));
  const hard=[],sourceWarnings=[];
  const unavailable=[...ids].filter(id=>names(byId.get(id)?.requires).includes("STR_UNAVAILABLE"));
  if(unavailable.length)hard.push({code:"unavailable",ids:unavailable,
    reason:"STR_UNAVAILABLE 내부 전용 변신은 일반 캠페인에서 연구 불가"});
  const captain=[...ids].filter(id=>CAPTAIN_LOCKS.has(id));
  const locked=[...new Set(captain.map(id=>CAPTAIN_LOCKS.get(id).captain))];
  if(locked.length>1)hard.push({code:"captain-conflict",ids:captain,
    reason:"하나의 선장에서 양립하지 않는 고유 연구: "+locked.join(" / ")});
  if(ids.has("STR_PARIAH_TRAINING")){
    const conflicting=CODEX_ONLY.filter(id=>ids.has(id));
    if(conflicting.length)hard.push({code:"queen-codex-conflict",
      ids:["STR_PARIAH_TRAINING",...conflicting],
      reason:"야만 여왕(힘 거부)과 Codex 각성(드릴 조사)은 선행 선택지에서 상호 배제"});
  }
  if(Number(profile?.saintSlots)>0){
    if(ids.has("STR_CAPTAINS_11"))sourceWarnings.push({code:"saint-thief",
      reason:"Saint 지원군으로 얻는 경로에서는 도둑 전용 선장의 11 불가. 동일 모집 아이템의 Saint 외 획득 경로는 별도 판단"});
    if(ids.has("STR_PARIAH_TRAINING"))sourceWarnings.push({code:"saint-queen",
      reason:"Saint 지원군 획득 경로에서는 야만 여왕·퍼라이어 불가. 동일 아이템의 별도 획득 경로는 확인 필요"});
  }
  return {hard,sourceWarnings,verified:false};
}
