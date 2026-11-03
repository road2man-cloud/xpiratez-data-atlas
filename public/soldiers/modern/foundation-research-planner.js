// Goal-directed planning from ZERO completed research. This only selects
// actions; origin-witness -> campaign-proof owns all research state changes.
import {foundationWorld,applyOriginWitnessStep,originEventScript} from './origin-witness.js';
const arr=x=>Array.isArray(x)?x:[];
const uniq=x=>[...new Set(x.filter(Boolean))];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createFoundationResearchPlanner(data,{maxAttempts=650,maxDepth=38,maxSteps=420}={}){
  const rules=data.researchRules,methods=new Map(Object.keys(rules).map(id=>[id,[]]));
  const add=(id,m)=>{if(methods.has(id)&&!m.deps.includes(id))methods.get(id).push(m)};
  const sampleCost=r=>(r.needItem?10:0)+arr(r.requiresBaseFunc).length*3;
  const knownSample=(id,r)=>!r.needItem||data.itemSupply?.[r.neededItem||id]||data.sourceItemIds?.has(r.neededItem||id);
  for(const [id,r] of Object.entries(rules)){
    if(id==='STR_UNAVAILABLE')continue;
    if(r.cost>0&&!arr(r.requires).length&&knownSample(id,r))add(id,{kind:'lab',deps:arr(r.dependencies),cost:1+sampleCost(r)});
    if(r.cost===0&&!arr(r.requires).length&&knownSample(id,r))add(id,{kind:'auto',deps:arr(r.dependencies).length?arr(r.dependencies):['STR_WAT_DO'],cost:1+sampleCost(r)});
    for(const target of arr(r.unlocks)){
      const t=rules[target];if(!t||target==='STR_UNAVAILABLE')continue;
      if(t.cost>0&&!arr(t.requires).length&&knownSample(target,t))add(target,{kind:'unlock',source:id,deps:[id],cost:2+sampleCost(t)});
      if(t.cost===0&&knownSample(target,t))add(target,{kind:'auto-source',source:id,deps:uniq([...arr(t.requires),id]),cost:1+sampleCost(t)});
    }
    for(const target of uniq(arr(r.getOneFree)))add(target,{kind:'free',source:id,deps:[id],cost:3+(r.getOneFree.length>1?4:0)});
    for(const [guard,targets] of Object.entries(r.getOneFreeProtected||{}))for(const target of uniq(arr(targets)))
      add(target,{kind:'free',source:id,guard,deps:uniq([guard,id]),cost:8});
    if(r.lookup&&r.lookup!==id)add(r.lookup,{kind:'lookup',source:id,deps:[id],cost:1});
  }
  const eventAwardsByEvent=new Map();
  for(const [id,sources] of Object.entries(data.eventResearchSources||{}))
    for(const source of sources)for(const script of arr(source.scripts)){
      if(script.executionOdds===0||script.lastMonth===0&&script.firstMonth>0)continue;
      add(id,{kind:'event',deps:arr(script.researchPositive),event:source.event,script,cost:18});
      const awards=eventAwardsByEvent.get(source.event)||[];
      awards.push({research:id,script});
      eventAwardsByEvent.set(source.event,awards);
    }
  // OXCE mission-success unlockedResearch is not an item sample, and it
  // must not be silently paid on a mission's mere existence. Only actual
  // v.o2 mission-script sources for unresolved zero-cost sample tokens are
  // considered; the mission and victory are explicit conditional actions.
  for(const [id,sources] of Object.entries(data.missionResearchSources||{})){
    const rule=rules[id];
    if(!rule||rule.cost!==0||rule.needItem!==true||knownSample(id,rule))continue;
    for(const mission of sources)for(const script of arr(mission.scripts)){
      if(script.executionOdds===0)continue;
      add(id,{kind:'mission',deployment:mission.deployment,script,
        deps:arr(script.researchPositive),cost:16+
          (Number(script.executionOdds)<100?4:0)});
    }
  }
  // A relaxed cost is a routing heuristic only; the result is always replayed.
  const distance=new Map();
  for(let round=0;round<70;round++){
    let changed=false;
    for(const [id,options] of methods)for(const m of options){
      if(!m.deps.every(d=>distance.has(d)))continue;
      const v=m.cost+m.deps.reduce((s,d)=>s+distance.get(d),0);
      if(!distance.has(id)||v<distance.get(id)){distance.set(id,v);changed=true;}
    }
    if(!changed)break;
  }
  for(const options of methods.values())options.sort((a,b)=>{
    const cost=m=>m.cost+m.deps.reduce((s,d)=>s+(distance.get(d)??1e8),0);
    return cost(a)-cost(b)||JSON.stringify(a).localeCompare(JSON.stringify(b),'en');
  });
  function newNode(){return {world:foundationWorld(),steps:[],trace:[],diagnostics:[]};}
  // applyOriginWitnessStep is copy-on-write, so branches can share an immutable
  // parent world. Cloning the full research set before EVERY attempted action
  // would duplicate the engine's own state copy.
  const clone=n=>({world:n.world,steps:[...n.steps],trace:[...n.trace],diagnostics:[...n.diagnostics]});
  function append(n,step){
    if(n.steps.length>=maxSteps)throw Error('탐색 단계 제한');
    const before=n.world;
    const result=applyOriginWitnessStep(before,step,data);
    if(!result.ok)throw Error(result.reason);
    const world=result.world;
    n.trace.push({index:n.steps.length,type:step.type,
      id:step.id||step.research||step.profile||step.transform||null,
      added:[...world.researched].filter(id=>!before.researched.has(id)),
      closed:[...world.disabled].filter(id=>!before.disabled.has(id)),
      reopened:[...before.disabled].filter(id=>!world.disabled.has(id)),
      notes:result.notes,conditional:result.assumed});
    n.world=world;n.steps.push(step);return n;
  }
  function supply(n,{items={},functions=[],funds=0},reason){
    const required={};for(const [id,qty] of Object.entries(items)){
      const lack=Math.max(0,Number(qty)-Number(n.world.items[id]||0));
      if(lack)required[id]=Math.ceil(lack);
    }
    const missing=functions.filter(f=>!n.world.baseFunctions.has(f));
    const money=Math.max(0,Math.ceil(funds-n.world.funds));
    if(Object.keys(required).length||missing.length||money)
      append(n,{type:'externalInputs',items:required,functions:missing,funds:money,reason,assumption:true});
    return n;
  }
  function sample(n,id){const r=rules[id];return supply(n,{items:r.needItem?{[r.neededItem||id]:1}:{},functions:arr(r.requiresBaseFunc)},'연구 표본·기지 기능: '+id);}
  function finish(n,preferred,goalSet){
    if(!n.world.pendingFree)return n;
    const token=n.world.pendingFree;
    const choices=token.choices.filter(id=>rules[id]&&!active(n.world,id)&&!n.world.disabled.has(id));
    if(!choices.length)throw Error('해석 가능한 무료 지급 후보 없음');
    const best=token.sequential?choices[0]:choices.includes(preferred)?preferred:
      choices.find(id=>goalSet.has(id)&&!arr(rules[id]?.disables).some(x=>goalSet.has(x)))||
      choices.find(id=>!arr(rules[id]?.disables).length)||choices[0];
    append(n,{type:'freeResearch',source:token.source,research:best,assumeOutcome:!token.sequential&&token.choices.length>1});
    return n;
  }
  // A one-time sequential event must actually OCCUR, not merely have its
  // reward topic obtained from an unrelated free-research route. Replay the
  // recorded predecessor's own event award and exact trigger conditions.
  function ensureEarlierEvents(script,start,seen,depth,budget,goalSet,eventSeen=new Set()){
    let n=start;
    for(const event of arr(script.oneTimeEarlier)){
      if(n.world.generatedEvents?.[event])continue;
      n=ensureEventAward(event,n,seen,depth+1,budget,goalSet,eventSeen);
      if(!n)return null;
    }
    return n;
  }
  function ensureEventAward(event,start,seen,depth,budget,goalSet,eventSeen=new Set()){
    if(start.world.generatedEvents?.[event])return start;
    if(eventSeen.has(event)||depth>maxDepth)return null;
    const visiting=new Set(eventSeen);visiting.add(event);
    for(const source of eventAwardsByEvent.get(event)||[]){
      if(active(start.world,source.research))continue;
      let n=clone(start);
      try{
        n=ensureEarlierEvents(source.script,n,seen,depth+1,budget,goalSet,visiting);
        if(!n)continue;
        let blocked=false;
        for(const dep of arr(source.script.researchPositive)){
          const next=solve(dep,n,seen,depth+1,budget,goalSet);
          if(!next){blocked=true;break;}
          n=next;
        }
        if(blocked)continue;
        const first=Math.max(0,Number(source.script.firstMonth)||0);
        if(n.world.month<first)append(n,{type:'advanceMonth',month:first,assumeContinuity:true});
        supply(n,{items:Object.fromEntries(arr(source.script.itemPositive).map(id=>[id,1]))},
          '일회성 선행 이벤트 조건: '+event);
        append(n,{type:'eventResearch',event,script:source.script.script,
          research:source.research,assumeOutcome:true});
        finish(n,source.research,goalSet);
        if(n.world.generatedEvents?.[event])return n;
      }catch(error){budget.last=error.message;}
    }
    return null;
  }
  function solve(id,start,seen,depth,budget,goalSet,preferred=null){
    if(active(start.world,id))return start;
    if(id==='STR_UNAVAILABLE'||!rules[id]||start.world.disabled.has(id)||seen.has(id)||depth>maxDepth)return null;
    if(++budget.attempts>maxAttempts)return null;
    const visiting=new Set(seen);visiting.add(id);
    const options=(methods.get(id)||[]).filter(m=>m.deps.every(d=>distance.has(d))).slice(0,9);
    for(const m of options){
      if(budget.attempts>maxAttempts)break;
      let n=clone(start);
      try{
        if(['lab','unlock','auto','auto-source'].includes(m.kind))sample(n,id);
        if(m.kind==='free'&&active(n.world,m.source))continue;
        if(m.kind==='event'&&arr(m.script.oneTimeEarlier).length){
          n=ensureEarlierEvents(m.script,n,visiting,depth,budget,goalSet);
          if(!n)continue;
        }
        const ordered=m.deps;
        let failed=false;
        for(const dep of ordered){
          const result=solve(dep,n,visiting,depth+1,budget,goalSet,m.kind==='free'&&dep===m.source?id:null);
          if(!result){failed=true;break;}n=result;
        }
        if(failed)continue;
        if(active(n.world,id))return n;
        if(m.kind==='lab'||m.kind==='unlock'){
          sample(n,id);append(n,{type:'research',id});finish(n,preferred,goalSet);
        }else if(m.kind==='event'){
          const s=m.script;
          const first=Math.max(0,Number(s.firstMonth)||0,
            s.mode==='weighted'?Math.min(...arr(s.monthWeights).filter(w=>w.weight>0).map(w=>w.month)):0);
          if(!Number.isFinite(first))continue;
          if(n.world.month<first)append(n,{type:'advanceMonth',month:first,assumeContinuity:true});
          supply(n,{items:Object.fromEntries(arr(s.itemPositive).map(x=>[x,1]))},'이벤트 발생 조건: '+m.event);
          append(n,{type:'eventResearch',event:m.event,script:s.script,research:id,assumeOutcome:true});
          finish(n,preferred,goalSet);
        }else if(m.kind==='mission'){
          const s=m.script,first=Math.max(0,Number(s.firstMonth)||0);
          if(n.world.month<first)append(n,{type:'advanceMonth',month:first,assumeContinuity:true});
          append(n,{type:'missionResearch',deployment:m.deployment,
            script:s.script,research:id,assumeOutcome:true});
          finish(n,preferred,goalSet);
        }else if(m.kind==='auto'&&!active(n.world,id)){
          // Queue runs on an ACTUAL next completion, never by granting id.
          const trigger=Object.entries(rules).find(([x,r])=>x!==id&&!visiting.has(x)&&!n.world.researched.has(x)&&
            !n.world.disabled.has(x)&&r.cost>0&&!r.needItem&&!arr(r.requires).length&&
            !arr(r.requiresBaseFunc).length&&arr(r.dependencies).every(d=>active(n.world,d)));
          if(trigger){append(n,{type:'research',id:trigger[0]});finish(n,preferred,goalSet);}
        }
        if(active(n.world,id))return n;
      }catch(error){budget.last=error.message;}
    }
    return null;
  }
  function ensure(goals,start=newNode()){
    const budget={attempts:0,last:null},targets=uniq(goals),goalSet=new Set(targets);let node=clone(start);
    for(const id of targets){
      const next=solve(id,node,new Set(),0,budget,goalSet);
      if(!next)return {ok:false,node:start,unresolved:id,attempts:budget.attempts,
        reason:budget.last||'연구실·직접 해금·무료 지급·자동 큐·이벤트 경로의 제한 탐색 미완료'};
      node=next;
    }
    const missing=targets.filter(id=>!active(node.world,id));
    if(missing.length)return {ok:false,node:start,unresolved:missing[0],attempts:budget.attempts,reason:'나중 선택이 필요한 연구를 폐쇄함'};
    return {ok:true,node,attempts:budget.attempts};
  }
  return {newNode,ensure,append,supply,clone,distance,methods};
}
