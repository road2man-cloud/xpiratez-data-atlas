// Scheduling-only body/research envelope. Every goal is an acquisition
// proposal; a reachable body here is not a concrete eligibility witness.
// Local history, exclusive choices, removal and all costs are replayed later.
import {key} from "./population-research-career-core.mjs";
const uniq=x=>[...new Set(x)].sort();
export function createTraitEnvelope(engine,sets,suffixes){
 const cache=new Map(),metrics={builds:0,hits:0,states:0};
 function build(branch,sourceSet,body){
  const k=key([branch,sourceSet,body]);if(cache.has(k)){metrics.hits++;return cache.get(k);}
  const active=new Set(sets(sourceSet).active),bodies=new Set([body]),queue=[body],goals=new Set(),targets=new Set(),bonusIds=new Set();
  for(let i=0;i<queue.length;i++)for(const r of engine.byBody.get(queue[i])||[]){
   if(r.forbiddenSoldierTypes?.includes(queue[i]))continue;
   const missing=r.requires.filter(k=>!active.has(k)).sort();
   // Restrict to known single-topic proposals for this production lane.
   // Other goals remain in the original worklist.
   if(missing.length&&!missing.every(k=>suffixes.has(key([branch,[k]]))))continue;
   for(const k of missing)goals.add(k);
   if(missing.length){targets.add(r.id);if(r.soldierBonusType)bonusIds.add(r.soldierBonusType);}
   const dest=r.producedSoldierType||queue[i];if(!bodies.has(dest)){bodies.add(dest);queue.push(dest);}
  }
  const result={goal:uniq(goals),targets:uniq(targets),bodies:uniq(bodies),bonusIds:uniq(bonusIds)};cache.set(k,result);metrics.builds++;return result;
 }
 return {build,metrics};
}
export function retainedDelta(base,node){
 const a=new Set(base.traits),b=new Set(node.traits);
 return {gained:node.traits.filter(t=>!a.has(t)),lost:base.traits.filter(t=>!b.has(t)),retained:node.traits.filter(t=>a.has(t)),count:node.traits.length,net:node.traits.length-base.traits.length};
}
// Retention and nonnegative permanent-stat gain are priority signals ONLY.
export function retainedScore(base,node){
 const t=retainedDelta(base,node);
 return t.net*1000+t.gained.length*80-t.lost.length*120+node.permanentVector.reduce((s,v,i)=>s+Math.max(-100,Math.min(100,v-base.permanentVector[i])),0);
}
