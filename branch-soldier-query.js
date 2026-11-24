// Query the one published registry. No synthesized soldier, cross-model
// dominance or assumed compatibility. All support is exact profile membership.
export function modelProfiles(db,c,mode,branch=null){
 const e=branch?branch.evidence?.[c.classKey]:db.globalEvidence?.[c.classKey];
 const p=branch?branch.results?.[c.id]?.[mode]:db.global?.[c.id]?.[mode];
 const out=[["통합 육성 상계 · 12능력치",e?.unifiedByBody?.[c.body]],
  ["시술 조건 검사 · 12능력치",p],
  ["구조적 후속 확장 · 12능력치",e?.continuationByBody?.[c.body]?.[mode]]];
 if(c.id==="D_W"||c.id==="M_M")out.push(["동일 연구 이력 · 8능력치",e?.sameHistory],["원천 호환 상단 · 8능력치",e?.sourceUpper]);
 if(db.summary?.careerConditional)out.push(["계급·훈장 조건부 · 12능력치",e?.careerConditionalByBody?.[c.body]]);
 return out;
}
export function profileWitnessIds(db,id){
 const p=db.profiles[id];
 if(!p)return [];
 return [...new Set([...(p.frontier||[]),...(p.best||[]),...(p.resourceCandidates||[]),...(p.statFeeFrontier||[]),...(p.resourceGoalCandidates||[]),
  ...Object.values(p.frontierTies||{}).flat()].filter(x=>x&&db.witnesses[x]))];
}
export function matchesTargets(w,targets){
 return targets.every(([i,min])=>Number.isFinite(w.vector[i])&&w.vector[i]>=min);
}
export function parseTargets(stats,values){
 const result=[];
 for(let i=0;i<stats.length;i++){
  const text=String(values[i]??"").trim();
  if(!text)continue;
  const n=Number(text);
  if(!Number.isSafeInteger(n)||n<0)throw Error("목표 능력치는 0 이상의 정수여야 합니다.");
  result.push([i,n]);
 }
 return result;
}
// A profile is indexed once even when hundreds of parent rows share it.
// Scope is a set of canonical branch IDs, not rank or a union of stat maxima.
export function buildBranchRouteIndex(db,c,mode){
 const columns=modelProfiles(db,c,mode).map(([label,globalId])=>({label,globalId,byProfile:new Map()}));
 const branchMap=new Map(db.branches.map(b=>[b.id,b]));
 const profileCache=new Map(),membership=new Map();
 for(const b of db.branches){
  modelProfiles(db,c,mode,b).forEach(([,pid],i)=>{
   if(!pid||!db.profiles[pid])return;
   let ids=columns[i].byProfile.get(pid);
   if(!ids)columns[i].byProfile.set(pid,ids=new Set());
   ids.add(b.id);
  });
 }
 function routes(pid){
  if(!profileCache.has(pid))profileCache.set(pid,profileWitnessIds(db,pid));
  return profileCache.get(pid);
 }
 for(const col of columns)for(const [pid,parents] of col.byProfile){
  for(const id of routes(pid)){
   if(!membership.has(id))membership.set(id,new Map());
   membership.get(id).set(pid,parents);
  }
 }
 const supportCache=new Map();
 function supportFor(id){
  if(!supportCache.has(id)){
   const parents=new Set();
   for(const ids of membership.get(id)?.values()||[])for(const b of ids)parents.add(b);
   supportCache.set(id,[...parents].sort((a,b)=>branchMap.get(a).rank-branchMap.get(b).rank));
  }
  return supportCache.get(id);
 }
 function scope(branchIds,{includeGlobal=false}={}){
  const allowed=new Set(branchIds),all=allowed.size===branchMap.size;
  const activeProfiles=new Map(),resultColumns=[],statFeeIds=new Set();
  for(const col of columns){
   const ids=new Set(),covered=new Set(),usedProfiles=[];
   for(const [pid,parents] of col.byProfile){
    const relevant=all?parents:new Set([...parents].filter(b=>allowed.has(b)));
    if(!relevant.size)continue;
    usedProfiles.push(pid);activeProfiles.set(pid,relevant);
    for(const b of relevant)covered.add(b);
    for(const w of routes(pid))ids.add(w);
    for(const w of db.profiles[pid].statFeeFrontier||[])if(db.witnesses[w])statFeeIds.add(w);
   }
   // Global representative witnesses may not have the same exact ID as
   // the per-parent witnesses; never invent a parent for those.
   if(includeGlobal&&all&&col.globalId){
    for(const w of routes(col.globalId))ids.add(w);
    for(const w of db.profiles[col.globalId]?.statFeeFrontier||[])if(db.witnesses[w])statFeeIds.add(w);
   }
   const best=db.stats.map((_,i)=>{
    let winner=null;
    for(const id of ids){
     const v=db.witnesses[id].vector[i];
     if(!Number.isFinite(v))continue;
     if(winner===null||v>db.witnesses[winner].vector[i])winner=id;
    }
    return winner;
   });
   resultColumns.push({label:col.label,ids:[...ids],best,profiles:usedProfiles,
    coveredBranches:covered.size,globalId:includeGlobal&&all?col.globalId:null});
  }
  const ids=[...new Set(resultColumns.flatMap(col=>col.ids))];
  function matchingBranches(routeIds){
   // Work per profile, not per path x per parent. This preserves exact
   // membership when there are many equal numerical vectors.
   const seenProfiles=new Set(),parents=new Set();
   for(const id of routeIds)for(const pid of membership.get(id)?.keys()||[]){
    if(seenProfiles.has(pid)||!activeProfiles.has(pid))continue;
    seenProfiles.add(pid);
    for(const b of activeProfiles.get(pid))parents.add(b);
   }
   return [...parents].sort((a,b)=>branchMap.get(a).rank-branchMap.get(b).rank);
  }
  return {columns:resultColumns,ids,statFeeIds,branchCount:allowed.size,matchingBranches,
   supportFor:id=>supportFor(id).filter(b=>allowed.has(b))};
 }
 return {scope,supportFor,branchMap};
}
