// BOUNDED chronological witness search for a *single continuing soldier*.
//
// A witness is a concrete sequence replayed by verifyCampaignSequence, not
// an exhaustive proof of all future game outcomes. A missing witness is NEVER
// a permanent exclusion. Random/event outcomes are kept in a separate
// conditional search; no save or personal data is transmitted.
import {verifyCampaignSequence} from "./campaign-proof.js";
import {reachableSoldierTypes,structuralTransformationVerdict}
  from "./eligibility.js";
const arr=x=>Array.isArray(x)?x:[];
const owned=(items,id)=>Number(items?.[id]||0);
const sorted=x=>[...(x||[])].sort();
const uniq=x=>[...new Set(x.filter(Boolean))];
function keyOf(node,soldierId){
  const w=node.world,s=w.soldiers.find(x=>x.id===soldierId)?.state;
  return JSON.stringify([
    node.goalIndex,sorted(w.researched),sorted(w.disabled),
    Object.entries(w.items||{}).filter(([,v])=>Number(v)!==0).sort(([a],[b])=>a.localeCompare(b)),
    w.funds,w.month,w.pendingFree,
    w.generatedEvents===null?null:Object.entries(w.generatedEvents||{}).filter(([,v])=>v>0).sort(),
    s&&[s.soldierType,s.armorId,s.rank,s.status,s.retired,s.exactStats,
      sorted(s.history instanceof Map?[...s.history]:Object.entries(s.history||{})),
      sorted(s.bonusIds),s.currentStats,s.initialStats]
  ]);
}
function relevantTransformations(data,goals,startType,limit=45){
  const byId=new Map(arr(data.transformations).map(x=>[x.id,x]));
  const reachable=reachableSoldierTypes(data,startType);
  const selected=new Set(goals);
  const addPredecessors=(id,depth=0)=>{
    if(depth>6)return;
    const row=byId.get(id);
    for(const prev of arr(row?.requiredPreviousTransformations)){
      if(selected.has(prev))continue;
      selected.add(prev);addPredecessors(prev,depth+1);
    }
  };
  goals.forEach(x=>addPredecessors(x));
  // Backward body edges are an over-approximation, never an exclusion proof.
  const targetTypes=new Set([...selected].flatMap(id=>arr(byId.get(id)?.allowedSoldierTypes)));
  for(let round=0;round<5;round++){
    let changed=false;
    for(const t of arr(data.transformations)){
      if(!t.producedSoldierType||t.createsClone||t.producedItem||
        !targetTypes.has(t.producedSoldierType))continue;
      if(!arr(t.allowedSoldierTypes).some(x=>reachable.has(x)))continue;
      if(!selected.has(t.id)){selected.add(t.id);changed=true;}
      for(const type of arr(t.allowedSoldierTypes))
        if(!targetTypes.has(type)){targetTypes.add(type);changed=true;}
    }
    if(!changed)break;
  }
  const forbidden=new Set([...selected].flatMap(id=>arr(byId.get(id)?.forbiddenPreviousTransformations)));
  for(const t of arr(data.transformations))
    if((t.reset||arr(t.removeTransformations).some(id=>forbidden.has(id)))&&
      arr(t.allowedSoldierTypes).some(x=>reachable.has(x)))selected.add(t.id);
  const rows=[...selected].map(id=>byId.get(id)).filter(x=>x&&!x.createsClone&&
    (!x.producedItem||goals.includes(x.id)));
  return {rows:rows.slice(0,limit),truncated:rows.length>limit};
}
function researchPool(data,roots,limit=110){
  const rules=data.researchRules||{};
  const unlock=new Map(),free=new Map(),lookups=new Map();
  for(const [id,r] of Object.entries(rules)){
    // A research's direct lookup is completed after it in OXCE, even when
    // the lookup topic's nominal dependencies were not met. The search must
    // consider the source when a transformation requires the lookup target.
    if(typeof r.lookup==="string"){
      const prior=lookups.get(r.lookup)||[];prior.push(id);
      lookups.set(r.lookup,prior);
    }
    for(const target of arr(r.unlocks)){
      const prior=unlock.get(target)||[];prior.push(id);unlock.set(target,prior);
    }
    for(const target of [...arr(r.getOneFree),...Object.values(r.getOneFreeProtected||{}).flatMap(arr)]){
      const prior=free.get(target)||[];prior.push(id);free.set(target,prior);
    }
  }
  const found=new Set(),queue=uniq(roots).map(id=>({id,depth:0})),speculative=new Set();
  while(queue.length&&found.size<limit){
    const {id,depth}=queue.shift();
    if(found.has(id))continue;
    const rule=rules[id];if(!rule)continue;
    found.add(id);
    if(depth>=7)continue;
    for(const next of uniq([...arr(rule.requires),...arr(rule.dependencies),
      ...arr(lookups.get(id)).slice(0,4),
      ...arr(unlock.get(id)).slice(0,3),...arr(free.get(id)).slice(0,2)]))
      if(!found.has(next))queue.push({id:next,depth:depth+1});
    // A research's potential result may be a guarded free grant.
    for(const [guard] of Object.entries(rule.getOneFreeProtected||{}))
      if(!found.has(guard))queue.push({id:guard,depth:depth+1});
    if(arr(data.eventResearchSources?.[id]).length)speculative.add(id);
  }
  return {ids:[...found],truncated:queue.length>0,speculative:[...speculative],unlock};
}
function itemPool(data,transformations,max=55){
  const goals={};
  for(const t of transformations)for(const [id,amount] of Object.entries(t.requiredItems||{}))
    goals[id]=Math.max(Number(amount)||0,goals[id]||0);
  const explored=new Set(),recipes=[],ambiguousRandom=new Set();
  let next=Object.keys(goals);
  for(let depth=0;depth<3&&next.length&&explored.size<max;depth++){
    const subsequent=[];
    for(const id of next){
      if(explored.has(id)||explored.size>=max)continue;
      explored.add(id);
      const source=data.itemSupply?.[id];
      const deterministic=arr(source?.manufacture);
      const random=arr(source?.randomManufacture).filter(recipe=>
        Number(recipe.weight)>0&&Number(recipe.weightTotal)>0);
      // A single recipe may have multiple output rows for one item.
      // The replayer cannot distinguish different rows with the same ID,
      // so do not silently pick the wrong reward/quantity/probability.
      const variants=new Map();
      for(const recipe of random){
        const key=recipe.id||"";
        const prior=variants.get(key)||[];
        prior.push(recipe);variants.set(key,prior);
      }
      for(const [key,rows] of variants){
        if(rows.length>1&&new Set(rows.map(r=>JSON.stringify([
          r.count,r.quantity,r.weight,r.weightTotal,r.requiredItems
        ]))).size>1)ambiguousRandom.add(id+" / "+key);
      }
      for(const recipe of deterministic){
        recipes.push({item:id,recipe,random:false});
        for(const material of Object.keys(recipe.requiredItems||{}))
          if(!explored.has(material))subsequent.push(material);
      }
      for(const recipe of random){
        if(ambiguousRandom.has(id+" / "+recipe.id))continue;
        if(recipes.some(r=>r.item===id&&r.random&&r.recipe.id===recipe.id))continue;
        recipes.push({item:id,recipe,random:true});
        for(const material of Object.keys(recipe.requiredItems||{}))
          if(!explored.has(material))subsequent.push(material);
      }
    }
    next=uniq(subsequent);
  }
  return {goals,recipes,truncated:next.length>0||ambiguousRandom.size>0,
    ambiguousRandom:[...ambiguousRandom]};
}
function previewAlternativeEvents(data,researchIds,limit=12){
  const events=[];
  for(const id of researchIds){
    for(const route of arr(data.eventResearchSources?.[id]).slice(0,2)){
      for(const script of arr(route.scripts).slice(0,2)){
        // Only advance to months that have a possible positive-weight draw.
        const positives=arr(script.monthWeights).filter(x=>Number(x.weight)>0)
          .map(x=>Number(x.month)).filter(Number.isFinite)
          .sort((a,b)=>a-b);
        if(script.mode==="weighted"&&!positives.length)continue;
        const first=Math.max(0,Number(script.firstMonth)||0,
          script.mode==="weighted"?Math.min(...positives):0);
        const last=script.lastMonth;
        if(last!==null&&last!==undefined&&Number(last)>=0&&first>Number(last))
          continue;
        const futureWindowStarts=script.mode==="weighted"?
          uniq([first,...positives.filter(x=>x>=first)]):[first];
        events.push({type:"eventResearch",event:route.event,
          script:script.script,research:id,assumeOutcome:true,
          firstEligibleMonth:first,lastEligibleMonth:last??null,
          futureWindowStarts});
        if(events.length>=limit)return events;
      }
    }
  }
  return events;
}
function actionsFor(node,pool,strict,goalIds,soldierId,data){
  const w=node.world,person=w.soldiers.find(x=>x.id===soldierId)?.state;
  if(!person)return [];
  const actions=[];
  // Free choice is only available IMMEDIATELY after the matching source
  // research step. It is never inferred from an old completed-research flag.
  if(w.pendingFree){
    const token=w.pendingFree;
    if(token.sequential){
      if(token.choices.length)actions.push({type:"freeResearch",
        source:token.source,research:token.choices[0]});
    }else for(const id of token.choices.slice(0,strict?1:5)){
      if(strict&&token.choices.length>1)continue;
      actions.push({type:"freeResearch",source:token.source,
        research:id,assumeOutcome:!strict});
    }
    // The engine selects this result at source completion; no other action
    // can lawfully interleave with its outstanding one-time roll.
    return actions;
  }
  // Research actions: never create an arbitrary disabled/zero-cost grant,
  // nor bypass its source/availability requirements.
  for(const id of pool.research.ids){
    const rule=data.researchRules[id];
    if(!rule||w.disabled.has(id)||Number(rule.cost)===0||
      (w.researched.has(id)&&!rule.repeatable&&
        !arr(rule.getOneFree).some(x=>!w.researched.has(x)))||
      arr(rule.requires).length)continue;
    if(rule.needItem&&owned(w.items,rule.neededItem||id)<1)continue;
    if(arr(rule.requiresBaseFunc).some(x=>!w.baseFunctions.has(x)))continue;
    const bypass=arr(pool.research.unlock.get(id)).some(source=>w.researched.has(source));
    if(!bypass&&arr(rule.dependencies).some(dep=>!w.researched.has(dep)))continue;
    actions.push({type:"research",id});
  }
  // Current body/required history/stock and funding prune impossible-now
  // actions but not proof of permanent impossibility.
  for(const t of pool.transforms.rows){
    if(person.retired||!arr(t.allowedSoldierTypes).includes(person.soldierType)||
      arr(t.requires).includes("STR_UNAVAILABLE")||
      arr(t.requires).some(id=>!w.researched.has(id)||w.disabled.has(id))||
      arr(t.requiredPreviousTransformations).some(id=>!person.history?.has(id))||
      arr(t.forbiddenPreviousTransformations).some(id=>person.history?.has(id))||
      Object.entries(t.requiredItems||{}).some(([id,n])=>owned(w.items,id)<Number(n))||
      (w.funds!=null&&w.funds<Number(t.cost||0)))continue;
    // Do not consume a later ordered goal before it becomes the next goal.
    if(goalIds.includes(t.id)&&t.id!==goalIds[node.goalIndex])continue;
    if(person.history?.has(t.id)&&!goalIds.includes(t.id)&&!t.reset&&
      !arr(t.removeTransformations).length)continue;
    actions.push({type:"transform",soldier:soldierId,transform:t.id});
  }
  // Only a modeled manufacturer with verified stock, facility and research
  // may create a material; missing supply stays outside the witness.
  for(const {item,recipe,random} of pool.items.recipes){
    if(random&&strict)continue;
    const target=pool.items.goals[item]||1;
    const short=Math.max(0,target-owned(w.items,item));
    if(!short||!arr(recipe.requires).every(id=>w.researched.has(id)&&!w.disabled.has(id))||
      arr(recipe.requiresBaseFunc).some(id=>!w.baseFunctions.has(id)))continue;
    const count=Math.min(20,Math.max(1,Math.ceil(short/Math.max(1,
      Number(recipe.quantity??recipe.count??1)))));
    if(Object.entries(recipe.requiredItems||{}).some(([id,n])=>owned(w.items,id)<Number(n)*count)||
      (w.funds!=null&&w.funds<Number(recipe.cost||0)*count))continue;
    actions.push({type:"manufacture",recipe:recipe.id,item,count,
      ...(random?{assumeOutcome:true,weight:recipe.weight,
        weightTotal:recipe.weightTotal}:null)});
  }
  if(!strict){
    const prospectiveMonths=new Set();
    for(const ev of pool.events){
      if(w.researched.has(ev.research)||w.disabled.has(ev.research))continue;
      actions.push(ev);
      // Time passing also changes financial upkeep and other events. We
      // can model event eligibility, but NOT these world changes: every
      // month jump must therefore stay conditional, never a firm witness.
      if(Number.isInteger(w.month)){
        const next=arr(ev.futureWindowStarts).find(month=>month>w.month&&
          (ev.lastEligibleMonth==null||Number(ev.lastEligibleMonth)<0||
            month<=Number(ev.lastEligibleMonth)));
        if(next!==undefined)prospectiveMonths.add(next);
      }
    }
    for(const month of [...prospectiveMonths].sort((a,b)=>a-b).slice(0,4))
      actions.push({type:"advanceMonth",month,assumeContinuity:true});
  }
  return actions;
}
function searchPass(pool,data,start,soldierId,goals,strict,limits){
  const seed=verifyCampaignSequence(start,[],data);
  if(seed.kind!=="ruleset-consistent")return {kind:"inconclusive",reason:["초기 세계 상태를 해석할 수 없음"]};
  const queue=[{world:seed.world,steps:[],assumptions:[],goalIndex:0}];
  const seen=new Set(),failures=new Map();
  let examined=0,attempts=0,capped=false;
  for(let head=0;head<queue.length;head++){
    if(examined>=limits.maxStates){capped=true;break;}
    const node=queue[head],signature=keyOf(node,soldierId);
    if(seen.has(signature))continue;
    seen.add(signature);examined++;
    if(node.goalIndex===goals.length){
      const replay=verifyCampaignSequence(start,node.steps,data);
      if(["ruleset-consistent","conditional"].includes(replay.kind)&&
        !replay.world?.pendingFree){
        const uncertainty=replay.kind==="conditional"||node.assumptions.length>0;
        return {kind:uncertainty?"conditional":"witness",
          steps:node.steps,assumptions:uncertainty&&!node.assumptions.length?
            ["전체 시퀀스 재생 결과가 조건부이므로 확정 획득을 증명할 수 없음"]:
            node.assumptions,
          replay,examined,attempts,limitsReached:false};
      }
      continue;
    }
    if(node.steps.length>=limits.maxDepth){capped=true;continue;}
    const candidates=actionsFor(node,pool,strict,goals,soldierId,data);
    for(const action of candidates){
      if(++attempts>limits.maxAttempts){capped=true;break;}
      const result=verifyCampaignSequence(node.world,[action],data);
      const executed=result.trace?.[0]?.kind==="applied";
      if(!executed||!["ruleset-consistent","conditional"].includes(result.kind)){
        const why=result.trace?.at(-1)?.reason?.[0];
        if(why)failures.set(why,(failures.get(why)||0)+1);
        continue;
      }
      // An unfinished mandatory free-payout token is NOT a random
      // assumption. Strict search must be allowed to resolve it next.
      if(strict&&result.kind==="conditional"&&!result.world?.pendingFree)continue;
      const goalIndex=action.type==="transform"&&
        action.transform===goals[node.goalIndex]?node.goalIndex+1:node.goalIndex;
      const uncertainAction=action.assumeOutcome===true||
        (result.kind==="conditional"&&!result.world?.pendingFree);
      const assumptionNotes=uncertainAction?result.trace.flatMap(t=>t.notes||[]):[];
      const next={world:result.world,
        steps:[...node.steps,action],goalIndex,
        assumptions:[...node.assumptions,
          ...(assumptionNotes.length?assumptionNotes:uncertainAction?[
            "원본 이벤트·제조의 미증명 결과를 가정"]:[]),
          ...(action.type==="advanceMonth"?[
            "월 "+action.month+"까지 캠페인 유지·기지 비용·다른 이벤트의 영향을 모델링하지 않음"
          ]:[])]};
      queue.push(next);
    }
    if(attempts>limits.maxAttempts)break;
  }
  return {kind:"inconclusive",examined,attempts,
    limitsReached:capped,topBlocks:[...failures].sort((a,b)=>b[1]-a[1])
      .slice(0,6).map(([reason,n])=>({reason,count:n}))};
}
export function searchChronologicalRoute(data,initial,{
  soldierId,goals,maxStates=300,maxDepth=11,maxAttempts=6000,
  includeConditional=true
}={}){
  // Repeated training goals are distinct chronological actions, not a set.
  const goalIds=arr(goals).filter(x=>typeof x==="string"&&x.length>0);
  const soldier=arr(initial?.soldiers).find(x=>x.id===soldierId)?.state;
  if(!soldier||!goalIds.length||goalIds.length>4)
    return {kind:"unverified",reason:["대원과 1~4개의 변신 목표를 지정해야 합니다"]};
  if(!data?.transformations||!data?.researchRules)
    return {kind:"unverified",reason:["2.1 룰셋 자료가 없습니다"]};
  const unknown=goalIds.filter(id=>!data.transformations.some(t=>t.id===id));
  if(unknown.length)return {kind:"unverified",reason:["대상 변신 규칙 누락: "+unknown.join(", ")]};
  const goalRule=data.transformations.find(x=>x.id===goalIds[0]);
  if(goalRule.createsClone)return {kind:"excluded",reason:["원래 대원의 강화 계보에 클론을 합산할 수 없습니다"]};
  const structural=structuralTransformationVerdict(goalRule,soldier,data);
  if(structural.kind==="blocked")
    return {kind:"excluded",reason:[structural.reason],proof:structural.proof||"body/history"};
  const transform=relevantTransformations(data,goalIds,soldier.soldierType);
  const items=itemPool(data,transform.rows);
  const roots=uniq([...transform.rows.flatMap(x=>arr(x.requires)),
    ...items.recipes.flatMap(x=>arr(x.recipe.requires))]);
  const research=researchPool(data,roots);
  const events=previewAlternativeEvents(data,research.ids);
  const pool={transforms:transform,items,research,events};
  const limits={
    maxStates:Math.max(10,Math.min(1600,Math.trunc(maxStates)||300)),
    maxDepth:Math.max(1,Math.min(30,Math.trunc(maxDepth)||11)),
    maxAttempts:Math.max(30,Math.min(30000,Math.trunc(maxAttempts)||6000))
  };
  const strict=searchPass(pool,data,initial,soldierId,goalIds,true,limits);
  const scenario=strict.kind==="witness"||!includeConditional?null:
    searchPass(pool,data,initial,soldierId,goalIds,false,limits);
  const best=strict.kind==="witness"?strict:
    scenario?.kind==="conditional"||scenario?.kind==="witness"?scenario:null;
  const metadata={scope:"bounded; no purchases, battlefield drops, base construction, rank/XP training or unindexed resources; modeled month advances and random manufacture remain conditional",
    goalIds,
    searchLimits:limits,sourceComplete:!transform.truncated&&!items.truncated&&!research.truncated,
    pools:{transforms:transform.rows.length,research:research.ids.length,
      recipes:items.recipes.length,
      randomRecipes:items.recipes.filter(x=>x.random).length,
      ambiguousRandomRecipes:items.ambiguousRandom.length,
      eventScenarios:events.length},
    alternateEventResearch:research.speculative.slice(0,15),
    deterministic:{examined:strict.examined||0,attempts:strict.attempts||0,
      budgetHit:!!strict.limitsReached},
    conditional:scenario?{examined:scenario.examined||0,attempts:scenario.attempts||0,
      budgetHit:!!scenario.limitsReached}:null};
  if(best)return {...best,...metadata,
    kind:best.kind==="witness"&&!initial.evidenceComplete?"conditional":best.kind,
    assumptions:[...best.assumptions,...(!initial.evidenceComplete?
      ["세이브의 필요 재고·훈장·기지 증거 일부 미확인"]:[])]};
  return {kind:"inconclusive",...metadata,
    reason:["주어진 행동 집합·검색 예산 안에서 전체 조건을 충족한 경로를 찾지 못했습니다.",
      "탐색 실패는 영구 상호배제 증명이 아닙니다."],
    topBlocks:strict.topBlocks||scenario?.topBlocks||[]};
}
