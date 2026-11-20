// Conditional sampling of the SAME source-origin newborn population.
// Constraints target *effective* on-screen newborn values (including the
// inherited SoldierBonus once), not the raw OXCE current/initial pair.
import {BIRTH_STAT_KEYS} from './birth-rng-math.js';

const floor=k=>k==='health'?1:0;
const integer=Number.isSafeInteger;
const clamp=(v,k)=>Math.max(floor(k),v);
export function effectiveNewbornStat(raw,key,bonus){
  return clamp(key==='psiSkill'&&raw<=0?raw:raw+bonus,key);
}
export function conditionBirthPairs(rawPairs,bonuses,selection){
  if(selection==null)return {kind:'unfiltered-birth',pairs:rawPairs,selectionProbability:1,
    constrained:0,perStatProbability:{},mode:null};
  if(!selection||typeof selection!=='object'||Array.isArray(selection)||
    !['exact','atLeast'].includes(selection.mode)||
    !selection.stats||typeof selection.stats!=='object'||
    Array.isArray(selection.stats)||
    Object.keys(selection.stats).some(key=>!BIRTH_STAT_KEYS.includes(key)||
      !integer(selection.stats[key])))
    return {kind:'unverified',reason:'선발 기준은 출생 실효 능력치 12종의 정수와 일치/최소 모드로 지정'};
  const perStatProbability={},out={...rawPairs},constraints=Object.entries(selection.stats);
  let selectionProbability=1;
  for(const [key,threshold] of constraints){
    const bonus=bonuses?.[key]??0;
    if(!integer(bonus))return {kind:'unverified',reason:'출생 영구 보너스 근거 오류: '+key};
    const source=rawPairs?.[key];
    if(!Array.isArray(source)||!source.length)
      return {kind:'unverified',reason:'출생 원시 추첨 분포 누락: '+key};
    const eligible=source.filter(([raw,initial,p])=>
      integer(raw)&&integer(initial)&&Number.isFinite(p)&&p>=0&&(
        selection.mode==='exact'?
          effectiveNewbornStat(raw,key,bonus)===threshold:
          effectiveNewbornStat(raw,key,bonus)>=threshold
      ));
    const probability=eligible.reduce((sum,entry)=>sum+entry[2],0);
    perStatProbability[key]=probability;
    if(probability<=0){
      const feasible=[...new Set(source.map(x=>effectiveNewbornStat(x[0],key,bonus)))].sort((a,b)=>a-b);
      return {kind:'birth-incompatible',selectionProbability:0,key,
        requested:threshold,mode:selection.mode,
        possible:{min:feasible[0],max:feasible.at(-1),
          values:feasible.length<=12?feasible:null},
        reason:'원본 출생 추첨 범위에서 '+key+' '+threshold+
          (selection.mode==='exact'?' 정확한 값':' 이상')+'을(를) 만들 수 없음',
        constrained:constraints.length,perStatProbability};
    }
    out[key]=eligible.map(([raw,initial,p])=>[raw,initial,p/probability]);
    selectionProbability*=probability;
  }
  if(!(selectionProbability>0)||selectionProbability>1+1e-8)
    return {kind:'unverified',reason:'출생 조건부 추첨 확률 정규화 오류'};
  return {kind:'conditioned-birth',pairs:out,selectionProbability,
    constrained:constraints.length,perStatProbability,mode:selection.mode,
    criteria:Object.fromEntries(constraints)};
}
