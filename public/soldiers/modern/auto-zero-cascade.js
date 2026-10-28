// Conservative diagnostic of OXCE SavedGame::addFinishedResearch's zero-cost
// queue. The output is NOT a campaign witness and MUST NOT add research flags
// to the replay or upgrade a possible route to certain.
// Engine evidence: SavedGame.cpp lines 1535-1676 and 1743-1850 (OXCE 8.7.1).
const arr=x=>Array.isArray(x)?x:[];
const set=x=>x instanceof Set?new Set(x):new Set(arr(x));
const count=(x,id)=>Number(x?.[id]||0);
const limitNumber=(x,def,max)=>Number.isFinite(Number(x))?
  Math.max(1,Math.min(max,Math.floor(Number(x)))):def;
// OXCE iterates Mod::getResearchMap(): std::map<std::string, RuleResearch *>.
// For ruleset IDs (ASCII), JS ordinal comparison matches std::string order;
// localeCompare is locale-dependent and can change queue order.
const ordinal=(a,b)=>a<b?-1:a>b?1:0;
function hasPendingProtectedUnlock(id,rules,state){
  return arr(rules[id]?.unlocks).some(target=>
    arr(rules[target]?.requires).length>0 &&
    !state.disabled.has(target) && !state.researched.has(target));
}
function hasPendingFree(rule,state,availableOnly){
  if(arr(rule.getOneFree).some(id=>!state.disabled.has(id)&&!state.researched.has(id)))return true;
  return Object.entries(rule.getOneFreeProtected||{}).some(([guard,ids])=>
    (!availableOnly||state.researched.has(guard))&&
    arr(ids).some(id=>!state.disabled.has(id)&&!state.researched.has(id)));
}
function stateCopy(start){
  return {researched:set(start?.researched),disabled:set(start?.disabled),
    items:start?.items||null,baseFunctions:set(start?.baseFunctions),
    activeResearch:set(start?.activeResearch)};
}
function canRunZero(id,rule,rules,state,from,{inventoryKnown,functionsKnown,activeResearchKnown}){
  const reasons=[];
  if(state.disabled.has(id))return {ok:false,reasons:["폐쇄 상태"]};
  // OXCE exposes a previously discovered topic again when it still has
  // unclaimed protected unlocks or an available getOneFree reward. Such a
  // zero-cost topic may be queued AGAIN without reapplying its disables.
  if(state.researched.has(id)&&
      !hasPendingProtectedUnlock(id,rules,state)&&!hasPendingFree(rule,state,true))
    return {ok:false,reasons:["이미 완료되고 남은 보상 없음"]};
  if(state.activeResearch.has(id))return {ok:false,reasons:["현재 기지에서 진행 중인 연구"]};
  const unlocked=[...state.researched].some(src=>arr(rules[src]?.unlocks).includes(id));
  if(!unlocked){
    const missing=arr(rule.dependencies).filter(x=>!state.researched.has(x));
    if(missing.length)reasons.push("선행 연구 "+missing.join(", "));
  }
  const missingRequires=arr(rule.requires).filter(x=>!state.researched.has(x));
  if(missingRequires.length)reasons.push("보호 조건 "+missingRequires.join(", "));
  // Protected topics cannot be auto-queued solely because the prerequisites
  // happened to be completed earlier. The current queue item must unlock it.
  if(arr(rule.requires).length&&!arr(rules[from]?.unlocks).includes(id))
    reasons.push("직전 완료 연구의 직접 unlocks에 없음");
  if(rule.needItem){
    if(count(state.items,rule.neededItem||id)<1)
      reasons.push(inventoryKnown?"같은 기지 표본 부족":"같은 기지 표본 보유 근거 없음");
  }
  const functions=arr(rule.requiresBaseFunc).filter(x=>!state.baseFunctions.has(x));
  if(functions.length)reasons.push((functionsKnown?"기지 기능 부족: ":"기지 기능 확인 불가: ")+functions.join(", "));
  // We cannot prove that a project is NOT already ongoing without inspecting
  // that particular base's active research projects.
  // Unknown active research is an unproven *assumption*, not a hard
  // exclusion of all theoretical auto-queue candidates.
  return {ok:!reasons.length,reasons,unlocked,
    assumedNoActiveResearch:activeResearchKnown!==true};
}
export function inspectAutoZeroCascade(data,sourceId,initial={},opts={}){
  const rules=data?.researchRules||{};
  const source=rules[sourceId];
  if(!source)return {kind:"unverified",source:sourceId,reason:"원천 연구 규칙이 없습니다",steps:[]};
  const st=stateCopy(initial);
  if(st.disabled.has(sourceId))return {kind:"blocked",source:sourceId,
    reason:"원천 연구가 현재 폐쇄됨",steps:[]};
  if(st.researched.has(sourceId))return {kind:"already-researched",source:sourceId,
    reason:"원천 연구가 이미 완료됐으므로 새로운 자동 연구를 소급 지급하지 않습니다. 재실행/보호 해금은 별도 검증 필요",steps:[]};
  if(source.repeatable)return {kind:"unverified",source:sourceId,
    reason:"반복 연구는 OXCE의 기존 발견·보호 해금 처리와 다르므로 자동 완료 경로를 추정하지 않습니다",steps:[]};
  // The source completion is assumed, not proven by this diagnostic.
  const verifiedInventory=opts.inventoryKnown===true;
  const verifiedFunctions=opts.functionsKnown===true;
  const verifiedActive=opts.activeResearchKnown===true;
  const maxSteps=limitNumber(opts.maxSteps,45,180);
  const queue=[sourceId],steps=[],held=new Map(),notices=[];
  const seen=new Set();
  const allZero=Object.entries(rules).filter(([,r])=>Number(r.cost)===0)
    .sort(([a],[b])=>ordinal(a,b));
  let i=0;
  while(i<queue.length&&i<maxSteps){
    const id=queue[i++],rule=rules[id];
    if(seen.has(id))continue;
    seen.add(id);
    // addFinishedResearch checks disabled at entry, but does NOT repeat that
    // check for items already in the queue. A queued project can therefore
    // be discovered AFTER an earlier queued project disables it.
    const disabledWhenPopped=st.disabled.has(id);
    const alreadyDiscovered=st.researched.has(id);
    const hasProtected=hasPendingProtectedUnlock(id,rules,st);
    if(!alreadyDiscovered){
      st.researched.add(id);
      for(const disabled of arr(rule.disables)){
        st.researched.delete(disabled);st.disabled.add(disabled);
      }
    }
    // Re-enables are processed even when a discovered topic is revisited.
    for(const reenabled of arr(rule.reenables))st.disabled.delete(reenabled);
    steps.push({id,kind:id===sourceId?"assumed-source":
      alreadyDiscovered?"revisited-zero":"auto-zero",
      queuedBy:i===1?null:held.has(id)?held.get(id):null,
      disabledWhenPopped,disables:alreadyDiscovered?[]:arr(rule.disables),
      reenables:arr(rule.reenables),
      freeRewardPending:hasPendingFree(rule,st,false)});
    if(disabledWhenPopped)
      notices.push("큐 등록 후 폐쇄됐지만 엔진은 처리하는 연구: "+id);
    if(steps.at(-1).freeRewardPending)
      notices.push("getOneFree 보상은 이 비용 0 큐에서 자동 추첨하지 않음 (별도 완료·출처 검증 필요): "+id);
    // Existing discoveries are rescanned ONLY if an undiscovered protected
    // unlock remained before this queue item was processed.
    if(alreadyDiscovered&&!hasProtected)continue;
    for(const [next,project] of allZero){
      if(seen.has(next)||queue.includes(next)||st.disabled.has(next))continue;
      const gate=canRunZero(next,project,rules,st,id,{
        inventoryKnown:verifiedInventory,functionsKnown:verifiedFunctions,
        activeResearchKnown:verifiedActive});
      if(gate.ok){queue.push(next);held.set(next,id);}
    }
  }
  if(i<queue.length)notices.push("자동 연구 큐 탐색 제한 초과: "+queue.length+"개 후보");
  const kind="conditional";
  const unverified=[];
  if(!verifiedInventory)unverified.push("선택 기지 실물 재고의 완전성");
  if(!verifiedFunctions)unverified.push("선택 기지 시설 기능");
  if(!verifiedActive)unverified.push("현재 해당 기지에서 진행 중인 연구");
  unverified.push("원천 연구의 실제 완료와 완료 순서","다른 연구·이벤트의 동시 완료");
  return {kind,source:sourceId,steps,
    // A processed-but-disabled topic is NOT a usable transformation flag.
    automatic:steps.filter(x=>x.kind==="auto-zero"&&
      st.researched.has(x.id)&&!st.disabled.has(x.id)).map(x=>x.id),
    processed:steps.filter(x=>x.kind==="auto-zero").map(x=>x.id),
    finalState:{researched:st.researched,disabled:st.disabled},
    count:steps.length,
    incomplete:i<queue.length,
    unverified,notices,
    note:"후보 큐 진단은 실제 완료/도달 증명이 아닙니다. 탐색기는 별도로 기존 조건을 재생합니다."
  };
}
// A save exposes completed facilities but geographical base functions may be
// supplied by its country/region. Enumerate EVERY unknown function bit used by
// cost-zero rules. Only an identical terminal (researched, disabled) state in
// every assignment can be replayed from incomplete geographical evidence.
// This proves invariance of research flags, NOT the source action or its RNG.
export function inspectInvariantAutoZeroCascade(data,sourceId,initial={},opts={}){
  if(opts.inventoryKnown!==true||opts.activeResearchKnown!==true||
      !(initial?.baseFunctions instanceof Set)||
      !(initial?.activeResearch instanceof Set)||initial?.items==null)
    return {kind:"unverified",source:sourceId,
      reason:"같은 기지의 재고·진행 중 연구·기지 기능 하한 증거 불완전"};
  const unknown=[...new Set(Object.values(data?.researchRules||{})
    .filter(rule=>Number(rule.cost)===0)
    .flatMap(rule=>arr(rule.requiresBaseFunc)))]
    .filter(id=>!initial.baseFunctions.has(id)).sort(ordinal);
  const limit=8;
  if(unknown.length>limit)return {kind:"unverified",source:sourceId,
    reason:"미확인 기지 기능 조합 수가 완전 탐색 제한을 초과",unknownFunctions:unknown};
  let representative=null,signature=null;
  const variants=2**unknown.length;
  for(let mask=0;mask<variants;mask++){
    const functions=new Set(initial.baseFunctions);
    for(let j=0;j<unknown.length;j++)if(mask&(2**j))functions.add(unknown[j]);
    const result=inspectAutoZeroCascade(data,sourceId,
      {...initial,baseFunctions:functions},
      {...opts,inventoryKnown:true,functionsKnown:true,activeResearchKnown:true});
    if(result.kind!=="conditional"||result.incomplete||!result.finalState)
      return {kind:"unverified",source:sourceId,
        reason:"기지 기능 대입 중 자동 연구 시퀀스가 중단 또는 미확정",unknownFunctions:unknown};
    const stateSignature=JSON.stringify([
      [...result.finalState.researched].sort(ordinal),
      [...result.finalState.disabled].sort(ordinal)]);
    if(signature!==null&&signature!==stateSignature)
      return {kind:"uncertain-functions",source:sourceId,
        reason:"국가·지역 기지 기능에 따라 실제 자동 연구 완료·폐쇄 결과가 달라짐",
        unknownFunctions:unknown,variantCount:variants};
    signature=stateSignature;
    if(!representative)representative=result;
  }
  return {...representative,invariantAcrossBaseFunctions:true,
    unknownFunctions:unknown,variantCount:variants,
    notices:[...representative.notices,
      "기지 기능 "+unknown.length+"종의 가능한 "+variants+
      "개 조합 모두 동일한 최종 연구·폐쇄 상태 (원천 완료 자체는 별도 증빙)"]};
}
export function inspectAutoZeroSourcesForTransform(data,transformId,start={},opts={}){
  const row=arr(data?.transformations).find(x=>x.id===transformId);
  if(!row)return {kind:"unverified",target:transformId,sources:[]};
  const rules=data.researchRules||{};
  const targets=arr(row.requires).filter(id=>Number(rules[id]?.cost)===0);
  const sources=[...new Set(targets.flatMap(id=>[
    ...arr(rules[id]?.dependencies),
    ...Object.entries(rules).filter(([,r])=>arr(r.unlocks).includes(id))
      .map(([key])=>key)
  ]))].filter(x=>rules[x]&&!start.researched?.has?.(x)).slice(0,12);
  const simulations=sources.map(src=>{
    const proof=inspectAutoZeroCascade(data,src,start,opts);
    return {source:src,produced:proof.automatic.filter(x=>targets.includes(x)),
      chain:proof.steps.map(x=>x.id),kind:proof.kind,
      unverified:proof.unverified,notices:proof.notices}
  });
  return {kind:"conditional",target:transformId,targets,simulations,
    sources:simulations.filter(s=>s.produced.length)};
}
