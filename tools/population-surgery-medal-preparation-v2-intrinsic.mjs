// Conditional stat-gate preparation using current intrinsic weapons.
// Preserve the earlier general-medal lane. New awards require raw armor,
// weapon and explicit commendation criterion evidence; gameplay is assumed.
import {STAT_KEYS,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {member} from "./population-growth-replay-core.mjs";
import {createSurgeryMedalPreparation as general} from "./population-surgery-medal-preparation.mjs";
import {createIntrinsicMedalCatalog} from "./population-intrinsic-weapon-medal-catalog.mjs";
export function createSurgeryMedalPreparation(data,replay){
 const fallback=general(data,replay),catalog=createIntrinsicMedalCatalog(data);
 function gates(world,r,commendations=null){
  const f=replay.finish(world);
  if(commendations){
   const extra=bonusStats(member(world).state,data,{commendations});
   f.vector=f.raw.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&(extra[STAT_KEYS[i]]||0)>0?v:Math.max(STAT_KEYS[i]==="health"?1:0,v+(extra[STAT_KEYS[i]]||0)));
  }
  return STAT_KEYS.flatMap((k,i)=>{
   const lo=Number(r.requiredMinStats?.[k]||0),hi=r.requiredMaxStats?.[k]===undefined?9999:Number(r.requiredMaxStats[k]);
   const x=(r.includeBonusesForMinStats?f.vector:f.raw)[i],y=(r.includeBonusesForMaxStats?f.vector:f.raw)[i];
   return [...(lo&&x<lo?[{stat:k,kind:"min",required:lo,actual:x,gap:lo-x}]:[]),...(y>hi?[{stat:k,kind:"max",required:hi,actual:y,gap:y-hi}]:[])];
  });
 }
 const gap=a=>a.reduce((n,x)=>n+x.gap,0);
 function prepare(node,r){
  if(!r.includeBonusesForMinStats&&!r.includeBonusesForMaxStats)return null;
  const ordinary=fallback.prepare(node,r);
  if(ordinary?.status==="CONDITIONAL_STAT_GATE_READY")return ordinary;
  const base=replay.meet(node,r);if(!base)return ordinary;
  const before=gates(base.world,r);if(!before.length)return ordinary;
  const m=member(base.world),current=m.commendations||{};
  if(m.state.status!=="healthy")return ordinary;
  const eligible=catalog.forArmor(m.state.soldierType,m.state.armorId);
  const choices=[];
  for(const medal of eligible)for(const level of medal.levels){
   if(level.level<=(current[medal.id]??-1))continue;
   const award={id:medal.id,criterion:medal.criterion,...level,proofs:medal.proofs};
   const test={...current,[medal.id]:level.level};
   // No need to search a medal that leaves all currently missing gates
   // unchanged or worsens them. Recheck every min/max at the combination.
   if(gap(gates(base.world,r,test))<gap(before))choices.push(award);
  }
  const candidates=[];
  let trials=0;
  function consider(awards){
   trials++;
   const next={...current};for(const a of awards)next[a.id]=a.level;
   if(gates(base.world,r,next).length)return;
   const shared=awards[0].proofs.map(x=>x.weapon).find(w=>awards.every(a=>a.proofs.some(p=>p.weapon===w)));
   const total=awards.reduce((s,a)=>s+a.threshold,0);
   const threshold=shared?Math.max(...awards.map(a=>a.threshold)):total;
   candidates.push({awards,shared,threshold,total});
  }
  // Bounded constructive search: all singles and pairs. A failure is
  // not an impossibility certificate for other medals, levels or armor.
  for(let i=0;i<choices.length;i++){
   consider([choices[i]]);
   for(let j=i+1;j<choices.length;j++)if(choices[i].id!==choices[j].id)consider([choices[i],choices[j]]);
  }
  candidates.sort((a,b)=>a.threshold-b.threshold||a.total-b.total||a.awards.length-b.awards.length||JSON.stringify(a.awards.map(x=>[x.id,x.level])).localeCompare(JSON.stringify(b.awards.map(x=>[x.id,x.level]))));
  for(const best of candidates){
   let result=base;
   try{
    for(const award of best.awards){
     const action={type:"conditionalMedal",soldier:"origin",medal:award.id,level:award.level,assumption:true};
     result={world:replay.apply(result.world,action),steps:[...result.steps,action]};
    }
    if(gates(result.world,r).length)continue;
    return {status:"CONDITIONAL_STAT_GATE_READY",node:result,receipt:{policy:"INTRINSIC_WEAPON_MEDAL_STAT_PREPARATION_V2",before,after:gates(result.world,r),awards:best.awards,alternatives:trials,body:m.state.soldierType,armor:m.state.armorId,sharedWeapon:best.shared||null,conditionalKillThreshold:best.threshold,thresholdSum:best.total,actualGameCertified:false}};
   }catch{}
  }
  return {status:"UNRESOLVED",before,alternatives:trials,assumption:true,intrinsicEligible:eligible.map(x=>x.id),generalAlternatives:ordinary?.alternatives||0};
 }
 return {prepare,medals:[...fallback.medals,"SOURCE_BACKED_CURRENT_INTRINSIC_WEAPON"]};
}
