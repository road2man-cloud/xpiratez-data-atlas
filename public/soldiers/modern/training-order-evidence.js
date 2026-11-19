// Per-step, source-backed cap and reset audit for any registered origin path.
// No speculative final stat is produced. Source body identity is followed
// chronologically, so an earlier body's cap is never replaced retroactively.
const KEYS=Object.freeze(["tu","stamina","health","bravery","reactions","firing",
  "throwing","melee","strength","psiStrength","psiSkill","mana"]);
const nonzero=x=>Number.isFinite(Number(x))&&Number(x)!==0;
export function trainingOrderEvidence(profile,candidate,data){
  if(!profile||!candidate||!data)return {kind:"unverified",reason:"경로 원본 누락"};
  const transforms=(candidate.steps||[]).filter(step=>step.type==="transform").map(step=>step.transform);
  if(JSON.stringify(transforms)!==JSON.stringify(candidate.transforms||[]))
    return {kind:"unverified",reason:"변신 순서와 증거 단계 불일치"};
  const rules=new Map((data.transformations||[]).map(rule=>[rule.id,rule]));
  const bodies=new Map((data.soldiers||[]).map(body=>[body.id,body]));
  const stages=[];
  let bodyId=profile.soldierType;
  if(!bodies.has(bodyId))return {kind:"unverified",reason:"원본 출생 병종 없음"};
  for(const id of transforms){
    const rule=rules.get(id),source=bodies.get(bodyId);
    if(!rule)return {kind:"unverified",reason:"미색인 시술: "+id};
    if(!(rule.allowedSoldierTypes||[]).includes(bodyId))
      return {kind:"unverified",reason:"입력 병종과 변신 규칙 불일치: "+id+"/"+bodyId};
    const targetId=rule.producedSoldierType||bodyId,target=bodies.get(targetId);
    if(!target)return {kind:"unverified",reason:"변신 산출 병종 원본 없음: "+id};
    const upper=rule.upperBoundAtMaxStats?"maxStats":
      rule.upperBoundAtStatCaps?"statCaps":null;
    const soft=Number(rule.upperBoundType)===1||
      ((rule.upperBoundType==null||Number(rule.upperBoundType)===0)&&bodyId===targetId);
    const affected=KEYS.filter(k=>nonzero(rule.flatOverallStatChange?.[k])||
      nonzero(rule.traitStats?.[k])||
      nonzero(rule.flatMin?.[k])||nonzero(rule.flatMax?.[k])||
      nonzero(rule.percentOverallStatChange?.[k])||
      nonzero(rule.percentGainedStatChange?.[k])||
      nonzero(rule.percentMin?.[k])||nonzero(rule.percentMax?.[k])||
      nonzero(rule.percentGainedMin?.[k])||nonzero(rule.percentGainedMax?.[k])||
      Boolean(rule.rerollStats?.[k]));
    const random=KEYS.some(k=>
      Number(rule.flatMin?.[k]||0)!==Number(rule.flatMax?.[k]||0)||
      Number(rule.percentMin?.[k]||0)!==Number(rule.percentMax?.[k]||0)||
      Number(rule.percentGainedMin?.[k]||0)!==Number(rule.percentGainedMax?.[k]||0)||
      Boolean(rule.rerollStats?.[k]));
    stages.push({id,from:bodyId,to:targetId,upper,
      soft:upper?soft:null,
      lower:rule.lowerBoundAtMinStats===true,
      reset:rule.reset===true,
      removed:[...(rule.removeTransformations||[])],
      requiredResearch:[...(rule.requires||[])],
      affected,random,
      changes:Object.fromEntries(affected.map(k=>[k,{
        flat:rule.flatOverallStatChange?.[k]||0,
        bonus:rule.traitStats?.[k]||0,
        flatRange:[rule.flatMin?.[k]||0,rule.flatMax?.[k]||0],
        percentOverall:rule.percentOverallStatChange?.[k]||0,
        percentRange:[rule.percentMin?.[k]||0,rule.percentMax?.[k]||0],
        percentGained:rule.percentGainedStatChange?.[k]||0,
        percentGainedRange:[rule.percentGainedMin?.[k]||0,rule.percentGainedMax?.[k]||0],
        reroll:Boolean(rule.rerollStats?.[k]),
        max:upper?target[upper]?.[k]:null,
        previousCap:source.statCaps?.[k],
        nextCap:target.statCaps?.[k]
      }])), 
      originalSource:rule.sourceFiles||[]
    });
    bodyId=targetId;
  }
  return {kind:"ready",stages,finalType:bodyId};
}
