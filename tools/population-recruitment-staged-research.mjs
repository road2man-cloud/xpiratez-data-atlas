// Persist actual partial research histories, not relaxed prerequisite sets.
// A failed solve does not delete successful independent prerequisites.
// All proposals use original planner actions; caller validates branch/context.
export const POLICY="CONCRETE_PARTIAL_RECRUITMENT_RESEARCH_V1";
export function createStagedResearch({planner,active,accept,deadline=Infinity,maxCalls=24,maxDepth=8,variant=0}){
 const stats={calls:0,accepted:0,rejected:0,decomposed:0,partial:0},failures=[],completed=[];
 const time=()=>stats.calls<maxCalls&&performance.now()<deadline;
 let current;
 function attempt(goal){
  if(active(current.world,goal))return true;
  if(!time())return false;
  stats.calls++;
  const q=planner.ensure([goal],current);
  if(q.ok&&active(q.node.world,goal)&&accept(current,q.node)){
   current=q.node;stats.accepted++;completed.push(goal);return true;
  }
  stats.rejected++;failures.push({goal,reason:q.ok?"CONTEXT_OR_BRANCH_CONFLICT":q.reason,deadEnds:q.deadEnds?.slice(0,3)||[],failures:q.failures?.slice(-2)||[]});
  return false;
 }
 function advance(goal,stack=[]){
  if(active(current.world,goal))return true;
  if(!time()||stack.includes(goal)||stack.length>=maxDepth||current.world.disabled.has(goal))return false;
  if(attempt(goal))return true;
  const options=(planner.methods.get(goal)||[]).filter(m=>m.deps.every(k=>!current.world.disabled.has(k)));
  const ranked=options.map(m=>({m,cost:m.deps.reduce((s,k)=>s+(active(current.world,k)?0:planner.distance.get(k)??1e8),0)})).sort((a,b)=>a.cost-b.cost||a.m.deps.length-b.m.deps.length);
  // Alternate method orders across subsequent rounds, retain other methods
  // as unresolved. No branch is certified by this bounded scheduler.
  const off=ranked.length?variant%ranked.length:0;
  for(const {m} of [...ranked.slice(off),...ranked.slice(0,off)].slice(0,2)){
   if(!time())break;
   stats.decomposed++;
   const ds=m.deps.filter(k=>!active(current.world,k)).sort((a,b)=>(planner.distance.get(a)??1e8)-(planner.distance.get(b)??1e8)||a.localeCompare(b));
   if(variant%2)ds.reverse();
   for(const dep of ds){if(!time())break;advance(dep,[...stack,goal]);}
   if(m.deps.every(k=>active(current.world,k))&&attempt(goal))return true;
  }
  return active(current.world,goal);
 }
 function run(start,goals){
  current=start;
  // Cheap prerequisites first; hard goals can build on stored progress.
  const ordered=[...new Set(goals)].sort((a,b)=>(planner.distance.get(a)??1e8)-(planner.distance.get(b)??1e8)||a.localeCompare(b));
  for(const goal of ordered){if(!time())break;advance(goal);}
  const achieved=goals.filter(k=>active(current.world,k)),remaining=goals.filter(k=>!active(current.world,k));
  if(current.steps.length>start.steps.length&&remaining.length)stats.partial++;
  return {node:current,achieved,remaining,complete:!remaining.length,stats,completed,failures};
 }
 return {run};
}
