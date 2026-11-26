// Exact ordered-action prefix reuse across non-adjacent recruitment histories.
// Each checkpoint is scoped to one replay engine and the same foundation.
// Hashes accelerate lookup only; the full ordered prefix must also match.
import {createHash} from "node:crypto";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";

export function createSharedPrefixReplay(replay,{stride=32,limit=24,checkpointLimit=96}={}){
 if(!Number.isSafeInteger(stride)||stride<1||!Number.isSafeInteger(limit)||limit<0||!Number.isSafeInteger(checkpointLimit)||checkpointLimit<0)throw Error("Invalid prefix cache limits");
 const metrics={requests:0,actions:0,avoided:0,cacheHits:0,prefixHits:0,crossHistoryHits:0,checkpointEntries:0,checkpointEvictions:0};
 const cached=new Map(),checkpoints=new Map(),foundation=foundationWorld();
 let previousId=null;
 const equalPrefix=(a,b,n)=>a.length>=n&&b.length>=n&&a.slice(0,n).every((v,i)=>v===b[i]);
 function touch(map,k,v,max){
  map.delete(k);map.set(k,v);
  while(map.size>max){map.delete(map.keys().next().value);if(map===checkpoints)metrics.checkpointEvictions++;}
 }
 function load(p){
  metrics.requests++;
  const actions=p.actions.map(a=>JSON.stringify(a)),prior=cached.get(p.id);
  if(prior&&prior.actions.length===actions.length&&equalPrefix(prior.actions,actions,actions.length)){
   touch(cached,p.id,prior,limit);metrics.cacheHits++;metrics.avoided+=actions.length;previousId=p.id;return prior.world;
  }
  // Newline cannot occur literally inside compact JSON strings; ordered
  // serialization therefore separates action boundaries unambiguously.
  const hash=createHash("sha256"),keys=new Map();
  for(let i=0;i<actions.length;i++){
   hash.update(actions[i]).update("\n");
   if((i+1)%stride===0)keys.set(i+1,hash.copy().digest("hex"));
  }
  let at=0,w=foundation;
  for(const [i,k] of [...keys].reverse()){
   const entry=checkpoints.get(k);
   if(!entry||entry.length!==i||!equalPrefix(entry.actions,actions,i))continue;
   at=i;w=entry.world;touch(checkpoints,k,entry,checkpointLimit);metrics.prefixHits++;
   if(entry.id!==previousId)metrics.crossHistoryHits++;
   break;
  }
  metrics.avoided+=at;
  // Engine apply is copy-on-write. Intermediate pending-free states are
  // allowed as checkpoints, but never as a returned complete birth world.
  for(let i=at;i<p.actions.length;i++){
   w=replay.apply(w,p.actions[i]);metrics.actions++;
   const k=keys.get(i+1);
   if(k)touch(checkpoints,k,{id:p.id,actions,length:i+1,world:w},checkpointLimit);
  }
  if(w.pendingFree)throw Error("PENDING_FREE");
  touch(cached,p.id,{actions,world:w},limit);previousId=p.id;
  metrics.checkpointEntries=checkpoints.size;
  return w;
 }
 return {load,metrics};
}
