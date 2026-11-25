// Conditional career actions on an existing chronological world. Never
// fabricate recruitment/research or modify the legacy verifier. Promotion
// and medal acquisition are assumptions, not achieved campaign events.
import assert from "node:assert/strict";
import {STAT_KEYS,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {createGrowthReplay,member} from "./population-growth-replay-core.mjs";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
export const MODEL="CHRONOLOGICAL_ASSUMED_CAREER_GROWTH_V1";
const vec=s=>STAT_KEYS.map(k=>s[k]||0),sum=v=>v.reduce((a,b)=>a+b,0);
export function createCareerReplay(data){
 const g=createGrowthReplay(data),rankDefaultUnknown=new Set();
 function apply(w,a){
  if(a.type!=="conditionalPromotion"&&a.type!=="conditionalMedal")return g.apply(w,a);
  assert(a.assumption===true&&a.soldier==="origin"&&!w.pendingFree);
  const next=structuredClone(w),m=member(next),s=m?.state;assert(s?.exactStats&&!s.retired&&s.status==="healthy");
  if(a.type==="conditionalPromotion"){
   const b=g.bodies.get(s.soldierType),ranks=b?.raw?.rankStrings;
   // Do not assume an undocumented rank list for human variants.
   assert(b?.allowPromotion===true&&Array.isArray(ranks)&&ranks.length>0,"Promotion rank list unindexed");
   assert(Number.isSafeInteger(a.rank)&&a.rank===s.rank+1&&a.rank<ranks.length);
   s.rank=a.rank;
  }else{
   const mdef=data.commendationIndex?.[a.medal];
   assert(mdef&&a.medal!=="STR_MEDAL_WEAPON_PROFICIENCY_NAME");
   const n=Math.max(mdef.bonusLevels?.length||0,...Object.values(mdef.criteria||{}).map(v=>Array.isArray(v)?v.length:0));
   const old=m.commendations?.[a.medal]??-1;
   assert(Number.isSafeInteger(a.level)&&a.level>old&&a.level<n,"Invalid medal decoration assumption");
   m.commendations={...m.commendations,[a.medal]:a.level};
  }
  return next;
 }
 function append(n,a){return {world:apply(n.world,a),steps:[...n.steps,a]};}
 function replay(steps,w=foundationWorld()){for(const a of steps)w=apply(w,a);assert(!w.pendingFree);return w;}
 function meet(n,r){
  let q=n;
  const s=member(q.world).state,body=g.bodies.get(s.soldierType);
  if(s.rank<(r.minRank||0)&&!body?.raw?.rankStrings?.length){rankDefaultUnknown.add(s.soldierType);return null;}
  try{
   while(member(q.world).state.rank<(r.minRank||0)){
    q=append(q,{type:"conditionalPromotion",soldier:"origin",rank:member(q.world).state.rank+1,assumption:true});
   }
   for(const [id,level] of Object.entries(r.requiredCommendations||{})){
    if((member(q.world).commendations?.[id]??-1)>=level)continue;
    q=append(q,{type:"conditionalMedal",soldier:"origin",medal:id,level,assumption:true});
   }
   return q;
  }catch{return null;}
 }
 function transform(n,r){
  const q=meet(n,r);return q?g.transform(q,r):null;
 }
 function finish(w){
  const m=member(w),f=g.finish(w),permanentBonus=vec(bonusStats(m.state,data));
  const permanentVector=f.raw.map((x,i)=>STAT_KEYS[i]==="psiSkill"&&x<=0&&permanentBonus[i]>0?x:Math.max(STAT_KEYS[i]==="health"?1:0,x+permanentBonus[i]));
  const permanentCapVector=f.capRaw.map((x,i)=>STAT_KEYS[i]==="psiSkill"&&x<=0&&permanentBonus[i]>0?x:Math.max(STAT_KEYS[i]==="health"?1:0,x+permanentBonus[i]));
  return {...f,permanentBonus,permanentVector,permanentCapVector,rank:m.state.rank,medals:m.commendations||{}};
 }
 return {...g,apply,append,replay,meet,transform,finish,rankDefaultUnknown};
}
