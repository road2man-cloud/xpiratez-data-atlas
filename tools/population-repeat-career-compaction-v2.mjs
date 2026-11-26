// Produce shorter concrete witnesses; never erase the historical ledger.
// Only non-removable presence counters may differ in accepted worlds.
// Identical raw stats, research, inventory, cash, rank, medals, etc. are
// required by the existing repeat quotient. No game closure claim.
import {key} from "./population-research-career-core.mjs";
import {member,exactWorld} from "./population-growth-replay-core.mjs";
import {createRepeatQuotient} from "./final-career-repeat-quotient.mjs";
export function compactRepeatCareers({data,db,graphs,branches,replay,loadNode,stepsFor,insert,enqueue,context,terminal,terminalRule,materialPolicy,prior={},deadline,limit=24,attemptLimit=64}){
 const repeat=createRepeatQuotient(data),safe=new Set(repeat.proof.safeHistory),safeBonus=new Set(repeat.proof.safeBonus);
 const records={...(prior.records||{})},metrics={candidates:0,attempts:0,accepted:0,newNodes:0,reusedNodes:0,removedTransforms:0,savedCost:0,removedActions:0,growthSubstitutions:0,selectiveAccepted:0,replayRejected:0,notEquivalent:0,skippedPrior:0,failures:{}};
 const eligible=r=>r&&safe.has(r.id)&&!r.reset&&!r.resetRank&&!r.createsClone&&!r.producedSoldierType&&!r.producedSoldierArmor&&!r.producedItem&&!r.removeTransformations?.length&&(!r.soldierBonusType||safeBonus.has(r.soldierBonusType))&&!Object.keys(r.requiredItems||{}).length;
 const count=a=>a.filter(x=>x.type==="transform"&&x.soldier==="origin").length;
 const jobs=[];
 for(const [rid,rec] of Object.entries(db.careerCompletion?.researchTraitSets?.records||{})){
  const r=db.populationMissingOriginCareer?.routes?.[rid],g=r&&graphs[r.sourceGraph],n=g?.nodes[r.sourceNode];
  if(!n||g.blocker||n.body==="STR_SOLDIER_CHORT"||!rec.goals?.length)continue;
  const seen=new Set(),repeats=[];
  for(const id of r.order){if(seen.has(id)&&eligible(replay.rules.get(id)))repeats.push(id);seen.add(id);}
  if(!repeats.length)continue;
  if(records[rid]?.status==="COMPACT_REPLAY"||records[rid]?.revision===2){metrics.skippedPrior++;continue;}
  jobs.push({rid,r,g,n,repeats,score:repeats.length*1000+repeats.reduce((v,id)=>v+(replay.rules.get(id).cost||0),0)/100000});
 }
 jobs.sort((a,b)=>b.score-a.score||a.r.sourceGraph.localeCompare(b.r.sourceGraph)||a.r.sourceNode-b.r.sourceNode);
 metrics.candidates=jobs.length;
 // Do not let one long chain monopolize the batch.
 const turns=new Map(),pending=jobs.slice(),published=new Map();
 function publish(id,i){const a=published.get(id)||new Set();a.add(i);published.set(id,a);}
 for(const r of Object.values(records))if(r.status==="COMPACT_REPLAY"&&graphs[r.graph]?.nodes[r.to])publish(r.graph,r.to);
 function reason(e){const k=String(e.message||e).slice(0,160);metrics.failures[k]=(metrics.failures[k]||0)+1;return k;}
 function start(j){
  const {g,r}=j,chain=[];let i=r.sourceNode;
  while(i){chain.push(i);i=g.nodes[i].parent;}
  chain.reverse();const seen=new Set(g.birthActions.filter(x=>x.type==="transform"&&x.soldier==="origin").map(x=>x.transform));
  let anchor=null,tail=[];
  for(const k of chain){
   const n=g.nodes[k];
   if(anchor===null){
    let hit=false;
    for(const a of n.steps)if(a.type==="transform"&&a.soldier==="origin"){
     if(seen.has(a.transform)&&eligible(replay.rules.get(a.transform)))hit=true;
     seen.add(a.transform);
    }
    if(hit)anchor=n.parent;
   }
   if(anchor!==null)tail.push(...n.steps);
  }
  return {anchor,tail};
 }
 function propose(world,tail,mode){
  let w=world,steps=[],removed=[],growths=0;
  for(let i=0;i<tail.length;i++){
   if(performance.now()>=deadline())throw Error("BUDGET");
   const a=tail[i],next=tail[i+1],rule=replay.rules.get(a.transform||next?.transform);
   // Only omit dedicated cash-only support belonging to the removed action.
   const support=a.type==="externalInputs"&&next?.type==="transform"&&next.soldier==="origin"&&a.reason==="Conditional growth continuation "+next.transform&&!Object.keys(a.items||{}).length&&!(a.functions||[]).length;
   const t=support?next:a,s=member(w)?.state;
   if(t.type==="transform"&&t.soldier==="origin"&&eligible(rule)&&s?.history.has(rule.id)&&(!rule.soldierBonusType||s.bonusIds.has(rule.soldierBonusType))){
    if(mode==="selective"){
     // Keep stat-increasing or otherwise meaningful repetitions. Compare the
     // *actual* transition, including its dedicated cash provision if present.
     const original=support?[a,t]:[t];
     const after=replay.replay(original,w);
     if(repeat.project(after)!==repeat.project(w)){w=after;steps.push(...original);if(support)i++;continue;}
    }else if(mode==="grow"){const q=replay.grow({world:w,steps:[]});w=q.world;steps.push(...q.steps);growths+=q.steps.length;}
    removed.push(rule.id);if(support)i++;continue;
   }
   w=replay.apply(w,a);steps.push(a);
  }
  if(w.pendingFree)throw Error("PENDING_FREE");
  return {world:w,steps,removed,growths};
 }
 while(pending.length&&metrics.attempts<attemptLimit&&metrics.accepted<limit&&performance.now()<deadline()){
  const least=Math.min(...pending.map(j=>turns.get(j.r.sourceGraph)||0)),idx=pending.findIndex(j=>(turns.get(j.r.sourceGraph)||0)===least),j=pending.splice(idx,1)[0],{rid,r,g}=j,id=r.sourceGraph;
  turns.set(id,(turns.get(id)||0)+1);metrics.attempts++;
  const rec={source:rid,graph:id,from:r.sourceNode,status:"NOT_EQUIVALENT",revision:2,...(records[rid]?{previous:records[rid]}:{})};
  try{
   const {anchor,tail}=start(j);if(anchor===null)throw Error("NO_REPEAT_ANCHOR");
   const original=loadNode(id,g,r.sourceNode),base=loadNode(id,g,anchor),targetHash=repeat.project(original);
   let q=null;
   for(const mode of ["remove","selective","grow"]){
    try{
     const x=propose(base,tail,mode);
     if(x.removed.length&&x.steps.length<tail.length&&repeat.project(x.world)===targetHash){q={...x,mode};break;}
    }catch(e){if(String(e.message)==="BUDGET")throw e;reason(e);metrics.replayRejected++;}
   }
   if(!q){metrics.notEquivalent++;records[rid]=rec;continue;}
   const prefix=[...g.birthActions,...stepsFor(g,anchor)],full=[...prefix,...q.steps];
   const allowed=context(g.branch,{allowedDifficulties:g.allowedDifficulties},full,q.world);
   if(JSON.stringify(allowed.slice().sort())!==JSON.stringify(r.allowedDifficulties.slice().sort()))throw Error("DIFFICULTY_CHANGED");
   if(count(full)>=r.order.length)throw Error("NOT_SHORTER");
   if(q.steps.length)materialPolicy.check(g,anchor,q.steps);
   // Independently replay the accepted suffix once, not merely compare estimates.
   if(exactWorld(replay.replay(q.steps,base))!==exactWorld(q.world))throw Error("REPLAY_MISMATCH");
   const edge=q.steps.length?insert(id,g,q.world,anchor,"REPEAT_COMPACTION",q.steps,true):{to:anchor,status:"EXISTING_REPLAY"};
   const to=edge.to,actual=[...g.birthActions,...stepsFor(g,to)];
   if(count(actual)>=r.order.length||repeat.project(loadNode(id,g,to))!==targetHash)throw Error("ALIAS_NOT_COMPACT");
   const saved=q.removed.reduce((v,k)=>v+(replay.rules.get(k).cost||0),0);
   // A replacement path may branch before the old terminal root. Register
   // only goals that are active in this real, replayed new endpoint.
   for(const t of terminalRule.targets.filter(t=>t.researchGoals.every(k=>replay.active(q.world,k))&&!(t.inactiveResearch||[]).some(k=>replay.active(q.world,k)))){
    if(Object.values(terminal.records).some(x=>x.graph===id&&x.to===to&&x.target===t.id&&x.status==="CONDITIONAL_TARGET_RESEARCH_READY"))continue;
    const k=key([id,t.id]);terminal.run({id,g,b:branches.get(g.branch),t,k,i:to,attempt:terminal.anchors[k]?.attempts||0});
   }
   enqueue(id,to);publish(id,to);Object.assign(rec,{status:"COMPACT_REPLAY",anchor,to,removed:q.removed,removedActions:tail.length-q.steps.length,savedCost:saved,growthSubstitutions:q.growths,mode:q.mode,sourceStateHash:r.canonicalStateHash,targetStateHash:g.nodes[to].stateHash,equivalenceHash:targetHash,policy:repeat.proof.policy});
   metrics.accepted++;metrics.selectiveAccepted+=Number(q.mode==="selective");metrics.newNodes+=Number(edge.status==="CONDITIONAL_REPLAY");metrics.reusedNodes+=Number(edge.status!=="CONDITIONAL_REPLAY");metrics.removedTransforms+=q.removed.length;metrics.savedCost+=saved;metrics.removedActions+=rec.removedActions;metrics.growthSubstitutions+=q.growths;records[rid]=rec;
  }catch(e){if(String(e.message)==="BUDGET")break;records[rid]={...rec,status:"REPLAY_UNRESOLVED",reason:reason(e)};metrics.replayRejected++;}
 }
 return {records,metrics,publishedNodes:id=>[...(published.get(id)||[])]};
}
