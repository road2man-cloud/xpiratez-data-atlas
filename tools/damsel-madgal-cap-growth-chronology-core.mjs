// Source-backed chronological, RE-LAXED upper-envelope models.
// Not an exact game outcome: birth/EXP roll correlations, facility assignment,
// medal/progression and alternate event awards are not proven.
import {STAT_KEYS,initialState,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {createStatEnvelope,advanceStatEnvelope} from "../public/soldiers/modern/stat-envelope.js";
import {growStatEnvelope} from "../public/soldiers/modern/growth-envelope.js";

export const CAP_GROWTH_STATS=Object.freeze([...STAT_KEYS]);
export const CAP_GROWTH_EIGHT=Object.freeze([
 "tu","stamina","health","reactions","firing","throwing","strength","melee"
]);
export const GROWTH_ORDER_CHOICES=Object.freeze([
 {id:"NONE",phases:[]},
 {id:"PHYSICAL",phases:["@PHYS_TRAINING"]},
 {id:"COMBAT",phases:["@BATTLE_GROWTH"]},
 {id:"PHYSICAL_COMBAT",phases:["@PHYS_TRAINING","@BATTLE_GROWTH"]},
 {id:"COMBAT_PHYSICAL",phases:["@BATTLE_GROWTH","@PHYS_TRAINING"]}
]);
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const map=x=>Object.fromEntries(STAT_KEYS.map(k=>[k,n(x?.[k])]));
const vec=(obj,keys)=>keys.map(k=>n(obj?.[k]));
const dominates=(a,b)=>a.every((v,i)=>v>=b[i])&&a.some((v,i)=>v>b[i]);
const sum=a=>a.reduce((x,y)=>x+y,0);
const penalty=s=>s.reduce((x,y)=>x+GROWTH_ORDER_CHOICES.find(z=>z.id===y).phases.length,0);

function nextStructuralState(prior,rule){
 const s={...prior,
  history:new Map(prior.history),bonusCounts:new Map(prior.bonusCounts),
  bonusIds:new Set(prior.bonusIds)};
 if(rule.reset){s.history.clear();s.bonusCounts.clear();}
 else for(const rid of rule.removeTransformations||[]){
  const count=s.history.get(rid)||0;
  if(!count)continue;
  s.history.delete(rid);
  // This case should be detected at the point where a removed transformation
  // has a bonus. Caller handles removal using its own data rule map.
 }
 s.history.set(rule.id,(s.history.get(rule.id)||0)+1);
 if(rule.soldierBonusType)
  s.bonusCounts.set(rule.soldierBonusType,
   (s.bonusCounts.get(rule.soldierBonusType)||0)+1);
 s.bonusIds=new Set(s.bonusCounts.keys());
 if(rule.producedSoldierType)s.soldierType=rule.producedSoldierType;
 return s;
}
function transformState(state,rule,byRule){
 const next=nextStructuralState(state,rule);
 if(!rule.reset){
  // Reconstruct the retained bonuses after history deletions using counts.
  next.bonusCounts=new Map(state.bonusCounts);
  for(const id of rule.removeTransformations||[]){
   const count=state.history.get(id)||0;
   const bonusId=byRule.get(id)?.soldierBonusType;
   if(!count||!bonusId)continue;
   const value=(next.bonusCounts.get(bonusId)||0)-count;
   if(value>0)next.bonusCounts.set(bonusId,value);
   else next.bonusCounts.delete(bonusId);
  }
  if(rule.soldierBonusType)
   next.bonusCounts.set(rule.soldierBonusType,
    (next.bonusCounts.get(rule.soldierBonusType)||0)+1);
  next.bonusIds=new Set(next.bonusCounts.keys());
 }
 return next;
}
function adjustedGate(raw,bonus,k,include){
 if(!include)return raw;
 let v=Math.max(k==="health"?1:0,raw+n(bonus?.[k]));
 // OXCE psiSkill min qualification special case when raw PSI skill is zero.
 if(k==="psiSkill"&&raw<=0&&v>0)v=raw;
 return v;
}
function statGateVerdict(rule,bounds,state,data){
 const bonus=bonusStats(state,data);
 const uncertain=[];
 for(const k of STAT_KEYS){
  const min=n(rule.requiredMinStats?.[k]);
  const max=rule.requiredMaxStats?.[k]===undefined?9999:
   n(rule.requiredMaxStats[k]);
  const minLow=adjustedGate(bounds.low[k],bonus,k,rule.includeBonusesForMinStats);
  const minHigh=adjustedGate(bounds.high[k],bonus,k,rule.includeBonusesForMinStats);
  const maxLow=adjustedGate(bounds.low[k],bonus,k,rule.includeBonusesForMaxStats);
  const maxHigh=adjustedGate(bounds.high[k],bonus,k,rule.includeBonusesForMaxStats);
  if(minHigh<min||maxLow>max||min>max)
   return {kind:"impossible",stat:k,min,max,
    observedLow:minLow,observedHigh:minHigh};
  if(minLow<min||maxHigh>max)
   uncertain.push({stat:k,min,max,minInterval:[minLow,minHigh],
    maxInterval:[maxLow,maxHigh]});
 }
 return {kind:uncertain.length?"conditional":"interval-pass",uncertain};
}
// Intersect raw coordinates with the actual min and max gates at the SAME
// raw value and soldier-only bonuses. Cross-coordinate RNG remains relaxed.
function restrictedStatGate(rule,bounds,state,data){
 const bonus=bonusStats(state,data),low={...bounds.low},high={...bounds.high},uncertain=[];
 for(const k of STAT_KEYS){
  const min=n(rule.requiredMinStats?.[k]);
  const max=rule.requiredMaxStats?.[k]===undefined?9999:n(rule.requiredMaxStats[k]);
  if(!min&&max===9999)continue;
  const pass=x=>(!min||adjustedGate(x,bonus,k,rule.includeBonusesForMinStats)>=min)&&adjustedGate(x,bonus,k,rule.includeBonusesForMaxStats)<=max;
  let a=Infinity,b=-Infinity;
  for(let x=Math.ceil(low[k]);x<=Math.floor(high[k]);x++)if(pass(x)){a=Math.min(a,x);b=Math.max(b,x);}
  if(!Number.isFinite(a))return {kind:"impossible",stat:k,min,max,observedLow:low[k],observedHigh:high[k]};
  if(a!==low[k]||b!==high[k])uncertain.push({stat:k,min,max,before:[low[k],high[k]],after:[a,b]});
  low[k]=a;high[k]=b;
 }
 return {kind:uncertain.length?"conditional":"interval-pass",uncertain,bounds:{...bounds,low,high}};
}
function applyOpportunity(initial,state,data,choice){
 let e=initial;
 for(const phase of choice.phases){
  e=growStatEnvelope(e,state,data,phase);
  if(e.kind!=="ready")return e;
 }
 return e;
}
function saferVariant(x,y){
 if(!y)return x;
 const diff=penalty(x.schedule)-penalty(y.schedule);
 if(diff!==0)return diff<0?x:y;
 if(x.conditionalGateCrossings!==y.conditionalGateCrossings)
  return x.conditionalGateCrossings<y.conditionalGateCrossings?x:y;
 return x.schedule.join("|")<y.schedule.join("|")?x:y;
}
function pareto(rows,keys){
 const sorted=[...rows].sort((a,b)=>
  sum(vec(b.highEffective,keys))-sum(vec(a.highEffective,keys))||
  penalty(a.schedule)-penalty(b.schedule)||
  a.schedule.join("|").localeCompare(b.schedule.join("|")));
 const front=[];
 for(const row of sorted){
  const v=vec(row.highEffective,keys);
  if(front.some(f=>dominates(vec(f.highEffective,keys),v)))continue;
  front.push(row);
 }
 return front;
}

/**
 * Enumerate all optional growth/physical training windows immediately before
 * every transformation plus a final post-training growth window.
 *
 * @returns {object} RE-LAXED possible upper envelopes, not game-certified maxima
 */
export function evaluateCapGrowthChronologies(
 data,profileId,transformIds,{maxTransformations=5,deduplicateEnvelopes=false,correlatedPercent=false,tightenStatGates=false}={}
){
 if(!Array.isArray(transformIds)||transformIds.length>maxTransformations)
  throw Error("Unsupported transformation length: "+transformIds?.length);
 const profile=data.profiles.find(p=>p.id===profileId);
 if(!profile)throw Error("Missing actual origin profile "+profileId);
 const byRule=new Map(data.transformations.map(t=>[t.id,t]));
 const rules=transformIds.map(id=>{
  const t=byRule.get(id);
  if(!t)throw Error("Missing real transformation "+id);
  return t;
 });
 const states=[initialState(data,profile,{band:"min"})];
 for(const rule of rules){
  const state=states.at(-1);
  if(!rule.allowedSoldierTypes?.includes(state.soldierType)||
   (rule.forbiddenSoldierTypes||[]).includes(state.soldierType)||
   rule.createsClone||rule.producedItem)
   throw Error("Not the same continuing soldier: "+profileId+"/"+rule.id);
  if((rule.requiredPreviousTransformations||[]).some(id=>!state.history.has(id))||
   (rule.forbiddenPreviousTransformations||[]).some(id=>state.history.has(id)))
   throw Error("Transformation history disallows sequence: "+rule.id);
  states.push(transformState(state,rule,byRule));
 }
 const checkGate=tightenStatGates?restrictedStatGate:statGateVerdict;
 const birth=createStatEnvelope(data,profileId);
 if(birth.kind!=="ready")throw Error("Missing real birth interval "+profileId);
 const finalState=states.at(-1);
 const body=data.soldiers.find(x=>x.id===finalState.soldierType);
 if(!body)throw Error("Missing final RuleSoldier "+finalState.soldierType);
 const finalBonus=map(bonusStats(finalState,data));
 const attempted=Math.pow(GROWTH_ORDER_CHOICES.length,transformIds.length+1);
 let candidates=0,gated=0,uncertainGateSchedules=0;
 const variants=new Map();
 const sampleBySchedule=new Map();
 const stageCount=rules.length+1;
 function descend(i,bounds,schedule,gateWarnings,weight=1){
  if(i===stageCount){
   const rawHigh=map(bounds.high),rawLow=map(bounds.low);
   const highEffective=Object.fromEntries(STAT_KEYS.map(k=>[
    k,Math.max(k==="health"?1:0,rawHigh[k]+finalBonus[k])
   ]));
   const lowEffective=Object.fromEntries(STAT_KEYS.map(k=>[
    k,Math.max(k==="health"?1:0,rawLow[k]+finalBonus[k])
   ]));
   const variant={schedule,conditionalGateCrossings:gateWarnings,
    rawUpper:rawHigh,rawLower:rawLow,permanentBonus:finalBonus,
    highEffective,lowEffective,
    nominalCombatCapReference:Object.fromEntries(STAT_KEYS.map(k=>
     [k,n(body.statCaps?.[k])+finalBonus[k]])),
    beyondFinalRawCombatCap:STAT_KEYS.filter(k=>rawHigh[k]>n(body.statCaps?.[k])),
    exceededBirthMaxStats:STAT_KEYS.filter(k=>rawHigh[k]>n(body.maxStats?.[k])),
    hypotheticalGrowthSchedule:true,
    simultaneousHighRealizationNotVerified:true};
   candidates+=weight;
   const key=vec(highEffective,STAT_KEYS).join(",");
   variants.set(key,saferVariant(variant,variants.get(key)));
   const sequenceKey=schedule.join("|");
   sampleBySchedule.set(sequenceKey,variant);
   if(gateWarnings)uncertainGateSchedules+=weight;
   return;
  }
  for(const opt of GROWTH_ORDER_CHOICES){
   let next=applyOpportunity(bounds,states[i],data,opt);
   if(next.kind!=="ready")continue;
   const nextSchedule=[...schedule,opt.id];
   if(i===rules.length){
    descend(i+1,next,nextSchedule,gateWarnings);
    continue;
   }
   const verdict=checkGate(rules[i],next,states[i],data);
   if(verdict.kind==="impossible"){gated++;continue;}
   next=advanceStatEnvelope(rules[i],verdict.bounds||next,data,states[i],{correlatedPercent});
   if(next.kind!=="ready"){gated++;continue;}
   // The envelope carries low and high that can be generated by different
   // independent RNG histories; gate crossing remains explicitly conditional.
   descend(i+1,next,nextSchedule,
    gateWarnings+Number(verdict.kind==="conditional"));
  }
 }
 // Identical envelopes at the same position have the same numerical future:
 // all structural history, body and bonuses are fixed by transformIds.
 // Preserve multiplicity and a deterministic best witness, not just highs.
 const illustrationSchedules=[
  Array(stageCount).fill("NONE"),
  ["COMBAT",...Array(stageCount-1).fill("NONE")],
  [...Array(stageCount-1).fill("NONE"),"COMBAT"],
  ["PHYSICAL",...Array(Math.max(0,stageCount-2)).fill("NONE"),"COMBAT"],
  ["COMBAT",...Array(Math.max(0,stageCount-2)).fill("NONE"),"PHYSICAL"]
 ].filter(s=>s.length===stageCount);
 let compressedTransitions=0;
 if(!deduplicateEnvelopes)descend(0,birth,[],0);
 else {
  let current=[{bounds:birth,schedule:[],conditionalGateCrossings:0,weight:1}];
  const key=(b,w)=>["low","high","initialLow","initialHigh"].flatMap(k=>vec(b[k],STAT_KEYS)).join(",")+"|"+w;
  for(let i=0;i<stageCount;i++){
   const nextLayer=new Map();
   for(const prior of current)for(const opt of GROWTH_ORDER_CHOICES){
    compressedTransitions++;
    let b=applyOpportunity(prior.bounds,states[i],data,opt);
    if(b.kind!=="ready")continue;
    let w=prior.conditionalGateCrossings;
    if(i<rules.length){
     const verdict=checkGate(rules[i],b,states[i],data);
     if(verdict.kind==="impossible"){gated+=prior.weight;continue;}
     b=advanceStatEnvelope(rules[i],verdict.bounds||b,data,states[i],{correlatedPercent});
     if(b.kind!=="ready"){gated+=prior.weight;continue;}
     w+=Number(verdict.kind==="conditional");
    }
    const r={bounds:b,schedule:[...prior.schedule,opt.id],conditionalGateCrossings:w,weight:prior.weight};
    const k=key(b,w),old=nextLayer.get(k);
    if(old){
     const best=saferVariant(r,old);
     nextLayer.set(k,{...best,weight:old.weight+r.weight});
    }else nextLayer.set(k,r);
   }
   current=[...nextLayer.values()];
  }
  for(const r of current)descend(stageCount,r.bounds,r.schedule,r.conditionalGateCrossings,r.weight);
  // Recover the named illustrations even if an equivalent prefix was merged.
  for(const schedule of illustrationSchedules){
   let b=birth,w=0,valid=true;
   for(let i=0;i<stageCount;i++){
    b=applyOpportunity(b,states[i],data,GROWTH_ORDER_CHOICES.find(x=>x.id===schedule[i]));
    if(b.kind!=="ready"){valid=false;break;}
    if(i<rules.length){
     const verdict=checkGate(rules[i],b,states[i],data);
     if(verdict.kind==="impossible"){valid=false;break;}
     w+=Number(verdict.kind==="conditional");
     b=advanceStatEnvelope(rules[i],verdict.bounds||b,data,states[i],{correlatedPercent});
     if(b.kind!=="ready"){valid=false;break;}
    }
   }
   if(valid)descend(stageCount,b,schedule,w,0);
  }
 }
 if(candidates===0)throw Error("No numerically possible growth schedule for real conditional path "+profileId+"/"+transformIds.join(">"));
 const uniqueVariants=[...variants.values()];
 const f8=pareto(uniqueVariants,CAP_GROWTH_EIGHT);
 const f12=pareto(uniqueVariants,STAT_KEYS);
 const serial=r=>({schedule:r.schedule,
  conditionalGateCrossings:r.conditionalGateCrossings,
  rawUpper:r.rawUpper,
  permanentBonus:r.permanentBonus,
  highEffective:r.highEffective,
  beyondFinalRawCombatCap:r.beyondFinalRawCombatCap,
  hypotheticalGrowthSchedule:true,
  simultaneouslyAttainableInRealGameNotProven:true});
 const perStat=Object.fromEntries(STAT_KEYS.map(k=>{
  const max=Math.max(...uniqueVariants.map(r=>r.highEffective[k]));
  const chosen=[...uniqueVariants].filter(r=>r.highEffective[k]===max)
   .sort((a,b)=>penalty(a.schedule)-penalty(b.schedule))[0];
  return [k,{relaxedUpper:max,rawCap:body.statCaps[k],
   retainedBonus:finalBonus[k],sourceCreationMax:profile.currentStatsBeforeTraits?.max?.[k],
   trainingCap:body.trainingStatCaps[k],schedule:chosen.schedule}];
 }));
 const demos={};
 for(const keys of [
  Array(stageCount).fill("NONE"),
  ["COMBAT",...Array(stageCount-1).fill("NONE")],
  [...Array(stageCount-1).fill("NONE"),"COMBAT"],
  ["PHYSICAL",...Array(Math.max(0,stageCount-2)).fill("NONE"),"COMBAT"],
  ["COMBAT",...Array(Math.max(0,stageCount-2)).fill("NONE"),"PHYSICAL"]
 ]){
  if(keys.length!==stageCount)continue;
  const x=sampleBySchedule.get(keys.join("|"));
  demos[keys.join(">")]=x?serial(x):null;
 }
 return {
  sourceProfileId:profileId,classBody:profile.soldierType,
  finalBody:finalState.soldierType,
  transformIds:transformIds,
  sourceBirthMin:map(birth.low),sourceBirthMax:map(birth.high),
  finalBodyRawCombatCaps:map(body.statCaps),
  finalBodyCreationMax:map(body.maxStats),
  finalBodyPhysicalTrainingCaps:map(body.trainingStatCaps),
  retainedBonusIds:[...finalState.bonusIds].sort(),
  retainedPermanentBonus:finalBonus,
  nominalCapPlusBonus:Object.fromEntries(STAT_KEYS.map(k=>[
   k,n(body.statCaps?.[k])+finalBonus[k]
  ])),
  totals:{
   choicesPerGap:GROWTH_ORDER_CHOICES.length,
   equivalentEnvelopeDeduplication:deduplicateEnvelopes,
   currentValueCorrelatedPercentBounds:correlatedPercent,
   numericGateIntersection:tightenStatGates,
   compressedTransitions:deduplicateEnvelopes?compressedTransitions:null,
   growthWindowCount:stageCount,
   combinatorialGrowthSchedules:attempted,
   eligibleSchedulesAfterStatGate:candidates,
   numericGateExclusionAtIntermediatePrefixes:gated,
   conditionalStatGateCrossingSchedules:uncertainGateSchedules,
   distinctTwelveStatHighVectors:variants.size,
   withinPathEightStatUpperFrontier:f8.length,
   withinPathTwelveStatUpperFrontier:f12.length
  },
  frontiers:{
   eight:f8.map(serial),
   twelve:f12.map(serial)
  },
  perStatOptimisticUpper:perStat,
  selectedGrowthTimingIllustrations:demos,
  method:{
   statEnvelopeCreationUsesActualMinToMaxNotSingleBirthRoll:true,
   physicalTrainingCapsAppliedSeparately:true,
   battleGrowthMayOverstepRawStatCaps:true,
   allExistingTransformationUpperBoundAtMaxStatsAndAtStatCapsObeyed:true,
   retainedBonusesDeduplicatedBySameBonusId:true,
   completeResearchAndGrowthOpportunityLegalityNotVerified:true,
   earlyAndLateCombatGrowthAreMutuallyExclusiveScheduleChoicesWhenAppropriate:true,
   coordinateUpperBoundsCanMixIncompatibleBirthAndGrowthRngRolls:true
  }
 };
}
