// Bounded alternate research planner; no synthetic research grants.
// The original planner and published route verifier remain unchanged.
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
export function createQueueRecovery(data,engine){
 const planner=createFoundationResearchPlanner(data,{maxAttempts:180,maxDepth:32,maxSteps:1800,methodLimit:32});
 const {replay}=engine,metrics={recoveryPlans:0,recoveryPlannerAttempts:0,recoveryPlanSuccess:0};
 function plan(n,branch,birth,rule){
  const p=engine.policy(branch,n),required=[...new Set(rule.requires)],goals=[...new Set([...required.filter(k=>!replay.active(n.world,k)).reverse(),...p.commit,...required])];
  const start={world:n.world,steps:[...birth,...n.steps],trace:[],diagnostics:[]};metrics.recoveryPlans++;
  const q=planner.ensure(goals,start);metrics.recoveryPlannerAttempts+=q.attempts||0;
  if(!q.ok)return {ok:false,reason:q.reason,unresolved:q.unresolved};
  const suffix=q.node.steps.slice(start.steps.length);let w=n.world;
  try{
   if(!suffix.length||start.steps.length+suffix.length>1800)return {ok:false,reason:"RECOVERY_STEP_LIMIT"};
   for(const a of suffix){
    const next=replay.apply(w,a);
    if([...next.researched].some(id=>!w.researched.has(id)&&(p.blocked.has(id)||p.opposing.has(id)))||p.commit.some(id=>replay.active(w,id)&&!replay.active(next,id)))return {ok:false,reason:"RECOVERY_BRANCH_CONFLICT"};
    w=next;
   }
   if(w.pendingFree||!goals.every(id=>replay.active(w,id)))return {ok:false,reason:"RECOVERY_GOAL_INACTIVE"};
   const added=[...w.researched].filter(id=>replay.active(w,id)&&!replay.active(n.world,id));
   if(!added.length)return {ok:false,reason:"RECOVERY_NO_NEW_RESEARCH"};
   metrics.recoveryPlanSuccess++;return {ok:true,n:{world:w,steps:[...n.steps,...suffix]},added};
  }catch(e){return {ok:false,reason:String(e.message)};}
 }
 return {plan,metrics};
}
