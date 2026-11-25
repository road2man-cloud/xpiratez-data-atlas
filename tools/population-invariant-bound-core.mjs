// Inductive integer-box invariant for the indexed single-soldier stat model.
// Relax research, rank, medal, status, and resource gates. Retain raw upper
// gates and proven repetition budgets. Include random rolls. Never identify an upper box
// with an achievable vector. All 12 coordinates are independent bounds.
import assert from "node:assert/strict";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
const fields=["flatOverallStatChange","flatMin","flatMax","percentOverallStatChange","percentMin","percentMax","percentGainedStatChange","percentGainedMin","percentGainedMax"];
const floor=k=>k==="health"?1:0;
const integer=(x,where)=>{assert(Number.isSafeInteger(x),where);return x;};
const n=(o,k)=>integer(o?.[k]??0,"Noninteger indexed stat "+k);
const max=(...a)=>Math.max(...a);
const min=(...a)=>Math.min(...a);
const value=(x,p)=>Math.trunc(x*p/100);
const rangeMax=(x,lo,hi)=>max(value(x,lo),value(x,hi));
export function buildInvariantModel(data){
 const bodies=new Map(data.soldiers.map(b=>[b.id,b]));
 // STR_UNAVAILABLE is explicitly excluded in eligibility.js; no other
 // research gate is used. Item-producing/retired branches cannot continue.
 const rules=data.transformations.filter(r=>!r.requires.includes("STR_UNAVAILABLE")&&!r.producedItem);
 assert(rules.every(r=>!r.createsClone),"Clone initial-stat semantics require another model");
 assert(rules.every(r=>!r.includeBonusesForMaxStats),"Bonus upper gate requires raw-domain adjustment");
 const byBody=new Map(),bonusMap=new Map();
 for(const b of data.bonuses)if(!bonusMap.has(b.id))bonusMap.set(b.id,b.stats||{});
 for(const r of rules){
  for(const f of fields)for(const k of STAT_KEYS)n(r[f],k);
  for(const from of r.allowedSoldierTypes||[]){
   if(r.forbiddenSoldierTypes?.includes(from))continue;
   const to=r.producedSoldierType||from;
   assert(bodies.has(from)&&bodies.has(to),"Unknown body");
   const a=byBody.get(from)||[];a.push({rule:r,to});byBody.set(from,a);
  }
 }
 // Any SoldierBonus ID that can be added by a transformation or a medal.
 // Union of positive contributions only; ignore mutual exclusions/removals.
 const medals=new Set(Object.entries(data.commendationIndex||{}).flatMap(([id,v])=>id==="STR_MEDAL_WEAPON_PROFICIENCY_NAME"?[]:(v.bonusLevels||[])).filter(Boolean));
 const growth=b=>STAT_KEYS.map(k=>max(n(b.statCaps,k),n(b.trainingStatCaps,k),n(b.maxStats,k),floor(k)));
 const metrics={scalarTables:0,scalarEvaluations:0,scalarLookups:0,relaxations:0,queuePops:0,proofEdges:0,proofCoordinates:0};
 const tables=new Map();
 // Exact scan of the relaxed current-stat domain. Initial values use
 // independent endpoint maxima for each gained-percent term (conservative
 // even when their signs differ). Random coefficient endpoints are enough
 // for each term at a fixed input; no joint attainability is asserted.
 function scalarTable(from,edge,k,iniLo,iniHi,needed){
  const r=edge.rule,to=bodies.get(edge.to);
  const id=JSON.stringify([from,r.id,k,iniLo,iniHi]);
  let t=tables.get(id);
  if(t&&t.arr.length>needed-t.lo+1)return t;
  const upper=integer(r.requiredMaxStats?.[k]??9999,"Invalid upper gate");
  const lo=floor(k);
  assert(upper>=lo&&upper<=100000,"Unsupported gate domain");
  const soft=Number(r.upperBoundType)===1||((r.upperBoundType==null||Number(r.upperBoundType)===0)&&from===edge.to);
  const cap=r.upperBoundAtMaxStats?n(to.maxStats,k):r.upperBoundAtStatCaps?n(to.statCaps,k):null;
  if(!t){t={upper,lo,arr:[-Infinity]};tables.set(id,t);metrics.scalarTables++;}
  const arr=t.arr;
  let best=arr[arr.length-1];
  for(let x=lo+arr.length-1;x<=min(upper,needed);x++){
   let y;
   if(r.rerollStats?.[k])y=n(to.maxStats,k);
   else{
    let d=n(r.flatOverallStatChange,k)+max(n(r.flatMin,k),n(r.flatMax,k));
    d+=value(x,n(r.percentOverallStatChange,k))+rangeMax(x,n(r.percentMin,k),n(r.percentMax,k));
    const g0=x-iniLo,g1=x-iniHi,c=n(r.percentGainedStatChange,k);
    d+=max(value(g0,c),value(g1,c));
    d+=max(rangeMax(g0,n(r.percentGainedMin,k),n(r.percentGainedMax,k)),rangeMax(g1,n(r.percentGainedMin,k),n(r.percentGainedMax,k)));
    if(k==="bravery")d=Math.trunc((d+(d<0?-5:5))/10)*10;
    if(r.lowerBoundAtMinStats)d=max(d,n(to.minStats,k)-x);
    if(cap!==null){
     if(soft){if(d>0)d=x<=cap?min(d,cap-x):0;}
     else d=min(d,cap-x);
    }
    y=x+d;
   }
   assert(Number.isSafeInteger(y),"Invalid scalar output");
   // Only valid raw-stat results continue in this model. Using floor as an
   // overapproximation also covers a hypothetical clamp at fixed minimum.
   best=max(best,y,lo);arr.push(best);metrics.scalarEvaluations++;
  }
  return t;
 }
 // Use an inexpensive safe closed form for bounded transforms, and exact
 // scalar prefix maxima for uncapped transforms (including repeat growth).
 // For capped soft limits, a prior value above cap cannot grow further.
 function transfer(from,edge,k,upper,iniLo,iniHi){
  const r=edge.rule,to=bodies.get(edge.to),g=min(upper,r.requiredMaxStats?.[k]??9999);
  if(g<floor(k))return null;
  if(r.rerollStats?.[k])return max(floor(k),n(to.maxStats,k));
  const cap=r.upperBoundAtMaxStats?n(to.maxStats,k):r.upperBoundAtStatCaps?n(to.statCaps,k):null;
  if(cap!==null){
   const soft=Number(r.upperBoundType)===1||((r.upperBoundType==null||Number(r.upperBoundType)===0)&&from===edge.to);
   return max(floor(k),cap,soft?g:-Infinity);
  }
  // Cache shared across origins with equal initial interval and rule.
  const t=scalarTable(from,edge,k,iniLo,iniHi,g);metrics.scalarLookups++;
  return t.arr[min(t.upper,g)-t.lo+1];
 }
 function initial(p){
  const b=bodies.get(p.soldierType);assert(b);
  const a=p.initialStatsBeforeTraits||{},c=p.currentStatsBeforeTraits||{};
  const iniLo=STAT_KEYS.map(k=>n(a.min||b.minStats,k)),iniHi=STAT_KEYS.map(k=>n(a.max||b.maxStats,k));
  const birth=STAT_KEYS.map(k=>max(n(c.min||b.minStats,k),n(c.max||b.maxStats,k),floor(k)));
  assert(iniLo.every((v,i)=>v<=iniHi[i]&&v>=0));
  return {iniLo,iniHi,birth};
 }
 function solve(p,repeatCaps={}){
  const {iniLo,iniHi,birth}=initial(p);
  // Track finite count budgets for uncapped rules with positive changes.
  // Other finite counts are retained as proofs; zero-use rules are excluded.
  const tracked=rules.filter(r=>!r.upperBoundAtMaxStats&&!r.upperBoundAtStatCaps&&
   fields.some(f=>Object.values(r[f]||{}).some(v=>v>0))&&
   Number.isSafeInteger(repeatCaps[r.id])&&repeatCaps[r.id]>0);
  const slots=new Map(tracked.map((r,i)=>[r.id,i]));
  const limits=tracked.map(r=>repeatCaps[r.id]);
  const upper=new Map(),q=[],pending=new Set(),usedRules=new Set(),usedBonuses=new Set([...(p.traitNames||[]),...Object.keys(p.traitCounts||{}),...medals]);
  const id=(body,counts)=>JSON.stringify([body,counts]);
  function advance(rule,counts){
   if(repeatCaps[rule.id]===0)return null;
   const i=slots.get(rule.id);
   if(i===undefined)return counts;
   if(counts[i]>=limits[i])return null;
   const next=counts.slice();next[i]++;return next;
  }
  function admit(body,counts,v){
   const k=id(body,counts),old=upper.get(k)?.raw,grown=growth(bodies.get(body));
   const a=v.map((x,i)=>max(x,grown[i],old?.[i]??-Infinity));
   if(old&&old.every((x,i)=>x===a[i]))return;
   assert(a.every(Number.isSafeInteger));
   upper.set(k,{body,counts,raw:a});metrics.relaxations++;
   if(!pending.has(k)){pending.add(k);q.push(k);}
  }
  const zero=limits.map(()=>0);
  admit(p.soldierType,zero,birth);
  // Finite raw gate domain and finite count layers imply termination of
  // monotone integer worklist. No depth or arbitrary repeat limit.
  for(let cursor=0;cursor<q.length;cursor++){
   const k=q[cursor],{body,counts,raw:u}=upper.get(k);pending.delete(k);metrics.queuePops++;
   for(const edge of byBody.get(body)||[]){
    const r=edge.rule,next=advance(r,counts);
    if(next===null)continue;
    const v=STAT_KEYS.map((k,i)=>transfer(body,edge,k,u[i],iniLo[i],iniHi[i]));
    if(v.some(x=>x===null))continue;
    usedRules.add(r.id);if(r.soldierBonusType)usedBonuses.add(r.soldierBonusType);
    admit(edge.to,next,v);
   }
  }
  assert(upper.get(id(p.soldierType,zero)).raw.every((x,i)=>x>=birth[i]));
  for(const {body,counts,raw:u} of upper.values()){
   assert(u.every((x,i)=>x>=growth(bodies.get(body))[i]));
   for(const edge of byBody.get(body)||[]){
    const next=advance(edge.rule,counts);if(next===null)continue;
    const v=STAT_KEYS.map((k,i)=>transfer(body,edge,k,u[i],iniLo[i],iniHi[i]));
    if(v.some(x=>x===null))continue;
    const dest=upper.get(id(edge.to,next))?.raw;assert(dest&&dest.every((x,i)=>x>=v[i]),"Open invariant edge");
    metrics.proofEdges++;metrics.proofCoordinates+=12;
   }
  }
  const bonusUpper=STAT_KEYS.map(k=>[...usedBonuses].reduce((s,id)=>s+max(0,n(bonusMap.get(id),k)),0));
  const byTerminal=new Map();
  for(const {body,raw} of upper.values()){
   const old=byTerminal.get(body);
   byTerminal.set(body,raw.map((v,i)=>max(v,old?.[i]??-Infinity)));
  }
  const bounds=[...byTerminal].sort(([a],[b])=>a.localeCompare(b)).map(([body,raw])=>({body,raw,effective:raw.map((v,i)=>v+bonusUpper[i])}));
  const rawMax=STAT_KEYS.map((_,i)=>max(...bounds.map(b=>b.raw[i]))),effectiveMax=rawMax.map((v,i)=>v+bonusUpper[i]);
  return {iniLo,iniHi,birth,body:p.soldierType,bounds,rawMax,effectiveMax,bonusUpper,rules:[...usedRules].sort(),bonusIds:[...usedBonuses].sort(),repeatCaps,trackedRules:tracked.map(r=>r.id),countLimits:limits,layers:[...upper.values()]};
 }
 return {solve,initial,metrics,rules:rules.map(r=>r.id),medals:[...medals].sort(),transfer};
}
