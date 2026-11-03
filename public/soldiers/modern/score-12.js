// Restore Mana for the 12-stat UI without rewriting the signed 11-stat witnesses.
// Every projected 11-stat raw/bonus/effective vector is compared to the
// original SHA-256-verified candidate; game rules and research remain unchanged.
import {STAT_KEYS,initialState,bonusStats,statChangeEngineEstimate} from './eligibility.js';
import {WITNESS_STATS} from './origin-witness.js';

export const DISPLAY_STATS=Object.freeze([
  'tu','stamina','health','bravery','reactions','firing','throwing',
  'melee','strength','psiStrength','psiSkill','mana'
]);
export function displayTotal(stats){
  return DISPLAY_STATS.reduce((sum,k)=>{
    if(!Number.isInteger(stats?.[k]))throw Error('12종 능력치 누락/비정수: '+k);
    return sum+stats[k];
  },0);
}
export function projectBirthStats(record,profile){
  if(!profile||profile.id!==record.profileId)throw Error('출생처 원본 누락: '+record.profileId);
  const stats=Object.fromEntries(STAT_KEYS.map(k=>[k,profile.effectiveStats?.min?.[k]]));
  for(const k of WITNESS_STATS)if(stats[k]!==record.birthReference[k])
    throw Error('출생 기준값 변조: '+record.profileId+'/'+k);
  displayTotal(stats);
  return stats;
}
export function projectCandidateStats(record,candidate,data){
  const profile=data.profiles.find(p=>p.id===record.profileId);
  if(!profile||candidate.profileId!==record.profileId)
    throw Error('출생처와 성장 후보 불일치: '+record.profileId);
  // The signed steps, not the unhashed convenience transforms field, are authoritative.
  const trained=candidate.steps.filter(s=>s.type==='transform').map(s=>s.transform);
  if(JSON.stringify(trained)!==JSON.stringify(candidate.transforms))
    throw Error('훈련 목록과 서명된 재생 순서 불일치: '+candidate.id);
  let state=initialState(data,profile,{band:'min'});
  for(const id of trained){
    const rule=data.transformations.find(t=>t.id===id);
    if(!rule||rule.createsClone)throw Error('추적할 수 없는 훈련·복제: '+id);
    const estimate=statChangeEngineEstimate(rule,state,data);
    if(estimate.hasUnmodelled)throw Error('능력치 난수 확정 불가: '+id);
    const history=new Map(state.history),bonusCounts=new Map(state.bonusCounts);
    if(rule.reset){history.clear();bonusCounts.clear();}
    else for(const removed of rule.removeTransformations||[]){
      const count=Number(history.get(removed)||0);
      if(!count)continue;
      history.delete(removed);
      const oldRule=data.transformations.find(t=>t.id===removed);
      if(oldRule?.soldierBonusType){
        const oldBonus=oldRule.soldierBonusType,remaining=(bonusCounts.get(oldBonus)||0)-count;
        if(remaining>0)bonusCounts.set(oldBonus,remaining);else bonusCounts.delete(oldBonus);
      }
    }
    history.set(id,(history.get(id)||0)+1);
    if(rule.soldierBonusType)
      bonusCounts.set(rule.soldierBonusType,(bonusCounts.get(rule.soldierBonusType)||0)+1);
    state={...state,history,bonusCounts,bonusIds:new Set(bonusCounts.keys()),
      currentStats:estimate.stats,soldierType:rule.producedSoldierType||state.soldierType};
  }
  const added=bonusStats(state,data);
  const raw=Object.fromEntries(STAT_KEYS.map(k=>[k,state.currentStats[k]]));
  const bonus=Object.fromEntries(STAT_KEYS.map(k=>[k,added[k]||0]));
  const stats=Object.fromEntries(STAT_KEYS.map(k=>
    [k,Math.max(k==='health'?1:0,raw[k]+bonus[k])]));
  for(const k of WITNESS_STATS)
    if(raw[k]!==candidate.raw[k]||bonus[k]!==candidate.bonus[k]||stats[k]!==candidate.stats[k])
      throw Error('기존 11종 재생 증거와 12종 재구성 충돌: '+candidate.id+'/'+k);
  if(WITNESS_STATS.reduce((sum,k)=>sum+stats[k],0)!==candidate.total||
     WITNESS_STATS.reduce((sum,k)=>sum+bonus[k],0)!==candidate.bonusTotal)
    throw Error('기존 11종 합계와 재구성 결과 충돌: '+candidate.id);
  return {raw,bonus,stats,total:displayTotal(stats),bonusTotal:displayTotal(bonus)};
}
