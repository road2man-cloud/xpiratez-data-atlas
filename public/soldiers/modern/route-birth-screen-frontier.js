// Enumerate ONE observable newborn stat screening floor for a signed candidate.
// Uses exact constructor rolls and conditional chronological transform math.
// All chances assume independent newly-generated recruits and fulfilled
// non-stat path prerequisites. Not an in-game shopping/recruitment guarantee.
import {BIRTH_STAT_KEYS,newbornDistribution} from './birth-rng-math.js';
import {registeredRouteDistribution} from './route-roll-math.js';

const finite=Number.isFinite;
const integer=Number.isSafeInteger;
const EPS=1e-9;
const clamp=p=>Math.min(1,Math.max(0,p));
const rejected=reason=>({kind:'unverified',reason});
const targetScore=(roll,objective)=>
  objective==='total'?roll.expectedTotal:roll.stats?.[objective];

export function chanceWithinIndependentRolls(singleChance,draws){
  if(!finite(singleChance)||singleChance<0||singleChance>1||!integer(draws)||draws<1)
    return null;
  if(singleChance===0)return 0;
  if(singleChance===1)return 1;
  return clamp(-Math.expm1(draws*Math.log1p(-singleChance)));
}

export function enumerateRouteBirthFloors(data,profileId,candidate,{
  screenStat='tu',objective='total',draws=10,requiredChance=.5,
  growthSchedule=[],maxThresholds=180
}={}){
  if(!BIRTH_STAT_KEYS.includes(screenStat)||
    (objective!=='total'&&!BIRTH_STAT_KEYS.includes(objective))||
    !integer(draws)||draws<1||draws>10000||
    !finite(requiredChance)||requiredChance<0||requiredChance>1||
    !integer(maxThresholds)||maxThresholds<1)
    return rejected('선발 목표·초기 능력치·모집 횟수·요구 확률 입력 오류');
  if(!candidate||candidate.profileId!==profileId)return rejected('등록 경로의 출생처 불일치');
  let birth;
  try{birth=newbornDistribution(data,profileId);}catch(error){
    return rejected('출생 추첨 원본 불명확: '+error.message);
  }
  const sampled=birth.distributions?.[screenStat];
  if(!Array.isArray(sampled)||!sampled.length||
    sampled.some(x=>!Array.isArray(x)||x.length!==2||!integer(x[0])||
      !finite(x[1])||x[1]<0))
    return rejected('해당 초기 능력치의 원본 추첨 분포가 없음');
  if(sampled.length>maxThresholds)
    return rejected('정확한 선발 컷오프 '+sampled.length+'종이 상태 공간 한도 '+maxThresholds+'종을 초과');
  const options=[],unverified=[];
  const noScreen={
    kind:'not-computed',expectedTotal:null,statGateProbability:null
  };
  const baseline=registeredRouteDistribution(data,profileId,candidate,{growthSchedule});
  if(baseline.kind==='conditional-route-distribution'){
    noScreen.kind='conditional-route-distribution';
    noScreen.expectedObjective=targetScore(baseline,objective);
    noScreen.expectedTotal=baseline.expectedTotal;
    noScreen.statGateProbability=clamp(baseline.statGateProbability);
    noScreen.chanceWithinDraws=chanceWithinIndependentRolls(noScreen.statGateProbability,draws);
  }else{
    noScreen.kind=baseline.kind;
    noScreen.reason=baseline.reason;
  }

  for(const [minimum] of sampled){
    const screenProbability=clamp(sampled.reduce((sum,[value,p])=>
      sum+(value>=minimum?p:0),0));
    if(screenProbability<=0){unverified.push({minimum,reason:'출생 추첨 확률 0'});continue;}
    const result=registeredRouteDistribution(data,profileId,candidate,{
      growthSchedule,birthSelection:{mode:'atLeast',stats:{[screenStat]:minimum}}
    });
    if(result.kind==='unverified'||result.kind==='birth-incompatible'){
      unverified.push({minimum,reason:result.reason||'확률 분포 미산출'});
      continue;
    }
    const gated=result.kind==='stat-gated';
    if(!gated&&result.kind!=='conditional-route-distribution'){
      unverified.push({minimum,reason:result.reason||'원본 경로 미확인'});continue;
    }
    const pathChance=gated?0:clamp(result.statGateProbability);
    const jointChance=clamp(screenProbability*pathChance);
    const objectiveMean=gated?null:targetScore(result,objective);
    if(!gated&&(!finite(objectiveMean)||!finite(result.expectedTotal))){
      unverified.push({minimum,reason:'최종 기대값 미산출'});continue;
    }
    options.push({
      minimum,screenProbability,pathChance,jointChance,
      chanceWithinDraws:chanceWithinIndependentRolls(jointChance,draws),
      expectedScreenDraws:1/screenProbability,
      expectedJointDraws:jointChance>0?1/jointChance:null,
      expectedObjective:objectiveMean,
      expectedTotal:gated?null:result.expectedTotal,
      statBlocked:gated
    });
  }
  const usable=options.filter(x=>!x.statBlocked);
  const frontier=usable.filter(x=>!usable.some(y=>
    x.minimum!==y.minimum&&
    y.expectedObjective+EPS>=x.expectedObjective&&
    y.chanceWithinDraws+EPS>=x.chanceWithinDraws&&
    (y.expectedObjective>x.expectedObjective+EPS||
      y.chanceWithinDraws>x.chanceWithinDraws+EPS)));
  const frontierIds=new Set(frontier.map(x=>x.minimum));
  const eligible=usable.filter(x=>x.chanceWithinDraws+EPS>=requiredChance)
    .sort((a,b)=>b.expectedObjective-a.expectedObjective||
      b.chanceWithinDraws-a.chanceWithinDraws||
      a.minimum-b.minimum);
  return {kind:'conditional-screen-frontier',profileId,candidateId:candidate.id,
    screenStat,objective,draws,requiredChance,baseline,
    enumerated:options.map(x=>({...x,onFrontier:frontierIds.has(x.minimum)})),
    candidates:usable.length,frontierCount:frontier.length,
    unverified,selected:eligible[0]||null,
    feasible:eligible.length,sourceValues:sampled.length,
    caveat:'독립 신규 병사 추첨 N회의 수학적 모델. 한 초기 능력치의 최솟값만 선발하고, 모든 비능력치 선행조건은 별도 충족한다고 가정함. 경로의 능력치 문턱 성공을 실제 연구·시술 완료 확률로 해석하지 않으며, 실제 채용 비용·충원 가능 횟수·전투 성장 확률은 포함하지 않음'};
}
