import {statKeys,filterRows,sum,routeObjective,routeThreshold,filterCareerRequirements} from './branch-soldier-atlas-career-core.js?v=43-research';
// One row is one recorded route, never a synthetic maximum assembled from other rows.
// Select a single witness for each body under the selected objective. Keep independent
// ceilings separate: they may come from a different conditional model or route.
export function bodyCareerSummary(bodies,rows,{stat='total',metric='cap',branch='',q='',family='',profiles=new Map(),names={}}={}){
 const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ko-KR');
 const tokens=norm(q).trim().split(/\s+/).filter(Boolean);
 const name=id=>names[id]||id||'';
 const originText=id=>{const p=profiles.get(id);return [id,p?.sourceKoName,p?.sourceEnName,p?.soldierKoName].filter(Boolean).join(' ')};
 const matches=s=>tokens.every(t=>norm(s).includes(t));
 const score=r=>routeObjective(r,metric,stat);
 const byBody=new Map();
 for(const r of rows){
  if(branch&&r.branch!==branch)continue;
  if(!byBody.has(r.body))byBody.set(r.body,[]);
  byBody.get(r.body).push(r);
 }
 const result=[];
 for(const b of bodies){
  if(family&&b.id!==family)continue;
  const bodyText=[b.id,b.name].join(' '),bodyMatch=matches(bodyText);
  const candidates=(byBody.get(b.id)||[]).filter(r=>bodyMatch||matches([bodyText,originText(r.origin),r.branch,r.id,...r.order.flatMap(t=>[t,name(t)]),...(r.traits||[]).flatMap(t=>[t,name(t)])].join(' ')));
  const legacy=(b.candidates||[]).filter(r=>bodyMatch||matches([bodyText,originText(r.originProfile),r.route].join(' ')));
  if(!bodyMatch&&!candidates.length&&!legacy.length)continue;
  // Objective, then full-vector total, then stable identifier. No cross-row maxima.
  const best=candidates.filter(r=>Number.isFinite(score(r))).reduce((a,r)=>!a||score(r)>score(a)||score(r)===score(a)&&(sum(r[metric])>sum(a[metric])||sum(r[metric])===sum(a[metric])&&r.key.localeCompare(a.key)<0)?r:a,null);
  const independent=Object.fromEntries(statKeys.map(k=>[k,null]));
  for(const r of candidates)for(const [j,k] of statKeys.entries()){
   const value=r[metric][j];if(!independent[k]||value>independent[k].value)independent[k]={value,career:r};
  }
  // Legacy registry values are conditional growth ceilings only, not current stats.
  if(metric==='cap')for(const r of legacy)for(const k of statKeys){
   const value=r.stats?.[k];if(Number.isFinite(value)&&(!independent[k]||value>independent[k].value))independent[k]={...r,value};
  }
  result.push({id:b.id,name:b.name,best,independent,count:candidates.length,originCount:new Set(candidates.map(r=>r.origin)).size,legacyCount:legacy.length});
 }
 return result.sort((a,b)=>(b.best?score(b.best):-Infinity)-(a.best?score(a.best):-Infinity)||a.name.localeCompare(b.name,'ko'));
}

// Shared branch/body index. Restrict before selecting representatives, not after.
export function indexCareerBranches(rows){
 const byBranch=new Map();
 for(const r of rows){
  if(!byBranch.has(r.branch))byBranch.set(r.branch,[]);
  byBranch.get(r.branch).push(r);
 }
 return byBranch;
}
export function branchCareerRows(index,branch,filters={},context={}){
 return filterCareerRequirements(filterStatMinimums(filterRows(index.get(branch)||[],{...filters,branch}),filters.minima,filters.metric||'cap'),filters,context);
}
export function rowsWithMissingOrigins(rows,profiles){
 const known=new Set(rows.map(r=>r.origin));
 return [...rows,...profiles.filter(p=>!known.has(p.id)).map(p=>({key:'missing:'+p.id,id:null,origin:p.id,body:null,branch:null,source:null,order:[],traits:null,rank:null,medals:null,difficulties:[],current:null,cap:null,certified:false,missing:true}))];
}
export function statValue(r,k,metric,profiles){
 if(metric==='birthMin'||metric==='birthMax'){
  const p=profiles.get(r.origin),stats=p?.effectiveStats?.[metric==='birthMin'?'min':'max'];
  if(k==='total'){const vs=statKeys.map(s=>stats?.[s]);return vs.every(Number.isFinite)?sum(vs):null;}
  return Number.isFinite(stats?.[k])?stats[k]:null;
 }
 const v=r[metric];if(!Array.isArray(v))return null;
 const i=statKeys.indexOf(k);
 return k==='total'?sum(v):i>=0?v[i]:null;
}
// Minima are conjunctive constraints on the displayed vector of one row.
export const minimumStatKeys=Object.freeze([...statKeys,'total']);
export function normalizeStatMinimums(minima={}){
 return Object.fromEntries(minimumStatKeys.flatMap(k=>{
  const v=routeThreshold(minima?.[k]);return v===null?[]:[[k,v]];
 }));
}
export function readStatMinimums(params){
 return normalizeStatMinimums(Object.fromEntries(minimumStatKeys.map(k=>[k,params.get('min_'+k)])));
}
export function writeStatMinimums(params,minima){
 for(const k of minimumStatKeys)params.delete('min_'+k);
 for(const [k,v] of Object.entries(normalizeStatMinimums(minima)))params.set('min_'+k,String(v));
 return params;
}
export function filterStatMinimums(rows,minima,metric='cap',profiles=new Map()){
 const entries=Object.entries(normalizeStatMinimums(minima));
 if(!entries.length)return rows;
 return rows.filter(r=>entries.every(([k,min])=>{
  const value=statValue(r,k,metric,profiles);
  return Number.isFinite(value)&&value>=min;
 }));
}
export function filterTable(rows,f,context){
 const {profiles,branches,names,selected}=context;
 const name=id=>names[id]||id||'',origin=id=>profiles.get(id)?.sourceKoName||profiles.get(id)?.sourceEnName||id;
 const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ko-KR');
 const tokens=norm(f.q).trim().split(/\s+/).filter(Boolean);
 const pair=new Set([f.a,f.b].filter(Boolean));
 const chosen=filterCareerRequirements(filterStatMinimums(filterRows(rows,{...f,branch:pair.size?'':f.branch,body:'',branchCaptains:context.branchCaptains}),f.minima,f.metric||'cap',profiles),f,context);
 return chosen.filter(r=>{
  if(pair.size&&!pair.has(r.branch))return false;
  if(f.body&&(r.body!==f.body))return false;
  if(f.missingOnly&&!r.missing)return false;
  if(f.fixedOptimumOnly&&!r.fixedModelOptimum)return false;
  if(f.transitionBreakthroughOnly&&!(r.researchTransition?.exceededAxes>0))return false;
  if(f.jointOnly&&!r.jointResearch)return false;
  if(f.jointAppliedOnly&&!(r.jointResearch?.applied.length>=2))return false;
  if(f.losslessTraitOnly&&!r.retention?.lossless)return false;
  if(f.jointRetainedOnly&&!(r.jointResearch?.retainedApplied?.length>=2))return false;
  if(f.resetRecoveryOnly&&!(r.resetRecovery?.netSinceReset>0))return false;
  if(f.researchDiscoveryOnly&&!r.researchDiscovery)return false;
  if(f.selectedOnly&&!selected.has(r.key))return false;
  if(!tokens.length)return true;
  const b=branches.get(r.branch),p=profiles.get(r.origin);
  const hay=norm([r.id,r.origin,origin(r.origin),p?.soldierKoName,p?.soldierEnName,r.body,name(r.body),r.branch,b?.rank,...(b?.captain||[]).flatMap(i=>[i,name(i)]),...Object.values(b?.choices||{}).flatMap(i=>[i,name(i)]),...r.order.flatMap(i=>[i,name(i)]),...(r.traits||[]).flatMap(i=>[i,name(i)]),...(r.requiredResearch||[]).flatMap(i=>[i,name(i)]),...(p?.requires||[]).flatMap(i=>[i,name(i)]),...Object.keys(p?.acquisitionRequiredItems||{}).flatMap(i=>[i,name(i)])].join(' '));
  return tokens.every(t=>hay.includes(t));
 });
}
export function columnValue(r,col,metric,{profiles,branches,names}){
 const b=branches.get(r.branch),p=profiles.get(r.origin),name=id=>names[id]||id||'';
 if(col==='total'||statKeys.includes(col))return statValue(r,col,metric,profiles);
 switch(col){
 case 'origin':return p?.sourceKoName||p?.sourceEnName||r.origin;
 case 'body':return r.body?name(r.body):null;
 case 'captain':return b?b.captain.map(name).join(' → '):null;
 case 'branch':return b?.rank??null;
 case 'path':case 'cause':case 'queen':case 'codex':return b?.choices[col]?name(b.choices[col]):null;
 case 'depth':return r.missing?null:r.order.length;
 case 'traitCount':return r.traits?.length??null;
 case 'difficulty':return r.difficulties.length?r.difficulties.join(', '):null;
 case 'blocked':return b?.blockedResearch?.length??null;
 case 'rank':return r.rank??null;
 case 'source':return r.source;
 case 'status':return r.missing?'미등록':r.certified?'인증':r.fixedModelOptimum?'고정 연구 모형 상계 도달':r.jointResearch?.applied.length>=2?'공동 연구·복수 시술':r.researchTransition?.exceededAxes>0?'연구 전 상계 초과':r.conditionalScopeComplete?'조건부 종결':'조건부';
 default:return null;
 }
}
export function sortTable(rows,col,dir,metric,context){
 const sign=dir==='asc'?1:-1;
 return rows.map(r=>({r,v:columnValue(r,col,metric,context)})).sort((a,b)=>{
  if(a.v==null||b.v==null){if(a.v==null&&b.v!=null)return 1;if(a.v!=null&&b.v==null)return -1;}
  else{const d=typeof a.v==='number'&&typeof b.v==='number'?a.v-b.v:String(a.v).localeCompare(String(b.v),'ko',{numeric:true});if(d)return d*sign;}
  return a.r.key.localeCompare(b.r.key);
 }).map(x=>x.r);
}
