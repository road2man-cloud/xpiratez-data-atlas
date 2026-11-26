// Search priority and conservative numeric closure, deliberately separated.
// Forecasts may be wrong. A certified bound is only for the conditional
// ordinary-body permanent-current/cap objective, within one origin/branch.
// It does not certify a campaign, research-target coverage, or global optimum.
import {STAT_KEYS,statChangeEngineEstimate} from "../public/soldiers/modern/eligibility.js";
import {scalarGrowth} from "./population-scalar-upper-bound.mjs";
import {member,exactWorld} from "./population-growth-replay-core.mjs";
const CHORT="STR_SOLDIER_CHORT",key=(o,b,t)=>JSON.stringify([o,b,t]);
const vector=r=>[...r.current,...r.cap],valid=v=>Array.isArray(v)&&v.length===12&&v.every(Number.isSafeInteger);
const dominates=(a,b)=>a.every((v,i)=>v>=b[i]);
const vec=o=>STAT_KEYS.map(k=>Number(o?.[k]||0));
const obj=v=>Object.fromEntries(STAT_KEYS.map((k,i)=>[k,v[i]]));
const floor=k=>k==="health"?1:0;
const total=v=>v.reduce((a,b)=>a+b,0);
const num=x=>Number(x||0);
const covers=(a,b)=>b.every(k=>a.includes(k));
export function createCareerParetoSearch({data,db,branches,commit,allChoice}){
 const metrics={policy:"PARETO_FORECAST_AND_CONSERVATIVE_SAME_BODY_BOUND_V1",frontierScopes:0,frontierWitnesses:0,forecast:{novel:0,near:0,open:0,low:0},selected:{novel:0,near:0,open:0,low:0},boundChecks:0,boundUnknown:0,boundNotDominated:0,boundDominated:0,boundReasons:{},deferredGroups:0};
 const sets=db.careerCompletion?.researchTraitSets,frontiers=new Map(),bodies=new Map(data.soldiers.map(b=>[b.id,b])),bonuses=new Map();
 for(const b of data.bonuses)if(!bonuses.has(b.id))bonuses.set(b.id,b.stats||{});
 function add(r){
  if(!valid(r.current)||!valid(r.cap)||!r.goals?.length||!r.difficulties?.length)return;
  const k=key(r.origin,r.branch,r.body),a=frontiers.get(k)||[],v=vector(r);
  // Retain difficulty and goal coverage in the index. A narrower witness
  // must not erase a wider one even when its numeric vector is better.
  if(a.some(q=>covers(q.difficulties,r.difficulties)&&covers(q.goals,r.goals)&&dominates(q.v,v)))return;
  frontiers.set(k,[...a.filter(q=>!(covers(r.difficulties,q.difficulties)&&covers(r.goals,q.goals)&&dominates(v,q.v))),{...r,v}]);
 }
 for(const a of db.careerCompletion?.rows||[]){
  if(a.proofKind!=="REPLAYED_RESEARCH_LINE_V1")continue;
  const p=sets?.pairs?.[a.id];if(!p||p.body===CHORT)continue;
  for(const x of [a,...(a.alternatives||[])]){
   const r=sets.records[x.routeId];if(!r||r.pairId!==a.id)continue;
   add({id:x.routeId,origin:p.origin,branch:p.branch,body:p.body,difficulties:p.difficulties,goals:r.goals,current:r.current,cap:r.cap,stateHash:r.stateHash});
  }
 }
 metrics.frontierScopes=frontiers.size;metrics.frontierWitnesses=[...frontiers.values()].reduce((s,a)=>s+a.length,0);
 const labels=["novel","near","open","low"];
 const effect=(raw,b)=>raw.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&b[i]>0?v:Math.max(floor(STAT_KEYS[i]),v+b[i]));
 function estimate(n,r,g){
  const body=r.producedSoldierType||n.body,dest=bodies.get(body),refs=frontiers.get(key(g.origin,g.branch,body))||[];
  const unknown=()=>({tier:2,label:"open",gap:null,score:0,estimated:false,body});
  let answer;
  if(!refs.length)answer={tier:0,label:"novel",gap:0,score:20,estimated:false,body};
  else if(!dest||r.reset||r.removeTransformations?.length||!valid(n.raw)||!valid(n.capRaw)||!valid(n.permanentBonus))answer=unknown();
  else{
   const bonus=n.permanentBonus.map((v,i)=>v+(r.soldierBonusType&&!n.traits.includes(r.soldierBonusType)?num(bonuses.get(r.soldierBonusType)?.[STAT_KEYS[i]]):0));
   const options=[];
   for(const v of [n.raw,n.capRaw]){
    const q=statChangeEngineEstimate(r,{soldierType:n.body,currentStats:obj(v),initialStats:obj(g.nodes[0].raw)},data);
    if(q.hasUnmodelled)continue;
    const raw=vec(q.stats),cap=STAT_KEYS.map((k,i)=>scalarGrowth(dest,k,raw[i],data)),forecast=[...effect(raw,bonus),...effect(cap,bonus)];
    if(!forecast.every(Number.isSafeInteger))continue;
    // Compare a candidate against real joint vectors, never a collection
    // of independent coordinate maxima from different paths.
    const ds=refs.filter(z=>dominates(z.v,forecast));
    if(!ds.length){
     const gain=Math.max(...refs.map(z=>forecast.reduce((s,v,i)=>s+Math.max(0,v-z.v[i])/Math.max(20,z.v[i]),0)/24));
     options.push({tier:0,gap:0,score:20+Math.min(30,gain*100),estimated:true,body});
    }else{
     let closest;
     for(const z of ds){
      const deficits=z.v.map((v,i)=>(v-forecast[i])/Math.max(20,v)),gap=total(deficits)/24+Math.max(...deficits)*.15;
      if(!closest||gap<closest.gap)closest={gap,id:z.id};
     }
     // A low forecast does NOT imply an unreachable final improvement.
     const tier=closest.gap<=.035?1:closest.gap<=.10?2:3;
     options.push({tier,gap:closest.gap,score:Math.max(-25,12-closest.gap*160),estimated:true,body,dominatingWitness:closest.id});
    }
   }
   answer=options.sort((a,b)=>a.tier-b.tier||b.score-a.score)[0]||unknown();
   answer.label=labels[answer.tier];
  }
  metrics.forecast[answer.label]++;return answer;
 }
 function select(x){metrics.selected[x.pareto.label]++;}
 const live=data.transformations.filter(r=>r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"));
 const chortReturn=live.some(r=>r.allowedSoldierTypes?.includes(CHORT)&&r.producedSoldierType&&r.producedSoldierType!==CHORT);
 const ruleCache=new Map();
 function rules(b,body){
  const k=key("",b.id,body);if(!ruleCache.has(k)){
   const keep=new Set(commit(b)),blocked=new Set(b.blockedResearch||[]);
   ruleCache.set(k,live.filter(r=>r.allowedSoldierTypes?.includes(body)&&!r.forbiddenSoldierTypes?.includes(body)&&r.requires.every(k=>!blocked.has(k)&&(!allChoice.has(k)||keep.has(k)))));
  }return ruleCache.get(k);
 }
 const unknown=reason=>{metrics.boundUnknown++;metrics.boundReasons[reason]=(metrics.boundReasons[reason]||0)+1;return null;};
 // Integer over-approximation of any number of legal subsequent same-body
 // steps. Ignore all positive research/resource/stat/rank gates; only exclude
 // branch-blocked and irreversibly history-blocked actions. A reachable
 // reset, body change, or unbounded increasing repeat fails open.
 function bound({g,b,n,w,goals}){
  metrics.boundChecks++;
  const s=member(w)?.state,body=bodies.get(n.body);
  if(!s?.exactStats||!s.historyKnown||s.soldierType!==n.body||!body||n.body===CHORT||chortReturn||!goals.length)return unknown("UNKNOWN_STATE_OR_SCOPE");
  const refs=(frontiers.get(key(g.origin,b.id,n.body))||[]).filter(q=>covers(q.difficulties,g.allowedDifficulties)&&covers(q.goals,goals));
  if(!refs.length)return unknown("NO_COMPARABLE_WITNESS");
  let rs=rules(b,n.body).filter(r=>r.producedSoldierType!==CHORT);
  // A history eraser may make a currently forbidden operation available.
  if(rs.some(r=>r.reset||r.removeTransformations?.length))return unknown("POSSIBLE_HISTORY_ERASURE");
  rs=rs.filter(r=>!r.forbiddenPreviousTransformations?.some(k=>s.history.has(k)));
  // Required history not produced by any remaining action is impossible.
  // Iterate a relaxed closure; never infer impossibility from absent research.
  let reachable=new Set(s.history.keys()),changed=true;
  while(changed){changed=false;for(const r of rs)if(!reachable.has(r.id)&&(r.requiredPreviousTransformations||[]).every(k=>reachable.has(k))){reachable.add(r.id);changed=true;}}
  rs=rs.filter(r=>(r.requiredPreviousTransformations||[]).every(k=>reachable.has(k)));
  if(rs.some(r=>r.producedSoldierType&&r.producedSoldierType!==n.body))return unknown("POSSIBLE_BODY_CHANGE");
  const raw=vec(s.currentStats),initial=vec(s.initialStats);
  if(!valid(raw)||!valid(initial)||!valid(n.permanentBonus)||raw.some((x,i)=>x<floor(STAT_KEYS[i]))||initial.some(x=>x<0))return unknown("NONINTEGER_STATE");
  const added=new Set(rs.map(r=>r.soldierBonusType).filter(id=>id&&!s.bonusIds.has(id)));
  const upper=[],bonusUpper=[];
  for(const [i,k] of STAT_KEYS.entries()){
   const numbers=[raw[i],initial[i],body.minStats?.[k],body.maxStats?.[k],body.statCaps?.[k]];
   if(!numbers.every(Number.isSafeInteger))return unknown("UNINDEXED_BODY_STAT");
   let u=Math.max(raw[i],body.minStats[k],body.maxStats[k],body.statCaps[k],floor(k));
   // All capped changes and rerolls stay below this baseline or an
   // already larger raw stat, including soft caps and bravery rounding.
   let a=1n,den=1n,add=0n;
   for(const r of rs){
    if(r.rerollStats?.[k]||r.upperBoundAtMaxStats||r.upperBoundAtStatCaps)continue;
    const vals=[r.flatOverallStatChange?.[k],r.flatMin?.[k],r.flatMax?.[k],r.percentOverallStatChange?.[k],r.percentMin?.[k],r.percentMax?.[k],r.percentGainedStatChange?.[k],r.percentGainedMin?.[k],r.percentGainedMax?.[k]].map(num);
    if(!vals.every(Number.isSafeInteger))return unknown("UNINDEXED_RULE_STAT");
    const [flat,fl,fh,p,pl,ph,gain,gl,gh]=vals;
    const positive=Math.max(0,p)+Math.max(0,pl,ph)+Math.max(0,gain)+Math.max(0,gl,gh);
    const negativeGained=Math.max(0,-gain)+Math.max(0,-gl,-gh);
    const f=Math.max(0,flat)+Math.max(0,fl,fh);
    if(![positive,negativeGained,f].every(Number.isSafeInteger))return unknown("UNSAFE_ARITHMETIC");
    let c=BigInt(f)+(BigInt(negativeGained)*BigInt(initial[i])+99n)/100n;
    if(k==="bravery"&&(positive||c>0n))c+=5n;
    if(!positive&&c===0n)continue;
    if(!r.forbiddenPreviousTransformations?.includes(r.id))return unknown("UNBOUNDED_REPEAT");
    // Each uncapped increase occurs at most once. For every order,
    // product of positive multipliers times (base + sum additive) is
    // an upper bound, with rounding conservatively relaxed.
    a*=100n+BigInt(positive);den*=100n;add+=c;
   }
   const U=(a*(BigInt(u)+add)+den-1n)/den;
   let B=n.permanentBonus[i];
   for(const id of added){const v=num(bonuses.get(id)?.[k]);if(!Number.isSafeInteger(v))return unknown("UNKNOWN_BONUS");B+=Math.max(0,v);}
   if(!Number.isSafeInteger(B)||U>BigInt(Number.MAX_SAFE_INTEGER))return unknown("UNSAFE_ARITHMETIC");
   const q=Number(U)+B;
   if(!Number.isSafeInteger(q))return unknown("UNSAFE_ARITHMETIC");
   // Psi gating can suppress a positive bonus at zero. The ordinary
   // effective vector is never larger than this relaxed maximum.
   upper.push(Math.max(floor(k),q));bonusUpper.push(B);
  }
  const v=[...upper,...upper],witness=refs.find(r=>dominates(r.v,v));
  if(!witness){metrics.boundNotDominated++;return null;}
  metrics.boundDominated++;
  return {kind:"SAME_BODY_NUMERIC_UPPER_BOUND_V1",scope:{origin:g.origin,branch:b.id,body:n.body,difficulties:g.allowedDifficulties,goals},stateHash:exactWorld(w),ruleIds:rs.map(r=>r.id).sort(),bonusUpper,upperCurrent:upper,upperCap:upper,dominatingWitness:{id:witness.id,stateHash:witness.stateHash,current:witness.current,cap:witness.cap,difficulties:witness.difficulties,goals:witness.goals},limitations:"Conditional same-body ordinary numerical objective; no unrestricted game or terminal-goal coverage certificate."};
 }
 return {estimate,select,bound,metrics};
}
