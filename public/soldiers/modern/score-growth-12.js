// Source-backed conditional ENDGAME growth ceilings for each acquired X-Piratez v.o2 soldier.
// A ceiling is NOT an achieved final stat vector nor a globally optimal path.
// The original signed chronological acquisition/transform witness remains authoritative.
import {STAT_KEYS,initialState,bonusStats} from './eligibility.js';
import {createStatEnvelope,advanceStatEnvelope} from './stat-envelope.js?v=20261103-stamina-bound-fix-1';
import {growStatEnvelope} from './growth-envelope.js';
import {DISPLAY_STATS,displayTotal} from './score-12.js';

function futureGrowth(bounds,state,data){
  const physical=growStatEnvelope(bounds,state,data,'@PHYS_TRAINING');
  if(physical.kind!=='ready')return physical;
  return growStatEnvelope(physical,state,data,'@BATTLE_GROWTH');
}
function afterTransformation(state,rule,data){
  const history=new Map(state.history),bonusCounts=new Map(state.bonusCounts);
  if(rule.reset){history.clear();bonusCounts.clear();}
  else for(const removed of rule.removeTransformations||[]){
    const count=Number(history.get(removed)||0);
    if(!count)continue;
    history.delete(removed);
    const previous=data.transformations.find(t=>t.id===removed);
    if(previous?.soldierBonusType){
      const bonusId=previous.soldierBonusType;
      const remaining=(bonusCounts.get(bonusId)||0)-count;
      if(remaining>0)bonusCounts.set(bonusId,remaining);
      else bonusCounts.delete(bonusId);
    }
  }
  history.set(rule.id,(history.get(rule.id)||0)+1);
  if(rule.soldierBonusType)
    bonusCounts.set(rule.soldierBonusType,(bonusCounts.get(rule.soldierBonusType)||0)+1);
  const soldierType=rule.producedSoldierType||state.soldierType;
  const body=data.soldiers.find(s=>s.id===soldierType);
  const rank=rule.resetRank?0:body?.allowPromotion===false?0:state.rank;
  return {...state,history,bonusCounts,bonusIds:new Set(bonusCounts.keys()),
    soldierType,rank,armorId:rule.keepSoldierArmor?state.armorId:
    (rule.producedSoldierArmor||body?.armor||state.armorId)};
}
const unknown=reason=>({kind:'unverified',reason});
export function projectCandidateGrowthLimit(record,candidate,data){
  const profile=data.profiles.find(p=>p.id===record?.profileId);
  if(!profile||candidate?.profileId!==record.profileId)
    return unknown('출생처·경로 출처 불일치');
  const transforms=(candidate.steps||[]).filter(s=>s.type==='transform').map(s=>s.transform);
  if(JSON.stringify(transforms)!==JSON.stringify(candidate.transforms))
    return unknown('재생 이력과 훈련 순서 불일치');
  let state=initialState(data,profile,{band:'max'});
  let bounds=createStatEnvelope(data,profile.id);
  if(bounds.kind!=='ready')return unknown(bounds.reason);
  const stages=[];
  for(const id of transforms){
    const rule=data.transformations.find(t=>t.id===id);
    if(!rule||rule.createsClone)return unknown('동일 병사 훈련 경로가 아님: '+id);
    // Growth may occur BEFORE a later conversion: applying only the last body's
    // cap silently loses legitimate percentage-transformation possibilities.
    // High bounds are a relaxed union of growth schedules, not a joint RNG roll.
    const grown=futureGrowth(bounds,state,data);
    if(grown.kind!=='ready')return unknown(grown.reason);
    bounds=advanceStatEnvelope(rule,grown,data,state);
    if(bounds.kind!=='ready')return unknown(bounds.reason);
    stages.push({trainingId:id,beforeBody:state.soldierType,
      afterBody:rule.producedSoldierType||state.soldierType});
    state=afterTransformation(state,rule,data);
  }
  // Final-body EXP + phys growth is necessary even when no transforms exist.
  bounds=futureGrowth(bounds,state,data);
  if(bounds.kind!=='ready')return unknown(bounds.reason);
  const added=bonusStats(state,data);
  const raw=Object.fromEntries(STAT_KEYS.map(k=>[k,bounds.high[k]]));
  const bonus=Object.fromEntries(STAT_KEYS.map(k=>[k,Number(added[k]||0)]));
  const stats=Object.fromEntries(STAT_KEYS.map(k=>
    [k,Math.max(k==='health'?1:0,raw[k]+bonus[k])]));
  if(!DISPLAY_STATS.every(k=>Number.isInteger(stats[k])&&Number.isInteger(raw[k])))
    return unknown('전투 성장 상한의 정수 계산 불가');
  return {
    kind:'conditional-upper-envelope',raw,bonus,stats,total:displayTotal(stats),
    finalSoldierType:state.soldierType,stages,
    caveat:'전투·체력훈련을 충분히 반복한다는 조건부 상한 투사. 출생 RNG, '+
      '훈련 자격의 성장 전후 변화, 동시 달성, 훈장·장비 추가 효과, 연구 공급, '+
      '실제 게임 실행 및 전역 최적성은 증명되지 않았습니다.'
  };
}
