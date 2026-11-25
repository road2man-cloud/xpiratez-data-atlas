// A research-set witness is a reusable proposal, never a grant.
// Match exact research sets first, then same branch/goal across origins.
// Each target must independently replay the entire suffix and audit context.
import {key} from "./population-research-career-core.mjs";
const bucket=t=>key([t.branch,t.goal]);
export function createResearchBatch(tasks,receipts,tried={}){
 const proposals=new Map(),targets=new Map(),turns=new Map(),metrics={proposals:0,attempts:0,successes:0,failures:0,exactSetSuccesses:0,crossOriginSuccesses:0,compactSuccesses:0};
 let clock=0;
 function addTarget(id,t){const k=bucket(t),m=targets.get(k)||new Map();m.set(id,t);targets.set(k,m);}
 for(const [id,t] of Object.entries(tasks))addTarget(id,t);
 function addProposal(g,source){
  const k=bucket(g),m=proposals.get(k)||new Map(),hash=key(g.researchActions);
  const identity=key([hash,g.sourceSet,g.origin]);
  if(m.has(identity))return;
  m.set(identity,{hash,source,origin:g.origin,sourceSet:g.sourceSet,actions:g.researchActions});
  proposals.set(k,m);metrics.proposals++;
 }
 function eligible(r){return !r||["LIMITED_PLANNER_UNRESOLVED","JOINT_REPLAY_UNRESOLVED"].includes(r.status);}
 function choose(){
  let best=null,bestScore=null;
  for(const [k,m] of targets){
   const ps=proposals.get(k);if(!ps)continue;
   for(const [id,t] of m){
    if(!eligible(receipts[id]))continue;
    const done=tried[id]||{};
    for(const p of ps.values()){
     if(Object.hasOwn(done,p.hash))continue;
     const score=[turns.get(t.origin)||0,Number(p.origin===t.origin),Number(p.sourceSet!==t.sourceSet),-t.fresh,p.actions.length,id];
     if(!best||less(score,bestScore)){best={id,t,p};bestScore=score;}
    }
   }
  }
  if(best)turns.set(best.t.origin,++clock);return best;
 }
 function less(a,b){for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]<b[i];}return false;}
 function record(x,result){
  const {id,t,p}=x;metrics.attempts++;
  (tried[id]??={})[p.hash]={status:result.ok?"REPLAYED":"REUSE_UNRESOLVED",source:p.source,exactSet:p.sourceSet===t.sourceSet,crossOrigin:p.origin!==t.origin,compact:!!result.compact,reason:result.reason||null};
  if(result.ok){metrics.successes++;if(p.sourceSet===t.sourceSet)metrics.exactSetSuccesses++;if(p.origin!==t.origin)metrics.crossOriginSuccesses++;if(result.compact)metrics.compactSuccesses++;}
  else metrics.failures++;
 }
 return {addTarget,addProposal,choose,record,metrics,tried};
}
