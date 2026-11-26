// High-retained-trait continuation under the ordinary-effort research policy.
// Templates are proposals only: all actions must replay on the recipient world.
// No trait-count target, budget, or failed proposal is a closure certificate.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createResearchFragmentIndex} from "./population-research-fragments.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
import {applyTransformation,STAT_KEYS,statChangeEngineEstimate} from "../public/soldiers/modern/eligibility.js";
import {scalarGrowth} from "./population-scalar-upper-bound.mjs";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),counts=w=>Object.fromEntries([...member(w).state.bonusCounts].sort());
export function createTerminalTraitChain({terminal,terminalRule,graphs,branches,byBody,data,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,endStage,recovery,deadline,prior={},graphFilter=()=>true,retryFirst=false,workPriority,incumbentScorer,bodyFilter=()=>true,numericPriority="cap",activeIndex,activeFirst=false,paretoSearch=null,paretoPrune=true}){
 const targets=new Map(terminalRule.targets.map(t=>[t.id,t])),records=prior.records||{},turns={...prior.turns},groupTurns={...prior.groupTurns},metrics={attempts:0,probeRejected:0,templateTrials:0,templateHits:0,templateRejected:0,crossOriginHits:0,plannerCalls:0,researchAdvanced:0,applied:0,aliases:0,traitGains:0,candidateScans:0,candidateVisits:0,adaptedTemplateHits:0,goalTemplateHits:0,skippedActiveResearch:0,nodeVisits:0,lineageRebuilds:0,groupVisits:0,scopeVisits:0,groupsDeferred:0,activeCandidates:0,activeSelections:0,activeAttempts:0,activeApplied:0,identicalGrowthSkipped:0,activeGroupVisits:0,retiredCandidates:0,selectedCapTotalMax:0,selectedCurrentTotalMax:0,selectedTraitsMax:0,selectedProjectedTraitsMax:0,fragmentTrials:0,fragmentApplied:0,fragmentRejected:0,fragmentHits:0,fragmentPartial:0,fragmentResearchAdded:0,retryCandidates:0,retryAttempts:0,retryApplied:0,numericCandidates:0,numericAttempts:0,numericApplied:0,bodyAttempts:0,bodyApplied:0,capImproved:0,maxCapGain:0,countOnlyDeferred:0,paretoPruned:0,paretoReused:0,paretoScopeVisits:0,paretoSelected:0,paretoSelectedScoreMax:null,templateFailureReasons:{}};
 const paretoMode=numericPriority==="pareto"&&!!paretoSearch,prunedThisBatch=new Set(),checkedReceipts=new Set(),paretoBuckets=new Map(),paretoOriginTurns=new Map(),paretoBodyTurns=new Map(),paretoReceipts={...(prior.paretoReceipts||{})};
 const roots=new Map(),known=new Map(),templateIndex=new Map(),goalIndex=new Map(),ruleCache=new Map(),fragmentIndex=createResearchFragmentIndex(),indexedTemplates=new Set();
 const goalKey=goals=>key([...new Set(goals)].sort());
 const rulesFor=(b,body)=>{const k=JSON.stringify([b.id,body]);if(!ruleCache.has(k)){const keep=new Set(commit(b)),blocked=new Set(b.blockedResearch||[]);ruleCache.set(k,(byBody.get(body)||[]).filter(r=>!r.reset&&!r.removeTransformations?.length&&!r.forbiddenSoldierTypes?.includes(body)&&r.requires.every(k=>!blocked.has(k)&&(!allChoice.has(k)||keep.has(k)))));}return ruleCache.get(k);};
 const ready=(w,t)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
 function refresh(){
  roots.clear();known.clear();templateIndex.clear();goalIndex.clear();
  for(const r of Object.values(terminal.records))if(r.status==="CONDITIONAL_TARGET_RESEARCH_READY"&&Number.isInteger(r.to)&&graphs[r.graph]?.nodes[r.to]){
   const m=roots.get(r.graph)||new Map(),s=m.get(r.to)||new Set();s.add(r.target);m.set(r.to,s);roots.set(r.graph,m);
  }
  for(const r of Object.values(endStage.records))if(r.status==="TERMINAL_RESEARCH_READY_NOT_CLOSED")known.set(r.graph+"|"+r.node,r.historyCounts);
  for(const r of Object.values(records))for(const e of r.outcomes||[])if(e.status==="CONDITIONAL_REPLAY")known.set(r.graph+"|"+e.to,e.history);
  function add(r,node,hash){
   if(!Number.isInteger(node)||!hash)return;
   const n=graphs[r.graph]?.nodes[node];if(!n||key(n.steps)!==hash||!n.steps.length)return;
   const a=templateIndex.get(r.action)||[];
   const entry={hash,steps:n.steps,origin:r.origin,branch:r.branch,graph:r.graph,node,action:r.action};
   if(!indexedTemplates.has(hash)){indexedTemplates.add(hash);fragmentIndex.add(n.steps,{graph:r.graph,node,action:r.action,hash});}
   if(!a.some(x=>x.hash===hash))a.push(entry);
   templateIndex.set(r.action,a);
   const rule=replay.rules.get(r.action);if(rule){const k=goalKey(rule.requires),list=goalIndex.get(k)||[];if(!list.some(x=>x.hash===hash))list.push(entry);goalIndex.set(k,list);}
  }
  for(const r of Object.values(endStage.research))if(r.status==="RESEARCH_READY")add(r,r.to,r.suffixHash);
  for(const r of Object.values(recovery.records))if(r.status==="CONDITIONAL_TRANSFORM_REPLAY")add(r,r.researchNode,r.researchSuffixHash);
  for(const r of Object.values(records))if(r.researchReady)add(r,r.researchNode,r.researchSuffixHash);
 }
 // Incremental graph lineage + grouped priority heaps. Scores remain dynamic
 // (origin fairness, group use count, template availability), but identities
 // and within-group ordering are immutable. No state is merged or pruned by score.
 const graphIndex=new Map(),groups=new Map(),retryGroups=new Map(),scopeBuckets=new Map(),activeGroups=new Map(),activeRetryGroups=new Map(),activeBuckets=new Map(),activeRegistered=new Set(),registered=new Set(),retriedThisBatch=new Set();
 const retryStatuses=new Set(["LIMITED_RESEARCH_UNRESOLVED","PARTIAL_RESEARCH","LIMITED_UNRESOLVED"]);
 const latest=new Map();
 for(const [k,r] of Object.entries(records)){
  const base=r.baseCandidate||key([r.graph,r.node,r.action]),old=latest.get(base);
  if(old?.r.status==="CONDITIONAL_TRANSFORM_REPLAY"&&r.status!=="CONDITIONAL_TRANSFORM_REPLAY")continue;
  latest.set(base,{k,r});
 }
 const matchingTemplates=r=>[...new Map([...(templateIndex.get(r.id)||[]),...(goalIndex.get(goalKey(r.requires))||[])].map(p=>[p.hash,p])).values()];
 const revisionCache=new Map();
 const revision=r=>{if(!revisionCache.has(r.id))revisionCache.set(r.id,key(matchingTemplates(r).map(p=>p.hash).sort()));return revisionCache.get(r.id);};
 const retryKey=(base,r)=>key([base,"NEW_RESEARCH_TEMPLATE",revision(r)]);
 // Numeric quality is a scheduling heuristic, not an admissible upper bound.
 const total=v=>v.reduce((a,b)=>a+b,0);
 const quality=(n,r,g)=>incumbentScorer.score(n,r,g);
 const vec=v=>Object.fromEntries(STAT_KEYS.map((k,i)=>[k,v[i]]));
 const bonuses=new Map();for(const b of data.bonuses)if(!bonuses.has(b.id))bonuses.set(b.id,b.stats||{});
 function classify(g,n,r){
  const fresh=!!r.soldierBonusType&&!n.traits.includes(r.soldierBonusType),body=!!r.producedSoldierType&&r.producedSoldierType!==n.body;
  const dest=replay.bodies.get(r.producedSoldierType||n.body);if(!dest)return null;
  // Exact eligibility is checked by replay; these estimates only schedule work.
  let rawGain=0,capGain=0,estimatedTotalGain=-Infinity,projectedCap=null;
  for(const v of [n.raw,n.capRaw]){
   const q=statChangeEngineEstimate(r,{soldierType:n.body,currentStats:vec(v),initialStats:vec(g.nodes[0].raw)},data);
   if(q.hasUnmodelled)continue;
   rawGain=Math.max(rawGain,STAT_KEYS.reduce((s,k,i)=>s+Math.max(0,q.stats[k]-v[i]),0));
   const cap=STAT_KEYS.map((k,i)=>scalarGrowth(dest,k,q.stats[k],data));
   const delta=cap.map((v,i)=>v-n.capRaw[i]+(fresh?(bonuses.get(r.soldierBonusType)?.[STAT_KEYS[i]]||0):0));
   const projected=cap.map((v,i)=>Math.max(STAT_KEYS[i]==="health"?1:0,v+(n.permanentBonus?.[i]||0)+(fresh?(bonuses.get(r.soldierBonusType)?.[STAT_KEYS[i]]||0):0)));
   projectedCap=projectedCap?projectedCap.map((v,i)=>Math.max(v,projected[i])):projected;
   capGain=Math.max(capGain,delta.reduce((s,v)=>s+Math.max(0,v),0));
   estimatedTotalGain=Math.max(estimatedTotalGain,total(delta));
  }
  if(!fresh&&!body&&!rawGain&&!capGain)return null; // other schedulers retain count-only actions
  return {kind:body?"BODY":fresh?"TRAIT":"NUMERIC",capGain,rawGain,estimatedTotalGain:Number.isFinite(estimatedTotalGain)?estimatedTotalGain:0,projectedCap};
 }
 const numericScore=x=>numericPriority==="body"&&x.kind==="BODY"?1000:numericPriority==="numeric"&&x.kind==="NUMERIC"?1000:(numericPriority==="cap"||paretoMode)?Math.max(-20,Math.min(160,x.estimatedTotalGain*1.6))+Math.min(40,x.capGain*.5)-Number(x.kind==="NUMERIC"&&!x.capGain)*80:Math.min(10,x.capGain*.15);
 // Optional depth-focused scheduling, not a minimum trait count or a
 // termination condition. Every other candidate remains in the queues.
 const depthFirst=numericPriority==="depth";
 const projectedTraits=x=>x.n.traits.length+Number(!!x.r.soldierBonusType&&!x.n.traits.includes(x.r.soldierBonusType));
 const depthCompare=(a,b)=>depthFirst?projectedTraits(b)-projectedTraits(a)||Number(b.kind==="TRAIT")-Number(a.kind==="TRAIT"):0;
 const potential=x=>{if(!paretoMode)return 0;if(x.paretoScore===undefined)x.paretoScore=paretoSearch.score(x);return x.paretoScore;};
 const paretoCompare=(a,b)=>paretoMode?potential(b)-potential(a):0;
 const precedes=(a,b)=>depthCompare(a,b)||paretoCompare(a,b)||quality(b.n,b.r,b.g)+numericScore(b)-quality(a.n,a.r,a.g)-numericScore(a)||a.i-b.i||a.k.localeCompare(b.k);
 function push(heap,x){
  let i=heap.length;heap.push(x);while(i){const p=(i-1)>>1;if(precedes(heap[p],x)<=0)break;heap[i]=heap[p];i=p;}heap[i]=x;
 }
 function pop(heap){
  const head=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let j=2*i+1;if(j+1<heap.length&&precedes(heap[j+1],heap[j])<0)j++;if(precedes(last,heap[j])<=0)break;heap[i]=heap[j];i=j;}heap[i]=last;}return head;
 }
 // All groups in a scope share workPriority's allocation tuple, and
 // branch/origin/body filters. Only examine the leading eligible scopes.
 // Deferred groups remain registered; no numerical or reachability pruning.
 function registerCandidate(x,table,buckets=scopeBuckets){
  if(paretoMode){
   if(buckets!==scopeBuckets)return;
   const scope=JSON.stringify([x.g.origin,x.g.branch,x.n.body,x.n.body==="STR_SOLDIER_CHORT"||x.r.producedSoldierType==="STR_SOLDIER_CHORT"]);
   let b=paretoBuckets.get(scope);if(!b){b={sample:x,heap:[]};paretoBuckets.set(scope,b);}
   potential(x);push(b.heap,x);return;
  }
  let heap=table.get(x.group);
  if(!heap){
   heap=[];table.set(x.group,heap);
   const scope=JSON.stringify([x.g.origin,x.g.branch,x.n.body,x.n.body==="STR_SOLDIER_CHORT"||x.r.producedSoldierType==="STR_SOLDIER_CHORT"]);
   let bucket=buckets.get(scope);
   if(!bucket){bucket={sample:x,groups:[]};buckets.set(scope,bucket);}
   bucket.groups.push({group:x.group,heap});
  }
  push(heap,x);
 }
 function registerActive(x){
  if(paretoMode||!activeFirst||activeRegistered.has(x.k)||!activeIndex.ready(x.n,x.r))return;
  activeRegistered.add(x.k);metrics.activeCandidates++;
  registerCandidate(x,x.retry?activeRetryGroups:activeGroups,activeBuckets);
 }
 function valid(x){
  if(records[x.k]||x.g.blocker||prunedThisBatch.has(x.k))return false;
  if(paretoMode&&paretoPrune&&!checkedReceipts.has(x.k)){checkedReceipts.add(x.k);if(paretoSearch.reuse(paretoReceipts[x.base],x)){prunedThisBatch.add(x.k);metrics.paretoReused++;return false;}}
  if(x.retry&&(retriedThisBatch.has(x.base)||latest.get(x.base)?.k!==x.previous||x.revision!==revision(x.r)))return false;
  const h=known.get(x.id+"|"+x.i),r=x.r;
  if(h&&(r.requiredPreviousTransformations?.some(k=>!h[k])||r.forbiddenPreviousTransformations?.some(k=>h[k])))return false;
  return x.n.edges?.find(e=>e.action===r.id)?.status!=="HISTORY_GATE";
 }
 function refreshCandidates(){
  refresh();revisionCache.clear();metrics.candidateScans++;
  for(const [id,root] of roots){
   const g=graphs[id],b=branches.get(g.branch);if(g.blocker||!b)continue;
   const signature=JSON.stringify([...root].map(([i,t])=>[i,[...t].sort()]).sort((a,b)=>a[0]-b[0]));
   let ix=graphIndex.get(id);
   if(!ix||ix.signature!==signature){ix={signature,line:[]};graphIndex.set(id,ix);metrics.lineageRebuilds++;}
   for(let i=ix.line.length;i<g.nodes.length;i++){
    const n=g.nodes[i],ts=new Set([...(ix.line[n.parent]||[]),...(root.get(i)||[])]);ix.line.push(ts);metrics.nodeVisits++;
    if(!ts.size)continue;
    for(const r of rulesFor(b,n.body)){
     const numeric=classify(g,n,r);if(!numeric)continue;
     const k=key([id,i,r.id]);if(registered.has(k)||records[k])continue;
     const group=key([g.origin,g.branch,n.body,n.traits.slice().sort(),r.id]),x={id,g,b,i,n,r,k,group,base:k,...numeric};
     if(!valid(x))continue;
     registered.add(k);metrics.candidateVisits++;if(x.kind==="NUMERIC")metrics.numericCandidates++;
     registerCandidate(x,groups);registerActive(x);
    }
   }
  }
  // Reconsider only limited failures whose exact transformation/goal template
  // library has changed. Do not overwrite the original attempt or retry history gates.
  for(const [base,{k:previous,r:old}] of latest){
   if(!retryStatuses.has(old.status)||retriedThisBatch.has(base))continue;
   const id=old.graph,i=old.node,g=graphs[id],n=g?.nodes[i],b=g&&branches.get(g.branch),r=replay.rules.get(old.action);
   if(!n||!b||!r||!graphIndex.get(id)?.line[i]?.size||!rulesFor(b,n.body).some(rule=>rule.id===r.id))continue;
   const numeric=classify(g,n,r);if(!numeric||!matchingTemplates(r).length)continue;
   const rev=revision(r);if(old.templateRevision===rev)continue;
   const k=retryKey(base,r);if(registered.has(k)||records[k])continue;
   const group=key([g.origin,g.branch,n.body,n.traits.slice().sort(),r.id]),x={id,g,b,i,n,r,k,group,base,retry:true,previous,revision:rev,...numeric};
   if(!valid(x))continue;
   registered.add(k);metrics.retryCandidates++;
   registerCandidate(x,retryGroups);registerActive(x);
  }
 }
 function pickBuckets(source,activeOnly=false){
  const fair=metrics.attempts%5===4,paretoFirst=paretoMode&&!fair,cmp=(x,y)=>(fair?x.age-y.age:0)||(y.priority-2*y.groupAge)-(x.priority-2*x.groupAge)||x.age-y.age||x.i-y.i||x.k.localeCompare(y.k);
  const buckets=[];let best;
  for(const bucket of source.values()){
   metrics.scopeVisits++;
   const h=bucket.sample;
   if(!graphFilter(h.g,h.b)||!bodyFilter(h.n.body)||!workPriority.eligible(h)){metrics.groupsDeferred+=bucket.groups.length;continue;}
   buckets.push(bucket);
  }
  buckets.sort((a,b)=>workPriority.compare(a.sample,b.sample));
  for(const bucket of buckets){
   if(!depthFirst&&!paretoFirst&&best&&workPriority.compare(bucket.sample,best)>0){metrics.groupsDeferred+=bucket.groups.length;continue;}
   for(const {group,heap} of bucket.groups){
    metrics.groupVisits++;if(activeOnly)metrics.activeGroupVisits++;
    while(heap.length&&!valid(heap[0])){pop(heap);metrics.retiredCandidates++;}
    if(!heap.length)continue;
    const h=heap[0],{n,r,g,id,i}=h;
    const x={...h,ts:[...graphIndex.get(id).line[i]],age:turns[g.origin]||0,groupAge:groupTurns[group]||0,
     priority:quality(n,r,g)+(templateIndex.get(r.id)?.length?4:0)+(h.kind==="BODY"?2:0)+numericScore(h)};
    if(!best||(depthCompare(x,best)||(paretoFirst?paretoCompare(x,best):0)||workPriority.compare(x,best)||(retryFirst?Number(!!best.retry)-Number(!!x.retry):0)||cmp(x,best))<0)best=x;
   }
  }
  return best;
 }
 function pickPareto(){
  const fair=metrics.attempts%5===4;
  const adjusted=x=>potential(x)-14*(paretoOriginTurns.get(x.g.origin)||0)-5*(paretoBodyTurns.get(x.n.body)||0);
  let best;
  for(const bucket of paretoBuckets.values()){
   metrics.paretoScopeVisits++;const h=bucket.sample;
   if(!graphFilter(h.g,h.b)||!bodyFilter(h.n.body)||!workPriority.eligible(h))continue;
   while(bucket.heap.length&&!valid(bucket.heap[0])){pop(bucket.heap);metrics.retiredCandidates++;}
   const a=bucket.heap[0];if(!a)continue;
   if(!best||((fair?workPriority.compare(a,best):adjusted(best)-adjusted(a))||precedes(a,best))<0)best=a;
  }
  if(!best)return null;
  return {...best,ts:[...graphIndex.get(best.id).line[best.i]],priority:adjusted(best)};
 }
 function next(){
  refreshCandidates();
  if(paretoMode)return pickPareto();
  if(activeFirst&&!depthFirst&&(!paretoMode||metrics.attempts%5===4)&&metrics.attempts%4!==3){const x=pickBuckets(activeBuckets,true);if(x){metrics.activeSelections++;return x;}}
  return pickBuckets(scopeBuckets);
 }
 function pendingCount(scoped=false){
  refreshCandidates();let n=0;
  for(const heap of (paretoMode?[...paretoBuckets.values()].map(b=>b.heap):[...groups.values(),...retryGroups.values()]))for(const x of heap)if(valid(x)&&(!scoped||graphFilter(x.g,x.b)&&bodyFilter(x.n.body)))n++;
  return n;
 }
 function probe(base,r){
  // Eligibility probe only. No hypothetical resources or research are stored.
  for(const grow of [false,true]){
   try{const z=grow?replay.grow(base):base,q=replay.meet(z,r);if(!q)continue;const m=member(q.world);
    const v=applyTransformation(r,m.state,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:m.commendations||{},statsKnown:true,medalsKnown:true});
    if(v.verdict.kind==="eligible"&&v.state.exactStats&&!v.state.retired)return true;
   }catch{}
  }return false;
 }
 function run(x){
  const {id,g,b,i,n,r,k,group}=x;metrics.attempts++;if(paretoMode){const v=potential(x);metrics.paretoSelected++;paretoOriginTurns.set(g.origin,(paretoOriginTurns.get(g.origin)||0)+1);paretoBodyTurns.set(n.body,(paretoBodyTurns.get(n.body)||0)+1);metrics.paretoSelectedScoreMax=Math.max(metrics.paretoSelectedScoreMax??-Infinity,v);}if(x.kind==="NUMERIC")metrics.numericAttempts++;if(x.kind==="BODY")metrics.bodyAttempts++;metrics.selectedTraitsMax=Math.max(metrics.selectedTraitsMax,n.traits.length);metrics.selectedProjectedTraitsMax=Math.max(metrics.selectedProjectedTraitsMax,projectedTraits(x));metrics.selectedCapTotalMax=Math.max(metrics.selectedCapTotalMax,total(n.permanentCapVector));metrics.selectedCurrentTotalMax=Math.max(metrics.selectedCurrentTotalMax,total(n.permanentVector));turns[g.origin]=(turns[g.origin]||0)+1;groupTurns[group]=(groupTurns[group]||0)+1;
  const rec={graph:id,node:i,origin:g.origin,branch:g.branch,action:r.id,targets:x.ts,goals:r.requires,priorTraits:n.traits.length,priority:{capTotal:total(n.permanentCapVector),currentTotal:total(n.permanentVector),score:quality(n,r,g)},candidateKind:x.kind,...(paretoMode?{paretoPriority:potential(x),projectedCap:x.projectedCap}:{}),estimatedCapGain:x.capGain,estimatedTotalGain:x.estimatedTotalGain,baseCandidate:x.base,templateRevision:revision(r),...(x.retry?{retryOf:x.previous}:{}),outcomes:[]};records[k]=rec;latest.set(x.base,{k,r:rec});if(x.retry){retriedThisBatch.add(x.base);metrics.retryAttempts++;}
  try{
   const w=loadNode(id,g,i),steps=stepsFor(g,i),full=[...g.birthActions,...steps],keep=commit(b),validTargets=x.ts.filter(t=>ready(w,targets.get(t))),s=member(w).state;
   activeIndex.learn(n,w);const alreadyActive=r.requires.every(k=>active(w,k));rec.alreadyActive=alreadyActive;if(alreadyActive)metrics.activeAttempts++;
   rec.targets=validTargets;if(!validTargets.length){rec.status="TARGET_INACTIVE";return;}
   // Only a certificate against admitted numerical witnesses may stop a
   // branch. A weak heuristic score never eliminates a candidate.
   if(r.requiredPreviousTransformations?.some(k=>!s.history.has(k))||r.forbiddenPreviousTransformations?.some(k=>s.history.has(k))){rec.status="HISTORY_GATE";return;}
   if(paretoMode&&paretoPrune){const proof=paretoSearch.prove(x,s.initialStats,validTargets,[...s.history.keys()]);if(proof){
    paretoReceipts[x.base]=proof;prunedThisBatch.add(k);metrics.paretoPruned++;delete records[k];
    if(x.retry&&records[x.previous])latest.set(x.base,{k:x.previous,r:records[x.previous]});else latest.delete(x.base);
    return;
   }}
   let base={world:w,steps},parent=i;
   if(!probe(base,r)){rec.status="PROBE_UNRESOLVED";metrics.probeRejected++;return;}
   const allowed=(a,z)=>keep.every(k=>active(z,k))&&validTargets.every(t=>ready(z,targets.get(t)))&&![...z.researched].some(k=>!a.researched.has(k)&&((b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k)));
   if(!r.requires.every(k=>active(w,k))){
    if(r.requires.some(k=>w.disabled.has(k))){rec.status="DISABLED_RESEARCH_UNRESOLVED";return;}
    let suffix=null,end=null;
    const proposals=matchingTemplates(r).sort((a,b)=>Number(b.branch===g.branch)-Number(a.branch===g.branch)||a.steps.length-b.steps.length);
    for(const p of proposals.slice(0,12)){
     // First try the unchanged witness. Then propose a new sequence that
     // omits already-active ordinary research (never repeat/free/event research).
     // The altered sequence is independently replayed, not an equivalence proof.
     for(const adapt of [false,true]){
      metrics.templateTrials++;
      try{let z=w;const used=[],skipped=[];
       for(const a of p.steps){
        if(adapt&&a.type==="research"&&!z.pendingFree&&active(z,a.id)){skipped.push(a.id);continue;}
        const next=replay.apply(z,a);if(!allowed(z,next))throw Error("BRANCH_CONFLICT");z=next;used.push(a);
       }
       if(!used.length||z.pendingFree||!r.requires.every(k=>active(z,k))||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...full,...used],z).length)throw Error("TEMPLATE_GOAL");
       if(exactWorld(replay.replay(used,w))!==exactWorld(z))throw Error("TEMPLATE_REPLAY");
       suffix=used;end=z;rec.template={graph:p.graph,node:p.node,hash:p.hash,origin:p.origin,action:p.action,adapted:skipped.length>0,skipped};
       metrics.templateHits++;if(p.origin!==g.origin)metrics.crossOriginHits++;if(p.action!==r.id)metrics.goalTemplateHits++;
       if(skipped.length){metrics.adaptedTemplateHits++;metrics.skippedActiveResearch+=skipped.length;}break;
      }catch(e){metrics.templateRejected++;const reason=String(e.message||e).slice(0,180);metrics.templateFailureReasons[reason]=(metrics.templateFailureReasons[reason]||0)+1;}
     }
     if(suffix)break;
    }
    if(!suffix){
     const p=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b);
     const frag=fragmentIndex.propose({world:w,goals:r.requires,planner:p,replay,allowed,accept:(steps,z)=>context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...full,...steps],z).length>0,deadline:Math.min(deadline(),performance.now()+750)});
     metrics.fragmentTrials+=frag.metrics.trials;metrics.fragmentApplied+=frag.metrics.applied;metrics.fragmentRejected+=frag.metrics.rejected;metrics.fragmentResearchAdded+=frag.metrics.added;
     if(frag.steps.length){rec.fragments=frag.sources;rec.fragmentComplete=frag.complete;if(frag.complete)metrics.fragmentHits++;else metrics.fragmentPartial++;}
     if(frag.complete){suffix=frag.steps;end=frag.world;rec.remaining=[];}
     else{
      metrics.plannerCalls++;
      const q=createStagedResearch({planner:p,active,accept:(a,z)=>allowed(a.world,z.world),deadline:Math.min(deadline(),performance.now()+4500),maxCalls:8,maxDepth:16,variant:groupTurns[group]-1}).run({world:frag.world,steps:[...full,...frag.steps],trace:[],diagnostics:[]},r.requires);
      suffix=q.node.steps.slice(full.length);rec.remaining=q.remaining;rec.failures=q.failures.slice(-2);
      if(!suffix.length){rec.status="LIMITED_RESEARCH_UNRESOLVED";return;}
      end=replay.replay(suffix,w);if(exactWorld(end)!==exactWorld(q.node.world))throw Error("TRAIT_CHAIN_RESEARCH_REPLAY");
     }
    }
    if(!allowed(w,end)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...full,...suffix],end).length)throw Error("TRAIT_CHAIN_CONTEXT");
    const e=insert(id,g,end,i,"TRAIT_CHAIN_RESEARCH:"+r.id,suffix,true);parent=e.to;enqueue(id,parent);activeIndex.learn(g.nodes[parent],end);
    rec.researchNode=parent;rec.researchSuffixHash=key(suffix);rec.added=[...end.researched].filter(k=>active(end,k)&&!active(w,k));rec.researchReady=r.requires.every(k=>active(end,k));metrics.researchAdvanced++;
    if(!rec.researchReady){rec.status="PARTIAL_RESEARCH";return;}
    base={world:end,steps:[...steps,...suffix]};
   }
   for(const mode of ["DIRECT","GROW_THEN_TRANSFORM"])try{
    const z=mode==="DIRECT"?base:replay.grow(base);if(mode!=="DIRECT"&&z===base){metrics.identicalGrowthSkipped++;continue;}const v=replay.transform(z,r);
    if(!v||!validTargets.every(t=>ready(v.world,targets.get(t))))continue;
    const ss=v.steps.slice(base.steps.length),end=replay.replay(ss,base.world);
    if(exactWorld(end)!==exactWorld(v.world)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...v.steps],end).length)continue;
    const before=counts(z.world),after=counts(end),pre=replay.finish(z.world),post=replay.finish(end);
    const oldState=member(z.world).state,newState=member(end).state;
    const gain=post.permanentCapVector.map((v,i)=>v-pre.permanentCapVector[i]),rawDelta=post.raw.map((v,i)=>v-pre.raw[i]);
    if(x.kind==="NUMERIC"&&key([pre.raw,pre.permanentCapVector,pre.body,pre.rank,pre.medals,oldState.armorId,[...oldState.history.keys()].sort(),Object.keys(before).sort()])===key([post.raw,post.permanentCapVector,post.body,post.rank,post.medals,newState.armorId,[...newState.history.keys()].sort(),Object.keys(after).sort()])){
     rec.outcomes.push({mode,status:"COUNT_ONLY_DEFERRED",before,after,capDelta:gain,rawDelta});metrics.countOnlyDeferred++;continue;
    }
    const e=insert(id,g,end,parent,"TRAIT_CHAIN_TRANSFORM:"+r.id,ss,true);enqueue(id,e.to);activeIndex.learn(g.nodes[e.to],end);
    rec.outcomes.push({mode,...e,before,after,history:Object.fromEntries([...member(end).state.history].sort()),body:member(end).state.soldierType,traitCount:Object.keys(after).length,capDelta:gain,capTotalDelta:total(gain),rawDelta});
    if(e.status==="CONDITIONAL_REPLAY"){metrics.applied++;if(alreadyActive)metrics.activeApplied++;if(x.retry)metrics.retryApplied++;if(x.kind==="NUMERIC")metrics.numericApplied++;if(x.kind==="BODY")metrics.bodyApplied++;if(gain.some(v=>v>0)){metrics.capImproved++;metrics.maxCapGain=Math.max(metrics.maxCapGain,total(gain));}if(Object.keys(after).length>Object.keys(before).length)metrics.traitGains++;}else metrics.aliases++;
   }catch(e){rec.outcomes.push({mode,status:"UNRESOLVED",reason:String(e.message)});}
   rec.status=rec.outcomes.some(e=>Number.isInteger(e.to))?"CONDITIONAL_TRANSFORM_REPLAY":rec.outcomes.some(e=>e.status==="COUNT_ONLY_DEFERRED")?"COUNT_ONLY_DEFERRED":"UNRESOLVED_TRANSFORM";
  }catch(e){rec.status="LIMITED_UNRESOLVED";rec.reason=String(e.message);}
 }
 function summary(){
  const rs=Object.values(records),out=rs.flatMap(r=>r.outcomes||[]),ok=out.filter(e=>e.status==="CONDITIONAL_REPLAY");
  const states=new Set(rs.flatMap(r=>r.outcomes.filter(e=>e.status==="CONDITIONAL_REPLAY").map(e=>r.graph+"|"+e.to)));
  return {scope:"ORDINARY_EFFORT_TRAIT_CHAIN_NOT_CLOSURE",sourceFingerprint:terminalRule.fingerprint,attempts:rs.length,successful:rs.filter(r=>r.status==="CONDITIONAL_TRANSFORM_REPLAY").length,researchAdvanced:rs.filter(r=>r.researchSuffixHash).length,templateHits:rs.filter(r=>r.template).length,crossOriginHits:rs.filter(r=>r.template&&r.template.origin!==r.origin).length,distinctStates:states.size,traitGains:ok.filter(e=>e.traitCount>Object.keys(e.before).length).length,maxTraits:Math.max(0,...ok.map(e=>e.traitCount)),atLeast15:ok.filter(e=>e.traitCount>=15).length,fragmentLibrary:fragmentIndex.size,fragmentCombinations:rs.filter(r=>r.fragments?.length).length,fragmentComplete:rs.filter(r=>r.fragmentComplete).length,retryRecords:rs.filter(r=>r.retryOf).length,retrySuccessful:rs.filter(r=>r.retryOf&&r.status==="CONDITIONAL_TRANSFORM_REPLAY").length,pending:pendingCount(),focusedPending:pendingCount(true),pendingScope:"ALL_GRAPHS",paretoSearch:paretoSearch?.metrics||null,paretoReceiptCount:Object.keys(paretoReceipts).length,activeResearchIndex:activeIndex.metrics,completeCombinations:0,round:metrics};
 }
 const publishedNodes=id=>Object.values(records).filter(r=>r.graph===id).flatMap(r=>[r.node,r.researchNode,...r.outcomes.map(e=>e.to)]).filter(Number.isInteger);
 return {next,run,summary,records,turns,groupTurns,metrics,publishedNodes,paretoReceipts};
}
