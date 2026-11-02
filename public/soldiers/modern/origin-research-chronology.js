// X-Piratez v.o2 source-first, research-order NECESSITY audit.
//
// This is an OPTIMISTIC shadow schedule, not an OXCE campaign execution:
// - assume every mandatory research can be granted immediately before the
//   FIRST acquisition/training stage requiring it;
// - execute its source RuleResearch.disables and retain prior transformations;
// - treat event birth scripts as ALTERNATIVES, not simultaneous conditions;
// - NEVER claim access to lab, samples, free RNG, protected getOneFree,
//   event scheduling, base functions, promotions, resources or completed XP.
//
// This intentionally answers a narrower question: can the supplied same-body
// ordered steps avoid a direct research-disable contradiction even under the
// most favorable research-grant assumptions? No contradiction != achievable.
// An irrecoverable direct contradiction can be certified only when the current
// ruleset contains no reenablers; otherwise remain explicitly inconclusive.
import {buildOriginCapTimeline} from "./origin-stat-cap-chronology.js";

const arr=x=>Array.isArray(x)?x:[];
const order=values=>[...new Set(values)].sort();
const eventAlternatives=profile=>profile.sourceType==="event"?
  arr(profile.acquisitionEventScripts):[null];
const researchDataCache=new WeakMap();

function add(index,id,record){
  if(!index.has(id))index.set(id,[]);
  index.get(id).push(record);
}
export function researchAccessIndex(data){
  if(data?.meta?.mod?.version!=="v.o2")
    throw new Error("Research source index requires the current v.o2 ruleset");
  const prev=researchDataCache.get(data);
  if(prev)return prev;
  const rules=data.researchRules||{};
  const unlock=new Map(),free=new Map(),protectedFree=new Map(),lookup=new Map();
  const reenables=[];
  for(const [source,rule] of Object.entries(rules)){
    for(const id of arr(rule.unlocks))add(unlock,id,source);
    for(const id of arr(rule.getOneFree))add(free,id,source);
    for(const [guard,ids] of Object.entries(rule.getOneFreeProtected||{}))
      for(const id of typeof ids==="string"?[ids]:arr(ids))
        add(protectedFree,id,{source,guard});
    if(rule.lookup)add(lookup,rule.lookup,source);
    for(const id of arr(rule.reenables))reenables.push({source,target:id});
  }
  const index={unlock,free,protectedFree,lookup,reenables,
    count:Object.keys(rules).length};
  researchDataCache.set(data,index);
  return index;
}
function gateInfo(data,index,id){
  const rule=data.researchRules?.[id];
  if(!rule)return {id,ruleIndexed:false,grantProven:false};
  const cost=rule.cost??null;
  const eventSources=arr(data.eventResearchSources?.[id]);
  const eventSourceIds=order(eventSources.map(x=>x.event||x.id).filter(Boolean));
  const freeSources=order(index.free.get(id)||[]);
  const unlockSources=order(index.unlock.get(id)||[]);
  const lookupSources=order(index.lookup.get(id)||[]);
  const protectedFreeSources=arr(index.protectedFree.get(id)).map(x=>
    ({source:x.source,guard:x.guard})).sort((a,b)=>
      a.source.localeCompare(b.source)||a.guard.localeCompare(b.guard));
  const zeroCost=Number(cost)===0;
  const needItem=rule.needItem===true;
  return {
    id,ruleIndexed:true,cost,zeroCost,needItem,
    neededItem:needItem?(rule.neededItem||id):null,
    requires:arr(rule.requires),
    dependencies:arr(rule.dependencies),
    baseFunctions:arr(rule.requiresBaseFunc),
    unlockSources,freeSources,protectedFreeSources,lookupSources,
    eventSourceCount:eventSources.length,eventSourceIds,
    labDirectAvailableWithoutProof:!zeroCost&&!arr(rule.requires).length,
    nonLabGrantMayBeNecessary:zeroCost||arr(rule.requires).length>0,
    grantProven:false,sourceChronologyProven:false,
    randomGetOneFreeAssumed:false
  };
}
function milestoneSource(profile,stage,script){
  if(stage.action.kind==="sourceBirth"){
    const direct=arr(stage.action.sourceResearch);
    const positive=arr(script?.researchPositive);
    const negative=arr(script?.researchNegative);
    return {required:order([...direct,...positive]),
      prohibited:order(negative),
      requiredFromOriginal:order(direct),
      requiredFromEvent:order(positive)};
  }
  return {required:order(stage.action.requiredResearch),
    prohibited:[],requiredFromOriginal:order(stage.action.requiredResearch),
    requiredFromEvent:[]};
}
function directDisableBranch(data,profile,timeline,script,index){
  const active=new Set(),disabled=new Map(),firstGrant=new Map();
  const record=[],contradictions=[],distinctNeeded=new Set();
  const missingResearch=new Set(),zeroCostNeeded=new Set(),baseGates=new Set();
  const requiredItems=new Set(),eventResearch=new Set();
  for(const step of timeline.stages){
    const {required,prohibited,requiredFromOriginal,requiredFromEvent}=
      milestoneSource(profile,step,script);
    const activations=[],disabledAtStep=[],blocked=[];
    for(const id of required)distinctNeeded.add(id);
    // A negative event trigger requires the flag to be ABSENT at the precise
    // script execution. We never merge negatives from another event script.
    for(const id of prohibited)if(required.includes(id)){
      const issue={kind:"EVENT_POSITIVE_AND_NEGATIVE_SAME_RESEARCH",
        stageIndex:step.index,required:id,disabledBy:null,
        disablingStageIndex:null,
        reason:"동일한 이벤트 스크립트가 "+id+"의 보유와 부재를 동시에 요구"};
      blocked.push(issue);contradictions.push(issue);
    }
    for(const id of required){
      const rule=data.researchRules?.[id];
      if(!rule){missingResearch.add(id);continue;}
      if(Number(rule.cost)===0||arr(rule.requires).length)zeroCostNeeded.add(id);
      for(const fn of arr(rule.requiresBaseFunc))baseGates.add(fn);
      if(rule.needItem===true)requiredItems.add(rule.neededItem||id);
      if(disabled.has(id)){
        const by=disabled.get(id);
        const issue={kind:"ALREADY_DISABLED_BY_REQUIRED_RESEARCH",
          stageIndex:step.index,required:id,disabledBy:by.by,
          disablingStageIndex:by.stageIndex,
          reason:"이 단계의 필수 연구 "+id+"가 앞선 필수 연구 "+
            by.by+"의 disables로 영구 폐쇄됨"};
        blocked.push(issue);contradictions.push(issue);
        continue;
      }
      if(active.has(id))continue;
      // ACTIVATION = optimistic placeholder only; cost-0 topics, free RNG,
      // inaccessible events and dependency-locked topics are deliberately
      // treated as grantable here to find NECESSARY direct contradictions.
      firstGrant.set(id,step.index);
      active.add(id);
      activations.push(id);
      for(const drop of arr(rule.disables)){
        active.delete(drop);
        if(!disabled.has(drop))
          disabled.set(drop,{by:id,stageIndex:step.index});
        disabledAtStep.push({disabled:drop,by:id});
      }
    }
    for(const id of required)if(!active.has(id)&&
      !blocked.some(p=>p.required===id)&&data.researchRules?.[id]){
      const by=disabled.get(id)||null;
      const issue={kind:"SAME_STAGE_RESEARCH_DISABLE",
        stageIndex:step.index,required:id,disabledBy:by?.by||null,
        disablingStageIndex:by?.stageIndex??step.index,
        reason:"같은 획득·훈련 단계에서 필요한 "+id+
          "가 다른 필수 연구의 disables로 동시에 유지될 수 없음"};
      blocked.push(issue);contradictions.push(issue);
    }
    for(const id of requiredFromEvent)eventResearch.add(id);
    record.push({
      stageIndex:step.index,body:step.body,
      actionKind:step.action.kind,actionId:step.action.id||step.action.sourceId,
      requiredResearch:required,
      originalRequiredResearch:requiredFromOriginal,
      eventScriptRequiredResearch:requiredFromEvent,
      eventScriptForbiddenResearch:prohibited,
      optimisticallyActivated:activations,
      freshlyDisabled:disabledAtStep,
      stillActiveRequired:required.filter(id=>active.has(id)),
      blocked,
      allGrantAndResourceGatesProven:false,
      actuallyResearchedAtThisStage:false
    });
  }
  // Rulesets with a re-enable source cannot safely use a disabler-only
  // shadow run to certify permanent impossibility.
  const reenablers=index.reenables.length;
  const noRule=missingResearch.size>0;
  const status=contradictions.length?(reenablers?
    "INCONCLUSIVE_REENABLES_NOT_REPLAYED":
    "DIRECT_DISABLING_CONTRADICTION"):
    noRule?"INCONCLUSIVE_RESEARCH_RULE_NOT_INDEXED":
    "NO_DIRECT_DISABLE_CONTRADICTION_DETECTED";
  const sortedRequired=order(distinctNeeded);
  return {
    eventScriptId:script?.script||null,eventMode:script?.mode||null,
    firstEligibleMonth:script?.firstMonth??null,
    lastEligibleMonth:script?.lastMonth??null,
    eventExecutionOdds:script?.executionOdds??null,
    eventResearchPositive:order(arr(script?.researchPositive)),
    eventResearchNegative:order(arr(script?.researchNegative)),
    eventOtherConditionsPresent:!!script&&(
      Object.keys(script.otherConditions||{}).length>0||
      arr(script.itemPositive).length>0||arr(script.itemNegative).length>0||
      arr(script.facilityPositive).length>0||
      arr(script.soldierTypePositive).length>0||
      arr(script.countryPositive).length>0||
      arr(script.regionPositive).length>0),
    status,
    requiredResearch:sortedRequired,
    missingResearchRules:order(missingResearch),
    optimisticActivationOrder:[...firstGrant].map(([id,stageIndex])=>
      ({id,stageIndex})),
    directDisableContradictions:contradictions,
    totalDirectDisableContradictions:contradictions.length,
    zeroCostOrNonLabResearch:order(zeroCostNeeded),
    researchRequiredItems:order(requiredItems),
    researchRequiredBaseFunctions:order(baseGates),
    eventResearchGates:order(eventResearch),
    stepCount:record.length,stages:record,
    researchAcquisitionProven:false,conditionalOnly:true,
    finalStats:null,finalSum:null,certifiedMaximum:null,
    reason:status==="DIRECT_DISABLING_CONTRADICTION"?
      "고정된 변신·훈련 순서에서 서로 동시에 유지해야 하는 원본 연구 플래그가 직접 disables와 충돌":
      "직접 disables 충돌이 없다는 것은 연구실·연구 선행·무료 추첨·이벤트·시설·재료 등 실제 확보의 증명이 아님"
  };
}
export function auditOriginResearchChronology(data,profile,{
  typeChanges=[],sameBodyInsert=null,timeline=null
}={}){
  if(data?.meta?.mod?.version!=="v.o2"||
    !data.profiles?.some(p=>p.id===profile?.id))
    throw new Error("Origin research chronology requires a real v.o2 source profile");
  const stages=timeline||buildOriginCapTimeline(data,profile,{
    typeChanges,sameBodyInsert,previewGrowth:false});
  if(stages.rootProfileId!==profile.id||
    stages.status!=="STRUCTURAL_STAT_CAP_PROJECTION_ONLY"||
    stages.finalStats!==null||stages.certifiedMaximum!==null)
    throw new Error("The supplied stage sequence is not a source-specific structural witness");
  const index=researchAccessIndex(data);
  const scripts=eventAlternatives(profile);
  if(!scripts.length)
    throw new Error("Event-born soldier lacks source script alternatives: "+profile.id);
  const variants=scripts.map(script=>directDisableBranch(data,profile,stages,script,index));
  const allConflict=variants.every(v=>v.status==="DIRECT_DISABLING_CONTRADICTION");
  const someClear=variants.some(v=>v.status==="NO_DIRECT_DISABLE_CONTRADICTION_DETECTED");
  const branchStatus=allConflict?
    "ALL_EVENT_ALTERNATIVES_DIRECTLY_CONTRADICTED":
    someClear?"NO_DIRECT_DISABLE_CONTRADICTION_DETECTED":
    "RESEARCH_ORDER_INCONCLUSIVE";
  const required=order(variants.flatMap(v=>v.requiredResearch));
  const gate=new Map(required.map(id=>[id,gateInfo(data,index,id)]));
  return {
    rootProfileId:profile.id,finalBody:stages.terminalType,
    stageCount:stages.stageCount,
    sameBodyInsertTarget:stages.chosenTargetTraining,
    researchSourceRuleCount:index.count,
    sourceEventScriptAlternativeCount:scripts.length,
    eventAlternativesIndependent:true,
    status:branchStatus,
    allAlternativesContradicted:allConflict,
    anyAlternativeWithoutDirectConflict:someClear,
    variants,
    requiredResearchAcrossAlternatives:required,
    researchAccessGates:[...gate.values()],
    unresolvedResearchGrants:required.length,
    actualResearchCompletionsReplayed:0,
    actualTrainingCompletionsReplayed:0,
    researchOrderExecuted:false,
    actualSaveVerified:false,globalMaximumProven:false,
    finalStats:null,finalSum:null,certifiedMaximum:null,
    scope:"DIRECT_DISABLE_NECESSITY_WITH_OPTIMISTIC_JIT_GRANTS_ONLY",
    assumptions:[
      "Mandatory flags are granted just in time, even when no actual research source is obtainable",
      "The 2.1 source RuleResearch.disables is replayed in this optimistic schedule, but not dependencies, unlocks, getOneFree or source-based auto zero cost queues",
      "Birth event script positive/negative research requirements are evaluated separately for every alternative event",
      "No random outcome, lab availability, item sample, base function, resource or training opportunity has been executed",
      "A path without a direct disable conflict is still NOT a confirmed executable path or a confirmed maximum"
    ]
  };
}
export function compactOriginResearchAudit(audit){
  if(!audit||audit.finalStats!==null||audit.certifiedMaximum!==null||
    audit.researchOrderExecuted!==false||
    audit.scope!=="DIRECT_DISABLE_NECESSITY_WITH_OPTIMISTIC_JIT_GRANTS_ONLY")
    throw new Error("Cannot serialize a certified maximum from a relaxed research audit");
  return {
    rootProfileId:audit.rootProfileId,finalBody:audit.finalBody,
    stageCount:audit.stageCount,sameBodyInsertTarget:audit.sameBodyInsertTarget,
    sourceEventScriptAlternativeCount:audit.sourceEventScriptAlternativeCount,
    status:audit.status,
    allAlternativesContradicted:audit.allAlternativesContradicted,
    anyAlternativeWithoutDirectConflict:audit.anyAlternativeWithoutDirectConflict,
    variants:audit.variants.map(v=>({
      eventScriptId:v.eventScriptId,status:v.status,
      eventResearchPositive:v.eventResearchPositive,
      eventResearchNegative:v.eventResearchNegative,
      requiredResearch:v.requiredResearch,
      directDisableContradictions:v.directDisableContradictions,
      zeroCostOrNonLabResearch:v.zeroCostOrNonLabResearch,
      researchRequiredItems:v.researchRequiredItems,
      researchRequiredBaseFunctions:v.researchRequiredBaseFunctions,
      stepOrder:v.stages.map(s=>({
        id:s.actionId,kind:s.actionKind,required:s.requiredResearch
      }))
    })),
    actualResearchCompletionsReplayed:0,researchOrderExecuted:false,
    finalStats:null,finalSum:null,certifiedMaximum:null
  };
}
