// Research and event access overlay for soldier transformations.
// A route block needs a DISABLED prerequisite or a closed confirmed joint
// event supply. Missing ownership of an item/research is NEVER itself proof
// that a route is impossible. No assumptions about chronological game state.
const values=x=>Array.isArray(x)?x:[];
const text=x=>String(x||"").trim();

export function researchClosure(roots,graph,{mode="nominal"}={}){
  const visited=new Set(),queue=[...values(roots)],parents=new Map();
  while(queue.length){
    const id=queue.pop();
    if(visited.has(id)||!id)continue;
    visited.add(id);
    const topic=graph[id]||{},nominal=values(topic.prerequisites);
    const nextParents=mode==="assumed"?
      [...new Set([...values(topic.strictRequires),...(nominal.length===1?nominal:[])])]:nominal;
    for(const prerequisite of nextParents){
      if(!parents.has(prerequisite))parents.set(prerequisite,id);
      queue.push(prerequisite);
    }
  }
  return {ids:visited,parents};
}

export function routeContext(data,choices={}){
  const graph=data.researchGraph||{};
  const groupIds=new Set(values(data.routeChoices).map(g=>g.id));
  const branchIds=new Set(values(data.routeChoices).flatMap(g=>values(g.choices).map(c=>c.id)));
  const selections=values(data.routeChoices).flatMap(g=>choices[g.id]?[choices[g.id]]:[]);
  const custom=Array.isArray(choices.extra)?choices.extra:
    text(choices.extra).split(/[\s,;]+/).filter(Boolean);
  const unknownIds=[...new Set([...selections,...custom])].filter(id=>!graph[id]);
  const explicit=new Set([...selections,...custom].filter(id=>!!graph[id]));
  const {ids:completed}=researchClosure([...explicit],graph,{mode:"assumed"});
  const disabledBy=new Map();
  for(const id of completed){
    for(const target of values(graph[id]?.disables)){
      if(!disabledBy.has(target))disabledBy.set(target,new Set());
      disabledBy.get(target).add(id);
    }
  }
  // A manually selected reenable may restore an earlier disabled flag. With
  // no historical order, do not claim it is permanently excluded.
  for(const id of completed)for(const target of values(graph[id]?.reenables))
    disabledBy.delete(target);
  const contradictions=[...completed].filter(id=>disabledBy.has(id));
  return{explicit,completed,disabledBy,contradictions,unknownIds,branchIds,
    alternativeSources:data.alternativeSources||{},
    missingChoiceGroups:[...groupIds].filter(id=>!choices[id])};
}

export function researchBlock(id,context,graph,eventSources={},path=new Set()){
  if(path.has(id)||path.size>=8)return[]; // cycles/deep paths are unresolved, not proof of exclusion
  if(context.completed.has(id)&&!context.disabledBy.has(id))return[]; // already granted; event no-self replay gate is irrelevant
  const next=new Set(path);next.add(id);
  const causes=[],disabled=context.disabledBy.get(id);
  if(disabled?.size)causes.push({researchId:id,disabledBy:[...disabled],via:null});
  const topic=graph[id]||{},nominal=values(topic.prerequisites);
  // OXCE dependencies are unlock candidates and can be bypassed by an
  // event or explicit unlock; do NOT require an entire nominal chain.
  // Hard "requires", one-parent gates and direct named branch choices are
  // stronger evidence. For a multi-parent alternative gate, reject only
  // when every indexed dependency route is independently closed.
  const namedGates=nominal.filter(x=>context.branchIds.has(x));
  const bypass=context.alternativeSources?.[id]||{};
  const possibleUnlock=[...values(bypass.unlockers),...values(bypass.freeGrantors)]
    .some(grantor=>!context.disabledBy.has(grantor));
  // Any still-reachable event reward grants its research flag without following
  // the ordinary dependency chain. It is NOT proof that the player owns it.
  const possibleEvent=values(eventSources[id]).some(source=>
    eventAccess(source,context,graph,eventSources,next).possible);
  const requiredDeps=possibleUnlock||possibleEvent?[]:
    [...(nominal.length===1?nominal:[]),...namedGates];
  const mandatory=[...new Set([...values(topic.strictRequires),...requiredDeps])];
  for(const parent of mandatory){
    for(const reason of researchBlock(parent,context,graph,eventSources,next))
      causes.push({...reason,via:reason.via||id});
  }
  // Costless event flags may be unblocked even with no research prerequisite.
  // Inspect all indexed grant alternatives; a closed one is enough only if
  // ALL confirmed event grant scripts are made impossible by the chosen route.
  const sources=values(eventSources[id]);
  const directlyBranchGated=sources.some(e=>e.scripts.some(s=>s.yes.some(t=>context.branchIds.has(t))));
  if(topic?.cost==null&&topic?.needItem&&sources.length&&directlyBranchGated){
    const grants=sources.map(source=>eventAccess(source,context,graph,eventSources,next));
    if(grants.every(g=>g.impossible)){
      const details=grants.flatMap(g=>g.paths.flatMap(s=>s.blocked));
      causes.push({researchId:id,disabledBy:[...new Set(details.flatMap(b=>b.disabledBy))],
        viaEvent:sources.map(s=>s.eventId),kind:"event-grant-blocked",
        triggerIds:[...new Set(details.map(b=>b.triggerId).filter(Boolean))]});
    }
  }
  return causes;
}

export function eventAccess(event,context,graph,eventSources={},path=new Set()){
  const scripts=values(event.scripts),paths=scripts.map(s=>{
    const blocked=[];
    for(const id of values(s.yes))
      for(const cause of researchBlock(id,context,graph,eventSources,path))
        blocked.push({...cause,triggerId:id,triggerType:"yes",scriptId:s.scriptId});
    for(const id of values(s.no))
      if(context.completed.has(id))blocked.push({
        researchId:id,disabledBy:[id],triggerId:id,triggerType:"no",scriptId:s.scriptId});
    return {scriptId:s.scriptId,blocked,possible:!blocked.length,
      yes:values(s.yes),no:values(s.no),otherTriggers:values(s.otherTriggers),
      conditions:s.conditions||{}};
  });
  return{eventId:event.eventId,eventKoName:event.eventKoName,paths,
    impossible:paths.length>0&&paths.every(s=>!s.possible),
    possible:paths.some(s=>s.possible)};
}

export function trainingRouteAccess(t,context,data){
  const graph=data.researchGraph||{};
  const roots=values(t.researchRoots);
  const eventSources=data.researchEventRoutes||{};
  const blockedResearch=roots.flatMap(id=>researchBlock(id,context,graph,eventSources));
  const provenJoint=values(data.exclusiveJointGrants?.[t.id]);
  const eventGates=provenJoint.map(x=>{
    const source=values(data.researchEventRoutes?.[x.researchId]).find(p=>p.eventId===x.eventId);
    return {...x,access:source?eventAccess(source,context,graph,eventSources):null};
  });
  const blockedEvents=eventGates.filter(g=>g.access?.impossible);
  const sourceEvents=roots.flatMap(root=>
    values(data.researchEventRoutes?.[root]).map(source=>({
      researchId:root,...eventAccess(source,context,graph,eventSources)})));
  // A confirmed completed research flag does not need its one-time event
  // to be eligible again; token inventory remains a separate check.
  // Otherwise the event's self-negative trigger would incorrectly mark
  // completed Captain's 11 research as route-impossible.
  const exclusiveBlocked=provenJoint.length>0&&blockedEvents.length===provenJoint.length&&
    provenJoint.every(g=>!context.completed.has(g.researchId));
  const unknownSources=roots.filter(id=>graph[id]?.needItem&&graph[id]?.cost==null&&!data.researchEventRoutes?.[id]?.length);
  const alternateRoots=roots.flatMap(id=>{
    const source=data.alternativeSources?.[id]||{};
    return [...values(source.unlockers).map(sourceId=>({type:"unlocks 우회 후보",id:sourceId})),
      ...values(source.freeGrantors).map(sourceId=>({type:"무료 연구 추첨 후보",id:sourceId}))];
  });
  const unresolved=[
    ...alternateRoots,
    ...unknownSources.map(id=>({type:"research-source",id})),
    ...values(t.requiredItems).filter(it=>data.itemSources?.[it.id]).map(it=>({
      type:"item",id:it.id,amount:it.amount,source:data.itemSources[it.id]})),
    ...roots.filter(id=>graph[id]?.needItem).map(id=>({type:"needItem",id})),
    ...values(t.requiresBaseFunc).map(id=>({type:"facility",id}))
  ];
  const blockers=[
    ...blockedResearch.map(x=>({kind:"disabled-research",...x})),
    ...(!blockedResearch.length&&exclusiveBlocked?blockedEvents.map(x=>({
      kind:"exclusive-event",...x
    })):[])
  ];
  return {blocked:blockers.length>0,blockers,blockedResearch,blockedEvents,
    sourceEvents,eventGates,unresolved,unknownSources,
    evidenceLevel:blockers.length?"proven-unavailable":unresolved.length||sourceEvents.length?"requires-verification":"research-route-compatible"};
}

export function planRouteAccess(transformations,context,data){
  return transformations.map(t=>({id:t.id,...trainingRouteAccess(t,context,data)}));
}
