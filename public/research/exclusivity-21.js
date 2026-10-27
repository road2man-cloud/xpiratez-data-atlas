// X-Piratez 2.1 / OXCE 8.7.1 campaign checker.
// This never equates a possible future grant with a proven, obtainable reward.
import {buildChoiceIndex,computeChoiceScenario,choiceGrantCandidates} from "../captains/choice-simulator-core.js";

const unique=x=>[...new Set(x||[])];
export function makeResearch21Index(data){
  if(data?.schemaVersion!==1||data?.modVersion!=="X-Piratez 2.1")
    throw Error("2.1 연구 규칙 버전 불일치");
  const all=Object.values(data.research||{});
  const choice=buildChoiceIndex(all,{inline:true});
  const free=new Map(),unlocks=new Map(),eventGrants=new Map(),reenables=new Map();
  const append=(map,id,value)=>{if(!map.has(id))map.set(id,[]);map.get(id).push(value);};
  for(const topic of all){
    for(const id of topic.unlocks||[])append(unlocks,id,topic.id);
    for(const id of topic.getOneFree||[])append(free,id,{parent:topic.id,guard:null,mode:"free"});
    for(const [guard,list] of Object.entries(topic.getOneFreeProtected||{}))
      for(const id of list)append(free,id,{parent:topic.id,guard,mode:"protected"});
    for(const id of topic.reenables||[])append(reenables,id,topic.id);
  }
  for(const e of data.events||[])for(const id of e.researchList||[])append(eventGrants,id,e);
  return {choice,free,unlocks,eventGrants,reenables,raw:data.research,events:data.events};
}
export function research21State(index,{completed=[],disabled=[],monthsPassed=null,steps=[]}={}){
  const state=computeChoiceScenario(index.choice,unique(completed),unique(steps),{
    snapshot:true,disabledIds:unique(disabled)
  });
  return {...state,monthsPassed:Number.isInteger(monthsPassed)&&monthsPassed>=0?monthsPassed:null};
}
function eventView(event,state,target){
  const positive=event.researchPositive||[],negative=event.researchNegative||[];
  const missing=positive.filter(id=>!state.completed.has(id));
  const forbidden=negative.filter(id=>state.completed.has(id));
  const expired=state.monthsPassed!==null&&event.lastMonth!==null&&
    event.lastMonth>=0&&state.monthsPassed>event.lastMonth;
  const early=state.monthsPassed!==null&&state.monthsPassed<(event.firstMonth||0);
  const eligiblePool=(event.researchList||[]).filter(id=>
    !state.disabled.has(id)&&!state.completed.has(id));
  const targetTickets=eligiblePool.filter(id=>id===target).length;
  const selectable=targetTickets>0;
  const knownBlocking=Boolean(forbidden.length||expired||state.disabled.has(target));
  const ready=missing.length===0&&!knownBlocking&&!early&&selectable;
  const missingItems=event.itemPositive||[];
  const forbiddingItems=event.itemNegative||[];
  const facility=event.facilityPositive||[];
  const unknown=Boolean(missingItems.length||forbiddingItems.length||facility.length||
    (event.facilityNegative||[]).length||(event.otherConditions||[]).length||
    event.mode.startsWith("oneTime")||state.monthsPassed===null);
  return {
    eventId:event.id,script:event.script,mode:event.mode,firstMonth:event.firstMonth,
    lastMonth:event.lastMonth,odds:event.executionOdds,weight:event.weight,
    missing,forbidden,expired,early,blocked:knownBlocking,ready,
    conditional:unknown||event.executionOdds<100,
    missingItems,forbiddingItems,facility,
    oneTimeUnverified:event.mode.startsWith("oneTime"),
    poolSize:eligiblePool.length,selectable,
    selectedChance:selectable&&eligiblePool.length?targetTickets/eligiblePool.length:null,
    researchList:event.researchList,otherConditions:event.otherConditions||[]
  };
}
export function evaluateResearch21(index,state,id){
  const topic=index.raw[id];
  if(!topic)return {id,kind:"unknown"};
  const done=state.completed.has(id),disabled=state.disabled.has(id);
  const unlockedBy=(index.unlocks.get(id)||[]).filter(x=>state.completed.has(x));
  const missingRequires=(topic.requires||[]).filter(x=>!state.completed.has(x));
  const missingDependencies=unlockedBy.length?[]:(topic.dependencies||[]).filter(x=>!state.completed.has(x));
  const free=(index.free.get(id)||[]).map(src=>{
    const parentDone=state.completed.has(src.parent)&&!state.disabled.has(src.parent);
    const guardDone=!src.guard||state.completed.has(src.guard);
    const sourceOutcome=choiceGrantCandidates(index.choice,state,src.parent);
    const tickets=sourceOutcome.tickets;
    const targetTickets=sourceOutcome.outcomes.find(o=>o.id===id)?.weight||0;
    return {...src,parentDone,guardDone,
      candidate:!disabled&&!done&&parentDone&&guardDone&&targetTickets>0,
      tickets,targetTickets,chance:tickets?targetTickets/tickets:0,
      reResearch:parentDone
    };
  });
  const events=(index.eventGrants.get(id)||[]).map(e=>eventView(e,state,id));
  const reenablers=index.reenables.get(id)||[];
  const baseReady=!missingRequires.length&&!missingDependencies.length;
  const conditional=Boolean(topic.needItem||(topic.requiresBaseFunc||[]).length);
  let kind;
  if(disabled)kind="disabled";
  else if(done)kind="completed";
  else if(baseReady)kind=conditional?"conditional":"ready";
  else if(free.some(f=>f.candidate)||events.some(e=>e.ready))kind="grant-candidate";
  else kind="missing-prerequisites";
  return {
    id,name:topic.name,kind,done,disabled,
    fromSave:state.saveDisabled?.has(id)||false,
    disabledBy:[...(state.blockedBy?.get(id)||[])],
    missingDependencies,missingRequires,unlockedBy,reenablers,
    free,events,needItem:topic.needItem,neededItem:topic.neededItem,
    baseFunctions:topic.requiresBaseFunc||[],
    disables:topic.disables||[],reenables:topic.reenables||[],
    unlocks:topic.unlocks||[],getOneFree:topic.getOneFree||[],
    getOneFreeProtected:topic.getOneFreeProtected||{},
    sampleUnverified:conditional,
    canSimulateManual:!done&&!disabled&&baseReady,
    canSimulateGrant:!done&&!disabled&&(
      free.some(f=>f.candidate)||events.some(e=>e.ready))
  };
}
export function applyResearch21(index,state,id,{mode="manual",source=null}={}){
  const decision=evaluateResearch21(index,state,id);
  if(decision.kind==="unknown")return {ok:false,why:"연구 ID가 2.1 규칙에 없음",state};
  if(decision.disabled)return {ok:false,why:"researchRuleStatus=2: 이벤트 직접 지급도 불가. 먼저 재활성화 필요.",state};
  if(decision.done&&mode!=="repeat")return {ok:false,why:"이미 완료한 연구. 추가 보상은 재연구/무료추첨을 따로 검사.",state};
  if(mode==="manual"&&!decision.canSimulateManual)return {ok:false,why:"dependencies 또는 requires가 미충족. 실제 연구 완료를 가정하지 않음.",state};
  if(mode==="grant"&&!(decision.free.some(f=>f.candidate&&(source===null||f.parent===source))||
    decision.events.some(e=>e.ready&&(source===null||e.eventId===source))))
    return {ok:false,why:"현재 조건에서 지급 후보가 확인되지 않음",state};
  if(mode==="repeat"){
    if(!decision.done)return {ok:false,why:"재연구는 이미 완료한 연구에만 적용",state};
    const bonus=choiceGrantCandidates(index.choice,state,id);
    if(!bonus.tickets)return {ok:false,why:"새로 지급할 수 있는 무료 연구 후보 없음",state};
    return {ok:true,mode,lottery:bonus,conditional:true,state};
  }
  // Explicit choice is a scenario, not an automatic event/lottery payout.
  const completed=new Set(state.completed),disabled=new Set(state.disabled);
  const removed=[],addedDisabled=[],reenabled=[];
  completed.add(id);
  for(const target of decision.disables){
    disabled.add(target);
    addedDisabled.push(target);
    if(completed.delete(target))removed.push(target);
  }
  for(const target of decision.reenables){
    if(disabled.delete(target))reenabled.push(target);
  }
  const next=research21State(index,{
    completed:[...completed],disabled:[...disabled],monthsPassed:state.monthsPassed
  });
  // Preserve the time-ordered cause of newly disabled topics instead of
  // reclassifying later assumptions as unexplained historical save flags.
  next.blockedBy=new Map([...state.blockedBy].map(([key,values])=>[key,new Set(values)]));
  next.saveDisabled=new Set(state.saveDisabled);
  for(const target of addedDisabled){
    const cause=next.blockedBy.get(target)||new Set();cause.add(id);
    next.blockedBy.set(target,cause);
    next.saveDisabled.delete(target);
  }
  for(const target of reenabled){next.blockedBy.delete(target);next.saveDisabled.delete(target);}
  return {ok:true,mode,conditional:mode!=="manual"||decision.sampleUnverified,
    removed,addedDisabled,reenabled,state:next};
}
export function findResearch21(index,query,limit=20){
  const q=String(query||"").trim().toLocaleLowerCase("ko");
  if(!q)return [];
  const results=[];
  for(const t of Object.values(index.raw)){
    if(!t.id.toLowerCase().includes(q)&&!t.name.toLocaleLowerCase("ko").includes(q))continue;
    results.push({id:t.id,name:t.name});
  }
  results.sort((a,b)=>
    Number(b.id.toLowerCase()===q)-Number(a.id.toLowerCase()===q)||
    Number(b.name.toLocaleLowerCase("ko").startsWith(q))-Number(a.name.toLocaleLowerCase("ko").startsWith(q))||
    a.name.localeCompare(b.name,"ko"));
  return results.slice(0,limit);
}
