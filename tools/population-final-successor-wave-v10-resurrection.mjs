// Bounded, immediately resumable multi-surgery production. No search limit
// or failed action is evidence of closure: the existing final gate is unchanged.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createFirstSuccessorIndex} from "./atlas-first-successor-obligations.mjs";
import {createTerminalDescendantFrontier} from "./population-terminal-descendant-frontier.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
import {createResearchFragmentIndex} from "./population-research-fragments-v2-ready.mjs";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createFinalSuccessorWave({data,graphs,branches,terminal,terminalRule,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,materialPolicy,graphFilter=()=>true,bodyFilter=()=>true,deadline,prior={},chainQuantum=6,rootAttemptBudget=8,ruleAttemptBudget=2,stagedPrefixes={},preserveBody=false,excludeChort=false,fragmentMs=1500,historyIndex,activeIndex,admissionWitnesses={},priorRoutes={}}){
 if(![chainQuantum,rootAttemptBudget,ruleAttemptBudget].every(x=>Number.isSafeInteger(x)&&x>0))throw Error("Invalid closure scheduling budget");
 const first=createFirstSuccessorIndex(data),front=createTerminalDescendantFrontier(graphs,terminal.records),records={...(prior.records||{})},published=new Map(),visited=new Set(),turns=new Map(),counts=new Map(),nodeTurns=new Map();
 const finite=Object.fromEntries(materialPolicy.finite);
 const metrics={policy:"FIRST_SUCCESSOR_PRODUCTION_V10_RESURRECTION",revivalSeeds:0,revivalLaneRoots:0,revivalAttempts:0,revivalSuccess:0,revivalRepeatDeferred:0,revivalByRule:{},lifecycleLaneRoots:0,lifecycleLaneAttempts:0,lifecycleLaneGrowth:0,lifecycleLaneFallbacks:0,lifecycleHints:0,lifecycleRepairSeeds:0,lifecycleRepairRoots:0,lifecycleParentSeeds:0,lifecycleRepairAttempts:0,lifecycleIntroductionsProjected:0,lifecycleReduced:0,lifecycleAdded:0,intermediateFollowAvoided:0,unsupportedByKind:{},lifecycleActions:{},historicalReceipts:0,liveCostSamples:0,existingChildHints:0,selectedProductive:0,selectedNovel:0,selectedCost:0,duplicateJobAttempts:0,seedArchiveHints:0,seedHistoryHints:0,seedUnknownHints:0,seedDeferredHints:0,selectedReadyRoots:0,selectedNearRoots:0,selectedObligationSum:0,selectedArchivedRoots:0,excludeChort,classDeferred:0,rootsByPath:{},rootsByOrigin:{},attempts:0,examined:0,growth:0,researchAdvanced:0,researchReady:0,transformed:0,aliases:0,closedCandidates:0,unsupported:0,stalled:0,byBody:{},addedResearch:0,chainedAttempts:0,maxChainDepth:0,multiTransformChains:0,obligationReduction:0,branchExcludedJobs:0,failedByReason:{},seedCount:0,fragmentCount:0,fragmentTrials:0,fragmentApplied:0,fragmentResearch:0,fragmentComplete:0,fragmentRejected:0,fragmentPreflightRejected:0,bodyChangeDeferred:0,rootsByBody:{},budgetDeferred:0,ruleDeferred:0,repeatDeferred:0,distinctSurgery:[],outcomes:[]};
 const nodeKey=(id,i)=>id+"|"+i,actionKey=(id,i,a)=>id+"|"+i+"|"+a;
 for(const r of Object.values(records)){const k=actionKey(r.graph,r.node,r.action),n=nodeKey(r.graph,r.node);counts.set(k,(counts.get(k)||0)+1);nodeTurns.set(n,(nodeTurns.get(n)||0)+1);}
 // Scheduling only: empirical outcomes do not establish infeasibility.
 const observations=new Map(),childrenCache=new WeakMap();
 const keys=(body,branch,action,missing)=>[JSON.stringify([body,action,!!missing]),JSON.stringify([body,branch,action,!!missing])];
 function observe(rec,live=false){
  if(!rec?.body||!rec.branch||!rec.action||rec.status==="OPEN")return;
  const novel=(rec.outcomes||[]).some(e=>e.status==="CONDITIONAL_REPLAY"),partial=["PARTIAL_RESEARCH","RESEARCH_REPLAY"].includes(rec.status),alias=(rec.outcomes||[]).some(e=>e.status==="CONDITIONAL_ALIAS");
  const elapsed=rec.production?.elapsedMs;
  const cost=Number.isFinite(elapsed)?Math.max(0.5,Math.min(12,elapsed/500)):Math.min(12,1+(rec.goals?.length||0)*0.5+(rec.added?.length||0)/16+(rec.fragmentMetrics?.trials||0)/30);
  const reward=novel?1:partial?0.24:alias?0.04:0;
  for(const k of keys(rec.body,rec.branch,rec.action,rec.goals?.length)){
   const a=observations.get(k)||{n:0,reward:0,cost:0,novel:0};
   a.n++;a.reward+=reward;a.cost+=cost;a.novel+=Number(novel);observations.set(k,a);
  }
  metrics[live?"liveCostSamples":"historicalReceipts"]++;
 }
 for(const rec of Object.values(records))observe(rec);
 function estimate(body,branch,action,missing){
  const [k,b]=keys(body,branch,action,missing),g=observations.get(k),l=observations.get(b),n=g?.n||0,m=l?.n||0;
  const p=(2+(g?.reward||0))/(4+n),c=(4+(g?.cost||0))/(4+n);
  return {reward:(4*p+(l?.reward||0))/(4+m),cost:(4*c+(l?.cost||0))/(4+m),samples:n,novel:g?.novel||0};
 }
 function children(g,i){
  let c=childrenCache.get(g);if(!c){c={scanned:0,byParent:new Map()};childrenCache.set(g,c);}
  for(;c.scanned<g.nodes.length;c.scanned++){
   const n=g.nodes[c.scanned];if(n.parent===null)continue;
   const a=(n.steps||[]).filter(a=>a.type==="transform"&&a.soldier==="origin");
   if(a.length!==1)continue;
   const set=c.byParent.get(n.parent)||new Set();set.add(a[0].transform);c.byParent.set(n.parent,set);
  }
  return c.byParent.get(i)||new Set();
 }
 function utility(n,b,x,after,open,duplicate=false,repeat=false){
  const e=estimate(n.body,b.id,x.id,x.missingResearch.length),delta=Math.max(0,open-after),cost=e.cost+0.5*x.missingResearch.length+Number(duplicate)*1.5;
  const u=(0.3+delta*1.5+Number(x.destination!==n.body)*0.6)*e.reward/(0.5+cost);
  return {...e,cost,utility:u/(1+Number(repeat)*2+Number(duplicate)*4),duplicate};
 }
 // Unsupported lifecycle actions remain obligations in the final gate.
 // This index only predicts the effect of an ordinary, live transformation
 // on those obligations. It never changes a soldier's status or identity.
 const lifecycleCache=new Map(),isRevival=id=>replay.lifecycleRules?.has(id)===true;
 function lifecycleKind(r){
  if(!r)return "UNINDEXED";
  if(r.createsClone)return "CLONE_IDENTITY";
  if(r.producedItem)return "ITEM_CONVERSION";
  if(!r.allowsLiveSoldiers)return r.allowsDeadSoldiers?"DEAD_ONLY":r.allowsWoundedSoldiers?"WOUNDED_ONLY":"OTHER_STATUS";
  return null;
 }
 function structuralRules(body,h){
  return (first.byBody.get(body)||[]).filter(r=>!r.requires.includes("STR_UNAVAILABLE")&&!r.forbiddenSoldierTypes?.includes(body)&&!r.forbiddenPreviousTransformations?.some(k=>h.has(k))&&!(r.requiredPreviousTransformations||[]).some(k=>!h.has(k)));
 }
 function lifecycleSet(body,h){
  return new Set(structuralRules(body,h).filter(r=>lifecycleKind(r)).map(r=>r.id));
 }
 function successorHistory(h,r){
  const next=r.reset?new Set():new Set(h);for(const k of r.removeTransformations||[])next.delete(k);next.add(r.id);return next;
 }
 function lifecyclePlan(body,h,b){
  if(!(h instanceof Set))return {known:false,current:0,best:0,gain:0,actions:[],byAction:new Map()};
  const k=JSON.stringify([body,b.id,[...h].sort(),excludeChort,preserveBody]);
  if(lifecycleCache.has(k))return lifecycleCache.get(k);
  const current=lifecycleSet(body,h),forbidden=branchForbidden(b),byAction=new Map(),actions=[];
  for(const r of structuralRules(body,h)){
   const dest=r.producedSoldierType||body;
   if((lifecycleKind(r)&&!isRevival(r.id))||excludeChort&&dest==="STR_SOLDIER_CHORT"||preserveBody&&dest!==body||r.requires.some(x=>forbidden.has(x)))continue;
   const next=lifecycleSet(dest,successorHistory(h,r));
   const remove=[...current].filter(x=>!next.has(x)),add=[...next].filter(x=>!current.has(x));
   const e={before:current.size,after:next.size,remove,add,gain:current.size-next.size};
   byAction.set(r.id,e);
   if(e.gain>0)actions.push(r.id);
  }
  const gain=Math.max(0,...[...byAction.values()].map(x=>x.gain));
  const result={known:true,current:current.size,best:current.size-gain,gain,actions,byAction};
  lifecycleCache.set(k,result);return result;
 }
 function retain(id,i){const a=published.get(id)||new Set();a.add(i);published.set(id,a);enqueue(id,i);}
 function assess(g,i,w){
  const n=g.nodes[i],s=member(w).state;
  return first.assess({body:n.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown!==false,active:new Set([...w.researched].filter(k=>active(w,k))),raw:n.raw,capRaw:n.capRaw,finite,consumed:materialPolicy.state(g,i).consumed});
 }
 // Scheduling hints only. No archived or estimated obligation can grant
 // an action, certify closure, or remove a graph from the retained search.
 const branchForbidden=b=>new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!commit(b).includes(k))]);
 const runnable=(x,n,forbidden)=>{
  const r=replay.rules.get(x.id);
  return (x.live||isRevival(x.id))&&!x.clone&&r&&!r.producedItem&&(!excludeChort||x.destination!=="STR_SOLDIER_CHORT")&&(!preserveBody||x.destination===n.body)&&!x.missingResearch.some(k=>forbidden.has(k));
 };
 function score(q,n,b,source,existing=new Set(),h=null){
  const forbidden=branchForbidden(b),jobs=q.open.filter(x=>runnable(x,n,forbidden));
  const ready=jobs.filter(x=>!x.missingResearch.length).length;
  const growth=Number(q.openGrowth),unknown=(q.unknownRules||[]).length;
  const open=q.open.length+growth+unknown;
  const best=Math.max(growth*0.3,...jobs.map(x=>utility(n,b,x,Math.max(0,q.open.length-1),q.open.length,existing.has(x.id)).utility));
  const novel=jobs.filter(x=>!existing.has(x.id)).length+growth;
  const life=lifecyclePlan(n.body,h,b),repair=life.actions.filter(x=>!existing.has(x)&&jobs.some(j=>j.id===x));
  if(life.known)metrics.lifecycleHints++;
  const revival=jobs.filter(x=>isRevival(x.id)&&!existing.has(x.id)&&!h?.has(x.id));
  const revivalReady=revival.filter(x=>!x.missingResearch.length).length;
  return {source,open,best,novel,revival:revival.length,revivalReady,revivalIds:revival.map(x=>x.id),life:{known:life.known,current:life.current,best:life.best,gain:life.gain,repair},ready:ready+growth,jobs:jobs.length+growth,missing:jobs.length?Math.min(...jobs.map(x=>x.missingResearch.length)):0,unsupported:q.open.length-jobs.length,known:q.historyKnown!==false};
 }
 function hint(id,g,b,i){
  const n=g.nodes[i],rid="MISSCAR:"+id+":"+i,v=admissionWitnesses[rid],raw=priorRoutes[rid];
  if(v&&raw&&v.stateHash===n.stateHash&&v.stateHash===raw.canonicalStateHash&&v.actionHash===raw.fullActionHash&&raw.sourceGraph===id&&raw.sourceNode===i&&Array.isArray(v.openRules)){
   metrics.seedArchiveHints++;
   return score({open:v.openRules,openGrowth:v.openGrowth,unknownRules:v.unknownRules},n,b,"archive",children(g,i),historyIndex?.history(g,i));
  }
  const h=historyIndex?.history(g,i);
  if(h)metrics.seedHistoryHints++;else metrics.seedUnknownHints++;
  // Missing active research is treated as unknown here. Actual loadNode
  // and assess still run before any attempt; the archive cannot admit it.
  const q=first.assess({body:n.body,history:h,historyKnown:!!h,active:new Set(),raw:n.raw,capRaw:n.capRaw,finite:{},consumed:{}});
  for(const x of q.open){
   const r=replay.rules.get(x.id);
   if(r&&activeIndex?.ready(n,r))x.missingResearch=[];
  }
  q.historyKnown=!!h;
  return score(q,n,b,h?"history":"unknown",children(g,i),h);
 }
 function seeds(){
  front.refresh();const out=[];
  for(const [id,g] of Object.entries(graphs)){
   const b=branches.get(g.branch);if(g.blocker||!b||!graphFilter(g,b))continue;
   const parents=new Set(g.nodes.map(n=>n.parent));
   for(const i of front.nodes(id)){
    const n=g.nodes[i];if(!bodyFilter(n.body)||(excludeChort&&n.body==='STR_SOLDIER_CHORT'))continue;
    const parent=parents.has(i);
    // Non-leaf states retain untried life-cycle-reducing alternatives.
    // This lane does not remove the existing leaf queue or graph history.
    if(parent&&!historyIndex?.history(g,i))continue;
    const h=hint(id,g,b,i);
    if(parent&&!h.life.repair.length&&!h.revival)continue;
    if(h.revival)metrics.revivalSeeds++;
    if(parent)metrics.lifecycleParentSeeds++;
    if(h.life.repair.length)metrics.lifecycleRepairSeeds++;
    if(!h.jobs)metrics.seedDeferredHints++;
    out.push({id,g,b,i,depth:0,transforms:0,remaining:h.open,h,parent,previous:nodeTurns.get(nodeKey(id,i))||0});
   }
  }
  return out.sort((a,b)=>Number(!a.h.jobs)-Number(!b.h.jobs)||a.remaining-b.remaining||Number(!a.h.ready)-Number(!b.h.ready)||a.h.unsupported-b.h.unsupported||a.previous-b.previous||a.h.missing-b.h.missing||b.g.nodes[b.i].traits.length-a.g.nodes[a.i].traits.length||a.id.localeCompare(b.id)||a.i-b.i);
 }
 let fragments;
 function fragmentIndex(){
  if(fragments)return fragments;
  fragments=createResearchFragmentIndex(data);
  for(const [id,g] of Object.entries(graphs)){
   if(g.blocker)continue;
   fragments.add(g.birthActions,id);
   for(const n of g.nodes)if(n.steps?.length)fragments.add(n.steps,id);
  }
  for(const [id,p] of Object.entries(stagedPrefixes))if(Array.isArray(p.actions))fragments.add(p.actions,id);
  metrics.fragmentCount=fragments.size;return fragments;
 }
 function run(limit){
  const queue=seeds(),follow=[],rootWork=new Map(),rootRules=new Map(),surgeryIds=new Set();metrics.seedCount=queue.length;
  const repairRoots=new Set(),revivalRoots=new Set();let pickedRoots=0;
  // Round-robin path, body and origin work, rather than repeatedly spending
  // a bounded production budget in the largest pre-existing path.
  // The original approximate closure ordering breaks ties only.
  const body=x=>x.g.nodes[x.i].body,path=x=>x.b.choices?.path||"UNSPECIFIED",origin=x=>x.g.origin;
  const tuple=x=>[Number(!x.h.jobs),metrics.rootsByPath[path(x)]||0,x.h.open+x.h.unsupported*0.5+Number(!x.h.known)*3+Math.min(x.previous,4)+Number(!x.h.novel)*2-Math.min(3,x.h.best*4)+Math.min(3,x.h.life.best)*2-Math.min(2,x.h.life.repair.length)*5,Number(!x.h.ready),x.h.unsupported,metrics.rootsByBody[body(x)]||0,metrics.rootsByOrigin[origin(x)]||0];
  const cmp=(a,b)=>{const x=tuple(a),y=tuple(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;};
  function nextSeed(){
   // Reserve every second root for source-indexed life-cycle repair.
   // Bounds are scheduling only: never remove alternative obligations.
   let best=-1,revivalLane=pickedRoots%2===0&&queue.some(x=>x.h.revival>0),repairLane=!revivalLane&&pickedRoots%3===1&&queue.some(x=>x.h.life.repair.length>0);
   const repairCmp=(a,b)=>a.previous-b.previous||Number(!a.h.ready)-Number(!b.h.ready)||b.h.life.gain-a.h.life.gain||cmp(a,b);
   const revivalCmp=(a,b)=>Number(!a.h.revivalReady)-Number(!b.h.revivalReady)||(metrics.rootsByPath[path(a)]||0)-(metrics.rootsByPath[path(b)]||0)||a.previous-b.previous||a.h.open-b.h.open||cmp(a,b);
   for(let j=0;j<queue.length;j++){
    if(revivalLane&&!queue[j].h.revival||repairLane&&!queue[j].h.life.repair.length)continue;
    if(best<0||(revivalLane?revivalCmp(queue[j],queue[best]):repairLane?repairCmp(queue[j],queue[best]):cmp(queue[j],queue[best]))<0)best=j;
   }
   const t=queue.splice(best,1)[0];pickedRoots++;
   if(repairLane){repairRoots.add(nodeKey(t.id,t.i));metrics.lifecycleLaneRoots++;}
   if(revivalLane){revivalRoots.add(nodeKey(t.id,t.i));metrics.revivalLaneRoots++;}
   for(const [m,k] of [[metrics.rootsByPath,path(t)],[metrics.rootsByBody,body(t)],[metrics.rootsByOrigin,origin(t)]])m[k]=(m[k]||0)+1;
   metrics.selectedReadyRoots+=Number(t.h.ready>0);
   metrics.selectedNearRoots+=Number(t.h.open<=5);
   metrics.selectedObligationSum+=t.h.open;
   metrics.selectedArchivedRoots+=Number(t.h.source==="archive");
   metrics.lifecycleRepairRoots+=Number(t.h.life.repair.length>0);
   return {...t,root:nodeKey(t.id,t.i)};
  }
  let consecutive=0;
  while(metrics.attempts<limit&&(queue.length||follow.length)&&performance.now()<deadline()){
   const useFollow=follow.length&&(consecutive<chainQuantum||!queue.length);
   // Newly produced continuations have exact assessments; prefer the
   // smallest remaining obligation inventory without exhausting a root.
   if(useFollow)follow.sort((a,b)=>Number(!a.h.jobs)-Number(!b.h.jobs)||(a.h.open+Number(!a.h.novel)*2-a.h.best*2+a.h.life.best*2-a.h.life.repair.length*3)-(b.h.open+Number(!b.h.novel)*2-b.h.best*2+b.h.life.best*2-b.h.life.repair.length*3)||Number(!a.h.ready)-Number(!b.h.ready)||a.h.missing-b.h.missing||a.depth-b.depth);
   const t=useFollow?follow.shift():nextSeed();if(useFollow)consecutive++;else consecutive=0;
   const {id,g,b,i,depth,transforms,root}=t,n=g.nodes[i],nk=nodeKey(id,i);
   if((rootWork.get(root)||0)>=rootAttemptBudget){metrics.budgetDeferred++;continue;}
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
   const jobs=[],rootRule=action=>root+"|"+action,lifePlan=lifecyclePlan(n.body,history,b);
   for(const x of q.open){
    const r=replay.rules.get(x.id);
    // Lane selection is not evidence of impossibility. q.open remains intact.
    if(excludeChort&&x.destination==='STR_SOLDIER_CHORT'){metrics.classDeferred++;continue;}
    if(preserveBody&&x.destination!==n.body){metrics.bodyChangeDeferred++;continue;}
    if((!x.live&&!isRevival(x.id))||x.clone||!r||r.producedItem){metrics.unsupported++;const kind=lifecycleKind(r)||"OTHER_STATUS";metrics.unsupportedByKind[kind]=(metrics.unsupportedByKind[kind]||0)+1;continue;}
    if(x.missingResearch.some(k=>forbidden.has(k))){metrics.branchExcludedJobs++;continue;}
    // Repeat death is not an exclusion proof. Bound only this production lane.
    if(isRevival(x.id)&&history.has(x.id)){metrics.revivalRepeatDeferred++;continue;}
    const h=r.reset?new Set():new Set(history);for(const k of r.removeTransformations||[])h.delete(k);h.add(r.id);
    // A projection for ranking only, using exact history and indexed rules.
    const after=(first.byBody.get(x.destination)||[]).filter(z=>!z.requires.includes("STR_UNAVAILABLE")&&!z.forbiddenSoldierTypes?.includes(x.destination)&&!z.forbiddenPreviousTransformations?.some(k=>h.has(k))&&!(z.requiredPreviousTransformations||[]).some(k=>!h.has(k))).length;
    const useful=Number(x.destination!==n.body)+Number(!history.has(x.id));
    const used=rootRules.get(rootRule(x.id))||0,repeat=history.has(x.id)&&!r.reset&&x.destination===n.body&&after>=q.open.length;
    if(used>=ruleAttemptBudget){metrics.ruleDeferred++;continue;}
    if(repeat&&used>=1){metrics.repeatDeferred++;continue;}
    const duplicate=children(g,i).has(x.id),efficiency=utility(n,b,x,after,q.open.length,duplicate,repeat);
    if(duplicate)metrics.existingChildHints++;
    const lifecycle=lifePlan.byAction.get(x.id)||{before:0,after:0,remove:[],add:[],gain:0};
    // Prevent creating additional death-only dependencies merely to
    // increase a trait count. The action remains schedulable.
    const adjustedUtility=efficiency.utility*(1+Math.max(0,lifecycle.gain)*3)/(1+Math.max(0,-lifecycle.gain)*5);
    jobs.push({...x,r,after,useful,repeat:Number(repeat),used,attempts:counts.get(actionKey(id,i,x.id))||0,efficiency:{...efficiency,utility:adjustedUtility},lifecycle});
   }
   const revivalLane=revivalRoots.has(root);
   jobs.sort((a,b)=>Number(revivalLane&&isRevival(b.id))-Number(revivalLane&&isRevival(a.id))||Number(b.lifecycle.gain>0&&!b.efficiency.duplicate)-Number(a.lifecycle.gain>0&&!a.efficiency.duplicate)||b.efficiency.utility-a.efficiency.utility||a.repeat-b.repeat||a.attempts-b.attempts||a.after-b.after||a.id.localeCompare(b.id));
   const repairLane=repairRoots.has(root),hasRepair=jobs.some(x=>x.lifecycle?.gain>0&&!x.efficiency?.duplicate);
   if(repairLane&&!hasRepair)metrics.lifecycleLaneFallbacks++;
   if(q.openGrowth){
    const growth={id:"CAP_GROWTH",missingResearch:[],attempts:counts.get(actionKey(id,i,"CAP_GROWTH"))||0};
    // Try the life-cycle repair before incidental growth. The surgery
    // replay itself retains the exact grown alternative where needed.
    if(revivalLane&&jobs.some(x=>isRevival(x.id))||repairLane&&hasRepair)jobs.push(growth);else jobs.unshift(growth);
   }
   let progressed=false;
   function add(parent,from,to,suffix,label,childTransforms){
    if(!suffix.length||!allowed(to)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...stepsFor(g,parent),...suffix],to).length)throw Error("SUCCESSOR_CONTEXT");
    if(exactWorld(replay.replay(suffix,from))!==exactWorld(to))throw Error("SUCCESSOR_REPLAY");
    const e=insert(id,g,to,parent,label,suffix,true);
    if(e.status==="CONDITIONAL_ALIAS"){metrics.aliases++;return e;}
    if(e.status!=="CONDITIONAL_REPLAY")throw Error("SUCCESSOR_INSERT");
    retain(id,e.to);const a=assess(g,e.to,to);
    const beforeLife=new Set(q.open.filter(x=>lifecycleKind(replay.rules.get(x.id))).map(x=>x.id)),afterLife=new Set(a.open.filter(x=>lifecycleKind(replay.rules.get(x.id))).map(x=>x.id));
    metrics.lifecycleReduced+=[...beforeLife].filter(x=>!afterLife.has(x)).length;
    metrics.lifecycleAdded+=[...afterLife].filter(x=>!beforeLife.has(x)).length;
    metrics.obligationReduction+=Math.max(0,q.open.length-a.open.length);
    metrics.maxChainDepth=Math.max(metrics.maxChainDepth,depth+1);
    if(childTransforms>=2&&transforms<2)metrics.multiTransformChains++;
    if(a.closed){metrics.closedCandidates++;metrics.outcomes.push({graph:id,node:e.to,body:g.nodes[e.to].body,origin:g.origin,depth:depth+1,transforms:childTransforms,status:"CLOSED_CANDIDATE"});visited.add(nodeKey(id,e.to));}
    else follow.unshift({id,g,b,i:e.to,depth:depth+1,transforms:childTransforms,root,h:score(a,g.nodes[e.to],b,"live",children(g,e.to),new Set(member(to).state.history.keys()))});
    progressed=true;return e;
   }
   for(const job of jobs){
    if(metrics.attempts>=limit||performance.now()>=deadline()||progressed||(rootWork.get(root)||0)>=rootAttemptBudget)break;
    rootWork.set(root,(rootWork.get(root)||0)+1);rootRules.set(rootRule(job.id),(rootRules.get(rootRule(job.id))||0)+1);
    const k=key([id,i,job.id,job.attempts]),rec={graph:id,node:i,origin:g.origin,branch:g.branch,body:n.body,action:job.id,attempt:job.attempts,status:"OPEN",goals:job.missingResearch,outcomes:[],chainDepth:depth};
    records[k]=rec;counts.set(actionKey(id,i,job.id),job.attempts+1);metrics.attempts++;metrics.byBody[n.body]=(metrics.byBody[n.body]||0)+1;if(depth)metrics.chainedAttempts++;
    if(repairLane){metrics.lifecycleLaneAttempts++;if(job.id==="CAP_GROWTH")metrics.lifecycleLaneGrowth++;}
    const started=performance.now(),reductionBefore=metrics.obligationReduction;
    if(isRevival(job.id))metrics.revivalAttempts++;
    if(job.lifecycle){rec.lifecycleProjection=job.lifecycle;metrics.lifecycleRepairAttempts+=Number(job.lifecycle.gain>0);metrics.lifecycleIntroductionsProjected+=job.lifecycle.add.length;}

    if(job.efficiency){const e=job.efficiency;rec.priority={...e};metrics.selectedProductive+=Number(e.novel>0);metrics.selectedNovel+=Number(!e.duplicate);metrics.selectedCost+=e.cost;metrics.duplicateJobAttempts+=Number(e.duplicate);}
    try{
     if(job.id==="CAP_GROWTH"){
      const z=replay.grow({world:w,steps});const e=add(i,w,z.world,z.steps.slice(steps.length),"CLOSURE_GROWTH",transforms);rec.outcomes.push(e);rec.status="GROWTH_REPLAY";metrics.growth++;continue;
     }
     let base={world:w,steps},parent=i;
     if(job.missingResearch.length){
      const p=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b);
      const index=fragmentIndex(),until=Math.min(deadline(),performance.now()+Math.max(0,fragmentMs));
      const f=index.propose({world:w,goals:job.r.requires,planner:p,replay,allowed:(_,z)=>keep.every(k=>active(z,k))&&![...z.researched].some(k=>forbidden.has(k)),accept:(suffix,z)=>{if(!allowed(z)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...full,...suffix],z).length)return false;try{materialPolicy.check(g,i,suffix);return true;}catch{return false;}},deadline:until,maxTrials:60,maxChunks:24,preferredSources:new Set([id])});
      rec.fragmentSources=f.sources;rec.fragmentMetrics=f.metrics;metrics.fragmentTrials+=f.metrics.trials;metrics.fragmentApplied+=f.metrics.applied;metrics.fragmentResearch+=f.metrics.added;metrics.fragmentRejected+=f.metrics.rejected;metrics.fragmentPreflightRejected+=f.metrics.preflightRejected;if(f.complete)metrics.fragmentComplete++;
      const initial={world:f.world,steps:[...full,...f.steps],trace:[],diagnostics:[]};
      const plan=f.complete?{node:initial,complete:true,remaining:[],failures:[]}:createStagedResearch({planner:p,active,accept:(_,z)=>allowed(z.world),deadline:Math.min(deadline(),performance.now()+3200),maxCalls:10,maxDepth:Infinity,variant:job.attempts}).run(initial,job.r.requires);
      const suffix=plan.node.steps.slice(full.length);rec.remaining=plan.remaining;rec.failures=plan.failures.slice(-2);
      if(suffix.length){const e=add(i,w,plan.node.world,suffix,"CLOSURE_RESEARCH:"+job.id,transforms);index.add(suffix,id);metrics.fragmentCount=index.size;parent=e.to;rec.researchNode=parent;rec.added=[...plan.node.world.researched].filter(k=>active(plan.node.world,k)&&!active(w,k));metrics.researchAdvanced++;metrics.addedResearch+=rec.added.length;base={world:plan.node.world,steps:[...steps,...suffix]};}
      if(!plan.complete){rec.status=suffix.length?"PARTIAL_RESEARCH":"LIMITED_UNRESOLVED";if(!suffix.length)metrics.stalled++;continue;}
      metrics.researchReady++;
     }
     const variants=[base];const grown=replay.grow(base);if(grown!==base)variants.push(grown);
     let transformed=false;
     for(const z of variants){
      const outcomes=replay.transformOutcomes?replay.transformOutcomes(z,job.r):[{band:null,value:replay.transform(z,job.r)}].filter(x=>x.value);
      for(const {band,value:v} of outcomes){
       if(!v||performance.now()>=deadline())break;
       try{const e=add(parent,base.world,v.world,v.steps.slice(base.steps.length),"CLOSURE_TRANSFORM:"+job.id,transforms+1);rec.outcomes.push({band,...e});if(e.status==="CONDITIONAL_REPLAY"){metrics.transformed++;surgeryIds.add(job.id);metrics.distinctSurgery=[...surgeryIds].sort();transformed=true;break;}}catch(e){rec.outcomes.push({band,status:"UNRESOLVED",reason:String(e.message)});}
      }
      if(transformed)break;
     }
     if(transformed&&isRevival(job.id)){metrics.revivalSuccess++;metrics.revivalByRule[job.id]=(metrics.revivalByRule[job.id]||0)+1;}
     if(transformed&&job.lifecycle?.gain>0)metrics.lifecycleActions[job.id]=(metrics.lifecycleActions[job.id]||0)+1;
     if(transformed&&parent!==i){const j=follow.findIndex(x=>x.id===id&&x.i===parent);if(j>=0){follow.splice(j,1);metrics.intermediateFollowAvoided++;}}
     rec.status=transformed?"TRANSFORM_REPLAY":progressed?"RESEARCH_REPLAY":"LIMITED_UNRESOLVED";if(!progressed)metrics.stalled++;
    }catch(e){rec.status="LIMITED_UNRESOLVED";rec.reason=String(e.message);metrics.stalled++;metrics.failedByReason[rec.reason]=(metrics.failedByReason[rec.reason]||0)+1;}
    finally{rec.production={elapsedMs:Math.round(performance.now()-started),obligationReduction:metrics.obligationReduction-reductionBefore};observe(rec,true);}
   }
  }
 }
 return {run,metrics,records,publishedNodes:id=>[...(published.get(id)||[])]};
}
