// Exact finite-distribution model for the initial Soldier constructor's per-stat rolls.
// Applies a spawnedSoldier currentStats template and inherited SoldierBonuses once.
// This is ONLY a newborn distribution: combat growth, conversions and random events
// are separate stochastic processes and are not inferred from these results.
export const BIRTH_STAT_KEYS=Object.freeze([
  "tu","stamina","health","bravery","reactions","firing",
  "throwing","melee","strength","psiStrength","psiSkill","mana"
]);
const cached=new WeakMap();
const finiteInteger=x=>Number.isSafeInteger(x);
const countOf=(map,key,weight)=>map.set(key,(map.get(key)||0)+weight);
function sorted(map){return [...map].sort((a,b)=>a[0]-b[0]);}
function statRolls(body,profile,key){
  const start=body?.minStats?.[key],finish=body?.maxStats?.[key];
  if(!finiteInteger(start)||!finiteInteger(finish)||finish<start)
    throw Error("병종 출생 RNG 범위 누락·역전: "+profile.id+"/"+key);
  const overridden=profile.currentStatsOverride?.[key];
  if(overridden!==undefined&&overridden!==0){
    if(!finiteInteger(overridden))throw Error("출생 템플릿 덮어쓰기 값 오류: "+profile.id+"/"+key);
    return [overridden===-1?0:overridden];
  }
  if(key==="psiSkill")return [start]; // Soldier::Soldier: minStats.psiSkill, never rolled
  if(key==="bravery"){
    const lo=Math.trunc(start/10),hi=Math.trunc(finish/10);
    if(hi<lo)throw Error("용기 추첨 범위 오류: "+profile.id);
    return Array.from({length:hi-lo+1},(_,i)=>(lo+i)*10);
  }
  if(finish-start>5000)throw Error("출생 RNG 추첨 범위 비정상: "+profile.id+"/"+key);
  return Array.from({length:finish-start+1},(_,i)=>start+i);
}
function effectiveRoll(raw,key,bonus){
  // SoldierBonuses are applied to effective stats only; they do not change raw
  // training caps or permit PsiSkill to become positive when raw skill <= 0.
  const sum=key==="psiSkill"&&raw<=0?raw:raw+bonus;
  return Math.max(key==="health"?1:0,sum);
}
function statDistribution(body,profile,key){
  const rolls=statRolls(body,profile,key),bonus=profile.traitStats?.[key]??0;
  if(!finiteInteger(bonus)||!rolls.length)
    throw Error("출생 영구 보너스 또는 RNG 값 오류: "+profile.id+"/"+key);
  const prob=1/rolls.length,weights=new Map();
  for(const raw of rolls)countOf(weights,effectiveRoll(raw,key,bonus),prob);
  return sorted(weights);
}
export function distributionMoment(entries){
  if(!entries?.length)throw Error("비어 있는 출생 분포");
  return entries.reduce((sum,[value,prob])=>sum+value*prob,0);
}
export function distributionQuantile(entries,probability){
  if(probability<0||probability>1)throw Error("유효하지 않은 분위수");
  let cumulative=0;
  for(const [value,weight] of entries){
    cumulative+=weight;
    if(cumulative>=probability-1e-12)return value;
  }
  return entries.at(-1)[0];
}
function convolve(a,b,profileId){
  const out=new Map();
  for(const [n,p] of a)for(const [m,q] of b)countOf(out,n+m,p*q);
  if(out.size>5000)throw Error("출생 총합 분포 복잡도 상한 초과: "+profileId);
  return sorted(out);
}
function sumProbability(entries){
  return entries.reduce((sum,[,prob])=>sum+prob,0);
}
export function newbornDistribution(data,profileId){
  if(!data||typeof data!=="object")throw Error("병종 DB 원본 없음");
  let memo=cached.get(data);
  if(!memo){memo=new Map();cached.set(data,memo);}
  if(memo.has(profileId))return memo.get(profileId);
  const profile=data.profiles?.find(p=>p.id===profileId);
  const body=data.soldiers?.find(s=>s.id===profile?.soldierType);
  if(!profile||!body)throw Error("출생처/병종 원본 불일치: "+profileId);
  const distributions={},stats={},bands={};
  let totalDist=[[0,1]];
  for(const key of BIRTH_STAT_KEYS){
    const d=statDistribution(body,profile,key);
    distributions[key]=d;
    stats[key]=distributionMoment(d);
    bands[key]={min:d[0][0],p10:distributionQuantile(d,0.1),
      p50:distributionQuantile(d,0.5),p90:distributionQuantile(d,0.9),
      max:d.at(-1)[0]};
    totalDist=convolve(totalDist,d,profileId);
    // The source index holds the clamped range; reject stale/reinterpreted rules.
    const indexed=profile.effectiveStats;
    if(!indexed||bands[key].min!==indexed.min?.[key]||bands[key].max!==indexed.max?.[key])
      throw Error("출생처 색인과 엔진 추첨 범위 불일치: "+profileId+"/"+key);
  }
  const total=distributionMoment(totalDist);
  const probabilities=sumProbability(totalDist);
  if(Math.abs(probabilities-1)>1e-9||!Number.isFinite(total))
    throw Error("출생 확률 합계 검증 실패: "+profileId);
  const out={kind:"newborn-uniform-model",profileId,stats,total,bands,
    totalBand:{min:totalDist[0][0],p10:distributionQuantile(totalDist,0.1),
      p50:distributionQuantile(totalDist,0.5),
      p90:distributionQuantile(totalDist,0.9),max:totalDist.at(-1)[0]},
    distributions,totalDistribution:totalDist};
  memo.set(profileId,out);
  return out;
}
// Joint raw (current, initial) rolls for the SAME newly created soldier.
// CurrentStats overrides may replace only the current value; cloning templates
// can also set a fixed initial value. We refuse a joint distribution when the
// runtime index does not establish either relationship.
export function newbornRawPairs(data,profileId){
  const profile=data?.profiles?.find(x=>x.id===profileId);
  const body=data?.soldiers?.find(x=>x.id===profile?.soldierType);
  if(!profile||!body)throw Error('원본 출생처·병종 누락: '+profileId);
  const out={};
  for(const key of BIRTH_STAT_KEYS){
    const base=statRolls(body,{id:profile.id,currentStatsOverride:null},key);
    const current=statRolls(body,profile,key);
    const init=profile.initialStatsBeforeTraits;
    const projected=profile.currentStatsBeforeTraits;
    const initialFixed=finiteInteger(init?.min?.[key])&&
      init.min[key]===init?.max?.[key];
    const initialFromBase=init?.min?.[key]===base[0]&&
      init?.max?.[key]===base.at(-1);
    if(!initialFixed&&!initialFromBase)
      throw Error('초기/현재 원시값 연동 근거 누락: '+profile.id+'/'+key);
    if(current.length!==1&&current.length!==base.length)
      throw Error('출생 현재값과 생성 난수 대응 불명확: '+profile.id+'/'+key);
    if(current[0]!==projected?.min?.[key]||
      current.at(-1)!==projected?.max?.[key])
      throw Error('출생 현재 원시 분포 색인 불일치: '+profile.id+'/'+key);
    const weights=new Map();
    for(let i=0;i<base.length;i++){
      const raw=current.length===1?current[0]:current[i];
      const first=initialFixed?init.min[key]:base[i];
      const id=raw+'|'+first;
      weights.set(id,(weights.get(id)||0)+1/base.length);
    }
    out[key]=[...weights].map(([id,prob])=>{
      const [raw,initial]=id.split('|').map(Number);
      return [raw,initial,prob];
    });
  }
  return out;
}
export function newbornTailChance(roll,minimumTotal){
  if(!roll?.totalDistribution||!Number.isSafeInteger(minimumTotal))return null;
  return Math.max(0,Math.min(1,roll.totalDistribution.reduce((sum,[n,p])=>
    sum+(n>=minimumTotal?p:0),0)));
}
export function newbornPairChance(left,right){
  if(!left?.totalDistribution||!right?.totalDistribution)return null;
  // Strict win probability, two independently generated recruits; ties separate.
  const a=left.totalDistribution,b=right.totalDistribution;
  let rightIndex=0,rightLess=0,win=0,tie=0;
  for(const [value,prob] of a){
    while(rightIndex<b.length&&b[rightIndex][0]<value)
      rightLess+=b[rightIndex++][1];
    win+=prob*rightLess;
    if(rightIndex<b.length&&b[rightIndex][0]===value)
      tie+=prob*b[rightIndex][1];
  }
  const lose=Math.max(0,1-win-tie);
  if(win<0||win>1+1e-9||tie<0||lose>1+1e-9)
    throw Error("두 출생처 확률 계산 오류");
  return {win,tie,lose};
}
