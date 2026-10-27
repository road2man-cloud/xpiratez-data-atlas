// Conservative, source-backed X-Piratez 2.1 / OXCE 8.7.1 stat intervals.
//
// Unlike a single mean/minimum "sample" soldier, this envelope carries every
// possible value admitted by a starting body's template and each selected
// transformation's random, percent, cap, and stat-reroll rules.
//
// It deliberately relaxes inter-stat and current/initial correlations: bounds
// may be wide, but no intermediate roll is silently represented as exact.
// Equipment and bonuses are NOT included in the raw transformed stats.
import {STAT_KEYS,bonusStats} from "./eligibility.js";
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const minmax=(a,b)=>[Math.min(a,b),Math.max(a,b)];
const copy=x=>Object.fromEntries(STAT_KEYS.map(k=>[k,n(x?.[k])]));
function fromBands(bands){
  if(!bands?.min||!bands?.max)return null;
  return {min:copy(bands.min),max:copy(bands.max)};
}
function interval(v,w){
  const [low,high]=minmax(n(v),n(w));
  return {low,high};
}
function add(a,b){return {low:a.low+b.low,high:a.high+b.high}}
function pct(base,p){
  // UnitStats::percent: C++ integer division truncates toward zero.
  const products=[base.low*p.low,base.low*p.high,base.high*p.low,base.high*p.high];
  return interval(Math.trunc(Math.min(...products)/100),Math.trunc(Math.max(...products)/100));
}
const plus=(...xs)=>xs.reduce((a,b)=>add(a,b),{low:0,high:0});
const braveryRound=v=>Math.trunc((v+(v<0?-5:5))/10)*10;
function softLimit(current,change,cap){
  // Engine UnitStats::softLimit is piecewise at delta=0 and current=cap.
  // Extremal values over each integer rectangle are attained at the
  // rectangle's endpoints or adjacent to these breakpoints.
  const xs=[current.low,current.high,cap,cap+1].filter(x=>x>=current.low&&x<=current.high);
  const ys=[change.low,change.high,0,1].filter(x=>x>=change.low&&x<=change.high);
  const observed=[];
  for(const c of xs)for(const delta of ys){
    observed.push(delta<=0?delta:c<=cap?Math.min(delta,cap-c):0);
  }
  return interval(Math.min(...observed),Math.max(...observed));
}
function sourceRange(soldier,profile,initial){
  const bands=profile
    ?(initial?profile.initialStatsBeforeTraits:profile.currentStatsBeforeTraits)
    :soldier?{min:soldier.minStats,max:soldier.maxStats}:null;
  return fromBands(bands);
}
export function createStatEnvelope(data,profileId,{state=null}={}){
  if(state?.exactStats&&state.currentStats&&state.initialStats){
    const current=copy(state.currentStats),initial=copy(state.initialStats);
    return {kind:"ready",low:current,high:{...current},
      initialLow:initial,initialHigh:{...initial},
      source:"실제 세이브 확인값",sourceExact:true,randomSteps:[],
      notes:["이후 전투 성장과 새 장비 획득은 반영하지 않음"]};
  }
  if(state&&state.sourceId===null){
    // A live soldier with incomplete save stats must NOT revert to the
    // random body creation range and masquerade as the exact same person.
    return {kind:"unverified",reason:"실제 세이브 대원의 초기·현재 능력치가 완전하게 추출되지 않았습니다."};
  }
  const profile=data.profiles?.find(x=>x.id===profileId);
  const type=profile?.soldierType||
    (String(profileId||"").startsWith("base:")?profileId.slice(5):profileId);
  const soldier=data.soldiers?.find(x=>x.id===type);
  const c=sourceRange(soldier,profile,false),i=sourceRange(soldier,profile,true);
  if(!c||!i)return {kind:"unverified",reason:"선택된 획득형의 최소·최대 생성 능력치를 찾을 수 없습니다."};
  return {kind:"ready",low:c.min,high:c.max,initialLow:i.min,initialHigh:i.max,
    source:"원본 병종·획득형 초기 생성 범위",sourceExact:false,randomSteps:[],
    notes:["초기 생성값과 이후 전투 성장의 상관관계는 보수적으로 독립 취급"]};
}
export function advanceStatEnvelope(rule,before,data,state){
  if(before?.kind!=="ready")return before;
  const newType=rule.producedSoldierType||state.soldierType;
  const soldier=data.soldiers?.find(x=>x.id===newType);
  if(!soldier&&[rule.lowerBoundAtMinStats,rule.upperBoundAtMaxStats,rule.upperBoundAtStatCaps]
    .some(Boolean))return {kind:"unverified",reason:"변신 대상 병종의 능력치 최소·최대/성장캡 규칙 누락"};
  const low={},high={},initialLow=copy(before.initialLow),
    initialHigh=copy(before.initialHigh);
  let random=false;
  for(const k of STAT_KEYS){
    const cur=interval(before.low[k],before.high[k]);
    const initial=interval(before.initialLow[k],before.initialHigh[k]);
    const gained=interval(cur.low-initial.high,cur.high-initial.low);
    const flat=interval(rule.flatMin?.[k],rule.flatMax?.[k]);
    const overallRnd=interval(rule.percentMin?.[k],rule.percentMax?.[k]);
    const gainedRnd=interval(rule.percentGainedMin?.[k],rule.percentGainedMax?.[k]);
    let delta=plus(
      interval(rule.flatOverallStatChange?.[k],rule.flatOverallStatChange?.[k]),
      flat,
      pct(cur,interval(rule.percentOverallStatChange?.[k],rule.percentOverallStatChange?.[k])),
      pct(cur,overallRnd),
      pct(gained,interval(rule.percentGainedStatChange?.[k],rule.percentGainedStatChange?.[k])),
      pct(gained,gainedRnd)
    );
    if(flat.low!==flat.high||overallRnd.low!==overallRnd.high||
      gainedRnd.low!==gainedRnd.high)random=true;
    if(k==="bravery")delta=interval(braveryRound(delta.low),braveryRound(delta.high));
    if(rule.lowerBoundAtMinStats){
      const floor=n(soldier?.minStats?.[k]);
      delta={low:Math.max(delta.low,floor-cur.high),
        high:Math.max(delta.high,floor-cur.low)};
    }
    if(rule.upperBoundAtMaxStats||rule.upperBoundAtStatCaps){
      const cap=n(rule.upperBoundAtMaxStats?soldier?.maxStats?.[k]:soldier?.statCaps?.[k]);
      const sameType=newType===state.soldierType;
      const soft=Number(rule.upperBoundType)===1||
        ((rule.upperBoundType==null||n(rule.upperBoundType)===0)&&sameType);
      if(soft)delta=softLimit(cur,delta,cap);
      else delta={low:Math.min(delta.low,cap-cur.high),
        high:Math.min(delta.high,cap-cur.low)};
    }
    let result=interval(cur.low+delta.low,cur.high+delta.high);
    if(rule.rerollStats?.[k]){
      if(!soldier)return {kind:"unverified",reason:"재굴림 대상 병종의 생성 능력치 규칙 누락"};
      result=interval(soldier.minStats?.[k],k==="psiSkill"
        ?soldier.minStats?.[k]:soldier.maxStats?.[k]);
      random=random||result.low!==result.high;
    }
    low[k]=result.low;high[k]=result.high;
  }
  if(rule.createsClone){
    // Soldier::transform operates on a new clone's destination stats.
    // The clone is a distinct person with its own initial stats.
    Object.assign(initialLow,low);Object.assign(initialHigh,high);
  }
  return {kind:"ready",low,high,initialLow,initialHigh,
    source:before.source,sourceExact:before.sourceExact&&!random&&
      STAT_KEYS.every(k=>low[k]===high[k]),
    randomSteps:random?[...before.randomSteps,rule.id]:[...before.randomSteps],
    notes:[...before.notes]};
}
export function effectiveEnvelope(bounds,state,data,options={}){
  if(bounds?.kind!=="ready")return {kind:"unverified",reason:bounds?.reason||"능력치 범위 없음"};
  if(Object.prototype.hasOwnProperty.call(options.commendations||{},
    "STR_MEDAL_WEAPON_PROFICIENCY_NAME")){
    // OXCE distributes weapon mastery tiers across separate weapon medals.
    // A single aggregated medal level cannot reproduce its actual stat bonus.
    return {kind:"unverified",reason:"무기 숙련 훈장의 무기별 등급 증거가 부족해 실효 능력치를 확정할 수 없음"};
  }
  const armorId=options.armorId||state.armorId;
  const armor=data.armorCatalog?.find(a=>a.id===armorId);
  if(armorId&&!armor)return {kind:"unverified",reason:"현재 방어구 "+armorId+"의 능력치 보정 색인 없음"};
  if(armor&&!(armor.soldierTypes||[]).includes(state.soldierType))
    return {kind:"unverified",reason:"변신 후 병종에 착용할 수 없는 방어구 "+armorId};
  const bonuses=bonusStats(state,data,options);
  const lo={},hi={};
  for(const k of STAT_KEYS){
    const add=n(bonuses[k])+n(armor?.stats?.[k]);
    lo[k]=Math.max(k==="health"?1:0,bounds.low[k]+add);
    hi[k]=Math.max(k==="health"?1:0,bounds.high[k]+add);
  }
  return {kind:"ready",low:lo,high:hi,armorId:armorId||null,
    note:"현재 지정된 SoldierBonus와 방어구 한 벌의 효과만 포함"};
}
