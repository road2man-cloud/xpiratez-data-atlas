// Shared independent maxima projection. Every cell retains its own route and
// evidence. Never sum this vector or use it as a Pareto witness.
export function independentMaxima(keys, candidates) {
 const result=Object.fromEntries(keys.map(k=>[k,null]));
 for(const c of candidates){
  for(const k of keys){
   const value=c.stats?.[k];
   if(!Number.isFinite(value))continue;
   const old=result[k];
   if(!old||value>old.value||value===old.value&&(c.priority??9)<(old.priority??9))
    result[k]={value,route:c.route,source:c.source,priority:c.priority??9,body:c.body??null,combo:c.combo??null,originProfile:c.originProfile??null};
  }
 }
 return result;
}
export const evidenceLabel=source=>({
 UNIFIED12:"연구·시술 연결 조건부",CAREER12:"계급·훈장·후속 시술 미재생",
 GATE12:"시술 조건 모델",CONTINUATION12:"구조적 후속 상계",
 SOURCE8:"연구 원천 상계",REPLAY8:"동일 연구 이력",ORIGIN:"출생처 등록 경로",ORIGINCAP12:"전체 출생처 시간순 성장 상계",ORIGINEXT12:"활성 연구 후속 시술 조건부",POPEXT12:"모집·이벤트 연대기 후속 시술 조건부",POPRESEARCH12:"모집 후 추가 연구·시술 연대기 조건부",POPRESEARCHCHAIN12:"모집 후 연구·연속 시술 조건부",POPGROW12:"모집·연구·중간 성장 재생 조건부",POPCHCAREER12:"시간순 모집·성장·계급·훈장 조건부 (훈장 제외)",POPRCAREER12:"모집 후 추가 연구·성장·계급·훈장 조건부 (훈장 제외)",POPNEWPAIR12:"신규 조합 모집·전투캡 성장 조건부",POPNEWCAREER12:"신규 조합 모집 후 연구·성장·시술 조건부"
})[source]||source;
export const evidencePriority=source=>({UNIFIED12:0,POPEXT12:1,POPRESEARCH12:1,POPRESEARCHCHAIN12:1,POPGROW12:1,POPCHCAREER12:1,POPRCAREER12:1,POPNEWPAIR12:1,POPNEWCAREER12:1,ORIGINEXT12:1,ORIGINCAP12:1,ORIGIN:2,CAREER12:2,GATE12:3,REPLAY8:4,CONTINUATION12:5,SOURCE8:6})[source]??9;
export function registryCandidate(db,id,combo=null){
 const w=db.witnesses[id];if(!w)return null;
 return {route:id,source:w.source,body:w.body,combo,originProfile:w.originProfile??null,priority:evidencePriority(w.source),
  stats:Object.fromEntries(db.stats.map((k,i)=>[k,w.vector[i]]))};
}
export function originMaxima(keys,record,legacy,registered){
 const candidates=legacy.filter(c=>c.growth?.kind==="conditional-upper-envelope"&&keys.every(k=>Number.isSafeInteger(c.growth.stats?.[k])))
  .map(c=>({route:c.id,source:"ORIGIN",priority:evidencePriority("ORIGIN"),stats:c.growth.stats,body:c.finalSoldierType??null,originProfile:record.profileId}));
 // Reuse all previously selected independent winners, not the highest-total route.
 for(const [k,c] of Object.entries(registered?.maxima||{}))if(c)candidates.push({...c,stats:{[k]:c.value}});
 const maxima=independentMaxima(keys,candidates);
 return {maxima,stats:Object.fromEntries(keys.map(k=>[k,maxima[k]?.value??null]))};
}
// Species rows are keyed by the actual final body, never the birth label.
// A representative total is taken from a single route, separately from maxima.
export function groupBodyMaxima(keys,soldiers,candidates){
 const groups=new Map(soldiers.map(s=>[s.id,{id:s.id,name:s.koName||s.id,candidates:[]}]));
 for(const c of candidates)if(groups.has(c.body))groups.get(c.body).candidates.push(c);
 return [...groups.values()].map(g=>{
  const maxima=independentMaxima(keys,g.candidates);
  let best=null;
  for(const c of g.candidates){
   if(!keys.every(k=>Number.isFinite(c.stats?.[k])))continue;
   const total=keys.reduce((n,k)=>n+c.stats[k],0);
   if(!best||total>best.total||total===best.total&&c.priority<best.priority)best={...c,total};
  }
  return {...g,maxima,best,originCount:new Set(g.candidates.map(c=>c.originProfile).filter(Boolean)).size};
 });
}
