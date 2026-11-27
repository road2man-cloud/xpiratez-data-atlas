// Produce concrete shorter resurrection witnesses at the recovered growth cap.
// Preserve every research transaction, all finite material accounting and all
// non-stat state. A successful comparison is not a universal closure proof.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createRepeatQuotient} from "./final-career-repeat-quotient.mjs";
import {compactRepeatCareers as compactLegacy} from "./population-repeat-career-compaction-v2.mjs";
const POLICY="RECOVERED_RESURRECTION_COMPACTION_V2";
const isRevival=a=>a?.type==="transform"&&a.soldier==="origin"&&!!a.lifecycle;
const count=a=>a.filter(x=>x.type==="transform"&&x.soldier==="origin").length;
const research=a=>["research","repeatResearch","freeResearch","eventResearch","missionResearch"].includes(a.type);
const sorted=a=>[...a].sort();
export function compactRepeatCareers(opts){
 const {data,graphs,branches,replay,loadNode,stepsFor,insert,enqueue,context,terminal,terminalRule,materialPolicy,prior={},deadline,limit=24,attemptLimit=64}=opts;
 const repeat=createRepeatQuotient(data),safe=new Set(repeat.proof.safeHistory),records={...(prior.records||{})},published=new Map();
 const metrics={resurrectionPolicy:POLICY,resurrectionCandidates:0,resurrectionAttempts:0,resurrectionAccepted:0,resurrectionExact:0,resurrectionPareto:0,resurrectionNewNodes:0,resurrectionReusedNodes:0,resurrectionRemoved:0,resurrectionSavedCost:0,resurrectionSavedRecoveryDays:0,resurrectionSavedTransferHours:0,resurrectionSavedItems:{},resurrectionFailures:{}};
 function publish(id,i){const set=published.get(id)||new Set();set.add(i);published.set(id,set);}
 const routes=opts.db.populationMissingOriginCareer?.routes||{};
 // A repeated armor assignment may be redundant. The full-world endpoint
 // comparison below still preserves the actual resulting armor and all gates.
 const eligible=a=>{
  if(!isRevival(a))return false;
  const r=replay.rules.get(a.transform);
  return !!r&&replay.lifecycleRules?.has(r.id)&&safe.has(r.id)&&!r.reset&&!r.resetRank&&!r.createsClone&&!r.producedSoldierType&&!r.producedItem&&!r.soldierBonusType&&!r.removeTransformations?.length&&Object.keys(r.requiredItems||{}).every(id=>!materialPolicy.finite.has(id)&&materialPolicy.catalog[id]?.kind==="ORDINARY_ACQUISITION_ASSUMED");
 };
 const jobs=[];
 for(const [rid,r] of Object.entries(routes)){
  if(!r.lifecycle?.steps?.length||!opts.db.careerCompletion?.researchTraitSets?.records?.[rid]?.goals?.length)continue;
  const g=graphs[r.sourceGraph],n=g?.nodes[r.sourceNode];
  if(!n||g.blocker||n.body==="STR_SOLDIER_CHORT")continue;
  const ids=r.lifecycle.steps.map(x=>x.transform);
  if(ids.length===new Set(ids).size)continue;
  const k=key([POLICY,rid]);
  if(records[k]?.status==="POST_REVIVAL_COMPACT_REPLAY")continue;
  jobs.push({rid,r,g,k,repetitions:ids.length-new Set(ids).size});
 }
 jobs.sort((a,b)=>b.repetitions-a.repetitions||a.r.sourceNode-b.r.sourceNode||a.rid.localeCompare(b.rid));
 metrics.resurrectionCandidates=jobs.length;
 function failure(reason){const k=String(reason).slice(0,180);metrics.resurrectionFailures[k]=(metrics.resurrectionFailures[k]||0)+1;}
 function tailFor(g,i){
  const chain=[];for(let k=i;k>0;k=g.nodes[k].parent)chain.unshift(k);
  const seen=new Set(g.birthActions.filter(isRevival).map(a=>a.transform));
  let anchor=null,tail=[];
  for(const k of chain){
   for(const a of g.nodes[k].steps)if(isRevival(a)){
    if(anchor===null&&eligible(a)&&seen.has(a.transform))anchor=g.nodes[k].parent;
    seen.add(a.transform);
   }
   if(anchor!==null)tail.push(...g.nodes[k].steps);
  }
  return {anchor,tail};
 }
 function replayShort(base,tail,prefix,mode){
  let w=base;const steps=[],removed=[],seen=new Set(prefix.filter(isRevival).map(a=>a.transform));
  for(let i=0;i<tail.length;i++){
   if(performance.now()>=deadline())throw Error("BUDGET");
   const a=tail[i],b=tail[i+1],r=replay.rules.get(b?.transform);
   // Dedicated ordinary material/funds supply; no facility grant is removed.
   const support=a.type==="externalInputs"&&eligible(b)&&a.reason==="Conditional resurrection continuation "+b.transform&&!(a.functions||[]).length&&Object.entries(a.items||{}).every(([k,v])=>Object.hasOwn(r.requiredItems||{},k)&&v>0&&v<=r.requiredItems[k]);
   const t=support?b:a;
   if(eligible(t)&&seen.has(t.transform)&&member(w).state.history.has(t.transform)){
    if(mode==="growBeforeSkip"){const q=replay.grow({world:w,steps:[]});w=q.world;steps.push(...q.steps);}
    removed.push(t);if(support)i++;continue;
   }
   w=replay.apply(w,a);steps.push(a);if(isRevival(a))seen.add(a.transform);
  }
  assert(!w.pendingFree);
  const q=replay.grow({world:w,steps:[]});return {world:q.world,steps:[...steps,...q.steps],removed};
 }
 function compare(reference,candidate){
  const a=replay.finish(reference),b=replay.finish(candidate);
  if(a.body!==b.body||candidate.funds<reference.funds||!["raw","vector","capRaw","capVector"].every(k=>b[k].every((v,i)=>v>=a[k][i])))return null;
  const adjusted=structuredClone(candidate);adjusted.funds=reference.funds;
  member(adjusted).state.currentStats=structuredClone(member(reference).state.currentStats);
  // Preserve all other state, including exact inventory and research.
  if(repeat.project(adjusted)!==repeat.project(reference))return null;
  const exact=repeat.project(candidate)===repeat.project(reference);
  return {kind:exact?"EXACT_AT_RECOVERED_CAP":"PARETO_AT_RECOVERED_CAP",rawDelta:b.raw.map((v,i)=>v-a.raw[i]),effectiveDelta:b.vector.map((v,i)=>v-a.vector[i]),fundsDelta:candidate.funds-reference.funds,referenceQuotient:repeat.project(reference),candidateQuotient:repeat.project(candidate),normalizedComparison:repeat.project(adjusted)};
 }
 for(const j of jobs){
  if(metrics.resurrectionAttempts>=attemptLimit||metrics.resurrectionAccepted>=limit||performance.now()>=deadline())break;
  const {r,g,rid,k}=j,id=r.sourceGraph;
  metrics.resurrectionAttempts++;
  const rec={policy:POLICY,source:rid,graph:id,from:r.sourceNode,status:"POST_REVIVAL_NOT_EQUIVALENT",actualGameCertified:false,closureCertified:false};
  try{
   const {anchor,tail}=tailFor(g,r.sourceNode);assert(anchor!==null,"NO_REPEAT_ANCHOR");
   const prefix=[...g.birthActions,...stepsFor(g,anchor)],base=loadNode(id,g,anchor),original=loadNode(id,g,r.sourceNode);
   const reference=replay.grow({world:original,steps:[]});
   const oldMaterial=materialPolicy.state(g,r.sourceNode);
   let q,comparison,mode;
   for(const m of ["skip","growBeforeSkip"]){
    try{
     const x=replayShort(base,tail,prefix,m);
     if(!x.removed.length||count(x.steps)>=count(tail))continue;
     if(key(x.steps.filter(research))!==key(tail.filter(research)))continue;
     if(exactWorld(materialPolicy.check(g,anchor,x.steps))!==exactWorld(oldMaterial))continue;
     const cmp=compare(reference.world,x.world);
     if(cmp){q=x;comparison=cmp;mode=m;break;}
    }catch(e){if(e.message==="BUDGET")throw e;failure(e.message);}
   }
   if(!q){failure("NO_COMPARABLE_SHORTER_CAP_REPLAY");records[k]=rec;continue;}
   const full=[...prefix,...q.steps];
   assert.deepEqual(sorted(context(g.branch,{allowedDifficulties:g.allowedDifficulties},full,q.world)),sorted(r.allowedDifficulties),"DIFFICULTY_CHANGED");
   assert.equal(exactWorld(replay.replay(q.steps,base)),exactWorld(q.world),"REPLAY_MISMATCH");
   const targets=terminalRule.targets.filter(t=>t.researchGoals.every(k=>replay.active(q.world,k))&&!(t.inactiveResearch||[]).some(k=>replay.active(q.world,k)));
   assert(targets.length,"MISSING_TERMINAL_GOAL");
   const edge=q.steps.length?insert(id,g,q.world,anchor,"POST_REVIVAL_COMPACTION",q.steps,true):{to:anchor,status:"EXISTING_REPLAY"};
   const to=edge.to,actual=[...g.birthActions,...stepsFor(g,to)];
   assert(count(actual)<r.order.length,"ALIAS_NOT_SHORTER");
   assert.equal(key(actual.filter(research)),key(full.filter(research)),"ALIAS_RESEARCH_CHANGED");
   assert.equal(exactWorld(materialPolicy.state(g,to)),exactWorld(oldMaterial),"ALIAS_MATERIAL_CHANGED");
   assert(compare(reference.world,loadNode(id,g,to)),"ALIAS_NOT_COMPARABLE");
   for(const t of targets){
    if(Object.values(terminal.records).some(x=>x.graph===id&&x.to===to&&x.target===t.id&&x.status==="CONDITIONAL_TARGET_RESEARCH_READY"))continue;
    const tk=key([id,t.id]);terminal.run({id,g,b:branches.get(g.branch),t,k:tk,i:to,attempt:terminal.anchors[tk]?.attempts||0});
   }
   enqueue(id,to);publish(id,to);
   const savedItems={},removed=q.removed.map(a=>a.transform);
   for(const a of q.removed)for(const [k,n] of Object.entries(replay.rules.get(a.transform).requiredItems||{}))savedItems[k]=(savedItems[k]||0)+n;
   const savedCost=removed.reduce((s,id)=>s+(replay.rules.get(id).cost||0),0),savedRecoveryDays=q.removed.reduce((s,a)=>s+a.lifecycle.recoveryDays,0),savedTransferHours=q.removed.reduce((s,a)=>s+a.lifecycle.transferHours,0);
   Object.assign(rec,{status:"POST_REVIVAL_COMPACT_REPLAY",anchor,to,mode,removed,savedCost,savedItems,savedRecoveryDays,savedTransferHours,sourceStateHash:r.canonicalStateHash,targetStateHash:g.nodes[to].stateHash,referenceGrowth:reference.steps,referenceStateHash:exactWorld(reference.world),comparison});
   records[k]=rec;
   metrics.resurrectionAccepted++;metrics.resurrectionExact+=Number(comparison.kind==="EXACT_AT_RECOVERED_CAP");metrics.resurrectionPareto+=Number(comparison.kind==="PARETO_AT_RECOVERED_CAP");metrics.resurrectionNewNodes+=Number(edge.status==="CONDITIONAL_REPLAY");metrics.resurrectionReusedNodes+=Number(edge.status!=="CONDITIONAL_REPLAY");
   metrics.resurrectionRemoved+=removed.length;metrics.resurrectionSavedCost+=savedCost;metrics.resurrectionSavedRecoveryDays+=savedRecoveryDays;metrics.resurrectionSavedTransferHours+=savedTransferHours;
   for(const [id,n] of Object.entries(savedItems))metrics.resurrectionSavedItems[id]=(metrics.resurrectionSavedItems[id]||0)+n;
  }catch(e){if(e.message==="BUDGET")break;failure(e.message);records[k]={...rec,status:"POST_REVIVAL_UNRESOLVED",reason:String(e.message)};}
 }
 for(const r of Object.values(records))if(r.status==="POST_REVIVAL_COMPACT_REPLAY"&&graphs[r.graph]?.nodes[r.to]?.stateHash===r.targetStateHash)publish(r.graph,r.to);
 const legacy=compactLegacy({...opts,prior:{records},limit:Math.max(0,limit-metrics.resurrectionAccepted),attemptLimit:Math.max(0,attemptLimit-metrics.resurrectionAttempts)});
 return {records:legacy.records,metrics:{...legacy.metrics,...metrics},publishedNodes:id=>[...new Set([...(published.get(id)||[]),...legacy.publishedNodes(id)])]};
}
