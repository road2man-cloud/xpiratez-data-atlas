// A terminal research target is a scheduling goal, NEVER a victory/closure proof.
// Retain every advanced concrete state and reuse it on a later batch.
import {key} from "./population-research-career-core.mjs";
import {exactWorld} from "./population-growth-replay-core.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
export function createTerminalTargetScheduler({terminalRule,graphs,branches,commit,allChoice,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,prior={},deadline,focus=[],graphFilter=()=>true,resumeFirst=false,workPriority}){
 if(terminalRule?.status!=="RULES_AND_PRESERVED_ENGINE_EXTRACTED")throw Error("Terminal source evidence missing");
 const targets=terminalRule.targets.filter(t=>!focus.length||focus.includes(t.id));
 const records=prior.records||{},anchors=prior.anchors||{};
 const stats={attempts:0,advanced:0,ready:0,alreadyReady:0,blocked:0,unresolved:0,newResearch:0,calls:0,independentReplays:0};
 const active=(w,k)=>replay.active(w,k),turns=new Map();
 for(const r of Object.values(records))turns.set(r.target,(turns.get(r.target)||0)+1);
 const keyFor=(id,t)=>key([id,t.id]);
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
    if(a?.roundToken===roundToken)continue;
    list.push({id,g,b,t,k,i,attempt,n,partial:a?.status==="CONDITIONAL_TARGET_PARTIAL"});
   }
  }
  return workPriority.choose(list,(a,b)=>(resumeFirst?Number(b.partial)-Number(a.partial):0)||(turns.get(a.t.id)||0)-(turns.get(b.t.id)||0)||a.attempt-b.attempt||b.n.traits.length-a.n.traits.length||a.id.localeCompare(b.id));
 }
 const roundToken=key([Object.keys(records).length,Object.keys(graphs).length,terminalRule.fingerprint]);
 function run(x){
  const {id,g,b,t,k,i,attempt}=x;stats.attempts++;turns.set(t.id,(turns.get(t.id)||0)+1);
  const rec={graph:id,origin:g.origin,branch:g.branch,target:t.id,node:i,attempt:attempt+1,roundToken};
  const recordKey=key([k,i,attempt]);
  try{
   const w=loadNode(id,g,i),steps=stepsFor(g,i),full=[...g.birthActions,...steps],before=[...w.researched].filter(k=>active(w,k));
   const needed=t.researchGoals.filter(k=>!active(w,k));
   if(!needed.length){
    records[recordKey]={...rec,status:"CONDITIONAL_TARGET_RESEARCH_READY",to:i,added:[],missingItems:Object.entries(t.requiredItems||{}).filter(([k,n])=>(w.items[k]||0)<n),inactiveGoals:(t.inactiveResearch||[]).filter(k=>active(w,k))};
    anchors[k]={node:i,attempts:attempt+1,status:records[recordKey].status,roundToken};stats.alreadyReady++;return;
   }
   if(needed.some(k=>w.disabled.has(k))){records[recordKey]={...rec,status:"UNRESOLVED_DISABLED_GOAL",missing:needed};anchors[k]={node:i,attempts:attempt+1,status:records[recordKey].status,roundToken};stats.blocked++;return;}
   const p=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b),keep=commit(b);
   const accept=(a,z)=>keep.every(k=>active(z.world,k))&&t.researchGoals.filter(k=>active(a.world,k)).every(k=>active(z.world,k))&&
     ![...z.world.researched].some(k=>!a.world.researched.has(k)&&((b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k)))&&
     !(t.inactiveResearch||[]).some(k=>active(z.world,k));
   const staged=createStagedResearch({planner:p,active,accept,deadline:Math.min(deadline(),performance.now()+12000),maxCalls:12,maxDepth:16,variant:attempt});
   const q=staged.run({world:w,steps:full,trace:[],diagnostics:[]},t.researchGoals);stats.calls+=q.stats.calls;
   const suffix=q.node.steps.slice(full.length);let to=i,status="LIMITED_UNRESOLVED";
   if(suffix.length){
    const end=replay.replay(suffix,w);if(exactWorld(end)!==exactWorld(q.node.world))throw Error("Terminal suffix replay mismatch");
    stats.independentReplays++;
    if(!context(g.branch,{allowedDifficulties:g.allowedDifficulties},q.node.steps,end).length)throw Error("Terminal suffix context conflict");
    const added=[...end.researched].filter(k=>active(end,k)&&!before.includes(k));
    const edge=insert(id,g,end,i,"TERMINAL_RESEARCH:"+t.id,suffix,true);
    to=edge.to;stats.advanced++;stats.newResearch+=added.length;enqueue(id,to);
    status=q.complete?"CONDITIONAL_TARGET_RESEARCH_READY":"CONDITIONAL_TARGET_PARTIAL";
    if(q.complete)stats.ready++;
    records[recordKey]={...rec,to,status,added,achieved:q.achieved,remaining:q.remaining,stateHash:edge.stateHash,suffixHash:key(suffix),missingItems:Object.entries(t.requiredItems||{}).filter(([k,n])=>(end.items[k]||0)<n),failures:q.failures.slice(-3)};
   }else{stats.unresolved++;records[recordKey]={...rec,to,status,remaining:q.remaining,failures:q.failures.slice(-3)};}
   anchors[k]={node:to,attempts:attempt+1,status,roundToken};
  }catch(e){stats.unresolved++;records[recordKey]={...rec,status:"LIMITED_UNRESOLVED",reason:String(e.message)};anchors[k]={node:i,attempts:attempt+1,status:"LIMITED_UNRESOLVED",roundToken};}
 }
 return {next,run,records,anchors,stats,summary(){return {scope:"CONDITIONAL_RESEARCH_NOT_VICTORY",sourceFingerprint:terminalRule.fingerprint,targets:terminalRule.targets.length,attempts:Object.keys(records).length,advanced:Object.values(records).filter(r=>r.suffixHash).length,ready:Object.values(anchors).filter(r=>r.status==="CONDITIONAL_TARGET_RESEARCH_READY").length,partial:Object.values(anchors).filter(r=>r.status==="CONDITIONAL_TARGET_PARTIAL").length,unresolved:Object.values(anchors).filter(r=>r.status!=="CONDITIONAL_TARGET_RESEARCH_READY").length,round:stats};}};
}
