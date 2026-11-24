// Shared public registry loader and exact-origin growth view.
// One gzip payload is reused by the existing Soldier and Branch DB screens.
import {inflateArchivedGzip} from "./soldiers/modern/origin-gzip-compat.js";
import {profileWitnessIds} from "./branch-soldier-query.js?v=20261124-origin-coverage-1";
const url=new URL("./data/branch-soldier-results.json.gz",import.meta.url);
let promise;
export function loadBranchSoldierResults(){
 if(!promise)promise=(async()=>{
  const r=await fetch(url,{cache:"no-cache"});
  if(!r.ok)throw Error("통합 원장 HTTP "+r.status);
  const bytes=new Uint8Array(await r.arrayBuffer());
  const db=JSON.parse(new TextDecoder().decode(await inflateArchivedGzip(bytes)));
  if(db.schemaVersion!==1||!db.sourceMetadataSha256||!db.globalEvidence||!db.witnesses||!db.profiles)
   throw Error("통합 원장 형식 불일치");
  return db;
 })();
 return promise;
}
export const routeActionCount=w=>(w?.steps||[]).reduce((s,x)=>s+(x.count??1),0);
const total=w=>w.vector.reduce((a,b)=>a+b,0);
// The global skyline is not sufficient to enumerate an exact origin:
// a route dominated elsewhere may survive under a particular branch.
// Restrict to published origin-bound UNIFIED12 witnesses and never copy
// generic structural calculations or another body's values to this row.
export function buildOriginGrowthIndex(db,modern,keys){
 if(db.sourceMetadataSha256!==modern.meta.source.metadataSha256)
  throw Error("통합 원장과 현재 룰셋 해시 불일치");
 if(keys.length!==db.stats.length||new Set(keys).size!==keys.length||keys.some(k=>!db.stats.includes(k)))
  throw Error("통합 원장 12능력치 불일치");
 const index=new Map(),byId=new Map(modern.profiles.map(p=>[p.id,p]));
 const branches=new Map(db.branches.map(b=>[b.id,b]));
 const valid=w=>w?.source==="UNIFIED12"&&w.actualGameCertified===false&&
  Array.isArray(w.vector)&&w.vector.length===keys.length&&w.vector.every(Number.isSafeInteger)&&
  Array.isArray(w.steps)&&w.steps.every(s=>typeof s.id==="string"&&Number.isSafeInteger(s.count??1)&&(s.count??1)>0)&&
  w.branchIds?.some(id=>branches.has(id)&&!branches.get(id).sourceRootConflict);
 const idsByProfile=new Map();
 const idsFor=pid=>{
  if(!idsByProfile.has(pid))idsByProfile.set(pid,profileWitnessIds(db,pid));
  return idsByProfile.get(pid);
 };
 const order=(a,b)=>total(b.w)-total(a.w)||routeActionCount(a.w)-routeActionCount(b.w)||a.id.localeCompare(b.id);
 const longOrder=(a,b)=>routeActionCount(b.w)-routeActionCount(a.w)||order(a,b);
 for(const c of db.combos){
  const globalPid=db.globalEvidence[c.classKey]?.unifiedByBody?.[c.body];
  const globalIds=new Set(idsFor(globalPid));
  const pids=new Set(db.branches.filter(b=>!b.sourceRootConflict).map(b=>b.evidence?.[c.classKey]?.unifiedByBody?.[c.body]).filter(Boolean));
  const ids=new Set(globalIds);
  for(const pid of pids)for(const id of idsFor(pid))ids.add(id);
  const byOrigin=new Map();
  for(const id of ids){
   const w=db.witnesses[id];
   if(!valid(w)||w.body!==c.body||w.classKey!==c.classKey||
      byId.get(w.originProfile)?.soldierType!==c.body)continue;
   if(!byOrigin.has(w.originProfile))byOrigin.set(w.originProfile,[]);
   byOrigin.get(w.originProfile).push({id,w});
  }
  for(const [profileId,own] of byOrigin){
   own.sort(order);
   const best=own[0],longest=[...own].sort(longOrder)[0];
   const stats=Object.fromEntries(keys.map(k=>[k,best.w.vector[db.stats.indexOf(k)]]));
   const parentIds=new Set(own.flatMap(({w})=>w.branchIds.filter(id=>branches.has(id)&&!branches.get(id).sourceRootConflict)));
   const row={profileId,combo:c.id,body:c.body,route:best.id,steps:routeActionCount(best.w),
    longestRoute:longest.id,longestSteps:routeActionCount(longest.w),
    representativeCount:own.length,branchCount:parentIds.size,
    additionalBranchRepresentatives:own.filter(({id})=>!globalIds.has(id)).length,
    stats,total:total(best.w),trainingIds:[...new Set(own.flatMap(({w})=>w.steps.map(x=>x.id)))],
    source:"UNIFIED12"};
   const old=index.get(profileId);
   if(!old||row.total>old.total)index.set(profileId,row);
  }
 }
 return index;
}
// Data-driven status: never encode a particular worker's report count in HTML.
export function registryCoverage(db,index,originCount){
 const summary=db.summary||{},u=summary.unifiedCap||{};
 const continuation=Object.values(summary.continuationCap?.classMetrics||{});
 return {branches:db.branches.length,witnesses:Object.keys(db.witnesses).length,
  conditionalPaths:u.conditionalPaths??null,unifiedDepth:u.highestDepth??null,
  structuralDepth:continuation.length?Math.max(...continuation.map(x=>x.maxSequenceLength||0)):null,
  updatedOrigins:index.size,originCount,
  budgetCandidates:summary.budgetCheckpoints?.witnessesAdded??0,
  originRepresentatives:[...index.values()].reduce((n,x)=>n+x.representativeCount,0),
  extraBranchRepresentatives:[...index.values()].reduce((n,x)=>n+x.additionalBranchRepresentatives,0)};
}
