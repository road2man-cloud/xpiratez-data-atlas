// Inductive upper bound, not a finite-depth search. Abstract domain: each
// reachable body and stat has an interval [fixed minimum, upper]. The
// initial stat vector stays constant in supported nonclone replay actions.
// Relax history, rank, resources, all local stat gates and bonus removals.
// Budget exhaustion yields UNKNOWN, never an artificial upper bound.
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {scalarGrowth,scalarTransform,deterministicRule} from "./population-scalar-upper-bound.mjs";
import {key} from "./population-research-career-core.mjs";
import {member} from "./population-growth-replay-core.mjs";
export const POLICY="FIXED_RESEARCH_INDUCTIVE_INTERVAL_V1";
const floor=k=>k==="health"?1:0;
function growthUpper(body,k,hi,data){
 // Bravery grows in increments of ten: growth(hi) alone is not an
 // interval upper bound. Use the cap (or larger existing raw stat).
 if(k==="bravery"){const c=body.statCaps?.[k];if(!Number.isSafeInteger(c))throw Error("Unindexed bravery cap");return Math.max(hi,c);}
 return scalarGrowth(body,k,hi,data);
}
export function createInductiveUpper(data,engine,{maxValue=4096,maxTransfers=8000}={}){
 const cache=new Map(),transferCache=new Map(),bodies=new Map(data.soldiers.map(b=>[b.id,b])),bonuses=new Map();
 for(const b of data.bonuses)if(!bonuses.has(b.id))bonuses.set(b.id,b.stats||{});
 const metrics={calls:0,cacheHits:0,transferBuilds:0,transferHits:0,evaluations:0};
 function rulesFor(start,active){
  const reachable=new Set([start]),edges=new Map(),queue=[start],possibleBonuses=new Set();
  for(let i=0;i<queue.length;i++){
   const id=queue[i],a=[];
   for(const r of engine.byBody.get(id)||[]){
    const to=r.producedSoldierType||id;
    if(r.forbiddenSoldierTypes?.includes(id)||!r.requires.every(k=>active.has(k)))continue;
    if(!bodies.has(to)||!deterministicRule(r,[bodies.get(to)])||r.createsClone||r.producedItem)throw Error("Unsupported action in adapter");
    a.push({r,to});if(r.soldierBonusType)possibleBonuses.add(r.soldierBonusType);
    if(!reachable.has(to)){reachable.add(to);queue.push(to);}
   }edges.set(id,a);
  }return {reachable:[...reachable].sort(),edges,possibleBonuses};
 }
 function maxTransfer(r,from,to,k,ini,hi){
  const ck=key([r.id,from,to,k,ini]);let a=transferCache.get(ck);
  if(!a){a={values:[],last:floor(k)-1,best:-Infinity};transferCache.set(ck,a);metrics.transferBuilds++;}else metrics.transferHits++;
  for(let v=a.last+1;v<=hi;v++){
   const x=scalarTransform(r,bodies.get(from),bodies.get(to),k,v,ini);metrics.evaluations++;
   if(!Number.isSafeInteger(x))throw Error("Noninteger scalar transfer");
   a.best=Math.max(a.best,x);a.values.push(a.best);a.last=v;
  }
  return a.values[hi-floor(k)];
 }
 function compute(world,branch){
  metrics.calls++;const state=member(world)?.state;
  if(!state?.exactStats||!bodies.has(state.soldierType))throw Error("Unindexed exact root");
  const active=new Set([...world.researched].filter(k=>!world.disabled.has(k)));
  const raw=STAT_KEYS.map(k=>state.currentStats[k]),ini=STAT_KEYS.map(k=>state.initialStats[k]),traits=[...state.bonusIds].sort();
  const signature=key([branch,[...active].sort(),state.soldierType,raw,ini,traits]);
  if(cache.has(signature)){metrics.cacheHits++;return cache.get(signature);}
  const {reachable,edges,possibleBonuses}=rulesFor(state.soldierType,active);
  const positiveIds=[...new Set([...traits,...possibleBonuses])].sort();
  const rawUpper=Object.fromEntries(reachable.map(id=>[id,[]])),effectiveUpper=Object.fromEntries(reachable.map(id=>[id,[]])),stats=[];
  for(const [i,k] of STAT_KEYS.entries()){
   const lo=floor(k),initial=ini[i],root=raw[i];let work=0,reason=null;
   const u=new Map([[state.soldierType,root]]),queue=[state.soldierType],queued=new Set(queue);
   try{
    if(!Number.isSafeInteger(root)||root<lo||!Number.isSafeInteger(initial))throw Error("Unindexed root stats");
    for(let at=0;at<queue.length;at++){
     const body=queue[at];queued.delete(body);
     let hi=u.get(body);if(hi>maxValue)throw Error("VALUE_BUDGET_UNRESOLVED");
     const grown=growthUpper(bodies.get(body),k,hi,data);
     if(!Number.isSafeInteger(grown))throw Error("Unindexed growth");
     hi=Math.max(hi,grown);if(hi>maxValue)throw Error("VALUE_BUDGET_UNRESOLVED");u.set(body,hi);
     for(const {r,to} of edges.get(body)||[]){
      if(++work>maxTransfers)throw Error("TRANSFER_BUDGET_UNRESOLVED");
      const bound=maxTransfer(r,body,to,k,initial,hi);
      // Relax invalid low outcomes to the floor; this is only an overapproximation.
      const value=Math.max(lo,bound);if(value>maxValue)throw Error("VALUE_BUDGET_UNRESOLVED");
      if(!u.has(to)||value>u.get(to)){u.set(to,value);if(!queued.has(to)){queue.push(to);queued.add(to);}}
     }
    }
    if(reachable.some(b=>!u.has(b)))throw Error("Incomplete reachability");
    // Explicit inductive invariant check independent of the queue ordering.
    for(const body of reachable){const hi=u.get(body);
     if(growthUpper(bodies.get(body),k,hi,data)>hi)throw Error("Nonclosed growth");
     for(const {r,to} of edges.get(body)||[])if(maxTransfer(r,body,to,k,initial,hi)>u.get(to))throw Error("Nonclosed transfer");
    }
   }catch(e){reason=String(e.message);}
   const bonus=positiveIds.reduce((s,id)=>s+Math.max(0,Number(bonuses.get(id)?.[k]||0)),0);
   if(!Number.isSafeInteger(bonus))reason="Invalid bonus";
   for(const b of reachable){rawUpper[b].push(reason?null:u.get(b));effectiveUpper[b].push(reason?null:Math.max(lo,u.get(b)+bonus));}
   stats.push({stat:k,status:reason?"UNRESOLVED":"INDUCTIVE_UPPER",reason,work,positiveBonusUpper:bonus});
  }
  const result={policy:POLICY,signature,rootBody:state.soldierType,rootRaw:raw,initial:ini,rootTraits:traits,reachableBodies:reachable,ruleCount:[...edges.values()].reduce((n,a)=>n+a.length,0),positiveIds,rawUpper,effectiveUpper,stats,scope:"Fixed active research, deterministic nonclone healthy live adapter only. All local gates relaxed, positive bonuses counted once, removals ignored. No additional research or actual game certificate."};
  cache.set(signature,result);return result;
 }
 return {compute,metrics};
}
