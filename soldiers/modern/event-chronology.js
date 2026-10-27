// Research-event chronology from X-Piratez 2.1 / OXCE 8.7.1.
// No random outcomes are inferred. "conditional" is not a proof of reachability.
// Works in Node tests and in the static Soldiers DB, without save data embedded.
const arr=x=>Array.isArray(x)?x:[];
const present=(collection,id)=>{
  if(collection===undefined||collection===null)return null;
  if(collection instanceof Set)return collection.has(id);
  if(collection instanceof Map)return Number(collection.get(id)||0)>0;
  if(Array.isArray(collection))return collection.includes(id);
  const n=collection[id];
  return typeof n==="boolean"?n:n===undefined?false:Number(n)>0;
};
const number=x=>x===null||x===undefined||x===""?null:Number.isFinite(Number(x))?Number(x):null;
const asSet=x=>new Set(x instanceof Set?x:x instanceof Map?[...x.keys()]:Array.isArray(x)?x:Object.entries(x||{}).filter(([,v])=>v).map(([k])=>k));
export function eventScriptVerdict(script,state={},options={}){
  const mode=options.mode||"future";
  const blocked=[],pending=[],unknown=[];
  const completed=asSet(state.researched),disabled=asSet(state.disabled);
  const month=number(state.month);
  const fm=number(script.firstMonth)??0,lm=number(script.lastMonth);
  if(number(script.executionOdds)===0)blocked.push("이벤트 스크립트 실행 확률 0");
  if(month!==null&&lm!==null&&lm>=0&&month>lm)blocked.push("이벤트 종료: "+lm+"개월, 현재 "+month+"개월");
  if(month===null)unknown.push("현재 게임 경과 월수 미제공");
  else if(month<fm){
    if(mode==="current")blocked.push("이벤트 시작 전: "+fm+"개월");
    else pending.push("이벤트 시작 월 "+fm+"개월까지 진행 필요");
  }
  for(const id of arr(script.researchPositive)){
    if(!completed.has(id)||disabled.has(id)){
      if(mode==="current")blocked.push("필수 연구 미완료: "+id);
      else{
        const reenablers=arr(options.reenablers?.[id]);
        if(disabled.has(id)&&options.reenablers&&reenablers.length===0)
          blocked.push("필수 연구가 영구 비활성화됨: "+id);
        else pending.push("필수 연구 완료 필요: "+id);
      }
    }
  }
  for(const id of arr(script.researchNegative))if(completed.has(id)&&!disabled.has(id)){
    if(mode==="current")blocked.push("금지 연구 완료 상태: "+id);
    else if(options.nonDisableable?.has?.(id))blocked.push("금지 연구를 제거할 경로 없음: "+id);
    else pending.push("금지 연구가 미래에 비활성화되어야 함: "+id);
  }
  for(const [positive,negative,collection,label]of [
    [script.itemPositive,script.itemNegative,state.items,"아이템"],
    [script.facilityPositive,script.facilityNegative,state.facilities,"시설"],
    [script.soldierTypePositive,script.soldierTypeNegative,state.soldierTypes,"병종"],
    [script.regionPositive,script.regionNegative,state.regions,"기지 지역"],
    [script.countryPositive,script.countryNegative,state.countries,"기지 국가"],
    [script.pactPositive,script.pactNegative,state.pacts,"협정 국가"]
  ]){
    for(const id of arr(positive)){
      const value=present(collection,id);
      if(value===null)unknown.push(label+" 보유 상태 미확인: "+id);
      else if(!value){
        if(mode==="current")blocked.push(label+" 필요: "+id);
        else pending.push(label+" 확보 필요: "+id);
      }
    }
    for(const id of arr(negative)){
      const value=present(collection,id);
      if(value===null)unknown.push(label+" 부재 상태 미확인: "+id);
      else if(value){
        if(mode==="current")blocked.push(label+" 보유 금지: "+id);
        else pending.push(label+" 제거 필요: "+id);
      }
    }
  }
  const o=script.otherConditions||{};
  for(const [field,min,max,label]of [
    ["funds","minFunds","maxFunds","자금"],
    ["score","minScore","maxScore","평가 점수"],
    ["difficulty","minDifficulty","maxDifficulty","난이도"]
  ]){
    // Engine doesn't apply monthly score/funds requirements during month 0.
    if(month===0&&(field==="funds"||field==="score"))continue;
    if(o[min]===undefined&&o[max]===undefined)continue;
    const n=number(state[field]);
    if(n===null){unknown.push(label+" 미확인");continue;}
    if(o[min]!==undefined&&n<Number(o[min])){
      if(mode==="current"||field==="difficulty")blocked.push(label+" 최소 조건 미달");
      else pending.push(label+" 최소 "+o[min]+" 필요");
    }
    if(o[max]!==undefined&&n>Number(o[max])){
      if(mode==="current"||field==="difficulty")blocked.push(label+" 상한 조건 초과");
      else pending.push(label+" 상한 "+o[max]+" 조건 필요");
    }
  }
  if(o.counterMin!==undefined||o.counterMax!==undefined){
    const key=o.missionVarName||o.missionMarkerName;
    if(!key)unknown.push("이벤트 카운터 추적 기준 미확인");
    else{
      const n=number(state.counters?.[key]);
      if(n===null)unknown.push("미션·마커 카운터 미확인: "+key);
      else{
        if(o.counterMin!==undefined&&n<Number(o.counterMin))pending.push("미션 카운터 "+key+" ≥ "+o.counterMin);
        if(o.counterMax!==undefined&&Number(o.counterMax)>=0&&n>Number(o.counterMax))
          blocked.push("미션 카운터 "+key+" 상한 초과");
      }
    }
  }
  let selectedWeight=null,totalWeight=null;
  if(script.mode==="weighted"){
    const buckets=arr(script.monthWeights).sort((a,b)=>Number(a.month)-Number(b.month));
    if(!buckets.length)blocked.push("월별 이벤트 가중치 기록 없음");
    else if(month===null)unknown.push("현재 월수 없어서 적용 가중치 선택 불가");
    else{
      const selected=buckets.filter(x=>Number(x.month)<=month).at(-1);
      if(!selected){
        if(mode==="current")blocked.push("현재 월에 적용할 이벤트 가중치표 없음");
        else pending.push("첫 이벤트 가중치표 시작 전");
      }else{
        selectedWeight=number(selected.weight)||0;
        totalWeight=number(selected.totalWeight)||0;
        if(selectedWeight<=0){
          const later=buckets.some(x=>Number(x.month)>month&&Number(x.weight)>0&&
            (lm===null||lm<0||Number(x.month)<=lm));
          if(mode==="current"||!later)blocked.push("해당 월의 보상 가중치 0");
          else pending.push("이벤트 보상 가중치가 생기는 미래 월 필요");
        }
      }
    }
  }
  const used=present(state.generatedEvents,script.eventId||script.event);
  if(script.mode==="oneTimeSequential"||script.mode==="oneTimeRandom"){
    if(used===true)blocked.push("이미 발생한 일회성 이벤트");
    if(used===null)unknown.push("일회성 이벤트 발생 이력 미확인");
  }
  if(script.mode==="oneTimeSequential"){
    for(const previous of arr(script.oneTimeEarlier)){
      const was=present(state.generatedEvents,previous);
      if(was===false){
        if(mode==="current")blocked.push("선행 일회성 이벤트 미발생: "+previous);
        else pending.push("선행 일회성 이벤트 필요: "+previous);
      }else if(was===null)unknown.push("선행 일회성 이벤트 이력 미확인: "+previous);
    }
  }
  if(script.mode==="oneTimeRandom"&&!number(script.oneTimeWeight))
    blocked.push("일회성 무작위 이벤트 가중치 0");
  if((number(script.executionOdds)??100)<100)
    pending.push("실행 확률 "+script.executionOdds+"%의 무작위 통과 필요");
  if(script.mode==="oneTimeRandom")pending.push("일회성 이벤트 추첨에서 선택되어야 함");
  if(script.mode==="weighted"&&(totalWeight??0)>(selectedWeight??0)&&selectedWeight!==null)
    pending.push("월간 이벤트 가중치 추첨에서 선택되어야 함");
  const kind=blocked.length?"blocked":pending.length||unknown.length?"conditional":"eligible";
  return {kind,blocked,pending,unknown,month,weight:selectedWeight,totalWeight,
    eligibleIfConditionsMet:kind!=="blocked"};
}
export function evaluateEventResearch(id,events=[],state={},options={}){
  const disabled=asSet(state.disabled),completed=asSet(state.researched);
  if(disabled.has(id))return {kind:"blocked",blocked:["이 연구는 비활성화 상태이므로 이벤트 직접 지급도 거부됨: "+id],candidates:[]};
  const candidates=events.map(event=>{
    const eventScripts=arr(event.scripts);
    const routes=eventScripts.map(script=>eventScriptVerdict({...script,eventId:event.event},state,options));
    const pool=arr(event.researchList);
    const choices=pool.length?pool: null;
    return {event:event.event,resultMode:event.resultMode,choiceCount:event.choiceCount,
      routes,blocked:routes.length>0&&routes.every(r=>r.kind==="blocked"),
      choiceIsRandom:event.choiceCount>1,
      alreadyCompleted:completed.has(id),knownCandidatePool:choices};
  });
  if(!candidates.length)return {kind:"unknown",blocked:[],candidates:[],reason:"연구 지급 이벤트 출처 없음"};
  if(candidates.every(x=>x.blocked))return {kind:"blocked",blocked:["확인된 이벤트 스크립트는 모두 해당 상태에서 차단"],candidates};
  return {kind:"conditional",blocked:[],candidates,
    reason:"이벤트 발생·추첨·연구 직접 지급 조건을 모두 검증해야 함"};
}
export function researchStep(state,id,rules={},options={}){
  // An explicit *executed* research or event grant; never auto-choose RNG.
  const rule=rules[id];
  const completed=asSet(state.researched),disabled=asSet(state.disabled);
  const reason=[];
  if(!rule)return {kind:"unknown",reason:["연구 규칙 누락: "+id],state};
  if(disabled.has(id))return {kind:"blocked",reason:["비활성 연구에 대한 직접 지급·연구는 엔진에서 거부: "+id],state};
  const method=options.method||"research";
  if(method==="research"){
    const req=arr(rule.requires);
    const deps=arr(rule.dependencies);
    for(const r of req)if(!completed.has(r))reason.push("필수 requires 미완료: "+r);
    const bypass=options.unlocked===true||Object.entries(rules).some(([src,r])=>completed.has(src)&&arr(r.unlocks).includes(id));
    if(!bypass)for(const dep of deps)if(!completed.has(dep))reason.push("필수 dependencies 미완료: "+dep);
    if(rule.needItem&&present(state.items,rule.neededItem||id)!==true)
      reason.push("필수 실물 미확인: "+(rule.neededItem||id));
    for(const f of arr(rule.requiresBaseFunc))if(present(state.baseFunctions,f)!==true)
      reason.push("필수 기지 기능 미확인: "+f);
    if(completed.has(id)&&!options.repeatableProof)reason.push("이미 완료된 연구의 재연구 조건 미증명: "+id);
  }else if(method!=="event"&&method!=="free")reason.push("지원되지 않은 연구 출처: "+method);
  if(reason.length)return {kind:"blocked",reason,state};
  if(completed.has(id))return {kind:"conditional",reason:["이미 완료된 연구의 무료 보상은 별도 추첨해야 함"],state};
  completed.add(id);
  for(const drop of arr(rule.disables)){
    completed.delete(drop);
    disabled.add(drop);
  }
  for(const enable of arr(rule.reenables))disabled.delete(enable);
  return {kind:"applied",reason:[],state:{...state,researched:completed,disabled},
    randomFreeCandidates:[...arr(rule.getOneFree),
      ...Object.entries(rule.getOneFreeProtected||{}).flatMap(([guard,ids])=>
        completed.has(guard)?arr(ids):[])].filter(x=>!completed.has(x)&&!disabled.has(x)),
    unlocked:arr(rule.unlocks)};
}
export function replayResearchSequence(steps,start,rules={}){
  let state={...start,researched:asSet(start.researched),disabled:asSet(start.disabled)};
  const trail=[];
  for(const raw of steps){
    const step=typeof raw==="string"?{id:raw,method:"research"}:raw;
    const result=researchStep(state,step.id,rules,step);
    trail.push({id:step.id,method:step.method||"research",kind:result.kind,reason:result.reason});
    if(result.kind!=="applied")
      return {kind:result.kind==="blocked"?"blocked":"conditional",trail,state,
        reason:result.reason};
    state=result.state;
  }
  return {kind:"applied",trail,state};
}
