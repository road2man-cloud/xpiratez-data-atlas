// Narrow monthly scheduler with exact source outcomes. Only one selected
// script per modeled month (other random events not selected). No retroactive
// captain selection in this module; first schedule must occur at month zero.
import assert from "node:assert/strict";
import {applyOriginWitnessStep} from "../public/soldiers/modern/origin-witness.js";
import {key} from "./population-research-career-core.mjs";
const arr=x=>Array.isArray(x)?x:[],active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createCaptainMonthly(data,source){
 assert.equal(source.schema,"ATLAS_FORWARD_CAPTAIN_MONTHLY_SOURCES_V3");assert.equal(source.sourceMetadataSha256,data.meta.source.metadataSha256);
 const events=new Map(source.events.map(e=>[e.id,e])),scripts=new Map(source.scripts.map(s=>[s.script,s]));
 const ready=w=>!w.pendingFree&&!arr(w.forwardDeliveries).length&&!w.forwardCaptainPending;
 const allowed=(w,s,m)=>m>=s.firstMonth&&(s.lastMonth<0||m<=s.lastMonth)&&s.researchPositive.every(k=>active(w,k))&&!s.researchNegative.some(k=>w.researched.has(k));
 function schedule(w,script,month){
  assert(ready(w));const s=scripts.get(script);assert(s&&allowed(w,s,month));const e=events.get(s.event);
  const initial=w.forwardCaptainLastTick===undefined;
  if(initial){assert.equal(month,0);assert.equal(w.month,0);assert.equal(w.researched.size,0);assert.equal(script,"STR_CAPTAIN_PERSONALITY_TEST");}
  else {assert.equal(w.month,w.forwardCaptainLastTick);assert.equal(month,w.month+1);assert(month<=12);assert.notEqual(script,"STR_CAPTAIN_PERSONALITY_TEST");}
  const action={type:"sourceCaptainMonthSchedule",script,month,assumeOccurrence:true};
  return {action,evidence:{kind:"SOURCE_MONTH_START_SCHEDULE",event:e.id,firstMonth:s.firstMonth,executionOdds:s.executionOdds,weight:s.weight,totalWeight:s.totalWeight,requires:s.researchPositive,forbids:s.researchNegative,timer:e.timer,timerRandom:e.timerRandom}};
 }
 function quiet(w){
  assert(ready(w)&&w.forwardCaptainLastTick===w.month&&w.month<12);
  // The guaranteed initial personality event has already been resolved.
  // Quiet is only "no selected modeled event", not no game events at all.
  assert(w.researched.has("STR_CAPTAIN_PERSONALITY_TEST"));
  return {action:{type:"sourceCaptainMonthWait",month:w.month+1,assumeOtherEventsUntracked:true},evidence:{kind:"NEXT_MONTH_BOUNDARY_NO_SELECTED_MODELED_EVENT"}};
 }
 function resolveOptions(w){
  const p=w.forwardCaptainPending;if(!p||w.pendingFree||arr(w.forwardDeliveries).length)return [];
  const e=events.get(p.event);assert(e);
  if(e.interruptResearch&&w.researched.has(e.interruptResearch))return [{action:{type:"sourceCaptainEventExpire",event:e.id,cancelled:true,assumeTimerElapsed:true},evidence:{kind:"INTERRUPTED_AT_EXPIRY",interrupt:e.interruptResearch}}];
  const outcomes=e.pool.length?[...new Set(e.pool)]:[null];
  return outcomes.map(item=>({action:{type:"sourceCaptainEventExpire",event:e.id,item,assumeTimerElapsed:true,assumeOutcome:true},evidence:{kind:"SOURCE_EVENT_EXPIRY",scheduledMonth:p.month,script:p.script,research:e.research,points:e.points,interrupt:e.interruptResearch,item,poolWeight:item?e.pool.filter(x=>x===item).length:null,poolSize:e.pool.length,timerMinutes:Math.max(60,Math.floor(e.timer/30)*30),scope:"Selected minimum countdown fits the modeled month; actual timing and other events conditional."}}));
 }
 function options(w){
  if(w.forwardCaptainPending)return resolveOptions(w);
  if(!ready(w))return [];
  if(w.forwardCaptainLastTick===undefined){try{return [schedule(w,"STR_CAPTAIN_PERSONALITY_TEST",0)];}catch{return [];}}
  if(w.month!==w.forwardCaptainLastTick||w.month>=12)return [];
  const out=[quiet(w)];
  for(const s of source.scripts.filter(s=>s.script!=="STR_CAPTAIN_PERSONALITY_TEST"))if(allowed(w,s,w.month+1))out.push(schedule(w,s.script,w.month+1));
  return out;
 }
 function apply(w,opt){
  assert(options(w).some(x=>key([x.action,x.evidence])===key([opt.action,opt.evidence])),"Monthly transition not available");
  const a=opt.action,e=opt.evidence;let n=structuredClone(w);
  if(a.type==="sourceCaptainMonthWait"||a.type==="sourceCaptainMonthSchedule"){
   if(a.month!==w.month){const r=applyOriginWitnessStep(w,{type:"advanceMonth",month:a.month},data);assert(r.ok,r.reason);n=r.world;}
   n.forwardCaptainLastTick=a.month;
   if(a.type==="sourceCaptainMonthSchedule")n.forwardCaptainPending={event:e.event,script:a.script,month:a.month};
   return {world:n,conditional:true,notes:["Source monthly boundary evaluated before any new-month lab work; untracked events and survival conditional."]};
  }
  assert.equal(a.type,"sourceCaptainEventExpire");const event=events.get(a.event),p=w.forwardCaptainPending;
  if(!a.cancelled){
   if(event.research.length){assert.equal(event.research.length,1);const r=applyOriginWitnessStep(w,{type:"eventResearch",research:event.research[0],event:event.id,script:p.script,assumeOutcome:true},data);assert(r.ok,r.reason);n=r.world;}
   if(a.item){assert(event.pool.includes(a.item));if(n.generatedEvents!=null)n.generatedEvents[event.id]=Number(n.generatedEvents[event.id]||0)+1;
    n.forwardDeliveries=[...arr(n.forwardDeliveries),{kind:"event",source:event.id,item:a.item,count:1}];
   }
  }
  delete n.forwardCaptainPending;
  n.forwardCaptainReceipts=[...arr(n.forwardCaptainReceipts),{event:event.id,script:p.script,month:p.month,item:a.item??null,cancelled:!!a.cancelled,points:a.cancelled?0:event.points}];
  return {world:n,conditional:true,notes:["Timer expiry and event outcome conditional. Item reward transferred through existing delivery action. Absolute campaign score and elapsed days unknown."]};
 }
 return {options,apply};
}
