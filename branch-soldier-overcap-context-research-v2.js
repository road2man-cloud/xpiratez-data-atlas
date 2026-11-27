// Difficulty-constrained research-only preparation; no final admission.
export function produceOvercapContextResearch(data,queue,prior,engine,{lanes=[2,0,4,1,3],maxRecipes=40,maxAttempts=180,maxDepth=35,maxSteps=1500,maxEnsures=100}={}){
 const {createContextResearchPlanner,foundationWorld,applyOriginWitnessStep,auditOriginCampaignContext}=engine;
 if(queue.sourceMetadataSha256!==data.meta.source.metadataSha256||prior.sourceMetadataSha256!==queue.sourceMetadataSha256)throw Error("source mismatch");
 const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),keys=x=>JSON.stringify(x);
 const targets=queue.jobs.filter(j=>j.body==="STR_SOLDIER_W"||j.status==="NO_ORDERED_DONOR");
 const recipes=new Map();
 for(const j of targets){const r=j.selectedRecipes[0],stages=r.stages.filter(a=>a.type==="birth"||a.type==="ensureAndTransform").map(a=>({type:a.type,transform:a.transform??null,requires:[...new Set(a.requires||[])].sort()})),k=keys(stages);
  const a=recipes.get(k)||{stages,groups:[],origins:[],body:j.body};a.groups.push(j.id);a.origins.push(j.origin);recipes.set(k,a);}
 const metrics={plannerCalls:0,attempts:0,cacheHits:0,priorPrefixReuses:0,complete:0,partial:0,unresolved:0,budgetDeferred:0,uniqueActions:0,completeGroups:0,psiCompleteGroups:0,psiProbes:0};
 const planners=new Map(),memo=new Map(),prefixPool=new Map(),entries=[],psiProbes=[];
 const getPlanner=d=>{if(!planners.has(d))planners.set(d,createContextResearchPlanner(data,{difficulty:d,maxAttempts,maxDepth,maxSteps,methodLimit:24,collectFailures:true}));return planners.get(d)};
 function ensure(d,node,goals){const k=keys([d,node.steps,goals]);if(memo.has(k)){metrics.cacheHits++;return memo.get(k);}if(metrics.plannerCalls>=maxEnsures)return null;const q=getPlanner(d).ensure(goals,node);metrics.plannerCalls++;metrics.attempts+=q.attempts||0;memo.set(k,q);return q;}
 function retain(node){
  const k=keys(node.steps);if(prefixPool.has(k))return prefixPool.get(k).id;
  let w=foundationWorld();for(const [i,a] of node.steps.entries()){const z=applyOriginWitnessStep(w,a,data);if(!z.ok)throw Error("independent research replay "+i+": "+z.reason);w=z.world;}
  const ctx=auditOriginCampaignContext(node.steps,data);if(ctx.kind!=="compatible"||w.pendingFree||w.soldiers.length)throw Error("invalid research-only prefix");
  const p={id:"prefix-"+String(prefixPool.size+1).padStart(4,"0"),actions:node.steps,activeResearch:[...w.researched].filter(k=>active(w,k)).sort(),disabledResearch:[...w.disabled].sort(),month:w.month,allowedDifficulties:ctx.allowedDifficulties,researchOnlyReplayVerified:true};
  prefixPool.set(k,p);metrics.uniqueActions+=p.actions.length;return p.id;
 }
 // Produce reusable direct PSI initiation routes independently of origin.
 for(const d of lanes){const planner=getPlanner(d),q=ensure(d,planner.newNode(),["STR_PSI_INITIATION"]);if(!q)break;metrics.psiProbes++;
  const ctx=q.ok?auditOriginCampaignContext(q.node.steps,data):null;
  if(q.ok&&ctx.kind==="compatible"&&active(q.node.world,"STR_PSI_INITIATION")){psiProbes.push({difficulty:d,status:"RESEARCH_ONLY_PSI_READY",prefix:retain(q.node),steps:q.node.steps.length});}
  else psiProbes.push({difficulty:d,status:"LIMITED_UNRESOLVED",reason:q.reason||ctx?.kind,deadEnds:(q.deadEnds||[]).slice(-4)});
 }
 const bestProbe=psiProbes.filter(p=>p.status==="RESEARCH_ONLY_PSI_READY").sort((a,b)=>a.steps-b.steps);
 const laneOrder=[...new Set([...bestProbe.map(p=>p.difficulty),...lanes])];
 const sorted=[...recipes].sort((a,b)=>a[1].stages.length-b[1].stages.length||a[0].localeCompare(b[0]));
 const oldByBirth=new Map();
 for(const e of prior.entries){if(!e.actions?.length||e.stages?.length!==1)continue;const k=keys(e.stages[0].requires);if(!oldByBirth.has(k))oldByBirth.set(k,e);}
 for(const [recipeKey,r] of sorted.slice(0,maxRecipes)){
  let best=null;const failures=[];
  for(const d of laneOrder){
   const planner=getPlanner(d);let n=planner.newNode(),stages=[],failure=null;
   const old=oldByBirth.get(keys(r.stages[0].requires));
   if(old&&old.allowedDifficulties?.includes(d)){
    const loaded=planner.newNode();
    try{for(const a of old.actions)planner.append(loaded,a);
     if(!loaded.world.pendingFree&&r.stages[0].requires.every(k=>active(loaded.world,k))){n=loaded;metrics.priorPrefixReuses++;stages.push({...r.stages[0],from:1,to:n.steps.length,activeGoals:r.stages[0].requires});}
    }catch{}
   }
   for(let i=stages.length;i<r.stages.length;i++){
    const s=r.stages[i],from=n.steps.length;
    const q=ensure(d,n,s.requires);
    if(!q){failure={stage:i,reason:"BATCH_BUDGET_DEFERRED"};break;}
    if(!q.ok){failure={stage:i,requires:s.requires,reason:q.reason,unresolved:q.unresolved,deadEnds:(q.deadEnds||[]).slice(-3)};break;}
    const ctx=auditOriginCampaignContext(q.node.steps,data);
    if(ctx.kind!=="compatible"||!s.requires.every(k=>active(q.node.world,k))){failure={stage:i,reason:"RESEARCH_CONTEXT_UNRESOLVED",conflicts:ctx.conflicts,unknown:ctx.unknown};break;}
    n=q.node;stages.push({...s,from,to:n.steps.length,activeGoals:s.requires});
   }
   const candidate={n,stages,failure,d};
   if(!best||stages.length>best.stages.length||stages.length===best.stages.length&&n.steps.length<best.n.steps.length)best=candidate;
   if(!failure)break;
   failures.push({difficulty:d,...failure});
   if(failure.reason==="BATCH_BUDGET_DEFERRED")break;
  }
  if(!best)continue;
  const full=best.stages.length===r.stages.length,psi=active(best.n.world,"STR_PSI_INITIATION");
  const status=full?"RESEARCH_ONLY_SEQUENCE_COMPLETE":best.stages.length?"PARTIAL_RESEARCH_PREFIX":best.failure?.reason==="BATCH_BUDGET_DEFERRED"?"BUDGET_DEFERRED":"LIMITED_UNRESOLVED";
  if(full){metrics.complete++;metrics.completeGroups+=r.groups.length;}else if(best.stages.length)metrics.partial++;else if(status==="BUDGET_DEFERRED")metrics.budgetDeferred++;else metrics.unresolved++;
  if(psi)metrics.psiCompleteGroups+=r.groups.length;
  entries.push({recipeKey,body:r.body,groups:r.groups,origins:[...new Set(r.origins)].sort(),status,difficulty:best.d,stages:best.stages,totalStages:r.stages.length,failed:best.failure,otherLaneFailures:failures,prefix:retain(best.n),steps:best.n.steps.length,psiInitiationActive:psi,researchOnlyReplayVerified:true,soldierBirthReplayed:false,materialBudgetVerified:false,finalAdmission:false});
 }
 return {schema:"ATLAS_OVERCAP_CONTEXT_RESEARCH_V2",sourceMetadataSha256:queue.sourceMetadataSha256,sourceLedgerHash:queue.sourceLedgerHash,scope:"Research-only chronological rehearsal with fixed difficulty; not recruitment, transformation, material budget or final admission.",limits:{lanes,maxRecipes,maxAttempts,maxDepth,maxSteps,maxEnsures},summary:{...metrics,distinctRecipes:recipes.size,attemptedRecipes:entries.length,unattemptedRecipes:recipes.size-entries.length,uniquePrefixes:prefixPool.size,psiReadyLanes:bestProbe.length},psiProbes,entries,prefixes:[...prefixPool.values()]};
}
