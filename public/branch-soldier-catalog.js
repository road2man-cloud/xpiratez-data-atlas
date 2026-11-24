// Shared public registry loader and exact-origin growth view.
// One gzip payload is reused by the existing Soldier and Branch DB screens.
import {inflateArchivedGzip} from "./soldiers/modern/origin-gzip-compat.js";
import {profileWitnessIds} from "./branch-soldier-query.js?v=20261124-unified-maxima-1";
import {independentMaxima,registryCandidate,groupBodyMaxima,evidencePriority} from "./branch-soldier-maxima.js";
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
// Derive the depth selector from the actual registry, including repeat counts.
// A worker extending the registry never needs a corresponding HTML edit.
export function registeredRouteDepths(db){
 return [...new Set([0,...Object.values(db.witnesses).map(routeActionCount).filter(n=>Number.isSafeInteger(n)&&n>=0)])].sort((a,b)=>a-b);
}
const total=w=>w.vector.reduce((a,b)=>a+b,0);
// The global skyline is not sufficient to enumerate an exact origin:
// a route dominated elsewhere may survive under a particular branch.
// Restrict to published origin-bound UNIFIED12 witnesses and never copy
// generic structural calculations or another body's values to this row.
export function buildOriginGrowthIndex(db,modern,keys,{branchId=null}={}){
 if(db.sourceMetadataSha256!==modern.meta.source.metadataSha256)
  throw Error("통합 원장과 현재 룰셋 해시 불일치");
 if(keys.length!==db.stats.length||new Set(keys).size!==keys.length||keys.some(k=>!db.stats.includes(k)))
  throw Error("통합 원장 12능력치 불일치");
 const index=new Map(),byId=new Map(modern.profiles.map(p=>[p.id,p]));
 const branches=new Map(db.branches.map(b=>[b.id,b]));
 const valid=w=>["UNIFIED12","CAREER12"].includes(w?.source)&&w.actualGameCertified===false&&
  Array.isArray(w.vector)&&w.vector.length===keys.length&&w.vector.every(Number.isSafeInteger)&&
  Array.isArray(w.steps)&&w.steps.every(s=>typeof s.id==="string"&&Number.isSafeInteger(s.count??1)&&(s.count??1)>0)&&
  w.branchIds?.some(id=>(!branchId||id===branchId)&&branches.has(id)&&!branches.get(id).sourceRootConflict);
 const idsByProfile=new Map();
 const idsFor=pid=>{
  if(!idsByProfile.has(pid))idsByProfile.set(pid,profileWitnessIds(db,pid));
  return idsByProfile.get(pid);
 };
 const order=(a,b)=>total(b.w)-total(a.w)||routeActionCount(a.w)-routeActionCount(b.w)||a.id.localeCompare(b.id);
 const longOrder=(a,b)=>routeActionCount(b.w)-routeActionCount(a.w)||order(a,b);
 for(const c of db.combos){
  const profileIds=e=>[e?.unifiedByBody?.[c.body],e?.careerConditionalByBody?.[c.body]].filter(Boolean);
  const globalIds=new Set(branchId?[]:profileIds(db.globalEvidence[c.classKey]).flatMap(idsFor));
  const pids=new Set(db.branches.filter(b=>!b.sourceRootConflict&&(!branchId||b.id===branchId)).flatMap(b=>profileIds(b.evidence?.[c.classKey])));
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
    maxima:independentMaxima(keys,own.map(({id})=>registryCandidate(db,id,c.id))),
    source:best.w.source};
   const old=index.get(profileId);
   if(!old)index.set(profileId,row);
   else{
    const combined=independentMaxima(keys,[old,row].flatMap(x=>Object.entries(x.maxima).filter(([,v])=>v).map(([k,v])=>({...v,stats:{[k]:v.value}}))));
    const representative=row.total>old.total?row:old;
    const long=row.longestSteps>old.longestSteps?row:old;
    index.set(profileId,{...representative,maxima:combined,longestSteps:long.longestSteps,longestRoute:long.longestRoute,
     representativeCount:old.representativeCount+row.representativeCount,trainingIds:[...new Set([...old.trainingIds,...row.trainingIds])]});
   }
  }
 }
 return index;
}
// All final body rows, including transformations and shared terminal bodies.
export function buildBodyGrowthIndex(db,modern,keys,records=[],isCompatible=()=>false,{branchId=null}={}){
 if(db&&db.sourceMetadataSha256!==modern.meta.source.metadataSha256)throw Error("통합 원장 해시 불일치");
 const candidates=[],origins=new Set(modern.profiles.map(p=>p.id));
 if(!branchId)for(const r of records)for(const c of r.candidates||[]){
  if(!isCompatible(c)||c.growth?.kind!=="conditional-upper-envelope"||!keys.every(k=>Number.isSafeInteger(c.growth.stats?.[k])))continue;
  candidates.push({route:c.id,source:"ORIGIN",priority:evidencePriority("ORIGIN"),body:c.finalSoldierType,originProfile:r.profileId,stats:c.growth.stats,steps:c.transforms?.length??0});
 }
 if(db){
  const branches=new Set(db.branches.filter(b=>!b.sourceRootConflict&&(!branchId||b.id===branchId)).map(b=>b.id));
  const seen=new Set();
  for(const c of db.combos){
   const get=e=>[e?.unifiedByBody?.[c.body],e?.careerConditionalByBody?.[c.body]].filter(Boolean);
   const pids=new Set([...(!branchId?get(db.globalEvidence?.[c.classKey]):[]),...db.branches.filter(b=>branches.has(b.id)).flatMap(b=>get(b.evidence?.[c.classKey]))]);
   for(const pid of pids)for(const id of profileWitnessIds(db,pid)){
    if(seen.has(id))continue;
    const w=db.witnesses[id];
    if(!["UNIFIED12","CAREER12"].includes(w?.source)||w.actualGameCertified!==false||w.body!==c.body||w.classKey!==c.classKey||!origins.has(w.originProfile)||!w.branchIds?.some(b=>branches.has(b))||!keys.every(k=>Number.isSafeInteger(w.vector[db.stats.indexOf(k)])))continue;
    seen.add(id);candidates.push({...registryCandidate(db,id,c.id),steps:routeActionCount(w)});
   }
  }
 }
 return groupBodyMaxima(keys,modern.soldiers,candidates);
}
// Data-driven status: never encode a particular worker's report count in HTML.
export function registryCoverage(db,index,originCount){
 const summary=db.summary||{},u=summary.unifiedCap||{};
 const continuation=Object.values(summary.continuationCap?.classMetrics||{});
 return {branches:db.branches.length,witnesses:Object.keys(db.witnesses).length,
  conditionalPaths:u.conditionalPaths??null,unifiedDepth:u.highestDepth??null,
  careerPaths:summary.careerConditional?.conditionalPaths??0,careerDepth:summary.careerConditional?.highestDepth??null,
  structuralDepth:continuation.length?Math.max(...continuation.map(x=>x.maxSequenceLength||0)):null,
  updatedOrigins:index.size,originCount,
  budgetCandidates:summary.budgetCheckpoints?.witnessesAdded??0,
  originRepresentatives:[...index.values()].reduce((n,x)=>n+x.representativeCount,0),
  extraBranchRepresentatives:[...index.values()].reduce((n,x)=>n+x.additionalBranchRepresentatives,0)};
}
