// Keep independently replayable advances when a later research goal fails.
// solve must be copy-on-write; this helper does not invent research awards.
export function advanceResearchGoals({targets,start,active,solve,canAttempt,maxPasses=3}){
  if(!Number.isSafeInteger(maxPasses)||maxPasses<1||maxPasses>10)throw Error('invalid maxPasses');
  const goals=[...new Set(targets)],goalSet=new Set(goals);
  const initial=new Set(goals.filter(id=>active(start.world,id)));
  let node=start,passes=0,tries=0;
  const rejected=[];
  for(;passes<maxPasses&&canAttempt();){
    passes++;
    let changed=false;
    for(const id of goals){
      if(active(node.world,id)||!canAttempt())continue;
      const before=node,keep=goals.filter(k=>active(before.world,k));
      tries++;
      const next=solve(id,before,goalSet);
      if(!next){rejected.push({id,reason:'SEARCH_FAILED'});continue;}
      if(next.world.pendingFree||!active(next.world,id)||keep.some(k=>!active(next.world,k))||next.steps.length<=before.steps.length){
        rejected.push({id,reason:'NO_SAFE_REPLAYABLE_PROGRESS'});continue;
      }
      node=next;changed=true;
    }
    if(!changed||goals.every(id=>active(node.world,id)))break;
  }
  const remaining=goals.filter(id=>!active(node.world,id));
  const gained=goals.filter(id=>!initial.has(id)&&active(node.world,id));
  return {ok:remaining.length===0,node,remaining,gained,passes,tries,rejected,
    status:remaining.length===0?'READY':gained.length?'PARTIAL':'NO_PROGRESS'};
}
