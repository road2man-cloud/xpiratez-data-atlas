// Build an acquisition-specific, non-certifying progression registry on the
// EXISTING 2.1 soldier atlas. The old 29-body maxima remain legacy candidates.
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {initialState,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {createStatEnvelope} from "../public/soldiers/modern/stat-envelope.js";
import {growStatEnvelope} from "../public/soldiers/modern/growth-envelope.js";
import {enumerateSourceBodyChangeLineages} from "./soldier-origin-lineage-census.mjs";
import {auditSingleSameBodyTraining,birthOnlyTrainingAudit}
  from "../public/soldiers/modern/origin-same-body-bridge.js";
import {buildOriginCapTimeline,originBirthCapSnapshot,compactOriginCapTimeline}
  from "../public/soldiers/modern/origin-stat-cap-chronology.js";
import {directResearchTransformLocks,permanentResearchTransformLocks}
  from "../public/soldiers/modern/research-training-locks.js";

export const STATS=["tu","stamina","health","bravery","reactions","firing","throwing",
  "strength","psiStrength","psiSkill","melee"];
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const pick=x=>Object.fromEntries(STATS.map(k=>[k,num(x?.[k])]));
const sum=x=>STATS.reduce((s,k)=>s+num(x?.[k]),0);
const entries=x=>Object.entries(x||{}).filter(([,v])=>num(v)>0)
  .map(([id,count])=>({id,count:num(count)}));
const proof=()=>({status:"미검증",ruleSourceIndexed:true,
  chronologicalReplay:false,saveVerified:false,finalStatsVerified:false,
  conditionalEventOrRng:false,blockerEvidence:[]});
// These v.o2 event schedules are extracted from the SAME rule merge as the
// acquired soldier's birth state. Never join the historical 1.1.1 website
// manufacture/event catalogs to a 2.1 soldier merely by matching an ID.
const EVENT_TRIGGER_FIELDS={
  researchTriggers:["researchPositive","researchNegative"],
  itemTriggers:["itemPositive","itemNegative"],
  facilityTriggers:["facilityPositive","facilityNegative"],
  soldierTypeTriggers:["soldierTypePositive","soldierTypeNegative"],
  xcomBaseInRegionTriggers:["regionPositive","regionNegative"],
  xcomBaseInCountryTriggers:["countryPositive","countryNegative"],
  pactCountryTriggers:["pactPositive","pactNegative"]
};
function eventSourceGates(profile){
  if(profile.sourceType!=="event")return null;
  if(!Array.isArray(profile.acquisitionEventScripts))
    throw new Error("v.o2 이벤트 생성 원본 가드가 색인되지 않음: "+profile.id);
  const routes=profile.acquisitionEventScripts.map(r=>{
    const positiveTriggers=[],negativeTriggers=[];
    for(const [kind,[positive,negative]] of Object.entries(EVENT_TRIGGER_FIELDS)){
      for(const id of r[positive]||[])positiveTriggers.push({kind,id});
      for(const id of r[negative]||[])negativeTriggers.push({kind,id});
    }
    return {
      script:r.script,mode:r.mode,firstMonth:r.firstMonth??null,
      lastMonth:r.lastMonth??null,executionOdds:r.executionOdds??null,
      positiveTriggers,negativeTriggers,
      oneTime:r.mode==="oneTimeRandom"||r.mode==="oneTimeSequential",
      oneTimeEarlier:r.oneTimeEarlier||[],
      oneTimeWeight:r.oneTimeWeight??null,oneTimeTotal:r.oneTimeTotal??null,
      monthWeights:r.monthWeights||[],
      otherConditions:r.otherConditions||{}
    };
  });
  // A merged summary contains ONLY conditions common to *all* alternative
  // scripts, never a conjunction of opposing branch prerequisites.
  const shared=key=>routes.length?
    routes[0][key].filter(t=>routes.every(r=>r[key].some(x=>
      x.kind===t.kind&&x.id===t.id))):[];
  return {
    ruleset:"v.o2",alternatives:routes,alternativeCount:routes.length,
    firstMonth:routes.length?Math.min(...routes.map(r=>Number(r.firstMonth??0))):null,
    lastMonth:routes.length&&routes.every(r=>r.lastMonth!=null)?
      Math.max(...routes.map(r=>Number(r.lastMonth))):null,
    minExecutionOdds:routes.length?Math.min(...routes.map(r=>Number(r.executionOdds??100))):null,
    maxExecutionOdds:routes.length?Math.max(...routes.map(r=>Number(r.executionOdds??100))):null,
    positiveTriggers:shared("positiveTriggers"),
    negativeTriggers:shared("negativeTriggers"),
    selectionRefs:routes.map(r=>({script:r.script,mode:r.mode})),
    oneTime:routes.length?routes.every(r=>r.oneTime):null,
    boundedMonthWindow:routes.length&&routes.every(r=>r.lastMonth!=null),
    note:"공통 트리거 요약이며 세부 조건은 서로 독립적인 대체 이벤트 스크립트별로 검증해야 함"
  };
}
const inventorySources=(data,items)=>Object.fromEntries(
  Object.keys(items||{}).map(id=>{
    const source=data.itemSupply?.[id];
    return [id,source?{
      buyCost:source.buyCost??null,
      buyRequires:source.buyRequires||[],
      manufacture:(source.manufacture||[]).map(x=>x.id||x.recipe||x),
      eventGrants:(source.eventGrants||[]).map(x=>({
        event:x.event,grants:x.grants||[],scriptIds:x.scriptIds||[]
      })),
      mapSourceCount:source.mapLoot?.sourceCount||0,
      mapSourcesPossiblyTruncated:source.mapLoot?.possiblyTruncated===true
    }:null];
  }));
function inheritedCandidateGateAudit(data,profile,legacyCandidate){
  // The starting soldier's completed transformations are not unearned future
  // opportunities. Skipping a pre-owned training also avoids duplicate bonus
  // awards. Direct forbidden-history is directional and is checked ONLY for
  // chosen transformations that are not already owned at birth.
  const prior=new Map(entries(profile.previousTransformations).map(x=>[x.id,x.count]));
  const all=new Map(data.transformations.map(t=>[t.id,t]));
  const alreadyCompleted=[],directHistoryConflicts=[],researchHistoryConflicts=[];
  for(const target of legacyCandidate.transformations){
    if(prior.has(target)){alreadyCompleted.push(target);continue}
    const rule=all.get(target);
    if(!rule)throw new Error("기존 최대 후보의 변신 규칙 없음: "+target);
    const banned=(rule.forbiddenPreviousTransformations||[])
      .filter(id=>prior.has(id));
    if(banned.length){
      directHistoryConflicts.push({target,priorHistory:banned,
        source:"forbiddenPreviousTransformations"});
    }
    const mutual=[...directResearchTransformLocks(prior,target,data),
      ...permanentResearchTransformLocks(prior,target,data.researchRules||{})];
    if(mutual.length){
      researchHistoryConflicts.push({target,details:[...new Set(mutual)],
        source:"reciprocal-research-disables"});
    }
  }
  return {scope:"UNCHANGED_BIRTH_HISTORY_ONLY",
    alreadyCompleted,directHistoryConflicts,researchHistoryConflicts,
    possibleHistoryResetOrRemovalNotEvaluated:true,
    meaning:"현재 출생 이력을 그대로 둔 경우의 후보 훈련 선행 충돌. 중간 이력 제거·체형 초기화·우회 생성 가능성이 검증되기 전에는 전체 육성 경로의 불가능 판정이 아님."};
}
function naturalPotential(data,profile) {
  const state=initialState(data,profile);
  const born=createStatEnvelope(data,profile.id);
  if(born.kind!=="ready")return {status:"미검증",reason:born.reason||"출생 범위 누락"};
  // Growing base (unbonused) stats is NOT the same as growing effective stats.
  // The already-awarded SoldierBonus is applied exactly once to both cases.
  const physical=growStatEnvelope(born,state,data,"@PHYS_TRAINING");
  const battle=growStatEnvelope(physical,state,data,"@BATTLE_GROWTH");
  if(physical.kind!=="ready"||battle.kind!=="ready")
    return {status:"미검증",reason:battle.reason||physical.reason};
  const bornBonus=pick(bonusStats(state,data));
  const birthMin=pick(profile.effectiveStats.min);
  const birthAvg=pick(profile.effectiveStats.avg);
  const birthMax=pick(profile.effectiveStats.max);
  const fromEngine=x=>Object.fromEntries(STATS.map(k=>[k,
    Math.max(k==="health"?1:0,num(x?.[k])+num(bornBonus[k]))]));
  return {status:"조건부 성장 상계",birth:{min:birthMin,avg:birthAvg,max:birthMax},
    baseBirth:{min:pick(born.low),max:pick(born.high)},
    bornPermanentBonus:bornBonus,
    physicalUpper:fromEngine(physical.high),
    combatAfterPhysicalUpper:fromEngine(battle.high),
    optimisticNaturalSum:sum(fromEngine(battle.high)),
    growthPotentialKeys:STATS.filter(k=>num(battle.high[k])>num(born.high[k])),
    assumption:"획득 후 무제한 전투 XP 및 체육관 반복 기회 가정; 능력치별 상계가 한 병사에서 동시 달성된다는 증거는 없음"};
}
export function buildSoldierOriginProgression(data,oldMaxima){
  if(data.soldiers?.length!==29||oldMaxima.rows?.length!==29||
    data.profiles?.length!==72||data.transformations?.length!==83)
    throw new Error("소스 범위 변경: 원본 29병종 / 72프로필 / 83변신 재감사 필요");
  const soldiers=new Map(data.soldiers.map(s=>[s.id,s]));
  const maxima=new Map(oldMaxima.rows.map(r=>[r.id,r]));
  if(data.meta?.mod?.version!=="v.o2")
    throw new Error("획득처별 감사의 원본은 X-Piratez v.o2이어야 합니다");
  const ancestry=enumerateSourceBodyChangeLineages(data);
  const lineageByEdge=new Map(ancestry.branches.map(x=>[x.id,x]));
  const profileById=new Map(data.profiles.map(x=>[x.id,x]));
  if(ancestry.summary.incomingEdges!==40)
    throw new Error("병종변경 입력 간선 개수와 출생계보 결과 불일치");
  const trainingTotals={initialProfilesAudited:0,sourceRootedPathsAudited:0,
    structuralInsertionWitnesses:0,distinctTargetWitnesses:0,
    targetsWithPositiveSurvivingBonus:0,chronologicallyVerifiedTrainingRoutes:0};
  function recordTrainingAudit(a,kind){
    if(a.status!=="HISTORY_AND_TYPE_ONLY_NOT_EXECUTED"||
      a.finalStats!==null||a.finalSum!==null)
      throw new Error("미증명 일반 훈련이 최종 능력치 확정으로 승격됨");
    if(kind==="birth")trainingTotals.initialProfilesAudited++;
    else trainingTotals.sourceRootedPathsAudited++;
    trainingTotals.structuralInsertionWitnesses+=a.insertionSequenceWitnesses;
    trainingTotals.distinctTargetWitnesses+=a.distinctTrainingsWithHistoryWitness;
    trainingTotals.targetsWithPositiveSurvivingBonus+=
      a.targetsWithPositiveSurvivingBonus;
  }
  const capAudit={birthProfiles:0,rootedConversionCandidates:0,
    oneTrainingScenarioCandidates:0,provisionalStageSnapshots:0,
    exactObservedFinalStats:0,chronologicallyExecutedStatPlans:0,
    globalMaximaCertified:0};
  // Serialize compact stage summaries only; on-demand the view reconstructs
  // all intermediate current stats/cap changes from the same rule source.
  const capProjection=compactOriginCapTimeline;
  const direct=[],transformed=[];
  for(const profile of data.profiles){
    const s=soldiers.get(profile.soldierType);
    if(!s||!maxima.has(s.id))throw new Error("알 수 없는 획득 병종: "+profile.id);
    const n=naturalPotential(data,profile);
    if(n.status!=="조건부 성장 상계")throw new Error(profile.id+" "+n.reason);
    if(profile.sourceType==="manufacture"&&
      !Object.hasOwn(profile,"acquisitionRequiredItems"))
      throw new Error("v.o2 제조 재료 원본 누락: "+profile.id);
    const materialGates=profile.acquisitionRequiredItems||{};
    const trigger=eventSourceGates(profile);
    const initialTraining=birthOnlyTrainingAudit(data,profile);
    recordTrainingAudit(initialTraining,"birth");
    const birthCap=originBirthCapSnapshot(data,profile);
    capAudit.birthProfiles++;
    capAudit.provisionalStageSnapshots++;
    direct.push({
      id:profile.id,soldierType:s.id,soldierName:s.koName,
      acquisitionType:profile.sourceType,sourceId:profile.sourceId,
      sourceName:profile.sourceKoName||profile.id,kind:"SOURCE_SPAWN",
      sourceFiles:profile.sourceFiles||[],
      prerequisites:{research:profile.requires||[],facilities:profile.requiresBaseFunc||[],
        items:materialGates,itemSources:inventorySources(data,materialGates),
        event:trigger,
        monthlyLimit:profile.monthlyBuyLimit??null,
        cost:profile.cost??null,time:profile.time??null,spawnedPersons:profile.spawnedPersons??1},
      birth:n.birth,unbonusedBirth:n.baseBirth,
      rank:profile.rank??0,armor:profile.armor||s.armor||null,
      initialHistory:entries(profile.previousTransformations),
      initialBonuses:entries(profile.traitCounts),
      bornPermanentBonus:n.bornPermanentBonus,
      birthSameBodyTrainingAudit:initialTraining,
      birthStatCapSnapshot:birthCap,
      legacyCandidateBirthHistoryAudit:inheritedCandidateGateAudit(
        data,profile,maxima.get(s.id)),
      rawStatCaps:pick(s.statCaps),
      rawTrainingStatCaps:pick(s.trainingStatCaps),
      naturalGrowthUpper:{physical:n.physicalUpper,
        physicalThenBattle:n.combatAfterPhysicalUpper},
      naturalGrowthAssumption:n.assumption,
      naturalGrowthCanIncrease:n.growthPotentialKeys,
      provisionalBodyBonusCandidate: {score:maxima.get(s.id).score,
        attributableToThisPerson:false},
      medalBonus:null,additionalTransformationBonus:null,
      transformationBaseChanges:null,finalStats:null,finalSum:null,
      proof:proof()
    });
  }
  for(const t of data.transformations.filter(t=>t.producedSoldierType)){
    const output=soldiers.get(t.producedSoldierType);
    if(!output||!maxima.has(output.id))throw new Error("알 수 없는 변신 목표: "+t.id);
    for(const sourceType of t.allowedSoldierTypes||[]){
      if(!soldiers.has(sourceType))throw new Error("알 수 없는 변신 출발 병종: "+t.id+"/"+sourceType);
      const parentProfiles=data.profiles.filter(p=>p.soldierType===sourceType).map(p=>p.id);
      const edgeId="transform:"+t.id+":from:"+sourceType;
      const indexedLineage=lineageByEdge.get(edgeId);
      if(!indexedLineage)throw new Error("출생 근원 계보 간선 누락: "+edgeId);
      const lineage={...indexedLineage,
        candidates:indexedLineage.candidates.map(candidate=>{
          const origin=profileById.get(candidate.rootProfileId);
          if(!origin)throw new Error("연결된 출생처 원본 누락: "+candidate.rootProfileId);
          const trainingAudit=auditSingleSameBodyTraining(data,origin,candidate);
          recordTrainingAudit(trainingAudit,"chain");
          const bodyTimeline=buildOriginCapTimeline(data,origin,
            {typeChanges:candidate.steps,previewGrowth:false});
          const oneTraining=trainingAudit.strongestOneTargetStructuralCandidate;
          const optionalTimeline=oneTraining?buildOriginCapTimeline(data,origin,
            {typeChanges:candidate.steps,sameBodyInsert:oneTraining,
              previewGrowth:false}):null;
          capAudit.rootedConversionCandidates++;
          capAudit.provisionalStageSnapshots+=bodyTimeline.stageCount;
          if(optionalTimeline){
            capAudit.oneTrainingScenarioCandidates++;
            capAudit.provisionalStageSnapshots+=optionalTimeline.stageCount;
          }
          return {...candidate,optionalSameBodyTrainingAudit:trainingAudit,
            conditionalBodyStatCapTimeline:capProjection(bodyTimeline),
            conditionalOneTrainingStatCapTimeline:optionalTimeline?
              capProjection(optionalTimeline):null};
        })
      };
      transformed.push({
        id:"transform:"+t.id+":from:"+sourceType,soldierType:output.id,
        soldierName:output.koName,acquisitionType:"typeChange",
        sourceFiles:t.sourceFiles||[],
        sourceId:t.id,sourceName:t.koName||t.id,
        kind:"TYPE_CHANGE_WITH_UNRESOLVED_PARENT",parentSoldierType:sourceType,
        parentAcquisitionProfiles:parentProfiles,
        // Source-rooted chain doesn't certify parent identity, resources,
        // stats, badges, status, calendar or exact sequential execution.
        candidateSourceAncestry:lineage,
        prerequisites:{research:t.requires||[],facilities:t.requiresBaseFunc||[],
          items:t.requiredItems||{},itemSources:inventorySources(data,t.requiredItems),
          requiredCommendations:t.requiredCommendations||{},
          cost:t.cost??null,time:t.transferTime??null,minRank:t.minRank||0,
          minStats:pick(t.requiredMinStats),maxStats:t.requiredMaxStats||null,
          priorHistory:t.requiredPreviousTransformations||[],
          forbiddenHistory:t.forbiddenPreviousTransformations||[],
          reset:t.reset===true,createsClone:t.createsClone===true},
        birth:null,unbonusedBirth:null,rank:null,armor:t.producedSoldierArmor||null,
        initialHistory:null,initialBonuses:null,bornPermanentBonus:null,
        legacyCandidateBirthHistoryAudit:null,
        rawStatCaps:pick(output.statCaps),
        rawTrainingStatCaps:pick(output.trainingStatCaps),
        naturalGrowthUpper:null,naturalGrowthAssumption:null,
        naturalGrowthCanIncrease:null,
        provisionalBodyBonusCandidate:{score:maxima.get(output.id).score,
          attributableToThisPerson:false},
        medalBonus:null,additionalTransformationBonus:null,
        transformationBaseChanges:null,finalStats:null,finalSum:null,
        proof:{...proof(),unresolvedParent:true,resetPreviousHistory:t.reset===true}
      });
    }
  }
  const rows=[...direct,...transformed];
  const historyDiagnostics={
    birthProfilesWithAlreadyCompletedCandidate:direct.filter(r=>
      r.legacyCandidateBirthHistoryAudit.alreadyCompleted.length>0).length,
    candidateTransformationsAlreadyCompleted:direct.reduce((s,r)=>
      s+r.legacyCandidateBirthHistoryAudit.alreadyCompleted.length,0),
    birthProfilesWithDirectForbiddenCandidate:direct.filter(r=>
      r.legacyCandidateBirthHistoryAudit.directHistoryConflicts.length>0).length,
    directlyForbiddenCandidateTrainings:direct.reduce((s,r)=>
      s+r.legacyCandidateBirthHistoryAudit.directHistoryConflicts.length,0),
    birthProfilesWithResearchHistoryConflict:direct.filter(r=>
      r.legacyCandidateBirthHistoryAudit.researchHistoryConflicts.length>0).length
  };
  if(new Set(rows.map(r=>r.id)).size!==rows.length)
    throw new Error("획득처 ID 충돌");
  const byType=Object.groupBy(rows,r=>r.soldierType);
  const classSummary=oldMaxima.rows.map(old=>{
    const origins=byType[old.id]||[];
    if(!origins.length)throw new Error("획득 경로가 색인되지 않은 병종: "+old.id);
    return {soldierType:old.id,soldierName:soldiers.get(old.id).koName,
      acquisitionProfiles:origins.length,sourceSpawnProfiles:origins.filter(r=>r.kind==="SOURCE_SPAWN").length,
      incomingTransformBranches:origins.filter(r=>r.kind!=="SOURCE_SPAWN").length,
      verifiedOrigins:0,verifiedMaximum:null,
      legacyCandidateBonus:old.score};
  });
  const hound=direct.find(x=>x.id==="event:STR_CODEX_BONUS_G5");
  if(!hound?.initialHistory.some(x=>x.id==="STR_HERO_RED_TRAINING")||
    !hound.initialBonuses.some(x=>x.id==="STR_BLESSING_OF_WAR"))
    throw new Error("블러드하운드 출생 보너스 예외가 누락됨");
  const half=direct.find(x=>x.id==="manufacture:STR_HALF_UBER_GIRL_RECRUITMENT");
  const peasant=direct.find(x=>x.id==="direct:STR_SOLDIER_PEASANT");
  if(!half||!peasant||JSON.stringify(half.birth)===JSON.stringify(peasant.birth))
    throw new Error("반 슈퍼변이체 제조형과 일반 농부의 초기 상태가 혼합됨");
  const assault=direct.find(x=>x.id==="manufacture:STR_THEBAN_ASSAULT_CLONE");
  if(!assault||assault.soldierType!==peasant.soldierType||
    assault.rank!==1||peasant.rank!==0||
    assault.birth.max.firing!==80||peasant.birth.max.firing!==36||
    !assault.initialHistory.some(x=>x.id==="STR_THEBAN_ASSAULT_CLONE")||
    peasant.initialHistory.some(x=>x.id==="STR_THEBAN_ASSAULT_CLONE"))
    throw new Error("돌격 클론 / 일반 농부 획득처별 출생 이력과 초기 성능이 합쳐짐");
  return {schemaVersion:1,kind:"SOLDIER_ACQUISITION_PROGRESSION",
    ruleset:"X-Piratez 2.1 / OXCE 8.7.1",
    source:["public/data/soldiers-modern-index.json",
      "public/data/soldier-research-maxima-20261101.json",
      "Piratez 2.1 / Ruleset/manufacture",
      "Piratez 2.1 / Ruleset/events",
      "Piratez 2.1 / Ruleset/eventScripts"],
    sourceHashes:data.meta?.source?.rules||[],
    sourceVersion:"v.o2",
    stats:STATS,summary:{
      classes:29,originalSpawnProfiles:direct.length,incomingTypeChangeRules:
        data.transformations.filter(t=>t.producedSoldierType).length,
      incomingTypeChangeBranches:transformed.length,
      indexedAcquisitionBranches:rows.length,
      manufacturingProfilesWithMaterials:direct.filter(r=>r.acquisitionType==="manufacture"&&
        Object.keys(r.prerequisites.items).length>0).length,
      eventOriginsWithTriggerEvidence:direct.filter(r=>r.acquisitionType==="event"&&
        r.prerequisites.event).length,
      sourceRootedAncestry:ancestry.summary,
      sameBodyTrainingInsertions:trainingTotals,
      chronologicalStatCapAudit:capAudit,
      chronologicalPathsVerified:0,
      finalStatRoutesVerified:0,saveVerified:0,...historyDiagnostics},
    statusDefinitions:{
      "실행 경로 검증":"획득부터 최종 시술까지 시간순 규칙 재생이 실제로 통과한 경로",
      "조건부 실행 경로":"시간순 재생은 통과했지만 발생 가능한 이벤트·RNG 보상을 가정한 경로",
      "불가능 판정":"원본 규칙의 구체적 충돌이 반증으로 확인된 경로",
      "미검증":"재생 증명이나 불가능 증명이 아직 없는 경로"
    },
    limitations:[
      "72개 출생 프로필과 7개 병종변경 규칙의 입력 병종 40개 조합을 색인; 출생처 기점 다단계 병종 변경 간선 그래프는 탐색하였으나 중간 동일병종 훈련과 연구/확률/훈장/신체상태를 재생하지 않아 완전한 경로 증명은 아님.",
      "제조 requiredItems와 이벤트 script 가드는 2.1 병종 원본과 동일한 룰 병합에서 추출했으며, 1.1.1 제조/이벤트 웹 DB를 교차 적용하지 않음.",
      "여러 이벤트 script가 한 출생 유형을 지급할 경우 각각을 독립적인 대체 경로로 보존하고 공통 가드만 요약함.",
      "출생 후/병종 변경 전후 하나의 선택된 동일병종 훈련과 그 필수 선행 훈련만 삽입해 이력·병종 정합성을 재검사; 서로 다른 선택 훈련 여러 개를 최적 결합한 검증은 아님.",
      "동일병종 훈련의 중복 없는 SoldierBonus 중 최종 단계에 남는 값만 조건부 참고로 산정하며, 변신의 원시 능력치·기초 능력치 변동과 확률을 최종 수치로 계산하지 않음.",
      "모든 출생 72건과 병종 변환 구조 후보 401건의 시간순 원시 능력치 범위, 병종 statCaps, physical trainingStatCaps, 중복 제거 SoldierBonus, statCaps+bonus 참조를 단계별로 산출; 능력치 범위는 조건부이고 실제 생존·훈련·성장·연구 실행이 증명되지 않음.",
      "statCaps+bonus 값은 표시용 실효 상한 참조로서 실제 전투 성장이나 upperBoundAtStatCaps의 원시 성장 하드캡을 임의 증가시키지 않음.",
      "모든 출생처 전체 훈련 조합의 최적성을 입증하기 전에는 캠페인 모델의 한 경로가 통과해도 확정 최댓값이 될 수 없음.",
      "제조 요구 연구와 실물 requiredItems는 별도 원본 필드이며, 공급 후보는 반드시 실제 보유 및 이벤트 발동으로 검증해야 함.",
      "제조에서 생성되는 새 병사는 기존 대원의 훈장·이력을 자동 상속하지 않음.",
      "출생 effectiveStats는 원본 출생 보너스를 1회 적용한 범위; 일반적인 성장 상계는 엔진 룰 기반의 매우 낙관적인 상계일 뿐 달성 인증이 아님.",
      "과거 병종별 영구 보너스 최적 후보는 어떤 개별 획득 경로에도 자동 귀속시키지 않음.",
      "출생 이력과 후보 변신의 직접 금지 조건 및 양방향 연구 배제를 진단하지만, 중간 이력 초기화·유형 변환 등 우회 경로가 없다는 증명은 아니므로 불가능 판정을 내리지 않음.",
      "훈장·연구 폐쇄·이벤트 지급·다단계 유형 변환의 실제 시간순 검증 전에는 최종 능력치와 합계 게시를 금지함."
    ],classes:classSummary,rows};
}

const here=fileURLToPath(import.meta.url);
if(process.argv[1]&&here.toLowerCase()===resolve(process.argv[1]).toLowerCase()){
  const d=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
  const m=JSON.parse(fs.readFileSync("public/data/soldier-research-maxima-20261101.json","utf8"));
  const out=buildSoldierOriginProgression(d,m);
  const path="public/data/soldier-acquisition-progression-20261102.json";
  if(process.argv.includes("--check")){
    const actual=JSON.parse(fs.readFileSync(path,"utf8"));
    if(JSON.stringify(actual)!==JSON.stringify(out))throw new Error("출생별 감사 생성 데이터가 최신 원본과 불일치");
    console.log("PASS acquisition progression regenerated: "+out.summary.indexedAcquisitionBranches);
  }else {
    fs.writeFileSync(path,JSON.stringify(out,null,2)+"\n","utf8");
    console.log("Built "+path+" ("+out.summary.originalSpawnProfiles+" birth, "+out.summary.incomingTypeChangeBranches+" incoming body-branch)");
  }
}