// Shared public registry loader and exact-origin growth view.
// One gzip payload is reused by the existing Soldier and Branch DB screens.
import {inflateArchivedGzip} from "./soldiers/modern/origin-gzip-compat.js";
const url=new URL("./data/branch-soldier-results.json.gz?v=20261124-cap-4327",import.meta.url);
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
const depth=w=>w.steps.reduce((s,x)=>s+(x.count||1),0);
const total=w=>w.vector.reduce((a,b)=>a+b,0);
// Only action-replayed UNIFIED12 cap models bound to the exact origin
// and original final body are promoted to its existing origin row.
// Other bodies remain selectable in the same registry, not silently merged.
export function buildOriginGrowthIndex(db,modern,keys){
 if(db.sourceMetadataSha256!==modern.meta.source.metadataSha256)
  throw Error("통합 원장과 현재 룰셋 해시 불일치");
 if(keys.length!==db.stats.length||keys.some(k=>!db.stats.includes(k)))
  throw Error("통합 원장 12능력치 불일치");
 const index=new Map(),byId=new Map(modern.profiles.map(p=>[p.id,p]));
 const valid=w=>w?.source==="UNIFIED12"&&w.actualGameCertified===false&&w.vector.length===keys.length&&w.vector.every(Number.isSafeInteger)&&Array.isArray(w.steps)&&w.branchIds?.length;
 for(const c of db.combos){
  const pid=db.globalEvidence[c.classKey]?.unifiedByBody?.[c.body],p=db.profiles[pid];
  if(!p?.frontier?.length)continue;
  const ids=[...new Set([...p.frontier,...(p.best||[]),...Object.values(p.frontierTies||{}).flat()])];
  const candidates=ids.map(id=>({id,w:db.witnesses[id]})).filter(({w})=>valid(w)&&w.body===c.body&&byId.get(w.originProfile)?.soldierType===c.body);
  for(const profileId of new Set(candidates.map(({w})=>w.originProfile))){
   const own=candidates.filter(({w})=>w.originProfile===profileId).sort((a,b)=>total(b.w)-total(a.w)||depth(a.w)-depth(b.w)||a.id.localeCompare(b.id));
   if(!own.length)continue;
   const best=own[0],longest=[...own].sort((a,b)=>depth(b.w)-depth(a.w)||total(b.w)-total(a.w)||a.id.localeCompare(b.id))[0];
   const stats=Object.fromEntries(keys.map(k=>[k,best.w.vector[db.stats.indexOf(k)]]));
   const row={profileId,combo:c.id,body:c.body,route:best.id,steps:depth(best.w),longestRoute:longest.id,
    longestSteps:depth(longest.w),conditionalPaths:p.conditionalPaths,stats,total:keys.reduce((n,k)=>n+stats[k],0),
    trainingIds:best.w.steps.map(x=>x.id),source:"UNIFIED12"};
   const old=index.get(profileId);
   if(!old||row.total>old.total)index.set(profileId,row);
  }
 }
 return index;
}
