// Build an acquisition-specific, non-certifying progression registry on the
// EXISTING 2.1 soldier atlas. The old 29-body maxima remain legacy candidates.
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {initialState,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {createStatEnvelope} from "../public/soldiers/modern/stat-envelope.js";
import {growStatEnvelope} from "../public/soldiers/modern/growth-envelope.js";

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
  const direct=[],transformed=[];
  for(const profile of data.profiles){
    const s=soldiers.get(profile.soldierType);
    if(!s||!maxima.has(s.id))throw new Error("알 수 없는 획득 병종: "+profile.id);
    const n=naturalPotential(data,profile);
    if(n.status!=="조건부 성장 상계")throw new Error(profile.id+" "+n.reason);
    direct.push({
      id:profile.id,soldierType:s.id,soldierName:s.koName,
      acquisitionType:profile.sourceType,sourceId:profile.sourceId,
      sourceName:profile.sourceKoName||profile.id,kind:"SOURCE_SPAWN",
      prerequisites:{research:profile.requires||[],facilities:profile.requiresBaseFunc||[],
        cost:profile.cost??null,time:profile.time??null,spawnedPersons:profile.spawnedPersons??1},
      birth:n.birth,unbonusedBirth:n.baseBirth,
      rank:profile.rank??0,armor:profile.armor||s.armor||null,
      initialHistory:entries(profile.previousTransformations),
      initialBonuses:entries(profile.traitCounts),
      bornPermanentBonus:n.bornPermanentBonus,
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
      transformed.push({
        id:"transform:"+t.id+":from:"+sourceType,soldierType:output.id,
        soldierName:output.koName,acquisitionType:"typeChange",
        sourceId:t.id,sourceName:t.koName||t.id,
        kind:"TYPE_CHANGE_WITH_UNRESOLVED_PARENT",parentSoldierType:sourceType,
        parentAcquisitionProfiles:parentProfiles,
        prerequisites:{research:t.requires||[],facilities:t.requiresBaseFunc||[],
          items:t.requiredItems||{},minRank:t.minRank||0,
          minStats:pick(t.requiredMinStats),maxStats:t.requiredMaxStats||null,
          priorHistory:t.requiredPreviousTransformations||[],
          forbiddenHistory:t.forbiddenPreviousTransformations||[],
          reset:t.reset===true,createsClone:t.createsClone===true},
        birth:null,unbonusedBirth:null,rank:null,armor:t.producedSoldierArmor||null,
        initialHistory:null,initialBonuses:null,bornPermanentBonus:null,
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
      "public/data/soldier-research-maxima-20261101.json"],
    stats:STATS,summary:{
      classes:29,originalSpawnProfiles:direct.length,incomingTypeChangeRules:
        data.transformations.filter(t=>t.producedSoldierType).length,
      incomingTypeChangeBranches:transformed.length,
      indexedAcquisitionBranches:rows.length,chronologicalPathsVerified:0,
      finalStatRoutesVerified:0,saveVerified:0},
    statusDefinitions:{
      "실행 경로 검증":"획득부터 최종 시술까지 시간순 규칙 재생이 실제로 통과한 경로",
      "조건부 실행 경로":"시간순 재생은 통과했지만 발생 가능한 이벤트·RNG 보상을 가정한 경로",
      "불가능 판정":"원본 규칙의 구체적 충돌이 반증으로 확인된 경로",
      "미검증":"재생 증명이나 불가능 증명이 아직 없는 경로"
    },
    limitations:[
      "72개 출생 프로필과 7개 병종변경 규칙의 입력 병종 40개 조합을 색인; 변신 이전의 개별 획득 프로필 연결 및 다단계 변신은 아직 완전 전개하지 않음.",
      "제조에서 생성되는 새 병사는 기존 대원의 훈장·이력을 자동 상속하지 않음.",
      "출생 effectiveStats는 원본 출생 보너스를 1회 적용한 범위; 일반적인 성장 상계는 엔진 룰 기반의 매우 낙관적인 상계일 뿐 달성 인증이 아님.",
      "과거 병종별 영구 보너스 최적 후보는 어떤 개별 획득 경로에도 자동 귀속시키지 않음.",
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