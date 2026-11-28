// Campaign-start gate. Legacy hypothetical witnesses remain unchanged.
import {foundationWorld,applyOriginWitnessStep} from './origin-witness.js';
import {researchStep,eventScriptVerdict} from './event-chronology.js';
import {applyReachabilityAction} from './campaign-start-reachability-v1.js';
import {applyFacilityAction} from './campaign-start-construction-v1.js';
import {START_EVENT_RULES} from './campaign-start-event-rules-v1.js';
import {CAREER_ACTIONS,applyConditionalCareerAction} from './campaign-start-career-actions-v1.js';
export const START_RESEARCH=Object.freeze({
 STR_JACKSTOWN_SCOUTING:3,STR_WAT_DO:3,STR_RECRUIT_PEASANTS:3,STR_INSPECT_MACHINERY:6
});
const arr=x=>Array.isArray(x)?x:[];
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
// Derive unlocked IDs once per immutable state. Avoid scanning 4654 rules
// for every unavailable topic. The accepted candidates still use researchStep.
function unlockedTopics(world,data){
 const ids=new Set();
 for(const src of world.researched)for(const id of arr(data.researchRules[src]?.unlocks))ids.add(id);
 return ids;
}
export function labVerdict(world,id,data,{repeat=false,unlocked=null}={}){
 const r=data.researchRules[id];
 if(!r||id==='STR_UNAVAILABLE')return {ok:false,reason:'missing-or-unavailable-rule'};
 if(world.pendingFree)return {ok:false,reason:'pending-free-award'};
 if(!(world.activeResearch instanceof Set)||world.activeResearch.has(id))return {ok:false,reason:'active-or-unknown-project'};
 if(!(r.cost>0)||arr(r.requires).length)return {ok:false,reason:'not-lab-research'};
 if(world.disabled.has(id)||world.researched.has(id)!==repeat)return {ok:false,reason:'completion-state-mismatch'};
 if(!(unlocked||unlockedTopics(world,data)).has(id)&&arr(r.dependencies).some(k=>!world.researched.has(k)))return {ok:false,reason:'dependencies-unmet'};
 if(r.needItem&&!(Number(world.items?.[r.neededItem||id])>0))return {ok:false,reason:'sample-missing'};
 if(arr(r.requiresBaseFunc).some(k=>!world.baseFunctions.has(k)))return {ok:false,reason:'facility-function-missing'};
 if(repeat){
  const candidates=[...arr(r.getOneFree),...Object.entries(r.getOneFreeProtected||{}).filter(([k])=>world.researched.has(k)).flatMap(([,a])=>arr(a))];
  if(!r.repeatable&&!candidates.some(k=>!world.researched.has(k)&&!world.disabled.has(k)))return {ok:false,reason:'repeat-award-missing'};
 }
 const v=researchStep(world,id,data.researchRules,{method:'research',unlocked:true,repeatableProof:repeat});
 return {ok:v.kind==='applied',reason:v.reason?.join('; ')||null};
}
export function availableResearch(world,data){
 if(world.pendingFree)return [];
 const unlocked=unlockedTopics(world,data);
 return Object.keys(data.researchRules).filter(id=>labVerdict(world,id,data,{repeat:world.researched.has(id),unlocked}).ok).sort();
}
// Snapshot must be built from source-backed startingBase and facility definitions.
// No fallback to an empty inventory, zero cash, or fabricated facilities.
export function campaignStartWorld(data,snapshot){
 if(!snapshot?.sourceFingerprint||!snapshot.items||!Array.isArray(snapshot.facilities)||
 !Array.isArray(snapshot.functions)||!Number.isSafeInteger(snapshot.funds)||snapshot.funds<0||
 !Number.isInteger(snapshot.difficulty)||snapshot.difficulty<0||snapshot.difficulty>4||
 !Array.isArray(snapshot.researched)||!Array.isArray(snapshot.disabled)||
 !Array.isArray(snapshot.soldiers)||!snapshot.startDate)throw Error('incomplete-start-snapshot');
 const world={...foundationWorld(),items:{...snapshot.items},funds:snapshot.funds,
  difficulty:snapshot.difficulty,facilities:new Set(snapshot.facilities),baseFunctions:new Set(snapshot.functions),
  researched:new Set(snapshot.researched),disabled:new Set(snapshot.disabled),
  soldiers:structuredClone(snapshot.soldiers),startDate:structuredClone(snapshot.startDate),
  baseLayout:structuredClone(snapshot.baseLayout),elapsedBuildDays:0,
  countries:snapshot.countries?new Set(snapshot.countries):undefined,
  regions:snapshot.regions?new Set(snapshot.regions):undefined,
  researchOnly:true,globalFacilities:new Set(snapshot.facilities),otherItems:{...snapshot.otherItems},
  autoZeroScenario:false,autoZeroEvidence:true,sourceFingerprint:snapshot.sourceFingerprint};
 for(const [id,n] of Object.entries(world.items))if(!Number.isSafeInteger(n)||n<0)throw Error('invalid-start-item:'+id);
 for(const [id,cost] of Object.entries(START_RESEARCH))if(data.researchRules[id]?.cost!==cost)throw Error('start-cost-mismatch:'+id);
 const actual=availableResearch(world,data);
 if(!same(actual,Object.keys(START_RESEARCH)))throw Error('start-menu-mismatch:'+JSON.stringify(actual));
 return world;
}
// Both the planner and replay use this identical transactional action.
function applyCampaignStartCore(input,step,data){
 if(step.type==='externalInputs'||step.type==='campaignContext')return {ok:false,world:input,reason:'external-state-forbidden'};
 if(input.pendingFree&&step.type!=='freeResearch')return {ok:false,world:input,reason:'pending-free-award'};
 if(CAREER_ACTIONS.has(step.type))return applyConditionalCareerAction(input,step,data);
 if(['acquirePurchase','acquireFacility'].includes(step.type)){
  try{return applyReachabilityAction(input,step,data);}catch(e){return {ok:false,world:input,reason:e.message};}
 }
 // Forward-only deterministic manufacturing. The raw, hashed source bundle
 // owns every output; the legacy single-item projection must not double-pay.
 if(step.type==='manufactureBundle'){
  try{
   const r=data.campaignAssets?.deterministicManufacture?.[step.recipe];
   if(!r||data.campaignAssets.sourceFingerprint!==input.sourceFingerprint)throw Error('manufacture-bundle-source-mismatch');
   if(step.count!==1||input.forwardManufactureCounts?.[step.recipe])throw Error('bounded-one-batch-per-recipe');
   if(!r.requires.every(k=>input.researched.has(k)&&!input.disabled.has(k))||!r.functions.every(k=>input.baseFunctions.has(k)))throw Error('manufacture-bundle-prerequisite');
   if(!Number.isSafeInteger(r.cost)||r.cost<0||input.funds<r.cost)throw Error('manufacture-bundle-funds');
   if(!Number.isSafeInteger(r.time)||r.time<0||!Number.isSafeInteger(r.space)||r.space<0)throw Error('manufacture-bundle-work-rule');
   const w=structuredClone(input);
   for(const [id,n] of Object.entries(r.materials)){
    if(!Number.isSafeInteger(n)||n<1||(w.items[id]||0)<n)throw Error('manufacture-bundle-material:'+id);
    w.items[id]-=n;
   }
   for(const [id,n] of Object.entries(r.outputs)){
    if(!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger((w.items[id]||0)+n))throw Error('manufacture-bundle-output:'+id);
    w.items[id]=(w.items[id]||0)+n;
   }
   if(r.recruitment){
    const limit=data.campaignAssets.forwardRecruitmentLimit;
    if(!limit)throw Error('recruitment-quarters-unresolved');
    const hires=w.forwardRecruitments??=[];
    if(limit.initialPersonnel+hires.length>=limit.initialCapacity)throw Error('recruitment-quarters-full');
    hires.push({recipe:step.recipe,profile:r.recruitment.profile,soldierType:r.recruitment.soldierType,status:'conditional-transfer-not-simulated'});
   }
   w.funds-=r.cost;
   (w.forwardManufactureCounts??={})[step.recipe]=1;
   w.forwardManufactureHours=(w.forwardManufactureHours||0)+r.time;
   return {ok:true,world:w,assumed:true,notes:['deterministic-manufacture:'+step.recipe,'source-work-hours:'+r.time,'engineer-space-and-calendar-not-native-certified','one-batch-bound-not-a-game-limit']};
  }catch(e){return {ok:false,world:input,reason:e.message};}
 }
 if(['buildFacility','finishFacility'].includes(step.type)){
  try{return applyFacilityAction(input,step,data);}catch(e){return {ok:false,world:input,reason:e.message};}
 }
 // Loot is part of the same mission victory, not a second independent grant.
 if(step.type==='missionResearch'&&step.recoverFixedItem){
  try{
   const loot=step.recoverFixedItem;
   const routes=data.campaignAssets?.missionLoot?.[loot.item]||[];
   const route=routes.find(r=>r.deployment===step.deployment&&r.research===step.research&&r.script.script===step.script&&r.terrain===loot.terrain&&r.block===loot.block&&r.craft===loot.craft);
   if(!route||data.campaignAssets.sourceFingerprint!==input.sourceFingerprint)throw Error('fixed-loot-source-mismatch');
   if(!Number.isSafeInteger(route.count)||route.count<1||loot.count!==route.count)throw Error('fixed-loot-count-mismatch');
   if(step.assumeOutcome!==true||loot.assumeTransport!==true||loot.assumeRecovery!==true)throw Error('mission-transport-recovery-assumptions-required');
   if(input.completedMissions?.has(step.deployment))throw Error('mission-loot-already-consumed');
   if(route.craftResearch.some(id=>!input.researched.has(id)||input.disabled.has(id)))throw Error('mission-transport-research-unmet');
   const judgment=eventScriptVerdict({...route.script,mode:'fixed',eventId:'MISSION:'+step.deployment},input,{mode:'current'});
   if(judgment.blocked.length||judgment.unknown.length)throw Error('mission-trigger-unresolved:'+ [...judgment.blocked,...judgment.unknown].join('; '));
   // Existing mission verifier owns the unlocked research, free reward token,
   // and one-use victory marker. Transport purchase affordability and tactical
   // deployment, victory, loot extraction remain explicitly conditional.
   const result=applyOriginWitnessStep(input,step,data);
   if(!result.ok)return result;
   if(!result.world.completedMissions?.has(step.deployment))throw Error('mission-victory-marker-missing');
   result.world.items[loot.item]=(result.world.items[loot.item]||0)+route.count;
   return {...result,assumed:true,notes:[...(result.notes||[]),'fixed-map-recovery:'+route.terrain+'/'+route.block+' '+loot.item+' x'+route.count,'conditional-purchased-transport:'+route.craft,'tactical-arrival-victory-and-recovery-not-native-certified','other-map-loot-not-credited']};
  }catch(e){return {ok:false,world:input,reason:e.message};}
 }
 if(step.type==='acquireEventItems'){
  try{
   const route=(data.campaignAssets?.fixedItemEvents?.[step.item]||[]).find(r=>r.event===step.event&&r.script.script===step.script);
   if(!route||data.campaignAssets.sourceFingerprint!==input.sourceFingerprint)throw Error('fixed-event-source-mismatch');
   if(step.assumeOutcome!==true||step.count!==route.items[step.item])throw Error('fixed-event-outcome-or-count-mismatch');
   // Conservative one use per event; even repeatable event paths cannot
   // manufacture unbounded grants without an explicit repeat scheduler.
   if(input.generatedEvents?.[step.event])throw Error('fixed-event-repeat-unmodeled');
   const triggerItems={...input.otherItems};
   for(const [id,n] of Object.entries(input.items))triggerItems[id]=(triggerItems[id]||0)+n;
   const verdict=eventScriptVerdict({...route.script,eventId:step.event},{...input,triggerItems,triggerFacilities:input.globalFacilities},{mode:'current'});
   if(verdict.blocked.length||verdict.unknown.length)throw Error('fixed-event-trigger-unresolved:'+ [...verdict.blocked,...verdict.unknown].join('; '));
   const world=structuredClone(input);
   for(const [id,n] of Object.entries(route.items)){
    if(!Number.isSafeInteger(n)||n<1)throw Error('invalid-fixed-event-grant');
    world.items[id]=(world.items[id]||0)+n;
   }
   const funds=route.funds??0,points=route.points??0;
   if(!Number.isSafeInteger(funds)||!Number.isSafeInteger(points))throw Error('fixed-event-economic-rule-invalid');
   if(!Number.isSafeInteger(world.funds+funds)||world.funds+funds<0)throw Error('fixed-event-funds-unresolved');
   world.funds+=funds;
   if(Number.isFinite(world.score))world.score+=points;
   world.generatedEvents[step.event]=(world.generatedEvents[step.event]||0)+1;
   return {ok:true,world,assumed:true,notes:[...verdict.pending,'fixed-item-only-event:'+step.event,'fixed-event-funds:'+funds,'fixed-event-points:'+points,'event-scheduler-and-receipt-not-native-certified']};
  }catch(e){return {ok:false,world:input,reason:e.message};}
 }
 const e=START_EVENT_RULES[step.event];
 if(step.type!=='eventResearch'||!e){
  // Legacy actions still enforce items and research. Ignore monetary cost only
  // for manufacturing/recruitment/transformation, not event predicates.
  const noEconomy=['manufacture','recruit','transform'].includes(step.type)&&input.researchOnly;
  const source=noEconomy?{...input,funds:Number.MAX_SAFE_INTEGER}:input;
  const result=applyOriginWitnessStep(source,step,data);
  if(noEconomy&&result.ok){result.world.funds=input.funds;result.assumed=true;result.notes=[...(result.notes||[]),'monetary-cost-excluded'];}
  return result;
 }
 try{
  if(step.research!==e.research||step.assumeOutcome!==true)throw Error('event-outcome-not-explicit');
  if(input.generatedEvents?.[step.event])throw Error('repeat-event-not-modeled');
  const script=e.scripts.find(s=>s.script===step.script);
  if(!script)throw Error('event-script-not-indexed');
  const verdict=eventScriptVerdict({...script,eventId:step.event},input,{mode:'current'});
  if(verdict.blocked.length||verdict.unknown.length)throw Error([...verdict.blocked,...verdict.unknown].join('; '));
  // Existing event verifier must see the pre-event inventory.
  const result=applyOriginWitnessStep(input,step,data);
  if(!result.ok)throw Error(result.reason);
  // Existing verifier does not apply event inventory. Do not rerun a grant
  // or allow newly received items to satisfy that event's own trigger.
  for(const [id,n] of Object.entries(e.items))result.world.items[id]=(result.world.items[id]||0)+n;
  if(Number.isFinite(result.world.score))result.world.score+=e.points;
  result.world.funds+=e.funds;
  return {...result,assumed:true,notes:[...(result.notes||[]),'fixed-event-bundle:'+step.event,'event-clock-and-reward-order-unverified']};
 }catch(err){return {ok:false,world:input,reason:err.message};}
}
// Apply indexed research item rewards once, only on newly completed research.
// Timing relative to native auto queues remains conditional.
export function applyCampaignStartStep(input,step,data){
 const result=applyCampaignStartCore(input,step,data);
 if(!result.ok)return result;
 const world=result.world;
 try{
  const paid=new Set(input.paidResearchGrants||input.researched);
  const notes=[...(result.notes||[])];
  for(const id of world.researched){
   if(input.researched.has(id)||paid.has(id))continue;
   const grants=data.campaignAssets?.researchGrants?.[id]||{};
   for(const [item,n] of Object.entries(grants)){
    if(!Number.isSafeInteger(n)||n<1)throw Error('invalid-research-grant:'+id);
    world.items[item]=(world.items[item]||0)+n;
    notes.push('research-grant:'+id+' -> '+item+' x'+n);
   }
   paid.add(id);
  }
  world.paidResearchGrants=paid;
  return {...result,notes,assumed:result.assumed||notes.length>(result.notes||[]).length};
 }catch(e){return {ok:false,world:input,reason:e.message};}
}
export function replayCampaignStart(steps,data,snapshot){
 let world;const trace=[];
 const fail=(status,reason,failedAt)=>({ok:false,status,reason,failedAt,trace,world,gameCertified:false});
 try{world=campaignStartWorld(data,snapshot);}catch(e){return fail('repair-pending',e.message,null);}
 if(!Array.isArray(steps))return fail('repair-pending','missing-actions',null);
 // This is a model replay, not native game certification. Starting funding
 // and recruitment RNG, clocks and geography are not yet independently proven.
 const assumptions=['initial-snapshot-and-model-not-native-certified'];
 for(const [index,step] of steps.entries()){
  const available=availableResearch(world,data);
  if(step.type==='externalInputs')return fail('resource-unresolved','external-inputs-forbidden',index);
  if(step.type==='campaignContext')return fail('research-order-error','start-context-already-fixed',index);
  if(['research','repeatResearch'].includes(step.type)){
   const v=labVerdict(world,step.id,data,{repeat:step.type==='repeatResearch'});
   if(!v.ok)return fail('research-order-error',v.reason,index);
  }
  const before=world;
  const result=applyCampaignStartStep(world,step,data);
  if(!result.ok)return fail('repair-pending',result.reason,index);
  world=result.world;
  if(result.assumed)assumptions.push('conditional-action:'+index);
  trace.push({index,action:step,availableBefore:available,availableAfter:availableResearch(world,data),
    added:[...world.researched].filter(x=>!before.researched.has(x)),
    disabled:[...world.disabled].filter(x=>!before.disabled.has(x)),
    notes:result.notes||[]});
 }
 if(world.pendingFree)return fail('repair-pending','pending-free-award',steps.length);
 return {ok:true,status:'conditional-replay',trace,world,assumptions,gameCertified:false};
}
