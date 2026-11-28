import assert from "node:assert/strict";
import {createForwardResearch} from "./atlas-overcap-forward-research-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
// Initial time from Piratez_Globals.rul:8849-8856.
// Restrict this first producer to January: monthly scripts are not yet modeled.
export function createClock(data,{labCapacity=12}={}){
 const engine=createForwardResearch(data);
 const stamp=s=>new Date(Date.UTC(2601,0,1,12)+s.elapsedHours*3600000).toISOString();
 const record=(s,type,details)=>s.trace.push({type,date:stamp(s),elapsedHours:s.elapsedHours,...details});
 const start=()=>({world:engine.start(),firstRoot:null,elapsedHours:0,scientists:data.forwardStartingBase.scientists,labCapacity,fixedCosts:{},projects:[],trace:[],deliveryReady:null});
 const options=s=>engine.options(s.world,s.firstRoot).choices;
 function begin(s,id,assigned,roll=100){
  assert(!s.projects.some(p=>p.id===id));
  assert(Number.isInteger(assigned)&&assigned>0);
  assert(assigned+s.projects.reduce((n,p)=>n+p.assigned,0)<=Math.min(s.scientists,s.labCapacity));
  assert(options(s).some(o=>o.action.type==="research"&&o.action.id===id));
  const r=data.researchRules[id];
  // Holding/consumption semantics require a separate native adapter; fail closed.
  assert(!r.needItem,"Sample projects not supported in initial clock");
  assert(Number.isInteger(roll)&&roll>=50&&roll<=150);
  if(!Object.hasOwn(s.fixedCosts,id))s.fixedCosts[id]=Math.max(1,Math.floor(r.cost*roll/100));
  s.projects.push({id,assigned,cost:s.fixedCosts[id],spent:0});
  record(s,"researchStart",{id,assigned,cost:s.fixedCosts[id],roll});
 }
 function resolve(s,action){
  const before=s.world;
  s.world=engine.apply(before,action,s.firstRoot).world;
  if(action.type==="research"&&!s.firstRoot)s.firstRoot=action.id;
  if(s.world.forwardDeliveries?.length&&!before.forwardDeliveries?.length)s.deliveryReady=s.elapsedHours+1;
  record(s,action.type,{action,added:[...s.world.researched].filter(x=>!before.researched.has(x)),stateHash:exactStateHash(s.world)});
 }
 function free(s){
  while(s.world.pendingFree){
   const choices=options(s).filter(o=>o.action.type==="freeResearch");
   assert(choices.length,"Unresolved free research");
   resolve(s,choices[0].action);
  }
 }
 function tick(s){
  assert(s.projects.length&&!s.world.pendingFree);
  // Next midnight, not 24 hours from project start.
  const delta=24-((12+s.elapsedHours)%24);
  assert(s.elapsedHours+delta<30*24+12,"MONTH_BOUNDARY_UNMODELED");
  s.elapsedHours+=delta;
  for(const p of s.projects)p.spent+=p.assigned;
  record(s,"researchDay",{projects:structuredClone(s.projects)});
  for(const p of [...s.projects])if(p.spent>=p.cost){
   resolve(s,{type:"research",id:p.id});s.projects=s.projects.filter(q=>q!==p);free(s);
  }
 }
 function deliver(s){
  while(s.world.forwardDeliveries?.length){
   const g=s.world.forwardDeliveries[0];assert(!g.kind||g.kind==="research","Unsupported transfer");
   assert(s.deliveryReady!=null);
   s.elapsedHours=Math.max(s.elapsedHours,s.deliveryReady);
   assert(s.elapsedHours<30*24+12,"MONTH_BOUNDARY_UNMODELED");
   resolve(s,options(s).find(o=>o.action.type==="sourceResearchDelivery").action);
  }
  s.deliveryReady=null;
 }
 return {start,options,begin,tick,deliver,stamp};
}
