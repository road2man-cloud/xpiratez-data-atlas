// Forward career replay with explicit finance policy. Never accept externalInputs or legacy paths.
import {createHash} from 'node:crypto';
import {campaignStartWorld,applyCampaignStartStep,availableResearch} from '../public/soldiers/modern/campaign-start-gate-v1.js';
import {careerStatVectors} from '../public/soldiers/modern/campaign-start-career-actions-v1.js';
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
export function produceForwardCareer({data,snapshot,graph,graphFile,graphSha256,targetState,profileId,trainingId,trainingIds=trainingId?[trainingId]:[],birthBand='min',financeMode='unlimited'}){
 if(graph.schema!=='ATLAS_CAMPAIGN_FORWARD_TREE_V1'||graph.sourceMetadataSha256!==snapshot.sourceFingerprint||graph.difficulty!==snapshot.difficulty||JSON.stringify(graph.regions)!==JSON.stringify(snapshot.regions??null)||JSON.stringify(graph.countries)!==JSON.stringify(snapshot.countries??null))throw Error('graph-source-mismatch');
 if(!['unlimited','funded'].includes(financeMode))throw Error('invalid-finance-mode');
 const funded=financeMode==='funded';
 const profile=data.profiles.find(x=>x.id===profileId);
 if(birthBand!=='min'||!Array.isArray(trainingIds)||!trainingIds.length||trainingIds.some(k=>typeof k!=='string'))throw Error('unsupported-birth-or-training-sequence');
 const trainings=trainingIds.map(id=>data.transformations.find(x=>x.id===id));
 if(!profile||profile.sourceType!=='direct'||trainings.some(t=>!t))throw Error('unsupported-profile-or-training');
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
 if(digest(world)!==graph.nodes[0].stateHash)throw Error('root-hash-mismatch');
 for(const e of chain){step(e.action);if(digest(world)!==graph.nodes[e.to].stateHash)throw Error('prefix-replay-hash-mismatch:'+e.to);}
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
 if(!cap||cap.initialCapacity<=cap.initialPersonnel+world.soldiers.length+(world.forwardRecruitmentOrders||[]).length)throw Error('initial-quarters-unresolved-or-full');
 const fundsBeforeRecruit=world.funds;
 step({type:'recruit',profile:profileId,soldier:'origin',band:'min'},{funded});
 if(funded&&world.funds!==fundsBeforeRecruit-profile.cost)throw Error('recruitment-cost-not-debited');
 const member=()=>world.soldiers.find(s=>s.id==='origin');
 const before=careerStatVectors(member(),data),trainingResults=[];
 for(const training of trainings){
  if(!training.allowedSoldierTypes.includes(member().state.soldierType))throw Error('training-body-not-allowed:'+training.id);
  if(!training.requires.every(k=>active(world,k)))throw Error('training-research-missing:'+training.id);
  const beforeStep=careerStatVectors(member(),data),fundsBeforeTraining=world.funds;
  step({type:'transform',transform:training.id,soldier:'origin'},{funded});
  if(funded&&world.funds!==fundsBeforeTraining-training.cost)throw Error('training-cost-not-debited:'+training.id);
  if(!member().state.history.has(training.id))throw Error('training-history-missing:'+training.id);
  const afterStep=careerStatVectors(member(),data);
  trainingResults.push({id:training.id,before:beforeStep,after:afterStep,cost:training.cost,recoveryTime:training.recoveryTime??null,fundsAfter:funded?world.funds:null});
 }
 const after=careerStatVectors(member(),data);
 const delta=Object.fromEntries(Object.keys(after.stats).map(k=>[k,after.stats[k]-before.stats[k]]));
 return {schema:'ATLAS_FORWARD_CAREER_REPLAY_V1',sourceMetadataSha256:snapshot.sourceFingerprint,graphFile,graphSha256,targetState,scenario:{difficulty:snapshot.difficulty,regions:snapshot.regions??null,countries:snapshot.countries??null},profileId,trainingId:trainingIds.length===1?trainingIds[0]:null,trainingIds:[...trainingIds],trainingResults,body:member().state.soldierType,birthBand,prefixLength,trace,blocked,finalStateHash:digest(world),before,after,delta,financeMode,totalCost,finalFunds:funded?world.funds:null,history:canon(member().state.history),status:funded?'conditional-funded-career-model':'conditional-unlimited-finance-career-model',gameCertified:false,globalMaximum:false,limitations:[funded?'initial funding model zero; event outcome and scheduling conditional':'funds excluded for career actions; historical graph prefix replay unchanged','birth minimum vector, not sampled native RNG','transfer and recovery calendar not advanced; salaries and upkeep not modeled','no native engine replay or complete career certification']};
}
