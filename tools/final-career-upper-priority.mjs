// Priority only. No ranking result removes a state or certifies an unplayed
// research set. Direct-target potential is a heuristic, whereas transition
// comparison uses two concrete replay states and their inductive bounds.
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {scalarGrowth,scalarTransform} from "./population-scalar-upper-bound.mjs";
import {key} from "./population-research-career-core.mjs";
export const POLICY="ACTUAL_RESEARCH_TRANSITION_UPPER_PRIORITY_V1";
export function axisCeilings(b){
 if(!b)return null;
 return b.stats.map((s,i)=>s.status==="INDUCTIVE_UPPER"?Math.max(...b.reachableBodies.map(k=>b.effectiveUpper[k][i])):null);
}
export function compareBounds(before,after){
 const a=axisCeilings(before),b=axisCeilings(after);
 if(!a||!b)return null;
 const delta=b.map((x,i)=>x===null||a[i]===null?null:x-a[i]);
 const gain=delta.reduce((n,x)=>n+Math.max(0,x??0),0);
 const loss=delta.reduce((n,x)=>n+Math.max(0,-(x??0)),0);
 return {before:before.signature,after:after.signature,beforeAxes:a,afterAxes:b,delta,gain,loss,
  raisedAxes:delta.filter(x=>x>0).length,loweredAxes:delta.filter(x=>x<0).length,unknownAxes:delta.filter(x=>x===null).length,
  newBodies:after.reachableBodies.filter(k=>!before.reachableBodies.includes(k)),lostBodies:before.reachableBodies.filter(k=>!after.reachableBodies.includes(k))};
}
export function createUpperPriority(data){
 const bodies=new Map(data.soldiers.map(r=>[r.id,r])),rules=new Map(data.transformations.map(r=>[r.id,r])),bonuses=new Map();
 for(const b of data.bonuses)if(!bonuses.has(b.id))bonuses.set(b.id,b.stats||{});
 const cached=new Map(),metrics={goalScores:0,goalHits:0,graphScores:0};
 function goalScore(t,n,initial=null){
  // The raw/initial approximation for imported roots is explicitly a
  // scheduling heuristic, not a substitute for an actual source replay.
  const raw=n.raw,ini=initial||raw,traits=n.traits||[];
  const k=key([n.body,t.targets,raw,ini,traits]);if(cached.has(k)){metrics.goalHits++;return cached.get(k);}
  metrics.goalScores++;
  const from=bodies.get(n.body);let score=0;
  if(from)for(const id of t.targets){
   const r=rules.get(id),to=r&&bodies.get(r.producedSoldierType||n.body);if(!to||r.forbiddenSoldierTypes?.includes(n.body))continue;
   const bonus=traits.includes(r.soldierBonusType)?{}:bonuses.get(r.soldierBonusType)||{};
   let gain=0;
   for(const [i,s] of STAT_KEYS.entries()){
    const a=scalarGrowth(from,s,raw[i],data);
    const b=scalarTransform(r,from,to,s,raw[i],ini[i]);
    const c=scalarTransform(r,from,to,s,a,ini[i]);
    if(![a,b,c].every(Number.isFinite))continue;
    const candidate=Math.max(scalarGrowth(to,s,b,data),scalarGrowth(to,s,c,data));
    gain+=Math.max(0,candidate-a)+Math.max(0,Number(bonus[s]||0));
   }
   score=Math.max(score,gain);
  }
  cached.set(k,score);return score;
 }
 function graphScore(g,b,transition){
  metrics.graphScores++;
  const reached=new Map();
  for(const n of g.nodes){
   const a=reached.get(n.body)||Array(12).fill(-Infinity);
   for(let i=0;i<12;i++)a[i]=Math.max(a[i],n.permanentCapVector[i]);
   reached.set(n.body,a);
  }
  let gap=0,unknown=0;
  if(b)for(const body of b.reachableBodies){
   const u=b.effectiveUpper[body],a=reached.get(body)||Array(12).fill(0);
   for(let i=0;i<12;i++)if(u[i]===null)unknown++;else gap+=Math.max(0,u[i]-a[i]);
  }
  return {gap,unknown,gain:transition?.gain||0,score:gap+(transition?.gain||0)*2};
 }
 return {goalScore,graphScore,metrics};
}
