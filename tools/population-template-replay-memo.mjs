// Recipient-local exact prefix memo. Replay inputs are immutable: the
// chronological replay clones every input world. Object identity prevents
// merging different research, free-reward, or resource states.
// Both success and failure are cached, but never a route-level rejection.
export function createTemplateReplayMemo(replay,metrics,limit=160){
 const parents=new WeakMap(),lru=new Map();
 function apply(world,action){
  metrics.requests++;
  let map=parents.get(world);if(!map){map=new Map();parents.set(world,map);}
  const k=JSON.stringify(action),old=map.get(k);
  if(old){
   lru.delete(old);lru.set(old,{map,k});
   if(old.error!==undefined){metrics.failureHits++;throw Error(old.error);}
   metrics.successHits++;return old.world;
  }
  metrics.applied++;
  let entry;
  try{entry={world:replay.apply(world,action)};}catch(e){entry={error:String(e.message||e)};metrics.failures++;}
  map.set(k,entry);lru.set(entry,{map,k});
  if(lru.size>limit){const [old,{map,k}]=lru.entries().next().value;map.delete(k);lru.delete(old);metrics.evictions++;}
  metrics.peak=Math.max(metrics.peak,lru.size);
  if(entry.error!==undefined)throw Error(entry.error);
  return entry.world;
 }
 return {apply};
}
export const templateMemoMetrics=()=>({requests:0,applied:0,successHits:0,failureHits:0,failures:0,evictions:0,peak:0});
