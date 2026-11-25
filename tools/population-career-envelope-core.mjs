// Rank/retained-bonus abstraction for the branch-conditioned numeric model.
// Each medal type has one decoration level in eligibility.bonusStats;
// modular medals retain the union of all level IDs conservatively.
// The graph allows promotion without time/XP, and assumes medal gates
// satisfiable. It is an optimistic envelope, NOT a reachable campaign.
import assert from "node:assert/strict";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
const arr=x=>Array.isArray(x)?x:[];
const pos=n=>Math.max(0,n||0);
const zeros=()=>STAT_KEYS.map(()=>0);
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const vmax=(a,b)=>a.map((n,i)=>Math.max(n,b[i]));
const subset=(a,b)=>(a&b)===a;
export function careerEnvelopeModel(data,ruleIds,conflictMasks){
 const byId=new Map(data.transformations.map(r=>[r.id,r])),rules=ruleIds.map(id=>byId.get(id));
 assert(rules.every(r=>r&&!r.createsClone&&!r.producedItem&&!arr(r.removeTransformations).length),
  "Selective removal / cloning requires counter-sensitive bonus abstraction");
 const bodies=new Map(data.soldiers.map(b=>[b.id,b])),bonuses=new Map();
 for(const b of data.bonuses)if(!bonuses.has(b.id))bonuses.set(b.id,b.stats||{});
 const rawBonus=id=>STAT_KEYS.map(k=>pos(bonuses.get(id)?.[k]));
 const medals=[],modular=new Set(),medalUnion=new Set();
 for(const [id,m] of Object.entries(data.commendationIndex||{})){
  if(id==="STR_MEDAL_WEAPON_PROFICIENCY_NAME"||!arr(m.bonusLevels).length)continue;
  const levels=[...new Set(m.bonusLevels.filter(Boolean))];if(!levels.length)continue;
  assert(levels.every(k=>bonuses.has(k)));
  for(const k of levels)medalUnion.add(k);
  // The indexed model represents one level per ordinary medal. Retain
  // all unique IDs for region/race and any unfamiliar modular criterion.
  const multi=Object.keys(m.criteria||{}).some(k=>/By|WithA|InA|Per/i.test(k));
  if(multi)for(const k of levels)modular.add(k);
  medals.push({id,levels,multi,upper:multi?levels.map(rawBonus).reduce(add,zeros()):levels.map(rawBonus).reduce(vmax,zeros())});
 }
 const normal=medals.filter(m=>!m.multi).map(m=>m.upper).reduce(add,zeros());
 const medalUpper=add(normal,[...modular].map(rawBonus).reduce(add,zeros()));
 const medalUnionUpper=[...medalUnion].map(rawBonus).reduce(add,zeros());
 // Shared IDs may be double counted between ordinary medals or with
 // transformations; the old all-ID union is also an independent upper bound.
 const globalBonusIds=[...new Set([...data.profiles.flatMap(p=>[...arr(p.traitNames),...Object.keys(p.traitCounts||{})]),
  ...rules.map(r=>r.soldierBonusType).filter(Boolean)])].sort();
 const bonusBits=new Map(globalBonusIds.map((id,i)=>[id,1n<<BigInt(i)]));
 const bit=id=>bonusBits.get(id)||0n,ruleBits=rules.map((_,i)=>1n<<BigInt(i));
 const bonusVectorCache=new Map();
 function bonusVector(mask){
  const k=mask.toString(16);
  if(!bonusVectorCache.has(k))bonusVectorCache.set(k,globalBonusIds.filter(id=>mask&bit(id)).map(rawBonus).reduce(add,zeros()));
  return bonusVectorCache.get(k);
 }
 const rankLimit=Math.max(0,...rules.map(r=>r.minRank||0),...data.profiles.map(p=>p.rank||0),...data.soldiers.map(b=>arr(b.raw?.rankStrings).length-1));
 // No indexed rank list: relax all ranks needed by the model, do not invent
 // a restrictive default. Existing high ranks can survive same-body actions.
 const maxRank=b=>b.allowPromotion===false?0:arr(b.raw?.rankStrings).length?b.raw.rankStrings.length-1:rankLimit;
 const byBody=new Map();
 for(let i=0;i<rules.length;i++)for(const from of arr(rules[i].allowedSoldierTypes)){
  const r=rules[i];if(arr(r.forbiddenSoldierTypes).includes(from))continue;
  const to=r.producedSoldierType||from;assert(bodies.has(from)&&bodies.has(to));
  const x=byBody.get(from)||[];x.push({i,r,to});byBody.set(from,x);
 }
 const conflicts=conflictMasks.map(x=>BigInt("0x"+x));
 assert.equal(conflicts.length,rules.length);
 const metrics={independentSolves:0,maskCases:0,states:0,edgeRequests:0,rankRejected:0,minimumRejected:0,resetEdges:0,updates:0,proofEdges:0,rankConditionalEdges:0,medalConditionalEdges:0};
 const maskMemo=new Map();
 function split(mask){
  const k=mask.toString(16);if(maskMemo.has(k))return maskMemo.get(k);
  for(let i=0;i<rules.length;i++)if(mask&ruleBits[i]){
   const bad=mask&conflicts[i];if(!bad)continue;
   // Every valid used-action subset omits at least one endpoint. The
   // union of the two maximal permitted masks covers all such subsets.
   const j=ruleBits.findIndex(b=>bad&b);assert(j>=0&&j!==i);
   const all=[...split(mask&~ruleBits[i]),...split(mask&~ruleBits[j])];
   const unique=[...new Set(all)].filter(x=>!all.some(y=>x!==y&&subset(x,y)));
   maskMemo.set(k,unique);return unique;
  }
  maskMemo.set(k,[mask]);return [mask];
 }
 function solve(profile,old,allowPairSplit=true){
  metrics.independentSolves++;
  const oldBodies=new Map(old.bounds.map(b=>[b.body,b]));
  const mask=rules.reduce((m,r,i)=>old.repeatCaps[i]===0?m:m|ruleBits[i],0n);
  const cases=allowPairSplit?split(mask):[mask],initialRank=Number(profile.rank||0);
  assert(Number.isSafeInteger(initialRank)&&initialRank>=0);
  const traits=[...new Set([...arr(profile.traitNames),...Object.entries(profile.traitCounts||{}).filter(([,n])=>n>0).map(([id])=>id)])].sort();
  const initMask=traits.reduce((m,id)=>m|bit(id),0n);
  const allowedMin=(r,from)=>{
   const b=oldBodies.get(from);if(!b)return false;
   return STAT_KEYS.every((k,i)=>{
    const need=Number(r.requiredMinStats?.[k]||0);
    // Bonus-inclusive gates have the special psiSkill raw=0 rule; relaxing
    // that rule only increases the gate upper bound. Old envelope is safe.
    return !need||need<=(r.includeBonusesForMinStats?b.effective[i]:b.raw[i]);
   });
  };
  const resultByBody=new Map(),receipts=[];
  for(const cm of cases){
   metrics.maskCases++;
   const states=new Map(),q=[],pending=new Set(),used=new Set();
   const stateKey=(b,r)=>b+"|"+r;
   function admit(body,rank,bits){
    const k=stateKey(body,rank),s=states.get(k),next=(s?.bits||0n)|bits;
    if(s&&next===s.bits)return;
    states.set(k,{body,rank,bits:next});metrics.updates++;
    if(!pending.has(k)){pending.add(k);q.push(k);}
   }
   function visit(s,emit,count){
    const b=bodies.get(s.body),mr=maxRank(b);
    if(b.allowPromotion!==false&&s.rank<mr)emit(s.body,s.rank+1,s.bits,"PROMOTION_ASSUMED");
    for(const {i,r,to} of byBody.get(s.body)||[]){
     if(!(cm&ruleBits[i])||!oldBodies.has(to))continue;
     if(count)metrics.edgeRequests++;
     if(s.rank<(r.minRank||0)){if(count)metrics.rankRejected++;continue;}
     if(!allowedMin(r,s.body)){if(count)metrics.minimumRejected++;continue;}
     let rank=s.rank;
     if(to!==s.body){
      const b2=bodies.get(to);
      if(b2.allowPromotion===false)rank=0;
      else if(arr(b2.raw?.rankStrings).length)rank=Math.min(rank,b2.raw.rankStrings.length-1);
     }
     if(r.resetRank)rank=0;
     const bits=(r.reset?0n:s.bits)|bit(r.soldierBonusType);
     if(count){
      if(r.reset)metrics.resetEdges++;
      if(r.minRank)metrics.rankConditionalEdges++;
      if(Object.keys(r.requiredCommendations||{}).length)metrics.medalConditionalEdges++;
      used.add(r.id);
     }
     emit(to,rank,bits,r.id);
    }
   }
   admit(profile.soldierType,initialRank,initMask);
   for(let i=0;i<q.length;i++){const k=q[i];pending.delete(k);visit(states.get(k),admit,true);}
   assert(subset(initMask,states.get(stateKey(profile.soldierType,initialRank)).bits));
   for(const s of states.values())visit(s,(body,rank,bits)=>{
    const dest=states.get(stateKey(body,rank));assert(dest&&subset(bits,dest.bits),"Open rank/bonus edge");metrics.proofEdges++;
   },false);
   metrics.states+=states.size;
   const bs=new Map();
   for(const {body,rank,bits} of states.values()){
    const x=bs.get(body)||{bits:0n,ranks:[]};x.bits|=bits;x.ranks.push(rank);bs.set(body,x);
   }
   // Union across ranks inside one case, then max across mutually
   // exclusive action-mask cases (do not sum their bonuses).
   for(const [body,x] of bs){
    const b=oldBodies.get(body);assert(b);
    const t=bonusVector(x.bits),newUpper=add(t,medalUpper).map((n,i)=>Math.min(n,old.bonusUpper[i]));
    const value={body,raw:b.raw,bonusUpper:newUpper,effective:add(b.raw,newUpper),ranks:x.ranks.sort((a,b)=>a-b),retainedMask:x.bits.toString(16)};
    const prev=resultByBody.get(body);
    if(!prev)resultByBody.set(body,value);
    else resultByBody.set(body,{...prev,bonusUpper:vmax(prev.bonusUpper,newUpper),effective:vmax(prev.effective,value.effective),
      ranks:[...new Set([...prev.ranks,...value.ranks])].sort((a,b)=>a-b),retainedMask:(BigInt("0x"+prev.retainedMask)|x.bits).toString(16)});
   }
   receipts.push({allowedMask:cm.toString(16),states:[...states.values()].map(s=>[s.body,s.rank,s.bits.toString(16)]).sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]),usedRules:[...used].sort()});
  }
  const bounds=[...resultByBody.values()].sort((a,b)=>a.body.localeCompare(b.body));
  assert(bounds.length>0);
  const rawMax=bounds.map(b=>b.raw).reduce(vmax),effectiveMax=bounds.map(b=>b.effective).reduce(vmax);
  assert(rawMax.every((n,i)=>n<=old.rawMax[i])&&effectiveMax.every((n,i)=>n<=old.effectiveMax[i]));
  return {body:profile.soldierType,initialRank,traits,bounds,rawMax,effectiveMax,receipts};
 }
 return {solve,metrics,medals,medalUpper,medalUnionUpper,bonusIds:globalBonusIds,rankLimit,split};
}
