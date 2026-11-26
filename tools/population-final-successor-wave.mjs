// Produce concrete successors of terminal research witnesses. Scheduling
// budgets leave all unresolved actions open. Only the publication gate
// certifies closure, using a separately replayed complete history.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createFirstSuccessorIndex} from "./atlas-first-successor-obligations.mjs";
import {createTerminalDescendantFrontier} from "./population-terminal-descendant-frontier.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createFinalSuccessorWave({data,graphs,branches,terminal,terminalRule,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,materialPolicy,graphFilter=()=>true,bodyFilter=()=>true,deadline,prior={}}){
 const first=createFirstSuccessorIndex(data),front=createTerminalDescendantFrontier(graphs,terminal.records),records={...(prior.records||{})},attempted=new Set(),published=new Map();
 const metrics={policy:"FIRST_SUCCESSOR_PRODUCTION_V1",attempts:0,examined:0,growth:0,researchAdvanced:0,researchReady:0,transformed:0,aliases:0,closedCandidates:0,unsupported:0,stalled:0,byBody:{},addedResearch:0};
 const finite=Object.fromEntries(materialPolicy.finite);
 function retain(id,i){const a=published.get(id)||new Set();a.add(i);published.set(id,a);enqueue(id,i);}
 function choices(){
  front.refresh();const out=[];
  for(const [id,g] of Object.entries(graphs)){
   const b=branches.get(g.branch);if(g.blocker||!b||!graphFilter(g,b))continue;
   const parents=new Set(g.nodes.map(n=>n.parent));
   for(const i of front.nodes(id)){
    const n=g.nodes[i];if(!bodyFilter(n.body)||parents.has(i)||attempted.has(id+"|"+i))continue;
    const previous=Object.values(records).filter(r=>r.graph===id&&r.node===i).length;
    out.push({id,g,b,i,n,previous,ruleCount:first.byBody.get(n.body)?.length||0});
   }
  }
  return out.sort((a,b)=>a.previous-b.previous||a.ruleCount-b.ruleCount||b.n.traits.length-a.n.traits.length||a.id.localeCompare(b.id)||a.i-b.i);
 }
 function run(limit){
  const candidates=choices();
  while(metrics.attempts<limit&&candidates.length&&performance.now()<deadline()){
   const {id,g,b,i,n}=candidates.shift(),baseKey=id+"|"+i;
   attempted.add(baseKey);metrics.examined++;
   const w=loadNode(id,g,i),state=member(w).state,steps=stepsFor(g,i),full=[...g.birthActions,...steps];
   const targets=terminalRule.targets.filter(t=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k)));
   if(!targets.length)continue;
   const q=first.assess({body:n.body,history:new Set(state.history.keys()),historyKnown:state.historyKnown!==false,active:new Set([...w.researched].filter(k=>active(w,k))),raw:n.raw,capRaw:n.capRaw,finite,consumed:materialPolicy.state(g,i).consumed});
   if(q.closed){metrics.closedCandidates++;continue;}
   const possible=q.open.filter(x=>x.live&&!x.clone&&replay.rules.has(x.id));
   // Unmodeled or dead-only obligations are never marked resolved.
   metrics.unsupported+=q.open.length-possible.length;
   const count=k=>Object.values(records).filter(r=>r.graph===id&&r.node===i&&r.action===k).length;
   const jobs=possible.map(x=>({...x,attempts:count(x.id)})).sort((a,b)=>a.attempts-b.attempts||a.missingResearch.length-b.missingResearch.length||a.id.localeCompare(b.id));
   if(q.openGrowth)jobs.unshift({id:"CAP_GROWTH",attempts:count("CAP_GROWTH"),missingResearch:[]});
   if(!jobs.length)continue;
   const job=jobs[0],k=key([id,i,job.id,job.attempts]),rec={graph:id,node:i,origin:g.origin,branch:g.branch,body:n.body,action:job.id,attempt:job.attempts,status:"OPEN",goals:job.missingResearch,outcomes:[]};
   records[k]=rec;metrics.attempts++;metrics.byBody[n.body]=(metrics.byBody[n.body]||0)+1;
   try{
    const keep=commit(b),allowed=z=>!z.pendingFree&&keep.every(k=>active(z,k))&&targets.every(t=>t.researchGoals.every(k=>active(z,k))&&!(t.inactiveResearch||[]).some(k=>active(z,k)))&&![...z.researched].some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k));
    function add(parent,from,to,suffix,label){
     if(!suffix.length||!allowed(to)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...stepsFor(g,parent),...suffix],to).length)throw Error("SUCCESSOR_CONTEXT");
     if(exactWorld(replay.replay(suffix,from))!==exactWorld(to))throw Error("SUCCESSOR_REPLAY");
     const e=insert(id,g,to,parent,label,suffix,true);retain(id,e.to);if(e.status==="CONDITIONAL_ALIAS")metrics.aliases++;return e;
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
      const e=add(i,w,plan.node.world,suffix,"CLOSURE_RESEARCH:"+r.id);parent=e.to;
      rec.researchNode=parent;rec.added=[...plan.node.world.researched].filter(k=>active(plan.node.world,k)&&!active(w,k));metrics.researchAdvanced++;metrics.addedResearch+=rec.added.length;
      base={world:plan.node.world,steps:[...steps,...suffix]};
     }
     if(!plan.complete){rec.status=suffix.length?"PARTIAL_RESEARCH":"LIMITED_UNRESOLVED";if(!suffix.length)metrics.stalled++;continue;}
     metrics.researchReady++;
    }
    for(const mode of ["DIRECT","GROW_THEN_TRANSFORM"]){
     const z=mode==="DIRECT"?base:replay.grow(base);if(mode!=="DIRECT"&&z===base)continue;
     const v=replay.transform(z,r);if(!v)continue;
     try{const e=add(parent,base.world,v.world,v.steps.slice(base.steps.length),"CLOSURE_TRANSFORM:"+r.id);rec.outcomes.push({mode,...e});if(e.status==="CONDITIONAL_REPLAY")metrics.transformed++;}catch(e){rec.outcomes.push({mode,status:"UNRESOLVED",reason:String(e.message)});}
    }
    rec.status=rec.outcomes.some(x=>x.status==="CONDITIONAL_REPLAY"||x.status==="CONDITIONAL_ALIAS")?"TRANSFORM_REPLAY":"LIMITED_UNRESOLVED";if(rec.status==="LIMITED_UNRESOLVED")metrics.stalled++;
   }catch(e){rec.status="LIMITED_UNRESOLVED";rec.reason=String(e.message);metrics.stalled++;}
  }
 }
 return {run,metrics,records,publishedNodes:id=>[...(published.get(id)||[])]};
}
