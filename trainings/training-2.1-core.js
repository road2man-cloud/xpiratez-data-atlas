// X-Piratez 2.1 only. This module reuses the canonical OXCE 8.7.1
// chronology/eligibility engine instead of 1.1.1 planner calculations.
import {
  eligibleTransformation,structuralTransformationVerdict,
  applyTransformation
} from "../soldiers/modern/eligibility.js";

export const TRAINING_SOURCE_VERSION="v.o2";
const arr=x=>Array.isArray(x)?x:[];
export function validateTrainingSource(data){
  if(data?.meta?.mod?.version!==TRAINING_SOURCE_VERSION||
     data?.meta?.mod?.id!=="piratez"||
     data?.transformations?.length!==83||
     data?.profiles?.length!==72||
     data?.soldiers?.length!==29||
     !(data?.researchRules?.STR_BASIC_FIREARMS_TRAINING)){
    throw Error("2.1 원본 버전 또는 83개 훈련·72개 출생 프로필 검증 실패. 구버전 자료로 대체하지 않습니다.");
  }
  const source=data.meta.source?.rules?.find(x=>x.file==="Piratez_Transformations.rul");
  if(!/^[a-f0-9]{64}$/.test(source?.sha256||""))
    throw Error("2.1 훈련 원본 파일 해시 누락. 모든 결과 표시를 중단합니다.");
  const ids=data.transformations.map(t=>t.id);
  if(new Set(ids).size!==83||data.profiles.some(p=>!p.id||!p.soldierType)||
    data.transformations.some(t=>!t.id||!Array.isArray(t.allowedSoldierTypes)))
    throw Error("2.1 훈련 ID·출생처 정합성 검증 실패.");
  return {transformations:83,profiles:72,soldiers:29,hash:source.sha256};
}
export function futureOptions(options={}){
  // Once any hypothetical step is added, original inventory, medal ranks,
  // money and grown stats cannot still be treated as current exact evidence.
  return {
    mode:"future",
    researched:arr(options.researched),
    disabled:arr(options.disabled),
    commendations:options.commendations||{},
    medalsKnown:false,statsKnown:false,
    historyKnown:options.historyKnown,
    itemsKnown:false,baseFunctionsKnown:false,
    funds:null
  };
}
export function classifyTraining(rule,state,data,options={}){
  if(!rule||!state)return {kind:"not-now",label:"대원 확인 필요",direct:null,
    structural:null,reasons:["출생처 또는 대원을 먼저 선택해야 합니다."]};
  const structural=structuralTransformationVerdict(rule,state,data);
  if(structural.kind==="blocked")return {
    kind:"excluded",label:"계보상 확정 제외",direct:null,structural,
    reasons:[structural.reason]
  };
  const direct=eligibleTransformation(rule,state,data,options);
  if(direct.kind==="blocked")return {
    kind:"not-now",
    label:options.mode==="current"?"현재 즉시 미충족":"선행 조건 필요",
    direct,structural,reasons:direct.blockers
  };
  if(direct.kind==="eligible"&&options.mode==="current")
    return {kind:"ready",label:"현재 규칙 조건 충족",direct,structural,
      reasons:["입력한 세이브의 현재 조건만 확인했습니다. 실제 훈련 실행·결과를 인증하지 않습니다."]};
  return {
    kind:"conditional",label:"미래 조건부",
    direct,structural,
    reasons:[...(direct.conditions||[]),...(structural.kind==="conditional"?
      ["선행 병종 변경 경로 확인 필요"]:[])]
  };
}
export function replayTrainingPlan(data,base,steps,options={}){
  if(!base)return {kind:"invalid",state:null,reason:"대원 상태 미확인",receipts:[]};
  let state=base;
  const receipts=[];
  const bounded=arr(steps);
  if(bounded.length>16)return {kind:"invalid",state:base,
    reason:"한 화면에서 계획하는 가상 훈련은 16단계까지입니다.",receipts:[]};
  for(let i=0;i<bounded.length;i++){
    const id=bounded[i],rule=data.transformations.find(t=>t.id===id);
    if(!rule)return {kind:"invalid",state,reason:"훈련 ID 원본 누락: "+id,receipts};
    // A clone is a NEW soldier, not a continuation of the input soldier.
    if(rule.createsClone)return {kind:"invalid",state,
      reason:"복제는 별도 대원을 생성하므로 원본 병사의 경로에 합산하지 않습니다.",receipts};
    const stepOptions=i===0?options:futureOptions(options);
    const verdict=classifyTraining(rule,state,data,stepOptions);
    if(verdict.kind==="excluded"||verdict.kind==="not-now")return {
      kind:"invalid",state,reason:id+": "+verdict.reasons.join(" · "),receipts
    };
    const simulated=applyTransformation(rule,state,data,stepOptions);
    if(simulated.verdict.kind==="blocked")return {kind:"invalid",state,
      reason:id+": OXCE 훈련 조건 미충족",receipts};
    receipts.push({id,kind:verdict.kind,conditional:verdict.kind!=="ready"||i>0,
      beforeType:state.soldierType,afterType:simulated.state.soldierType,
      reset:!!rule.reset,retired:!!rule.producedItem,
      notes:verdict.reasons.slice(0,3)});
    state=simulated.state;
  }
  return {kind:"conditional-plan",state,receipts};
}
export function appendTrainingStep(data,base,steps,id,options={}){
  const rule=data?.transformations?.find(t=>t.id===id);
  if(!rule)return {kind:"rejected",reason:"2.1 훈련 원본에 없는 ID"};
  if(rule.createsClone)return {kind:"rejected",reason:"복제는 별도 병사입니다. 원본 병사의 영구 보너스·훈련 이력에 합산할 수 없습니다."};
  const before=replayTrainingPlan(data,base,steps,options);
  if(before.kind==="invalid")return {kind:"rejected",reason:before.reason};
  const classification=classifyTraining(rule,before.state,data,steps.length?futureOptions(options):options);
  if(classification.kind==="excluded"||classification.kind==="not-now")
    return {kind:"rejected",reason:classification.reasons.slice(0,3).join(" · ")};
  const updated=replayTrainingPlan(data,base,[...steps,id],options);
  if(updated.kind==="invalid")return {kind:"rejected",reason:updated.reason};
  return {kind:"added",steps:[...steps,id],plan:updated,classification};
}
