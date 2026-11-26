// Scheduling hints from the existing source-bound replay archive.
// Never use a cached active set to grant or skip actual research checks.
export function createTerminalActiveResearchIndex({db,prior,graphs}){
 const sets=db.careerCompletion?.researchTraitSets,states=new Map();
 const metrics={archiveStates:0,appendOnlyArchiveStates:0,archiveRejected:0,learnedStates:0,lookups:0,hits:0,conflicts:0};
 function add(hash,topics,archive=false){
  if(!hash||!Array.isArray(topics))return;
  const s=new Set(topics),old=states.get(hash);
  if(old){
   if(old.size!==s.size||[...s].some(k=>!old.has(k))){metrics.conflicts++;throw Error("Conflicting active research for exact world "+hash);}
   return;
  }
  states.set(hash,s);metrics[archive?"archiveStates":"learnedStates"]++;
 }
 // A graph append does not invalidate an unchanged exact route. Reuse
 // only matching action/state identities under the same source metadata.
 if(sets?.sourceMetadataSha256===db.sourceMetadataSha256){
  for(const [id,r] of Object.entries(sets.records||{})){
   const raw=prior.routes?.[id],n=raw&&graphs[raw.sourceGraph]?.nodes[raw.sourceNode],p=sets.paths?.[r.pathId];
   if(!n||!p||r.actionHash!==raw.fullActionHash||r.stateHash!==raw.canonicalStateHash||r.stateHash!==n.stateHash){metrics.archiveRejected++;continue;}
   add(n.stateHash,p.active,true);
   if(sets.sourceGraphSha256!==prior?.sourceGraphSha256)metrics.appendOnlyArchiveStates++;
  }
 }
 function learn(n,w){add(n.stateHash,[...w.researched].filter(k=>!w.disabled.has(k)));}
 function ready(n,r){
  metrics.lookups++;
  const s=states.get(n.stateHash);if(!s)return false;metrics.hits++;
  return r.requires.every(k=>s.has(k));
 }
 return {learn,ready,metrics};
}
