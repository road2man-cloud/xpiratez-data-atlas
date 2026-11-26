// Exact ordered-action prefix reuse across non-adjacent recruitment histories.
// Each checkpoint is scoped to one replay engine and the same foundation.
// Hashes accelerate lookup only; the full ordered prefix must also match.
import {createHash} from "node:crypto";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";

export function createSharedPrefixReplay(replay,{stride=32,limit=24,checkpointLimit=96,observationLimit=4096}={}){
 if(!Number.isSafeInteger(stride)||stride<1||!Number.isSafeInteger(limit)||limit<0||!Number.isSafeInteger(checkpointLimit)||checkpointLimit<0||!Number.isSafeInteger(observationLimit)||observationLimit<1)throw Error("Invalid prefix cache limits");
 const metrics={requests:0,actions:0,avoided:0,cacheHits:0,prefixHits:0,crossHistoryHits:0,checkpointEntries:0,checkpointEvictions:0,weightedEvictions:0,hotPrefixHits:0,observedPrefixes:0};
 const cached=new Map(),checkpoints=new Map(),observations=new Map(),foundation=foundationWorld();
 let previousId=null;
 const equalPrefix=(a,b,n)=>a.length>=n&&b.length>=n&&a.slice(0,n).every((v,i)=>v===b[i]);
 function touch(map,k,v,max){
  map.delete(k);map.set(k,v);
  while(map.size>max){map.delete(map.keys().next().value);if(map===checkpoints)metrics.checkpointEvictions++;}
 }
 // Keep frequently encountered prefixes even when a long single history
 // inserts many checkpoints. Eviction changes only cost, never identity.
 function observe(k){
  const o=observations.get(k)||{count:0,last:0};
  o.count=Math.min(64,o.count+1);o.last=metrics.requests;
  observations.delete(k);observations.set(k,o);
  while(observations.size>observationLimit)observations.delete(observations.keys().next().value);
 }
 function benefit(k,v){
  const o=observations.get(k),count=o?.count||1,age=Math.max(0,metrics.requests-(o?.last||v.last));
  return Math.sqrt(v.length/stride)*(1+2*Math.log2(count))/(1+age/8);
 }
 function retain(k,v){
  if(!checkpointLimit)return;
  v.last=metrics.requests;checkpoints.delete(k);checkpoints.set(k,v);
  if(checkpoints.size<=checkpointLimit)return;
  let worst=null,score=Infinity;
  for(const [id,e] of checkpoints){const q=benefit(id,e);if(q<score){score=q;worst=id;}}
  if(worst!==null){checkpoints.delete(worst);metrics.checkpointEvictions++;metrics.weightedEvictions++;}
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
   if((i+1)%stride===0){const k=hash.copy().digest("hex");keys.set(i+1,k);observe(k);}
  }
  let at=0,w=foundation;
  for(const [i,k] of [...keys].reverse()){
   const entry=checkpoints.get(k);
   if(!entry||entry.length!==i||!equalPrefix(entry.actions,actions,i))continue;
   at=i;w=entry.world;retain(k,entry);metrics.prefixHits++;if((observations.get(k)?.count||0)>2)metrics.hotPrefixHits++;
   if(entry.id!==previousId)metrics.crossHistoryHits++;
   break;
  }
  metrics.avoided+=at;
  // Engine apply is copy-on-write. Intermediate pending-free states are
  // allowed as checkpoints, but never as a returned complete birth world.
  for(let i=at;i<p.actions.length;i++){
   w=replay.apply(w,p.actions[i]);metrics.actions++;
   const k=keys.get(i+1);
   if(k)retain(k,{id:p.id,actions,length:i+1,world:w});
  }
  if(w.pendingFree)throw Error("PENDING_FREE");
  touch(cached,p.id,{actions,world:w},limit);previousId=p.id;
  metrics.checkpointEntries=checkpoints.size;metrics.observedPrefixes=observations.size;
  return w;
 }
 return {load,metrics};
}
