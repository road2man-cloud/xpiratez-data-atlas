// Distinct-trait production is a scheduling objective independent of the
// numeric Pareto comparison. Failed attempts only reduce scheduling scores.
// The lane does not certify completeness, nor discard lower-count candidates.
export function createHighTraitPriority({graphs,records,activeIndex,compactPriority,minimum=10}){
 const candidates=new Map(),turns=new Map(),historical=new Map();
 const metrics={policy:"HIGH_RETAINED_TRAIT_PRODUCTIVITY_V1",registered:0,selected:0,readySelected:0,researchSelected:0,applied:0,researchAdvanced:0,traitGains:0,maxSelected:0,maxProduced:0,abovePrevious:0,groups:0,byOrigin:{},byAction:{}};
 const group=x=>JSON.stringify([x.g.origin,x.g.branch,x.n.body,x.n.traits.slice().sort(),x.r.id]);
 for(const r of Object.values(records||{})){
  const g=graphs[r.graph],n=g?.nodes[r.node];if(!n||n.traits.length<minimum)continue;
  const k=group({g,n,r:{id:r.action}}),a=historical.get(k)||{attempts:0,success:0};
  a.attempts++;a.success+=Number(r.outcomes?.some(e=>e.status==="CONDITIONAL_REPLAY"));historical.set(k,a);
 }
 const eligible=x=>x.n.traits.length>=minimum&&x.kind==="TRAIT"&&x.r.soldierBonusType&&!x.n.traits.includes(x.r.soldierBonusType)&&x.n.body!=="STR_SOLDIER_CHORT"&&x.r.producedSoldierType!=="STR_SOLDIER_CHORT";
 function register(x){
  if(!eligible(x)||candidates.has(x.k))return;
  candidates.set(x.k,{...x,depthGroup:group(x)});metrics.registered++;
 }
 function pick(valid,scope,estimate){
  let best=null,bestScore=-Infinity;
  for(const [k,x] of candidates){
   if(!valid(x)){candidates.delete(k);continue;}
   if(!scope(x))continue;
   const ready=!x.r.requires.length||activeIndex.ready(x.n,x.r),h=historical.get(x.depthGroup)||{attempts:0,success:0};
   const attempts=turns.get(x.depthGroup)||0;
   // Explore another trait/branch before spending a round on a nearly
   // identical variant of the same action. Ready paths have a strong lead.
   const score=100*x.n.traits.length+220*Number(ready)-180*attempts
    -Math.min(250,35*Math.log2(1+Math.max(0,h.attempts-h.success)))
    +Math.max(-30,Math.min(30,estimate(x)?.adjustment||0))
    +(compactPriority?.kind(x)==="LONG"?-50:compactPriority?.kind(x)==="COMPACT"?20:0);
   if(score>bestScore||score===bestScore&&(!best||x.i<best.i||x.i===best.i&&x.k<best.k)){best=x;bestScore=score;}
  }
  return best?{...best,depthLane:true,depthScore:bestScore}:null;
 }
 function selected(x){
  if(!x.depthLane)return;
  metrics.selected++;metrics[!x.r.requires.length||activeIndex.ready(x.n,x.r)?"readySelected":"researchSelected"]++;
  turns.set(x.depthGroup,(turns.get(x.depthGroup)||0)+1);metrics.groups=turns.size;
  metrics.byOrigin[x.g.origin]=(metrics.byOrigin[x.g.origin]||0)+1;
  metrics.byAction[x.r.id]=(metrics.byAction[x.r.id]||0)+1;
  metrics.maxSelected=Math.max(metrics.maxSelected,x.n.traits.length);
 }
 function observe(x,r){
  if(!x.depthLane||!r)return;
  metrics.researchAdvanced+=Number(!!r.researchSuffixHash);
  for(const o of r.outcomes||[])if(o.status==="CONDITIONAL_REPLAY"){
   metrics.applied++;metrics.traitGains+=Number(o.traitCount>x.n.traits.length);
   metrics.maxProduced=Math.max(metrics.maxProduced,o.traitCount||0);
   metrics.abovePrevious+=Number(o.traitCount>13);
  }
 }
 return {register,pick,selected,observe,metrics};
}
