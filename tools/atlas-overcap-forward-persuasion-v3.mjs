// Positive-gate continuation of a partial, source-backed campaign.
import assert from "node:assert/strict";
import {applyOriginWitnessStep} from "../public/soldiers/modern/origin-witness.js";
import {purchaseGateVerdict} from "./atlas-overcap-forward-purchase-gate-v3.mjs";
import {key} from "./population-research-career-core.mjs";
const arr=x=>Array.isArray(x)?x:[],active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),qty=(w,k)=>Number(w.items[k]||0);
export function createPersuasionSupply(data,source){
 assert.equal(source.schema,"ATLAS_FORWARD_PERSUASION_SOURCES_V3");assert.equal(source.sourceMetadataSha256,data.meta.source.metadataSha256);
 const events=new Map(source.events.map(e=>[e.id,e])),scripts=source.scripts.filter(s=>s.minScore===null),purchase=source.purchase;
 const ready=w=>!w.pendingFree&&!arr(w.forwardDeliveries).length&&!arr(w.forwardPersuasionEvents).length;
 const allowed=(w,s,m)=>m>=s.firstMonth&&(s.lastMonth<0||m<=s.lastMonth)&&s.positive.every(k=>active(w,k))&&!s.negative.some(k=>active(w,k));
 const all=(w,ids)=>arr(ids).every(k=>active(w,k));
 function options(w){
  if(w.pendingFree||arr(w.forwardDeliveries).length)return [];
  const pending=arr(w.forwardPersuasionEvents)[0];
  if(pending){
   const e=events.get(pending.event),research=e.research.filter(k=>!active(w,k)&&!w.disabled.has(k));
   assert(!e.interrupt);
   const outcomes=[];
   for(const bonus of research.length?research:[null])for(const item of e.pool.length?[...new Set(e.pool)]:[null]){
    const items={...e.fixed};if(item)items[item]=(items[item]||0)+1;
    outcomes.push({action:{type:"sourcePersuasionExpire",script:pending.script,event:e.id,research:bonus,item,assumeTimerElapsed:true},evidence:{kind:"SOURCE_SELECTED_EVENT_EXPIRY",month:pending.month,researchCandidates:research,randomItemPool:e.pool,items,points:e.points,fundsDelta:e.funds,minimumTimerMinutes:Math.max(60,Math.floor(e.timer/30)*30),timerRandom:e.timerRandom,conditional:true}});
   }return outcomes;
  }
  const out=[],order=w.forwardExpeditionOrder;
  if(!order&&!w.forwardExpeditionPurchased){
   const gate=purchaseGateVerdict(w,purchase.id,data.itemSupply[purchase.id]);
   if(gate.ok)out.push({action:{type:"sourceExpeditionOrder",id:purchase.id,assumeFundsAndStorage:true},evidence:{kind:"SOURCE_PURCHASE_ORDER",gate,price:purchase.cost,storage:purchase.size,transferHours:purchase.transferHours,conditional:"Available funds and 75 storage capacity at order are assumed, not proved."}});
  }
  if(order&&w.month>=order.month+2)out.push({action:{type:"sourceExpeditionDelivery",id:purchase.id,assumeElapsedHours:purchase.transferHours},evidence:{kind:"SOURCE_PURCHASE_DELIVERY",orderMonth:order.month,deliveryMonth:w.month,transferHours:purchase.transferHours,conditional:"A compatible calendar placement with at least 960 hours elapsed is assumed; no exact date asserted."}});
  for(const r of source.recipes)if(all(w,r.requires)&&arr(r.functions).every(k=>w.baseFunctions.has(k))&&Object.entries(r.inputs).every(([k,v])=>qty(w,k)>=v))
   for(const [i,o] of r.outcomes.entries())if(o.weight>0)out.push({action:{type:"sourceExpeditionManufacture",id:r.id,outcome:i,assumeOutcome:true},evidence:{kind:"SOURCE_WEIGHTED_MANUFACTURE",requires:r.requires,inputs:r.inputs,fixed:r.fixed,random:o.items,weight:o.weight,totalWeight:r.totalWeight,time:r.time,cost:r.cost,space:r.space}});
  if(w.forwardCaptainLastTick===w.month&&w.month<12){
   const candidates=scripts.filter(s=>allowed(w,s,w.month+1)),ids=candidates.map(s=>s.id);
   // Each script runs independently at the month boundary. Generate every
   // selected subset; an empty set means no modeled event, not no game events.
   for(let mask=0;mask<(1<<ids.length);mask++){
    const selected=candidates.filter((s,i)=>mask&(1<<i));
    out.push({action:{type:"sourcePersuasionMonth",month:w.month+1,scripts:selected.map(s=>s.id),assumeSelectedOutcomes:true},evidence:{kind:"MONTH_BOUNDARY_SELECTED_SUBSET",candidates:ids,selected:selected.map(s=>({script:s.id,event:s.event,positive:s.positive,negative:s.negative,executionOdds:s.executionOdds,weight:s.weight,totalWeight:s.totalWeight})),otherGameEventsUntracked:true}});
   }
  }
  return out;
 }
 function apply(w,opt){
  assert(options(w).some(x=>key([x.action,x.evidence])===key([opt.action,opt.evidence])),"No current persuasion source option");
  const a=opt.action,e=opt.evidence;let n=structuredClone(w);
  if(a.type==="sourcePersuasionMonth"){
   const r=applyOriginWitnessStep(w,{type:"advanceMonth",month:a.month},data);assert(r.ok,r.reason);n=r.world;n.forwardCaptainLastTick=a.month;
   n.forwardPersuasionEvents=e.selected.map(x=>({script:x.script,event:x.event,month:a.month}));
   return {world:n,conditional:true,notes:["Eligibility evaluated simultaneously at the next monthly boundary; each selected script used once. Other events and actual timing untracked."]};
  }
  if(a.type==="sourcePersuasionExpire"){
   if(a.research){const r=applyOriginWitnessStep(w,{type:"eventResearch",research:a.research,event:a.event,script:a.script,assumeOutcome:true},data);assert(r.ok,r.reason);n=r.world;}
   else if(n.generatedEvents!=null)n.generatedEvents[a.event]=Number(n.generatedEvents[a.event]||0)+1;
   n.forwardPersuasionEvents=arr(w.forwardPersuasionEvents).slice(1);
   n.forwardDeliveries=[...arr(n.forwardDeliveries),...Object.entries(e.items).map(([item,count])=>({kind:"event",source:a.event,item,count}))];
   n.forwardPersuasionReceipts=[...arr(n.forwardPersuasionReceipts),{event:a.event,script:a.script,month:w.month,research:a.research,item:a.item,items:e.items,points:e.points,fundsDelta:e.fundsDelta}];
   return {world:n,conditional:true,notes:["Event reward and selected random outcomes; countdown expiry and one-hour transfer conditional. Score/funds delta recorded, not absolute score/funds."]};
  }
  if(a.type==="sourceExpeditionOrder"){
   assert(ready(w));n.forwardExpeditionOrder={month:w.month,price:purchase.cost,transferHours:purchase.transferHours};
   n.forwardPersuasionReceipts=[...arr(n.forwardPersuasionReceipts),{purchase:purchase.id,month:w.month,fundsDelta:-purchase.cost,storageAssumption:purchase.size}];
   return {world:n,conditional:true,notes:["Order only: no item in base storage before delivery. Funds and capacity assumed."]};
  }
  if(a.type==="sourceExpeditionDelivery"){
   delete n.forwardExpeditionOrder;n.forwardExpeditionPurchased=true;n.items[purchase.id]=qty(n,purchase.id)+1;
   return {world:n,conditional:true,notes:["Explicit 960-hour transfer elapsed assumption after two month boundaries."]};
  }
  assert.equal(a.type,"sourceExpeditionManufacture");for(const [k,v] of Object.entries(e.inputs))n.items[k]=qty(n,k)-v;
  for(const o of [e.fixed,e.random])for(const [k,v] of Object.entries(o))n.items[k]=qty(n,k)+v;
  return {world:n,conditional:true,notes:["Completed manufacture consumes inputs. refund:true applies to cancelled projects, not successful output. Labor/time conditional."]};
 }
 function rankBlockers(w){return source.scripts.filter(s=>s.minScore!==null).map(s=>({id:s.id,earliestMonth:s.firstMonth,minimumScore:s.minScore,missingResearch:s.positive.filter(k=>!active(w,k)),alreadyCompleted:active(w,s.id),currentScore:null,status:"OPEN_NATIVE_SCORE_REQUIRED",source:s.anchor}));}
 return {options,apply,rankBlockers};
}
