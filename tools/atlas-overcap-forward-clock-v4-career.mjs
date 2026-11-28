// V4.13: a small additive timed career adapter, rather than another copy
// of the campaign engine. Only direct hiring and deterministic, living,
// same-body training with zero transfer time are admitted.
import assert from "node:assert/strict";
import {createPlottingClock} from "./atlas-overcap-forward-clock-v4-plotting.mjs";
import {applyOriginWitnessStep} from "../public/soldiers/modern/origin-witness.js";
import {eligibleTransformation,bonusStats,STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const member=s=>s.world.soldiers.find(m=>m.id==="origin");
const keys=Object.fromEntries(STAT_KEYS.map(k=>[k,0]));
export function careerStats(m,data){
 const state=m.state,body=data.soldiers.find(b=>b.id===state.soldierType),bonus=bonusStats(state,data,{commendations:m.commendations});
 assert(body&&state.exactStats);
 return {body:state.soldierType,rank:state.rank,raw:{...state.currentStats},initial:{...state.initialStats},permanentBonus:{...keys,...bonus},effective:Object.fromEntries(STAT_KEYS.map(k=>[k,Math.max(k==="health"?1:0,state.currentStats[k]+(bonus[k]||0))])),rawStatCaps:{...body.statCaps},trainingStatCaps:{...body.trainingStatCaps},history:Object.fromEntries(state.history),status:state.status,exactModelStats:true};
}
export function createTimedCareerClock(data,config){
 const core=createPlottingClock(data,config);
 const record=(s,type,details)=>s.trace.push({...details,type,date:core.stamp(s),elapsedHours:s.elapsedHours});
 const midnight=s=>assert((s.elapsedHours+12)%24===0,"CAREER_ACTION_MUST_BE_AT_MIDNIGHT");
 const profile=id=>data.profiles.find(p=>p.id===id);
 function initialize(s){
  assert(!s.world.soldiers.length&&!s.career,"REQUIRES_UNTRACKED_INITIAL_ROSTER");
  s.career={hire:null,training:null,completed:[],salary:0,blocked:[]};
  // The inherited monthly residual is held fixed, but add exact salary for
  // this newly modeled recruit (including a soldier in transfer).
 }
 function order(s,id,{birthPsiStrength}={}){
  midnight(s);assert(!s.career.hire&&!member(s));
  const p=profile(id),b=data.soldiers.find(x=>x.id===p?.soldierType);
  assert(p?.sourceType==="direct"&&b&&p.cost===b.costBuy&&p.time===b.transferTime&&p.salary===b.costSalary);
  assert(p.monthlyBuyLimit===null||p.monthlyBuyLimit>=1);
  assert(Number.isSafeInteger(p.time)&&p.time>0&&p.time%24===0);
  assert(s.scientists+s.engineers+s.soldiers+s.transfers.filter(t=>t.type==="scientist").reduce((n,t)=>n+t.count,0)+1<=s.quarters,"QUARTERS_LIMIT");
  const r=applyOriginWitnessStep(s.world,{type:"recruit",soldier:"origin",profile:id,band:"min"},data);
  assert(r.ok,r.reason);
  // Native purchase pays and creates the soldier before transfer; preserve
  // the exact selected birth, but do not expose a recruit to training yet.
  const m=r.world.soldiers.pop();assert(m?.id==="origin"&&m.state.exactStats);
  // Select a conditional native integer birth roll at creation, never on an existing or arrived soldier.
  if(birthPsiStrength!==undefined){
   assert(Number.isSafeInteger(birthPsiStrength)&&birthPsiStrength>=p.initialStatsBeforeTraits.min.psiStrength&&birthPsiStrength<=p.initialStatsBeforeTraits.max.psiStrength,"BIRTH_PSI_OUT_OF_RANGE");
   assert(!p.initialStatsOverride&&!p.currentStatsOverride&&!p.traits?.length&&p.initialStatsBeforeTraits.min.psiStrength===b.minStats.psiStrength&&p.initialStatsBeforeTraits.max.psiStrength===b.maxStats.psiStrength,"BIRTH_PSI_PROFILE_UNSUPPORTED");
   m.state.initialStats.psiStrength=birthPsiStrength;m.state.currentStats.psiStrength=birthPsiStrength;
  }
  s.world=r.world;s.soldiers++;s.career.salary=p.salary;
  for(const row of Object.values(config.monthlyInput))row.otherMaintenance+=p.salary;
  s.career.hire={profile:id,body:p.soldierType,ordered:s.elapsedHours,due:s.elapsedHours+p.time,cost:p.cost,salary:p.salary,transferHours:p.time,member:m,arrived:false};
  record(s,"careerHireOrder",{profile:id,body:p.soldierType,cost:p.cost,salary:p.salary,transferHours:p.time,due:s.career.hire.due,funds:s.world.funds,conditionalBirth:birthPsiStrength===undefined?"MINIMUM_VECTOR":"MINIMUM_VECTOR_EXCEPT_SELECTED_PSI_ROLL",...(birthPsiStrength===undefined?{}:{birthPsiStrength})});
 }
 function verdict(s,id){
  const m=member(s),r=data.transformations.find(t=>t.id===id);assert(m&&r);
  return eligibleTransformation(r,m.state,data,{mode:"current",researched:[...s.world.researched],disabled:[...s.world.disabled],baseFunctions:[...s.world.baseFunctions],items:s.world.items,funds:s.world.funds,commendations:m.commendations});
 }
 function train(s,id){
  midnight(s);const m=member(s),r=data.transformations.find(t=>t.id===id);assert(m&&r&&!s.career.training);
  assert(!r.createsClone&&!r.producedItem&&!r.producedSoldierType&&!r.reset&&!r.resetRank&&r.transferTime===0&&r.recoveryTime>0);
  assert(m.state.status==="healthy","SOLDIER_NOT_RECOVERED");
  const v=verdict(s,id);
  if(v.kind!=="eligible"){const b={id,body:m.state.soldierType,kind:v.kind,blockers:v.blockers||[],conditions:v.conditions||[]};s.career.blocked.push(b);record(s,"careerTrainingBlocked",b);return false;}
  const before=careerStats(m,data);
  const a=applyOriginWitnessStep(s.world,{type:"transform",soldier:"origin",transform:id},data);assert(a.ok,a.reason);
  assert.equal(a.world.funds,s.world.funds-r.cost);s.world=a.world;
  const after=careerStats(member(s),data);
  // Transformation is performed upfront; recovery is a separate gate.
  // One recovery unit per day (no extra medical facility bonus modeled).
  member(s).state.status="wounded";
  const p={id,started:s.elapsedHours,due:s.elapsedHours+24*r.recoveryTime,cost:r.cost,recoveryDays:r.recoveryTime,before,after,delta:Object.fromEntries(STAT_KEYS.map(k=>[k,after.effective[k]-before.effective[k]]))};
  s.career.training=p;record(s,"careerTrainingStart",{...p,funds:s.world.funds,conditionalRecovery:"ONE_UNIT_PER_DAY"});return true;
 }
 function arrivals(s){
  const h=s.career.hire;
  if(h&&!h.arrived&&s.elapsedHours>=h.due){
   assert.equal(s.elapsedHours,h.due,"CAREER_ARRIVAL_ORDER");
   s.world.soldiers.push(h.member);h.arrived=true;delete h.member;
   record(s,"careerHireArrival",{profile:h.profile,body:h.body,ordered:h.ordered,due:h.due,stats:careerStats(member(s),data)});
  }
  const p=s.career.training;
  if(p&&s.elapsedHours>=p.due){
   assert.equal(s.elapsedHours,p.due,"CAREER_RECOVERY_ORDER");
   member(s).state.status="healthy";const afterRecovery=careerStats(member(s),data);
   const completed={...p,completed:s.elapsedHours,afterRecovery};
   s.career.completed.push(completed);s.career.training=null;record(s,"careerTrainingRecovered",completed);
  }
 }
 function tick(s){core.tick(s);arrivals(s);}
 function flush(s){core.flush(s);arrivals(s);}
 function snapshot(s){
  const m=member(s);if(!m)return null;
  return {stats:careerStats(m,data),transformations:data.transformations.map(r=>{const v=verdict(s,r.id);return {id:r.id,koName:r.koName,kind:v.kind,blockers:v.blockers||[],conditions:v.conditions||[],research:r.requires,functions:r.requiresBaseFunc,material:r.requiredItems,cost:r.cost,recoveryDays:r.recoveryTime};}),worldHash:exactStateHash(s.world)};
 }
 return {...core,tick,flush,initialize,order,train,verdict,snapshot};
}
