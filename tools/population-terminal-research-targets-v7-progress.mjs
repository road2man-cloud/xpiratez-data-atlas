// A terminal research target is a scheduling goal, NEVER a victory/closure proof.
// Retain every advanced concrete state and reuse it on a later batch.
import {key} from "./population-research-career-core.mjs";
import {exactWorld} from "./population-growth-replay-core.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
import {createResearchFragmentIndex} from "./population-research-fragments.mjs";
export function createTerminalTargetScheduler({terminalRule,graphs,branches,commit,allChoice,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,prior={},deadline,focus=[],graphFilter=()=>true,resumeFirst=false,workPriority,coveredOrigins=[],coverageFirst=true,coveredBranches=[],branchFirst=true}){
 if(terminalRule?.status!=="RULES_AND_PRESERVED_ENGINE_EXTRACTED")throw Error("Terminal source evidence missing");
 const targets=terminalRule.targets.filter(t=>!focus.length||focus.includes(t.id));
 const records=prior.records||{},anchors=prior.anchors||{};
 const stats={attempts:0,advanced:0,ready:0,alreadyReady:0,blocked:0,unresolved:0,newResearch:0,calls:0,independentReplays:0,fragmentTrials:0,fragmentApplied:0,fragmentResearchAdded:0,fragmentComplete:0,newOrdinaryOrigins:[],newOrdinaryBranches:[]};
 const active=(w,k)=>replay.active(w,k),turns=new Map(),latest=new Map(),batchTurns=new Map();
 // A prior observation is tied to its graph, target, and exact anchor.
 // It changes scheduling only; it cannot establish feasibility.
 for(const r of Object.values(records)){
  const k=key([r.graph,r.target]),old=latest.get(k);
  if(!old||r.attempt>old.attempt)latest.set(k,r);
 }
 Object.assign(stats,{resumeSelected:0,progressSelected:0,diversitySelected:0,sameBatchResumes:0,resumeReady:0,resumeAdvanced:0,elapsedMs:0});
 for(const r of Object.values(records))turns.set(r.target,(turns.get(r.target)||0)+1);
 const keyFor=(id,t)=>key([id,t.id]);
 const covered=new Set(coveredOrigins),readyBranches=new Set(coveredBranches),fragmentIndex=createResearchFragmentIndex(),indexed=new Set();
 // A previous ready anchor is sufficient for scheduling, not for global closure.
 for(const r of Object.values(records))if(r.status==="CONDITIONAL_TARGET_RESEARCH_READY"&&graphs[r.graph]?.nodes[r.to]&&graphs[r.graph].nodes[r.to].body!=="STR_SOLDIER_CHORT")readyBranches.add(r.branch);
 function markCovered(g,i){
  if(g.nodes[i]?.body==="STR_SOLDIER_CHORT")return;
  if(!covered.has(g.origin)){covered.add(g.origin);stats.newOrdinaryOrigins.push(g.origin);}
  if(!readyBranches.has(g.branch)){readyBranches.add(g.branch);stats.newOrdinaryBranches.push(g.branch);}
 }
 // These are proposals, never copied research sets. A donor's actions
 // must replay against the recipient's actual world and branch.
 function refreshFragments(){
  for(const [k,r] of Object.entries(records)){
   if(indexed.has(k)||!Number.isInteger(r.to)||!graphs[r.graph]?.nodes[r.to]||(!r.suffixHash&&r.status!=="CONDITIONAL_TARGET_RESEARCH_READY"))continue;
   const g=graphs[r.graph],n=g.nodes[r.to];
   if(r.suffixHash&&key(n.steps)!==r.suffixHash)continue;
   if(r.status==="CONDITIONAL_TARGET_RESEARCH_READY")fragmentIndex.add([...g.birthActions,...stepsFor(g,r.to)],{graph:r.graph,node:r.to,action:r.target,hash:key([...g.birthActions,...stepsFor(g,r.to)])});
   else fragmentIndex.add(n.steps,{graph:r.graph,node:r.to,action:r.target,hash:r.suffixHash});
   indexed.add(k);
  }
 }
 // Each graph keeps its own chronological state; no merging based on sets.
 function next(){
  const list=[];
  for(const [id,g] of Object.entries(graphs)){
   const b=branches.get(g.branch);if(!b||g.blocker||!graphFilter(g,b))continue;
   for(const t of targets){
    if(t.researchGoals.some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!commit(b).includes(k)))continue;
    const k=keyFor(id,t),a=anchors[k];
    if(a?.status==="CONDITIONAL_TARGET_RESEARCH_READY")continue;
    let i=a?.node;
    if(!Number.isInteger(i)||!g.nodes[i]){
     // Start from a rich retained state, preserving all its actions.
     const allowed=g.nodes.map((n,j)=>({g,n,i:j})).filter(x=>workPriority.eligible(x));
     if(!allowed.length)continue;
     i=allowed.reduce((best,x)=>x.n.traits.length>best.n.traits.length?x:best).i;
    }
    const n=g.nodes[i],attempt=a?.attempts||0;
    // Unsuccessful attempts are retried by later batches, not tight loops.
    const previous=latest.get(k),matched=previous?.attempt===attempt&&previous?.to===i?previous:null;
    const partial=a?.status==="CONDITIONAL_TARGET_PARTIAL";
    const gained=matched?.added?.length||0,remaining=matched?.remaining?.length??t.researchGoals.length;
    // A concrete advance may receive one additional slice in this batch.
    // Stalled attempts wait for the next batch, not an infinite retry loop.
    if(a?.roundToken===roundToken&&(!resumeFirst||!partial||!gained||(batchTurns.get(k)||0)>=2))continue;
    const elapsed=Math.max(100,matched?.elapsedMs||2500);
    const fraction=1-remaining/Math.max(1,t.researchGoals.length);
    const priority=(partial?80:0)+50*fraction+Math.min(45,Math.log2(1+gained)*8)+Math.min(25,gained*100/elapsed)-Math.min(30,attempt*2);
    list.push({id,g,b,t,k,i,attempt,n,partial,gained,remaining,priority,sameBatch:a?.roundToken===roundToken});
   }
  }
  const eligible=list.filter(x=>workPriority.eligible(x));
  const missing=eligible.filter(x=>!covered.has(x.g.origin)&&x.n.body!=="STR_SOLDIER_CHORT");
  const missingBranch=eligible.filter(x=>!readyBranches.has(x.g.branch)&&x.n.body!=="STR_SOLDIER_CHORT");
  const pool=coverageFirst&&missing.length?missing:branchFirst&&missingBranch.length?missingBranch:eligible;
  const balanced=(a,b)=>(turns.get(a.t.id)||0)-(turns.get(b.t.id)||0)||a.attempt-b.attempt||b.n.traits.length-a.n.traits.length||a.id.localeCompare(b.id);
  // Reserve every fourth selection for the original diversity scheduler.
  // Only observed partial advances can bypass body balancing in the other lanes.
  if(resumeFirst&&stats.attempts%4!==3){
   const progress=pool.filter(x=>x.partial&&x.gained>0);
   if(progress.length){
    progress.sort((a,b)=>b.priority-a.priority||workPriority.compare(a,b)||balanced(a,b));
    const best=progress[0];stats.progressSelected++;return best;
   }
  }
  const best=workPriority.choose(pool,balanced);
  if(best)stats.diversitySelected++;
  return best;
 }
 const roundToken=key([Object.keys(records).length,Object.keys(graphs).length,terminalRule.fingerprint]);
 function run(x){
  const {id,g,b,t,k,i,attempt}=x,start=performance.now();stats.attempts++;turns.set(t.id,(turns.get(t.id)||0)+1);
  batchTurns.set(k,(batchTurns.get(k)||0)+1);
  if(x.partial)stats.resumeSelected++;
  if(x.sameBatch)stats.sameBatchResumes++;
  const rec={graph:id,origin:g.origin,branch:g.branch,target:t.id,node:i,attempt:attempt+1,roundToken};
  const recordKey=key([k,i,attempt]);
  try{
   const w=loadNode(id,g,i),steps=stepsFor(g,i),full=[...g.birthActions,...steps],before=[...w.researched].filter(k=>active(w,k));
   const needed=t.researchGoals.filter(k=>!active(w,k));
   if(!needed.length&&!(t.inactiveResearch||[]).some(k=>active(w,k))){
    records[recordKey]={...rec,status:"CONDITIONAL_TARGET_RESEARCH_READY",to:i,added:[],missingItems:Object.entries(t.requiredItems||{}).filter(([k,n])=>(w.items[k]||0)<n),inactiveGoals:(t.inactiveResearch||[]).filter(k=>active(w,k))};
    anchors[k]={node:i,attempts:attempt+1,status:records[recordKey].status,roundToken};stats.alreadyReady++;markCovered(g,i);return;
   }
   if(needed.some(k=>w.disabled.has(k))||(!needed.length&&(t.inactiveResearch||[]).some(k=>active(w,k)))){records[recordKey]={...rec,status:"UNRESOLVED_DISABLED_GOAL",missing:needed};anchors[k]={node:i,attempts:attempt+1,status:records[recordKey].status,roundToken};stats.blocked++;return;}
   const p=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b),keep=commit(b);
   const accept=(a,z)=>keep.every(k=>active(z.world,k))&&t.researchGoals.filter(k=>active(a.world,k)).every(k=>active(z.world,k))&&
     ![...z.world.researched].some(k=>!a.world.researched.has(k)&&((b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k)))&&
     !(t.inactiveResearch||[]).some(k=>active(z.world,k));
   refreshFragments();
   const frag=fragmentIndex.propose({world:w,goals:t.researchGoals,planner:p,replay,allowed:(a,z)=>accept({world:a},{world:z}),accept:(steps,z)=>context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...full,...steps],z).length>0,deadline:Math.min(deadline(),performance.now()+1000),maxTrials:60,maxChunks:14});
   stats.fragmentTrials+=frag.metrics.trials;stats.fragmentApplied+=frag.metrics.applied;stats.fragmentResearchAdded+=frag.metrics.added;
   if(frag.steps.length)rec.fragments=frag.sources;
   const staged=createStagedResearch({planner:p,active,accept,deadline:Math.min(deadline(),performance.now()+12000),maxCalls:12,maxDepth:16,variant:attempt});
   const q=frag.complete?{complete:true,node:{world:frag.world,steps:[...full,...frag.steps]},achieved:t.researchGoals,remaining:[],failures:[],stats:{calls:0}}:staged.run({world:frag.world,steps:[...full,...frag.steps],trace:[],diagnostics:[]},t.researchGoals);
   if(frag.complete)stats.fragmentComplete++;
   stats.calls+=q.stats.calls;
   const suffix=q.node.steps.slice(full.length);let to=i,status="LIMITED_UNRESOLVED";
   if(suffix.length){
    const end=replay.replay(suffix,w);if(exactWorld(end)!==exactWorld(q.node.world))throw Error("Terminal suffix replay mismatch");
    stats.independentReplays++;
    if(!context(g.branch,{allowedDifficulties:g.allowedDifficulties},q.node.steps,end).length)throw Error("Terminal suffix context conflict");
    const added=[...end.researched].filter(k=>active(end,k)&&!before.includes(k));
    const edge=insert(id,g,end,i,"TERMINAL_RESEARCH:"+t.id,suffix,true);
    to=edge.to;stats.advanced++;stats.newResearch+=added.length;enqueue(id,to);
    status=q.complete?"CONDITIONAL_TARGET_RESEARCH_READY":"CONDITIONAL_TARGET_PARTIAL";
    if(q.complete){stats.ready++;markCovered(g,to);}
    records[recordKey]={...rec,to,status,added,achieved:q.achieved,remaining:q.remaining,stateHash:edge.stateHash,suffixHash:key(suffix),missingItems:Object.entries(t.requiredItems||{}).filter(([k,n])=>(end.items[k]||0)<n),failures:q.failures.slice(-3)};
   }else{stats.unresolved++;records[recordKey]={...rec,to,status,remaining:q.remaining,failures:q.failures.slice(-3)};}
   anchors[k]={node:to,attempts:attempt+1,status,roundToken};
  }catch(e){stats.unresolved++;records[recordKey]={...rec,status:"LIMITED_UNRESOLVED",reason:String(e.message)};anchors[k]={node:i,attempts:attempt+1,status:"LIMITED_UNRESOLVED",roundToken};}
  finally{
   const elapsedMs=performance.now()-start;stats.elapsedMs+=elapsedMs;
   const result=records[recordKey];if(result){result.elapsedMs=elapsedMs;latest.set(k,result);
    if(x.partial&&result.suffixHash)stats.resumeAdvanced++;
    if(x.partial&&result.status==="CONDITIONAL_TARGET_RESEARCH_READY")stats.resumeReady++;
   }
  }
 }
 return {next,run,records,anchors,stats,summary(){return {scope:"CONDITIONAL_RESEARCH_NOT_VICTORY",sourceFingerprint:terminalRule.fingerprint,targets:terminalRule.targets.length,attempts:Object.keys(records).length,advanced:Object.values(records).filter(r=>r.suffixHash).length,ready:Object.values(anchors).filter(r=>r.status==="CONDITIONAL_TARGET_RESEARCH_READY").length,partial:Object.values(anchors).filter(r=>r.status==="CONDITIONAL_TARGET_PARTIAL").length,unresolved:Object.values(anchors).filter(r=>r.status!=="CONDITIONAL_TARGET_RESEARCH_READY").length,fragmentLibrary:fragmentIndex.size,round:stats};}};
}
