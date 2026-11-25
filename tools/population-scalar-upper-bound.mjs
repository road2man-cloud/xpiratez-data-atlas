// Admissible scalar abstraction of the fixed-active, healthy, deterministic
// no-clone CAP_TARGET model. NOT an upper bound on unrestricted gameplay.
// Every exact transition projects to one abstract transition. We deliberately
// relax cross-stat gates, transformation history, rank demotions, negatives
// and bonus removals, while retaining source body/research and depth.
import {STAT_KEYS,statChangeEngineEstimate} from "../public/soldiers/modern/eligibility.js";
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const floor=k=>k==="health"?1:0;
const sourceCache=new WeakMap();
function source(data){
 if(sourceCache.has(data))return sourceCache.get(data);
 const bodies=new Map(data.soldiers.map(b=>[b.id,b])),bonus=new Map();
 // bonusStats uses first matching record, not last.
 for(const b of data.bonuses)if(!bonus.has(b.id))bonus.set(b.id,b.stats||{});
 const positive=new Map();
 for(const k of STAT_KEYS){
  const pos=[...bonus].filter(([,v])=>num(v[k])>0),bit=new Map(pos.map(([id],i)=>[id,1n<<BigInt(i)])),values=new Map(pos.map(([id,v])=>[bit.get(id),num(v[k])]));
  positive.set(k,{bit,values,sumMemo:new Map([[0n,0]])});
 }
 const result={bodies,bonus,positive};sourceCache.set(data,result);return result;
}
export const deterministicRule=(r,bodies)=>STAT_KEYS.every(k=>
 ["flat","percent","percentGained"].every(f=>num(r[f+"Min"]?.[k])===num(r[f+"Max"]?.[k]))&&
 (!r.rerollStats?.[k]||bodies.every(b=>num(b.minStats?.[k])===num(b.maxStats?.[k]))));
export function scalarGrowth(body,k,value,data){
 if(k==="mana"&&!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary)return value;
 const c=body.statCaps[k];
 return Number.isSafeInteger(c)&&c>value?k==="bravery"?value+10*Math.floor((c-value)/10):c:value;
}
export function scalarTransform(r,from,to,k,current,initial){
 const gained=current-initial;
 let change=num(r.flatOverallStatChange?.[k])+num(r.flatMin?.[k]);
 change+=Math.trunc(current*num(r.percentOverallStatChange?.[k])/100);
 change+=Math.trunc(current*num(r.percentMin?.[k])/100);
 change+=Math.trunc(gained*num(r.percentGainedStatChange?.[k])/100);
 change+=Math.trunc(gained*num(r.percentGainedMin?.[k])/100);
 if(k==="bravery")change=Math.trunc((change+(change<0?-5:5))/10)*10;
 if(r.lowerBoundAtMinStats)change=Math.max(change,num(to.minStats?.[k])-current);
 if(r.upperBoundAtMaxStats||r.upperBoundAtStatCaps){
  const b=r.upperBoundAtMaxStats?num(to.maxStats?.[k]):num(to.statCaps?.[k]);
  const soft=Number(r.upperBoundType)===1||((r.upperBoundType==null||num(r.upperBoundType)===0)&&from.id===to.id);
  if(soft){if(change>0)change=current<=b?Math.min(change,b-current):0;}else change=Math.min(change,b-current);
 }
 return r.rerollStats?.[k]?num(to.minStats?.[k]):current+change;
}
export function createScalarBound(data,rules,mask,{checkScalar=false}={}){
 const {bodies,positive}=source(data),allowed=new Map();
 for(let i=0;i<rules.length;i++){
  const r=rules[i];if(!(mask&(1n<<BigInt(i))))continue;
  // Random rules are excluded ONLY when the exact model must reject them.
  // A body-specific reroll can be deterministic for some destinations.
  for(const id of r.allowedSoldierTypes||[]){
   const b=bodies.get(r.producedSoldierType||id);
   if(!b||!deterministicRule(r,[b])||r.forbiddenSoldierTypes?.includes(id)||Object.keys(r.requiredCommendations||{}).length)continue;
   const a=allowed.get(id)||[];a.push([r,b]);allowed.set(id,a);
  }
 }
 const metrics={calls:0,computed:0,hits:0,scalarTransitions:0,parityChecks:0};
 // Independent scalar contexts have disjoint bonus masks and memos.
 const contexts=new Map();
 function context(k){
  if(contexts.has(k))return contexts.get(k);
  const {bit,values,sumMemo}=positive.get(k),memo=new Map();
  function sum(mask){
   let s=sumMemo.get(mask);if(s!==undefined)return s;s=0;
   let left=mask;while(left){const low=left&-left;s+=values.get(low);left-=low;}sumMemo.set(mask,s);return s;
  }
  function bound(body,raw,ini,rank,left,positive){
   metrics.calls++;
   const key=body.id+"|"+raw+"|"+ini+"|"+rank+"|"+left+"|"+positive.toString(36);
   if(memo.has(key)){metrics.hits++;return memo.get(key);}
   metrics.computed++;
   const grown=scalarGrowth(body,k,raw,data);
   let best=Math.max(floor(k),grown+sum(positive)); // positive only; psi gate relaxed.
   if(left>0)for(const [r,to] of allowed.get(body.id)||[]){
    if(num(r.minRank)>rank)continue; // exact rank cannot increase in scope.
    const nextPositive=positive|(bit.get(r.soldierBonusType)||0n);
    for(const v of grown===raw?[raw]:[raw,grown]){
     const x=scalarTransform(r,body,to,k,v,ini);metrics.scalarTransitions++;
     if(!Number.isSafeInteger(x)){best=Infinity;continue;} // fail open.
     if(checkScalar){
      const e=statChangeEngineEstimate(r,{soldierType:body.id,currentStats:{[k]:v},initialStats:{[k]:ini}},data);
      if(e.stats[k]!==x)throw Error("Scalar transition disagrees "+r.id+"/"+k);metrics.parityChecks++;
     }
     // Exact model rejects an action with any raw stat below its fixed minimum.
     if(x<floor(k))continue;
     best=Math.max(best,bound(to,x,ini,rank,left-1,nextPositive));
    }
   }
   memo.set(key,best);return best;
  }
  const result={bit,bound};contexts.set(k,result);return result;
 }
 return {metrics,upper(s,left,k){
  if(!Number.isInteger(left)||left<0||!STAT_KEYS.includes(k))throw Error("Invalid bound input");
  const body=bodies.get(s.soldierType),raw=s.currentStats[k],ini=s.initialStats[k];
  if(!body||!Number.isSafeInteger(raw)||!Number.isSafeInteger(ini)||!Number.isInteger(s.rank))return Infinity;
  const c=context(k);let b=0n;for(const id of s.bonusIds)b|=c.bit.get(id)||0n;
  return c.bound(body,raw,ini,s.rank,left,b);
 }};
}
