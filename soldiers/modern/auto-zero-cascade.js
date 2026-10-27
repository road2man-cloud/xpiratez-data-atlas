// Conservative diagnostic of OXCE SavedGame::addFinishedResearch's zero-cost
// queue. The output is NOT a campaign witness and MUST NOT add research flags
// to the replay or upgrade a possible route to certain.
// Engine evidence: SavedGame.cpp lines 1535-1676 and 1743-1850 (OXCE 8.7.1).
const arr=x=>Array.isArray(x)?x:[];
const set=x=>x instanceof Set?new Set(x):new Set(arr(x));
const count=(x,id)=>Number(x?.[id]||0);
const limitNumber=(x,def,max)=>Number.isFinite(Number(x))?
  Math.max(1,Math.min(max,Math.floor(Number(x)))):def;
function stateCopy(start){
  return {researched:set(start?.researched),disabled:set(start?.disabled),
    items:start?.items||null,baseFunctions:set(start?.baseFunctions),
    activeResearch:set(start?.activeResearch)};
}
function canRunZero(id,rule,rules,state,from,{inventoryKnown,functionsKnown,activeResearchKnown}){
  const reasons=[];
  if(state.researched.has(id)||state.disabled.has(id))return {ok:false,reasons:["이미 완료/폐쇄"]};
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
    .sort(([a],[b])=>a.localeCompare(b,"en"));
  let i=0;
  while(i<queue.length&&i<maxSteps){
    const id=queue[i++],rule=rules[id];
    if(st.disabled.has(id)){notices.push("큐 처리 시점에 폐쇄: "+id);continue;}
    if(seen.has(id))continue;
    seen.add(id);
    if(st.researched.has(id)){
      // Engine may re-run *already discovered* projects if they possess
      // a newly available protected unlock. We do not claim that branch.
      notices.push("재완료·보호 해금 분기 별도 검증: "+id);
      continue;
    }
    st.researched.add(id);
    for(const disabled of arr(rule.disables)){
      st.researched.delete(disabled);st.disabled.add(disabled);
    }
    for(const reenabled of arr(rule.reenables))st.disabled.delete(reenabled);
    steps.push({id,kind:id===sourceId?"assumed-source":"auto-zero",
      queuedBy:i===1?null:held.has(id)?held.get(id):null,
      disables:arr(rule.disables),reenables:arr(rule.reenables),
      freeRewardPending:arr(rule.getOneFree).length>0||
        Object.keys(rule.getOneFreeProtected||{}).length>0});
    if(steps.at(-1).freeRewardPending)
      notices.push("무료 연구 보상은 자동 연구 완료와 별도 RNG/순차 선택: "+id);
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
    automatic:steps.filter(x=>x.kind==="auto-zero").map(x=>x.id),
    count:steps.length,
    incomplete:i<queue.length,
    unverified,notices,
    note:"후보 큐 진단은 실제 완료/도달 증명이 아닙니다. 탐색기는 별도로 기존 조건을 재생합니다."
  };
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
