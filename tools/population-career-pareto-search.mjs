// Pareto-guided ordinary career search. Numerical objective only.
// Heuristic ordering is separate from a depth-independent, fail-open upper
// envelope certificate. No finite action-depth cutoff is treated as closure.
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {scalarTransform,deterministicRule} from "./population-scalar-upper-bound.mjs";
const CHORT="STR_SOLDIER_CHORT",scope=(o,b,t)=>JSON.stringify([o,b,t]);
const total=v=>v.reduce((s,x)=>s+x,0);
const finite=v=>Array.isArray(v)&&v.length===STAT_KEYS.length&&v.every(Number.isSafeInteger);
const ge=(a,b)=>a.every((v,i)=>v>=b[i]);
const floor=k=>k==="health"?1:0;
export function createCareerParetoSearch({db,data,byBody,commit,allChoice,terminalRule}){
 const bodies=new Map(data.soldiers.map(b=>[b.id,b])),bonuses=new Map();
 for(const b of data.bonuses)if(!bonuses.has(b.id))bonuses.set(b.id,b.stats||{});
 const archive=db.careerCompletion?.researchTraitSets,fronts=new Map(),byOriginBody=new Map(),ruleCache=new Map(),prefixMax=new Map(),boundCache=new Map();
 const admitted=new Set((db.careerCompletion?.rows||[]).filter(r=>r.proofKind==='REPLAYED_RESEARCH_LINE_V1').map(r=>r.id));
 const metrics={policy:"ORDINARY_NUMERIC_PARETO_V1",scores:0,bounds:0,boundHits:0,finiteBounds:0,openBounds:0,dominated:0,uncoveredScopes:0,scalarVisits:0,proofs:[]};
 for(const [id,r] of Object.entries(archive?.records||{})){
  const p=archive.pairs?.[r.pairId];if(!p||!admitted.has(r.pairId)||p.body===CHORT||!finite(r.current)||!finite(r.cap)||!r.goals?.length)continue;
  const x={id,current:r.current,cap:r.cap,goals:r.goals,difficulties:p.difficulties||[],body:p.body},k=scope(p.origin,p.branch,p.body),list=fronts.get(k)||[];
  list.push(x);fronts.set(k,list);
  const ob=JSON.stringify([p.origin,p.body]),all=byOriginBody.get(ob)||[];all.push(x);byOriginBody.set(ob,all);
 }
 // Cache numerical frontiers (scope and goal coverage remain separate).
 const reduced=new Map(),localReduced=new Map();
 function reduce(list){
  const out=[];for(const x of list){
   if(out.some(y=>ge(y.cap,x.cap)))continue;
   for(let i=out.length-1;i>=0;i--)if(ge(x.cap,out[i].cap))out.splice(i,1);
   out.push(x);
  }return out;
 }
 for(const [k,list] of byOriginBody)reduced.set(k,reduce(list));
 for(const [k,list] of fronts)localReduced.set(k,reduce(list));
 function score(x){
  metrics.scores++;const v=x.projectedCap;if(!finite(v))return 0;
  const body=x.r.producedSoldierType||x.n.body,local=localReduced.get(scope(x.g.origin,x.g.branch,body))||[],global=reduced.get(JSON.stringify([x.g.origin,body]))||[],refs=local.length?local:global;
  if(!refs.length)return 80+total(v)/50;
  // Closest existing witness: normalized positive improvements and deficits.
  // A strong new specialist may be promising even without a higher total.
  let best=-Infinity,closestDominating=-Infinity,already=false;
  for(const p of refs){
   let gain=0,loss=0,peak=0;for(let i=0;i<v.length;i++){
    const gap=(v[i]-p.cap[i])/Math.max(20,p.cap[i]);if(gap>0){gain+=gap;peak=Math.max(peak,gap);}else loss-=gap;
   }
   if(ge(p.cap,v)){already=true;closestDominating=Math.max(closestDominating,-12*loss);}
   best=Math.max(best,35*gain+45*peak-12*loss);
  }
  return Math.max(-80,Math.min(160,(already?closestDominating-15:best+18)+(local.length?0:10)));
 }
 function rules(b,id){
  const k=JSON.stringify([b.id,id]);if(ruleCache.has(k))return ruleCache.get(k);
  // Relax all research gates for the numerical envelope.
  const a=(byBody.get(id)||[]).filter(r=>!r.forbiddenSoldierTypes?.includes(id));
  ruleCache.set(k,a);return a;
 }
 // For each deterministic scalar transition take a maximum over every
 // integer raw value in [floor, U]. Relax all cross-stat/history/rank
 // constraints, include reset and removal rules, and never subtract bonuses.
 function transformUpper(r,from,to,k,ini,U){
  if(!Number.isSafeInteger(U)||U>4096||U<floor(k)||!Number.isSafeInteger(ini)||!deterministicRule(r,[to]))return Infinity;
  const key=JSON.stringify([r.id,from.id,to.id,k,ini]);let a=prefixMax.get(key);
  if(!a){a=[];if(prefixMax.size>=3500)prefixMax.clear();prefixMax.set(key,a);}
  const lo=floor(k),last=U-lo;
  for(let j=a.length;j<=last;j++){
   const v=scalarTransform(r,from,to,k,j+lo,ini);metrics.scalarVisits++;
   if(!Number.isSafeInteger(v))return Infinity;
   a.push(Math.max(j?a[j-1]:lo,v,lo));
  }
  return a[last];
 }
 function grown(id,k,v){
  const c=bodies.get(id)?.statCaps?.[k];return Number.isSafeInteger(c)?Math.max(v,c):Infinity;
 }
 function envelope(x,initial){
  const {g,b,n,r}=x;const ini=STAT_KEYS.map(k=>initial?.[k]);
  if(!finite(ini)||!finite(n.raw))return null;
  const first=r.producedSoldierType||n.body;
  if(first===CHORT||!bodies.has(first)||!bodies.has(n.body))return null;
  const key=JSON.stringify([g.branch,n.body,n.raw,ini,n.traits,r.id]);
  if(boundCache.has(key)){metrics.boundHits++;return boundCache.get(key);}
  const reachable=new Set([first]),todo=[first],edges=[],possibleBonuses=new Set([...n.traits,r.soldierBonusType].filter(Boolean));
  // Chort is not a competing destination. Fail open if it ever gains
  // an ordinary exit; then the ordinary-only relaxation would be invalid.
  if((byBody.get(CHORT)||[]).some(r=>(r.producedSoldierType||CHORT)!==CHORT))return null;
  while(todo.length){const src=todo.pop();for(const q of rules(b,src)){
   const dest=q.producedSoldierType||src;if(dest===CHORT)continue;if(!bodies.has(dest))return null;
   edges.push([src,dest,q]);if(q.soldierBonusType)possibleBonuses.add(q.soldierBonusType);
   if(!reachable.has(dest)){reachable.add(dest);todo.push(dest);}
  }}
  const upper=Object.fromEntries([...reachable].map(id=>[id,[]]));
  for(const [i,k] of STAT_KEYS.entries()){
   const u=new Map([...reachable].map(id=>[id,floor(k)]));
   const v=transformUpper(r,bodies.get(n.body),bodies.get(first),k,ini[i],grown(n.body,k,n.raw[i]));
   if(!Number.isFinite(v)){metrics.openBounds++;return null;}
   u.set(first,grown(first,k,v));
   // This iteration is not a surgery limit. A stabilized post-fixed
   // point covers any finite number of future transitions. Otherwise open.
   let fixed=false;
   for(let turn=0;turn<64;turn++){
    let change=false;for(const [src,dest,q] of edges){
     const v=grown(dest,k,transformUpper(q,bodies.get(src),bodies.get(dest),k,ini[i],u.get(src)));
     if(!Number.isFinite(v)||v>4096){metrics.openBounds++;return null;}
     if(v>u.get(dest)){u.set(dest,v);change=true;}
    }
    if(!change){fixed=true;break;}
   }
   if(!fixed){metrics.openBounds++;return null;}
   const plus=[...possibleBonuses].reduce((s,id)=>s+Math.max(0,Number(bonuses.get(id)?.[k]||0)),0);
   for(const id of reachable)upper[id].push(Math.max(floor(k),u.get(id)+plus));
  }
  if(boundCache.size>=1500)boundCache.clear();boundCache.set(key,upper);metrics.finiteBounds++;return upper;
 }
 function prove(x,initial,retainedGoals){
  metrics.bounds++;
  // Missing branch/goal coverage must not be eliminated merely by stats.
  const keep=new Set(commit(x.b)),blocked=new Set(x.b.blockedResearch||[]);
  const possible=terminalRule.targets.filter(t=>t.researchGoals.every(k=>!blocked.has(k)&&(!allChoice.has(k)||keep.has(k))));
  if(!retainedGoals.length||!possible.length||retainedGoals.some(k=>!possible.some(t=>t.id===k)))return null;
  const goalSets=[];
  for(let mask=1;mask<(1<<possible.length);mask++){
   const ids=possible.filter((_,i)=>mask&(1<<i)).map(t=>t.id).sort();
   if(retainedGoals.every(k=>ids.includes(k)))goalSets.push(ids);
  }
  // Cheap precondition: at least a matching witness for each retained
  // terminal combination in the same origin, branch, destination, and
  // every allowed difficulty. Avoid expensive bound work if unavailable.
  const refsFor=(body,goals)=>(fronts.get(scope(x.g.origin,x.g.branch,body))||[]).filter(p=>p.goals.length===goals.length&&goals.every(k=>p.goals.includes(k))&&x.g.allowedDifficulties.every(d=>p.difficulties.includes(d)));
  if(!goalSets.length||goalSets.some(gs=>!refsFor(x.r.producedSoldierType||x.n.body,gs).length)){metrics.uncoveredScopes++;return null;}
  const upper=envelope(x,initial);if(!upper)return null;
  const witnesses=[];
  for(const [body,v] of Object.entries(upper))for(const goals of goalSets){
   const p=refsFor(body,goals).find(q=>ge(q.current,v)&&ge(q.cap,v));
   if(!p){metrics.uncoveredScopes++;return null;}
   witnesses.push({body,goals,witness:p.id,upper:v,current:p.current,cap:p.cap});
  }
  const proof={scope:"ORDINARY_NUMERIC_OBJECTIVE_ONLY",graph:x.id,node:x.i,action:x.r.id,stateHash:x.n.stateHash,retainedGoals:[...retainedGoals].sort(),initial:STAT_KEYS.map(k=>initial[k]),witnesses};
  metrics.dominated++;if(metrics.proofs.length<64)metrics.proofs.push(proof);
  return proof;
 }
 return {metrics,score,prove};
}
