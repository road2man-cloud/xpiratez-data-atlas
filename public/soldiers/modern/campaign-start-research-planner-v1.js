// Source-backed campaign start variant. No externalInputs. Bounded conditional search only.
// Branch-scoped fork of context-v2. Separate source preserves existing replay fingerprints.
// Goal-directed planning from ZERO completed research. This only selects
// actions; origin-witness -> campaign-proof owns all research state changes.
import {applyOriginWitnessStep,originEventScript} from './origin-witness.js';
import {campaignStartWorld,labVerdict,availableResearch,applyCampaignStartStep} from './campaign-start-gate-v1.js';
import {purchaseRequirements} from './campaign-start-reachability-v1.js';
import {facilityRules,facilityMaterials,freeFacilityPosition} from './campaign-start-construction-v1.js';
import {eventItemRoutes} from './campaign-start-event-rules-v1.js';
import {auditOriginCampaignContext} from './origin-campaign-context.js';
const arr=x=>Array.isArray(x)?x:[];
const uniq=x=>[...new Set(x.filter(Boolean))];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createCampaignStartResearchPlanner(data,snapshot,{maxAttempts=650,maxDepth=38,maxSteps=420,
  collectFailures=false,difficulty=snapshot.difficulty,methodLimit=24,forbiddenResearch=[],preserveResearch=[]}={}){
  const forbidden=new Set(forbiddenResearch),commitments=new Set(preserveResearch);
  if(difficulty!==snapshot.difficulty)throw Error('snapshot-difficulty-mismatch');
  const initial=campaignStartWorld(data,snapshot);
  const supplyStack=new Set(),facilityStack=new Set();
  if(difficulty!=null&&(!Number.isInteger(difficulty)||difficulty<0||difficulty>4))
    throw Error('Fixed campaign difficulty must be an integer from 0 through 4');
  if(!Number.isInteger(methodLimit)||methodLimit<1||methodLimit>200)
    throw Error('Method limit must be a bounded positive integer');
  const fits=s=>difficulty==null||(difficulty>=Number(s.otherConditions?.minDifficulty??0)&&difficulty<=Number(s.otherConditions?.maxDifficulty??4));
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
      if(!fits(script)||script.executionOdds===0||script.lastMonth===0&&script.firstMonth>0)continue;
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
      if(!fits(script)||script.executionOdds===0)continue;
      add(id,{kind:'mission',deployment:mission.deployment,script,
        deps:arr(script.researchPositive),cost:16+
          (Number(script.executionOdds)<100?4:0)});
    }
  }
  // The selected branch is a model restriction, not a global impossibility proof.
  for(const [id,options] of methods)methods.set(id,forbidden.has(id)?[]:options.filter(m=>!m.deps.some(k=>forbidden.has(k))));
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
  function newNode(){
    const node={world:structuredClone(initial),steps:[],trace:[],diagnostics:[]};
    return node;
  }
  // applyOriginWitnessStep is copy-on-write, so branches can share an immutable
  // parent world. Cloning the full research set before EVERY attempted action
  // would duplicate the engine's own state copy.
  const clone=n=>({world:n.world,steps:[...n.steps],trace:[...n.trace],diagnostics:[...n.diagnostics]});
  function append(n,step){
    if(n.steps.length>=maxSteps)throw Error('탐색 단계 제한');
    const before=n.world;
    if(step.type==='externalInputs'||step.type==='campaignContext')throw Error('FORBIDDEN_EXTERNAL_STATE');
    if(['research','repeatResearch'].includes(step.type)){
      const v=labVerdict(before,step.id,data,{repeat:step.type==='repeatResearch'});
      if(!v.ok)throw Error('LAB_NOT_AVAILABLE: '+step.id+' '+v.reason);
    }
    const result=applyCampaignStartStep(before,step,data);
    if(!result.ok)throw Error(result.reason);
    const world=result.world;
    if([...world.researched].some(k=>forbidden.has(k)&&!before.researched.has(k))||[...forbidden].some(k=>active(world,k)&&!active(before,k)))throw Error('BRANCH_FORBIDDEN_RESEARCH');
    if([...commitments].some(k=>active(before,k)&&!active(world,k)))throw Error('BRANCH_COMMITMENT_LOST');
    if(['eventResearch','missionResearch','recruit'].includes(step.type)){
      const ctx=auditOriginCampaignContext([...n.steps,step],data);
      if(ctx.kind!=='compatible'||difficulty!=null&&!ctx.allowedDifficulties.includes(difficulty))throw Error('CAMPAIGN_CONTEXT_CONFLICT: '+JSON.stringify({conflicts:ctx.conflicts,unknown:ctx.unknown}));
    }
    n.trace.push({index:n.steps.length,type:step.type,
      id:step.id||step.research||step.profile||step.transform||null,
      added:[...world.researched].filter(id=>!before.researched.has(id)),
      closed:[...world.disabled].filter(id=>!before.disabled.has(id)),
      reopened:[...before.disabled].filter(id=>!world.disabled.has(id)),
      notes:result.notes,conditional:result.assumed});
    n.world=world;n.steps.push(step);return n;
  }
  // Supply is an actual sequence of manufacture actions, never a resource grant.
  // Research-only: source-gated purchases, facilities, fixed events and manufacturing; no monetary simulation.
  function supply(n,{items={},functions=[],funds=0},reason,budget=null,goalSet=new Set(),depth=0){
    budget ||= {attempts:0,last:null,failures:[],deadEnds:[]};
    if(depth>maxDepth)throw Error('SUPPLY_DEPTH_LIMIT');
    const checkFunctions=()=>functions.filter(f=>!n.world.baseFunctions.has(f));
    for(const f of checkFunctions()){
      if(n.world.baseFunctions.has(f))continue;
      if(facilityStack.has(f))throw Error('FACILITY_CYCLE:'+f);
      facilityStack.add(f);
      let solved=null;
      try{
        for(const [id,r] of Object.entries(facilityRules(data))){
          if(!arr(r.provideBaseFunc).includes(f)||arr(r.requiresBaseFunc).includes(f)||arr(r.buildOverFacilities).length)continue;
          if(++budget.attempts>maxAttempts)break;
          let trial=clone(n);
          try{
            for(const dep of arr(r.requires)){
              const next=solve(dep,trial,new Set(),depth+1,budget,goalSet);
              if(!next)throw Error('FACILITY_RESEARCH_UNRESOLVED:'+dep);
              trial=next;
            }
            if(trial.world.baseFunctions.has(f)){solved=trial;break;}
            supply(trial,{items:facilityMaterials(r),functions:arr(r.requiresBaseFunc)},'facility '+id,budget,goalSet,depth+1);
            append(trial,{type:'acquireFacility',id});
            if(!trial.world.baseFunctions.has(f))throw Error('FACILITY_FUNCTION_SHORTFALL:'+f);
            solved=trial;break;
          }catch(e){budget.last=e.message;}
        }
      }finally{facilityStack.delete(f);}
      if(!solved)throw Error('UNRESOLVED_FUNCTION:'+f+' / '+(budget.last||'no provider'));
      Object.assign(n,solved);
    }
    for(const [id,qty] of Object.entries(items)){
      if(!Number.isSafeInteger(qty)||qty<0)throw Error('INVALID_SUPPLY_QUANTITY: '+id);
      if(Number(n.world.items[id]||0)>=qty)continue;
      if(supplyStack.has(id))throw Error('SUPPLY_CYCLE: '+id);
      supplyStack.add(id);
      let solved=null;
      try{
        for(const [research,grants] of Object.entries(data.campaignAssets?.researchGrants||{})){
          if(!(grants[id]>0)||active(n.world,research)||n.world.paidResearchGrants?.has(research))continue;
          if(++budget.attempts>maxAttempts)break;
          try{
            const trial=solve(research,clone(n),new Set(),depth+1,budget,goalSet);
            if(trial&&Number(trial.world.items[id]||0)>=qty){solved=trial;break;}
          }catch(e){budget.last=e.message;}
        }
        for(const route of solved?[]:eventItemRoutes(id)){
          if(++budget.attempts>maxAttempts)break;
          if(n.world.generatedEvents?.[route.event])continue;
          let trial=clone(n);
          try{
            for(const dep of arr(route.script.researchPositive)){
              const next=solve(dep,trial,new Set(),depth+1,budget,goalSet);
              if(!next)throw Error('EVENT_RESEARCH_UNRESOLVED: '+dep);
              trial=next;
            }
            supply(trial,{items:Object.fromEntries(arr(route.script.itemPositive).map(k=>[k,1]))},
              'event trigger '+route.event,budget,goalSet,depth+1);
            if(trial.world.month<route.script.firstMonth)append(trial,{type:'advanceMonth',month:route.script.firstMonth,assumeContinuity:true});
            append(trial,{type:'eventResearch',event:route.event,script:route.script.script,research:route.research,assumeOutcome:true});
            finish(trial,route.research,goalSet);
            if(Number(trial.world.items[id]||0)<qty)throw Error('EVENT_OUTPUT_SHORTFALL');
            solved=trial;break;
          }catch(e){budget.last=e.message;}
        }
        // Item-only events have no research reward to fake as a completion.
        for(const route of solved?[]:arr(data.campaignAssets?.fixedItemEvents?.[id])){
          if(++budget.attempts>maxAttempts)break;
          if(n.world.generatedEvents?.[route.event]||!fits(route.script))continue;
          let trial=clone(n);
          try{
            if(Number(trial.world.items[id]||0)+(route.items[id]||0)<qty)throw Error('FIXED_EVENT_OUTPUT_SHORTFALL:'+id);
            for(const dep of arr(route.script.researchPositive)){
              const next=solve(dep,trial,new Set(),depth+1,budget,goalSet);
              if(!next)throw Error('FIXED_EVENT_RESEARCH_UNRESOLVED:'+dep);
              trial=next;
            }
            supply(trial,{items:Object.fromEntries(arr(route.script.itemPositive).map(k=>[k,1]))},'fixed event '+route.event,budget,goalSet,depth+1);
            const first=Math.max(0,Number(route.script.firstMonth)||0);
            if(trial.world.month<first)append(trial,{type:'advanceMonth',month:first,assumeContinuity:true});
            append(trial,{type:'acquireEventItems',event:route.event,script:route.script.script,item:id,count:route.items[id],assumeOutcome:true});
            if(Number(trial.world.items[id]||0)<qty)throw Error('FIXED_EVENT_OUTPUT_SHORTFALL:'+id);
            solved=trial;break;
          }catch(e){budget.last=e.message;}
        }
        // A fixed map item requires an actual indexed mission victory. The
        // research award and item recovery are recorded as one action.
        for(const route of solved?[]:arr(data.campaignAssets?.missionLoot?.[id])){
          if(++budget.attempts>maxAttempts)break;
          if(n.world.completedMissions?.has(route.deployment)||!fits(route.script))continue;
          let trial=clone(n);
          try{
            if(Number(trial.world.items[id]||0)+route.count<qty)throw Error('MISSION_FIXED_LOOT_SHORTFALL:'+id);
            for(const dep of uniq([...arr(route.craftResearch),...arr(route.script.researchPositive)])){
              const next=solve(dep,trial,new Set(),depth+1,budget,goalSet);
              if(!next)throw Error('MISSION_PREREQUISITE_UNRESOLVED:'+dep);
              trial=next;
            }
            supply(trial,{items:Object.fromEntries(arr(route.script.itemPositive).map(k=>[k,1]))},'mission trigger '+route.deployment,budget,goalSet,depth+1);
            const first=Math.max(0,Number(route.script.firstMonth)||0);
            if(trial.world.month<first)append(trial,{type:'advanceMonth',month:first,assumeContinuity:true});
            append(trial,{type:'missionResearch',deployment:route.deployment,script:route.script.script,
              research:route.research,assumeOutcome:true,recoverFixedItem:{item:id,count:route.count,
              terrain:route.terrain,block:route.block,craft:route.craft,assumeTransport:true,assumeRecovery:true}});
            finish(trial,route.research,goalSet);
            if(Number(trial.world.items[id]||0)<qty)throw Error('MISSION_FIXED_LOOT_SHORTFALL:'+id);
            solved=trial;break;
          }catch(e){budget.last=e.message;}
        }
        const purchase=purchaseRequirements(data,id);
        if(!solved&&purchase&&++budget.attempts<=maxAttempts){
          let trial=clone(n);
          try{
            for(const dep of purchase.research){
              const next=solve(dep,trial,new Set(),depth+1,budget,goalSet);
              if(!next)throw Error('PURCHASE_RESEARCH_UNRESOLVED:'+dep);
              trial=next;
            }
            supply(trial,{functions:purchase.functions},'purchase '+id,budget,goalSet,depth+1);
            const missing=Math.max(0,qty-Number(trial.world.items[id]||0));
            // Do not silently advance months or bypass a monthly quantity limit.
            if(missing)append(trial,{type:'acquirePurchase',item:id,count:missing});
            solved=trial;
          }catch(e){budget.last=e.message;}
        }
        for(const recipe of solved?[]:arr(data.itemSupply?.[id]?.manufacture)){
          if(++budget.attempts>maxAttempts)break;
          const q=Number(recipe.quantity??recipe.count??1);
          if(!Number.isSafeInteger(q)||q<=0||recipe.weight!==undefined)continue;
          let trial=clone(n);
          try{
            for(const dep of arr(recipe.requires)){
              const next=solve(dep,trial,new Set(),depth+1,budget,goalSet);
              if(!next)throw Error('MANUFACTURE_RESEARCH_UNRESOLVED: '+dep);
              trial=next;
            }
            const batches=Math.ceil(Math.max(0,qty-Number(trial.world.items[id]||0))/q);
            if(!batches){solved=trial;break;}
            supply(trial,{items:Object.fromEntries(Object.entries(recipe.requiredItems||{}).map(([k,v])=>[k,Number(v)*batches])),
              functions:arr(recipe.requiresBaseFunc),funds:Number(recipe.cost||0)*batches},
              '제조 재료 '+recipe.id,budget,goalSet,depth+1);
            append(trial,{type:'manufacture',item:id,recipe:recipe.id,count:batches});
            if(Number(trial.world.items[id]||0)<qty)throw Error('MANUFACTURE_OUTPUT_SHORTFALL');
            solved=trial;break;
          }catch(e){budget.last=e.message;}
        }
      }finally{supplyStack.delete(id);}
      if(!solved)throw Error('UNRESOLVED_ITEM: '+id+' x'+qty+' ('+reason+')'+(budget.last?' / '+budget.last:''));
      Object.assign(n,solved);
    }
    if(checkFunctions().length)throw Error('UNRESOLVED_FUNCTION: '+checkFunctions().join(','));
    // Monetary affordability is deliberately outside research reachability.
    // A later recipe may consume an earlier requested material.
    for(const [id,qty] of Object.entries(items))if(Number(n.world.items[id]||0)<qty)
      throw Error('JOINT_SUPPLY_SHORTFALL: '+id);
    return n;
  }
  function sample(n,id,budget,goalSet,depth=0){const r=rules[id];return supply(n,{items:r.needItem?{[r.neededItem||id]:1}:{},functions:arr(r.requiresBaseFunc)},'연구 표본·기지 기능: '+id,budget,goalSet,depth);}
  function finish(n,preferred,goalSet){
    if(!n.world.pendingFree)return n;
    const token=n.world.pendingFree;
    const choices=token.choices.filter(id=>rules[id]&&!active(n.world,id)&&!n.world.disabled.has(id));
    if(!choices.length)throw Error('해석 가능한 무료 지급 후보 없음');
    const allowed=choices.filter(id=>!forbidden.has(id));
    if(!allowed.length||token.sequential&&forbidden.has(choices[0]))throw Error('BRANCH_FREE_AWARD_FORBIDDEN');
    const safe=allowed.filter(id=>!arr(rules[id]?.disables).some(x=>goalSet.has(x)||commitments.has(x)));
    const pool=safe.length?safe:allowed;
    const best=token.sequential?choices[0]:pool.includes(preferred)?preferred:
      pool.find(id=>goalSet.has(id))||
      pool.find(id=>!arr(rules[id]?.disables).length)||pool[0];
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
          '일회성 선행 이벤트 조건: '+event,budget,goalSet,depth);
        append(n,{type:'eventResearch',event,script:source.script.script,
          research:source.research,assumeOutcome:true});
        finish(n,source.research,goalSet);
        if(n.world.generatedEvents?.[event])return n;
      }catch(error){
        budget.last=error.message;
        if(collectFailures&&budget.failures.length<240)budget.failures.push({
          goal:source.research,method:'earlier-event',event,script:source.script.script,
          month:n.world.month,reason:error.message});
      }
    }
    return null;
  }
  const repeatableSource=(id,world)=>{
    const r=rules[id],lookup=r?.lookup&&r.lookup!==id?rules[r.lookup]:null;
    const safeLookup=!r?.lookup||r.lookup===id||lookup&&active(world,r.lookup)&&
      !arr(lookup.reenables).length&&!arr(lookup.unlocks).length&&
      !arr(lookup.getOneFree).length&&!Object.keys(lookup.getOneFreeProtected||{}).length;
    return r?.cost>0&&!arr(r.requires).length&&!arr(r.reenables).length&&safeLookup&&
      !arr(r.unlocks).some(x=>arr(rules[x]?.requires).length&&!active(world,x)&&!world.disabled.has(x));
  };
  function repeatForAward(id,preferred,start,budget,goalSet){
    if(!repeatableSource(id,start.world)||!preferred||active(start.world,preferred)||
      start.world.disabled.has(preferred)||++budget.attempts>maxAttempts)return null;
    const r=rules[id],choices=[...arr(r.getOneFree)];
    for(const [guard,targets] of Object.entries(r.getOneFreeProtected||{}))
      if(active(start.world,guard))choices.push(...arr(targets));
    if(!choices.includes(preferred))return null;
    const n=clone(start);
    try{
      sample(n,id,budget,goalSet);
      append(n,{type:'repeatResearch',id,assumeAvailability:true});
      finish(n,preferred,goalSet);
      return active(n.world,preferred)?n:null;
    }catch(error){budget.last=error.message;return null;}
  }
  function solve(id,start,seen,depth,budget,goalSet,preferred=null){
    if(active(start.world,id))return !preferred||active(start.world,preferred)?start:
      repeatForAward(id,preferred,start,budget,new Set([...goalSet,...seen]));
    if(id==='STR_UNAVAILABLE'||forbidden.has(id)||!rules[id]||start.world.disabled.has(id)||seen.has(id)||depth>maxDepth){
      if(collectFailures&&budget.deadEnds.length<120)budget.deadEnds.push({goal:id,parent:[...seen].at(-1)||null,
        reason:!rules[id]?'missing-rule':start.world.disabled.has(id)?'disabled':seen.has(id)?'cycle':depth>maxDepth?'depth-limit':'unavailable'});
      return null;
    }
    if(++budget.attempts>maxAttempts)return null;
    const visiting=new Set(seen);visiting.add(id);
    // Re-rank for the actual branch. Already consumed free-research sources
    // must not occupy the bounded shortlist and hide every unspent source.
    const options=(methods.get(id)||[]).filter(m=>
      m.deps.every(d=>distance.has(d)||active(start.world,d))&&
      !(m.kind==='free'&&active(start.world,m.source)&&!repeatableSource(m.source,start.world))&&
      !m.deps.some(d=>start.world.disabled.has(d)))
      .sort((a,b)=>{
        const cost=m=>m.cost+m.deps.reduce((s,d)=>s+(active(start.world,d)?0:distance.get(d)??1e8),0);
        return cost(a)-cost(b)||JSON.stringify(a).localeCompare(JSON.stringify(b),'en');
      }).slice(0,methodLimit);
    const preserve=new Set([...goalSet,...visiting]);
    if(!options.length&&collectFailures&&budget.deadEnds.length<120)
      budget.deadEnds.push({goal:id,parent:[...seen].at(-1)||null,chain:[...seen].slice(-8),reason:'no-usable-method',knownMethods:methods.get(id)?.length||0,
        blockedDependencies:uniq((methods.get(id)||[]).flatMap(m=>m.deps.filter(d=>start.world.disabled.has(d))))});
    for(const m of options){
      if(budget.attempts>maxAttempts)break;
      let n=clone(start);
      try{
        // Do not acquire a target sample before its prerequisite research.
        if(m.kind==='free'&&active(n.world,m.source)&&!repeatableSource(m.source,n.world))continue;
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
        // Acquiring the source by an unrelated free award is not evidence
        // that its own getOneFree ran. A caller requesting a specific payout
        // must observe that payout, not merely the source completion flag.
        if(active(n.world,id)){
          if(!preferred||active(n.world,preferred))return n;
          const repeat=repeatForAward(id,preferred,n,budget,preserve);
          if(repeat)return repeat;
          continue;
        }
        if(m.kind==='lab'||m.kind==='unlock'){
          sample(n,id,budget,preserve,depth);append(n,{type:'research',id});finish(n,preferred,preserve);
        }else if(m.kind==='event'){
          const s=m.script;
          const first=Math.max(0,Number(s.firstMonth)||0,
            s.mode==='weighted'?Math.min(...arr(s.monthWeights).filter(w=>w.weight>0).map(w=>w.month)):0);
          if(!Number.isFinite(first))continue;
          if(n.world.month<first)append(n,{type:'advanceMonth',month:first,assumeContinuity:true});
          supply(n,{items:Object.fromEntries(arr(s.itemPositive).map(x=>[x,1]))},'이벤트 발생 조건: '+m.event,budget,preserve,depth);
          append(n,{type:'eventResearch',event:m.event,script:s.script,research:id,assumeOutcome:true});
          finish(n,preferred,preserve);
        }else if(m.kind==='mission'){
          const s=m.script,first=Math.max(0,Number(s.firstMonth)||0);
          if(n.world.month<first)append(n,{type:'advanceMonth',month:first,assumeContinuity:true});
          append(n,{type:'missionResearch',deployment:m.deployment,
            script:s.script,research:id,assumeOutcome:true});
          finish(n,preferred,preserve);
        }else if(m.kind==='auto'&&!active(n.world,id)){
          // Queue runs on an ACTUAL next completion, never by granting id.
          sample(n,id,budget,preserve,depth);
          const trigger=availableResearch(n.world,data).find(x=>x!==id&&!visiting.has(x)&&!n.world.researched.has(x)&&!forbidden.has(x));
          if(trigger){append(n,{type:'research',id:trigger});finish(n,preferred,preserve);}
        }
        if(active(n.world,id)&&(!preferred||active(n.world,preferred)))return n;
      }catch(error){
        budget.last=error.message;
        if(collectFailures&&budget.failures.length<240)budget.failures.push({goal:id,
          method:m.kind,event:m.event||m.deployment||null,source:m.source||null,
          script:m.script?.script||null,month:n.world.month,reason:error.message});
      }
    }
    return null;
  }
  function ensure(goals,start=newNode()){
    const budget={attempts:0,last:null,failures:[],deadEnds:[]},targets=uniq(goals),goalSet=new Set(targets);let node=clone(start);
    for(const id of targets){
      const next=solve(id,node,new Set(),0,budget,goalSet);
      if(!next)return {ok:false,node:start,unresolved:id,attempts:budget.attempts,
        ...(collectFailures?{failures:budget.failures,deadEnds:budget.deadEnds}:{}),
        reason:budget.last||'연구실·직접 해금·무료 지급·자동 큐·이벤트 경로의 제한 탐색 미완료'};
      node=next;
    }
    const missing=targets.filter(id=>!active(node.world,id));
    if(missing.length)return {ok:false,node:start,unresolved:missing[0],attempts:budget.attempts,reason:'나중 선택이 필요한 연구를 폐쇄함'};
    return {ok:true,node,attempts:budget.attempts};
  }
  return {newNode,ensure,append,supply,clone,distance,methods,scope:'CONDITIONAL_CAMPAIGN_START_PRODUCTION_V1'};
}
