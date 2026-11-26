// Resource-aware scheduling and numeric-receipt guard. Forecasts never
// eliminate a path. A numeric proof can retire an economical candidate only
// if every covering witness consumes no more of EACH tracked material than
// the known already-consumed + unavoidable first-step amount.
import {createMaterialIndex} from "../public/branch-soldier-material-frontier.js";
export function createMaterialPriority({db,materialPolicy,numericSearch,weight=18}){
 const budget=db.careerCompletion?.materialBudget,checked=Object.keys(db.populationMissingOriginCareer?.routes||{});
 const index=createMaterialIndex(budget,checked);
 const ids=index.ids,refs=new Map(),cache=new WeakMap(),sets=db.careerCompletion?.researchTraitSets;
 const metrics={schema:"FINITE_RESOURCE_POTENTIAL_V1",candidates:0,selected:0,selectedNoNewFinite:0,selectedFinite:0,selectedCaptainTokens:0,selectedSavings:0,proofBlocked:0,proofAccepted:0,receiptBlocked:0,referenceWitnesses:0};
 const admitted=new Set((db.careerCompletion?.rows||[]).filter(r=>r.proofKind==="REPLAYED_RESEARCH_LINE_V1").map(r=>r.id));
 const key=(o,b)=>JSON.stringify([o,b]),le=(a,b)=>a.every((v,i)=>v<=b[i]);
 for(const [id,r] of Object.entries(sets?.records||{})){
  const p=sets.pairs[r.pairId],cost=index.cost(id);if(!p||!admitted.has(r.pairId)||!cost||!Array.isArray(r.cap)||r.cap.length!==12)continue;
  const k=key(p.origin,p.body),list=refs.get(k)||[];list.push({cap:r.cap,cost});refs.set(k,list);metrics.referenceWitnesses++;
 }
 function assess(x){
  if(cache.has(x))return cache.get(x);
  const old=materialPolicy.state(x.g,x.i),next=materialPolicy.extend(old,[{type:"transform",transform:x.r.id}]);
  const costs=ids.map(k=>next.consumed[k]||0),extra=ids.map(k=>(next.consumed[k]||0)-(old.consumed[k]||0));
  const incremental=extra.reduce((s,n,i)=>s+n/Math.max(1,index.finite[ids[i]].cap),0);
  // Preserve high potential as primary objective; scarce cost is a bounded
  // adjustment, not a claim that all future actions have known costs.
  const body=x.r.producedSoldierType||x.n.body,matching=(refs.get(key(x.g.origin,body))||[]).filter(r=>x.projectedCap?.every((v,i)=>r.cap[i]>=v));
  const savings=matching.length>0&&!matching.some(r=>le(r.cost,costs));
  const adjustment=Math.max(-weight, -weight*incremental)+(savings?weight*.55:0);
  const out={costs,extra,adjustment,savings,incremental};cache.set(x,out);metrics.candidates++;return out;
 }
 function score(x){return numericSearch.score(x)+assess(x).adjustment;}
 function select(x){const a=assess(x);metrics.selected++;if(a.extra.some(n=>n>0))metrics.selectedFinite++;else metrics.selectedNoNewFinite++;metrics.selectedCaptainTokens+=a.extra[ids.indexOf("STR_CAPTAINS_11_TOKEN")]||0;if(a.savings)metrics.selectedSavings++;return {delta:Object.fromEntries(ids.flatMap((k,i)=>a.extra[i]?[[k,a.extra[i]]]:[])),consumedLowerBound:Object.fromEntries(ids.flatMap((k,i)=>a.costs[i]?[[k,a.costs[i]]]:[])),adjustment:a.adjustment,cheaperPotential:a.savings};}
 function safe(p,x){if(!p?.witnesses?.length)return false;const lower=assess(x).costs;return p.witnesses.every(w=>{const v=index.cost(w.witness);return v&&le(v,lower);});}
 function prove(x,...args){const p=numericSearch.prove(x,...args);if(!p)return null;if(!safe(p,x)){metrics.proofBlocked++;return null;}metrics.proofAccepted++;return {...p,materialObjective:{schema:metrics.schema,ids,consumedLowerBound:assess(x).costs}};}
 function reuse(p,x){if(!p)return false;if(!safe(p,x)){metrics.receiptBlocked++;return false;}return numericSearch.reuse(p,x);}
 return {score,prove,reuse,select,metrics:numericSearch.metrics,materialMetrics:metrics};
}
