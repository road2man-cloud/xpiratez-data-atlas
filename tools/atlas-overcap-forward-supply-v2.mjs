// Source-backed supply policy for the independent forward research engine.
// Never grants an item merely because a research rule needs it.
import assert from "node:assert/strict";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";
const arr=x=>Array.isArray(x)?x:[],pairs=x=>Object.entries(x||{}),qty=(w,id)=>Number(w.items[id]||0);
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const all=(w,x)=>arr(x).every(id=>active(w,id));
const functions=(w,x)=>arr(x).every(id=>w.baseFunctions.has(id));
const grant=(w,id,n)=>{assert(Number.isSafeInteger(n)&&n>0);w.items[id]=qty(w,id)+n;};
const unused=(w,id)=>!Number(w.generatedEvents?.[id]||0);
export function createForwardSupply(data){
 const c=data.forwardSupply;
 assert.equal(c.schema,"ATLAS_FORWARD_SUPPLY_CATALOG_V2");
 assert.equal(c.sourceMetadataSha256,data.meta.source.metadataSha256);
 const targets=new Set(c.targets),rules=data.researchRules;
 const sampleLabs=Object.entries(rules).filter(([,r])=>r.cost>0&&r.needItem&&!arr(r.requires).length);
 const facilities=Object.values(c.facilities),recipes=c.recipes,buys=Object.values(c.buys);
 const itemEvents=Object.values(c.events).filter(e=>!e.research.length&&Object.keys(e.fixed).some(id=>targets.has(id))&&e.scripts.length);
 const reqOK=(w,r)=>all(w,r.requires)&&functions(w,r.functions);
 function demand(w){
  const needs={};
  for(const [id,r] of sampleLabs)if(!w.researched.has(id)&&!w.disabled.has(id))needs[r.neededItem||id]=1;
  for(const r of recipes)if(reqOK(w,r))for(const [id,n] of pairs(r.requiredItems))needs[id]=Math.max(needs[id]||0,n);
  return needs;
 }
 function eventVerdict(w,s){
  // The modeled inventory covers the active base; otherItems is the
  // explicit empty-other-stock scenario in foundationWorld. Geography
  // and global facilities remain unknown unless actually provided.
  const triggerItems=w.otherItems==null?null:{...w.otherItems};
  if(triggerItems)for(const [id,n] of pairs(w.items))triggerItems[id]=Number(triggerItems[id]||0)+n;
  const v=eventScriptVerdict(s,{...w,funds:w.month===0?w.funds:undefined,triggerItems,triggerFacilities:w.globalFacilities??null},{mode:"current"});
  return v.kind!=="blocked"&&!v.unknown.length&&!v.pending.some(x=>x.includes("카운터"))?v:null;
 }
 function eventAllowed(w,e){
  const ev=c.events[e.event];
  return !!ev&&unused(w,e.event)&&ev.research.includes(e.research)&&!!eventVerdict(w,{...e.script,eventId:e.event});
 }
 function eventEffects(w,e){
  assert(e&&w.generatedEvents?.[e.id]===1,"Event occurrence must be recorded before reward");
  for(const [item,count] of pairs(e.fixed)){
   w.forwardDeliveries=[...arr(w.forwardDeliveries),{kind:"event",source:e.id,item,count}];
  }
  w.forwardEventFunds=Number(w.forwardEventFunds||0)+e.funds;
  w.forwardEventPoints=Number(w.forwardEventPoints||0)+e.points;
  // Do not turn observed deltas into a complete monthly score/funds history.
  return w;
 }
 function options(w,firstRoot){
  if(!firstRoot||w.pendingFree)return [];
  const needs=demand(w),out=[];
  const pending=id=>arr(w.forwardDeliveries).filter(d=>d.item===id).reduce((s,d)=>s+d.count,0);
  const shortage=id=>Math.max(0,(needs[id]||0)-qty(w,id)-pending(id));
  for(const f of facilities)if(!w.facilities.has(f.id)&&f.provides.some(x=>!w.baseFunctions.has(x))&&all(w,f.research)&&functions(w,f.requires)){
   out.push({action:{type:"sourceBuildFacility",id:f.id,assumption:true},evidence:{kind:"INDEXED_FACILITY_CONSTRUCTION",requires:f.research,functions:f.requires,provides:f.provides,cost:f.cost,days:f.days,size:f.size}});
  }
  for(const b of buys)if(shortage(b.id)&&reqOK(w,b)){
   out.push({action:{type:"sourceBuySample",id:b.id,count:shortage(b.id),assumption:true},evidence:{kind:"INDEXED_PURCHASE",requires:b.requires,functions:b.functions,unitCost:b.cost}});
  }
  for(const r of recipes)if(reqOK(w,r)&&pairs(r.outputs).some(([id])=>shortage(id))&&pairs(r.requiredItems).every(([id,n])=>qty(w,id)>=n)){
   out.push({action:{type:"sourceManufactureItem",id:r.id,assumption:true},evidence:{kind:"INDEXED_DETERMINISTIC_MANUFACTURE",requires:r.requires,functions:r.functions,inputs:r.requiredItems,outputs:r.outputs,cost:r.cost,time:r.time}});
  }
  for(const e of itemEvents)if(unused(w,e.id)&&pairs(e.fixed).some(([id])=>shortage(id)))for(const s of e.scripts){
   const v=eventVerdict(w,s);if(!v)continue;
   out.push({action:{type:"sourceEventItems",event:e.id,script:s.script,assumeOutcome:true},evidence:{kind:"FIXED_EVENT_REWARD_CONDITIONAL",requires:s.researchPositive,forbids:s.researchNegative,items:e.fixed,weight:v.weight,totalWeight:v.totalWeight,executionOdds:s.executionOdds,pending:v.pending}});
  }
  return out;
 }
 function apply(w,action,firstRoot){
  if(!["sourceBuildFacility","sourceBuySample","sourceManufactureItem","sourceEventItems"].includes(action.type))return null;
  assert(firstRoot&&!w.pendingFree,"Supply action requires campaign start and settled free reward");
  const next=structuredClone(w),notes=[];
  if(action.type==="sourceBuildFacility"){
   const f=c.facilities[action.id];assert(action.assumption&&f&&!w.facilities.has(f.id)&&f.provides.some(x=>!w.baseFunctions.has(x))&&all(w,f.research)&&functions(w,f.requires),"Facility gate not satisfied");
   next.facilities.add(f.id);for(const x of f.provides)next.baseFunctions.add(x);
   next.forwardProcurementSpend=Number(next.forwardProcurementSpend||0)+f.cost;
   notes.push("Indexed construction unlock; build time, available base space and financing remain conditional.");
  }else if(action.type==="sourceBuySample"){
   const b=c.buys[action.id],needs=demand(w),pending=arr(w.forwardDeliveries).filter(d=>d.item===action.id).reduce((s,d)=>s+d.count,0);
   const count=Math.max(0,(needs[action.id]||0)-qty(w,action.id)-pending);
   assert(action.assumption&&b&&reqOK(w,b)&&count>0&&action.count===count,"Purchase not unlocked or quantity not justified");
   next.forwardDeliveries=[...arr(next.forwardDeliveries),{kind:"purchase",source:b.id,item:b.id,count}];
   next.forwardProcurementSpend=Number(next.forwardProcurementSpend||0)+count*b.cost;
   notes.push("Purchase prerequisites satisfied; funds and transfer completion conditional.");
  }else if(action.type==="sourceManufactureItem"){
   const r=recipes.find(r=>r.id===action.id),needs=demand(w);
   assert(action.assumption&&r&&reqOK(w,r)&&pairs(r.outputs).some(([id])=>(needs[id]||0)>qty(w,id))&&pairs(r.requiredItems).every(([id,n])=>qty(w,id)>=n),"Manufacture gate or actual inputs missing");
   for(const [id,n] of pairs(r.requiredItems))next.items[id]=qty(next,id)-n;
   for(const [id,n] of pairs(r.outputs))grant(next,id,n);
   next.forwardProcurementSpend=Number(next.forwardProcurementSpend||0)+r.cost;
   notes.push("All indexed inputs consumed and all deterministic outputs produced; labor/time/funds conditional.");
  }else{
   const e=c.events[action.event],s=e?.scripts.find(s=>s.script===action.script);
   assert(action.assumeOutcome&&e&&!e.research.length&&unused(w,e.id)&&s&&eventVerdict(w,s),"Event item source not currently eligible");
   next.generatedEvents[e.id]=1;eventEffects(next,e);
   notes.push("Fixed event item transfer queued; event occurrence and scheduler conditional.");
  }
  return {world:next,notes,conditional:true};
 }
 function futureMonths(w,maxMonth){
  const out=[];
  for(const e of itemEvents)if(unused(w,e.id))for(const s of e.scripts)if(all(w,s.researchPositive)&&!arr(s.researchNegative).some(id=>active(w,id))){
   for(const m of [s.firstMonth,...arr(s.monthWeights).filter(x=>x.weight>0).map(x=>x.month)])if(Number.isInteger(m)&&m>w.month&&m<=maxMonth&&(s.lastMonth==null||s.lastMonth<0||m<=s.lastMonth))out.push(m);
  }
  return out;
 }
 return {options,apply,eventAllowed,eventEffects,futureMonths,catalog:c};
}
