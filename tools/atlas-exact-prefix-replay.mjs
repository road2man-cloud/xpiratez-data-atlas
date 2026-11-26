// Run-local exact prefix memo. Never merges distinct action histories or certifies assumptions.
import {serialize} from 'node:v8';
import {createHash} from 'node:crypto';
const key=x=>createHash('sha256').update(serialize(x)).digest('hex');
export function createExactPrefixReplay(initial, apply, {maxNodes=4096}={}){
 if(!Number.isSafeInteger(maxNodes)||maxNodes<1)throw new Error('Invalid cache capacity');
 const root=key(initial), cache=new Map();
 const metrics={requests:0,transitions:0,hits:0,evictions:0};
 function run(actions, project=()=>null){
  let world=structuredClone(initial), prefix=root;const trace=[];
  for(const action of actions){
   metrics.requests++;
   const next=key([prefix,action]);let entry=cache.get(next);
   if(entry){
    metrics.hits++;cache.delete(next);cache.set(next,entry);
    world=structuredClone(entry);
   }else{
    world=apply(world,structuredClone(action));metrics.transitions++;
    cache.set(next,structuredClone(world));
    if(cache.size>maxNodes){cache.delete(cache.keys().next().value);metrics.evictions++;}
   }
   prefix=next;trace.push(project(structuredClone(world)));
  }
  return {world,trace};
 }
 return {run,metrics};
}
