// Pre-screen only explicit branch policy. Score is scheduling, never a bound.
import {key} from "./population-research-career-core.mjs";
export const PRIORITY_POLICY="BRANCH_GATE_AND_GAIN_PRIORITY_V1";
export function branchGateIndex(db){
 const branches=new Map(db.branches.map(b=>[b.id,new Set(b.blockedResearch||[])])),cache=new Map();
 return (branch,rule)=>{
  const k=branch+"|"+rule.id;
  if(cache.has(k))return cache.get(k);
  const b=branches.get(branch);if(!b)throw Error("Unindexed branch "+branch);
  const blocked=[...new Set(rule.requires.filter(x=>b.has(x)))].sort();
  const result=blocked.length?{branch,rule:rule.id,blocked,policy:PRIORITY_POLICY}:null;
  cache.set(k,result);return result;
 };
}
export function gateId(g){return key([g.policy,g.branch,g.rule,g.blocked]);}
const n=x=>Number.isFinite(x)?x:0;
export function gainPriority(data){
 const bodies=new Map(data.soldiers.map(b=>[b.id,b])),stats=data.statKeys;
 return (parent,r)=>{
  const dest=bodies.get(r.producedSoldierType||parent.body);
  const known=new Set(parent.addedResearch||[]);
  const active=(r.requires||[]).filter(k=>known.has(k)).length;
  let gain=0,capGain=0;
  for(let i=0;i<stats.length;i++){
   const k=stats[i],v=n(parent.raw[i]);
   // fixedEffectiveDelta is indexed descriptive data, NOT a prediction.
   gain+=n(r.fixedEffectiveDelta?.[k])+v*n(r.percentOverallStatChange?.[k])/100;
   if(r.producedSoldierType&&dest)capGain+=Math.max(0,n(dest.statCaps?.[k])-n(parent.capRaw?.[i]));
  }
  return Math.round(gain+capGain*.35+active*12-(r.requires.length-active)*2);
 };
}
export function orderCandidates(xs,parent,score,round){
 // Alternate score-first and diversity-first to preserve opportunities.
 const cmp=(a,b)=>Number(a.retry)-Number(b.retry)||Number(parent.order.includes(a.f.rule.id))-Number(parent.order.includes(b.f.rule.id));
 const tail=(a,b)=>a.f.rule.requires.length-b.f.rule.requires.length||a.f.rule.id.localeCompare(b.f.rule.id);
 const ranked=[...xs].sort((a,b)=>cmp(a,b)||score(parent,b.f.rule)-score(parent,a.f.rule)||tail(a,b));
 const diverse=[...xs].sort((a,b)=>cmp(a,b)||tail(a,b));
 const seen=new Set(),out=[];
 for(let i=0;i<xs.length;i++){
  const pair=round%2===0?[ranked[i],diverse[i]]:[diverse[i],ranked[i]];
  for(const q of pair)if(!seen.has(q.aid)){seen.add(q.aid);out.push(q);}
 }
 return out;
}
