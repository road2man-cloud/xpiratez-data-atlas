// Research-branch evidence is derived from replayed transitions, not from a
// final disabled-set snapshot. The distinction matters with one-way closes,
// repeated grants, reenable, self-disable and multi-topic auto completion.
//
// Each transition is atomic at this export level. "closedInStep" means the
// research became closed during that verifier step; it does NOT prove that
// the selected topic alone caused it when several zero-cost topics completed.
const arr=x=>Array.isArray(x)?x:[];
const disabling=rule=>arr(rule?.disables);
const options=new Set(['research','freeResearch','eventResearch']);
const subject=step=>options.has(step?.type)?step.id:null;

export function researchBranchEvidence(replay,rules){
  if(!replay?.ok||!Array.isArray(replay.trace)||!rules)throw Error('Validated replay trace and 2.1 research rules required');
  const trace=replay.trace;
  const first=new Map(),lastReopen=new Map();
  // Timeline states are reconstructed solely from verifier snapshots.
  // The foundation starts with ZERO completed and ZERO disabled research.
  for(const [i,entry] of trace.entries()){
    for(const id of arr(entry.closed))if(!first.has(id))first.set(id,i);
    for(const id of arr(entry.reopened))lastReopen.set(id,i);
  }
  const choices=[],seen=new Set(),closed=new Set();
  for(const [at,entry] of trace.entries()){
    const before=new Set(closed);
    for(const id of arr(entry.closed))closed.add(id);
    for(const id of arr(entry.reopened))closed.delete(id);
    const directlySelected=subject(entry);
    const ids=[...arr(entry.added)];
    // Research that disables itself never survives into the active
    // completed set and consequently does not appear in entry.added.
    // Count it only when the transition actually observed its closure.
    if(directlySelected&&!ids.includes(directlySelected)&&
       disabling(rules[directlySelected]).includes(directlySelected)&&
       arr(entry.closed).includes(directlySelected))ids.push(directlySelected);
    for(const id of ids){
      const rule=rules[id];
      if(seen.has(id)||!disabling(rule).length)continue;
      seen.add(id);
      choices.push({id,at,excludes:disabling(rule).map(target=>{
        const isNew=arr(entry.closed).includes(target);
        const beforeClosed=before.has(target);
        const afterClosed=closed.has(target);
        const endClosed=replay.world.disabled.has(target);
        const firstAt=first.get(target)??null;
        const lastOpen=lastReopen.get(target)??null;
        const direction=target===id?'self':disabling(rules[target]).includes(id)?'bidirectional':'oneway';
        const closureTiming=isNew?'new-in-step':
          beforeClosed?'already-closed':
          endClosed?'closed-after':'not-closed';
        return {id:target,direction,actuallyClosed:endClosed,
          closedInStep:isNew,closedBeforeStep:beforeClosed,
          firstClosedAt:firstAt,reopenedAt:lastOpen,
          closureTiming,
          closedAtEnd:endClosed,
          // An observed transition is strong evidence about state. It is
          // not a per-topic proof of causation inside a multi-topic queue.
          attribution:at>=0&&arr(entry.added).length>1?'shared-transition':'step-transition'};
      })});
    }
  }
  return choices;
}
