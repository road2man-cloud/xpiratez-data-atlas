// Long-horizon EXP potential for X-Piratez v.o2 / OXCE 8.7.1.
// This is an UPPER ENVELOPE for voluntary growth BEFORE a later transform.
// Not a prediction, a guarantee of reaching the upper value, or a complete
// account of unknown external scripts, injuries, missions or RNG histories.
import {STAT_KEYS} from "./eligibility.js";
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const PHYS_KEYS=new Set(["firing","health","melee","throwing","strength","tu","stamina"]);
const PRIMARY_KEYS=new Set(["reactions","firing","melee","throwing","psiSkill","psiStrength"]);
const SECONDARY_KEYS=new Set(["tu","health","strength","stamina"]);
const minimum=(k)=>k==="health"?1:0;
export const GROWTH_PHASES={
  "@BATTLE_GROWTH":"향후 반복 전투 성장 가정",
  "@PHYS_TRAINING":"향후 체력훈련 반복 가정"
};
export function growStatEnvelope(before,state,data,phase){
  if(before?.kind!=="ready")return before;
  if(!Object.prototype.hasOwnProperty.call(GROWTH_PHASES,phase))
    return {kind:"unverified",reason:"지원되지 않는 성장 단계"};
  const rule=data.soldiers?.find(x=>x.id===state.soldierType);
  if(!rule?.statCaps||!rule?.trainingStatCaps)
    return {kind:"unverified",reason:"해당 병종의 성장캡/체력훈련캡 원본이 없음"};
  const combat=phase==="@BATTLE_GROWTH";
  const manaPrimary=data.growthRules?.manaPrimary;
  const manaSecondary=data.growthRules?.manaSecondary;
  // Missing globals? Conservatively permit both mana EXP categories, but
  // NEVER say the mana upper limit is actually reachable.
  const primary=new Set(PRIMARY_KEYS);
  const secondary=new Set(SECONDARY_KEYS);
  if(combat){
    primary.add("bravery");
    if(manaPrimary!==false)primary.add("mana");
    if(manaSecondary!==false)secondary.add("mana");
  }
  const low={...before.low},high={...before.high},capCeil={};
  const candidates=[];
  const armor=data.armorCatalog?.find(x=>x.id===state.armorId);
  const bonusPercent=n(armor?.extraSecondaryGrowthPercent);
  const maxScriptPercent=Math.max(0,...(data.armorCatalog||[]).map(x=>n(x.extraSecondaryGrowthPercent)));
  if(combat&&maxScriptPercent>100)
    return {kind:"unverified",reason:"임무 종료 방어구 추가 성장 스크립트가 100%를 초과함. 별도의 상한 증명 필요"};
  for(const k of STAT_KEYS){
    const cap=n(rule.statCaps[k]),currentHigh=n(before.high[k]);
    let potential=currentHigh;
    let mode="성장 없음";
    if(combat){
      if(primary.has(k)){
        // PostMissionProcedures checks current < cap BEFORE awarding
        // improveStat(exp), which can roll +6, hence cap+5.
        // Bravery increments by 10, hence cap+9 for arbitrary phase.
        const offset=k==="bravery"?9:5;
        potential=Math.max(potential,cap+offset);
        mode=k==="bravery"?"전투 용기 10단위 증가":"전투 주능력치 경험치 증가";
      }
      if(secondary.has(k)){
        // Secondary: if gap>0, gain 0..floor(gap/divisor)+2.
        // At gap=1 => +2 => at most cap+1. The installed armor
        // returnFromMissionUnit script can add +1 at cap (for tags <=100%),
        // and cannot push farther after current exceeds cap.
        potential=Math.max(potential,cap+1);
        mode=primary.has(k)?mode+" + 보조 성장":"전투 보조 성장";
      }
    }else if(PHYS_KEYS.has(k)){
      // Soldier::trainPhys: both current < statCaps and
      // random(0, trainingStatCaps) > current. Each successful day +1,
      // so it can never overshoot min(statCaps,trainingStatCaps).
      potential=Math.max(currentHigh,Math.min(cap,n(rule.trainingStatCaps[k])));
      mode="체력훈련 1단위 (일일 성공은 RNG/시설/건강에 의존)";
    }
    // Some stats can already be above their current body's cap because of
    // an earlier body conversion or direct transformation. Growth cannot
    // erase those numbers, nor can it claim they are growable further.
    high[k]=Math.max(currentHigh,potential);
    capCeil[k]=cap;
    if(high[k]>currentHigh)candidates.push(k);
  }
  const notes=[...before.notes,
    "추가 단계: "+GROWTH_PHASES[phase]+
    " · 하한 유지, 상한만 조건부 확장 (상한에 반드시 도달하는 것은 아님)"];
  if(combat)notes.push(
    "전투 상한 초과: 주능력치 최대 +5, 용기 최대 +9, 보조 최대 +1 · 별도 전리품/스크립트/훈장 효과는 검증 대상",
    "전투 XP 수급, Psi 해금, 전투 경험치 배율과 임무 종료 스크립트의 사용 조건은 획득 보장 아님"
  );
  else notes.push("체력훈련은 상한을 넘기지 않으며, 건물·건강·훈련 확률이 필요");
  return {...before,low,high,
    sourceExact:false,randomSteps:[...before.randomSteps,phase],
    growthPhases:[...(before.growthPhases||[]),phase],
    growthPotentialKeys:candidates,
    growthCap:capCeil,
    notes};
}
export function growthPreview(data,state,bounds){
  return {
    combat:growStatEnvelope(bounds,state,data,"@BATTLE_GROWTH"),
    physical:growStatEnvelope(bounds,state,data,"@PHYS_TRAINING")
  };
}
