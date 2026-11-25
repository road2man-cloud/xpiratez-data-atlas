import {statKeys,filterRows,sum} from './branch-soldier-atlas-career-core.js?v=37-discovery-unified';
// One row is one recorded route, never a synthetic maximum assembled from other rows.
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
export function filterTable(rows,f,context){
 const {profiles,branches,names,selected}=context;
 const name=id=>names[id]||id||'',origin=id=>profiles.get(id)?.sourceKoName||profiles.get(id)?.sourceEnName||id;
 const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ko-KR');
 const tokens=norm(f.q).trim().split(/\s+/).filter(Boolean);
 const pair=new Set([f.a,f.b].filter(Boolean));
 const chosen=filterRows(rows,{...f,branch:pair.size?'':f.branch,body:'',branchCaptains:context.branchCaptains});
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
