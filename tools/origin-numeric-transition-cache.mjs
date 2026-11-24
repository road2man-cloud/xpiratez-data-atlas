// Exact memoization of the *numerical* chronological envelope transfer.
// Not equivalence of campaign/research, resources, rank progression or RNG.
// The caller pins the rules and evaluator dependencies to one immutable revision.
import {STAT_KEYS,initialState,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {createStatEnvelope,advanceStatEnvelope} from "../public/soldiers/modern/stat-envelope.js";
import {growStatEnvelope} from "../public/soldiers/modern/growth-envelope.js";
const opts=[["NONE",[]],["PHYSICAL",["@PHYS_TRAINING"]],["COMBAT",["@BATTLE_GROWTH"]],["PHYSICAL_COMBAT",["@PHYS_TRAINING","@BATTLE_GROWTH"]],["COMBAT_PHYSICAL",["@BATTLE_GROWTH","@PHYS_TRAINING"]]];
const vec=x=>STAT_KEYS.map(k=>x[k]);
const map=x=>Object.fromEntries(STAT_KEYS.map(k=>[k,Number(x?.[k])||0]));
const key=x=>JSON.stringify(x);
const cmp=(a,b)=>a[0].localeCompare(b[0]);
const entries=m=>[...m].sort(cmp);
const boundsKey=b=>[b.kind,vec(b.low),vec(b.high),vec(b.initialLow),vec(b.initialHigh)];
// Source ID is intentionally absent only from the numeric key. The acquisition
// evidence and each origin's full action order remain independent records.
const structuralKey=s=>[s.soldierType,s.armorId,s.status,s.rank,s.corpseRecovered,s.retired,entries(s.history),entries(s.bonusCounts),[...s.bonusIds].sort(),vec(s.currentStats),vec(s.initialStats)];
const add=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
const penalties=Object.fromEntries(opts.map(([id,p])=>[id,p.length]));
const penalty=s=>s.reduce((n,x)=>n+penalties[x],0);
const better=(a,b)=>!b||penalty(a.schedule)<penalty(b.schedule)||penalty(a.schedule)===penalty(b.schedule)&&(a.warnings<b.warnings||a.warnings===b.warnings&&a.schedule.join("|")<b.schedule.join("|"));
const dominates=(a,b)=>a.every((v,i)=>v>=b[i])&&a.some((v,i)=>v>b[i]);
const sum=v=>v.reduce((a,b)=>a+b,0);
function nextState(s,r,byRule){
 const history=new Map(s.history),bonusCounts=new Map(s.bonusCounts);
 if(r.reset){history.clear();bonusCounts.clear();}
 else for(const id of r.removeTransformations||[]){
  const count=history.get(id)||0;if(!count)continue;
  history.delete(id);const bid=byRule.get(id)?.soldierBonusType;if(!bid)continue;
  const n=(bonusCounts.get(bid)||0)-count;if(n>0)bonusCounts.set(bid,n);else bonusCounts.delete(bid);
 }
 history.set(r.id,(history.get(r.id)||0)+1);
 if(r.soldierBonusType)bonusCounts.set(r.soldierBonusType,(bonusCounts.get(r.soldierBonusType)||0)+1);
 return {...s,history,bonusCounts,bonusIds:new Set(bonusCounts.keys()),soldierType:r.producedSoldierType||s.soldierType};
}
function restrict(r,b,s,data){
 const bonus=bonusStats(s,data),low={...b.low},high={...b.high};let warning=false;
 for(const k of STAT_KEYS){
  const min=Number(r.requiredMinStats?.[k])||0,max=r.requiredMaxStats?.[k]===undefined?9999:Number(r.requiredMaxStats[k])||0;
  if(!min&&max===9999)continue;
  const adj=(x,on)=>!on?x:k==="psiSkill"&&x<=0&&Math.max(0,x+(bonus[k]||0))>0?x:Math.max(k==="health"?1:0,x+(bonus[k]||0));
  let a=Infinity,z=-Infinity;
  for(let x=Math.ceil(low[k]);x<=Math.floor(high[k]);x++)if((!min||adj(x,r.includeBonusesForMinStats)>=min)&&adj(x,r.includeBonusesForMaxStats)<=max){a=Math.min(a,x);z=Math.max(z,x);}
  if(!Number.isFinite(a))return null;
  if(a!==low[k]||z!==high[k])warning=true;
  low[k]=a;high[k]=z;
 }
 return {bounds:{...b,low,high},warning};
}
export function createNumericTransitionCache(data,{enabled=true,maxEntries=200000}={}){
 const byRule=new Map(data.transformations.map(r=>[r.id,r])),memo=new Map();
 const metrics={calls:0,hits:0,misses:0,evictions:0,peakEntries:0,models:0};
 function transfer(bounds,state,rule,choice){
  const [id,phases]=choice;metrics.calls++;
  const k=enabled?key([boundsKey(bounds),structuralKey(state),rule?.id??null,id]):null;
  if(enabled&&memo.has(k)){metrics.hits++;return memo.get(k);}
  metrics.misses++;
  let b=bounds,out=null,warning=false;
  for(const phase of phases){b=growStatEnvelope(b,state,data,phase);if(b.kind!=="ready")break;}
  if(b.kind==="ready"){
   if(rule){const t=restrict(rule,b,state,data);if(t){warning=t.warning;b=advanceStatEnvelope(rule,t.bounds,data,state,{correlatedPercent:true});if(b.kind==="ready")out={bounds:b,warning};}}
   else out={bounds:b,warning};
  }
  if(enabled){if(memo.size>=maxEntries){memo.delete(memo.keys().next().value);metrics.evictions++;}memo.set(k,out);metrics.peakEntries=Math.max(metrics.peakEntries,memo.size);}
  return out;
 }
 function evaluate(profileId,order){
  metrics.models++;
  const profile=data.profiles.find(p=>p.id===profileId);
  if(!profile||!Array.isArray(order)||order.length>16)throw Error("Unsupported numeric job");
  const states=[initialState(data,profile,{band:"min"})],rules=[];
  for(const id of order){
   const r=byRule.get(id),s=states.at(-1);
   if(!r||!r.allowedSoldierTypes?.includes(s.soldierType)||(r.forbiddenSoldierTypes||[]).includes(s.soldierType)||r.createsClone||r.producedItem||(r.requiredPreviousTransformations||[]).some(x=>!s.history.has(x))||(r.forbiddenPreviousTransformations||[]).some(x=>s.history.has(x)))throw Error("Structural gate "+id);
   rules.push(r);states.push(nextState(s,r,byRule));
  }
  const birth=createStatEnvelope(data,profileId);if(birth.kind!=="ready")throw Error("Missing birth envelope");
  let layer=[{bounds:birth,schedule:[],warnings:0,weight:1}];
  for(let i=0;i<states.length;i++){
   const next=new Map();
   for(const x of layer)for(const choice of opts){
    const t=transfer(x.bounds,states[i],rules[i],choice);if(!t)continue;
    const y={bounds:t.bounds,schedule:[...x.schedule,choice[0]],warnings:x.warnings+Number(t.warning),weight:x.weight};
    const k=key([boundsKey(y.bounds),y.warnings]),old=next.get(k);
    if(!old)next.set(k,y);else next.set(k,{...(better(y,old)?y:old),weight:old.weight+y.weight});
   }
   layer=[...next.values()];
  }
  if(!layer.length)throw Error("No numerical schedule");
  const final=states.at(-1),bonus=vec(map(bonusStats(final,data))),variants=new Map();
  const eligibleSchedules=layer.reduce((n,x)=>n+x.weight,0);
  function retain(x){
   const raw=vec(x.bounds.high),vector=raw.map((n,i)=>Math.max(STAT_KEYS[i]==="health"?1:0,n+bonus[i]));
   const y={raw,bonus,vector,schedule:x.schedule,warnings:x.warnings};
   const k=key(vector);if(better(y,variants.get(k)))variants.set(k,y);
  }
  for(const x of layer)retain(x);
  // Match pinned evaluator's named growth timing illustrations, which may
  // select a different representative of a merged envelope.
  const n=states.length,illustrations=[Array(n).fill("NONE"),["COMBAT",...Array(n-1).fill("NONE")],[...Array(n-1).fill("NONE"),"COMBAT"],["PHYSICAL",...Array(Math.max(0,n-2)).fill("NONE"),"COMBAT"],["COMBAT",...Array(Math.max(0,n-2)).fill("NONE"),"PHYSICAL"]].filter(s=>s.length===n);
  for(const schedule of illustrations){let b=birth,warnings=0,valid=true;for(let i=0;i<n;i++){const t=transfer(b,states[i],rules[i],opts.find(x=>x[0]===schedule[i]));if(!t){valid=false;break;}b=t.bounds;warnings+=Number(t.warning);}if(valid)retain({bounds:b,schedule,warnings});}
  const all=[...variants.values()].sort((a,b)=>sum(b.vector)-sum(a.vector)||penalty(a.schedule)-penalty(b.schedule)||a.schedule.join("|").localeCompare(b.schedule.join("|")));
  const frontier=[];for(const x of all)if(!frontier.some(y=>dominates(y.vector,x.vector)))frontier.push(x);
  return {profileId,order,body:final.soldierType,frontier,eligibleSchedules,coordinateMax:STAT_KEYS.map((_,i)=>Math.max(...all.map(x=>x.vector[i]))),actualGameCertified:false};
 }
 return {evaluate,metrics,clear:()=>memo.clear()};
}
