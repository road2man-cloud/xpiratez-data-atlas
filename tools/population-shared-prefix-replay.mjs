// Exact ordered-action prefix reuse; no merging by active research alone.
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
export function createSharedPrefixReplay(replay,{stride=32,limit=24}={}){
 const metrics={requests:0,actions:0,avoided:0,cacheHits:0};
 const cached=new Map();let previous=[],checkpoints=new Map([[0,foundationWorld()]]);
 function load(p){
  metrics.requests++;
  if(cached.has(p.id)){const w=cached.get(p.id);cached.delete(p.id);cached.set(p.id,w);metrics.cacheHits++;metrics.avoided+=p.actions.length;return w;}
  const actions=p.actions.map(a=>JSON.stringify(a));
  let common=0;while(common<actions.length&&common<previous.length&&actions[common]===previous[common])common++;
  let at=0;for(const k of checkpoints.keys())if(k<=common&&k>at)at=k;
  let w=checkpoints.get(at),next=new Map([...checkpoints].filter(([i])=>i<=at));
  metrics.avoided+=at;
  // Engine apply is copy-on-write; no partial prefix is certified here.
  for(let i=at;i<p.actions.length;i++){w=replay.apply(w,p.actions[i]);metrics.actions++;if((i+1)%stride===0)next.set(i+1,w);}
  if(w.pendingFree)throw Error("PENDING_FREE");
  next.set(actions.length,w);previous=actions;checkpoints=next;
  cached.set(p.id,w);if(cached.size>limit)cached.delete(cached.keys().next().value);
  return w;
 }
 return {load,metrics};
}
