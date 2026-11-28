// Conditional bridge on a source-matched electronics world. No mutation of
// old scenario artifacts, and no inferred score or untracked inventory.
import assert from "node:assert/strict";
import {applyOriginWitnessStep} from "../public/soldiers/modern/origin-witness.js";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";
import {key} from "./population-research-career-core.mjs";
const arr=x=>Array.isArray(x)?x:[],active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createGdxBridge(data,engine,source){
 assert.equal(source.schema,"ATLAS_FORWARD_GDX_BRIDGE_SOURCES_V3");assert.equal(source.sourceMetadataSha256,data.meta.source.metadataSha256);
 const c=source.capture,orders=source.orders;
 function ready(w){return !w.pendingFree&&!arr(w.forwardDeliveries).length;}
 function eventGate(w,o){
  const s=o.script;
  return ready(w)&&!w.researched.has(o.interruptResearch)&&!w.disabled.has(o.research)&&w.month>=s.firstMonth&&(s.lastMonth==null||s.lastMonth<0||w.month<=s.lastMonth)&&s.researchPositive.every(k=>active(w,k))&&!s.researchNegative.some(k=>w.researched.has(k))&&!arr(w.forwardGdxOrders).some(x=>x.event===o.id)&&!Object.keys(s.otherConditions||{}).length;
 }
 function options(w,root){
  if(!root||!ready(w))return [];
  const out=[];
  // The original bridge state has partial inventory: only existence of a
  // jail is known; availability of an actual free slot is an assumption.
  if(w.facilities.has(c.requiredFacility)&&w.month>=c.firstMonth&&w.month<=c.lastMonth&&!w.completedMissions?.has(c.deployment)&&!arr(w.forwardMissionReceipts).some(x=>x.deployment===c.deployment)){
   const weights=c.raceWeights.filter(x=>x.month<=w.month).at(-1),row=c.itemLevels[Math.min(w.month,c.itemLevels.length-1)];
   if(weights?.weights[c.race]>0&&row?.includes(c.beerItemSetIndex))out.push({action:{type:"sourceGdxCapture",source:c.id,assumeMissionOutcome:true,assumeContainment:true,assumeRecovered:true},evidence:{kind:"CONDITIONAL_CAPTURE_AND_EQUIPMENT_RECOVERY",deployment:c.deployment,missionScript:c.missionScript,race:c.race,rank:c.rank,availableUnits:c.availableUnits,loot:c.loot,prisonType:c.prisonType,facility:c.requiredFacility,nominalCapacity:c.nominalCapacity,raceWeight:weights.weights[c.race],raceWeightTotal:Object.values(weights.weights).reduce((a,b)=>a+b,0),itemLevelWeight:row.filter(x=>x===c.beerItemSetIndex).length,itemLevelWeightTotal:row.length,assumptions:c.assumptions,partialInventory:true}});
  }
  for(const o of orders){
   if(!eventGate(w,o))continue;
   const v=eventScriptVerdict({...o.script,eventId:o.id},w,{mode:"current"});
   if(v.kind==="blocked"||v.unknown.length||v.pending.some(x=>x.includes("카운터")))continue;
   out.push({action:{type:"sourceGdxOrder",event:o.id,research:o.research,assumeOccurrence:true,assumeTimerElapsed:true},evidence:{kind:"SOURCE_INTERRUPTABLE_EVENT",requires:o.script.researchPositive,forbids:o.script.researchNegative,firstMonth:o.script.firstMonth,executionOdds:o.script.executionOdds,timer:o.timer,timerRandom:o.timerRandom,interruptResearch:o.interruptResearch,points:o.points,scope:"Atomic scenario: qualifying event occurs and timer expires without interrupt research completing. Score adjustment recorded, absolute score remains unknown."}});
  }
  return out;
 }
 function apply(w,a,root){
  const opt=options(w,root).find(x=>key(x.action)===key(a));assert(opt,"GDX source action unavailable");
  let next=structuredClone(w);
  if(a.type==="sourceGdxCapture"){
   for(const [id,n] of Object.entries(c.loot))next.items[id]=Number(next.items[id]||0)+n;
   next.completedMissions??=new Set();next.completedMissions.add(c.deployment);
   next.forwardMissionReceipts=[...arr(next.forwardMissionReceipts),{source:c.id,deployment:c.deployment,script:c.missionScript,month:w.month,loot:c.loot}];
   next.forwardPartialMissionRecovery=true;
   return {world:next,conditional:true,notes:c.assumptions};
  }
  const o=orders.find(x=>x.id===a.event);
  // The same research flag / free reward processor as other events.
  // No catalog-wide relaxation for UNMODELED_EVENT_SIDE_EFFECT.
  const step={type:"eventResearch",research:o.research,event:o.id,script:o.script.script,assumeOutcome:true};
  const r=applyOriginWitnessStep(w,step,data);assert(r.ok,r.reason);next=r.world;
  next.forwardGdxOrders=[...arr(w.forwardGdxOrders),{event:o.id,research:o.research,month:w.month,points:o.points,interruptChecked:true,timerElapsedAssumed:true}];
  return {world:next,conditional:true,notes:[...r.notes,"Event cancellation checked at modeled expiry; score -100 recorded in receipt; absolute campaign score unknown."]};
 }
 return {options,apply,orderBlockers:w=>orders.map(o=>({event:o.id,research:o.research,firstMonth:o.script.firstMonth,missing:o.script.researchPositive.filter(k=>!active(w,k)),alreadyResearched:w.researched.has(o.research),tooEarly:w.month<o.script.firstMonth,available:options(w,"STARTED").some(x=>x.action.type==="sourceGdxOrder"&&x.action.event===o.id)}))};
}
