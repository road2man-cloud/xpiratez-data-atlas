// V4.1: timed research with held samples, assignment and daily completion batches.
// Native archive: ResearchInfoState.cpp:48-62,160-166; Base.cpp:1311-1335;
// GeoscapeState.cpp:2447-2514,2686-2701. January-only, no external inputs.
// Completion uses V3's stricter current-world eligibility; unresolved native
// conflicts stop the witness rather than bypassing the verifier.
import assert from "node:assert/strict";
import {createForwardResearch} from "./atlas-overcap-forward-research-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const rootsStart=Date.UTC(2601,0,1,12),boundary=30*24+12;
const qty=(w,id)=>Number(w.items[id]||0);
export function createSampleClock(data,{labCapacity=12}={}){
 const engine=createForwardResearch(data),rules=data.researchRules;
 const stamp=s=>new Date(rootsStart+s.elapsedHours*3600000).toISOString();
 const record=(s,type,details)=>s.trace.push({type,date:stamp(s),elapsedHours:s.elapsedHours,...details});
 const start=()=>({world:engine.start(),firstRoot:null,elapsedHours:0,scientists:data.forwardStartingBase.scientists,labCapacity,fixedCosts:{},projects:[],trace:[],deliveryDue:[]});
 const available=s=>Math.min(s.scientists,s.labCapacity)-s.projects.reduce((n,p)=>n+p.assigned,0);
 const options=s=>engine.options(s.world,s.firstRoot).choices.filter(o=>!s.projects.some(p=>p.id===o.action.id&&o.action.type==="research"));
 function begin(s,id,assigned,roll=100){
  assert(Number.isInteger(assigned)&&assigned>0&&assigned<=available(s),"RESEARCH_CAPACITY");
  assert(s.firstRoot||!s.projects.length,"FIRST_ROOT_MUST_FINISH");
  assert(options(s).some(o=>o.action.type==="research"&&o.action.id===id),"LAB_NOT_AVAILABLE");
  assert(Number.isInteger(roll)&&roll>=50&&roll<=150,"COST_ROLL_RANGE");
  const r=rules[id],sample=r.needItem?(r.neededItem||id):null,held=!!(sample&&(r.destroyItem||r.returnsItem));
  if(sample)assert(qty(s.world,sample)>0,"SAMPLE_NOT_AVAILABLE");
  if(!Object.hasOwn(s.fixedCosts,id))s.fixedCosts[id]={cost:Math.max(1,Math.floor(r.cost*roll/100)),roll};
  const p={id,assigned,cost:s.fixedCosts[id].cost,spent:0,sample,held,returns:!!r.returnsItem,destroys:!!r.destroyItem};
  if(held)s.world.items[sample]=qty(s.world,sample)-1;
  s.world.activeResearch.add(id);s.projects.push(p);
  record(s,"researchStart",{...p,roll:s.fixedCosts[id].roll,stock:sample?qty(s.world,sample):null,available:available(s),stateHash:exactStateHash(s.world)});
 }
 function assign(s,id,n){
  const p=s.projects.find(x=>x.id===id);assert(p&&Number.isInteger(n)&&n>=0&&n<=p.assigned+available(s));
  p.assigned=n;record(s,"researchAssign",{id,assigned:n,available:available(s)});
 }
 function cancel(s,id,reason="USER_CANCEL"){
  const p=s.projects.find(x=>x.id===id);assert(p);
  if(p.held)s.world.items[p.sample]=qty(s.world,p.sample)+1;
  s.world.activeResearch.delete(id);s.projects=s.projects.filter(x=>x!==p);
  record(s,"researchCancel",{id,reason,returned:p.held,stock:p.sample?qty(s.world,p.sample):null,stateHash:exactStateHash(s.world)});
 }
 function apply(s,action){
  const before=s.world,old=before.forwardDeliveries?.length||0;
  s.world=engine.apply(before,action,s.firstRoot).world;
  if(action.type==="research"&&!s.firstRoot)s.firstRoot=action.id;
  const added=(s.world.forwardDeliveries?.length||0)-old;
  if(action.type==="sourceResearchDelivery")s.deliveryDue.shift();
  else {assert(added>=0);for(let i=0;i<added;i++)s.deliveryDue.push(s.elapsedHours+1);}
  record(s,action.type,{action,added:[...s.world.researched].filter(x=>!before.researched.has(x)),stateHash:exactStateHash(s.world)});
 }
 function free(s){
  while(s.world.pendingFree){
   const o=options(s).find(x=>x.action.type==="freeResearch");assert(o,"FREE_RESEARCH_UNRESOLVED");apply(s,o.action);
  }
 }
 function complete(s,p){
  assert(!s.world.researched.has(p.id)&&!s.world.disabled.has(p.id),"COMPLETION_CONFLICT_UNMODELED");
  s.world.activeResearch.delete(p.id);s.projects=s.projects.filter(x=>x!==p);
  // V3 consumes destroyItem after its completion cascade. Do not let a
  // temporary validation sample create a phantom zero-cost item unlock.
  if(p.held&&!p.returns&&qty(s.world,p.sample)===0){
   assert(!Object.entries(rules).some(([id,r])=>r.cost===0&&r.needItem&&(r.neededItem||id)===p.sample),"HELD_SAMPLE_AUTO_ZERO_ORDER_UNMODELED");
  }
  // Temporarily restore the held sample for the stricter V3 verifier.
  if(p.held)s.world.items[p.sample]=qty(s.world,p.sample)+1;
  apply(s,{type:"research",id:p.id});
  if(p.held&&p.returns&&p.destroys)s.world.items[p.sample]=qty(s.world,p.sample)+1;
  // Native archive clears the roll only on completion, not on cancellation.
  delete s.fixedCosts[p.id];
  record(s,"researchSettlement",{id:p.id,cost:p.cost,spent:p.spent,sample:p.sample,held:p.held,returned:p.held&&p.returns,consumed:p.held&&!p.returns,stock:p.sample?qty(s.world,p.sample):null,stateHash:exactStateHash(s.world)});
  free(s);
 }
 function deliver(s,until){
  while(s.deliveryDue.length&&s.deliveryDue[0]<=until){
   const g=s.world.forwardDeliveries[0];assert(g&&(!g.kind||g.kind==="research"),"UNSUPPORTED_DELIVERY");
   s.elapsedHours=Math.max(s.elapsedHours,s.deliveryDue[0]);
   assert(s.elapsedHours<boundary,"MONTH_BOUNDARY_UNMODELED");
   const o=options(s).find(x=>x.action.type==="sourceResearchDelivery");assert(o);apply(s,o.action);
  }
 }
 function tick(s){
  assert(s.projects.length&&s.projects.some(p=>p.assigned>0)&&!s.world.pendingFree,"NO_ACTIVE_EFFORT");
  // Atomic day: if the legacy completion adapter rejects a conflict,
  // preserve the predecessor rather than publishing a half-completed day.
  const t=structuredClone(s);
  const next=t.elapsedHours+24-((12+t.elapsedHours)%24);
  assert(next<boundary,"MONTH_BOUNDARY_UNMODELED");
  deliver(t,next);t.elapsedHours=next;
  for(const p of t.projects)p.spent+=p.assigned;
  record(t,"researchDay",{projects:structuredClone(t.projects)});
  const finished=t.projects.filter(p=>p.spent>=p.cost);
  for(const p of finished)complete(t,p);
  for(const p of [...t.projects])if(t.world.disabled.has(p.id))cancel(t,p.id,"NATIVE_DISABLED");
  Object.assign(s,t);
 }
 function flush(s){
  if(!s.deliveryDue.length)return;
  const until=s.deliveryDue.at(-1),next=s.elapsedHours+24-((12+s.elapsedHours)%24);
  assert(until<next&&until<boundary,"DELIVERY_REQUIRES_DAY_ADVANCE");
  const t=structuredClone(s);deliver(t,until);Object.assign(s,t);
 }
 return {start,options,begin,assign,cancel,tick,flush,available,stamp};
}
