// A joint request combines research goals, not transformation eligibility.
// All final goals must be simultaneously ACTIVE in one replayed world.
// No direct disables pair is treated as a permanent exclusion: re-enables
// and alternative acquisition orders may exist.
import {key} from "./population-research-career-core.mjs";
import {researchSetId} from "./final-career-active-research-sets.mjs";
export const POLICY="JOINT_ACTIVE_RESEARCH_SUFFIX_V1";
const uniq=x=>[...new Set(x)].sort();
export function createJointResearch(data,engine,suffixes,validate){
 const metrics={requests:0,componentAttempts:0,suffixAttempts:0,suffixHits:0,plannerAttempts:0,full:0,partial:0,failed:0,directConflictHints:0,reenableHints:0};
 function hints(goal){
  const set=new Set(goal),conflicts=[];
  for(const a of goal)for(const b of data.researchRules[a]?.disables||[])if(set.has(b))conflicts.push([a,b]);
  return conflicts;
 }
 function assemble(v,t,{variant=0,deadline=Infinity}={}){
  metrics.requests++;
  const requested=uniq(t.goal),conflicts=hints(requested),components=t.components||requested.map(k=>[k]);
  metrics.directConflictHints+=conflicts.length;
  const reenables=new Set(Object.values(data.researchRules).flatMap(r=>r.reenables||[]));
  metrics.reenableHints+=conflicts.filter(([,b])=>reenables.has(b)).length;
  // Order hints only: do a disabling action before its potentially reenabled
  // target. Reverse order and joint planner remain separate alternatives.
  const conflictWeight=k=>conflicts.filter(([a])=>a===k).length-conflicts.filter(([,b])=>b===k).length;
  const ordered=[...components].sort((a,b)=>variant%2?b.join("|").localeCompare(a.join("|")):b.reduce((s,k)=>s+conflictWeight(k),0)-a.reduce((s,k)=>s+conflictWeight(k),0)||a.join("|").localeCompare(b.join("|")));
  let current=v,accepted=[],records=[],attempted=[];
  for(const component of ordered){
   if(performance.now()>=deadline)break;
   const goals=uniq([...accepted,...component]);
   if(goals.every(k=>engine.replay.active(current.world,k))){accepted=goals;continue;}
   metrics.componentAttempts++;attempted.push(component);
   const sub={...t,goal:goals,sourceSet:researchSetId(current.world,v.branch)};
   let q=null,method=null;
   for(const p of (suffixes.get(key([v.branch,component]))||[]).slice(0,12)){
    metrics.suffixAttempts++;q=validate(current,sub,p.actions)||validate(current,sub,p.actions,true);
    if(q){metrics.suffixHits++;method={kind:"SHARED_COMPONENT_SUFFIX",hash:p.hash};break;}
   }
   if(!q&&performance.now()<deadline){
    metrics.plannerAttempts++;
    const x=engine.plan({world:current.world,steps:current.steps},v.branch,v.birth.birth,{id:t.targets[0],requires:goals});
    if(x.ok){q=validate(current,sub,x.n.steps.slice(current.steps.length));if(q)method={kind:"JOINT_COMPONENT_PLANNER"};}
   }
   if(!q)continue;
   current={...current,world:q.world,steps:q.steps,allowed:q.allowed};
   accepted=goals;records.push({component,accepted:[...accepted],...method,actions:q.actions.length});
  }
  // A component may incidentally award other requested topics. Count them
  // only after the final actual active-state test.
  const achieved=requested.filter(k=>engine.replay.active(current.world,k));
  const remaining=requested.filter(k=>!achieved.includes(k));
  const q=achieved.length>=2?validate(v,{...t,goal:achieved},current.steps.slice(v.steps.length)):null;
  if(q)metrics[remaining.length?"partial":"full"]++;else metrics.failed++;
  return {q,achieved,remaining,attempted,records,conflicts,variant,complete:!!q&&!remaining.length};
 }
 return {assemble,hints,metrics};
}
