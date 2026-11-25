// Reuse a common ordered research history as a candidate suffix, not a grant.
// Every suffix is applied to the target world; non-research gates stay local.
import {createResearchWitnessLookup} from "./final-career-research-index.mjs";
import {key} from "./population-research-career-core.mjs";
const kinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
export function createResearchReuse(index,db,engine){
 const ledgerHash=key(Object.entries(db.populationFrontierChronology.routes).map(([id,r])=>[id,r.fullActionHash]));
 const lookup=createResearchWitnessLookup(index,{sourceMetadataSha256:db.sourceMetadataSha256,sourceLedgerHash:ledgerHash});
 const {replay}=engine,metrics={queries:0,knownPrefixes:0,candidates:0,accepted:0,rejected:0,steps:0,fallback:0};
 function plan(n,branch,birth,rule){
  metrics.queries++;
  const prefix=lookup.prefix([...birth,...n.steps].filter(a=>kinds.has(a.type)));
  if(prefix===null){metrics.fallback++;return null;}
  metrics.knownPrefixes++;
  const p=engine.policy(branch,n);
  const goals=[...new Set([...p.commit,...rule.requires])];
  for(const c of lookup.candidates(branch,rule.id,prefix)){
   if(!c.researchSuffix.length)continue;
   metrics.candidates++;
   let w=n.world;
   try{
    for(const a of c.researchSuffix){
     const next=replay.apply(w,a);metrics.steps++;
     if([...next.researched].some(id=>!w.researched.has(id)&&(p.blocked.has(id)||p.opposing.has(id)))||p.commit.some(id=>replay.active(w,id)&&!replay.active(next,id)))throw Error("branch gate");
     w=next;
    }
    if(w.pendingFree||!goals.every(id=>replay.active(w,id)))throw Error("inactive required research");
    metrics.accepted++;
    return {ok:true,n:{world:w,steps:[...n.steps,...c.researchSuffix]},researchWitness:{prefix:c.prefix,from:prefix,sourceLedgerHash:ledgerHash,suffixHash:key(c.researchSuffix)}};
   }catch{metrics.rejected++;}
  }
  metrics.fallback++;return null;
 }
 return {plan,metrics};
}
