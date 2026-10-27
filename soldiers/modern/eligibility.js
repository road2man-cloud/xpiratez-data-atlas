// OXCE 8.7.x transformation gate model, generated X-Piratez 2.1 rules.
// Distinguish a proven engine rejection from a future condition and an exact approval.
// This module is also imported directly by Node regression tests.
export const STAT_KEYS=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];
const arr=x=>Array.isArray(x)?x:[];
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const uniq=a=>[...new Set(a.filter(Boolean))];
const copies=x=>Object.fromEntries(Object.entries(x||{}).map(([k,v])=>[k,v]));

const reverseResearchCache=new WeakMap();
function reverseResearch(rules){
  if(reverseResearchCache.has(rules))return reverseResearchCache.get(rules);
  const bypass=new Map(),reenablers=new Map();
  const add=(map,id,source)=>{if(typeof id!=="string")return;const set=map.get(id)||new Set();set.add(source);map.set(id,set);};
  for(const [source,rule] of Object.entries(rules)){
    for(const id of [...arr(rule.unlocks),...arr(rule.getOneFree)])add(bypass,id,source);
    for(const value of Object.values(rule.getOneFreeProtected||{}))for(const id of typeof value==="string"?[value]:arr(value))add(bypass,id,source);
    for(const id of arr(rule.reenables))add(reenablers,id,source);
  }
  const index={bypass,reenablers};reverseResearchCache.set(rules,index);return index;
}
export function researchPlan(ids,rules={},options={}){
  // This is a conservative research *feasibility* plan. Engine
  // getAvailableResearchProjects can bypass dependencies through unlocks,
  // and addFinishedResearch can grant zero-cost researches, getOneFree and
  // mission/event flags. A direct dependency graph is not always mandatory.
  const goal=uniq(arr(ids)),prior=new Set(arr(options.researched));
  const disabled=new Set(arr(options.disabled)),rev=reverseResearch(rules);
  const nodes=new Set(),dependencies=new Map(),visiting=new Set(),warnings=[],blocked=[],uncertain=[];
  function gather(id){
    // STR_UNAVAILABLE is an internal sentinel, not a research project.
    // It cannot be satisfied by normal research unlocks or zero-cost events.
    if(id==="STR_UNAVAILABLE"){blocked.push("일반 캠페인에서 실행할 수 없는 내부 전용 연구: STR_UNAVAILABLE");return;}
    if(prior.has(id)){nodes.add(id);return;}
    if(nodes.has(id))return;
    const rule=rules[id];
    if(!rule){uncertain.push("연구 원본 누락: "+id);return;}
    if(visiting.has(id)){uncertain.push("연구 선행 경로 순환: "+id);return;}
    const viaReenable=[...(rev.reenablers.get(id)||[])];
    if(disabled.has(id)){
      if(viaReenable.length)uncertain.push("현재 폐쇄된 "+id+"의 재활성화 연구: "+viaReenable.join(", "));
      else blocked.push("현재 세이브에서 폐쇄된 연구: "+id);
    }
    visiting.add(id);
    const hard=arr(rule.requires);
    const possibleUnlocks=[...(rev.bypass.get(id)||[])];
    const deps=possibleUnlocks.length?[]:arr(rule.dependencies);
    if(possibleUnlocks.length&&arr(rule.dependencies).length){
      uncertain.push(id+"의 직접 선행 또는 우회 해금: "+possibleUnlocks.slice(0,4).join(", "));
    }
    const needed=uniq([...hard,...deps]);
    for(const req of needed)gather(req);
    dependencies.set(id,needed);
    visiting.delete(id);
    nodes.add(id);
    if(rule.needItem)warnings.push(id+" · 연구 표본 "+(rule.neededItem||id));
    if(arr(rule.requiresBaseFunc).length)warnings.push(id+" · 기지 기능 "+rule.requiresBaseFunc.join(", "));
    if(num(rule.cost)===0)uncertain.push(id+" · 자동·이벤트 연구 발생 시점");
  }
  for(const id of goal)gather(id);
  // A completed research may have disabled a requested NEW research even if
  // that older research is unrelated to the target's dependency closure.
  for(const id of prior){
    for(const target of arr(rules[id]?.disables)){
      if(!nodes.has(target)||prior.has(target))continue;
      const revivers=[...(rev.reenablers.get(target)||[])];
      if(revivers.length)uncertain.push("기존 "+id+" 연구가 폐쇄한 "+target+"의 재활성화: "+revivers.slice(0,4).join(", "));
      else blocked.push("기존 "+id+" 연구가 "+target+"을 폐쇄함");
    }
  }
  const edges=new Map([...nodes].map(id=>[id,new Set()]));
  for(const [id,reqs] of dependencies)for(const req of reqs)if(nodes.has(req))edges.get(req)?.add(id);
  for(const id of nodes){
    for(const target of arr(rules[id]?.disables)){
      if(!nodes.has(target)||target===id)continue;
      const possible=[...(rev.reenablers.get(target)||[])];
      if(prior.has(id)&&!prior.has(target)){
        if(possible.length)uncertain.push(id+"가 폐쇄하는 "+target+"의 재활성화: "+possible.slice(0,4).join(", "));
        else blocked.push("이미 완료된 "+id+"가 연구 "+target+"을 영구 폐쇄함");
      }else if(!prior.has(id)){
        edges.get(target)?.add(id);
      }
    }
  }
  const indegree=new Map([...nodes].map(id=>[id,0]));
  for(const targets of edges.values())for(const id of targets)indegree.set(id,indegree.get(id)+1);
  const ready=[...nodes].filter(id=>indegree.get(id)===0),order=[];
  while(ready.length){
    const id=ready.shift();order.push(id);
    for(const target of edges.get(id)||[]){
      indegree.set(target,indegree.get(target)-1);
      if(!indegree.get(target))ready.push(target);
    }
  }
  if(order.length!==nodes.size){
    const loops=[...nodes].filter(id=>indegree.get(id)>0);
    const escape=loops.some(id=>rev.bypass.has(id)||rev.reenablers.has(id)||
      num(rules[id]?.cost)===0);
    if(escape)uncertain.push("연구 충돌의 이벤트·우회 해금 검증 필요: "+loops.slice(0,8).join(", "));
    else blocked.push("필수 연구 선행·폐쇄 순환: "+loops.slice(0,8).join(", "));
  }
  // An unsatisfied NOMINAL prerequisite is not a permanent impossibility:
  // OXCE events can call addFinishedResearch directly, and unlocked topics
  // can skip dependencies. Protected/getOneFree sources can also be relevant.
  // Thus graph cycles, old disabler history and intermediate closed topics
  // are diagnostic unless all possible grants have been exhaustively ruled out.
  // Treat only *actual disabled goals* (subject to re-enables), internal-only
  // sentinel or simultaneous mutual disables as hard evidence.
  const hard=[];
  if(goal.includes("STR_UNAVAILABLE"))
    hard.push("일반 캠페인에서 사용할 수 없는 내부 전용 연구: STR_UNAVAILABLE");
  for(const id of goal){
    if(!disabled.has(id)||prior.has(id))continue;
    const recover=[...(rev.reenablers.get(id)||[])];
    if(!recover.length)hard.push("현재 세이브에서 직접 요구 연구가 폐쇄됨: "+id);
  }
  if(options.goalSemantics==="simultaneous"){
    for(let i=0;i<goal.length;i++)for(let j=i+1;j<goal.length;j++){
      const a=goal[i],b=goal[j];
      const conflict=arr(rules[a]?.disables).includes(b)||arr(rules[b]?.disables).includes(a);
      if(!conflict)continue;
      if(rev.reenablers.has(a)||rev.reenablers.has(b))
        uncertain.push("동시 요구 연구 "+a+" / "+b+"가 서로 폐쇄되지만 재활성화 경로가 있음");
      else hard.push("동시에 보유할 수 없는 연구 플래그: "+a+" / "+b);
    }
  }
  const diagnosticBlockers=uniq(blocked).filter(x=>!hard.includes(x));
  const eventSources=options.eventResearchSources||{};
  for(const id of goal){
    const awards=arr(eventSources[id]);
    if(awards.length&&!prior.has(id))
      uncertain.push(id+" · 이벤트 직접 연구 지급 후보 "+awards.slice(0,3).map(x=>x.event||x).join(", ")+" (발생·선택 보장 아님)");
  }
  const conditions=uniq([...warnings,...uncertain,
    ...diagnosticBlockers.map(x=>"명목 선행망에서 충돌 (이벤트·우회 지급 미확정): "+x)]);
  return {kind:hard.length?"blocked":conditions.length?"conditional":"viable",
    blocked:uniq(hard),conditions,diagnosticBlockers,
    required:[...nodes],order,hasAlternateUnlock:uncertain.length>0||diagnosticBlockers.length>0};
}

export function initialState(data,profileOrType,{band="avg",status="healthy",rank}={}){
  const profile=typeof profileOrType==="string"?data.profiles?.find(x=>x.id===profileOrType):profileOrType;
  const soldierType=profile?.soldierType||(typeof profileOrType==="string"&&profileOrType.startsWith("base:")?profileOrType.slice(5):profileOrType)||"";
  const soldier=data.soldiers?.find(x=>x.id===soldierType);
  const starting=profile?.currentStatsBeforeTraits?.[band]||soldier?.[band+"Stats"]||{};
  const initial=profile?.initialStatsBeforeTraits?.[band]||profile?.initialStats?.[band]||starting;
  const originalHistory=profile?.previousTransformations||{};
  return {
    soldierType,sourceId:profile?.id||null,
    armorId:profile?.armor||soldier?.armor||null,
    status,corpseRecovered:false,rank:rank??profile?.rank??0,
    initialStats:copies(initial),currentStats:copies(starting),
    exactStats:false,bonusIds:new Set(arr(profile?.traitNames)),
    history:new Map(Object.entries(originalHistory).filter(([,n])=>num(n)>0)),
    researchIds:new Set(),steps:[],retired:false,
    remarks:[]
  };
}
export function bonusStats(state,data,options={}){
  const result={};
  const names=new Set([...(state.bonusIds||[]),...arr(options.bonusIds)]);
  for(const [medal,rawLevel] of Object.entries(options.commendations||{})){
    const levels=data.commendationIndex?.[medal]?.bonusLevels||[];
    // Weapon mastery uses a separate OXCE per-weapon tier resolver; without
    // those detailed entries it cannot be inferred from a single medal level.
    if(medal==="STR_MEDAL_WEAPON_PROFICIENCY_NAME")continue;
    if(levels.length&&Number.isFinite(Number(rawLevel))&&num(rawLevel)>=0)
      names.add(levels[Math.min(Math.trunc(num(rawLevel)),levels.length-1)]);
  }
  for(const id of names){
    const record=data.bonuses?.find(x=>x.id===id);
    for(const k of STAT_KEYS)result[k]=num(result[k])+num(record?.stats?.[k]);
  }
  return result;
}
export function availableSoldierArmors(state,data){
  return (data.armorCatalog||[]).filter(x=>arr(x.soldierTypes).includes(state.soldierType));
}
export function battleStatsWithEquipment(state,data,options={}){
  const extra=bonusStats(state,data,options);
  const selectedArmor=options.armorId||state.armorId;
  const armor=(data.armorCatalog||[]).find(x=>x.id===selectedArmor);
  if(selectedArmor&&!armor)return {kind:"unverified",reason:"현재 장비 "+selectedArmor+"의 유효 병종·보정이 색인에 없음",stats:null};
  if(armor&&!arr(armor.soldierTypes).includes(state.soldierType))
    return {kind:"blocked",reason:"선택한 방어구가 현재 병종에 허용되지 않음",stats:null};
  const stats={};
  for(const k of STAT_KEYS){
    // OXCE Soldier::prepareStatsWithBonuses:
    // _tmpStatsWithAllBonuses = obeyFixedMinimum(raw + soldier bonuses + armor).
    // It never applies obeyFixedMinimum between soldier and armor bonuses;
    // the special psiSkill gate applies ONLY to _tmpStatsWithSoldierBonuses.
    stats[k]=Math.max(k==="health"?1:0,
      num(state.currentStats?.[k])+num(extra[k])+num(armor?.stats?.[k]));
  }
  const supply=armor?.storeItem&&armor.storeItem!=="STR_NONE"
    ?data.itemSupply?.[armor.storeItem]:null;
  return {kind:armor&&armor.storeItem&&armor.storeItem!=="STR_NONE"?"conditional":"base",
    armorId:armor?.id||null,storeItem:armor?.storeItem||null,
    acquisition:supply||null,stats};
}
export function eligibleTransformation(rule,state,data,options={}){
  const blocked=[],conditions=[],mode=options.mode||"future";
  if(state.retired)blocked.push("병사가 은퇴/아이템으로 전환되어 더는 변신할 수 없음");
  if(arr(rule.requires).includes("STR_UNAVAILABLE"))
    blocked.push("일반 캠페인에서 사용할 수 없는 내부 전용 변신 (STR_UNAVAILABLE)");
  if(!arr(rule.allowedSoldierTypes).includes(state.soldierType))blocked.push("현재 병종 "+state.soldierType+"에 적용할 수 없음");
  if(arr(rule.forbiddenSoldierTypes).includes(state.soldierType))blocked.push("금지 병종: "+state.soldierType);
  const status=state.status||"unknown";
  if(status==="unknown")conditions.push("현재 대원의 부상·생존 상태 확인 필요");
  if(status==="healthy"&&!rule.allowsLiveSoldiers) {
    if(mode==="future"&&(rule.allowsWoundedSoldiers||rule.allowsDeadSoldiers))conditions.push("부상 또는 사망 상태 필요");
    else blocked.push("건강한 병사에게 적용 불가");
  }
  if(status==="wounded"&&!rule.allowsWoundedSoldiers){
    if(mode==="future"&&(rule.allowsLiveSoldiers||rule.allowsDeadSoldiers))conditions.push("회복 또는 사망 상태 필요");
    else blocked.push("부상자에게 적용 불가");
  }
  if(status==="dead"&&!rule.allowsDeadSoldiers)blocked.push("사망자에게 적용 불가");
  if(status==="dead"&&rule.needsCorpseRecovered&&!state.corpseRecovered){
    if(mode==="future")conditions.push("시체 회수 필요");
    else blocked.push("시체 미회수");
  }
  for(const id of arr(rule.requiredPreviousTransformations))if(!state.history?.has(id)){
    if(mode==="current"&&state.historyKnown===false)conditions.push("변신 이력 불완전 · 필수 선행 "+id);
    else blocked.push("필수 선행 변신 없음: "+id);
  }
  // Engine: only THE CANDIDATE's forbiddenPreviousTransformations are checked.
  // Never invent a symmetric exclusion from a previous rule's forbidden list.
  for(const id of arr(rule.forbiddenPreviousTransformations))if(state.history?.has(id))blocked.push("금지된 변신 이력: "+id);
  if(mode==="current"&&state.historyKnown===false)conditions.push("변신 이력 일부 누락 · 배제 완전 검증 불가");
  const soldier=data.soldiers?.find(x=>x.id===state.soldierType);
  if(num(state.rank)<num(rule.minRank)){
    if(mode==="future"&&soldier?.allowPromotion!==false)conditions.push("계급 "+rule.minRank+" 이상 필요");
    else blocked.push("요구 계급 "+rule.minRank+" 미달");
  }
  const extra=bonusStats(state,data,options);
  for(const key of STAT_KEYS){
    const kmin=num(rule.requiredMinStats?.[key]);
    const kmax=rule.requiredMaxStats?.[key]===undefined?9999:num(rule.requiredMaxStats[key]);
    let minValue=num(state.currentStats?.[key])+(rule.includeBonusesForMinStats?num(extra[key]):0);
    let maxValue=num(state.currentStats?.[key])+(rule.includeBonusesForMaxStats?num(extra[key]):0);
    // Soldier::prepareStatsWithBonuses clamps health and prevents a bonus
    // from unlocking psi skill when raw psi skill is not yet trained.
    const floor=key==="health"?1:0;
    if(rule.includeBonusesForMinStats)minValue=Math.max(floor,minValue);
    if(rule.includeBonusesForMaxStats)maxValue=Math.max(floor,maxValue);
    if(key==="psiSkill"&&num(state.currentStats?.psiSkill)<=0){
      if(rule.includeBonusesForMinStats&&minValue>0)minValue=num(state.currentStats.psiSkill);
      if(rule.includeBonusesForMaxStats&&maxValue>0)maxValue=num(state.currentStats.psiSkill);
    }
    if(kmin&&minValue<kmin){
      if(mode==="future"||options.statsKnown===false)conditions.push(key+" "+kmin+" 이상 필요 (현재 기준 "+minValue+")");
      else blocked.push(key+" 최소 "+kmin+" 미달: "+minValue);
    }
    if(maxValue>kmax){
      if(mode==="future"||options.statsKnown===false)conditions.push(key+" "+kmax+" 이하 필요 (현재 기준 "+maxValue+")");
      else blocked.push(key+" 최대 "+kmax+" 초과: "+maxValue);
    }
  }
  if(mode==="current"&&options.statsKnown===false)conditions.push("원본 능력치·초기값 또는 SoldierBonus 근거 미완전");
  const commendations=options.commendations||{};
  for(const [id,level] of Object.entries(rule.requiredCommendations||{})){
    // OXCE Soldier::isEligibleForTransformation iterates owned medal
    // records and requires a type match BEFORE comparing decoration levels.
    // Required level 0 still means "medal must EXIST" (not absent=0).
    const hasMedal=Object.prototype.hasOwnProperty.call(commendations,id)&&
      Number.isFinite(Number(commendations[id]))&&num(commendations[id])>=0;
    if(!hasMedal||num(commendations[id])<num(level)){
      if(mode==="future"||options.medalsKnown===false)conditions.push("필수 훈장 "+id+" 등급 "+level+" 미확인");
      else blocked.push("훈장 미달 "+id+" "+level);
    }
  }
  // A prior transformation only proves its research was available AT THAT TIME.
  // Research disabled later can still coexist with that historical transformation;
  // don't require all historically used research topics simultaneously.
  // Current-eligibility checks only need exact discovered/disabled flags.
  // Research route planning is for FUTURE possibilities, not a prerequisite
  // for a project already visible in the actual save.
  const tech=mode==="current"?{kind:"viable",blocked:[],conditions:[],required:arr(rule.requires),order:[]}:
    researchPlan(arr(rule.requires),data.researchRules,{
      ...options,goalSemantics:"simultaneous",eventResearchSources:data.eventResearchSources
    });
  blocked.push(...tech.blocked);
  conditions.push(...tech.conditions);
  if(mode==="current"){
    for(const id of arr(rule.requires)){
      if(arr(options.disabled).includes(id))blocked.push("현재 연구 영구 폐쇄: "+id);
      if(!arr(options.researched).includes(id))blocked.push("미완료 연구: "+id);
    }
    for(const id of arr(rule.requiresBaseFunc))if(!arr(options.baseFunctions).includes(id)){
      if(options.baseFunctionsKnown===false)conditions.push("기지 기능 "+id+" 확인 불완전");
      else blocked.push("기지 기능 없음: "+id);
    }
    for(const [id,quantity] of Object.entries(rule.requiredItems||{}))if(num(options.items?.[id])<num(quantity)){
      if(options.itemsKnown===false)conditions.push("재료 "+id+" 보유량 불완전");
      else blocked.push("재료 부족: "+id+" ×"+quantity);
    }
    if(options.funds==null){
      if(num(rule.cost)>0)conditions.push("현재 자금 잔액 미확인");
    }else if(num(options.funds)<num(rule.cost))blocked.push("자금 부족: "+rule.cost);
  }else{
    for(const id of arr(rule.requires))if(!arr(options.researched).includes(id))conditions.push("장래 필요 연구: "+id);
    for(const id of arr(rule.requiresBaseFunc))conditions.push("기지 기능: "+id);
    for(const [id,quantity] of Object.entries(rule.requiredItems||{})){
      const supply=data.itemSupply?.[id];
      conditions.push("재료 "+id+" ×"+quantity+(supply?.buyCost>0?" (구매 경로)":supply?.manufacture?.length?" (제조 경로)":" (획득 경로)"));
    }
    if(num(rule.cost)>0)conditions.push("비용 "+rule.cost+" 확보");
  }
  return {kind:blocked.length?"blocked":conditions.length?"conditional":"eligible",
    blockers:uniq(blocked),conditions:uniq(conditions),research:tech};
}

function statChangeEngineEstimate(rule,state,data){
  // OXCE Soldier::calculateStatChanges / UnitStats::percent/softLimit parity
  // for deterministic inputs. For random outputs preserve an uncertainty flag.
  const next=Object.fromEntries(STAT_KEYS.map(k=>[k,num(state.currentStats[k])]));
  const producedType=rule.producedSoldierType||state.soldierType;
  const soldier=data.soldiers?.find(x=>x.id===producedType);
  const sameType=producedType===state.soldierType;
  const softLimit=Number(rule.upperBoundType)===1||
    ((rule.upperBoundType==null||num(rule.upperBoundType)===0)&&sameType);
  let uncertain=false;
  for(const key of STAT_KEYS){
    const current=num(state.currentStats[key]);
    const gained=current-num(state.initialStats?.[key]);
    const range=(minKey,maxKey)=> {
      const lo=num(rule[minKey]?.[key]),hi=num(rule[maxKey]?.[key]);
      if(lo!==hi)uncertain=true; // do not pretend to know the rolled value
      return lo===hi?lo:Math.min(lo,hi);
    };
    let change=num(rule.flatOverallStatChange?.[key])+range("flatMin","flatMax");
    change+=Math.trunc(current*num(rule.percentOverallStatChange?.[key])/100);
    change+=Math.trunc(current*range("percentMin","percentMax")/100);
    change+=Math.trunc(gained*num(rule.percentGainedStatChange?.[key])/100);
    change+=Math.trunc(gained*range("percentGainedMin","percentGainedMax")/100);
    if(key==="bravery"){
      const sign=change<0?-1:1;
      change=Math.trunc((change+sign*5)/10)*10;
    }
    const floor=key==="health"?1:0;
    if(rule.lowerBoundAtMinStats){
      change=Math.max(change,num(soldier?.minStats?.[key])-current);
    }
    if(rule.upperBoundAtMaxStats||rule.upperBoundAtStatCaps){
      const bound=rule.upperBoundAtMaxStats
        ?num(soldier?.maxStats?.[key]):num(soldier?.statCaps?.[key]);
      if(softLimit){
        if(change>0)change=current<=bound?Math.min(change,bound-current):0;
      }else change=Math.min(change,bound-current);
    }
    let value=current+change;
    if(rule.rerollStats?.[key]){
      const lo=num(soldier?.minStats?.[key]),hi=num(soldier?.maxStats?.[key]);
      if(lo!==hi)uncertain=true;
      value=lo; // lower representative only; not an exact outcome if randomized
    }
    next[key]=value;
    if(!Number.isFinite(value)||value<floor)uncertain=true;
  }
  return {stats:next,hasUnmodelled:uncertain};
}
export function applyTransformation(rule,oldState,data,options={}){
  const verdict=eligibleTransformation(rule,oldState,data,options);
  if(verdict.kind==="blocked")return {state:oldState,verdict};
  const clone=!!rule.createsClone;
  const s={...oldState,history:new Map(clone?[]:oldState.history),bonusIds:new Set(clone?[]:oldState.bonusIds),
    researchIds:new Set([...oldState.researchIds,...arr(rule.requires)]),steps:[...oldState.steps,rule.id],
    remarks:[...oldState.remarks]};
  if(rule.reset){s.history.clear();s.bonusIds.clear();}
  else for(const removed of arr(rule.removeTransformations)){
    if(s.history.has(removed)){
      s.history.delete(removed);
      const prevRule=data.transformations?.find(x=>x.id===removed);
      if(prevRule?.soldierBonusType)s.bonusIds.delete(prevRule.soldierBonusType);
    }
  }
  if(!clone)s.history.set(rule.id,(s.history.get(rule.id)||0)+1);
  if(rule.soldierBonusType)s.bonusIds.add(rule.soldierBonusType);
  const estimate=statChangeEngineEstimate(rule,oldState,data);
  s.currentStats=estimate.stats;
  if(clone)s.initialStats=copies(s.currentStats); // Soldier::setBothStats on the newborn clone.
  s.exactStats=!!oldState.exactStats&&!estimate.hasUnmodelled;
  if(estimate.hasUnmodelled)s.remarks.push(rule.id+" · 능력치 엔진 정밀 모의 필요");
  if(rule.producedSoldierType)s.soldierType=rule.producedSoldierType;
  if(s.soldierType!==oldState.soldierType){
    const newRules=data.soldiers?.find(x=>x.id===s.soldierType);
    const ranks=newRules?.raw?.rankStrings;
    // Soldier::performTransformation demotes to rookie for bodies that
    // disallow promotion; otherwise it caps the rank to the new rank list.
    if(newRules?.allowPromotion===false)s.rank=0;
    else if(Array.isArray(ranks)&&ranks.length>0)s.rank=Math.min(s.rank,ranks.length-1);
    else if(!newRules)s.remarks.push(rule.id+" · 병종 변경 후 계급 규칙 미확정");
  }
  if(!rule.keepSoldierArmor){
    const newBody=data.soldiers?.find(x=>x.id===s.soldierType);
    s.armorId=rule.producedSoldierArmor||newBody?.armor||null;
  }
  if(clone||rule.resetRank)s.rank=0;
  if(rule.producedItem)s.retired=true;
  if(s.status==="dead"){
    // Transformation rules alone do not prove that a dead soldier revives.
    // Never auto-chain living training after a corpse transformation.
    s.status="unknown";s.remarks.push(rule.id+" · 이후 생존 상태 재검증 필요");
  }
  return {state:s,verdict};
}

// Over-approximate every possible RuleSoldier type reachable by transformations
// alone, regardless of research, items, rank, status and prerequisite history.
// Because constraints are IGNORED here, a type not in this closure is a
// PROVEN impossibility within the single-soldier transformation rules.
const bodyReachCache=new WeakMap();
export function reachableSoldierTypes(data,initialType){
  let all=bodyReachCache.get(data);
  if(!all){all=new Map();bodyReachCache.set(data,all);}
  if(all.has(initialType))return all.get(initialType);
  const paths=new Map([[initialType,[]]]);
  let changed=true;
  while(changed){
    changed=false;
    for(const row of data.transformations||[]){
      if(!row.producedSoldierType)continue;
      if(row.producedItem)continue; // retirement ends the original soldier
      if(row.createsClone)continue; // a clone is not the input soldier
      if(paths.has(row.producedSoldierType))continue;
      const source=arr(row.allowedSoldierTypes).find(id=>paths.has(id));
      if(source){
        paths.set(row.producedSoldierType,[...paths.get(source),row.id]);
        changed=true;
      }
    }
  }
  all.set(initialType,paths);
  return paths;
}
// A conservative ABSTRACT INTERPRETATION of conversion chronology.
// For each reachable body, keep only transformation-history IDs which appear
// on EVERY abstract path to that body. All research, materials, stats, rank,
// resurrection, and required previous transformations are relaxed, so the set
// of abstract paths is a SUPERSET of real campaign paths. Consequently:
// a forbidden ID in this MUST set is a sound proof that the target cannot be
// executed from that body, irrespective of future research/materials.
const unavoidableCache=new WeakMap();
export function unavoidableHistoryByBody(data,startState){
  let memo=unavoidableCache.get(data);
  if(!memo){memo=new Map();unavoidableCache.set(data,memo);}
  const key=startState.soldierType+"|"+[...(startState.history?.keys()||[])].sort().join(",");
  if(memo.has(key))return memo.get(key);
  const must=new Map([[startState.soldierType,new Set(startState.history?.keys()||[])]]);
  const rules=(data.transformations||[]).filter(t=>
    !arr(t.requires).includes("STR_UNAVAILABLE")&&!t.createsClone&&!t.producedItem);
  let changed=true,rounds=0;
  while(changed&&rounds++<400){
    changed=false;
    for(const t of rules){
      for(const type of arr(t.allowedSoldierTypes)){
        const before=must.get(type);
        if(!before)continue;
        if(arr(t.forbiddenPreviousTransformations).some(id=>before.has(id)))continue;
        const target=t.producedSoldierType||type;
        const after=t.reset?new Set():new Set(before);
        for(const id of arr(t.removeTransformations))after.delete(id);
        after.add(t.id);
        if(!must.has(target)){must.set(target,after);changed=true;continue;}
        const prior=must.get(target);
        const intersection=new Set([...prior].filter(x=>after.has(x)));
        if(intersection.size!==prior.size){must.set(target,intersection);changed=true;}
      }
    }
  }
  // Reaching the iteration limit only weakens proof, never upgrades an
  // uncertain transformation to confirmed. 83-rule source stabilizes quickly.
  if(changed)throw Error("Transformation history fixed-point did not converge");
  memo.set(key,must);
  return must;
}

export function structuralTransformationVerdict(rule,startState,data,visiting=new Set()){
  if(arr(rule.requires).includes("STR_UNAVAILABLE"))
    return {kind:"blocked",reason:"내부 전용 연구 STR_UNAVAILABLE: 일반 캠페인에서 획득 불가",
      reachableTypes:[...reachableSoldierTypes(data,startState.soldierType).keys()],
      path:[],proof:"internal-only research sentinel"};
  const paths=reachableSoldierTypes(data,startState.soldierType);
  const eligibleTypes=arr(rule.allowedSoldierTypes);
  const matches=eligibleTypes.filter(id=>paths.has(id));
  if(!matches.length)return {kind:"blocked",reason:"현재 병종 계보로는 대상 병종에 도달할 수 없음",reachableTypes:[...paths.keys()],path:[]};
  const mustHistory=unavoidableHistoryByBody(data,startState);
  const historyAllowed=matches.filter(type=>{
    const guaranteed=mustHistory.get(type);
    return !!guaranteed&&!arr(rule.forbiddenPreviousTransformations).some(id=>guaranteed.has(id));
  });
  if(!historyAllowed.length){
    const atLeastOneBody=matches.some(type=>mustHistory.has(type));
    return {kind:"blocked",
      reason:atLeastOneBody?"가능한 모든 병종 전환 경로에서 금지된 변신 이력이 필수로 남음":
        "변신 이력의 방향성 금지 때문에 대상 병종에 도달할 수 없음",
      reachableTypes:[...mustHistory.keys()],path:[],proof:"unavoidable transformation history fixed-point",
      requiredConflicts:matches.map(type=>({type,bodyReachable:mustHistory.has(type),
        forbidden:arr(rule.forbiddenPreviousTransformations).filter(id=>mustHistory.get(type)?.has(id))}))};
  }
  // A required prior transformation that is itself PROVEN unreachable cannot
  // be introduced into this existing soldier's history later. An initially
  // inherited predecessor is valid even when new execution is impossible.
  const nextVisiting=new Set(visiting);
  nextVisiting.add(rule.id);
  for(const id of arr(rule.requiredPreviousTransformations)){
    if(startState.history?.has(id)||nextVisiting.has(id))continue;
    const predecessor=(data.transformations||[]).find(t=>t.id===id);
    if(!predecessor)continue; // Unknown source: do not falsely certify exclusion.
    const before=structuralTransformationVerdict(predecessor,startState,data,nextVisiting);
    if(before.kind==="blocked"){
      return {kind:"blocked",
        reason:"필수 이전 변신 "+id+"의 실행 경로 자체가 확정 불가능",
        reachableTypes:[...mustHistory.keys()],path:[],proof:"unreachable required predecessor",
        predecessor:id,predecessorProof:before.proof||before.reason};
    }
  }
  // A pre-owned forbidden history can only be cleared by a reset or a
  // selective removeTransformations action. To PROVE permanent exclusion,
  // over-approximate every reachable body BEFORE the history eraser, and
  // every reachable body AFTER it. If none can return to a body on which
  // this transformation is allowed, it is impossible for the SAME soldier,
  // even if all research, materials, ranks and conditions were free.
  const conflicts=arr(rule.forbiddenPreviousTransformations).filter(id=>startState.history?.has(id));
  if(conflicts.length){
    let canClearAndReturn=false;
    for(const eraser of data.transformations||[]){
      const selective=arr(eraser.removeTransformations).some(id=>conflicts.includes(id));
      if(!eraser.reset&&!selective)continue;
      if(eraser.producedItem||eraser.createsClone)continue;
      for(const body of paths.keys()){
        if(!arr(eraser.allowedSoldierTypes).includes(body))continue;
        const afterBody=eraser.producedSoldierType||body;
        const afterPaths=reachableSoldierTypes(data,afterBody);
        if(matches.some(type=>afterPaths.has(type))){
          // A selective eraser may remove only one of multiple forbidden
          // IDs: treating it as removing all is still a safe overestimate.
          canClearAndReturn=true;
          break;
        }
      }
      if(canClearAndReturn)break;
    }
    if(!canClearAndReturn)return {kind:"blocked",
      reason:"초기 금지 변신 이력을 지우면 이 변신에 허용되는 병종으로 돌아올 수 없음",
      reachableTypes:[...paths.keys()],path:[],proof:"no return path after any history eraser",
      forbidden:conflicts};
  }
  const shortest=historyAllowed.sort((a,b)=>paths.get(a).length-paths.get(b).length)[0];
  return {kind:shortest===startState.soldierType?"body-ready":"conditional",
    reason:shortest===startState.soldierType?"현재 병종에 적용 가능":"병종 전환이 선행되어야 함",
    reachableTypes:[...paths.keys()],path:paths.get(shortest),requiredType:shortest};
}

// Find a constructive, chronology-correct witness for a requested final
// transformation. Search only required predecessors and changes of soldier
// body. This is an automatic conservative PATH FINDER, not an exhaustive proof
// that every optional combination/medal/item drop is attainable.
export function findTransformationPath(targetId,startState,data,options={}){
  const rulesById=new Map((data.transformations||[]).map(x=>[x.id,x]));
  const target=rulesById.get(targetId);
  if(!target)return {kind:"unknown",reason:"변신 규칙 없음",path:[],checked:0};
  const structure=structuralTransformationVerdict(target,startState,data);
  if(structure.kind==="blocked")return {kind:"blocked",reason:structure.reason,path:[],checked:0,
    reachableTypes:structure.reachableTypes,proof:"single-soldier body transformation closure"};
  const maxDepth=options.maxDepth??8,maxNodes=options.maxNodes??1000;
  let checked=0,hitLimit=false;
  const seen=new Set();
  const engineOptions={mode:"future",...options};
  function key(id,state){
    return id+"|"+state.soldierType+"|"+[...state.history.keys()].sort().join(",")+"|"+[...state.researchIds].sort().join(",");
  }
  function solve(wanted,state,path,depth){
    if(depth>maxDepth||checked++>maxNodes){hitLimit=true;return null;}
    const rule=rulesById.get(wanted);if(!rule)return null;
    const k=key(wanted,state);if(seen.has(k))return null;
    seen.add(k);
    const verdict=eligibleTransformation(rule,state,data,engineOptions);
    if(verdict.kind!=="blocked"){
      const applied=applyTransformation(rule,state,data,engineOptions);
      return {state:applied.state,path:[...path,wanted],verdict:applied.verdict};
    }
    if(state.retired)return null;
    const candidates=[];
    // Required transformation predecessors are AND constraints, but their
    // order may vary. Try each possible first predecessor.
    for(const need of arr(rule.requiredPreviousTransformations))if(!state.history.has(need))candidates.push(need);
    // A transformation changing the body may make another route legal.
    // The bridge may take MULTIPLE hops (Peasant -> Spectre -> ordinary Gal),
    // not just an immediate producedSoldierType matching the target.
    if(!arr(rule.allowedSoldierTypes).includes(state.soldierType)){
      const possibleBodies=reachableSoldierTypes(data,state.soldierType);
      for(const type of arr(rule.allowedSoldierTypes)){
        const route=possibleBodies.get(type);
        if(route?.length)candidates.push(route[0]);
      }
      for(const bridge of rulesById.values()){
        if(bridge.id!==wanted&&bridge.producedSoldierType&&arr(rule.allowedSoldierTypes).includes(bridge.producedSoldierType))candidates.push(bridge.id);
      }
    }
    // A reset may legitimately wipe a forbidden history. It can also erase
    // mandatory history, so we must recheck the target after applying.
    if(arr(rule.forbiddenPreviousTransformations).some(id=>state.history.has(id))){
      for(const reset of rulesById.values())if(reset.id!==wanted&&(reset.reset||
        arr(reset.removeTransformations).some(id=>state.history.has(id))))candidates.push(reset.id);
    }
    for(const candidateId of uniq(candidates)){
      if(candidateId===wanted||path.includes(candidateId))continue;
      const before=solve(candidateId,state,path,depth+1);
      if(!before||before.state.retired)continue;
      const result=solve(wanted,before.state,before.path,depth+1);
      if(result)return result;
    }
    return null;
  }
  const found=solve(targetId,startState,[],0);
  if(found)return {kind:found.verdict.kind==="eligible"?"eligible":"conditional",
    path:found.path,verdict:found.verdict,checked,limited:hitLimit};
  return {kind:"unknown",reason:hitLimit?"탐색 범위 초과, 불가능 확정 아님":"필수 변신·병종 변경을 통한 경로를 찾지 못함",
    path:[],checked,limited:hitLimit};
}
