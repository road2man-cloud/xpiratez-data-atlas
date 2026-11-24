// Candidate-level comparison for a SINGLE source origin.
// The input candidate list MUST already be filtered by the caller's campaign
// feasibility and terminal-body boundaries. This helper never mixes witnesses
// from separate births, merges mutually exclusive research or fabricates a
// route by combining the best stat from each candidate.
import {BIRTH_STAT_KEYS} from './birth-rng-math.js';
import {registeredRouteDistribution} from './route-roll-math.js';

const EPS=1e-9;
const clamp=p=>Math.max(0,Math.min(1,p));
const invalid=reason=>({kind:'unverified',reason});
export const ROUTE_EXPECTATION_OBJECTIVES=Object.freeze(['total',...BIRTH_STAT_KEYS]);

export function candidateRollSummary(data,profileId,candidate,{
  timing='none',attempts=0,success=0,birthSelection=null
}={}){
  if(!candidate||candidate.profileId!==profileId)
    return invalid('출생처/후보 참조 불일치');
  if(!['none','before','after'].includes(timing)||
     !Number.isSafeInteger(attempts)||attempts<0||attempts>40||
     !Number.isFinite(success)||success<0||success>100)
    return invalid('가상 성장 시점·시행 횟수·성공률 입력 오류');
  const schedule=timing==='none'?[]:[{
    beforeTransform:timing==='before'?0:candidate.transforms?.length,
    stats:Object.fromEntries(BIRTH_STAT_KEYS.map(key=>[key,{
      attempts,kernel:[[0,1-success/100],[1,success/100]]
    }]))
  }];
  const roll=registeredRouteDistribution(data,profileId,candidate,
    {growthSchedule:schedule,birthSelection});
  if(roll.kind!=='conditional-route-distribution')
    return {kind:roll.kind==='stat-gated'?'stat-gated':
      roll.kind==='birth-incompatible'?'birth-incompatible':'unverified',
      id:candidate.id,reason:roll.reason||'실측하지 않은 변신 규칙'};
  const gate=clamp(roll.statGateProbability);
  if(!Number.isFinite(gate)||!Number.isFinite(roll.expectedTotal)||
    BIRTH_STAT_KEYS.some(key=>!Number.isFinite(roll.stats[key])))
    return invalid('경로 확률·평균에 유효하지 않은 값');
  return {kind:'source-conditional-candidate',id:candidate.id,profileId,
    finalSoldierType:candidate.finalSoldierType,stats:roll.stats,
    expectedTotal:roll.expectedTotal,statGateProbability:gate,
    birthSelectionProbability:roll.birthSelectionProbability,
    jointStatEligibilityProbability:roll.jointStatEligibilityProbability,
    transformCount:candidate.transforms.length,researchCount:candidate.researchCount,
    assumptions:candidate.assumptions?.length??0,
    caveat:'능력치 요건 통과를 조건으로 한 평균이며 출생·연구 획득 확률과 다름'};
}

// Report partial, completed and excluded counts separately. Candidate ids must
// be stable and unique; a missing source is not silently treated as low-scoring.
export function rankCandidateRollSummaries(entries,{
  objective='total',minGate=0,body='all'
}={}){
  if(!ROUTE_EXPECTATION_OBJECTIVES.includes(objective)||
    !Number.isFinite(minGate)||minGate<0||minGate>1||
    typeof body!=='string'||!body)
    return invalid('경로 비교 목표/선발 문턱 오류');
  const unique=new Set(),valid=[],unverified=[],statBlocked=[],birthIncompatible=[];
  for(const entry of entries||[]){
    if(!entry||!entry.id||unique.has(entry.id))
      return invalid('후보 ID 중복·누락');
    unique.add(entry.id);
    if(entry.kind==='stat-gated'){statBlocked.push(entry);continue;}
    if(entry.kind==='birth-incompatible'){birthIncompatible.push(entry);continue;}
    if(entry.kind!=='source-conditional-candidate'){unverified.push(entry);continue;}
    if(!Number.isFinite(entry.expectedTotal)||
      !Number.isFinite(entry.statGateProbability)||
      entry.statGateProbability<0||entry.statGateProbability>1||
      (entry.birthSelectionProbability!=null&&
        (!Number.isFinite(entry.birthSelectionProbability)||
        entry.birthSelectionProbability<0||entry.birthSelectionProbability>1))||
      !entry.stats||BIRTH_STAT_KEYS.some(k=>!Number.isFinite(entry.stats[k])))
      return invalid('등록 후보의 기대값 또는 통과율 무효');
    valid.push({...entry,score:objective==='total'?entry.expectedTotal:entry.stats[objective]});
  }
  const available=valid.filter(x=>(body==='all'||x.finalSoldierType===body)&&
    x.statGateProbability+EPS>=minGate);
  available.sort((a,b)=>b.score-a.score||
    b.statGateProbability-a.statGateProbability||
    a.id.localeCompare(b.id,'en'));
  const frontier=available.filter(x=>!available.some(y=>
    x.id!==y.id&&x.finalSoldierType===y.finalSoldierType&&
    y.score+EPS>=x.score&&y.statGateProbability+EPS>=x.statGateProbability&&
    (y.score>x.score+EPS||y.statGateProbability>x.statGateProbability+EPS)));
  const ids=new Set(frontier.map(x=>x.id));
  return {kind:'conditional-candidate-ranking',objective,body,minGate,
    registered:unique.size,computed:valid.length,statBlocked,unverified,birthIncompatible,
    excludedByFilter:valid.length-available.length,
    ranked:available.map(x=>({...x,onFrontier:ids.has(x.id)})),
    frontierCount:frontier.length,best:available[0]||null,
    caveat:'선택한 출생처·등록된 캠페인 호환 후보만 비교하며, 시술·출생 난수는 독립 가정. 평균은 능력치 요건 통과 개체를 조건으로 하며 통과율은 별도 축입니다. 생존·연구·비용·시간·실제 훈련 가능성 및 전역 경로 최적성은 미증명'};
}
