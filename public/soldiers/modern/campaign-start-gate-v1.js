// Campaign-start gate. Legacy hypothetical witnesses remain unchanged.
import {foundationWorld,applyOriginWitnessStep} from './origin-witness.js';
import {researchStep,eventScriptVerdict} from './event-chronology.js';
import {START_EVENT_RULES} from './campaign-start-event-rules-v1.js';
export const START_RESEARCH=Object.freeze({
 STR_JACKSTOWN_SCOUTING:3,STR_WAT_DO:3,STR_RECRUIT_PEASANTS:3,STR_INSPECT_MACHINERY:6
});
const arr=x=>Array.isArray(x)?x:[];
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
export function labVerdict(world,id,data,{repeat=false}={}){
 const r=data.researchRules[id];
 if(!r||id==='STR_UNAVAILABLE')return {ok:false,reason:'missing-or-unavailable-rule'};
 if(world.pendingFree)return {ok:false,reason:'pending-free-award'};
 if(!(world.activeResearch instanceof Set)||world.activeResearch.has(id))return {ok:false,reason:'active-or-unknown-project'};
 if(!(r.cost>0))return {ok:false,reason:'nonpositive-or-unknown-cost'};
 if(world.researched.has(id)!==repeat)return {ok:false,reason:'completion-state-mismatch'};
 const v=researchStep(world,id,data.researchRules,{method:'research',repeatableProof:repeat});
 return {ok:v.kind==='applied',reason:v.reason?.join('; ')||null};
}
export function availableResearch(world,data){
 return Object.keys(data.researchRules).filter(id=>labVerdict(world,id,data,{repeat:world.researched.has(id)}).ok).sort();
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
  autoZeroScenario:false,autoZeroEvidence:true,sourceFingerprint:snapshot.sourceFingerprint};
 for(const [id,n] of Object.entries(world.items))if(!Number.isSafeInteger(n)||n<0)throw Error('invalid-start-item:'+id);
 for(const [id,cost] of Object.entries(START_RESEARCH))if(data.researchRules[id]?.cost!==cost)throw Error('start-cost-mismatch:'+id);
 const actual=availableResearch(world,data);
 if(!same(actual,Object.keys(START_RESEARCH)))throw Error('start-menu-mismatch:'+JSON.stringify(actual));
 return world;
}
// Both the planner and replay use this identical transactional action.
export function applyCampaignStartStep(input,step,data){
 if(step.type==='externalInputs'||step.type==='campaignContext')return {ok:false,world:input,reason:'external-state-forbidden'};
 if(input.pendingFree&&step.type!=='freeResearch')return {ok:false,world:input,reason:'pending-free-award'};
 const e=START_EVENT_RULES[step.event];
 if(step.type!=='eventResearch'||!e)return applyOriginWitnessStep(input,step,data);
 try{
  if(step.research!==e.research||step.assumeOutcome!==true)throw Error('event-outcome-not-explicit');
  if(input.generatedEvents?.[step.event])throw Error('repeat-event-not-modeled');
  const script=e.scripts.find(s=>s.script===step.script);
  if(!script)throw Error('event-script-not-indexed');
  const verdict=eventScriptVerdict({...script,eventId:step.event},input,{mode:'current'});
  if(verdict.blocked.length||verdict.unknown.length)throw Error([...verdict.blocked,...verdict.unknown].join('; '));
  // Existing event verifier must see the pre-event inventory. Reward-dependent\n  // automatic research ordering remains unresolved and never certified.\n  const result=applyOriginWitnessStep(input,step,data);
  if(!result.ok)throw Error(result.reason);
  // Existing verifier does not apply event inventory. Do not rerun a grant
  // or allow newly received items to satisfy that event's own trigger.
  for(const [id,n] of Object.entries(e.items))result.world.items[id]=(result.world.items[id]||0)+n;
  if(Number.isFinite(result.world.score))result.world.score+=e.points;
  result.world.funds+=e.funds;
  return {...result,assumed:true,notes:[...(result.notes||[]),'fixed-event-bundle:'+step.event,'event-clock-and-reward-order-unverified']};
 }catch(err){return {ok:false,world:input,reason:err.message};}
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
