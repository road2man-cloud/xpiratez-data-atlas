// Exact active-research projection of a replayed world. This shares only
// research gates; resources, rank, history, stats and all other gates remain
// local to each soldier. No state is declared final by this index.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
export const POLICY="ACTIVE_RESEARCH_SET_GATE_INDEX_V1";
export function researchSet(world,branch){
 const researched=[...world.researched].sort(),disabled=[...world.disabled].sort();
 const active=researched.filter(k=>!world.disabled.has(k));
 return {branch,researched,disabled,active};
}
export const researchSetId=(world,branch)=>key(researchSet(world,branch));
export function createActiveResearchIndex(engine,prior={},routes={}){
 const sets=structuredClone(prior.sets||{}),refs=structuredClone(prior.refs||{}),rules=new Map();
 const metrics={newRefs:0,newSets:0,gateComputations:0,gateCacheHits:0,worldChecks:0};
 for(const [id,r] of Object.entries(refs)){
  assert.equal(routes[id]?.canonicalStateHash,r.stateHash,"Active research source drift "+id);
  assert(sets[r.set],"Missing research set");
 }
 function record(id,r,world){
  assert.equal(exactWorld(world),r.canonicalStateHash);
  assert.equal(member(world).state.soldierType,r.body);
  const s=researchSet(world,r.branch),sid=key(s);metrics.worldChecks++;
  if(refs[id]){assert.equal(refs[id].set,sid);return sid;}
  if(!sets[sid]){sets[sid]=s;metrics.newSets++;}
  refs[id]={set:sid,stateHash:r.canonicalStateHash};metrics.newRefs++;return sid;
 }
 function eligible(id,r){
  const ref=refs[id];if(!ref)return null;
  const k=key([ref.set,r.body]);if(rules.has(k)){metrics.gateCacheHits++;return rules.get(k);}
  const set=sets[ref.set],active=new Set(set.active);
  const out=(engine.byBody.get(r.body)||[]).filter(x=>x.requires.every(k=>active.has(k)));
  rules.set(k,out);metrics.gateComputations++;return out;
 }
 function summary(routes){
  const origins=new Set(),branches=new Set(),shared=new Map();let gatePairs=0,maxRules=0;
  for(const [id,ref] of Object.entries(refs)){const r=routes[id];if(!r)continue;
   origins.add(r.origin);branches.add(r.branch);const xs=shared.get(ref.set)||new Set();xs.add(r.origin);shared.set(ref.set,xs);
   const n=eligible(id,r).length;gatePairs+=n;maxRules=Math.max(maxRules,n);
  }
  return {sets:Object.keys(sets).length,indexedRoutes:Object.keys(refs).length,origins:origins.size,branches:branches.size,crossOriginSets:[...shared.values()].filter(s=>s.size>1).length,gatePairs,maxRules,actualGameCertified:0};
 }
 return {sets,refs,metrics,record,eligible,summary};
}
