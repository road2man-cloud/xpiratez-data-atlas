// Replay-derived recipes guide scheduling across compatible research branches.
// A recipe is never a grant, proof of eligibility, or pruning certificate.
export function createTraitRecipePriority({routes,graphs,rules,branches,activeIndex,commit,allChoice,minDonor=8,donorLimit=4}){
 const scope=(o,b)=>JSON.stringify([o,b]);
 const donors=new Map(),catalog=new Map(),candidates=new Map(),turns=new Map(),failed=new Map();
 const metrics={policy:'CROSS_BRANCH_TRAIT_RECIPE_V1',donorRecipes:0,registered:0,selected:0,readySelected:0,applied:0,researchAdvanced:0,traitGains:0,maxSelected:0,maxProduced:0,byBranch:{},byAction:{},outcomes:{}};
 for(const [id,r] of Object.entries(routes||{})){
  if(r.body==='STR_SOLDIER_CHORT'||(r.traitEvidence?.retained?.length||0)<minDonor)continue;
  const actions=[...new Set(r.order)].map(k=>rules.get(k)).filter(t=>t?.soldierBonusType&&!t.reset&&!t.removeTransformations?.length&&!t.createsClone&&!t.producedItem&&t.allowedSoldierTypes?.includes(r.body)&&(!t.producedSoldierType||t.producedSoldierType===r.body));
  if(actions.length<minDonor)continue;
  const k=scope(r.origin,r.body),m=donors.get(k)||new Map(),sig=JSON.stringify([r.branch,actions.map(t=>t.id)]);
  const old=m.get(sig);if(!old||r.order.length<old.length)m.set(sig,{id,branch:r.branch,actions,length:r.order.length});donors.set(k,m);
 }
 metrics.donorRecipes=[...donors.values()].reduce((n,m)=>n+m.size,0);
 function recipes(x){
  const k=JSON.stringify([x.g.origin,x.n.body,x.g.branch]);if(catalog.has(k))return catalog.get(k);
  const b=branches.get(x.g.branch),blocked=new Set(b?.blockedResearch||[]),keep=new Set(b?commit(b):[]);
  const list=[...(donors.get(scope(x.g.origin,x.n.body))?.values()||[])].filter(d=>d.branch!==x.g.branch).map(d=>{
   const actions=d.actions.filter(r=>r.requires.every(t=>!blocked.has(t)&&(!allChoice.has(t)||keep.has(t))));
   return {...d,actions,bonuses:new Set(actions.map(r=>r.soldierBonusType)),ids:new Set(actions.map(r=>r.id))};
  }).filter(d=>d.actions.length>0).sort((a,b)=>b.bonuses.size-a.bonuses.size||a.length-b.length||a.id.localeCompare(b.id)).slice(0,donorLimit);
  catalog.set(k,list);return list;
 }
 const group=x=>JSON.stringify([x.g.origin,x.g.branch,x.n.body,[...x.n.traits].sort(),x.r.id]);
 function register(x){
  if(x.kind!=='TRAIT'||!x.r.soldierBonusType||x.n.traits.includes(x.r.soldierBonusType)||candidates.has(x.k))return;
  const rs=recipes(x);if(!rs.length)return;
  // Extra actions which depend on a recipe action are valuable as well.
  if(!rs.some(d=>d.ids.has(x.r.id)||x.r.requiredPreviousTransformations?.some(t=>d.ids.has(t))))return;
  candidates.set(x.k,x);metrics.registered++;
 }
 function pick(valid,eligible){
  let best=null,score=-Infinity;
  for(const [k,x] of candidates){
   if(!valid(x)){candidates.delete(k);continue;}if(!eligible(x))continue;
   const have=new Set(x.n.traits),ready=!x.r.requires.length||activeIndex.ready(x.n,x.r),g=group(x);
   const rs=recipes(x);let recipeScore=-Infinity,donor=null;
   for(const d of rs){
    const pos=d.actions.findIndex(r=>r.id===x.r.id),missing=d.actions.filter(r=>!have.has(r.soldierBonusType));
    const dependent=x.r.requiredPreviousTransformations?.some(t=>d.ids.has(t));if(pos<0&&!dependent)continue;
    const overlap=[...d.bonuses].filter(t=>have.has(t)).length;
    const obstructed=missing.filter(r=>r.id!==x.r.id&&r.forbiddenPreviousTransformations?.includes(x.r.id)).length;
    const first=missing[0]?.id===x.r.id;
    const v=35*overlap+18*d.bonuses.size+(first?110:0)+(dependent?135:0)-140*obstructed-(pos<0?0:pos*3);
    if(v>recipeScore){recipeScore=v;donor=d.id;}
   }
   if(!donor)continue;
   const value=200*x.n.traits.length+100*Number(ready)+recipeScore-210*(failed.get(g)||0)-70*(turns.get(g)||0)+Math.min(30,(x.n.permanentCapVector||[]).reduce((s,v)=>s+v,0)/100);
   if(value>score||value===score&&(!best||x.i<best.i||x.i===best.i&&x.k<best.k)){score=value;best={...x,recipeLane:true,recipeDonor:donor,recipeScore:value};}
  }
  return best;
 }
 function selected(x){if(!x.recipeLane)return;metrics.selected++;metrics.readySelected+=Number(!x.r.requires.length||activeIndex.ready(x.n,x.r));metrics.maxSelected=Math.max(metrics.maxSelected,x.n.traits.length);const g=group(x);turns.set(g,(turns.get(g)||0)+1);metrics.byBranch[x.g.branch]=(metrics.byBranch[x.g.branch]||0)+1;metrics.byAction[x.r.id]=(metrics.byAction[x.r.id]||0)+1;}
 function observe(x,r){if(!x.recipeLane||!r)return;metrics.outcomes[r.status]=(metrics.outcomes[r.status]||0)+1;metrics.researchAdvanced+=Number(!!r.researchSuffixHash);const results=(r.outcomes||[]).filter(e=>e.status==='CONDITIONAL_REPLAY');if(!results.length){const g=group(x);failed.set(g,(failed.get(g)||0)+1);}for(const e of results){metrics.applied++;metrics.traitGains+=Number(e.traitCount>x.n.traits.length);metrics.maxProduced=Math.max(metrics.maxProduced,e.traitCount||0);}}
 return {register,pick,selected,observe,metrics};
}
