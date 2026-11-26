// High-retained-trait continuation under the ordinary-effort research policy.
// Templates are proposals only: all actions must replay on the recipient world.
// No trait-count target, budget, or failed proposal is a closure certificate.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createResearchFragmentIndex} from "./population-research-fragments.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
import {applyTransformation} from "../public/soldiers/modern/eligibility.js";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),counts=w=>Object.fromEntries([...member(w).state.bonusCounts].sort());
export function createTerminalTraitChain({terminal,terminalRule,graphs,branches,byBody,data,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,endStage,recovery,deadline,prior={},graphFilter=()=>true}){
 const targets=new Map(terminalRule.targets.map(t=>[t.id,t])),records=prior.records||{},turns={...prior.turns},groupTurns={...prior.groupTurns},metrics={attempts:0,probeRejected:0,templateTrials:0,templateHits:0,templateRejected:0,crossOriginHits:0,plannerCalls:0,researchAdvanced:0,applied:0,aliases:0,traitGains:0,candidateScans:0,candidateVisits:0,adaptedTemplateHits:0,goalTemplateHits:0,skippedActiveResearch:0,nodeVisits:0,lineageRebuilds:0,groupVisits:0,retiredCandidates:0,selectedCapTotalMax:0,selectedCurrentTotalMax:0,fragmentTrials:0,fragmentApplied:0,fragmentRejected:0,fragmentHits:0,fragmentPartial:0,fragmentResearchAdded:0,templateFailureReasons:{}};
 const roots=new Map(),known=new Map(),templateIndex=new Map(),goalIndex=new Map(),ruleCache=new Map(),fragmentIndex=createResearchFragmentIndex(),indexedTemplates=new Set();
 const goalKey=goals=>key([...new Set(goals)].sort());
 const rulesFor=(b,body)=>{const k=JSON.stringify([b.id,body]);if(!ruleCache.has(k)){const keep=new Set(commit(b)),blocked=new Set(b.blockedResearch||[]);ruleCache.set(k,(byBody.get(body)||[]).filter(r=>!r.reset&&!r.removeTransformations?.length&&r.soldierBonusType&&!r.forbiddenSoldierTypes?.includes(body)&&r.requires.every(k=>!blocked.has(k)&&(!allChoice.has(k)||keep.has(k)))));}return ruleCache.get(k);};
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
 const graphIndex=new Map(),groups=new Map(),registered=new Set();
 // Numeric quality is a scheduling heuristic, not an admissible upper bound.
 const total=v=>v.reduce((a,b)=>a+b,0);
 const quality=n=>total(n.permanentCapVector)+0.2*total(n.permanentVector)+45*n.traits.length;
 const precedes=(a,b)=>quality(b.n)-quality(a.n)||a.i-b.i||a.k.localeCompare(b.k);
 function push(heap,x){
  let i=heap.length;heap.push(x);while(i){const p=(i-1)>>1;if(precedes(heap[p],x)<=0)break;heap[i]=heap[p];i=p;}heap[i]=x;
 }
 function pop(heap){
  const head=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let j=2*i+1;if(j+1<heap.length&&precedes(heap[j+1],heap[j])<0)j++;if(precedes(last,heap[j])<=0)break;heap[i]=heap[j];i=j;}heap[i]=last;}return head;
 }
 function valid(x){
  if(records[x.k]||x.g.blocker)return false;
  const h=known.get(x.id+"|"+x.i),r=x.r;
  if(h&&(r.requiredPreviousTransformations?.some(k=>!h[k])||r.forbiddenPreviousTransformations?.some(k=>h[k])))return false;
  return x.n.edges?.find(e=>e.action===r.id)?.status!=="HISTORY_GATE";
 }
 function refreshCandidates(){
  refresh();metrics.candidateScans++;
  for(const [id,root] of roots){
   const g=graphs[id],b=branches.get(g.branch);if(g.blocker||!b||!graphFilter(g,b))continue;
   const signature=JSON.stringify([...root].map(([i,t])=>[i,[...t].sort()]).sort((a,b)=>a[0]-b[0]));
   let ix=graphIndex.get(id);
   if(!ix||ix.signature!==signature){ix={signature,line:[]};graphIndex.set(id,ix);metrics.lineageRebuilds++;}
   for(let i=ix.line.length;i<g.nodes.length;i++){
    const n=g.nodes[i],ts=new Set([...(ix.line[n.parent]||[]),...(root.get(i)||[])]);ix.line.push(ts);metrics.nodeVisits++;
    if(!ts.size)continue;
    for(const r of rulesFor(b,n.body)){
     if(n.traits.includes(r.soldierBonusType))continue;
     const k=key([id,i,r.id]);if(registered.has(k)||records[k])continue;
     const group=key([g.origin,g.branch,n.body,n.traits.slice().sort(),r.id]),x={id,g,b,i,n,r,k,group};
     if(!valid(x))continue;
     registered.add(k);metrics.candidateVisits++;
     let heap=groups.get(group);if(!heap){heap=[];groups.set(group,heap);}
     push(heap,x);
    }
   }
  }
 }
 function next(){
  refreshCandidates();const fair=metrics.attempts%5===4,cmp=(x,y)=>(fair?x.age-y.age:0)||(y.priority-100*y.groupAge)-(x.priority-100*x.groupAge)||x.age-y.age||x.i-y.i||x.k.localeCompare(y.k);let best;
  for(const [group,heap] of groups){
   metrics.groupVisits++;
   while(heap.length&&!valid(heap[0])){pop(heap);metrics.retiredCandidates++;}
   if(!heap.length){groups.delete(group);continue;}
   const h=heap[0],{n,r,g,id,i}=h;
   const x={...h,ts:[...graphIndex.get(id).line[i]],age:turns[g.origin]||0,groupAge:groupTurns[group]||0,
    priority:quality(n)+(templateIndex.get(r.id)?.length?70:0)+(r.producedSoldierType&&r.producedSoldierType!==n.body?20:0)};
   if(!best||cmp(x,best)<0)best=x;
  }
  return best;
 }
 function pendingCount(){
  refreshCandidates();let n=0;
  for(const heap of groups.values())for(const x of heap)if(valid(x))n++;
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
  const {id,g,b,i,n,r,k,group}=x;metrics.attempts++;metrics.selectedCapTotalMax=Math.max(metrics.selectedCapTotalMax,total(n.permanentCapVector));metrics.selectedCurrentTotalMax=Math.max(metrics.selectedCurrentTotalMax,total(n.permanentVector));turns[g.origin]=(turns[g.origin]||0)+1;groupTurns[group]=(groupTurns[group]||0)+1;
  const rec={graph:id,node:i,origin:g.origin,branch:g.branch,action:r.id,targets:x.ts,goals:r.requires,priorTraits:n.traits.length,priority:{capTotal:total(n.permanentCapVector),currentTotal:total(n.permanentVector),score:quality(n)},outcomes:[]};records[k]=rec;
  try{
   const w=loadNode(id,g,i),steps=stepsFor(g,i),full=[...g.birthActions,...steps],keep=commit(b),validTargets=x.ts.filter(t=>ready(w,targets.get(t))),s=member(w).state;
   rec.targets=validTargets;if(!validTargets.length){rec.status="TARGET_INACTIVE";return;}
   if(r.requiredPreviousTransformations?.some(k=>!s.history.has(k))||r.forbiddenPreviousTransformations?.some(k=>s.history.has(k))){rec.status="HISTORY_GATE";return;}
   let base={world:w,steps},parent=i;
   if(!probe(base,r)){rec.status="PROBE_UNRESOLVED";metrics.probeRejected++;return;}
   const allowed=(a,z)=>keep.every(k=>active(z,k))&&validTargets.every(t=>ready(z,targets.get(t)))&&![...z.researched].some(k=>!a.researched.has(k)&&((b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k)));
   if(!r.requires.every(k=>active(w,k))){
    if(r.requires.some(k=>w.disabled.has(k))){rec.status="DISABLED_RESEARCH_UNRESOLVED";return;}
    let suffix=null,end=null;
    const proposals=[...new Map([...(templateIndex.get(r.id)||[]),...(goalIndex.get(goalKey(r.requires))||[])].map(p=>[p.hash,p])).values()].sort((a,b)=>Number(b.branch===g.branch)-Number(a.branch===g.branch)||a.steps.length-b.steps.length);
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
    const e=insert(id,g,end,i,"TRAIT_CHAIN_RESEARCH:"+r.id,suffix,true);parent=e.to;enqueue(id,parent);
    rec.researchNode=parent;rec.researchSuffixHash=key(suffix);rec.added=[...end.researched].filter(k=>active(end,k)&&!active(w,k));rec.researchReady=r.requires.every(k=>active(end,k));metrics.researchAdvanced++;
    if(!rec.researchReady){rec.status="PARTIAL_RESEARCH";return;}
    base={world:end,steps:[...steps,...suffix]};
   }
   for(const mode of ["DIRECT","GROW_THEN_TRANSFORM"])try{
    const z=mode==="DIRECT"?base:replay.grow(base),v=replay.transform(z,r);
    if(!v||!validTargets.every(t=>ready(v.world,targets.get(t))))continue;
    const ss=v.steps.slice(base.steps.length),end=replay.replay(ss,base.world);
    if(exactWorld(end)!==exactWorld(v.world)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...v.steps],end).length)continue;
    const before=counts(base.world),after=counts(end),e=insert(id,g,end,parent,"TRAIT_CHAIN_TRANSFORM:"+r.id,ss,true);enqueue(id,e.to);
    rec.outcomes.push({mode,...e,before,after,history:Object.fromEntries([...member(end).state.history].sort()),body:member(end).state.soldierType,traitCount:Object.keys(after).length});
    if(e.status==="CONDITIONAL_REPLAY"){metrics.applied++;if(Object.keys(after).length>Object.keys(before).length)metrics.traitGains++;}else metrics.aliases++;
   }catch(e){rec.outcomes.push({mode,status:"UNRESOLVED",reason:String(e.message)});}
   rec.status=rec.outcomes.some(e=>Number.isInteger(e.to))?"CONDITIONAL_TRANSFORM_REPLAY":"UNRESOLVED_TRANSFORM";
  }catch(e){rec.status="LIMITED_UNRESOLVED";rec.reason=String(e.message);}
 }
 function summary(){
  const rs=Object.values(records),out=rs.flatMap(r=>r.outcomes||[]),ok=out.filter(e=>e.status==="CONDITIONAL_REPLAY");
  const states=new Set(rs.flatMap(r=>r.outcomes.filter(e=>e.status==="CONDITIONAL_REPLAY").map(e=>r.graph+"|"+e.to)));
  return {scope:"ORDINARY_EFFORT_TRAIT_CHAIN_NOT_CLOSURE",sourceFingerprint:terminalRule.fingerprint,attempts:rs.length,successful:rs.filter(r=>r.status==="CONDITIONAL_TRANSFORM_REPLAY").length,researchAdvanced:rs.filter(r=>r.researchSuffixHash).length,templateHits:rs.filter(r=>r.template).length,crossOriginHits:rs.filter(r=>r.template&&r.template.origin!==r.origin).length,distinctStates:states.size,traitGains:ok.filter(e=>e.traitCount>Object.keys(e.before).length).length,maxTraits:Math.max(0,...ok.map(e=>e.traitCount)),atLeast15:ok.filter(e=>e.traitCount>=15).length,fragmentLibrary:fragmentIndex.size,fragmentCombinations:rs.filter(r=>r.fragments?.length).length,fragmentComplete:rs.filter(r=>r.fragmentComplete).length,pending:pendingCount(),pendingScope:"CURRENT_GRAPH_FILTER",completeCombinations:0,round:metrics};
 }
 const publishedNodes=id=>Object.values(records).filter(r=>r.graph===id).flatMap(r=>[r.node,r.researchNode,...r.outcomes.map(e=>e.to)]).filter(Number.isInteger);
 return {next,run,summary,records,turns,groupTurns,metrics,publishedNodes};
}
