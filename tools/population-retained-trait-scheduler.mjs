// General retained-trait scheduling: all supported non-default-rank origins.
// Estimates schedule work only; exact trait sets are captured from replay.
// Neither same-score nor trait loss is a reason to delete a successor.
import {traitTransition,traitSnapshot} from "./population-rank-trait-priority.mjs";
import {createPlateauIndex,isDeferred} from "./population-frontier-plateau-scheduler.mjs";
import {gainPriority} from "./population-frontier-priority-index.mjs";
export const RETAINED_POLICY="GENERAL_RETAINED_TRAIT_HORIZON_V1";
export {traitTransition,traitSnapshot};
export function createRetainedPriority(data,routes){
 const rules=new Map(data.transformations.map(r=>[r.id,r])),profiles=new Map(data.profiles.map(p=>[p.id,p])),gain=gainPriority(data),plateau=createPlateauIndex(routes),memo=new Map();
 function state(id,r){
  if(memo.has(id))return memo.get(id);
  const owned=new Map(),hist=new Map(),p=profiles.get(r.origin);
  for(const [k,v] of Object.entries(p?.traitCounts||{}))if(v>0)owned.set(k,v);
  for(const k of p?.traitNames||[])if(!owned.has(k))owned.set(k,1);
  for(const rid of r.order||[]){
   const t=rules.get(rid);if(!t)continue;
   if(t.reset){owned.clear();hist.clear();}
   else for(const k of t.removeTransformations||[]){
    const b=rules.get(k)?.soldierBonusType,n=hist.get(k)||0;
    if(b&&n){const v=(owned.get(b)||0)-n;if(v>0)owned.set(b,v);else owned.delete(b);}hist.delete(k);
   }
   hist.set(rid,(hist.get(rid)||0)+1);
   if(t.soldierBonusType)owned.set(t.soldierBonusType,(owned.get(t.soldierBonusType)||0)+1);
  }
  const measured=r.traitEvidence||r.rankTraitEvidence,traits=measured?new Set(measured.after):new Set(owned.keys());
  const s={traits,hist};memo.set(id,s);return s;
 }
 function score(id,r,t){
  const {traits,hist}=state(id,r),fresh=Boolean(t.soldierBonusType&&!traits.has(t.soldierBonusType));
  const reset=Boolean(t.reset),removed=(t.removeTransformations||[]).some(k=>hist.has(k));
  const unlikely=(t.requiredPreviousTransformations||[]).some(k=>!hist.has(k))||(t.forbiddenPreviousTransformations||[]).some(k=>hist.has(k));
  const missing=t.requires.filter(k=>!r.addedResearch.includes(k)).length;
  return 2000*Number(fresh)-1800*Number(reset)-900*Number(removed)-1500*Number(unlikely)+Math.min(24,6*missing)+Math.max(-100,Math.min(100,gain(r,t)))-80*Number(!fresh&&hist.has(t.id));
 }
 function defer(id,r,t){const {traits,hist}=state(id,r);return !(t.soldierBonusType&&!traits.has(t.soldierBonusType))&&(isDeferred(r,plateau(id),t)||hist.has(t.id));}
 return {state,score,defer};
}
export function retainedSummary(routes){
 const byOrigin={},byRule={},gainedTypes=new Set(),pairs=new Set();
 let measured=0,gained=0,netGain=0,lost=0,research=0,changedVector=0,maxTraits=0;
 for(const [id,r] of Object.entries(routes)){
  const t=r.traitEvidence;if(!t)continue;
  measured++;gained+=Number(t.gained.length>0);netGain+=Number(t.after.length>t.before.length);lost+=Number(t.lost.length>0);research+=Number(t.newResearch.length>0);
  const p=routes[r.chainParent];if(p&&r.permanentVector.some((v,i)=>v!==p.permanentVector[i]))changedVector++;
  for(const k of t.gained)gainedTypes.add(k);if(t.gained.length)pairs.add(r.origin+"|"+r.branch);
  maxTraits=Math.max(maxTraits,t.after.length);
  const o=byOrigin[r.origin]??={routes:0,gained:0,maxTraits:0,route:null};o.routes++;o.gained+=Number(t.gained.length>0);
  if(o.route===null||t.after.length>o.maxTraits){o.maxTraits=t.after.length;o.route=id;}
  const b=byRule[r.chainRule]??={routes:0,gained:0,lost:0,research:0};b.routes++;b.gained+=Number(t.gained.length>0);b.lost+=Number(t.lost.length>0);b.research+=Number(t.newResearch.length>0);
 }
 return {measured,gained,netGain,lost,research,changedVector,maxTraits,gainedTypes:[...gainedTypes].sort(),gainedPairs:pairs.size,gainedOrigins:Object.values(byOrigin).filter(x=>x.gained>0).length,byOrigin,byRule};
}
