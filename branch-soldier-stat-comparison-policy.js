// Comparison scores never reward a conditional decoration prerequisite.
// Keep exact gameplay/replay vectors and medals unchanged for surgery gates.
export const CAREER_STAT_POLICY=Object.freeze({
 id:"CAREER_COMPARISON_NO_COMMENDATION_BONUS_V1",
 label:"훈장 제외 영구 능력치",
 medals:"시술 및 훈련 요구 조건 충족에만 사용. 최종 능력치·합계·성장캡·파레토 비교에서 제외.",
});
const valid=v=>Array.isArray(v)&&v.length===12&&v.every(Number.isSafeInteger);
const equal=(a,b)=>valid(a)&&valid(b)&&a.every((v,i)=>v===b[i]);
const effective=(raw,bonus)=>raw.map((v,i)=>i===9&&v<=0&&bonus[i]>0?v:Math.max(i===2?1:0,v+bonus[i]));
const medalAction=a=>a?.type==="conditionalMedal"||a?.type==="commendation"||a?.type==="medal";
const noMedalActions=r=>Array.isArray(r.actions)&&!r.actions.some(medalAction)&&!Object.keys(r.medals||{}).length;
export function comparisonStats(ledger,data,r){
 if(r.permanentVector!=null||r.permanentCapVector!=null){
  if(!valid(r.permanentVector)||!valid(r.permanentCapVector))return null;
  // When components are available, check both vectors independently.
  if(valid(r.permanentBonus)){
   if(valid(r.raw)&&!equal(effective(r.raw,r.permanentBonus),r.permanentVector))return null;
   if(valid(r.capRaw)&&!equal(effective(r.capRaw,r.permanentBonus),r.permanentCapVector))return null;
  }
  return {current:r.permanentVector,cap:r.permanentCapVector,statPolicy:CAREER_STAT_POLICY.id};
 }
 // These two archived producers store decoration-free results under
 // legacy field names. Do not interpret arbitrary "vector" as permanent.
 if(!["newpair","growth"].includes(ledger.key)||!valid(r.raw)||!valid(r.capRaw)||!valid(r.bonus))return null;
 if(ledger.key==="newpair"){
  if(data.kind!=="POPULATION_NEW_PAIR_CAREER")return null;
  if(r.careerPolicy){
   if(r.careerPolicy!=="NEW_PAIR_CONDITIONAL_RANK_MEDAL_V1"||data.careerPolicy?.id!==r.careerPolicy||data.careerPolicy.medalDecorationExcluded!==true||
      !valid(r.medalInclusiveBonus)||!equal(effective(r.raw,r.medalInclusiveBonus),r.medalInclusiveVector))return null;
  }else if(!noMedalActions(r))return null;
 }else if(data.kind!=="POPULATION_GROWTH_REPLAY"||data.model!=="CHRONOLOGICAL_CONDITIONAL_CAP_GROWTH_V1"||!noMedalActions(r))return null;
 if(!equal(effective(r.raw,r.bonus),r.vector)||!equal(effective(r.capRaw,r.bonus),r.capVector))return null;
 return {current:r.vector,cap:r.capVector,statPolicy:CAREER_STAT_POLICY.id};
}
