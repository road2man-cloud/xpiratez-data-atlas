// Exact finite marginal propagation through the CHOSEN registered transformation
// order, conditional on independent Soldier constructor rolls and on every
// non-stat requirement being met. This is not a research feasibility proof,
// combat-growth forecast or global optimal-route optimizer.
import {BIRTH_STAT_KEYS,newbornRawPairs,distributionMoment,distributionQuantile}
  from './birth-rng-math.js';
import {initialState,bonusStats} from './eligibility.js';
import {conditionBirthPairs} from './birth-selection.js';
const num=x=>Number.isFinite(x)?x:0;
const int=x=>Number.isSafeInteger(x);
const add=(map,id,p)=>map.set(id,(map.get(id)||0)+p);
const sort=m=>[...m].sort((a,b)=>a[0]-b[0]);
const unavailable=(reason,stages=[])=>({kind:'unverified',reason,stages});
const epsilon=1e-9;
const maxFloor=k=>k==='health'?1:0;
function range(lo,hi){
  if(!int(lo)||!int(hi)||hi<lo||hi-lo>5000)
    throw Error('변신 난수 범위 오류: '+lo+'~'+hi);
  return Array.from({length:hi-lo+1},(_,i)=>lo+i);
}
const value=(object,key)=>object?.[key]??0;
function pairsNormalized(entries){
  const map=new Map();
  for(const [raw,initial,p] of entries){
    if(!int(raw)||!int(initial)||!Number.isFinite(p)||p<0)
      throw Error('원시 능력치 결합분포가 유효하지 않음');
    add(map,raw+'|'+initial,p);
  }
  const mass=[...map.values()].reduce((a,b)=>a+b,0);
  if(mass<=0||Math.abs(mass-1)>epsilon)
    throw Error('출생 결합분포 확률 합계 오류');
  return [...map].map(([id,p])=>[...id.split('|').map(Number),p]);
}
function filterGate(pairs,key,rule,bonus){
  const min=value(rule.requiredMinStats,key);
  const max=rule.requiredMaxStats?.[key]??9999;
  if(!int(min)||!int(max))throw Error('훈련 전 능력치 요구값 오류: '+key);
  const withBonus=(raw,include)=>{
    if(!include)return raw;
    const total=Math.max(maxFloor(key),raw+bonus);
    return key==='psiSkill'&&raw<=0&&total>0?raw:total;
  };
  const keep=pairs.filter(([raw])=>{
    const low=withBonus(raw,rule.includeBonusesForMinStats);
    const high=withBonus(raw,rule.includeBonusesForMaxStats);
    return low>=min&&high<=max;
  });
  const mass=keep.reduce((s,x)=>s+x[2],0);
  return {probability:mass,pairs:mass>0?
    keep.map(([raw,initial,p])=>[raw,initial,p/mass]):[]};
}
function growPaired(pairs,cap,{attempts,kernel},maxStates){
  if(!int(cap)||!int(attempts)||attempts<0||attempts>200||
    !Array.isArray(kernel)||!kernel.length||
    kernel.some(x=>!Array.isArray(x)||x.length!==2||!int(x[0])||x[0]<0||
      !Number.isFinite(x[1])||x[1]<0)||
    Math.abs(kernel.reduce((s,x)=>s+x[1],0)-1)>epsilon)
    throw Error('가정형 성장 횟수·전투캡·증가 커널 오류');
  let state=pairs;
  for(let i=0;i<attempts;i++){
    const next=new Map();
    for(const [raw,initial,prior] of state){
      if(raw>=cap){add(next,raw+'|'+initial,prior);continue;}
      for(const [gain,p] of kernel)add(next,(raw+gain)+'|'+initial,prior*p);
    }
    if(next.size>maxStates)throw Error('성장 전파 상태 공간 초과');
    const mass=[...next.values()].reduce((s,x)=>s+x,0);
    if(Math.abs(mass-1)>1e-7)throw Error('성장 결합분포 확률 질량 보존 실패');
    state=[...next].map(([id,p])=>[...id.split('|').map(Number),p/mass]);
  }
  return state;
}
function applyStat(rule,key,pairs,body,oldBody,maxStates){
  const flat=range(value(rule.flatMin,key),value(rule.flatMax,key));
  const pct=range(value(rule.percentMin,key),value(rule.percentMax,key));
  const earned=range(value(rule.percentGainedMin,key),value(rule.percentGainedMax,key));
  if(flat.length*pct.length*earned.length>100000)
    throw Error('하나의 능력치에서 난수 조합 예산 초과');
  const reroll=rule.rerollStats?.[key]===true?
    (key==='psiSkill'?[value(body.minStats,key)]:key==='bravery'?
      range(Math.trunc(value(body.minStats,key)/10),Math.trunc(value(body.maxStats,key)/10)).map(x=>x*10):
      range(value(body.minStats,key),value(body.maxStats,key))):null;
  const out=new Map();
  const targetType=rule.producedSoldierType||oldBody.id;
  const soft=Number(rule.upperBoundType)===1||
    ((rule.upperBoundType==null||Number(rule.upperBoundType)===0)&&targetType===oldBody.id);
  const minBound=rule.lowerBoundAtMinStats?body.minStats?.[key]:null;
  const maxBound=rule.upperBoundAtMaxStats?body.maxStats?.[key]:
    rule.upperBoundAtStatCaps?body.statCaps?.[key]:null;
  if(minBound!=null&&!int(minBound)||maxBound!=null&&!int(maxBound))
    throw Error('목표 병종 상한/하한 원본 누락: '+key);
  for(const [current,initial,prior] of pairs){
    for(const a of flat)for(const b of pct)for(const c of earned){
      let delta=value(rule.flatOverallStatChange,key)+a+
        Math.trunc(current*value(rule.percentOverallStatChange,key)/100)+
        Math.trunc(current*b/100)+
        Math.trunc((current-initial)*value(rule.percentGainedStatChange,key)/100)+
        Math.trunc((current-initial)*c/100);
      if(key==='bravery')delta=Math.trunc((delta+(delta<0?-5:5))/10)*10;
      if(minBound!=null)delta=Math.max(delta,minBound-current);
      if(maxBound!=null){
        if(soft){if(delta>0)delta=current<=maxBound?Math.min(delta,maxBound-current):0;}
        else delta=Math.min(delta,maxBound-current);
      }
      const changed=current+delta;
      const outcomes=reroll||[changed];
      const probability=prior/(flat.length*pct.length*earned.length*outcomes.length);
      for(const target of outcomes){
        if(!int(target)||target<maxFloor(key))
          throw Error('변신이 유효하지 않은 원시 능력치 생성: '+rule.id+'/'+key);
        add(out,target+'|'+initial,probability);
      }
    }
  }
  if(out.size>maxStates)throw Error('변신 결합분포 상태 공간 초과: '+rule.id+'/'+key);
  const mass=[...out.values()].reduce((a,b)=>a+b,0);
  if(Math.abs(mass-1)>1e-7)throw Error('변신 분포 확률 질량 보존 실패: '+rule.id+'/'+key);
  return [...out].map(([id,p])=>[...id.split('|').map(Number),p/mass]);
}
function effective(key,raw,bonus){
  const result=key==='psiSkill'&&raw<=0?raw:raw+bonus;
  return Math.max(maxFloor(key),result);
}
function asScalar(pairs,key,bonus){
  const map=new Map();
  for(const [raw,,p] of pairs)add(map,effective(key,raw,bonus),p);
  return sort(map);
}
function combine(all,maxStates=30000){
  let sum=[[0,1]];
  for(const key of BIRTH_STAT_KEYS){
    const next=new Map();
    for(const [a,p] of sum)for(const [b,q] of all[key])add(next,a+b,p*q);
    if(next.size>maxStates)throw Error('12종 합계 분포 상태 공간 초과');
    sum=sort(next);
  }
  return sum;
}
function finalize(pairs,state,data,eligibility,stages,growthStages,birthSelection){
  const bonus=bonusStats(state,data),perStat={},stats={},rawStats={},bands={};
  for(const key of BIRTH_STAT_KEYS){
    const b=num(bonus[key]);
    const d=asScalar(pairs[key],key,b);
    const raw=new Map();
    for(const [value,,prob] of pairs[key])add(raw,value,prob);
    perStat[key]=d;
    rawStats[key]=distributionMoment(sort(raw));
    stats[key]=distributionMoment(d);
    bands[key]={min:d[0][0],p10:distributionQuantile(d,.1),
      p50:distributionQuantile(d,.5),p90:distributionQuantile(d,.9),
      max:d.at(-1)[0]};
  }
  const sum=combine(perStat);
  return {kind:'conditional-route-distribution',profileId:state.sourceId,
    finalSoldierType:state.soldierType,bonus,stats,rawStats,bands,perStat,
    totalDistribution:sum,expectedTotal:distributionMoment(sum),
    totalBand:{min:sum[0][0],p10:distributionQuantile(sum,.1),
      p50:distributionQuantile(sum,.5),p90:distributionQuantile(sum,.9),max:sum.at(-1)[0]},
    statGateProbability:eligibility,
    birthSelectionProbability:birthSelection.selectionProbability,
    jointStatEligibilityProbability:birthSelection.selectionProbability*eligibility,
    birthSelectionCount:birthSelection.constrained,
    birthSelectionMode:birthSelection.mode,
    stages,growthStages,
    caveat:'선택된 연구·획득·시술 순서의 비능력치 요구가 모두 충족된다는 조건. 출생 RNG·시술 난수 독립을 가정. '+
      (growthStages.length?'지정한 가상 전투 성장 횟수·성공률을 반영했으나 OXCE 경험치 실측 모델이 아님. ':'전투 성장 시행은 0회. ')+
      '훈장, 자원 소모 및 경로 최적성은 포함하지 않음'};
}
// Returns an exact conditional discrete distribution over twelve independent
// stats for each source-compatible registered single-soldier transform path.
export function registeredRouteDistribution(data,profileId,candidate,{maxStates=20000,growthSchedule=[],birthSelection=null}={}){
  const profile=data?.profiles?.find(p=>p.id===profileId);
  if(!profile||!candidate||candidate.profileId!==profileId)
    return unavailable('선택 출생처와 등록 후보의 원본 연결 없음');
  const transforms=(candidate.steps||[]).filter(s=>s.type==='transform').map(s=>s.transform);
  if(JSON.stringify(transforms)!==JSON.stringify(candidate.transforms||[]))
    return unavailable('서명된 시술 순서와 등록 경로 불일치');
  if(!int(maxStates)||maxStates<1)return unavailable('상태 공간 상한 오류');
  if(!Array.isArray(growthSchedule)||growthSchedule.length>transforms.length+1||
    growthSchedule.some(x=>!int(x?.beforeTransform)||x.beforeTransform<0||
      x.beforeTransform>transforms.length||!x.stats||typeof x.stats!=='object'||
      Object.keys(x.stats).some(key=>!BIRTH_STAT_KEYS.includes(key))))
    return unavailable('가상 성장 단계·능력치 입력 오류');
  try{
    let pairs=newbornRawPairs(data,profileId);
    const state=initialState(data,profile,{band:'min'});
    const initialBonus=bonusStats(state,data);
    if(BIRTH_STAT_KEYS.some(key=>num(initialBonus[key])!==num(profile.traitStats?.[key])))
      return unavailable('초기 영구 보너스 색인과 원본 이력 불일치');
    const selectedBirth=conditionBirthPairs(pairs,initialBonus,birthSelection);
    if(selectedBirth.kind==='unverified'||selectedBirth.kind==='birth-incompatible')
      return {kind:selectedBirth.kind,reason:selectedBirth.reason,
        selectionProbability:selectedBirth.selectionProbability??null,
        impossibleStat:selectedBirth.key??null,
        possible:selectedBirth.possible??null};
    pairs=selectedBirth.pairs;
    const stages=[],growthStages=[];
    let type=profile.soldierType,survival=1;
    const rules=new Map(data.transformations.map(r=>[r.id,r]));
    const bodies=new Map(data.soldiers.map(b=>[b.id,b]));
    const growAt=at=>{
      for(const item of growthSchedule.filter(x=>x.beforeTransform===at)){
        const currentBody=bodies.get(type);
        if(!currentBody)throw Error('성장 시점의 병종 원본 누락');
        for(const [key,spec] of Object.entries(item.stats)){
          pairs[key]=growPaired(pairs[key],currentBody.statCaps?.[key],spec,maxStates);
        }
        growthStages.push({beforeTransform:at,body:type,stats:Object.keys(item.stats)});
      }
    };
    growAt(0);
    for(const [index,id] of transforms.entries()){
      const rule=rules.get(id),oldBody=bodies.get(type);
      if(!rule||!oldBody)return unavailable('변신/현재 병종 원본 누락: '+id,stages);
      if(rule.createsClone||rule.producedItem)return unavailable('동일 병사 이력이 끝나는 변신: '+id,stages);
      if(!(rule.allowedSoldierTypes||[]).includes(type)||
        (rule.forbiddenSoldierTypes||[]).includes(type))
        return unavailable('병종 허용 규칙과 기록된 순서 불일치: '+id,stages);
      if((rule.requiredPreviousTransformations||[]).some(old=>!state.history.has(old))||
        (rule.forbiddenPreviousTransformations||[]).some(old=>state.history.has(old)))
        return unavailable('선행/금지 훈련 이력이 일치하지 않음: '+id,stages);
      const nextType=rule.producedSoldierType||type,body=bodies.get(nextType);
      if(!body)return unavailable('변신 후 병종 원본 누락: '+id,stages);
      const previousBonus=bonusStats(state,data);
      let stageChance=1;
      for(const key of BIRTH_STAT_KEYS){
        const passed=filterGate(pairs[key],key,rule,num(previousBonus[key]));
        stageChance*=passed.probability;
        if(passed.probability<=0)
          return {kind:'stat-gated',reason:'능력치 요건 충족 확률 0: '+id+'/'+key,
            statGateProbability:0,stages};
        pairs[key]=passed.pairs;
      }
      survival=Math.max(0,Math.min(1,survival*stageChance));
      for(const key of BIRTH_STAT_KEYS)
        pairs[key]=applyStat(rule,key,pairs[key],body,oldBody,maxStates);
      if(rule.reset){state.history.clear();state.bonusCounts.clear();}
      else for(const erased of rule.removeTransformations||[]){
        const count=state.history.get(erased)||0;
        if(!count)continue;
        state.history.delete(erased);
        const priorRule=rules.get(erased);
        if(priorRule?.soldierBonusType){
          const bonusId=priorRule.soldierBonusType;
          const remaining=(state.bonusCounts.get(bonusId)||0)-count;
          if(remaining>0)state.bonusCounts.set(bonusId,remaining);
          else state.bonusCounts.delete(bonusId);
        }
      }
      state.history.set(id,(state.history.get(id)||0)+1);
      if(rule.soldierBonusType)
        state.bonusCounts.set(rule.soldierBonusType,(state.bonusCounts.get(rule.soldierBonusType)||0)+1);
      state.bonusIds=new Set(state.bonusCounts.keys());
      state.soldierType=nextType;
      stages.push({id,from:type,to:nextType,statGateProbability:stageChance,
        cumulativeStatGateProbability:survival,reset:rule.reset===true,
        removed:rule.removeTransformations||[]});
      type=nextType;
      growAt(index+1);
    }
    return finalize(pairs,state,data,survival,stages,growthStages,selectedBirth);
  }catch(error){return unavailable(error.message);}
}
