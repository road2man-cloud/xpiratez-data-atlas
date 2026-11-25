// Coverage-aware retained-trait scheduling. Hints affect traversal order only.
// Full chronological replay remains authoritative. Missing evidence is not zero
// attainable traits, nor a proof of impossibility.
import {birthActions} from "./population-growth-replay-core.mjs";
import {birthPair,coverageIndex,orderMissing} from "./population-frontier-coverage-seeds.mjs";
import {createRetainedPriority} from "./population-retained-trait-scheduler.mjs";
export const COVERAGE_TRAIT_POLICY="ALL_ORIGIN_TRAIT_COVERAGE_V1";
export function traitCoverage(routes,origins){
 const byOrigin=Object.fromEntries(origins.map(k=>[k,{routes:0,measured:0,maxTraits:null,bestRoute:null,measuredPairs:0}]));
 const pairs=new Map(),pairSets=new Map();
 for(const [id,r] of Object.entries(routes)){
  const o=byOrigin[r.origin];if(!o)throw Error("Unknown origin "+r.origin);o.routes++;
  const t=r.traitEvidence||r.rankTraitEvidence;if(!t)continue;
  o.measured++;const k=birthPair(r),p=pairs.get(k)||{origin:r.origin,branch:r.branch,measured:0,maxTraits:null,bestRoute:null};
  p.measured++;if(p.maxTraits===null||t.after.length>p.maxTraits){p.maxTraits=t.after.length;p.bestRoute=id;}pairs.set(k,p);
  if(!pairSets.has(r.origin))pairSets.set(r.origin,new Set());pairSets.get(r.origin).add(r.branch);
  if(o.maxTraits===null||t.after.length>o.maxTraits){o.maxTraits=t.after.length;o.bestRoute=id;}
 }
 for(const [k,s] of pairSets)byOrigin[k].measuredPairs=s.size;
 const rows=Object.values(byOrigin);
 return {origins:origins.length,originsWithRoutes:rows.filter(o=>o.routes).length,measuredOrigins:rows.filter(o=>o.measured).length,unmeasuredWithRoutes:rows.filter(o=>o.routes&&!o.measured).length,missingOrigins:rows.filter(o=>!o.routes).length,measuredRoutes:rows.reduce((n,o)=>n+o.measured,0),measuredPairs:pairs.size,byOrigin,byPair:Object.fromEntries(pairs)};
}
export function orderMissingOrigins(index,attempts,db,data){
 const xs=orderMissing(index,attempts,db,data);
 return xs.map((q,i)=>({q,i})).sort((a,b)=>Number(index.origins.has(a.q.birth.origin))-Number(index.origins.has(b.q.birth.origin))||(index.origins.get(a.q.birth.origin)||0)-(index.origins.get(b.q.birth.origin)||0)||a.i-b.i).map(x=>x.q);
}
export function createCoveragePriority(db,data,routes,births){
 const retained=createRetainedPriority(data,routes),birthHints=new Map(),hints=new Map(),profiles=data.profiles.map(p=>p.id);
 const measured=traitCoverage(routes,profiles),pairs=coverageIndex(routes,births).pairs;
 function researchHint(r){
  if(hints.has(r.fullActionHash))return hints.get(r.fullActionHash);
  let b=birthHints.get(r.input);
  if(!b){
   const {p,steps}=birthActions(db,r);
   b=new Set(p.addedResearch||[]);
   for(const a of steps){
    if(a.type==="research"||a.type==="repeatResearch")b.add(a.id);
    if(a.type==="freeResearch"||a.type==="eventResearch")b.add(a.research);
   }
   birthHints.set(r.input,b);
  }
  const h=new Set([...b,...r.addedResearch]);
  hints.set(r.fullActionHash,h);return h;
 }
 function score(id,r,rule){
  const h=researchHint(r),fresh=rule.soldierBonusType&&!retained.state(id,r).traits.has(rule.soldierBonusType);
  const active=rule.requires.every(k=>h.has(k));
  // Reward already-researched novel traits; never exclude other actions.
  return retained.score(id,r,rule)+Number(active&&fresh)*650+Number(active)*45;
 }
 function seedCompare(a,b,originVisits,pairVisits,visited,lastOrigins,plateau){
  const [aid,ar]=a,[bid,br]=b,ao=measured.byOrigin[ar.origin],bo=measured.byOrigin[br.origin],ap=birthPair(ar),bp=birthPair(br);
  return Number(ao.measured>0)-Number(bo.measured>0)||
   Number(lastOrigins.has(ar.origin))-Number(lastOrigins.has(br.origin))||
   (originVisits.get(ar.origin)||0)-(originVisits.get(br.origin)||0)||
   retained.state(bid,br).traits.size-retained.state(aid,ar).traits.size||
   Number(Boolean(measured.byPair[ap]))-Number(Boolean(measured.byPair[bp]))||
   (pairVisits.get(ap)||0)-(pairVisits.get(bp)||0)||
   plateau(aid).streak-plateau(bid).streak||
   (visited.get(aid)||0)-(visited.get(bid)||0)||
   aid.localeCompare(bid);
 }
 return {...retained,score,seedCompare,researchHint,measured};
}
