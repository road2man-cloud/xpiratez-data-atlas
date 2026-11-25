// Conditional career extension of the observed-active random-box model.
// Medal presets are explicit assumptions, fixed for the entire route.
// Promotion is a separate assumed action. Do not use this as campaign proof.
import assert from "node:assert/strict";
import {applyTransformation,bonusStats,STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {project,unpack} from "./population-closure-core.mjs";
import {createRandomBoxModel} from "./population-random-box-core.mjs";
export const MODEL="ASSUMED_BIRTH_FIXED_MEDAL_RANK_ROLL_BOX_V1";
export const PROMOTE=-2,GROW=-1;
export function createCareerModel(data,snap){
 const {model:base,checker}=createRandomBoxModel(data,snap);
 const careerBits=base.rules.reduce((m,r,i)=>(r.minRank||Object.keys(r.requiredCommendations||{}).length)?m|base.bits[i]:m,0n);
 function preset(mask){
  const medals={};
  for(let i=0;i<base.rules.length;i++)if(mask&base.bits[i]){
   for(const [id,n] of Object.entries(base.rules[i].requiredCommendations||{})){
    assert(Number.isSafeInteger(n)&&n>=0&&data.commendationIndex[id],"Unknown medal gate "+id);
    const m=data.commendationIndex[id],levels=Math.max(0,...Object.values(m.criteria||{}).map(x=>Array.isArray(x)?x.length:0),m.bonusLevels?.length||0);
    assert(n<levels,"Medal decoration exceeds indexed levels "+id);
    medals[id]=Math.max(medals[id]??-1,n);
   }
  }
  return Object.fromEntries(Object.entries(medals).sort(([a],[b])=>a.localeCompare(b)));
 }
 const rankThreshold=Math.max(0,...base.rules.map(r=>r.minRank||0));
 // A fixed preset makes bonus-inclusive minimum gates monotone in raw
 // values; the old scalar checker still checks all numeric transformations.
 function scenario(mask,medals){
  const maxNeed=Math.max(0,...base.rules.filter((r,i)=>mask&base.bits[i]).map(r=>r.minRank||0));
  function canPromote(p){
   const b=base.bodies.get(p[0]);assert(b);
   const ranks=b.raw?.rankStrings,cap=Array.isArray(ranks)&&ranks.length?ranks.length-1:rankThreshold;
   return b.allowPromotion!==false&&p[4]<Math.min(cap,maxNeed);
  }
  function actions(p,m){
   const a=base.actions(p,m);if(canPromote(p))a.push(PROMOTE);return a;
  }
  function transition(p,i){
   if(i===PROMOTE){
    if(!canPromote(p))return {kind:"GATE"};
    const next=p.slice();next[4]++;return {kind:"OK",state:next};
   }
   if(i===GROW)return base.transition(p,i);
   const r=base.rules[i];assert(r);
   const s=unpack(p),q=applyTransformation(r,s,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:medals,statsKnown:true,medalsKnown:true});
   if(q.verdict.kind!=="eligible")return {kind:"GATE"};
   if(!q.state.exactStats||q.state.retired)return {kind:"OUTSIDE_MODEL"};
   return {kind:"OK",state:project(q.state)};
  }
  function terminal(p){
   const s=unpack(p),raw=p[6],permanent=bonusStats(s,data),all=bonusStats(s,data,{commendations:medals});
   const bonus=STAT_KEYS.map(k=>all[k]||0),permanentBonus=STAT_KEYS.map(k=>permanent[k]||0);
   const eff=b=>raw.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&b[i]>0?v:Math.max(STAT_KEYS[i]==="health"?1:0,v+b[i]));
   return {body:p[0],raw,bonus,vector:eff(bonus),permanentBonus,permanentVector:eff(permanentBonus),rank:p[4]};
  }
  return {actions,transition,terminal,medals,mask};
 }
 return {base,checker,careerBits,preset,scenario,rankThreshold};
}
