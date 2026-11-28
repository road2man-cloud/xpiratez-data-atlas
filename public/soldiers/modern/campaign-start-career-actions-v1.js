// Branch-scoped conditional career actions. Mirrors the v.o2 policies in
// tools/population-growth-replay-core.mjs, population-scalar-upper-bound.mjs
// and population-chronological-career-core.mjs (ledger source a7e64ad).
// Never use their legacy resource injection or foundationWorld replay here.
import {STAT_KEYS,bonusStats} from './eligibility.js';
export const CAREER_ACTIONS=new Set(['conditionalCapGrowth','conditionalPromotion','conditionalMedal']);
export function scalarCareerGrowth(body,key,value,data){
 if(!Number.isSafeInteger(value))throw Error('career-growth-invalid-raw:'+key);
 if(key==='mana'){
  if(!data.growthRules)throw Error('career-growth-rules-missing');
  if(!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary)return value;
 }
 const cap=body.statCaps?.[key];
 if(!Number.isSafeInteger(cap))throw Error('career-growth-cap-missing:'+body.id+'/'+key);
 return cap>value?key==='bravery'?value+10*Math.floor((cap-value)/10):cap:value;
}
export function applyConditionalCareerAction(input,step,data){
 try{
  if(!CAREER_ACTIONS.has(step.type)||step.assumption!==true||step.soldier!=='origin'||input.pendingFree)
   throw Error('career-action-assumption-or-context-invalid');
  const world=structuredClone(input),member=world.soldiers.find(s=>s.id===step.soldier),state=member?.state;
  if(!state?.exactStats||state.retired||state.status!=='healthy')throw Error('career-action-requires-live-exact-state');
  const body=data.soldiers.find(b=>b.id===state.soldierType);
  if(!body)throw Error('career-body-rule-missing');
  let notes;
  if(step.type==='conditionalCapGrowth'){
   const before=state.currentStats;
   state.currentStats=Object.fromEntries(STAT_KEYS.map(k=>[k,scalarCareerGrowth(body,k,before[k],data)]));
   notes=['conditional-battle-cap-growth','growth-opportunities-duration-and-rng-not-native-certified'];
  }else if(step.type==='conditionalPromotion'){
   const ranks=body.raw?.rankStrings;
   if(body.allowPromotion!==true||!Array.isArray(ranks)||!ranks.length)throw Error('promotion-rank-list-unindexed');
   if(!Number.isSafeInteger(step.rank)||step.rank!==state.rank+1||step.rank>=ranks.length)throw Error('invalid-promotion-rank');
   state.rank=step.rank;
   notes=['conditional-promotion','promotion-achievement-not-native-certified'];
  }else{
   const def=data.commendationIndex?.[step.medal];
   if(!def||step.medal==='STR_MEDAL_WEAPON_PROFICIENCY_NAME')throw Error('medal-rule-unindexed');
   const n=Math.max(def.bonusLevels?.length||0,...Object.values(def.criteria||{}).map(v=>Array.isArray(v)?v.length:0));
   const old=member.commendations?.[step.medal]??-1;
   if(!Number.isSafeInteger(step.level)||step.level<=old||step.level>=n)throw Error('invalid-medal-level');
   member.commendations={...member.commendations,[step.medal]:step.level};
   notes=['conditional-medal','medal-achievement-not-native-certified'];
  }
  return {ok:true,world,notes,assumed:true};
 }catch(e){return {ok:false,world:input,reason:e.message};}
}
// Keep permanent and decoration-inclusive vectors distinct. OXCE's inactive
// psi skill cannot become active merely through a positive bonus.
export function careerStatVectors(member,data){
 const s=member.state;
 const raw=Object.fromEntries(STAT_KEYS.map(k=>[k,s.currentStats[k]]));
 if(!STAT_KEYS.every(k=>Number.isSafeInteger(raw[k])))throw Error('unresolved-stat-vector');
 const permanentBonus=bonusStats(s,data);
 const bonus=bonusStats(s,data,{commendations:member.commendations});
 const effective=b=>Object.fromEntries(STAT_KEYS.map(k=>[k,k==='psiSkill'&&raw[k]<=0&&(b[k]||0)>0?raw[k]:Math.max(k==='health'?1:0,raw[k]+(b[k]||0))]));
 return {raw,bonus,stats:effective(bonus),permanentBonus,permanentStats:effective(permanentBonus)};
}
