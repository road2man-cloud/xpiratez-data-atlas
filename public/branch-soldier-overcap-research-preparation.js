// Independent research-only preparation; never use as a soldier/campaign admission certificate.
export function produceOvercapResearchPreparation(data,queue,engine,{maxRecipes=12,maxAttempts=180,maxSteps=1500,maxDepth=35}={}){
 if(queue.sourceMetadataSha256!==data.meta.source.metadataSha256)throw Error("metadata mismatch");
 const {createFoundationResearchPlanner,foundationWorld,applyOriginWitnessStep,auditOriginCampaignContext}=engine;
 const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
 const planner=createFoundationResearchPlanner(data,{maxAttempts,maxDepth,maxSteps,methodLimit:18,collectFailures:true});
 const focus=queue.jobs.filter(j=>j.body==="STR_SOLDIER_W").sort((a,b)=>a.selectedRecipes[0].order.length-b.selectedRecipes[0].order.length||a.origin.localeCompare(b.origin));
 const candidates=[...focus,...queue.jobs.filter(j=>j.status==="NO_ORDERED_DONOR")];
 const recipes=new Map();
 for(const j of candidates){const r=j.selectedRecipes[0],stages=r.stages.filter(a=>a.type==="birth"||a.type==="ensureAndTransform").map(a=>({type:a.type,transform:a.transform??null,requires:[...new Set(a.requires||[])].sort()}));const k=JSON.stringify(stages);let e=recipes.get(k);if(!e){e={stages,groups:[],origins:new Set(),body:j.body};recipes.set(k,e);}e.groups.push(j.id);e.origins.add(j.origin);}
 const entries=[],metrics={complete:0,partial:0,blocked:0,actions:0,attempts:0,replayedPrefixes:0,coveredGroups:0};
 for(const [key,r] of [...recipes].slice(0,maxRecipes)){
  let node=planner.newNode(),stages=[],failure=null;
  for(const [i,s] of r.stages.entries()){
   const before=node.steps.length,q=planner.ensure(s.requires,node);metrics.attempts+=q.attempts||0;
   if(!q.ok){failure={stage:i,type:s.type,transform:s.transform,unresolved:q.unresolved??null,reason:q.reason??"LIMITED_RESEARCH_UNRESOLVED",deadEnds:(q.deadEnds||[]).slice(-3)};break;}
   const ctx=auditOriginCampaignContext(q.node.steps,data);
   if(ctx.kind!=="compatible"||!s.requires.every(k=>active(q.node.world,k))){failure={stage:i,type:s.type,reason:"CAMPAIGN_CONTEXT_OR_ACTIVE_GOAL_UNRESOLVED"};break;}
   node=q.node;stages.push({...s,from:before,to:node.steps.length,activeGoals:s.requires,allowedDifficulties:ctx.allowedDifficulties});
  }
  // Independent replay of the entire retained research-only prefix.
  let world=foundationWorld();for(const [i,a] of node.steps.entries()){const z=applyOriginWitnessStep(world,a,data);if(!z.ok)throw Error("prefix replay "+i+": "+z.reason);world=z.world;}
  if(world.pendingFree||world.soldiers.length)throw Error("unexpected world");
  const ctx=auditOriginCampaignContext(node.steps,data);
  if(ctx.kind!=="compatible")throw Error("prefix context");
  const status=!failure?"RESEARCH_ONLY_SEQUENCE_COMPLETE":stages.length?"PARTIAL_RESEARCH_PREFIX":"LIMITED_UNRESOLVED";
  metrics[!failure?"complete":stages.length?"partial":"blocked"]++;metrics.actions+=node.steps.length;if(node.steps.length)metrics.replayedPrefixes++;
  if(!failure)metrics.coveredGroups+=r.groups.length;
  const entry={recipeKey:key,body:r.body,groups:r.groups,origins:[...r.origins].sort(),status,stages,failed:failure,actions:node.steps,activeResearch:[...world.researched].filter(k=>active(world,k)).sort(),disabledResearch:[...world.disabled].sort(),allowedDifficulties:ctx.allowedDifficulties,month:world.month,researchOnlyReplayVerified:true,soldierBirthReplayed:false,materialBudgetVerified:false,finalAdmission:false};
  entries.push(entry);
 }
 return {schema:"ATLAS_OVERCAP_RESEARCH_PREPARATION_V1",sourceMetadataSha256:queue.sourceMetadataSha256,sourceLedgerHash:queue.sourceLedgerHash,scope:"Research-only chronological rehearsal from foundation. No recruitment, growth, surgery, complete branch or finite material proof.",summary:{...metrics,distinctRecipes:recipes.size,attemptedRecipes:entries.length,unattemptedRecipes:Math.max(0,recipes.size-entries.length)},entries};
}
