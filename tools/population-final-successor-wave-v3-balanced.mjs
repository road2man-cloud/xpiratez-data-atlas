// Dynamic terminal continuation queue. Every action remains an obligation
// until replay or the independently checked final admission gate proves it.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createReachabilityAwareSuccessorIndex} from "./atlas-research-impossibility.mjs";
import {createTerminalDescendantFrontier} from "./population-terminal-descendant-frontier.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createFinalSuccessorWave({data,graphs,branches,terminal,terminalRule,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,materialPolicy,graphFilter=()=>true,bodyFilter=()=>true,deadline,prior={}}){
 const first=createReachabilityAwareSuccessorIndex(data),front=createTerminalDescendantFrontier(graphs,terminal.records);
 const records={...(prior.records||{})},published=new Map(),nodeTurns=new Map(),actionTurns=new Map(),batchActions=new Map(),queued=new Set(),settled=new Set();
 const metrics={policy:"DYNAMIC_FIRST_SUCCESSOR_PRODUCTION_V3_BALANCED",attempts:0,examined:0,growth:0,researchAdvanced:0,researchReady:0,transformed:0,aliases:0,closedCandidates:0,unsupported:0,stalled:0,byBody:{},addedResearch:0,unreachableActions:0,initialCandidates:0,liveEnqueued:0,liveSelected:0,nonLeafSelected:0,postTransformGrowth:0,reachability:first.research.metrics};
 const finite=Object.fromEntries(materialPolicy.finite),nodeKey=(id,i)=>id+"|"+i,actionKey=(id,i,a)=>nodeKey(id,i)+"|"+a;
 for(const r of Object.values(records)){
  if(!Number.isInteger(r.node)||!r.graph||!r.action)continue;
  const n=nodeKey(r.graph,r.node),a=actionKey(r.graph,r.node,r.action);
  nodeTurns.set(n,(nodeTurns.get(n)||0)+1);actionTurns.set(a,(actionTurns.get(a)||0)+1);
 }
 const retain=(id,i)=>{const a=published.get(id)||new Set();a.add(i);published.set(id,a);enqueue(id,i);};
 const seeds=[],live=[];let si=0,li=0,liveStreak=0;
 function schedule(id,i,fresh){
  const k=nodeKey(id,i),g=graphs[id],b=g&&branches.get(g.branch),n=g?.nodes[i];
  if(!n||!b||g.blocker||!graphFilter(g,b)||!bodyFilter(n.body)||queued.has(k)||settled.has(k))return;
  queued.add(k);const v={id,i,g,b,n};
  if(fresh){live.push(v);metrics.liveEnqueued++;}else seeds.push(v);
 }
 function next(){
  const useLive=li<live.length&&(si>=seeds.length||liveStreak<3);
  const v=useLive?live[li++]:seeds[si++];
  if(v){queued.delete(nodeKey(v.id,v.i));if(useLive){liveStreak++;metrics.liveSelected++;}else liveStreak=0;}
  return v;
 }
 function run(limit){
  front.refresh();
  for(const [id,g] of Object.entries(graphs)){
   const b=branches.get(g.branch);if(g.blocker||!b||!graphFilter(g,b))continue;
   for(const i of front.nodes(id))schedule(id,i,false);
  }
  const parents=new Map(Object.entries(graphs).map(([id,g])=>[id,new Set(g.nodes.map(n=>n.parent))]));
  seeds.sort((a,b)=>(nodeTurns.get(nodeKey(a.id,a.i))||0)-(nodeTurns.get(nodeKey(b.id,b.i))||0)||Number(parents.get(a.id).has(a.i))-Number(parents.get(b.id).has(b.i))||(first.byBody.get(a.n.body)?.length||0)-(first.byBody.get(b.n.body)?.length||0)||b.n.traits.length-a.n.traits.length||a.id.localeCompare(b.id)||a.i-b.i);
  // Round-robin the existing sorted per-body lanes. A cheap body cannot
  // consume the whole batch before any other body receives its first job.
  const lanes=new Map();
  for(const c of seeds){const lane=lanes.get(c.n.body)||[];lane.push(c);lanes.set(c.n.body,lane);}
  const order=[...lanes.entries()].sort((a,b)=>a[1].length-b[1].length||a[0].localeCompare(b[0]));
  seeds.length=0;
  const max=Math.max(0,...order.map(([,v])=>v.length));
  for(let j=0;j<max;j++)for(const [,v] of order)if(v[j])seeds.push(v[j]);
  metrics.initialCandidates=seeds.length;metrics.initialByBody=Object.fromEntries(order.map(([body,v])=>[body,v.length]));
  while(metrics.attempts<limit&&(si<seeds.length||li<live.length)&&performance.now()<deadline()){
   const {id,g,b,i,n}=next(),nk=nodeKey(id,i);metrics.examined++;
   if(parents.get(id)?.has(i))metrics.nonLeafSelected++;
   let w,steps,full,targets,q;
   try{
    w=loadNode(id,g,i);const state=member(w)?.state;
    if(!state||state.retired){settled.add(nk);continue;}
    steps=stepsFor(g,i);full=[...g.birthActions,...steps];
    targets=terminalRule.targets.filter(t=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k)));
    if(!targets.length){settled.add(nk);continue;}
    q=first.assess({body:n.body,history:new Set(state.history.keys()),historyKnown:state.historyKnown!==false,active:new Set([...w.researched].filter(k=>active(w,k))),researched:w.researched,disabled:w.disabled,raw:n.raw,capRaw:n.capRaw,finite,consumed:materialPolicy.state(g,i).consumed});
   }catch(e){metrics.stalled++;settled.add(nk);continue;}
   metrics.unreachableActions+=q.blocked.filter(x=>x.reason==="FIRST_ACTION_RESEARCH_UNREACHABLE").length;
   if(q.closed){retain(id,i);metrics.closedCandidates++;settled.add(nk);continue;}
   const possible=q.open.filter(x=>x.live&&!x.clone&&replay.rules.has(x.id));
   // Dead-only, clone and unmodeled obligations stay open. No failed job or
   // time budget establishes closure, even when the active queue is empty.
   const done=batchActions.get(nk)||new Set();batchActions.set(nk,done);
   if(!done.size)metrics.unsupported+=q.open.length-possible.length;
   const jobs=possible.map(x=>({...x,attempts:actionTurns.get(actionKey(id,i,x.id))||0})).sort((a,b)=>a.attempts-b.attempts||a.missingResearch.length-b.missingResearch.length||a.id.localeCompare(b.id));
   if(q.openGrowth)jobs.unshift({id:"CAP_GROWTH",attempts:actionTurns.get(actionKey(id,i,"CAP_GROWTH"))||0,missingResearch:[]});
   const remaining=jobs.filter(x=>!done.has(x.id)),job=remaining[0];
   if(!job){settled.add(nk);continue;}
   done.add(job.id);const ak=actionKey(id,i,job.id),k=key([id,i,job.id,job.attempts]),rec={graph:id,node:i,origin:g.origin,branch:g.branch,body:n.body,action:job.id,attempt:job.attempts,status:"OPEN",goals:job.missingResearch,outcomes:[]};
   records[k]=rec;metrics.attempts++;metrics.byBody[n.body]=(metrics.byBody[n.body]||0)+1;
   actionTurns.set(ak,job.attempts+1);nodeTurns.set(nk,(nodeTurns.get(nk)||0)+1);
   // Existing non-leaf states may still have other valid successor actions.
   // Revisit each distinct action once in the current work batch.
   if(remaining.length>1)schedule(id,i,true);
   try{
    const keep=commit(b),blocked=new Set(b.blockedResearch||[]),allowed=z=>!z.pendingFree&&keep.every(k=>active(z,k))&&targets.every(t=>t.researchGoals.every(k=>active(z,k))&&!(t.inactiveResearch||[]).some(k=>active(z,k)))&&![...z.researched].some(k=>blocked.has(k)||allChoice.has(k)&&!keep.includes(k));
    function add(parent,from,to,suffix,label){
     if(!suffix.length||!allowed(to)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...stepsFor(g,parent),...suffix],to).length)throw Error("SUCCESSOR_CONTEXT");
     if(exactWorld(replay.replay(suffix,from))!==exactWorld(to))throw Error("SUCCESSOR_REPLAY");
     const e=insert(id,g,to,parent,label,suffix,true);retain(id,e.to);
     if(e.status==="CONDITIONAL_ALIAS")metrics.aliases++;else parents.get(id).add(parent);
     schedule(id,e.to,true);return e;
    }
    if(job.id==="CAP_GROWTH"){
     const z=replay.grow({world:w,steps}),e=add(i,w,z.world,z.steps.slice(steps.length),"CLOSURE_GROWTH");rec.outcomes.push(e);rec.status="GROWTH_REPLAY";metrics.growth++;continue;
    }
    const r=replay.rules.get(job.id);let base={world:w,steps},parent=i;
    if(job.missingResearch.length){
     const p=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b);
     const plan=createStagedResearch({planner:p,active,accept:(a,z)=>allowed(z.world),deadline:Math.min(deadline(),performance.now()+4500),maxCalls:12,maxDepth:Infinity,variant:job.attempts}).run({world:w,steps:full,trace:[],diagnostics:[]},r.requires);
     const suffix=plan.node.steps.slice(full.length);rec.remaining=plan.remaining;rec.failures=plan.failures.slice(-2);
     if(suffix.length){
      const e=add(i,w,plan.node.world,suffix,"CLOSURE_RESEARCH:"+r.id);parent=e.to;rec.researchNode=parent;
      rec.added=[...plan.node.world.researched].filter(k=>active(plan.node.world,k)&&!active(w,k));metrics.researchAdvanced++;metrics.addedResearch+=rec.added.length;
      base={world:plan.node.world,steps:stepsFor(g,parent)};
     }
     if(!plan.complete){rec.status=suffix.length?"PARTIAL_RESEARCH":"LIMITED_UNRESOLVED";if(!suffix.length)metrics.stalled++;continue;}
     metrics.researchReady++;
    }
    for(const mode of ["DIRECT","GROW_THEN_TRANSFORM"]){
     if(performance.now()>=deadline())break;
     const z=mode==="DIRECT"?base:replay.grow(base);if(mode!=="DIRECT"&&z===base)continue;
     const v=replay.transform(z,r);if(!v)continue;
     try{
      const e=add(parent,base.world,v.world,v.steps.slice(base.steps.length),"CLOSURE_TRANSFORM:"+r.id);rec.outcomes.push({mode,...e});
      if(e.status==="CONDITIONAL_REPLAY")metrics.transformed++;
      // Immediately try growth after the transformation, but preserve both
      // states. A later surgery may require a different growth order.
      if(performance.now()<deadline()){
       const actual=loadNode(id,g,e.to),aSteps=stepsFor(g,e.to),grown=replay.grow({world:actual,steps:aSteps});
       if(grown.steps.length>aSteps.length)try{const ge=add(e.to,actual,grown.world,grown.steps.slice(aSteps.length),"CLOSURE_POST_TRANSFORM_GROWTH:"+r.id);rec.outcomes.push({mode:mode+"_POST_GROWTH",...ge});if(ge.status==="CONDITIONAL_REPLAY")metrics.postTransformGrowth++;}catch(e){rec.outcomes.push({mode:mode+"_POST_GROWTH",status:"UNRESOLVED",reason:String(e.message)});}
      }
     }catch(e){rec.outcomes.push({mode,status:"UNRESOLVED",reason:String(e.message)});}
    }
    rec.status=rec.outcomes.some(x=>x.status==="CONDITIONAL_REPLAY"||x.status==="CONDITIONAL_ALIAS")?"TRANSFORM_REPLAY":"LIMITED_UNRESOLVED";if(rec.status==="LIMITED_UNRESOLVED")metrics.stalled++;
   }catch(e){rec.status="LIMITED_UNRESOLVED";rec.reason=String(e.message);metrics.stalled++;}
  }
  metrics.pendingBatchQueue=seeds.length-si+live.length-li;
 }
 return {run,metrics,records,publishedNodes:id=>[...(published.get(id)||[])]};
}
