// Bounded, immediately resumable multi-surgery production. No search limit
// or failed action is evidence of closure: the existing final gate is unchanged.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createFirstSuccessorIndex} from "./atlas-first-successor-obligations.mjs";
import {createTerminalDescendantFrontier} from "./population-terminal-descendant-frontier.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createFinalSuccessorWave({data,graphs,branches,terminal,terminalRule,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,materialPolicy,graphFilter=()=>true,bodyFilter=()=>true,deadline,prior={},chainQuantum=6}){
 if(!Number.isSafeInteger(chainQuantum)||chainQuantum<1)throw Error("Invalid closure chain quantum");
 const first=createFirstSuccessorIndex(data),front=createTerminalDescendantFrontier(graphs,terminal.records),records={...(prior.records||{})},published=new Map(),visited=new Set(),turns=new Map(),counts=new Map(),nodeTurns=new Map();
 const finite=Object.fromEntries(materialPolicy.finite);
 const metrics={policy:"FIRST_SUCCESSOR_PRODUCTION_V2_CHAIN",attempts:0,examined:0,growth:0,researchAdvanced:0,researchReady:0,transformed:0,aliases:0,closedCandidates:0,unsupported:0,stalled:0,byBody:{},addedResearch:0,chainedAttempts:0,maxChainDepth:0,multiTransformChains:0,obligationReduction:0,branchExcludedJobs:0,failedByReason:{},seedCount:0,outcomes:[]};
 const nodeKey=(id,i)=>id+"|"+i,actionKey=(id,i,a)=>id+"|"+i+"|"+a;
 for(const r of Object.values(records)){const k=actionKey(r.graph,r.node,r.action),n=nodeKey(r.graph,r.node);counts.set(k,(counts.get(k)||0)+1);nodeTurns.set(n,(nodeTurns.get(n)||0)+1);}
 function retain(id,i){const a=published.get(id)||new Set();a.add(i);published.set(id,a);enqueue(id,i);}
 function assess(g,i,w){
  const n=g.nodes[i],s=member(w).state;
  return first.assess({body:n.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown!==false,active:new Set([...w.researched].filter(k=>active(w,k))),raw:n.raw,capRaw:n.capRaw,finite,consumed:materialPolicy.state(g,i).consumed});
 }
 function seeds(){
  front.refresh();const out=[];
  for(const [id,g] of Object.entries(graphs)){
   const b=branches.get(g.branch);if(g.blocker||!b||!graphFilter(g,b))continue;
   const parents=new Set(g.nodes.map(n=>n.parent));
   for(const i of front.nodes(id)){
    const n=g.nodes[i];if(!bodyFilter(n.body)||parents.has(i))continue;
    // Approximate only: retained traits need not equal transformation history.
    const remaining=(first.byBody.get(n.body)||[]).filter(r=>!r.requires.includes("STR_UNAVAILABLE")&&!r.forbiddenSoldierTypes?.includes(n.body)&&!r.forbiddenPreviousTransformations?.some(k=>n.traits.includes(k))).length;
    out.push({id,g,b,i,depth:0,transforms:0,remaining,previous:nodeTurns.get(nodeKey(id,i))||0});
   }
  }
  return out.sort((a,b)=>a.previous-b.previous||a.remaining-b.remaining||b.g.nodes[b.i].traits.length-a.g.nodes[a.i].traits.length||a.id.localeCompare(b.id)||a.i-b.i);
 }
 function run(limit){
  const queue=seeds(),follow=[];metrics.seedCount=queue.length;
  let consecutive=0;
  while(metrics.attempts<limit&&(queue.length||follow.length)&&performance.now()<deadline()){
   const useFollow=follow.length&&(consecutive<chainQuantum||!queue.length);
   const t=useFollow?follow.shift():queue.shift();if(useFollow)consecutive++;else consecutive=0;
   const {id,g,b,i,depth,transforms}=t,n=g.nodes[i],nk=nodeKey(id,i);
   if(visited.has(nk))continue;visited.add(nk);metrics.examined++;
   let w,q,steps,full,targets;
   try{
    w=loadNode(id,g,i);q=assess(g,i,w);steps=stepsFor(g,i);full=[...g.birthActions,...steps];
    targets=terminalRule.targets.filter(t=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k)));
   }catch(e){metrics.stalled++;continue;}
   if(!targets.length)continue;
   if(q.closed){if(depth){metrics.closedCandidates++;retain(id,i);metrics.outcomes.push({graph:id,node:i,body:n.body,origin:g.origin,depth,transforms,status:"CLOSED_CANDIDATE"});}continue;}
   const keep=commit(b),forbidden=new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!keep.includes(k))]);
   const allowed=z=>!z.pendingFree&&keep.every(k=>active(z,k))&&targets.every(t=>t.researchGoals.every(k=>active(z,k))&&!(t.inactiveResearch||[]).some(k=>active(z,k)))&&![...z.researched].some(k=>forbidden.has(k));
   const history=new Set(member(w).state.history.keys());
   const jobs=[];
   for(const x of q.open){
    const r=replay.rules.get(x.id);
    if(!x.live||x.clone||!r||r.producedItem){metrics.unsupported++;continue;}
    if(x.missingResearch.some(k=>forbidden.has(k))){metrics.branchExcludedJobs++;continue;}
    const h=r.reset?new Set():new Set(history);for(const k of r.removeTransformations||[])h.delete(k);h.add(r.id);
    // A projection for ranking only, using exact history and indexed rules.
    const after=(first.byBody.get(x.destination)||[]).filter(z=>!z.requires.includes("STR_UNAVAILABLE")&&!z.forbiddenSoldierTypes?.includes(x.destination)&&!z.forbiddenPreviousTransformations?.some(k=>h.has(k))&&!(z.requiredPreviousTransformations||[]).some(k=>!h.has(k))).length;
    const useful=Number(x.destination!==n.body)+Number(!history.has(x.id));
    jobs.push({...x,r,after,useful,attempts:counts.get(actionKey(id,i,x.id))||0});
   }
   jobs.sort((a,b)=>a.attempts-b.attempts||a.after-b.after||b.useful-a.useful||a.missingResearch.length-b.missingResearch.length||a.id.localeCompare(b.id));
   if(q.openGrowth)jobs.unshift({id:"CAP_GROWTH",missingResearch:[],attempts:counts.get(actionKey(id,i,"CAP_GROWTH"))||0});
   let progressed=false;
   function add(parent,from,to,suffix,label,childTransforms){
    if(!suffix.length||!allowed(to)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...stepsFor(g,parent),...suffix],to).length)throw Error("SUCCESSOR_CONTEXT");
    if(exactWorld(replay.replay(suffix,from))!==exactWorld(to))throw Error("SUCCESSOR_REPLAY");
    const e=insert(id,g,to,parent,label,suffix,true);
    if(e.status==="CONDITIONAL_ALIAS"){metrics.aliases++;return e;}
    if(e.status!=="CONDITIONAL_REPLAY")throw Error("SUCCESSOR_INSERT");
    retain(id,e.to);const a=assess(g,e.to,to);
    metrics.obligationReduction+=Math.max(0,q.open.length-a.open.length);
    metrics.maxChainDepth=Math.max(metrics.maxChainDepth,depth+1);
    if(childTransforms>=2&&transforms<2)metrics.multiTransformChains++;
    if(a.closed){metrics.closedCandidates++;metrics.outcomes.push({graph:id,node:e.to,body:g.nodes[e.to].body,origin:g.origin,depth:depth+1,transforms:childTransforms,status:"CLOSED_CANDIDATE"});visited.add(nodeKey(id,e.to));}
    else follow.unshift({id,g,b,i:e.to,depth:depth+1,transforms:childTransforms});
    progressed=true;return e;
   }
   for(const job of jobs){
    if(metrics.attempts>=limit||performance.now()>=deadline()||progressed)break;
    const k=key([id,i,job.id,job.attempts]),rec={graph:id,node:i,origin:g.origin,branch:g.branch,body:n.body,action:job.id,attempt:job.attempts,status:"OPEN",goals:job.missingResearch,outcomes:[],chainDepth:depth};
    records[k]=rec;counts.set(actionKey(id,i,job.id),job.attempts+1);metrics.attempts++;metrics.byBody[n.body]=(metrics.byBody[n.body]||0)+1;if(depth)metrics.chainedAttempts++;
    try{
     if(job.id==="CAP_GROWTH"){
      const z=replay.grow({world:w,steps});const e=add(i,w,z.world,z.steps.slice(steps.length),"CLOSURE_GROWTH",transforms);rec.outcomes.push(e);rec.status="GROWTH_REPLAY";metrics.growth++;continue;
     }
     let base={world:w,steps},parent=i;
     if(job.missingResearch.length){
      const p=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b);
      const plan=createStagedResearch({planner:p,active,accept:(_,z)=>allowed(z.world),deadline:Math.min(deadline(),performance.now()+3200),maxCalls:10,maxDepth:Infinity,variant:job.attempts}).run({world:w,steps:full,trace:[],diagnostics:[]},job.r.requires);
      const suffix=plan.node.steps.slice(full.length);rec.remaining=plan.remaining;rec.failures=plan.failures.slice(-2);
      if(suffix.length){const e=add(i,w,plan.node.world,suffix,"CLOSURE_RESEARCH:"+job.id,transforms);parent=e.to;rec.researchNode=parent;rec.added=[...plan.node.world.researched].filter(k=>active(plan.node.world,k)&&!active(w,k));metrics.researchAdvanced++;metrics.addedResearch+=rec.added.length;base={world:plan.node.world,steps:[...steps,...suffix]};}
      if(!plan.complete){rec.status=suffix.length?"PARTIAL_RESEARCH":"LIMITED_UNRESOLVED";if(!suffix.length)metrics.stalled++;continue;}
      metrics.researchReady++;
     }
     const variants=[base];const grown=replay.grow(base);if(grown!==base)variants.push(grown);
     let transformed=false;
     for(const z of variants){
      const outcomes=replay.transformOutcomes?replay.transformOutcomes(z,job.r):[{band:null,value:replay.transform(z,job.r)}].filter(x=>x.value);
      for(const {band,value:v} of outcomes){
       if(!v||performance.now()>=deadline())break;
       try{const e=add(parent,base.world,v.world,v.steps.slice(base.steps.length),"CLOSURE_TRANSFORM:"+job.id,transforms+1);rec.outcomes.push({band,...e});if(e.status==="CONDITIONAL_REPLAY"){metrics.transformed++;transformed=true;break;}}catch(e){rec.outcomes.push({band,status:"UNRESOLVED",reason:String(e.message)});}
      }
      if(transformed)break;
     }
     rec.status=transformed?"TRANSFORM_REPLAY":progressed?"RESEARCH_REPLAY":"LIMITED_UNRESOLVED";if(!progressed)metrics.stalled++;
    }catch(e){rec.status="LIMITED_UNRESOLVED";rec.reason=String(e.message);metrics.stalled++;metrics.failedByReason[rec.reason]=(metrics.failedByReason[rec.reason]||0)+1;}
   }
  }
 }
 return {run,metrics,records,publishedNodes:id=>[...(published.get(id)||[])]};
}
