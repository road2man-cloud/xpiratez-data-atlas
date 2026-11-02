// Acquisition-aware orchestration of the EXISTING campaign verifier.
// Research/auto queues/free awards/transforms are never simulated separately.
import {verifyCampaignSequence} from './campaign-proof.js';
import {initialState,bonusStats,STAT_KEYS} from './eligibility.js';
import {eventScriptVerdict} from './event-chronology.js';
export const WITNESS_STATS=STAT_KEYS.filter(k=>k!=='mana');
const arr=x=>Array.isArray(x)?x:[];
const own=(x,id)=>Number(x?.[id]||0);
export function foundationWorld(){return {
  researched:new Set(),disabled:new Set(),items:{},baseFunctions:new Set(),facilities:new Set(),
  globalFacilities:null,otherItems:{},activeResearch:new Set(),generatedEvents:{},funds:0,month:0,
  autoZeroScenario:true,inventoryKnown:true,baseFunctionsKnown:true,soldiers:[]
};}
export function originEventScript(alt,event){
  const out={...alt,eventId:event};
  const fields={researchTriggers:'research',itemTriggers:'item',facilityTriggers:'facility',
    soldierTypeTriggers:'soldierType',xcomBaseInRegionTriggers:'region',xcomBaseInCountryTriggers:'country',
    pactTriggers:'pact'};
  for(const [key,name] of Object.entries(fields)){
    out[name+'Positive']=arr(alt.positiveTriggers).filter(x=>x.kind===key).map(x=>x.id);
    out[name+'Negative']=arr(alt.negativeTriggers).filter(x=>x.kind===key).map(x=>x.id);
  }
  return out;
}
function recruit(world,step,data){
  if(world.soldiers.some(x=>x.id===step.soldier))throw Error('동일 대원을 재출생 처리할 수 없음');
  const p=data.profiles.find(p=>p.id===step.profile);
  const row=data.originRows?.find(r=>r.id===step.profile&&r.kind==='SOURCE_SPAWN');
  if(!p||!row)throw Error('원본 출생 프로필 또는 2.1 획득 근거 없음');
  if(step.band!=='min')throw Error('현재 후보는 실제 원본 출생 최솟값 시나리오만 재생함');
  for(const id of p.requires||[])if(!world.researched.has(id)||world.disabled.has(id))
    throw Error('출생의 무조건 필요 연구 미완료/폐쇄: '+id);
  for(const id of p.requiresBaseFunc||[])if(!world.baseFunctions.has(id))throw Error('출생 기지 기능 미확보: '+id);
  const notes=['출생 수치: 원본 최솟값 벡터를 지정한 시나리오. 실제 출생 RNG·인수 시점은 미실측.'];
  if(p.sourceType==='event'){
    const alt=row.prerequisites?.event?.alternatives?.find(a=>a.script===step.script);
    if(!alt)throw Error('지정한 출생 이벤트 대안 없음');
    const judgment=eventScriptVerdict(originEventScript(alt,p.sourceId),world,{mode:'current'});
    if(judgment.kind==='blocked')throw Error('출생 이벤트 차단: '+judgment.blocked.join('; '));
    if(step.assumeOutcome!==true)throw Error('확률/스케줄 출생 가정이 명시되지 않음');
    notes.push('이벤트 대안 '+alt.script,...judgment.pending,...judgment.unknown);
    world.generatedEvents[p.sourceId]=own(world.generatedEvents,p.sourceId)+1;
  }else{
    for(const [id,n] of Object.entries(p.acquisitionRequiredItems||{}))
      if(own(world.items,id)<n)throw Error('출생 재료 부족: '+id);
    const cost=Number(p.cost||0);
    if(world.funds<cost)throw Error('고용/제조 자금 부족');
    world.funds-=cost;
    for(const [id,n] of Object.entries(p.acquisitionRequiredItems||{}))world.items[id]-=n;
  }
  const state=initialState(data,p,{band:'min'});
  if(!STAT_KEYS.every(k=>Number.isInteger(state.currentStats[k])&&Number.isInteger(state.initialStats[k])))
    throw Error('원본 최솟값이 정수 출생 상태가 아님');
  state.exactStats=true;state.historyKnown=true;
  world.soldiers.push({id:step.soldier,state,commendations:{}});
  return {world,notes,assumed:true};
}
export function applyOriginWitnessStep(input,step,data){
  const world=structuredClone(input);
  try{
    if(world.pendingFree&&step.type!=='freeResearch')throw Error('무료 지급 추첨을 처리하기 전 다른 단계 삽입 금지');
    if(step.type==='externalInputs'){
      if(step.assumption!==true||!step.reason)throw Error('미확보 자원 가정을 명시해야 함');
      for(const [id,n] of Object.entries(step.items||{})){
        if((!data.itemSupply?.[id]&&!data.sourceItemIds?.has(id))||!Number.isSafeInteger(n)||n<1||n>1000000)
          throw Error('원본에 없는 물품/잘못된 수량: '+id);
        world.items[id]=own(world.items,id)+n;
      }
      const known=new Set([...Object.values(data.researchRules).flatMap(r=>arr(r.requiresBaseFunc)),
        ...data.transformations.flatMap(t=>arr(t.requiresBaseFunc)),...data.profiles.flatMap(p=>arr(p.requiresBaseFunc))]);
      for(const id of step.functions||[]){if(!known.has(id))throw Error('알 수 없는 기지 기능: '+id);world.baseFunctions.add(id);}
      if(step.funds!=null){if(!Number.isSafeInteger(step.funds)||step.funds<0||step.funds>1000000000)throw Error('자금 가정 범위 오류');world.funds+=step.funds;}
      return {ok:true,world,assumed:true,notes:['외부 획득 미검증: '+step.reason]};
    }
    if(step.type==='recruit')return {ok:true,...recruit(world,step,data)};
    const result=verifyCampaignSequence(world,[step],data);
    if(result.trace?.length!==1||result.trace[0].kind!=='applied')
      throw Error(result.trace?.at(-1)?.reason?.join('; ')||result.message||'기존 재생기에서 승인되지 않음');
    // OXCE consumes a destroyItem sample when its laboratory project starts.
    // The legacy completion verifier validates the sample but does not deduct
    // it; this wrapper accounts for the one consumption, not for free grants.
    if(step.type==='research'){
      const r=data.researchRules[step.id];
      if(r.needItem&&r.destroyItem){const id=r.neededItem||step.id;
        if(own(result.world.items,id)<1)throw Error('연구 표본 소모 부족: '+id);
        result.world.items[id]--;
      }
    }
    return {ok:true,world:result.world,notes:result.trace[0].notes||[],
      assumed:result.kind==='conditional'||step.type==='advanceMonth'};
  }catch(error){return {ok:false,world:input,reason:error.message};}
}
export function replayOriginWitness(steps,data){
  let world=foundationWorld();const trace=[];let conditional=false;
  if(!Array.isArray(steps)||steps.length>600)return {ok:false,reason:'경로 단계 제한 초과',trace};
  for(const [index,step] of steps.entries()){
    const before=world;
    const result=applyOriginWitnessStep(world,step,data);
    if(!result.ok)return {ok:false,reason:result.reason,failedAt:index,trace,world};
    const added=[...result.world.researched].filter(id=>!before.researched.has(id));
    const closed=[...result.world.disabled].filter(id=>!before.disabled.has(id));
    trace.push({index,type:step.type,id:step.id||step.research||step.profile||step.transform||null,
      added,closed,notes:result.notes,conditional:result.assumed});
    conditional ||= result.assumed;world=result.world;
  }
  if(world.pendingFree)return {ok:false,reason:'완료 시점 무료 지급 미처리',trace,world};
  const member=world.soldiers.find(x=>x.id==='origin');
  const raw=member?Object.fromEntries(WITNESS_STATS.map(k=>[k,member.state.currentStats[k]])):null;
  const bonus=member?bonusStats(member.state,data,{commendations:member.commendations}):null;
  const stats=member?Object.fromEntries(WITNESS_STATS.map(k=>[k,Math.max(k==='health'?1:0,raw[k]+(bonus[k]||0))])):null;
  return {ok:true,conditional,world,trace,raw,bonus,stats,
    total:stats?WITNESS_STATS.reduce((s,k)=>s+stats[k],0):null,
    exact:member?.state.exactStats===true,certifiedMaximum:false};
}
