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
const readable=(id,byId)=>byId.get(id)?.koName||id;

function divergentPathAudit(ids,byId,pathData,selectedPath){
  const paths=names(pathData?.paths);
  if(!paths.length)return {hard:[],paths:[],selectedPath:""};
  const fullMask=(1<<paths.length)-1;
  const allowed=id=>pathData.masks?.[id]??fullMask;
  const rows=[...ids].filter(id=>byId.has(id)).map(id=>({id,mask:allowed(id)}));
  const intersection=rows.reduce((mask,row)=>mask&row.mask,fullMask);
  const available=paths.filter((_,i)=>intersection&(1<<i));
  const chosen=paths.findIndex(p=>p.id===selectedPath);
  if(chosen>=0){
    const denied=rows.filter(r=>!(r.mask&(1<<chosen)));
    if(denied.length)return {paths:available,selectedPath,hard:[{
      code:"selected-diverging-path",ids:denied.map(r=>r.id),
      reason:paths[chosen].koName+" 분기에서 연구할 수 없는 훈련: "+
        denied.map(r=>readable(r.id,byId)).join(", ")
    }]};
    return {paths:available,selectedPath,hard:[]};
  }
  if(intersection!==0)return {paths:available,selectedPath:"",hard:[]};
  // All five exclusive Diverging Paths fail for this *combination*. Prefer
  // a minimal two-training conflict as actionable evidence. If the smallest
  // conflict takes >=3 trainings, show only the constrained contributors.
  let evidence=null;
  for(let i=0;i<rows.length&&!evidence;i++)for(let j=i+1;j<rows.length;j++)
    if((rows[i].mask&rows[j].mask)===0){evidence=[rows[i].id,rows[j].id];break;}
  evidence ||=rows.filter(r=>r.mask!==fullMask).map(r=>r.id);
  return {paths:[],selectedPath:"",hard:[{
    code:"diverging-path-conflict",ids:evidence,
    reason:"양립 가능한 Diverging Paths 분기가 없음: "+
      evidence.map(id=>readable(id,byId)).join(" + ")+
      " (5개 분기 전체에서 선행 연구 충돌)"
  }]};
}
export function auditSoldierBuild(profile,transformationIds,transformations,pathData=null,selectedPath=""){
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
  const pathAudit=divergentPathAudit(ids,byId,pathData,selectedPath);
  hard.push(...pathAudit.hard);
  if(Number(profile?.saintSlots)>0){
    if(ids.has("STR_CAPTAINS_11"))sourceWarnings.push({code:"saint-thief",
      reason:"Saint 지원군으로 얻는 경로에서는 도둑 전용 선장의 11 불가. 동일 모집 아이템의 Saint 외 획득 경로는 별도 판단"});
    if(ids.has("STR_PARIAH_TRAINING"))sourceWarnings.push({code:"saint-queen",
      reason:"Saint 지원군 획득 경로에서는 야만 여왕·퍼라이어 불가. 동일 아이템의 별도 획득 경로는 확인 필요"});
  }
  return {hard,sourceWarnings,divergingPaths:pathAudit.paths,selectedPath:pathAudit.selectedPath,verified:false};
}
