// Forward career replay with explicit finance policy. Never accept externalInputs or legacy paths.
import {createHash} from 'node:crypto';
import {campaignStartWorld,applyCampaignStartStep,availableResearch} from '../public/soldiers/modern/campaign-start-gate-v1.js';
import {careerStatVectors} from '../public/soldiers/modern/campaign-start-career-actions-v1.js';
import {hasConditionalRoll} from '../public/soldiers/modern/campaign-start-roll-v1.js';
const canon=x=>x instanceof Set?[...x].sort().map(canon):x instanceof Map?Object.fromEntries([...x.entries()].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([k,v])=>[k,canon(v)])):Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const digest=x=>createHash('sha256').update(JSON.stringify(canon(x))).digest('hex');
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
function apply(w,a,data,{funded=false}={}){
 if(['externalInputs','campaignContext','acquirePurchase','acquireFacility'].includes(a.type))throw Error('unsupported-unfunded-or-external-action:'+a.type);
 if(['research','repeatResearch'].includes(a.type)&&!availableResearch(w,data).includes(a.id))throw Error('research-not-in-menu:'+a.id);
 const source=funded?{...w,researchOnly:false}:w;
 const r=applyCampaignStartStep(source,a,data);
 if(!r.ok)throw Error(r.reason);
 return r;
}
export function produceForwardCareer({data,snapshot,graph,graphFile,graphSha256,targetState,profileId,trainingId,trainingIds=trainingId?[trainingId]:[],birthBand='min',financeMode='unlimited',conditionalPromotion=false,growthSlots=[],prefixCache=null,rollBand=null,manufacturedOrigins=false}){
 if(graph.schema!=='ATLAS_CAMPAIGN_FORWARD_TREE_V1'||graph.sourceMetadataSha256!==snapshot.sourceFingerprint||graph.difficulty!==snapshot.difficulty||JSON.stringify(graph.regions)!==JSON.stringify(snapshot.regions??null)||JSON.stringify(graph.countries)!==JSON.stringify(snapshot.countries??null))throw Error('graph-source-mismatch');
 if(!['unlimited','funded'].includes(financeMode))throw Error('invalid-finance-mode');
 const funded=financeMode==='funded';
 if(funded&&graph.financeMode==='unlimited')throw Error('funded-career-requires-funded-graph');
 const profile=data.profiles.find(x=>x.id===profileId);
 if(birthBand!=='min'||!Array.isArray(trainingIds)||!trainingIds.length||trainingIds.some(k=>typeof k!=='string'))throw Error('unsupported-birth-or-training-sequence');
 if(!Array.isArray(growthSlots)||growthSlots.some((n,i)=>!Number.isSafeInteger(n)||n<0||n>trainingIds.length||(i>0&&n<=growthSlots[i-1])))throw Error('invalid-growth-slots');
 if(rollBand!==null&&!['min','max'].includes(rollBand))throw Error('invalid-roll-band');
 const trainings=trainingIds.map(id=>data.transformations.find(x=>x.id===id));
 const manufactured=profile?.sourceType==='manufacture'&&manufacturedOrigins&&data.campaignAssets?.manufacturedCareerOrigins?.[profileId];
 if(!profile||(!manufactured&&profile.sourceType!=='direct')||trainings.some(t=>!t))throw Error('unsupported-profile-or-training');
 if(manufactured&&funded)throw Error('manufactured-career-funded-not-modeled');
 const costs=[profile.cost,...trainings.map(t=>t.cost)];
 if(costs.some(n=>!Number.isSafeInteger(n)||n<0)||!Number.isSafeInteger(costs.reduce((a,b)=>a+b,0)))throw Error('cost-unresolved');
 const totalCost=costs.reduce((a,b)=>a+b,0);
 const byId=new Map();
 for(const e of graph.edges)if(e.from<e.to&&!byId.has(e.to))byId.set(e.to,e);
 let v=targetState,chain=[];
 while(v!==0){const e=byId.get(v);if(!e)throw Error('missing-forward-parent:'+v);chain.push(e);v=e.from;}
 chain.reverse();
 let world=campaignStartWorld(data,snapshot),trace=[];
 function step(a,opts={}){
  const before=world, result=apply(before,a,data,opts);world=result.world;
  trace.push({action:a,conditional:!!result.assumed,fundsBefore:before.funds,fundsAfter:world.funds,added:[...world.researched].filter(k=>!before.researched.has(k)),notes:result.notes||[]});
 }
 const cacheKey=JSON.stringify([graphSha256,targetState]);
 const cached=prefixCache?.get(cacheKey);
 if(cached){
  if(digest(cached.world)!==graph.nodes[targetState].stateHash)throw Error('cached-prefix-state-mismatch');
  world=structuredClone(cached.world);trace=structuredClone(cached.trace);
 }else{
  if(digest(world)!==graph.nodes[0].stateHash)throw Error('root-hash-mismatch');
  for(const e of chain){step(e.action);if(digest(world)!==graph.nodes[e.to].stateHash)throw Error('prefix-replay-hash-mismatch:'+e.to);}
  prefixCache?.set(cacheKey,{world:structuredClone(world),trace:structuredClone(trace)});
 }
 const prefixLength=trace.length;
 const blocked=[];
 // Select only legal next research actions and resolve awards before anything else.
 for(const id of profile.requires||[]){
  if(active(world,id))continue;
  step({type:'research',id});
  while(world.pendingFree){
   const p=world.pendingFree,choices=(p.choices||[]).filter(k=>data.researchRules[k]&&!world.researched.has(k)&&!world.disabled.has(k));
   if(choices.length!==1&&!p.sequential)throw Error('ambiguous-recruitment-award');
   if(!choices.length)throw Error('missing-recruitment-award');
   step({type:'freeResearch',source:p.source,research:choices[0],assumeOutcome:!p.sequential&&choices.length>1});
  }
 }
 if(trainings.some(t=>!t.requires.every(k=>active(world,k))))throw Error('training-research-missing');
 // The initial funding in the bounded model is zero. Use only a legal indexed
 // fixed event from the same state; reject failed trigger tests transactionally.
 if(funded&&world.funds<totalCost){
  const routes=Object.values(data.campaignAssets?.fixedItemEvents||{}).flat().filter(r=>r.funds>0).sort((a,b)=>b.funds-a.funds);
  const seen=new Set();
  for(const route of routes){
   const key=route.event+'|'+route.script.script;if(seen.has(key))continue;seen.add(key);
   const item=Object.keys(route.items).sort()[0];
   const a={type:'acquireEventItems',event:route.event,script:route.script.script,item,count:route.items[item],assumeOutcome:true};
   try{step(a);if(world.funds>=totalCost)break;}catch(e){blocked.push({action:a,reason:e.message});}
  }
 }
 if(funded&&world.funds<totalCost)throw Error('funded-career-budget-unresolved');
 const cap=data.campaignAssets?.forwardRecruitmentLimit;
 const pendingOrders=(world.forwardRecruitments||[]).filter(r=>r.status==='conditional-transfer-not-simulated').length;
 if(!cap||cap.initialCapacity<=cap.initialPersonnel+world.soldiers.length+pendingOrders)throw Error('initial-quarters-unresolved-or-full');
 let acquisition=null;
 const fundsBeforeRecruit=world.funds;
 if(manufactured){
  const recipe=manufactured.recipe,r=data.campaignAssets.deterministicManufacture[recipe];
  if(!r||world.forwardManufactureCounts?.[recipe])throw Error('manufactured-origin-order-already-exists');
  const start=trace.length,stockBefore={...world.items},hoursBefore=world.forwardManufactureHours||0;
  let supplyListCost=0;
  if(recipe==='STR_HYBRID_LONER_RECRUITMENT'){
   while((world.items.STR_MOONSHINE||0)<r.materials.STR_MOONSHINE){
    const ordinal=(world.forwardManufactureCounts?.STR_MOONSHINE_XXX||0)+1;
    step({type:'manufactureBundle',recipe:'STR_MOONSHINE_XXX',count:1,...(ordinal===1?{}:{batchOrdinal:ordinal}),financeMode:'unlimited'});
   }
  }else if(recipe==='STR_HYBRID_HIVER_RECRUITMENT'){
   const missing=r.materials.STR_SECTOWEED-(world.items.STR_SECTOWEED||0);
   if(missing>0){
    const price=data.campaignAssets.items.STR_SECTOWEED?.costBuy;
    if(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(price*missing))throw Error('manufactured-supply-price-unresolved');
    step({type:'acquireFundedPurchase',item:'STR_SECTOWEED',count:missing,financeMode:'unlimited'});
    supplyListCost=price*missing;
   }
  }else throw Error('manufactured-supply-recipe-unsupported');
  step({type:'manufactureBundle',recipe,count:1,financeMode:'unlimited'});
  step({type:'conditionalManufacturedArrival',profile:profileId,soldier:'origin',band:'min',transferHours:manufactured.transferHours,assumption:true});
  const itemDelta=Object.fromEntries([...new Set([...Object.keys(stockBefore),...Object.keys(world.items)])].sort().map(k=>[k,(world.items[k]||0)-(stockBefore[k]||0)]).filter(([,v])=>v!==0));
  acquisition={kind:'conditional-manufactured-origin',recipe,sourceSha256:manufactured.sourceSha256,traceStart:start,traceEnd:trace.length,recipeCost:r.cost,supplyListCost,materials:r.materials,outputs:r.outputs,itemDelta,manufactureHours:(world.forwardManufactureHours||0)-hoursBefore,transferHours:manufactured.transferHours};
 }else{
  step({type:'recruit',profile:profileId,soldier:'origin',band:'min'},{funded});
  if(funded&&world.funds!==fundsBeforeRecruit-profile.cost)throw Error('recruitment-cost-not-debited');
 }
 const member=()=>world.soldiers.find(s=>s.id==='origin');
 const before=careerStatVectors(member(),data),trainingResults=[],growthResults=[];
 const growAt=slot=>{
  if(!growthSlots.includes(slot))return;
  const prior=careerStatVectors(member(),data);
  const body=member().state.soldierType;
  step({type:'conditionalCapGrowth',soldier:'origin',assumption:true},{funded});
  growthResults.push({slot,body,before:prior,after:careerStatVectors(member(),data)});
 };
 for(const [slot,training] of trainings.entries()){
  growAt(slot);
  if(!training.allowedSoldierTypes.includes(member().state.soldierType))throw Error('training-body-not-allowed:'+training.id);
  if(!training.requires.every(k=>active(world,k)))throw Error('training-research-missing:'+training.id);
  const promotions=[];
  if(conditionalPromotion&&Number.isSafeInteger(training.minRank))while(member().state.rank<training.minRank){
   const rank=member().state.rank+1;
   step({type:'conditionalPromotion',soldier:'origin',rank,assumption:true},{funded});
   promotions.push(rank);
  }
  const beforeStep=careerStatVectors(member(),data),fundsBeforeTraining=world.funds;
  const rolled=rollBand!==null&&hasConditionalRoll(training);
  step(rolled?{type:'conditionalTransformRoll',transform:training.id,soldier:'origin',band:rollBand,assumption:true}:{type:'transform',transform:training.id,soldier:'origin'},{funded});
  if(funded&&world.funds!==fundsBeforeTraining-training.cost)throw Error('training-cost-not-debited:'+training.id);
  if(!member().state.history.has(training.id))throw Error('training-history-missing:'+training.id);
  const afterStep=careerStatVectors(member(),data);
  trainingResults.push({id:training.id,rollBand:rolled?rollBand:null,promotions,before:beforeStep,after:afterStep,cost:training.cost,recoveryTime:training.recoveryTime??null,fundsAfter:funded?world.funds:null});
 }
 growAt(trainings.length);
 const after=careerStatVectors(member(),data);
 const delta=Object.fromEntries(Object.keys(after.stats).map(k=>[k,after.stats[k]-before.stats[k]]));
 return {schema:'ATLAS_FORWARD_CAREER_REPLAY_V1',sourceMetadataSha256:snapshot.sourceFingerprint,graphFile,graphSha256,targetState,scenario:{difficulty:snapshot.difficulty,regions:snapshot.regions??null,countries:snapshot.countries??null},profileId,trainingId:trainingIds.length===1?trainingIds[0]:null,trainingIds:[...trainingIds],trainingResults,growthSlots:[...growthSlots],growthResults,body:member().state.soldierType,finalRank:member().state.rank,conditionalPromotion,rollBand,conditionalRolls:member().conditionalRolls||[],birthBand,...(acquisition?{acquisition}:{}),prefixLength,trace,blocked,finalStateHash:digest(world),before,after,delta,financeMode,totalCost:totalCost+(acquisition?.supplyListCost||0),finalFunds:funded?world.funds:null,history:canon(member().state.history),status:funded?'conditional-funded-career-model':'conditional-unlimited-finance-career-model',gameCertified:false,globalMaximum:false,limitations:[funded?'initial funding model zero; event outcome and scheduling conditional':'funds excluded for career actions; historical graph prefix replay unchanged','birth minimum vector, not sampled native RNG','transfer and recovery calendar not advanced; salaries and upkeep not modeled','no native engine replay or complete career certification',...(acquisition?['manufactured origin: recipe materials and outputs applied once; personnel arrival conditional; list-price supply cost excludes price modifiers']:[]),...(conditionalPromotion?['promotion achievements and timing are conditional, not native verified']:[]),...(growthSlots.length?['selected battle growth checkpoints assume reachable raw caps; actual opportunities, RNG and duration not simulated']:[]),...(member().conditionalRolls?.length?['joint transformation random endpoints are explicit conditional scenarios, not verified native RNG outcomes']:[])]};
}
