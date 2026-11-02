// V.o2 / OXCE 8.7.1: source-first, chronological *stat/cap projections*.
//
// This is a deliberately NON-CERTIFYING model: a structural route is assumed
// for the purpose of showing what its order would do to raw stats, one-copy
// SoldierBonus, body statCaps, trainingStatCaps, and a cap+bonus reference.
// No step proves research, medals, item supply, promotion, event RNG, combat XP
// or the RNG rolls needed for a real soldier to reach its numeric upper bound.
//
// A SoldierBonus alters effective stats and the display's "effective cap
// reference". It does NOT change the underlying RuleSoldier.statCaps used by
// OXCE's combat growth and upperBoundAtStatCaps transformations.
import {STAT_KEYS,initialState,bonusStats} from "./eligibility.js";
import {createStatEnvelope,advanceStatEnvelope} from "./stat-envelope.js";
import {growStatEnvelope} from "./growth-envelope.js";

export const FINAL_STATS=STAT_KEYS.filter(k=>k!=="mana");
const arr=v=>Array.isArray(v)?v:[];
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const projection=x=>Object.fromEntries(FINAL_STATS.map(k=>[k,num(x?.[k])]));
const clone=x=>structuredClone(x);
const ordered=x=>[...x].sort();
function statsInterval(envelope){
  if(envelope?.kind!=="ready")return null;
  return {min:projection(envelope.low),max:projection(envelope.high),
    initialMin:projection(envelope.initialLow),initialMax:projection(envelope.initialHigh)};
}
function sourceType(data,id){
  return data.soldiers.find(s=>s.id===id);
}
function stage(data,state,envelope,index,action,prior,requiredResearch){
  const soldier=sourceType(data,state.soldierType);
  if(!soldier)throw new Error("Missing body rules for stage "+state.soldierType);
  const rawCaps=projection(soldier.statCaps);
  const physicalCaps=projection(soldier.trainingStatCaps);
  const generationMax=projection(soldier.maxStats);
  const soldierBonuses=projection(bonusStats(state,data));
  const effectiveCapReference=Object.fromEntries(FINAL_STATS.map(k=>
    [k,num(rawCaps[k])+num(soldierBonuses[k])]));
  const original=statsInterval(envelope);
  const effectiveCurrentInterval=original?{
    min:Object.fromEntries(FINAL_STATS.map(k=>[k,Math.max(k==="health"?1:0,
      original.min[k]+soldierBonuses[k])])),
    max:Object.fromEntries(FINAL_STATS.map(k=>[k,Math.max(k==="health"?1:0,
      original.max[k]+soldierBonuses[k])]))
  }:null;
  const capDelta=prior?Object.fromEntries(FINAL_STATS.map(k=>[k,
    rawCaps[k]-num(prior.rawGrowthCaps[k])])):Object.fromEntries(FINAL_STATS.map(k=>[k,0]));
  const bonusDelta=prior?Object.fromEntries(FINAL_STATS.map(k=>[k,
    soldierBonuses[k]-num(prior.uniquePermanentBonus[k])])):Object.fromEntries(FINAL_STATS.map(k=>[k,0]));
  const aboveRaw=effectiveCurrentInterval?FINAL_STATS.filter(k=>
    effectiveCurrentInterval.max[k]>rawCaps[k]):[];
  let growth=null;
  if(envelope?.kind==="ready"){
    const physical=growStatEnvelope(envelope,state,data,"@PHYS_TRAINING");
    const combat=physical.kind==="ready"?
      growStatEnvelope(physical,state,data,"@BATTLE_GROWTH"):physical;
    if(physical.kind==="ready"&&combat.kind==="ready"){
      growth={physicalRawUpper:projection(physical.high),
        physicalThenCombatRawUpper:projection(combat.high),
        status:"POSSIBLE_UPPER_ONLY_NOT_EXECUTED",
        notProofOfSimultaneousAchievement:true};
    }
  }
  return {
    index,action,body:state.soldierType,rank:state.rank,
    currentRawInterval:original?{min:original.min,max:original.max}:null,
    initialRawInterval:original?{min:original.initialMin,max:original.initialMax}:null,
    effectiveCurrentInterval,
    rawGrowthCaps:rawCaps,physicalTrainingCaps:physicalCaps,
    maxCreationStats:generationMax,
    uniquePermanentBonus:soldierBonuses,
    effectiveCapReference,
    deltaFromPreviousStage:{rawGrowthCap:capDelta,permanentBonus:bonusDelta},
    aboveBodyGrowthCapKeys:aboveRaw,
    history:ordered(state.history.keys()),
    bonusIds:ordered(state.bonusCounts.keys()),
    requiredResearch:ordered(requiredResearch),
    conditionalNaturalGrowthUpper:growth,
    sourceExact:envelope?.sourceExact===true,
    numericStatus:"CONDITIONAL_INTERVAL_ONLY",
    proof:{
      acquisition:false,researchOrder:false,
      trainingQualifiers:false,medalRecords:false,itemInventory:false,
      rankCareer:false,naturalGrowth:false,randomRolls:false,
      vitalContinuity:false,engineSave:false,globalOptimality:false
    },
    finalizedCurrentStats:null,certifiedMaxStats:null
  };
}
function checkStructure(rule,state){
  if(!rule||arr(rule.requires).includes("STR_UNAVAILABLE")||
    rule.createsClone||rule.producedItem||
    !arr(rule.allowedSoldierTypes).includes(state.soldierType)||
    arr(rule.forbiddenSoldierTypes).includes(state.soldierType)||
    arr(rule.requiredPreviousTransformations).some(id=>!state.history.has(id))||
    arr(rule.forbiddenPreviousTransformations).some(id=>state.history.has(id))||
    state.history.has(rule.id))
    return false;
  return !!(rule.allowsLiveSoldiers||rule.allowsWoundedSoldiers||rule.allowsDeadSoldiers);
}
function mutateState(state,rule,data){
  const next={...state,history:new Map(state.history),
    bonusCounts:new Map(state.bonusCounts),bonusIds:new Set(state.bonusIds),
    steps:[...state.steps,rule.id],remarks:[...state.remarks]};
  if(rule.reset){
    next.history.clear();next.bonusCounts.clear();
  }else for(const erased of arr(rule.removeTransformations)){
    const count=num(next.history.get(erased));
    if(count<=0)continue;
    next.history.delete(erased);
    const previous=data.transformations.find(t=>t.id===erased);
    const id=previous?.soldierBonusType;
    if(!id)continue;
    const remain=num(next.bonusCounts.get(id))-count;
    if(remain>0)next.bonusCounts.set(id,remain);
    else next.bonusCounts.delete(id);
  }
  next.history.set(rule.id,num(next.history.get(rule.id))+1);
  if(rule.soldierBonusType)
    next.bonusCounts.set(rule.soldierBonusType,
      num(next.bonusCounts.get(rule.soldierBonusType))+1);
  next.bonusIds=new Set(next.bonusCounts.keys());
  if(rule.producedSoldierType){
    next.soldierType=rule.producedSoldierType;
    const body=sourceType(data,next.soldierType);
    if(body?.allowPromotion===false)next.rank=0;
    else if(arr(body?.raw?.rankStrings).length)
      next.rank=Math.min(next.rank,body.raw.rankStrings.length-1);
    next.armorId=rule.keepSoldierArmor?
      next.armorId:(rule.producedSoldierArmor||body?.armor||null);
  }
  if(rule.resetRank)next.rank=0;
  return next;
}
export function buildOriginCapTimeline(data,profile,{
  typeChanges=[],sameBodyInsert=null,previewGrowth=true
}={}){
  if(data?.meta?.mod?.version!=="v.o2"||
    !data.profiles.some(p=>p.id===profile?.id))
    throw new Error("Source-specific cap chronology requires a real v.o2 birth profile");
  if(!Array.isArray(typeChanges)||typeChanges.length>7)
    throw new Error("Invalid type-change sequence");
  const byId=new Map(data.transformations.map(t=>[t.id,t]));
  const at=sameBodyInsert?.beforeBodyChangeIndex;
  const extra=arr(sameBodyInsert?.prerequisiteAndTargetIds);
  if(sameBodyInsert&&
    (!Number.isInteger(at)||at<0||at>typeChanges.length||extra.length>6||
      extra.length===0))
    throw new Error("A training insertion requires one target and a bounded closure");
  let state=initialState(data,profile.id),envelope=createStatEnvelope(data,profile.id);
  if(envelope.kind!=="ready")throw new Error("Birth source stat interval not indexed");
  const steps=[],requiredResearch=new Set(arr(profile.requires));
  let unresolvedVital=false,hasRandom=false,previous=null;
  function push(action){
    const entry=stage(data,state,envelope,steps.length,action,previous,requiredResearch);
    if(!previewGrowth)entry.conditionalNaturalGrowthUpper=null;
    steps.push(entry);previous=entry;
  }
  push({kind:"sourceBirth",sourceId:profile.id,
    sourceType:profile.sourceType,sourceResearch:arr(profile.requires)});
  function apply(rule,kind,atIndex){
    if(!checkStructure(rule,state))
      throw new Error("Chronology-invalid structural insertion: "+profile.id+"/"+rule?.id);
    const priorBody=state.soldierType;
    const nextEnvelope=advanceStatEnvelope(rule,envelope,data,state);
    if(nextEnvelope.kind!=="ready")
      throw new Error("Unsupported OXCE stat interval: "+profile.id+"/"+rule.id);
    for(const id of arr(rule.requires))requiredResearch.add(id);
    if(rule.allowsDeadSoldiers&&!rule.allowsLiveSoldiers&&!rule.allowsWoundedSoldiers)
      unresolvedVital=true;
    hasRandom ||=nextEnvelope.randomSteps.length>envelope.randomSteps.length;
    state=mutateState(state,rule,data);
    envelope=nextEnvelope;
    push({kind,id:rule.id,fromBody:priorBody,toBody:state.soldierType,
      atBodyChangeIndex:atIndex,
      requiredResearch:arr(rule.requires),
      requiredBaseFunctions:arr(rule.requiresBaseFunc),
      requiredItems:clone(rule.requiredItems||{}),
      requiredCommendations:clone(rule.requiredCommendations||{}),
      minRank:num(rule.minRank),historyReset:rule.reset===true,
      percentStatChange:FINAL_STATS.some(k=>num(rule.percentOverallStatChange?.[k])!==
        0||num(rule.percentGainedStatChange?.[k])!==0),
      trainingMaxBoundedAtRawStatCaps:rule.upperBoundAtStatCaps===true,
      trainingBoundedAtCreationMax:rule.upperBoundAtMaxStats===true,
      currentStatsBeforeGrowthNotVerified:true});
  }
  for(let i=0;i<=typeChanges.length;i++){
    if(i===at)
      for(const id of extra){
        const t=byId.get(id);
        if(t?.producedSoldierType)
          throw new Error("Same-body insertion must not include a type change");
        apply(t,"sameBodyTraining",i);
      }
    if(i===typeChanges.length)break;
    const body=typeChanges[i];
    const id=typeof body==="string"?body:body.transformationId;
    const rule=byId.get(id);
    if(!rule?.producedSoldierType)
      throw new Error("Expected a genuine soldier-type change: "+id);
    if(typeof body==="object"&&
      (body.fromType!==state.soldierType||
        body.toType!==rule.producedSoldierType||
        body.historyReset!==(rule.reset===true)))
      throw new Error("Type-change record mismatch: "+id);
    apply(rule,"bodyChange",i);
  }
  return {
    rootProfileId:profile.id,birthType:profile.soldierType,
    terminalType:state.soldierType,stageCount:steps.length,
    typeChangeCount:typeChanges.length,sameBodyTrainingCount:extra.length,
    chosenTargetTraining:sameBodyInsert?.targetId||null,
    sourceResearch:arr(profile.requires),requiredResearch:ordered(requiredResearch),
    containedRandomTransformRolls:hasRandom,requiresVitalStatusProof:unresolvedVital,
    stages:steps,
    terminalCapSnapshot:{
      rawGrowthCaps:steps.at(-1).rawGrowthCaps,
      physicalTrainingCaps:steps.at(-1).physicalTrainingCaps,
      effectiveCapReference:steps.at(-1).effectiveCapReference,
      uniquePermanentBonus:steps.at(-1).uniquePermanentBonus,
      currentRawInterval:steps.at(-1).currentRawInterval,
      effectiveCurrentInterval:steps.at(-1).effectiveCurrentInterval
    },
    status:"STRUCTURAL_STAT_CAP_PROJECTION_ONLY",
    proofComplete:false,trainingOrderVerified:false,
    finalStats:null,finalSum:null,certifiedMaximum:null,
    limitations:[
      "A candidate structural sequence is not an executed campaign chronology",
      "Raw statCaps change ONLY when the body changes; SoldierBonus changes effective cap reference, NOT the raw growth hardcap",
      "Current raw/effective stat intervals may include mutually incompatible RNG rolls or XP histories",
      "Required research completion, item costs, facility, medals, promotions, RNG, health/corpse and training duration are not replayed",
      "Natural growth upper is a relaxed separate what-if, not an actually performed growth stage",
      "A path-level witness does not demonstrate the global maximum among other possible paths"
    ]
  };
}
export function originBirthCapSnapshot(data,profile){
  const timeline=buildOriginCapTimeline(data,profile,
    {previewGrowth:false});
  const s=timeline.stages[0];
  return {rootProfileId:profile.id,body:s.body,
    rawGrowthCaps:s.rawGrowthCaps,
    physicalTrainingCaps:s.physicalTrainingCaps,
    birthPermanentBonus:s.uniquePermanentBonus,
    effectiveCapReference:s.effectiveCapReference,
    rawCurrentInterval:s.currentRawInterval,
    effectiveCurrentInterval:s.effectiveCurrentInterval,
    numericStatus:"BIRTH_INTERVAL_ONLY_NOT_FINAL"};
}
export function compactOriginCapTimeline(timeline){
  if(!timeline||timeline.status!=="STRUCTURAL_STAT_CAP_PROJECTION_ONLY"||
    timeline.finalStats!==null||timeline.finalSum!==null||
    timeline.certifiedMaximum!==null)
    throw new Error("Cannot serialize a fabricated certified final statistic");
  return {
    status:timeline.status,rootProfileId:timeline.rootProfileId,
    stageCount:timeline.stageCount,bodyChangeCount:timeline.typeChangeCount,
    chosenTargetTraining:timeline.chosenTargetTraining,
    stageOrder:timeline.stages.map(s=>({
      kind:s.action.kind,id:s.action.id||s.action.sourceId,
      body:s.body
    })),
    terminalCapSnapshot:timeline.terminalCapSnapshot,
    requiredResearch:timeline.requiredResearch,
    requiresVitalStatusProof:timeline.requiresVitalStatusProof,
    containedRandomTransformRolls:timeline.containedRandomTransformRolls,
    proofComplete:false,trainingOrderVerified:false,
    finalStats:null,finalSum:null,certifiedMaximum:null
  };
}
export function checkPublishedMaximumCertificate(certificate,data){
  // Actual current-stat observations and game-rule consistency are NECESSARY
  // but not SUFFICIENT to certify a GLOBAL OPTIMUM over all acquisition paths.
  // This project deliberately does not have an exhaustive all-transform +
  // research + event + growth + medals optimality solver yet.
  // Refuse a forged or self-attested "completed" path rather than compare a
  // self-reported score to the historic 29-body theoretical candidates.
  if(!certificate||certificate.status!=="EXECUTABLE_MAXIMUM_CERTIFIED"||
    certificate.ruleset!=="v.o2"||
    certificate.sourceHashes?.length!==data.meta?.source?.rules?.length)
    return {kind:"unverified",reason:"원본 버전·획득처·연구·능력치 증명 정보 부족"};
  return {kind:"unverified",reason:"전 획득처의 모든 연구·훈련·훈장·성장·변신 경로를 지배하는 최적성 증명과 실제 OXCE 게임 재현이 없음"};
}
