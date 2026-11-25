// Schedule numeric-closure work by remaining pair obligations, not raw
// witness production. A bundle is an exact set of unfinished group IDs.
// Estimates affect order only. No obligation is pruned by this scheduler.
import assert from "node:assert/strict";
export const SCHEDULER_SCHEMA="CAREER_PAIR_CLOSURE_BUNDLE_V1";
const CLOSED="FIXED_PRESET_NUMERIC_CLOSED";
const popcount=m=>m.toString(2).replace(/0/g,"").length;
const median=xs=>{const s=xs.slice().sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:1;};
export function createClosureScheduler(src,baseGroups,affected,workById){
 const closed=new Set([...workById.values()].filter(g=>g.status===CLOSED).map(g=>g.group));
 const byBundle=new Map(),bundles=[],groupBundles=new Map();
 let closedPairs=0;
 for(const gs of src.pairGroups){
  const ids=[...new Set(gs.filter(g=>affected.has(g)&&!closed.has(g)))].sort((a,b)=>a-b);
  if(!ids.length){closedPairs++;continue;}
  const k=ids.join(",");
  if(!byBundle.has(k)){
   const b={ids:new Set(ids),count:0};byBundle.set(k,b);bundles.push(b);
   for(const id of ids){if(!groupBundles.has(id))groupBundles.set(id,[]);groupBundles.get(id).push(b);}
  }
  byBundle.get(k).count++;
 }
 const before=closedPairs,initialBundles=bundles.length;
 const features=src.groups.map((g,i)=>({body:g.roots[1][0],size:Math.max(1,baseGroups[i].states||1),actions:popcount(BigInt("0x"+g.mask))}));
 const learned=new Map(),global=[];
 function learn(g){
  const f=features[g.group],k=f.body+"|"+Math.floor(f.actions/4);
  const r=Math.max(1,g.records.length)/f.size;
  if(!learned.has(k))learned.set(k,[]);learned.get(k).push(r);global.push(r);
 }
 for(const g of workById.values())if(g.status===CLOSED)learn(g);
 // Freeze the per-round estimate to avoid sorting hundreds of samples for
 // every selection. Existing open groups use their actual record progress.
 const globalRatio=Math.max(1,median(global)),ratios=new Map([...learned].map(([k,v])=>[k,Math.max(1,median(v))]));
 const costBase=features.map(f=>Math.max(8,Math.ceil(f.size*(ratios.get(f.body+"|"+Math.floor(f.actions/4))||globalRatio)*(1+f.actions/16))));
 const excluded=new Set(),trace=[];
 function cost(id){
  const g=workById.get(id),f=features[id],expected=costBase[id];
  if(!g)return expected;
  const pending=Math.max(1,g.records.length-g.cursor);
  // Do not assume that the current frontier is the final state count.
  return Math.max(8,pending*(1+f.actions/16),expected-g.cursor,g.records.length/8);
 }
 function pick(eligible){
  const costs=new Map(),ok=id=>!excluded.has(id)&&eligible(id);
  const c=id=>{if(!costs.has(id))costs.set(id,cost(id));return costs.get(id);};
  const scores=new Map(),current=new Map();let best=null;
  // A closure can turn distinct original bundles into identical residual
  // obligations. Merge their weights before scoring the next selection.
  for(const b of bundles){
   if(!b.ids.size)continue;
   const ids=[...b.ids],k=ids.join(",");
   const old=current.get(k);if(old)old.count+=b.count;else current.set(k,{ids,count:b.count});
  }
  for(const b of current.values()){
   const ids=b.ids;if(!ids.every(ok))continue;
   const total=ids.reduce((s,id)=>s+c(id),0),score=b.count/total;
   for(const id of ids){
    const s=scores.get(id)||{immediate:0,pressure:0,covered:0};
    s.pressure+=b.count/ids.length;s.covered+=b.count;
    if(ids.length===1)s.immediate+=b.count;scores.set(id,s);
   }
   if(!best||score>best.score||score===best.score&&b.count>best.bundle.count)best={bundle:b,total,score};
  }
  if(best){
   const ids=[...best.bundle.ids],compare=(a,b)=>{
    const x=scores.get(a),y=scores.get(b);
    return (y.immediate+y.pressure)/c(b)-(x.immediate+x.pressure)/c(a)||c(a)-c(b)||a-b;
   };
   const id=ids.sort(compare)[0],s=scores.get(id);
   return {id,estimatedCost:c(id),immediate:s.immediate,covered:s.covered,bundlePairs:best.bundle.count,bundleRemaining:ids.length,bundleEstimatedCost:best.total};
  }
  // If all useful bundles contain a temporarily blocked group, still allow
  // eligible work to progress. A cap is not an impossibility certificate.
  const id=[...affected].filter(ok).sort((a,b)=>c(a)-c(b)||a-b)[0];
  return id===undefined?null:{id,estimatedCost:c(id),immediate:0,covered:0,bundlePairs:0,bundleRemaining:0,bundleEstimatedCost:0};
 }
 function record(plan,g,spentMs,recordsAdded){
  excluded.add(plan.id);let gained=0;
  if(g.status===CLOSED){
   assert(!closed.has(g.group));closed.add(g.group);
   for(const b of groupBundles.get(g.group)||[]){
    assert(b.ids.delete(g.group));
    if(!b.ids.size){gained+=b.count;closedPairs+=b.count;}
   }
  }
  trace.push({...plan,status:g.status,actualClosedPairs:gained,spentMs:Math.round(spentMs),recordsAdded});
 }
 function summary(){
  return {schema:SCHEDULER_SCHEMA,beforeClosedPairs:before,afterClosedPairs:closedPairs,newClosedPairs:closedPairs-before,
   initialBundles,remainingBundles:new Set(bundles.filter(b=>b.ids.size).map(b=>[...b.ids].join(","))).size,globalCostRatio:globalRatio,picks:trace.length,
   completedPicks:trace.filter(t=>t.status===CLOSED).length,immediatePredicted:trace.reduce((s,t)=>s+t.immediate,0),
   estimatedCost:trace.reduce((s,t)=>s+t.estimatedCost,0),spentMs:trace.reduce((s,t)=>s+t.spentMs,0),trace};
 }
 return {pick,record,summary};
}
