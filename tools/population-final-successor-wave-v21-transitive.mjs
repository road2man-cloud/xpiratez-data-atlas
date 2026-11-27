// Bounded, immediately resumable multi-surgery production. No search limit
// or failed action is evidence of closure: the existing final gate is unchanged.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createFirstSuccessorIndex} from "./atlas-first-successor-obligations.mjs";
import {createTerminalDescendantFrontier} from "./population-terminal-descendant-frontier.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
import {createResearchFragmentIndex} from "./population-research-fragments-v2-ready.mjs";
import {createSuccessorEffectPriority} from "./population-successor-effect-priority.mjs";
import {createBodyCareerScope} from "./atlas-body-career-scope-v2-transitive.mjs";
import {createSurgeryMedalPreparation} from "./population-surgery-medal-preparation-v2-intrinsic.mjs";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createFinalSuccessorWave({data,graphs,branches,terminal,terminalRule,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,materialPolicy,graphFilter=()=>true,bodyFilter=()=>true,deadline,prior={},chainQuantum=6,rootAttemptBudget=8,ruleAttemptBudget=2,stagedPrefixes={},preserveBody=false,excludeChort=false,fragmentMs=1500,historyIndex,activeIndex,admissionWitnesses={},priorRoutes={},postRevivalOnly=false,focusActions=[],liveRepeatOnly=false,compactRecords={},compactOnly=false,effectPriority=true,bodyScopeProduction=false,medalPreparation=false,focusGraphs=[],readyGraphPriority=false}){
 if(![chainQuantum,rootAttemptBudget,ruleAttemptBudget].every(x=>Number.isSafeInteger(x)&&x>0))throw Error("Invalid closure scheduling budget");
 const first=createFirstSuccessorIndex(data),front=createTerminalDescendantFrontier(graphs,terminal.records),records={...(prior.records||{})},published=new Map(),visited=new Set(),turns=new Map(),counts=new Map(),nodeTurns=new Map();
 const finite=Object.fromEntries(materialPolicy.finite),focus=new Set(focusActions),graphFocus=new Set(focusGraphs);
 for(const id of graphFocus)if(!graphs[id])throw Error("Unknown closure graph "+id);
 if(bodyScopeProduction&&!preserveBody)throw Error("Body scope production requires preserve-body lane");
 const scope=bodyScopeProduction?createBodyCareerScope(data,[...branches.values()],replay):null;
 const medals=medalPreparation?createSurgeryMedalPreparation(data,replay):null;
 const metrics={policy:"FIRST_SUCCESSOR_PRODUCTION_V21_TRANSITIVE",focusGraphs,readyGraphPriority,readyGraphRoots:0,readyGraphDeferred:0,exactSeedHints:0,exactSeedHintErrors:0,medalPreparation,medalCatalog:medals?.medals||[],medalTrials:0,medalReady:0,medalTransformed:0,medalClosedCandidates:0,medalUnresolved:0,bodyScopeProduction,scopeAlreadyClosed:0,scopeCycleCandidates:0,scopeNewCandidates:0,scopeRepeatProofs:0,scopeAssessments:0,scopeStats:scope?.stats||null,effectPriority,effectRoots:0,effectPrioritizedAttempts:0,effectObserved:{positive:0,negative:0,mixed:0,neutral:0},effectIndex:null,compactOnly,compactReceipts:0,compactReceiptRejected:0,compactSeeds:0,compactRoots:0,compactAttempts:0,compactNewStates:0,compactTransforms:0,compactTraitGains:0,compactTraitLosses:0,compactResearch:0,compactClosed:0,compactRepeatedDeferred:0,compactRootsByBody:{},liveRepeatOnly,repeatLiveSeeds:0,repeatLiveAttempts:0,repeatLiveProduced:0,repeatLiveChanged:0,repeatLiveUnchanged:0,repeatLiveDeferred:0,repeatLiveByRule:{},focusActions,focusDeferred:0,corridorGoals:{},corridorDirectGains:0,corridorCompleted:0,postRevivalOnly,postRevivalSeeds:0,postRevivalRoots:0,postRevivalDeferred:0,postRevivalGrowth:0,postRevivalLiveTransforms:0,postRevivalTraitGains:0,postRevivalTraitLosses:0,postRevivalRawGain:0,postRevivalRawLoss:0,postRevivalActions:{},repeatRevivalSeeds:0,repeatRevivalRoots:0,repeatRevivalAttempts:0,repeatRevivalProduced:0,repeatRevivalChanged:0,repeatRevivalCounterOnly:0,repeatRevivalByRule:{},revivalSeeds:0,revivalLaneRoots:0,revivalAttempts:0,revivalSuccess:0,revivalRepeatDeferred:0,revivalByRule:{},lifecycleLaneRoots:0,lifecycleLaneAttempts:0,lifecycleLaneGrowth:0,lifecycleLaneFallbacks:0,lifecycleHints:0,lifecycleRepairSeeds:0,lifecycleRepairRoots:0,lifecycleParentSeeds:0,lifecycleRepairAttempts:0,lifecycleIntroductionsProjected:0,lifecycleReduced:0,lifecycleAdded:0,intermediateFollowAvoided:0,unsupportedByKind:{},lifecycleActions:{},historicalReceipts:0,liveCostSamples:0,existingChildHints:0,selectedProductive:0,selectedNovel:0,selectedCost:0,duplicateJobAttempts:0,seedArchiveHints:0,seedHistoryHints:0,seedUnknownHints:0,seedDeferredHints:0,selectedReadyRoots:0,selectedNearRoots:0,selectedObligationSum:0,selectedArchivedRoots:0,excludeChort,classDeferred:0,rootsByPath:{},rootsByOrigin:{},attempts:0,examined:0,growth:0,researchAdvanced:0,researchReady:0,transformed:0,aliases:0,closedCandidates:0,unsupported:0,stalled:0,byBody:{},addedResearch:0,chainedAttempts:0,maxChainDepth:0,multiTransformChains:0,obligationReduction:0,branchExcludedJobs:0,failedByReason:{},seedCount:0,fragmentCount:0,fragmentTrials:0,fragmentApplied:0,fragmentResearch:0,fragmentComplete:0,fragmentRejected:0,fragmentPreflightRejected:0,bodyChangeDeferred:0,rootsByBody:{},budgetDeferred:0,ruleDeferred:0,repeatDeferred:0,distinctSurgery:[],outcomes:[]};
 let effectIndex;
 function effects(){if(!effectIndex){effectIndex=createSuccessorEffectPriority({graphs,historyIndex});metrics.effectIndex=effectIndex.metrics;}return effectIndex;}
 const nodeKey=(id,i)=>id+"|"+i,actionKey=(id,i,a)=>id+"|"+i+"|"+a;
 for(const r of Object.values(records)){const k=actionKey(r.graph,r.node,r.action),n=nodeKey(r.graph,r.node);counts.set(k,(counts.get(k)||0)+1);nodeTurns.set(n,(nodeTurns.get(n)||0)+1);}
 // Actual shorter-witness receipts are scheduling hints, not a proof of
 // universal future equivalence. Only reference exact graph endpoints.
 const compactTargets=new Map(),compactSources=new Set();
 for(const r of Object.values(compactRecords)){
  if(!["COMPACT_REPLAY","POST_REVIVAL_COMPACT_REPLAY"].includes(r.status))continue;
  const g=graphs[r.graph],a=g?.nodes[r.from],b=g?.nodes[r.to];
  if(!a||!b||r.from===r.to||a.stateHash!==r.sourceStateHash||b.stateHash!==r.targetStateHash||!r.removed?.length||!Number.isFinite(r.savedCost)||r.savedCost<0){metrics.compactReceiptRejected++;continue;}
  if(r.status==="COMPACT_REPLAY"&&r.policy!=="NONREMOVABLE_PRESENCE_COUNTERS_V1"||r.status==="POST_REVIVAL_COMPACT_REPLAY"&&!["EXACT_AT_RECOVERED_CAP","PARETO_AT_RECOVERED_CAP"].includes(r.comparison?.kind)){metrics.compactReceiptRejected++;continue;}
  const k=nodeKey(r.graph,r.to),old=compactTargets.get(k);
  if(!old||old.removed.length<r.removed.length)compactTargets.set(k,r);
  compactSources.add(nodeKey(r.graph,r.from));metrics.compactReceipts++;
 }
 // Scheduling only: empirical outcomes do not establish infeasibility.
 const observations=new Map(),childrenCache=new WeakMap(),revivalAncestry=new WeakMap();
 // Record actual lifecycle actions, not transformation-history presence:
 // a reset can remove the revival ID without erasing the chronological event.
 function revived(g,i){
  let cache=revivalAncestry.get(g);if(!cache){cache=[];revivalAncestry.set(g,cache);}
  for(let k=cache.length;k<=i;k++){
   const n=g.nodes[k];if(!n)throw Error("Invalid lifecycle ancestry node");
   if(n.parent!=null&&(!Number.isSafeInteger(n.parent)||n.parent>=k||n.parent<0))throw Error("Invalid lifecycle ancestry parent");
   cache.push((n.parent==null?(g.birthActions||[]).some(a=>a.type==="transform"&&a.soldier==="origin"&&a.lifecycle):cache[n.parent])||(n.steps||[]).some(a=>a.type==="transform"&&a.soldier==="origin"&&a.lifecycle));
  }
  return cache[i];
 }
 function recordPostEffect(rec,g,from,to,action,source,target){
  if(!postRevivalOnly)return;
  const a=replay.finish(source),b=replay.finish(target),x=new Set(g.nodes[from].traits),y=new Set(g.nodes[to].traits);
  const gained=[...y].filter(k=>!x.has(k)),lost=[...x].filter(k=>!y.has(k));
  const rawDelta=b.raw.map((v,i)=>v-a.raw[i]),effectiveDelta=b.vector.map((v,i)=>v-a.vector[i]);
  rec.postRevivalEffect={policy:"CONCRETE_POST_REVIVAL_CONTINUATION_V1",from,to,sourceHash:g.nodes[from].stateHash,targetHash:g.nodes[to].stateHash,action,bodyBefore:a.body,bodyAfter:b.body,rawDelta,effectiveDelta,gained,lost,actualGameCertified:false,closureCertified:false};
  metrics.postRevivalTraitGains+=gained.length;metrics.postRevivalTraitLosses+=lost.length;
  metrics.postRevivalRawGain+=rawDelta.reduce((sum,v)=>sum+Math.max(v,0),0);
  metrics.postRevivalRawLoss+=rawDelta.reduce((sum,v)=>sum+Math.max(-v,0),0);
  if(action==="CAP_GROWTH")metrics.postRevivalGrowth++;else metrics.postRevivalLiveTransforms++;
  metrics.postRevivalActions[action]=(metrics.postRevivalActions[action]||0)+1;
 }
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
   const growth=n.steps?.length===1&&n.steps[0].type==="conditionalCapGrowth";
   if(a.length!==1&&!growth)continue;
   const set=c.byParent.get(n.parent)||new Set();set.add(growth?"CAP_GROWTH":a[0].transform);c.byParent.set(n.parent,set);
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
 // Compare concrete replay endpoints. Count-only changes are NOT closure or
 // equivalence proofs: history counts, materials and future gates may matter.
 function revivalEffect(before,after,r){
  const x=member(before).state,y=member(after).state;
  const delta=Object.fromEntries(Object.keys(x.currentStats).map(k=>[k,(y.currentStats[k]||0)-(x.currentStats[k]||0)]));
  const mapDiff=(a,b)=>Object.fromEntries([...new Set([...a.keys(),...b.keys()])].sort().filter(k=>(a.get(k)||0)!==(b.get(k)||0)).map(k=>[k,(b.get(k)||0)-(a.get(k)||0)]));
  const presenceDiff=(a,b)=>[...new Set([...a.keys(),...b.keys()])].sort().filter(k=>a.has(k)!==b.has(k));
  const historyDelta=mapDiff(x.history,y.history),bonusDelta=mapDiff(x.bonusCounts,y.bonusCounts);
  const historyPresence=presenceDiff(x.history,y.history),bonusPresence=presenceDiff(x.bonusCounts,y.bonusCounts);
  const bodyChanged=x.soldierType!==y.soldierType,armorChanged=x.armorId!==y.armorId;
  const rankChanged=x.rank!==y.rank,initialChanged=JSON.stringify(x.initialStats)!==JSON.stringify(y.initialStats);
  const changed=Object.values(delta).some(Boolean)||bodyChanged||armorChanged||rankChanged||initialChanged||historyPresence.length>0||bonusPresence.length>0||Object.keys(bonusDelta).length>0;
  return {policy:"EXACT_REVIVAL_EFFECT_V1",before:exactWorld(before),after:exactWorld(after),repeat:x.history.has(r.id),reset:!!r.reset,bodyBefore:x.soldierType,bodyAfter:y.soldierType,armorChanged,rankChanged,initialChanged,rawDelta:delta,historyDelta,historyPresence,bonusDelta,bonusPresence,requiredItems:r.requiredItems||{},cost:r.cost||0,classification:changed?"PERMANENT_STATE_CHANGE":"NO_OBSERVED_PERMANENT_CHANGE",closureCertified:false};
 }
 // A successful previously sampled no-change repeat is deprioritized at that
 // concrete child only. A reset, new research or another state can reopen it.
 // Ordinary repeat receipts are observations at a specific chronological
 // endpoint, not a proof that the operation is globally idempotent.
 const liveQuiet=new Set();
 for(const rec of Object.values(records))if(rec.liveRepeatEffect?.classification==="NO_OBSERVED_PERMANENT_CHANGE"){
  for(const e of rec.outcomes||[])if(e.status==="CONDITIONAL_REPLAY"&&Number.isInteger(e.to)){
   const n=graphs[rec.graph]?.nodes[e.to];if(n?.stateHash===rec.liveRepeatEffect.targetHash)liveQuiet.add(actionKey(rec.graph,e.to,rec.action));
  }
 }
 function liveRepeatEffect(g,from,to,before,after,r){
  const x=member(before).state,y=member(after).state,a=replay.finish(before),b=replay.finish(after);
  const diff=(v,z)=>v.map((n,i)=>z[i]-n), sorted=m=>[...m.entries()].sort(([k],[j])=>k.localeCompare(j));
  const rawDelta=diff(a.raw,b.raw),capDelta=diff(a.capRaw,b.capRaw),effectiveDelta=diff(a.vector,b.vector);
  const beforeHistory=[...x.history.keys()].sort(),afterHistory=[...y.history.keys()].sort();
  const same=(u,v)=>key(u)===key(v);
  const capEffectiveDelta=diff(a.capVector,b.capVector),bonusDelta=diff(a.bonus,b.bonus);
  const changed=[rawDelta,capDelta,effectiveDelta,capEffectiveDelta,bonusDelta].some(v=>v.some(Boolean))||!same(x.initialStats,y.initialStats)||!same(member(before).commendations||{},member(after).commendations||{})||!same(beforeHistory,afterHistory)||!same(sorted(x.bonusCounts),sorted(y.bonusCounts))||!same(g.nodes[from].traits,g.nodes[to].traits)||x.rank!==y.rank||x.armorId!==y.armorId||x.status!==y.status||x.soldierType!==y.soldierType;
  return {policy:"EXACT_LIVE_REPEAT_EFFECT_V1",parentHash:g.nodes[from].stateHash,sourceHash:exactWorld(before),targetHash:g.nodes[to].stateHash,rawDelta,capDelta,effectiveDelta,capEffectiveDelta,bonusDelta,historyCountBefore:x.history.get(r.id)||0,historyCountAfter:y.history.get(r.id)||0,requiredItems:r.requiredItems||{},cost:r.cost||0,classification:changed?"PERMANENT_STATE_CHANGE":"NO_OBSERVED_PERMANENT_CHANGE",closureCertified:false};
 }
 const quietRepeats=new Set();
 for(const rec of Object.values(records))if(rec.repeatRevivalEffect?.classification==="NO_OBSERVED_PERMANENT_CHANGE"&&Number.isInteger(rec.repeatRevivalTo))quietRepeats.add(actionKey(rec.graph,rec.repeatRevivalTo,rec.action));
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
  const inputs={body:n.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown!==false,active:new Set([...w.researched].filter(k=>active(w,k))),raw:n.raw,capRaw:n.capRaw,finite,consumed:materialPolicy.state(g,i).consumed};
  if(!scope)return first.assess(inputs);
  metrics.scopeAssessments++;
  const branch=branches.get(g.branch),atCap=inputs.raw.every((v,j)=>v===inputs.capRaw[j]);
  const q=scope.assess(inputs,branch,atCap?w:null);
  metrics.scopeRepeatProofs+=q.repeats.length;
  // Same independent admission policy; this is only a candidate signal.
  // No failed or budget-limited cycle proof excludes any action.
  if(!q.closed&&q.possibleExact&&!q.openGrowth&&performance.now()<deadline()){
   const cycle=scope.proveCapCycle(inputs,branch,w);
   if(cycle){q.closed=true;q.open=[];q.missingResearch=[];metrics.scopeCycleCandidates++;}
  }
  return q;
 }
 // Scheduling hints only. No archived or estimated obligation can grant
 // an action, certify closure, or remove a graph from the retained search.
 const branchForbidden=b=>new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!commit(b).includes(k))]);
 const runnable=(x,n,forbidden)=>{
  const r=replay.rules.get(x.id);
  return (x.live||isRevival(x.id))&&!x.clone&&r&&!r.producedItem&&(!excludeChort||x.destination!=="STR_SOLDIER_CHORT")&&(!preserveBody||x.destination===n.body)&&!x.missingResearch.some(k=>forbidden.has(k));
 };
 function score(q,n,b,source,existing=new Set(),h=null){
  const forbidden=branchForbidden(b),jobs=q.open.filter(x=>runnable(x,n,forbidden)&&(!focus.size||focus.has(x.id)));
  const liveRepeats=jobs.filter(x=>x.live&&!isRevival(x.id)&&h?.has(x.id)&&x.destination===n.body&&!replay.rules.get(x.id)?.reset);
  const ready=jobs.filter(x=>!x.missingResearch.length).length;
  const novelReady=jobs.filter(x=>!x.missingResearch.length&&!existing.has(x.id)&&!h?.has(x.id)).length;
  const novelMissing=jobs.filter(x=>x.missingResearch.length&&!existing.has(x.id)&&!h?.has(x.id)).length;
  const benefit=effectPriority?Math.max(0,...jobs.filter(x=>!x.missingResearch.length&&!existing.has(x.id)&&x.live&&!isRevival(x.id)).map(x=>effects().estimate(n,x.id,h instanceof Set?h.has(x.id):undefined).score)):0;
  const growth=Number(q.openGrowth&&(!focus.size||focus.has("CAP_GROWTH"))),unknown=(q.unknownRules||[]).length;
  const open=q.open.length+growth+unknown;
  const best=Math.max(growth*0.3,...jobs.map(x=>utility(n,b,x,Math.max(0,q.open.length-1),q.open.length,existing.has(x.id)).utility));
  const novel=jobs.filter(x=>!existing.has(x.id)).length+growth;
  const life=lifecyclePlan(n.body,h,b),repair=life.actions.filter(x=>!existing.has(x)&&jobs.some(j=>j.id===x));
  if(life.known)metrics.lifecycleHints++;
  const revival=jobs.filter(x=>isRevival(x.id)&&!existing.has(x.id)&&!h?.has(x.id));
  const revivalReady=revival.filter(x=>!x.missingResearch.length).length;
  const repeatRevival=jobs.filter(x=>isRevival(x.id)&&h?.has(x.id)&&!existing.has(x.id));
  const repeatReady=repeatRevival.filter(x=>!x.missingResearch.length).length;
  const postLive=jobs.filter(x=>x.live&&!isRevival(x.id)&&!existing.has(x.id));
  const postGrowth=growth&&!existing.has("CAP_GROWTH")?1:0;
  const postNovel=postLive.filter(x=>!h?.has(x.id));
  const compactNovel=jobs.filter(x=>!existing.has(x.id)&&!h?.has(x.id));
  const compactReady=compactNovel.filter(x=>!x.missingResearch.length).length;
  const postReady=postNovel.filter(x=>!x.missingResearch.length).length;
  return {source,open,best,novel,novelReady,novelMissing,benefit,compactNovel:compactNovel.length,compactReady,liveRepeatReady:liveRepeats.filter(x=>!x.missingResearch.length).length,liveRepeatNovel:liveRepeats.filter(x=>!existing.has(x.id)).length,liveRepeats:liveRepeats.length,revival:revival.length,revivalReady,revivalIds:revival.map(x=>x.id),repeatRevival:repeatRevival.length,repeatReady,repeatIds:repeatRevival.map(x=>x.id),postJobs:postLive.length+postGrowth,postGrowth,postNovel:postNovel.length,postReady,life:{known:life.known,current:life.current,best:life.best,gain:life.gain,repair},ready:ready+growth,jobs:jobs.length+growth,missing:jobs.length?Math.min(...jobs.map(x=>x.missingResearch.length)):0,unsupported:q.open.length-jobs.length,known:q.historyKnown!==false};
 }
 function hint(id,g,b,i){
  const n=g.nodes[i],rid="MISSCAR:"+id+":"+i,v=admissionWitnesses[rid],raw=priorRoutes[rid];
  if(v&&raw&&v.stateHash===n.stateHash&&v.stateHash===raw.canonicalStateHash&&v.actionHash===raw.fullActionHash&&raw.sourceGraph===id&&raw.sourceNode===i&&Array.isArray(v.openRules)){
   metrics.seedArchiveHints++;
   return score({open:v.openRules,openGrowth:v.openGrowth,unknownRules:v.unknownRules},n,b,"archive",children(g,i),historyIndex?.history(g,i));
  }
  const h=historyIndex?.history(g,i);
  // Bounded exact replay for the initial, newly recruited graph root only.
  // Never treat a scheduling hint as a final certificate.
  if(readyGraphPriority&&i===0&&graphFocus.has(id)&&performance.now()<deadline()){
   try{const w=loadNode(id,g,i),q=assess(g,i,w);activeIndex?.learn(n,w);metrics.exactSeedHints++;return score(q,n,b,"exact-root",children(g,i),new Set(member(w).state.history.keys()));}catch{metrics.exactSeedHintErrors++;}
  }
  if(h)metrics.seedHistoryHints++;else metrics.seedUnknownHints++;
  // Missing active research is treated as unknown here. Actual loadNode
  // and assess still run before any attempt; the archive cannot admit it.
  const inputs={body:n.body,history:h,historyKnown:!!h,active:new Set(),raw:n.raw,capRaw:n.capRaw,finite:{},consumed:{}};
  const q=scope?scope.assess(inputs,b):first.assess(inputs);
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
   if(graphFocus.size&&!graphFocus.has(id)){metrics.readyGraphDeferred++;continue;}
   const parents=new Set(g.nodes.map(n=>n.parent));
   const candidates=new Set(front.nodes(id));
   // A compact endpoint need not be a leaf, nor already have a terminal
   // record at its own node. The exact active-goal test below still applies.
   for(const r of compactTargets.values())if(r.graph===id)candidates.add(r.to);
   for(const i of candidates){
    const n=g.nodes[i];if(!bodyFilter(n.body)||(excludeChort&&n.body==='STR_SOLDIER_CHORT'))continue;
    if(postRevivalOnly&&!revived(g,i))continue;
    const compact=compactTargets.get(nodeKey(id,i));
    if(compactOnly&&!compact)continue;
    const parent=parents.has(i);
    // Non-leaf states retain untried life-cycle-reducing alternatives.
    // This lane does not remove the existing leaf queue or graph history.
    if(parent&&!historyIndex?.history(g,i))continue;
    const rid="MISSCAR:"+id+":"+i,v=admissionWitnesses[rid],raw=priorRoutes[rid];
    if(scope&&v?.status==="FINAL_CLOSED"&&v.stateHash===n.stateHash&&raw?.canonicalStateHash===n.stateHash&&v.actionHash===raw.fullActionHash){metrics.scopeAlreadyClosed++;continue;}
    const h=hint(id,g,b,i);
    if(scope&&!h.jobs)continue;
    if(focus.size&&!h.jobs)continue;
    if(liveRepeatOnly){if(!h.liveRepeats)continue;metrics.repeatLiveSeeds++;}
    if(postRevivalOnly){if(!h.postJobs)continue;metrics.postRevivalSeeds++;}
    else if(!scope&&!compact&&!focus.size&&parent&&!liveRepeatOnly&&!h.life.repair.length&&!h.revival&&!h.repeatRevival&&!(effectPriority&&h.benefit>0))continue;
    if(compactOnly&&!h.jobs)continue;
    if(compact)metrics.compactSeeds++;
    if(h.repeatRevival)metrics.repeatRevivalSeeds++;
    if(h.revival)metrics.revivalSeeds++;
    if(parent)metrics.lifecycleParentSeeds++;
    if(h.life.repair.length)metrics.lifecycleRepairSeeds++;
    if(!h.jobs)metrics.seedDeferredHints++;
    out.push({id,g,b,i,depth:0,transforms:0,remaining:h.open,h,parent,compact,previous:nodeTurns.get(nodeKey(id,i))||0});
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
  const repairRoots=new Set(),revivalRoots=new Set(),repeatRoots=new Set(),compactRoots=new Set(),benefitRoots=new Set();let pickedRoots=0;
  // Round-robin path, body and origin work, rather than repeatedly spending
  // a bounded production budget in the largest pre-existing path.
  // The original approximate closure ordering breaks ties only.
  const body=x=>x.g.nodes[x.i].body,path=x=>x.b.choices?.path||"UNSPECIFIED",origin=x=>x.g.origin;
  const tuple=x=>scope?[...(readyGraphPriority?[Number(!x.h.novelReady),x.h.novelMissing,Number(!x.h.novel)]:[]),Number(!x.h.ready),x.h.open+x.h.unsupported*2,Number(!x.h.novel),Math.min(x.previous,6),metrics.rootsByBody[body(x)]||0,metrics.rootsByPath[path(x)]||0,Number(x.h.source!=="archive"),x.h.missing]:compactOnly?[Number(!x.h.compactNovel),Number(!x.h.compactReady),metrics.rootsByPath[path(x)]||0,metrics.rootsByBody[body(x)]||0,x.previous,x.h.open,-(x.compact?.removed.length||0)]:liveRepeatOnly?[Number(!x.h.liveRepeatReady),Number(!x.h.liveRepeatNovel),x.previous,metrics.rootsByBody[body(x)]||0,metrics.rootsByPath[path(x)]||0,x.h.open]:postRevivalOnly?[Number(!x.h.postJobs),metrics.rootsByPath[path(x)]||0,Number(!x.h.postNovel),Number(!x.h.postReady&&!x.h.postGrowth),x.previous,x.h.open,metrics.rootsByBody[body(x)]||0,metrics.rootsByOrigin[origin(x)]||0]:[Number(!x.h.jobs),metrics.rootsByPath[path(x)]||0,x.h.open+x.h.unsupported*0.5+Number(!x.h.known)*3+Math.min(x.previous,4)+Number(!x.h.novel)*2-Math.min(3,x.h.best*4)+Math.min(3,x.h.life.best)*2-Math.min(2,x.h.life.repair.length)*5,Number(!x.h.ready),x.h.unsupported,metrics.rootsByBody[body(x)]||0,metrics.rootsByOrigin[origin(x)]||0];
  const cmp=(a,b)=>{const x=tuple(a),y=tuple(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;};
  function nextSeed(){
   // Reserve every second root for source-indexed life-cycle repair.
   // Bounds are scheduling only: never remove alternative obligations.
   let best=-1,compactLane=!scope&&!liveRepeatOnly&&!postRevivalOnly&&(compactOnly||pickedRoots%3===0)&&queue.some(x=>x.compact&&x.h.jobs),effectLane=!scope&&effectPriority&&!compactLane&&!compactOnly&&!liveRepeatOnly&&!postRevivalOnly&&pickedRoots%3===1&&queue.some(x=>x.h.benefit>0),repeatLane=!scope&&!effectLane&&!compactLane&&!liveRepeatOnly&&!postRevivalOnly&&pickedRoots%3===0&&queue.some(x=>x.h.repeatReady>0),revivalLane=!scope&&!effectLane&&!compactLane&&!liveRepeatOnly&&!postRevivalOnly&&!repeatLane&&pickedRoots%2===0&&queue.some(x=>x.h.revival>0),repairLane=!scope&&!effectLane&&!compactLane&&!liveRepeatOnly&&!postRevivalOnly&&!repeatLane&&!revivalLane&&pickedRoots%3===1&&queue.some(x=>x.h.life.repair.length>0);
   const effectCmp=(a,b)=>(metrics.rootsByPath[path(a)]||0)-(metrics.rootsByPath[path(b)]||0)||b.h.benefit-a.h.benefit||a.previous-b.previous||cmp(a,b);
   const repairCmp=(a,b)=>a.previous-b.previous||Number(!a.h.ready)-Number(!b.h.ready)||b.h.life.gain-a.h.life.gain||cmp(a,b);
   const revivalCmp=(a,b)=>Number(!a.h.revivalReady)-Number(!b.h.revivalReady)||(metrics.rootsByPath[path(a)]||0)-(metrics.rootsByPath[path(b)]||0)||a.previous-b.previous||a.h.open-b.h.open||cmp(a,b);
   for(let j=0;j<queue.length;j++){
    if(effectLane&&queue[j].h.benefit<=0)continue;
    if(compactLane&&(!queue[j].compact||!queue[j].h.jobs)||repeatLane&&!queue[j].h.repeatReady||revivalLane&&!queue[j].h.revival||repairLane&&!queue[j].h.life.repair.length)continue;
    if(best<0||(compactLane?(Number(!queue[j].h.compactNovel)-Number(!queue[best].h.compactNovel)||Number(!queue[j].h.compactReady)-Number(!queue[best].h.compactReady)||queue[j].previous-queue[best].previous||cmp(queue[j],queue[best])):effectLane?effectCmp(queue[j],queue[best]):repeatLane?revivalCmp(queue[j],queue[best]):revivalLane?revivalCmp(queue[j],queue[best]):repairLane?repairCmp(queue[j],queue[best]):cmp(queue[j],queue[best]))<0)best=j;
   }
   const t=queue.splice(best,1)[0];pickedRoots++;if(readyGraphPriority)metrics.readyGraphRoots++;if(effectLane){metrics.effectRoots++;benefitRoots.add(nodeKey(t.id,t.i));}if(postRevivalOnly)metrics.postRevivalRoots++;
   if(t.compact){compactRoots.add(nodeKey(t.id,t.i));metrics.compactRoots++;metrics.compactRootsByBody[body(t)]=(metrics.compactRootsByBody[body(t)]||0)+1;}
   if(repairLane){repairRoots.add(nodeKey(t.id,t.i));metrics.lifecycleLaneRoots++;}
   if(revivalLane){revivalRoots.add(nodeKey(t.id,t.i));metrics.revivalLaneRoots++;}
   if(repeatLane){repeatRoots.add(nodeKey(t.id,t.i));metrics.repeatRevivalRoots++;}
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
   if(q.closed){if(depth||compactRoots.has(root)){if(compactRoots.has(root))metrics.compactClosed++;metrics.closedCandidates++;retain(id,i);metrics.outcomes.push({graph:id,node:i,body:n.body,origin:g.origin,depth,transforms,status:"CLOSED_CANDIDATE"});}continue;}
   const keep=commit(b),forbidden=new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!keep.includes(k))]);
   const allowed=z=>!z.pendingFree&&keep.every(k=>active(z,k))&&targets.every(t=>t.researchGoals.every(k=>active(z,k))&&!(t.inactiveResearch||[]).some(k=>active(z,k)))&&![...z.researched].some(k=>forbidden.has(k));
   const history=new Set(member(w).state.history.keys());
   const jobs=[],rootRule=action=>root+"|"+action,lifePlan=lifecyclePlan(n.body,history,b);
   for(const x of q.open){
    const r=replay.rules.get(x.id);
    if(focus.size&&!focus.has(x.id)){metrics.focusDeferred++;continue;}
    const ordinaryRepeat=x.live&&!isRevival(x.id)&&history.has(x.id)&&!r?.reset&&x.destination===n.body;
    // In the compact production lane, do not immediately recreate a removed
    // repeat. Leave the action in the full obligation inventory.
    if(compactRoots.has(root)&&history.has(x.id)&&!r?.reset&&x.destination===n.body){metrics.compactRepeatedDeferred++;continue;}
    if(liveRepeatOnly&&!ordinaryRepeat){metrics.repeatLiveDeferred++;continue;}
    if(!liveRepeatOnly&&ordinaryRepeat&&liveQuiet.has(actionKey(id,i,x.id))){metrics.repeatLiveDeferred++;continue;}
    if(postRevivalOnly&&(!x.live||isRevival(x.id)||children(g,i).has(x.id))){metrics.postRevivalDeferred++;continue;}
    // Lane selection is not evidence of impossibility. q.open remains intact.
    if(excludeChort&&x.destination==='STR_SOLDIER_CHORT'){metrics.classDeferred++;continue;}
    if(preserveBody&&x.destination!==n.body){metrics.bodyChangeDeferred++;continue;}
    if((!x.live&&!isRevival(x.id))||x.clone||!r||r.producedItem){metrics.unsupported++;const kind=lifecycleKind(r)||"OTHER_STATUS";metrics.unsupportedByKind[kind]=(metrics.unsupportedByKind[kind]||0)+1;continue;}
    if(x.missingResearch.some(k=>forbidden.has(k))){metrics.branchExcludedJobs++;continue;}
    // Repeat death is not an exclusion proof. Bound only this production lane.
    if(isRevival(x.id)&&history.has(x.id)&&quietRepeats.has(actionKey(id,i,x.id))&&!repeatRoots.has(root)){metrics.revivalRepeatDeferred++;continue;}
    const h=r.reset?new Set():new Set(history);for(const k of r.removeTransformations||[])h.delete(k);h.add(r.id);
    // A projection for ranking only, using exact history and indexed rules.
    const after=scope?scope.assess({body:x.destination,history:h,historyKnown:true,active:new Set([...w.researched].filter(k=>active(w,k))),raw:n.raw,capRaw:n.capRaw,finite,consumed:materialPolicy.state(g,i).consumed},b).open.length:(first.byBody.get(x.destination)||[]).filter(z=>!z.requires.includes("STR_UNAVAILABLE")&&!z.forbiddenSoldierTypes?.includes(x.destination)&&!z.forbiddenPreviousTransformations?.some(k=>h.has(k))&&!(z.requiredPreviousTransformations||[]).some(k=>!h.has(k))).length;
    const useful=Number(x.destination!==n.body)+Number(!history.has(x.id));
    const used=rootRules.get(rootRule(x.id))||0,repeat=history.has(x.id)&&!r.reset&&x.destination===n.body&&after>=q.open.length;
    if(used>=ruleAttemptBudget){metrics.ruleDeferred++;continue;}
    if(repeat&&used>=1){metrics.repeatDeferred++;continue;}
    const duplicate=children(g,i).has(x.id),efficiency=utility(n,b,x,after,q.open.length,duplicate,repeat);
    if(duplicate)metrics.existingChildHints++;
    const lifecycle=lifePlan.byAction.get(x.id)||{before:0,after:0,remove:[],add:[],gain:0};
    // Prevent creating additional death-only dependencies merely to
    // increase a trait count. The action remains schedulable.
    const observedEffect=effectPriority?effects().estimate(n,x.id,history.has(x.id)):{samples:0,localSamples:0,score:0,factor:1};
    const adjustedUtility=efficiency.utility*observedEffect.factor*(1+Math.max(0,lifecycle.gain)*3)/(1+Math.max(0,-lifecycle.gain)*5);
    jobs.push({...x,r,after,useful,repeat:Number(repeat),used,attempts:counts.get(actionKey(id,i,x.id))||0,efficiency:{...efficiency,utility:adjustedUtility,observedEffect},lifecycle});
   }
   const revivalLane=revivalRoots.has(root),repeatLane=repeatRoots.has(root),benefitLane=benefitRoots.has(root);
   const benefitJob=x=>benefitLane&&x.live&&!isRevival(x.id)&&!x.missingResearch.length&&!x.efficiency.duplicate?Math.max(0,x.efficiency.observedEffect.score):0;
   const repeatJob=x=>Number(repeatLane&&isRevival(x.id)&&history.has(x.id)&&!x.missingResearch.length&&!x.efficiency.duplicate);
   jobs.sort((a,b)=>(scope?Number(a.efficiency.duplicate)-Number(b.efficiency.duplicate)||Number(!!a.missingResearch.length)-Number(!!b.missingResearch.length)||Number(history.has(a.id))-Number(history.has(b.id))||a.after-b.after:0)||(compactRoots.has(root)?Number(history.has(a.id))-Number(history.has(b.id))||Number(a.efficiency.duplicate)-Number(b.efficiency.duplicate)||Number(!!a.missingResearch.length)-Number(!!b.missingResearch.length):0)||(postRevivalOnly?Number(history.has(a.id))-Number(history.has(b.id))||Number(!!a.missingResearch.length)-Number(!!b.missingResearch.length):0)||benefitJob(b)-benefitJob(a)||repeatJob(b)-repeatJob(a)||Number(revivalLane&&isRevival(b.id))-Number(revivalLane&&isRevival(a.id))||Number(b.lifecycle.gain>0&&!b.efficiency.duplicate)-Number(a.lifecycle.gain>0&&!a.efficiency.duplicate)||b.efficiency.utility-a.efficiency.utility||a.repeat-b.repeat||a.attempts-b.attempts||a.after-b.after||a.id.localeCompare(b.id));
   const repairLane=repairRoots.has(root),hasRepair=jobs.some(x=>x.lifecycle?.gain>0&&!x.efficiency?.duplicate);
   if(repairLane&&!hasRepair)metrics.lifecycleLaneFallbacks++;
   if(!liveRepeatOnly&&q.openGrowth&&(!focus.size||focus.has("CAP_GROWTH"))&&(!postRevivalOnly||!children(g,i).has("CAP_GROWTH"))){
    const growth={id:"CAP_GROWTH",missingResearch:[],attempts:counts.get(actionKey(id,i,"CAP_GROWTH"))||0};
    // Try the life-cycle repair before incidental growth. The surgery
    // replay itself retains the exact grown alternative where needed.
    if(compactRoots.has(root)&&jobs.some(x=>!history.has(x.id)&&!x.missingResearch.length)|| (revivalLane||repeatLane)&&jobs.some(x=>isRevival(x.id))||repairLane&&hasRepair||benefitLane&&jobs.some(x=>benefitJob(x)>0))jobs.push(growth);else jobs.unshift(growth);
   }
   let progressed=false;
   function add(parent,from,to,suffix,label,childTransforms){
    if(!suffix.length||!allowed(to)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...stepsFor(g,parent),...suffix],to).length)throw Error("SUCCESSOR_CONTEXT");
    if(exactWorld(replay.replay(suffix,from))!==exactWorld(to))throw Error("SUCCESSOR_REPLAY");
    const e=insert(id,g,to,parent,label,suffix,true);
    if(e.status==="CONDITIONAL_ALIAS"){metrics.aliases++;return e;}
    if(compactRoots.has(root)){const a=new Set(g.nodes[parent].traits),b=new Set(g.nodes[e.to].traits);metrics.compactNewStates++;metrics.compactTraitGains+=[...b].filter(x=>!a.has(x)).length;metrics.compactTraitLosses+=[...a].filter(x=>!b.has(x)).length;metrics.compactTransforms+=Number(label.startsWith("CLOSURE_TRANSFORM:"));metrics.compactResearch+=Number(label.startsWith("CLOSURE_RESEARCH"));}
    if(e.status!=="CONDITIONAL_REPLAY")throw Error("SUCCESSOR_INSERT");
    retain(id,e.to);const a=assess(g,e.to,to);
    const beforeLife=new Set(q.open.filter(x=>lifecycleKind(replay.rules.get(x.id))).map(x=>x.id)),afterLife=new Set(a.open.filter(x=>lifecycleKind(replay.rules.get(x.id))).map(x=>x.id));
    metrics.lifecycleReduced+=[...beforeLife].filter(x=>!afterLife.has(x)).length;
    metrics.lifecycleAdded+=[...afterLife].filter(x=>!beforeLife.has(x)).length;
    metrics.obligationReduction+=Math.max(0,q.open.length-a.open.length);
    metrics.maxChainDepth=Math.max(metrics.maxChainDepth,depth+1);
    if(childTransforms>=2&&transforms<2)metrics.multiTransformChains++;
    if(a.closed){metrics.closedCandidates++;if(scope)metrics.scopeNewCandidates++;metrics.outcomes.push({graph:id,node:e.to,body:g.nodes[e.to].body,origin:g.origin,depth:depth+1,transforms:childTransforms,status:"CLOSED_CANDIDATE"});visited.add(nodeKey(id,e.to));}
    else follow.unshift({id,g,b,i:e.to,depth:depth+1,transforms:childTransforms,root,h:score(a,g.nodes[e.to],b,"live",children(g,e.to),new Set(member(to).state.history.keys()))});
    progressed=true;return e;
   }
   for(const job of jobs){
    if(metrics.attempts>=limit||performance.now()>=deadline()||progressed||(rootWork.get(root)||0)>=rootAttemptBudget)break;
    rootWork.set(root,(rootWork.get(root)||0)+1);rootRules.set(rootRule(job.id),(rootRules.get(rootRule(job.id))||0)+1);
    const k=key([id,i,job.id,job.attempts]),rec={graph:id,node:i,origin:g.origin,branch:g.branch,body:n.body,action:job.id,attempt:job.attempts,status:"OPEN",goals:job.missingResearch,outcomes:[],chainDepth:depth};
    records[k]=rec;counts.set(actionKey(id,i,job.id),job.attempts+1);metrics.attempts++;metrics.byBody[n.body]=(metrics.byBody[n.body]||0)+1;if(depth)metrics.chainedAttempts++;
    if(compactRoots.has(root))metrics.compactAttempts++;
    if(repairLane){metrics.lifecycleLaneAttempts++;if(job.id==="CAP_GROWTH")metrics.lifecycleLaneGrowth++;}
    const started=performance.now(),reductionBefore=metrics.obligationReduction;
    if(job.r?.allowsLiveSoldiers&&!isRevival(job.id)&&history.has(job.id)&&!job.r.reset&&job.destination===n.body)metrics.repeatLiveAttempts++;
    if(isRevival(job.id)){metrics.revivalAttempts++;if(history.has(job.id))metrics.repeatRevivalAttempts++;}
    if(job.lifecycle){rec.lifecycleProjection=job.lifecycle;metrics.lifecycleRepairAttempts+=Number(job.lifecycle.gain>0);metrics.lifecycleIntroductionsProjected+=job.lifecycle.add.length;}

    if(job.efficiency){const e=job.efficiency;if(e.observedEffect?.score>0)metrics.effectPrioritizedAttempts++;rec.priority={...e};metrics.selectedProductive+=Number(e.novel>0);metrics.selectedNovel+=Number(!e.duplicate);metrics.selectedCost+=e.cost;metrics.duplicateJobAttempts+=Number(e.duplicate);}
    try{
     if(job.id==="CAP_GROWTH"){
      const z=replay.grow({world:w,steps});const e=add(i,w,z.world,z.steps.slice(steps.length),"CLOSURE_GROWTH",transforms);rec.outcomes.push(e);rec.status="GROWTH_REPLAY";metrics.growth++;if(e.status==="CONDITIONAL_REPLAY")recordPostEffect(rec,g,i,e.to,"CAP_GROWTH",w,z.world);continue;
     }
     let base={world:w,steps},parent=i;
     if(job.missingResearch.length){
      const planner=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b),p={...planner,distance:planner.distancesFrom?planner.distancesFrom(w):planner.distance};
       const direct=job.r.requires.flatMap(id=>{const ms=p.methods.get(id)||[];return ms.length===1&&ms[0].kind==="lab"?ms[0].deps:[];});
       const corridor=[...new Set([...direct,...job.r.requires])];
       const beforeDirect=direct.filter(k=>active(w,k)).length;
      const index=fragmentIndex(),until=Math.min(deadline(),performance.now()+Math.max(0,fragmentMs));
      const f=index.propose({world:w,goals:job.r.requires,planner:p,replay,allowed:(_,z)=>keep.every(k=>active(z,k))&&![...z.researched].some(k=>forbidden.has(k)),accept:(suffix,z)=>{if(!allowed(z)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...full,...suffix],z).length)return false;try{materialPolicy.check(g,i,suffix);return true;}catch{return false;}},deadline:until,maxTrials:60,maxChunks:24,preferredSources:new Set([id])});
      rec.fragmentSources=f.sources;rec.fragmentMetrics=f.metrics;metrics.fragmentTrials+=f.metrics.trials;metrics.fragmentApplied+=f.metrics.applied;metrics.fragmentResearch+=f.metrics.added;metrics.fragmentRejected+=f.metrics.rejected;metrics.fragmentPreflightRejected+=f.metrics.preflightRejected;if(f.complete)metrics.fragmentComplete++;
      const initial={world:f.world,steps:[...full,...f.steps],trace:[],diagnostics:[]};
      const plan=f.complete?{node:initial,complete:true,remaining:[],failures:[]}:createStagedResearch({planner:p,active,accept:(_,z)=>allowed(z.world),deadline:Math.min(deadline(),performance.now()+3200),maxCalls:10,maxDepth:Infinity,variant:job.attempts}).run(initial,corridor);
       const afterDirect=direct.filter(k=>active(plan.node.world,k)).length;
       rec.corridor={direct,activeBefore:beforeDirect,activeAfter:afterDirect,missing:job.r.requires.filter(k=>!active(plan.node.world,k))};
       metrics.corridorDirectGains+=Math.max(0,afterDirect-beforeDirect);
       const cm=metrics.corridorGoals[job.id]||{attempts:0,directGains:0,complete:0};cm.attempts++;cm.directGains+=Math.max(0,afterDirect-beforeDirect);
       plan.complete=job.r.requires.every(k=>active(plan.node.world,k));plan.remaining=job.r.requires.filter(k=>!active(plan.node.world,k));
       if(plan.complete){cm.complete++;metrics.corridorCompleted++;}metrics.corridorGoals[job.id]=cm;
      const suffix=plan.node.steps.slice(full.length);rec.remaining=plan.remaining;rec.failures=plan.failures.slice(-2);
      if(suffix.length){const e=add(i,w,plan.node.world,suffix,"CLOSURE_RESEARCH:"+job.id,transforms);index.add(suffix,id);metrics.fragmentCount=index.size;parent=e.to;rec.researchNode=parent;rec.added=[...plan.node.world.researched].filter(k=>active(plan.node.world,k)&&!active(w,k));metrics.researchAdvanced++;metrics.addedResearch+=rec.added.length;base={world:plan.node.world,steps:[...steps,...suffix]};}
      if(!plan.complete){rec.status=suffix.length?"PARTIAL_RESEARCH":"LIMITED_UNRESOLVED";if(!suffix.length)metrics.stalled++;continue;}
      metrics.researchReady++;
     }
     const variants=[base];const grown=replay.grow(base);if(grown!==base)variants.push(grown);
     let transformed=false;
     let usedMedalPreparation=false;
     const outcomesFor=z=>replay.transformOutcomes?replay.transformOutcomes(z,job.r):[{band:null,value:replay.transform(z,job.r)}].filter(x=>x.value);
     for(let vi=0;vi<variants.length;vi++){
      let z=variants[vi],outcomes=outcomesFor(z);
      if(!outcomes.length&&medals&&vi===variants.length-1&&performance.now()<deadline()){
       metrics.medalTrials++;
       const p=medals.prepare(z,job.r);
       if(p?.status==="CONDITIONAL_STAT_GATE_READY"){
        rec.medalPreparation=p.receipt;metrics.medalReady++;
        z=p.node;outcomes=outcomesFor(z);usedMedalPreparation=outcomes.length>0;
       }else if(p){rec.medalPreparation={...p,actualGameCertified:false};metrics.medalUnresolved++;}
      }
      for(const {band,value:v} of outcomes){
       if(!v||performance.now()>=deadline())break;
       try{const e=add(parent,base.world,v.world,v.steps.slice(base.steps.length),"CLOSURE_TRANSFORM:"+job.id,transforms+1);rec.outcomes.push({band,...e});if(e.status==="CONDITIONAL_REPLAY"){metrics.transformed++;if(usedMedalPreparation){metrics.medalTransformed++;if(scope&&assess(g,e.to,v.world).closed)metrics.medalClosedCandidates++;}if(effectPriority){const effect=effects().record(g,e.to,true);if(effect){rec.observedPermanentEffect=effect;metrics.effectObserved[effect.classification]++;}}surgeryIds.add(job.id);metrics.distinctSurgery=[...surgeryIds].sort();transformed=true;recordPostEffect(rec,g,parent,e.to,job.id,base.world,v.world);if(job.r.allowsLiveSoldiers&&!isRevival(job.id)&&member(z.world).state.history.has(job.id)&&!job.r.reset&&job.destination===n.body){const effect=liveRepeatEffect(g,parent,e.to,z.world,v.world,job.r);rec.liveRepeatEffect=effect;metrics.repeatLiveProduced++;metrics.repeatLiveByRule[job.id]=(metrics.repeatLiveByRule[job.id]||0)+1;if(effect.classification==="PERMANENT_STATE_CHANGE")metrics.repeatLiveChanged++;else{metrics.repeatLiveUnchanged++;liveQuiet.add(actionKey(id,e.to,job.id));}}if(isRevival(job.id)&&member(z.world).state.history.has(job.id)){const effect=revivalEffect(z.world,v.world,job.r);rec.repeatRevivalEffect=effect;rec.repeatRevivalTo=e.to;metrics.repeatRevivalProduced++;metrics.repeatRevivalByRule[job.id]=(metrics.repeatRevivalByRule[job.id]||0)+1;if(effect.classification==="PERMANENT_STATE_CHANGE")metrics.repeatRevivalChanged++;else{metrics.repeatRevivalCounterOnly++;quietRepeats.add(actionKey(id,e.to,job.id));}}break;}}catch(e){rec.outcomes.push({band,status:"UNRESOLVED",reason:String(e.message)});}
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
