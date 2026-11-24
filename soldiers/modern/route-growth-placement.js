// One-path, one-batch conditional growth placement explorer.
import {BIRTH_STAT_KEYS} from './birth-rng-math.js';
import {registeredRouteDistribution} from './route-roll-math.js';
const unavailable=reason=>({kind:'unverified',reason,positions:[],unresolved:[]});

// Exhaustive over the N+1 possible INSERTION BOUNDARIES for one supplied
// hypothetical growth batch in one already registered transform sequence.
// This does NOT reorder transformations, optimize research, prove feasibility,
// or infer XP mechanics. Different targets may have different best boundaries.
export function rankGrowthPlacements(data,profileId,candidate,stats,objective='total'){
  if(!candidate||!Array.isArray(candidate.transforms)||
    (objective!=='total'&&!BIRTH_STAT_KEYS.includes(objective))||
    !stats||typeof stats!=='object'||!Object.keys(stats).length||
    Object.keys(stats).some(key=>!BIRTH_STAT_KEYS.includes(key)))
    return unavailable('성장 위치 탐색 입력·목표 지표 오류');
  const positions=[],unresolved=[];
  for(let boundary=0;boundary<=candidate.transforms.length;boundary++){
    const roll=registeredRouteDistribution(data,profileId,candidate,{
      growthSchedule:[{beforeTransform:boundary,stats}]
    });
    if(roll.kind!=='conditional-route-distribution'){
      unresolved.push({boundary,reason:roll.reason||'조건부 확률 미산출'});
      continue;
    }
    positions.push({boundary,score:objective==='total'?roll.expectedTotal:roll.stats[objective],
      expectedTotal:roll.expectedTotal,statGateProbability:roll.statGateProbability,
      stats:roll.stats});
  }
  positions.sort((a,b)=>b.score-a.score||a.boundary-b.boundary);
  return {kind:positions.length?'conditional-placement-ranking':'unverified',
    reason:positions.length?null:'비교 가능한 성장 삽입 시점 없음',
    objective,positions,unresolved,best:positions[0]||null,
    examined:candidate.transforms.length+1,
    caveat:'선택한 기존 시술 순서와 한 번의 명시적 가상 성장 시행 묶음만 비교함. 시술 순서 재정렬·연구·계급·비용·실제 전투 경험 획득 여부는 미최적화'};
}
