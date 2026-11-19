// Conditional finite-state combat growth model. NOT an inferred OXCE XP formula.
// The caller must provide an empirically or source-backed event kernel for each
// attribute. In particular an omitted kernel never becomes a default probability.
import {BIRTH_STAT_KEYS,distributionMoment} from './birth-rng-math.js';
const integer=(n)=>Number.isSafeInteger(n);
const sort=m=>[...m].sort((a,b)=>a[0]-b[0]);
function add(map,n,p){map.set(n,(map.get(n)||0)+p);}
export function advanceGrowthDistribution(distribution,options){
  if(!Array.isArray(distribution)||!distribution.length)throw Error('시작 능력치 분포 누락');
  const {attempts,cap,kernel,bonus=0,maxStates=20000}=options||{};
  if(!integer(attempts)||attempts<0||attempts>10000)throw Error('성장 시행 횟수 필요');
  if(!integer(cap)||!integer(bonus))throw Error('전투 성장 상한·영구 보너스 필요');
  if(!Array.isArray(kernel)||!kernel.length||
    kernel.some(x=>!Array.isArray(x)||x.length!==2||!integer(x[0])||x[0]<0||
      !Number.isFinite(x[1])||x[1]<0)||
    Math.abs(kernel.reduce((s,x)=>s+x[1],0)-1)>1e-9)
    throw Error('증가량별 명시적 확률 커널 필요');
  if(!integer(maxStates)||maxStates<1)throw Error('상태 공간 상한 오류');
  let state=new Map();
  for(const [value,prob] of distribution){
    if(!integer(value)||!Number.isFinite(prob)||prob<0)throw Error('시작 분포 오류');
    add(state,value,prob);
  }
  if(Math.abs([...state.values()].reduce((a,b)=>a+b,0)-1)>1e-8)
    throw Error('시작 확률 정규화 실패');
  for(let i=0;i<attempts;i++){
    const next=new Map();
    for(const [value,p] of state){
      // Eligibility is tested BEFORE each event, so the final event may
      // overshoot a cap. Already-high stats are never reduced.
      if(value-bonus>=cap){add(next,value,p);continue;}
      for(const [gain,q] of kernel)add(next,value+gain,p*q);
    }
    if(next.size>maxStates)throw Error('정확 분포 상태 공간 초과: 근사 없이 계산 보류');
    state=next;
  }
  const entries=sort(state),sum=entries.reduce((s,[,p])=>s+p,0);
  if(Math.abs(sum-1)>1e-8)throw Error('성장 확률 보존 실패');
  return {kind:'conditional-exact-growth',distribution:entries,
    expected:distributionMoment(entries),range:[entries[0][0],entries.at(-1)[0]],
    attempts,cap,bonus,kernel};
}
export function conditionalGrowthProjection(roll,spec){
  if(!roll?.distributions)throw Error('출생 RNG 자료 없음');
  const perStat={},means={},skipped=[];
  let total=[[0,1]];
  for(const key of BIRTH_STAT_KEYS){
    const item=spec?.[key];
    if(!item){skipped.push(key);continue;}
    const result=advanceGrowthDistribution(roll.distributions[key],item);
    perStat[key]=result;means[key]=result.expected;
  }
  // A total can only be claimed when every stat has a supplied scenario.
  if(skipped.length)return {kind:'incomplete-scenario',perStat,means,skipped,
    reason:'능력치별 전투 성장 가정 일부 누락'};
  for(const key of BIRTH_STAT_KEYS){
    const next=new Map();
    for(const [a,p] of total)for(const [b,q] of perStat[key].distribution)
      add(next,a+b,p*q);
    if(next.size>20000)throw Error('합계 상태 공간 초과: 확률 미산출');
    total=sort(next);
  }
  return {kind:'conditional-exact-growth',perStat,means,
    expectedTotal:distributionMoment(total),totalDistribution:total};
}
export function thresholdProbability(entries,threshold){
  if(!integer(threshold)||!Array.isArray(entries))return null;
  return entries.reduce((s,[value,p])=>s+(value>=threshold?p:0),0);
}
