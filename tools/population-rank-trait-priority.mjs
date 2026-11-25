// Schedule new permanent traits and research before redundant repetitions.
// Priority only: history resets, removal, negative bonuses and repeatable
// stat changes remain valid possibilities. Exact retained traits are measured
// from replay, never inferred from the number of transformation actions.
import {member} from "./population-growth-replay-core.mjs";
import {createPlateauIndex,isDeferred} from "./population-frontier-plateau-scheduler.mjs";
import {gainPriority} from "./population-frontier-priority-index.mjs";
export const TRAIT_PRIORITY="RANK_RETAINED_TRAIT_PRIORITY_V1";
const sorted=x=>[...x].sort();
export function traitSnapshot(w){
 const s=member(w).state;
 return sorted(s.bonusIds||s.bonusCounts.keys());
}
export function traitTransition(before,after){
 const a=traitSnapshot(before),b=traitSnapshot(after),as=new Set(a),bs=new Set(b);
 return {before:a,after:b,gained:b.filter(id=>!as.has(id)),lost:a.filter(id=>!bs.has(id)),newResearch:sorted([...after.researched].filter(id=>!after.disabled.has(id)&&(!before.researched.has(id)||before.disabled.has(id))))};
}
export function traitPriority(data,routes){
 const rules=new Map(data.transformations.map(r=>[r.id,r])),profiles=new Map(data.profiles.map(p=>[p.id,p]));
 const gain=gainPriority(data),plateau=createPlateauIndex(routes),memo=new Map();
 function estimated(id,r){
  if(memo.has(id))return memo.get(id);
  // Historical order is a heuristic only. Exact evidence overrides it.
  if(r.rankTraitEvidence){const x=new Set(r.rankTraitEvidence.after);memo.set(id,x);return x;}
  const owned=new Set(profiles.get(r.origin)?.traitNames||[]),hist=new Map();
  for(const rid of r.order||[]){const rule=rules.get(rid);if(!rule)continue;
   if(rule.reset){owned.clear();hist.clear();}
   for(const removed of rule.removeTransformations||[]){const b=rules.get(removed)?.soldierBonusType;if(b&&hist.has(removed))owned.delete(b);hist.delete(removed);}
   hist.set(rid,1);if(rule.soldierBonusType)owned.add(rule.soldierBonusType);
  }
  memo.set(id,owned);return owned;
 }
 function score(id,r,rule){
  const owned=estimated(id,r),fresh=Boolean(rule.soldierBonusType&&!owned.has(rule.soldierBonusType)),newBody=Boolean(rule.producedSoldierType&&rule.producedSoldierType!==r.body);
  const seen=new Set(r.addedResearch||[]),research=rule.requires.filter(k=>!seen.has(k)).length;
  const repeat=r.order.includes(rule.id);
  // The search objective is retained distinct traits, not body-cap sum.
  // Cap the stat heuristic so a body change/reset cannot swamp a new trait.
  const hist=new Set(r.order||[]),unlikely=(rule.requiredPreviousTransformations||[]).some(k=>!hist.has(k))||(rule.forbiddenPreviousTransformations||[]).some(k=>hist.has(k));
  const risky=Boolean(rule.reset||(rule.removeTransformations||[]).length);
  return 2000*Number(fresh)+35*Number(newBody)+Math.min(24,6*research)+Math.max(-100,Math.min(100,gain(r,rule)))-1800*Number(risky)-1500*Number(unlikely)-80*Number(repeat&&!fresh);
 }
 function deferred(id,r,rule){
  // Even a repeated action may add a previously removed trait; do not defer it.
  const fresh=rule.soldierBonusType&&!estimated(id,r).has(rule.soldierBonusType);
  return !fresh&&(isDeferred(r,plateau(id),rule)||r.order.includes(rule.id));
 }
 return {score,deferred};
}
export function rankTraitSummary(routes){
 let measured=0,gained=0,lost=0,research=0,changedVector=0,maxTraits=0,netGain=0;const origins=new Set(),pairs=new Set(),types=new Set(),byRule={};
 for(const r of Object.values(routes)){
  const t=r.rankTraitEvidence;if(!t)continue;measured++;maxTraits=Math.max(maxTraits,t.after.length);
  if(t.gained.length){gained++;origins.add(r.origin);pairs.add(r.origin+"|"+r.branch);for(const k of t.gained)types.add(k);}
  if(t.lost.length)lost++;if(t.newResearch.length)research++;
  if(t.after.length>t.before.length)netGain++;
  const p=routes[r.chainParent];if(p&&r.permanentVector.some((v,i)=>v!==p.permanentVector[i]))changedVector++;
  const b=byRule[r.chainRule]??={routes:0,gained:0,lost:0,research:0};b.routes++;b.gained+=Number(t.gained.length>0);b.lost+=Number(t.lost.length>0);b.research+=Number(t.newResearch.length>0);
 }
 return {measured,gained,lost,research,netGain,changedVector,maxTraits,gainedOrigins:origins.size,gainedPairs:pairs.size,uniqueGainedTraits:types.size,byRule};
}
