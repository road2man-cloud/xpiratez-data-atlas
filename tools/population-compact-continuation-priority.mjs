// Prioritize concrete shorter endpoints, never remove archive states or
// declare their continuations impossible. The receipt is scheduling input.
export function createCompactContinuationPriority(graphs,records,{boost=24,penalty=72}={}){
 const targets=new WeakMap(),sources=new WeakMap(),metrics={policy:"COMPACT_CONTINUATION_PRIORITY_V1",receipts:0,rejected:0,sourceNodes:0,targetNodes:0,selectedCompact:0,selectedLong:0,selectedOther:0,compactApplied:0,compactResearchAdvanced:0,compactTraitGains:0,longApplied:0,otherApplied:0};
 const set=(m,g)=>{let s=m.get(g);if(!s){s=new Set();m.set(g,s);}return s;};
 for(const r of Object.values(records||{})){
  if(r.status!=="COMPACT_REPLAY")continue;
  const g=graphs[r.graph],a=g?.nodes[r.from],b=g?.nodes[r.to];
  if(!a||!b||r.from===r.to||a.stateHash!==r.sourceStateHash||b.stateHash!==r.targetStateHash||r.policy!=="NONREMOVABLE_PRESENCE_COUNTERS_V1"||!r.removed?.length||r.savedCost<0){metrics.rejected++;continue;}
  set(sources,g).add(r.from);set(targets,g).add(r.to);metrics.receipts++;
 }
 for(const g of Object.values(graphs)){
  const a=sources.get(g),b=targets.get(g);metrics.sourceNodes+=a?.size||0;
  if(b){for(const i of a||[])b.delete(i);metrics.targetNodes+=b.size;}
 }
 const kind=x=>sources.get(x.g)?.has(x.i)?"LONG":targets.get(x.g)?.has(x.i)?"COMPACT":"OTHER";
 const adjustment=x=>kind(x)==="LONG"?-penalty:kind(x)==="COMPACT"?boost:0;
 function selected(x){const k=kind(x);metrics[k==="COMPACT"?"selectedCompact":k==="LONG"?"selectedLong":"selectedOther"]++;return k;}
 function observe(k,record){
  if(!record)return;
  const applied=record.outcomes?.filter(e=>e.status==="CONDITIONAL_REPLAY")||[];
  metrics[k==="COMPACT"?"compactApplied":k==="LONG"?"longApplied":"otherApplied"]+=applied.length;
  if(k==="COMPACT"){
   metrics.compactResearchAdvanced+=Number(!!record.researchSuffixHash);
   metrics.compactTraitGains+=applied.filter(e=>e.traitCount>Object.keys(e.before||{}).length).length;
  }
 }
 return {kind,adjustment,selected,observe,metrics};
}
