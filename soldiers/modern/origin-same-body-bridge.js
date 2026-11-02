// A bounded, source-specific training-insertion witness for v.o2.
//
// Evaluate one requested SAME-BODY transformation, plus only its mandatory
// same-body predecessors, at each interval in a known type-change ancestry.
// Every insertion is checked against both the earlier and later transformation
// history (including resets). This is deliberately NOT a complete training
// optimization or a campaign proof. We calculate only the UNIQUE, surviving
// SoldierBonus deltas; raw stat transformation changes and end-stats remain
// uncomputed. A missing witness is never evidence of impossible acquisition.
export const BONUS_STATS=["tu","stamina","health","bravery","reactions","firing",
  "throwing","strength","psiStrength","psiSkill","melee"];
const arr=x=>Array.isArray(x)?x:[];
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const bonusSum=(bonuses,ids)=>BONUS_STATS.reduce((sum,k)=>sum+
  [...ids].reduce((n,id)=>n+Number(bonuses.get(id)?.stats?.[k]||0),0),0);
const positiveHistory=history=>new Set(Object.entries(history||{})
  .filter(([,count])=>Number(count)>0).map(([id])=>id));
const makeState=profile=>({
  soldierType:profile.soldierType,
  history:positiveHistory(profile.previousTransformations),
  traits:new Set(Object.entries(profile.traitCounts||{})
    .filter(([,count])=>Number(count)>0).map(([id])=>id)),
  stepIds:[],requiresUnverifiedVitalContinuity:false,
  hasUnresolvedStatChange:false
});
const copyState=s=>({
  soldierType:s.soldierType,history:new Set(s.history),traits:new Set(s.traits),
  stepIds:[...s.stepIds],
  requiresUnverifiedVitalContinuity:s.requiresUnverifiedVitalContinuity,
  hasUnresolvedStatChange:s.hasUnresolvedStatChange
});
function structurallyAllowed(rule,state){
  if(!rule||arr(rule.requires).includes("STR_UNAVAILABLE")||
    rule.createsClone||rule.producedItem||
    !arr(rule.allowedSoldierTypes).includes(state.soldierType)||
    arr(rule.forbiddenSoldierTypes).includes(state.soldierType)||
    arr(rule.requiredPreviousTransformations).some(id=>!state.history.has(id))||
    arr(rule.forbiddenPreviousTransformations).some(id=>state.history.has(id)))
    return false;
  return !!(rule.allowsLiveSoldiers||rule.allowsWoundedSoldiers||
    rule.allowsDeadSoldiers);
}
function applyHistory(rule,state){
  if(!structurallyAllowed(rule,state))return null;
  const next=copyState(state);
  if(rule.reset){
    next.history.clear();next.traits.clear();
  }else for(const id of arr(rule.removeTransformations)){
    if(!next.history.has(id))continue;
    next.history.delete(id);
    // Can't attribute shared SoldierBonus ownership through an unmodelled
    // selective eraser. The current v.o2 transformations have NONE.
    return null;
  }
  next.history.add(rule.id);
  if(rule.soldierBonusType)next.traits.add(rule.soldierBonusType);
  next.stepIds.push(rule.id);
  if(rule.producedSoldierType)next.soldierType=rule.producedSoldierType;
  if(rule.allowsDeadSoldiers&&
    !rule.allowsLiveSoldiers&&!rule.allowsWoundedSoldiers)
    next.requiresUnverifiedVitalContinuity=true;
  const sumOfMagnitude=record=>BONUS_STATS.some(k=>Number(record?.[k]||0)!==0);
  if(sumOfMagnitude(rule.flatOverallStatChange)||
    sumOfMagnitude(rule.percentOverallStatChange)||
    sumOfMagnitude(rule.percentGainedStatChange)||
    sumOfMagnitude(rule.flatMin)||sumOfMagnitude(rule.flatMax)||
    !!rule.rerollStats)
    next.hasUnresolvedStatChange=true;
  return next;
}
function applyAncestry(state,steps,from,transformations){
  let current=state;
  for(let i=from;i<steps.length;i++){
    const s=steps[i],rule=transformations.get(s.transformationId);
    if(s.fromType!==current.soldierType||
      s.toType!==rule?.producedSoldierType||
      s.historyReset!==(rule?.reset===true))
      return null;
    current=applyHistory(rule,current);
    if(!current)return null;
  }
  return current;
}
// Return a small collection of possible ordered prerequisite closures. Only
// same-body rule IDs can be inserted, and only the requested target and its
// transitive requiredPreviousTransformations can be part of the insertion.
function resolvePrerequisites(targetId,current,path,stack,byId,limit=6){
  if(current.history.has(targetId))return [{state:current,planned:path}];
  if(path.length>=limit||stack.has(targetId))return [];
  const target=byId.get(targetId);
  if(!target||target.producedSoldierType||target.producedItem||target.createsClone||
    !arr(target.allowedSoldierTypes).includes(current.soldierType)||
    arr(target.requires).includes("STR_UNAVAILABLE"))
    return [];
  const missing=arr(target.requiredPreviousTransformations)
    .filter(id=>!current.history.has(id));
  if(!missing.length){
    const next=applyHistory(target,current);
    return next?[{state:next,planned:[...path,target.id]}]:[];
  }
  const results=[];
  for(const id of missing){
    const nextStack=new Set([...stack,targetId]);
    for(const prior of resolvePrerequisites(id,current,path,nextStack,byId,limit)){
      for(const later of resolvePrerequisites(targetId,prior.state,prior.planned,stack,byId,limit)){
        results.push(later);
        if(results.length>=12)return results;
      }
    }
  }
  return results;
}
function compactWitness(r){
  return {targetId:r.targetId,targetName:r.targetName,
    beforeBodyChangeIndex:r.beforeBodyChangeIndex,
    stageSoldierType:r.stageSoldierType,
    prerequisiteAndTargetIds:r.prerequisiteAndTargetIds,
    survivingNewBonusIds:r.survivingNewBonusIds,
    extraUniqueBonusNonManaSum:r.extraUniqueBonusNonManaSum,
    isPositiveBonus:r.extraUniqueBonusNonManaSum>0,
    requiresUnverifiedVitalContinuity:r.requiresUnverifiedVitalContinuity,
    hasUnresolvedStatChange:r.hasUnresolvedStatChange,
    historyTypeOnly:true,
    researchProven:false,materialsProven:false,medalsProven:false,
    statsProven:false,calendarProven:false,
    finalStats:null,finalSum:null};
}
const byBonus=(a,b)=>
  b.extraUniqueBonusNonManaSum-a.extraUniqueBonusNonManaSum||
  a.prerequisiteAndTargetIds.length-b.prerequisiteAndTargetIds.length||
  cmp(a.targetId,b.targetId)||
  a.beforeBodyChangeIndex-b.beforeBodyChangeIndex||
  cmp(a.prerequisiteAndTargetIds.join("/"),b.prerequisiteAndTargetIds.join("/"));

export function auditSingleSameBodyTraining(data,origin,candidate,{
  includeAll=false,includeEveryInsertion=false
}={}){
  if(data?.meta?.mod?.version!=="v.o2")
    throw new Error("Training insertion requires X-Piratez v.o2 provenance");
  if(!origin||!candidate||origin.id!==candidate.rootProfileId||
    origin.soldierType!==candidate.rootSoldierType)
    throw new Error("Original source profile does not match source-rooted body ancestry");
  const steps=candidate.steps||[];
  const byId=new Map(data.transformations.map(t=>[t.id,t]));
  const bonuses=new Map((data.bonuses||[]).map(x=>[x.id,x]));
  const same=(data.transformations||[]).filter(t=>!t.producedSoldierType&&
    !t.producedItem&&!t.createsClone&&
    !arr(t.requires).includes("STR_UNAVAILABLE")).sort((a,b)=>cmp(a.id,b.id));
  const initial=makeState(origin);
  const baseline=applyAncestry(initial,steps,0,byId);
  if(!baseline)throw new Error("Source-rooted body sequence is not history-consistent: "+
    origin.id+"/"+steps.map(s=>s.transformationId).join(">"));
  const witnessByTarget=new Map();
  const allInsertions=includeEveryInsertion?[]:null;
  let structuralInsertionWitnesses=0,checkedSlots=0;
  for(let at=0;at<=steps.length;at++){
    // Insertion before step "at": replay the prefix only, then the entire
    // remaining suffix after adding a new same-body training.
    const baseAt=applyAncestry(initial,steps.slice(0,at),0,byId);
    if(!baseAt)throw new Error("Invalid prefix in source-rooted path");
    for(const target of same){
      checkedSlots++;
      if(baseAt.history.has(target.id)||
        !arr(target.allowedSoldierTypes).includes(baseAt.soldierType))
        continue;
      for(const closure of resolvePrerequisites(target.id,baseAt,[],new Set(),byId)){
        const terminal=applyAncestry(closure.state,steps.slice(at),0,byId);
        if(!terminal)continue;
        const newTraits=[...terminal.traits].filter(id=>!baseline.traits.has(id));
        const value=bonusSum(bonuses,newTraits);
        const record={
          targetId:target.id,targetName:target.koName||target.id,
          beforeBodyChangeIndex:at,stageSoldierType:baseAt.soldierType,
          prerequisiteAndTargetIds:closure.planned,
          survivingNewBonusIds:newTraits.sort(cmp),
          extraUniqueBonusNonManaSum:value,
          requiresUnverifiedVitalContinuity:
            terminal.requiresUnverifiedVitalContinuity,
          hasUnresolvedStatChange:terminal.hasUnresolvedStatChange
        };
        structuralInsertionWitnesses++;
        if(allInsertions)allInsertions.push(compactWitness(record));
        const saved=witnessByTarget.get(target.id);
        if(!saved||byBonus(record,saved)<0)witnessByTarget.set(target.id,record);
      }
    }
  }
  const bestByTarget=[...witnessByTarget.values()].sort(byBonus);
  const compact=bestByTarget.map(compactWitness);
  const result={
    scope:"SINGLE_TARGET_PLUS_REQUIRED_SAME_BODY_PREDECESSORS",
    originalProfileId:origin.id,
    typeChangeCount:steps.length,
    indexedSameBodyRules:same.length,
    checkedInsertionSlots:checkedSlots,
    distinctTrainingsWithHistoryWitness:bestByTarget.length,
    insertionSequenceWitnesses:structuralInsertionWitnesses,
    targetsWithPositiveSurvivingBonus:bestByTarget.filter(x=>
      x.extraUniqueBonusNonManaSum>0).length,
    strongestOneTargetStructuralCandidate:compact[0]||null,
    bestDistinctTrainingTargets:bestByTarget.length,
    status:"HISTORY_AND_TYPE_ONLY_NOT_EXECUTED",
    finalStats:null,finalSum:null,
    limitations:[
      "Exactly one chosen same-body target plus only its required predecessor closure, inserted at one point in the fixed type-change chain",
      "Other optional same-body training combinations and repeat applications are not explored",
      "New surviving UNIQUE SoldierBonus stats exclude mana; raw flat/percent stats changes and the eventual ability to reach stat caps are not modeled",
      "Research/medal/rank/stat/item/base/time/RNG/vital-status requirements are NOT replayed and can invalidate all listed witnesses",
      "Failed insertion is not a certificate of impossibility, and the strongest single inserted target is not an overall maximum"
    ]
  };
  if(includeAll)result.targetWitnesses=compact;
  if(allInsertions)result.allInsertionWitnesses=allInsertions;
  return result;
}

export function birthOnlyTrainingAudit(data,profile,{includeAll=false}={}){
  return auditSingleSameBodyTraining(data,profile,{
    rootProfileId:profile.id,rootSoldierType:profile.soldierType,steps:[]
  },{includeAll});
}
