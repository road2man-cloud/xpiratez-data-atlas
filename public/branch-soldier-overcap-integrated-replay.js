// Integrate original birth evidence and prepared research into chronological conditional witnesses. Never final-admit these rows.
export function produceOvercapIntegratedReplay(data,queue,prep,branchData,engine,material,{sourceBlobs={},materialSourceVersion=null,rankPolicy=null}={}){
 const meta=data.meta.source.metadataSha256;
 if([queue,prep,branchData].some(x=>x.sourceMetadataSha256!==meta)||prep.sourceLedgerHash!==queue.sourceLedgerHash)throw Error("source identity mismatch");
 const {createCareerReplay,foundationWorld,auditOriginCampaignContext,member}=engine,replay=createCareerReplay(data);
 const jobs=new Map(queue.jobs.map(j=>[j.id,j])),prefixes=new Map(prep.prefixes.map(p=>[p.id,p])),profiles=new Map(data.profiles.map(p=>[p.id,p])),rules=new Map(data.transformations.map(r=>[r.id,r]));
 const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),norm=v=>[...new Set(v)].sort(),json=JSON.stringify;
 const same=(a,b)=>json(a)===json(b);
 const stateSnapshot=w=>JSON.stringify(w,(_,v)=>v instanceof Map?{$map:[...v]}:v instanceof Set?{$set:[...v]}:v);
 const allChoices=new Set(branchData.branches.flatMap(b=>[...b.captain,...Object.values(b.choices||{})].filter(Boolean)));
 function matchingBranches(w){return branchData.branches.filter(b=>b.historyCount&&!b.sourceRootConflict).filter(b=>{const c=new Set([...b.captain,...Object.values(b.choices||{})].filter(Boolean));return [...c].every(k=>active(w,k))&&![...allChoices].some(k=>active(w,k)&&!c.has(k))&&!(b.blockedResearch||[]).some(k=>w.researched.has(k));}).map(b=>b.id);}
 const ready=prep.entries.filter(e=>e.status==="RESEARCH_ONLY_SEQUENCE_COMPLETE"),rows=[],failures=[],metrics={attempts:0,success:0,failed:0,researchActions:0,totalActions:0,statMismatches:0,materialRejected:0,branchReady:0};
 for(const e of ready){
  const prefix=prefixes.get(e.prefix);
  for(const id of e.groups){
   const job=jobs.get(id);metrics.attempts++;
   let w=foundationWorld(),steps=[],stage=0,cursor=0,phase="recipe",marks=[];
   try{
    if(!job||!prefix||!prefix.researchOnlyReplayVerified)throw Error("missing source");
    const recipe=job.selectedRecipes.find(r=>json(r.stages.filter(a=>a.type==="birth"||a.type==="ensureAndTransform").map(a=>({type:a.type,transform:a.transform??null,requires:norm(a.requires||[])})))===e.recipeKey);
    if(!recipe)throw Error("recipe key mismatch");
    const append=a=>{w=replay.apply(w,a);steps.push(a);};
    const supply=(items,functions,funds,reason)=>{const lack={};for(const [id,n] of Object.entries(items||{})){const q=Math.max(0,n-(w.items[id]||0));if(q)lack[id]=q;}const f=(functions||[]).filter(x=>!w.baseFunctions.has(x)),money=Math.max(0,(funds||0)-w.funds);if(Object.keys(lack).length||f.length||money)append({type:"externalInputs",items:lack,functions:f,funds:money,reason,assumption:true});};
    for(const a of recipe.stages){
     phase=a.type;
     if(a.type==="birth"||a.type==="ensureAndTransform"){
      const s=e.stages[stage];if(!s||s.type!==a.type||s.transform!==(a.transform??null)||!same(s.requires,norm(a.requires||[]))||s.to<cursor||s.to>prefix.actions.length)throw Error("stage boundary mismatch");
      phase="research_before_"+a.type;
      while(cursor<s.to)append(prefix.actions[cursor++]);
      if(!s.requires.every(k=>active(w,k)))throw Error("research gate inactive");
      phase=a.type;
      if(a.type==="birth"){
       const p=profiles.get(a.profile);if(!p||p.sourceType==="event")throw Error("event origin requires dedicated replay");
       supply(p.acquisitionRequiredItems,p.requiresBaseFunc,p.cost,"Conditional recruitment inputs "+p.id);
       append({type:"recruit",soldier:"origin",profile:p.id,band:"min"});
      }else{
       const r=rules.get(a.transform);if(!r||!member(w))throw Error("missing rule/member");
       supply(r.requiredItems,r.requiresBaseFunc,r.cost,"Conditional transformation inputs "+r.id);
       append({type:"transform",soldier:"origin",transform:r.id});
      }
      marks.push({stage,kind:a.type,actionIndex:steps.length-1,researchPrefixTo:cursor,body:member(w)?.state.soldierType});stage++;
     }else if(a.type==="conditionalCapGrowth"||a.type==="conditionalPromotion"){append(a);}
     else throw Error("unsupported recipe action "+a.type);
    }
    if(cursor!==prefix.actions.length||stage!==e.stages.length||w.pendingFree)throw Error("unconsumed research actions");
    phase="independent_replay";
    const w2=replay.replay(steps);if(stateSnapshot(w2)!==stateSnapshot(w))throw Error("independent replay state mismatch");
    const f=replay.finish(w),traits=[...member(w).state.bonusCounts].sort((a,b)=>a[0].localeCompare(b[0]));
    if(f.body!==job.body||!same(traits,job.traits.slice().sort((a,b)=>a[0].localeCompare(b[0])))||f.rank!==recipe.expectedRank||!same(f.capRaw,recipe.expectedCapRaw)||!same(f.permanentCapVector,recipe.expectedCap)){metrics.statMismatches++;throw Error("local expectation mismatch");}
    const ctx=auditOriginCampaignContext(steps,data);if(ctx.kind!=="compatible"||!ctx.allowedDifficulties.includes(e.difficulty))throw Error("campaign context conflict");
    phase="material";
    const mv=material.extend(material.empty(),steps),mi=material.issues(mv);
    if(mi.hard.length||mi.uncertain.length){metrics.materialRejected++;throw Error("finite material scope: "+[...mi.hard,...mi.uncertain].join("; "));}
    const bs=matchingBranches(w);if(bs.length)metrics.branchReady++;
    rows.push({id:job.id,origin:job.origin,body:job.body,sourcePrefix:e.prefix,difficulty:e.difficulty,goals:job.goals,traits,rank:f.rank,raw:f.raw,capRaw:f.capRaw,cap:f.permanentCapVector,order:recipe.order,actions:steps,stageMarks:marks,activeResearch:[...w.researched].filter(k=>active(w,k)).sort(),disabledResearch:[...w.disabled].sort(),matchingCommittedBranches:bs,material:{granted:mv.granted,consumed:mv.consumed,events:mv.events,issues:mi,sourceVersion:materialSourceVersion},scope:"CONDITIONAL_INTEGRATED_REPLAY_NOT_FINAL",canonicalReplayVerified:true,actualGameCertified:false,finalAdmission:false,materialBudgetSameVersion:materialSourceVersion==="v.o2"});
    metrics.success++;metrics.researchActions+=cursor;metrics.totalActions+=steps.length;
   }catch(err){metrics.failed++;failures.push({id,origin:job?.origin,body:job?.body,sourcePrefix:e.prefix,difficulty:e.difficulty,phase,stage,cursor,reason:String(err.message),actions:steps,stageMarks:marks,finalAdmission:false});}
  }
 }
 const byBody={};for(const r of rows)byBody[r.body]=(byBody[r.body]||0)+1;
 return {schema:"ATLAS_OVERCAP_INTEGRATED_REPLAY_V1",sourceMetadataSha256:meta,sourceLedgerHash:queue.sourceLedgerHash,sourceBlobs,rankPolicy,materialSourceVersion,scope:"Full chronological conditional replay including original birth evidence, research, cap growth, promotions and transformations. No final closure or exact engine build proof; legacy acquisition-index material bounds are not v.o2-complete.",summary:{...metrics,byBody,preparedGroups:ready.reduce((n,e)=>n+e.groups.length,0),remainingQueueGroups:queue.jobs.length-metrics.success},rows,failures};
}
