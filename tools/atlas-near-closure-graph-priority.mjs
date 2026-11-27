// Archive-backed scheduling only. No route is admitted or discarded here.
// Select a small set of graphs with few unresolved obligations; prefer
// concrete research-ready actions and avoid repeatedly choosing the same
// graph on successive production passes.
export function rankNearClosureGraphs({ledger,admission,bodies,focus=[],limit=3}){
 const allowed=new Set(bodies),actions=new Set(focus),ranked=new Map();
 const priorTurns=new Map(),corridors=new Map();
 for(const r of Object.values(ledger.closureWave?.records||{})){
  if(!r.graph||!allowed.has(r.body))continue;
  priorTurns.set(r.graph,(priorTurns.get(r.graph)||0)+1);
  const k=r.graph+"|"+r.action,c=corridors.get(k)||{contextConflicts:0,success:0};
  if(r.status==="TRANSFORM_REPLAY"||r.corridor&&Array.isArray(r.corridor.missing)&&!r.corridor.missing.length)c.success++;
  else if(JSON.stringify([r.failures,r.reason,r.outcomes]).includes("CAMPAIGN_CONTEXT_CONFLICT"))c.contextConflicts++;
  corridors.set(k,c);
 }
 // Observed failures only defer a graph in this budget, not an action
 // or a research path. A concrete success overrides the negative hint.
 const compare=(a,b)=>a.priority-b.priority||a.remaining-b.remaining||b.ready-a.ready||a.missing-b.missing||a.turns-b.turns||b.traits-a.traits||a.route.localeCompare(b.route);
 for(const [id,v] of Object.entries(admission?.witnesses||{})){
  if(!["OPEN_RESEARCH_OR_GROWTH","OPEN_TRANSFORMATION"].includes(v.status))continue;
  const r=ledger.routes[id],g=ledger.graphs[r?.sourceGraph],n=g?.nodes[r?.sourceNode];
  if(!r||!n||g.blocker||!allowed.has(r.body)||v.stateHash!==r.canonicalStateHash||v.actionHash!==r.fullActionHash||n.stateHash!==v.stateHash)continue;
  if(!Array.isArray(v.openRules)||v.unknownRules?.length)continue;
  const jobs=v.openRules.filter(x=>!actions.size||actions.has(x.id));
  const growth=Number(!!v.openGrowth),focusedGrowth=growth&&(!actions.size||actions.has("CAP_GROWTH"));
  if(!jobs.length&&!focusedGrowth)continue;
  const missing=new Set(v.openRules.flatMap(x=>x.missingResearch||[]));
  const candidate={graph:r.sourceGraph,route:id,origin:r.origin,body:r.body,remaining:v.openRules.length+growth,ready:jobs.filter(x=>!x.missingResearch?.length).length+Number(focusedGrowth),missing:missing.size,traits:n.traits?.length||0,turns:priorTurns.get(r.sourceGraph)||0,actions:jobs.map(x=>x.id)};
  candidate.contextConflicts=v.openRules.filter(x=>x.missingResearch?.length).map(x=>({action:x.id,...corridors.get(r.sourceGraph+"|"+x.id)})).filter(x=>x.contextConflicts>0&&!x.success);
  candidate.contextPenalty=candidate.contextConflicts.reduce((s,x)=>s+Math.min(4,x.contextConflicts)*2,0);
  candidate.priority=candidate.remaining+candidate.contextPenalty;
  const old=ranked.get(candidate.graph);if(!old||compare(candidate,old)<0)ranked.set(candidate.graph,candidate);
 }
 return [...ranked.values()].sort(compare).slice(0,limit);
}
