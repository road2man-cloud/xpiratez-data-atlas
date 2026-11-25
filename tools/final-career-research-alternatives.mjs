// Research-set reuse is a proposal cache, not a feasibility certificate.
 // A failed candidate never rules out another world or acquisition order.
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {key} from "./population-research-career-core.mjs";
export function createResearchAlternatives(data,engine){
 const planners=new Map(),metrics={attempts:0,successes:0,plannerAttempts:0,failed:0,profiles:{}};
 function tryAlternative(v,t,validate,variant=0){
  const n={world:v.world,steps:v.steps},p=engine.policy(v.branch,n),blocked=new Set([...p.blocked,...p.opposing]);
  const goals=[...new Set([...t.goal,...p.commit])];
  // Different acquisition orders, deeper dependency search, and branch-aware
  // proposal filtering. Original world replay remains authoritative.
  const profile=variant%3;
  const configs=[{maxAttempts:150,maxDepth:38,methodLimit:32},{maxAttempts:220,maxDepth:45,methodLimit:56},{maxAttempts:300,maxDepth:50,methodLimit:80}];
  if(!planners.has(profile))planners.set(profile,createFoundationResearchPlanner(data,{...configs[profile],maxSteps:4000,collectFailures:true}));
  const planner=planners.get(profile),original=new Map();
  const ordered=profile===0?goals:profile===1?[...goals].reverse():[...goals].sort((a,b)=>(planner.distance.get(b)??1e8)-(planner.distance.get(a)??1e8)||a.localeCompare(b));
  const m=metrics.profiles[profile]??={attempts:0,successes:0};metrics.attempts++;m.attempts++;
  try{
   for(const [id,options] of planner.methods){
    // Only filter this proposal. A failure is not an impossibility proof.
    const filtered=options.filter(x=>!x.deps.some(k=>blocked.has(k)));
    if(filtered.length!==options.length){original.set(id,options);planner.methods.set(id,filtered);}
   }
   const start={world:v.world,steps:[...v.birth.birth,...v.steps],trace:[],diagnostics:[]};
   const r=planner.ensure(ordered,start);metrics.plannerAttempts+=r.attempts||0;
   if(r.ok){
    const q=validate(v,t,r.node.steps.slice(start.steps.length));
    if(q){metrics.successes++;m.successes++;return {q,profile,attempts:r.attempts,goalOrder:ordered};}
   }
   metrics.failed++;
   return {q:null,profile,reason:r.ok?"JOINT_REPLAY_UNRESOLVED":r.reason,deadEnds:r.deadEnds?.slice(0,8)||[],attempts:r.attempts};
  }finally{for(const [id,options] of original)planner.methods.set(id,options);}
 }
 return {tryAlternative,metrics};
}
// Grouping key uses the full research-set identity and required target set.
// This is scheduling reuse only, not equivalence of soldier/campaign states.
export const researchGoalGroup=t=>key([t.sourceSet,t.branch,t.goal]);
export function compactResearchSuffix(v,actions){
 // Skip only completed ordinary lab research when replaying it would be
 // redundant. Preserve free/repeat/event actions and all resource inputs.
 // Any removed action still needs full target-world replay and context check.
 const out=[];let w=v.world;
 for(const a of actions){
  if(a.type==="research"&&!w.pendingFree&&w.researched.has(a.id)&&!w.disabled.has(a.id))continue;
  out.push(a);
 }
 return out;
}
