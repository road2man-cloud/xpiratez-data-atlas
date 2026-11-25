// History-gate projection from actual replayed soldier state.
// It is not a bound on future transformations: body or history may change.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
import {member} from "./population-growth-replay-core.mjs";
export function createHistoryGateIndex(prior={},routes={}){
 const sets=structuredClone(prior.historySets||{}),refs=structuredClone(prior.historyRefs||{}),cache=new Map();
 const metrics={newRefs:0,newSets:0,gateComputations:0,gateCacheHits:0,excludedEdges:0};
 for(const [id,r] of Object.entries(refs)){assert.equal(routes[id]?.canonicalStateHash,r.stateHash);assert(sets[r.history]);}
 function record(id,r,world){
  const history=[...member(world).state.history].sort(),h=key(history);
  if(refs[id]){assert.equal(refs[id].history,h);return;}
  if(!sets[h]){sets[h]=history;metrics.newSets++;}
  refs[id]={history:h,stateHash:r.canonicalStateHash};metrics.newRefs++;
 }
 function eligible(id,r,researchSet,rules){
  const ref=refs[id];if(!ref)return rules;
  const k=key([researchSet,r.body,ref.history]);
  if(cache.has(k)){metrics.gateCacheHits++;const x=cache.get(k);metrics.excludedEdges+=rules.length-x.length;return x;}
  const h=new Set(sets[ref.history]),x=rules.filter(rule=>!rule.requiredPreviousTransformations?.some(t=>!h.has(t))&&!rule.forbiddenPreviousTransformations?.some(t=>h.has(t)));
  cache.set(k,x);metrics.gateComputations++;metrics.excludedEdges+=rules.length-x.length;return x;
 }
 return {sets,refs,metrics,record,eligible};
}
