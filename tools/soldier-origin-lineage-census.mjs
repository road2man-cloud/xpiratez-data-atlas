// Source-rooted, bounded *structural* ancestry for X-Piratez v.o2.
//
// This is not a campaign search and must NEVER mark a route executable.
// Only explicit producedSoldierType transformations are expanded. In-between
// same-body training, research grants, medals, healing, corpse recovery,
// stats, item supply, time, RNG and economic feasibility remain unresolved.
// A missing path does NOT prove an origin impossible: some need intermediate
// non-body-changing transformations. A transformation ID is used at most once
// per candidate; after history resets, repeats are not exhaustively explored.
const ordered=(a,b)=>a<b?-1:a>b?1:0;
const arr=x=>Array.isArray(x)?x:[];
const positiveHistory=x=>Object.keys(x||{})
  .filter(k=>Number(x[k])>0).sort(ordered);
const keyOf=(id,parent)=>"transform:"+id+":from:"+parent;

export function enumerateSourceBodyChangeLineages(data){
  if(data?.meta?.mod?.version!=="v.o2")
    throw new Error("Source ancestry requires the v.o2 modern soldier rules");
  const bodyIds=new Set((data.soldiers||[]).map(s=>s.id));
  const roots=[...(data.profiles||[])].sort((a,b)=>ordered(a.id,b.id));
  const transforms=(data.transformations||[]).filter(t=>
    t.producedSoldierType&&!t.createsClone&&!t.producedItem);
  const byInput=new Map();
  const byEdge=new Map();
  for(const t of transforms){
    if(!bodyIds.has(t.producedSoldierType))
      throw new Error("Unknown transformation target "+t.id);
    for(const type of arr(t.allowedSoldierTypes)){
      if(!bodyIds.has(type))throw new Error("Unknown transformation parent "+t.id+"/"+type);
      const key=keyOf(t.id,type);
      if(byEdge.has(key))throw new Error("Duplicate transformation edge "+key);
      byEdge.set(key,[]);
      const list=byInput.get(type)||[];
      list.push(t);
      byInput.set(type,list);
    }
  }
  for(const list of byInput.values())list.sort((a,b)=>ordered(a.id,b.id));

  let candidatePathCount=0,maxDepth=0,withReset=0,
    needUnverifiedVitalTransition=0,terminalSameBody=0;
  const originsWithPaths=new Set();
  for(const root of roots){
    if(!bodyIds.has(root.soldierType))
      throw new Error("Unknown starting soldier type "+root.id);
    const originalHistory=new Set(positiveHistory(root.previousTransformations));
    function traverse(type,history,used,path,hasReset,previousNeedsDead){
      for(const rule of byInput.get(type)||[]){
        if(used.has(rule.id)||arr(rule.requires).includes("STR_UNAVAILABLE")||
          arr(rule.forbiddenSoldierTypes).includes(type)||
          arr(rule.requiredPreviousTransformations).some(id=>!history.has(id))||
          arr(rule.forbiddenPreviousTransformations).some(id=>history.has(id)))
          continue;
        const validVitals=[
          rule.allowsLiveSoldiers?"live":null,
          rule.allowsWoundedSoldiers?"wounded":null,
          rule.allowsDeadSoldiers?"dead":null
        ].filter(Boolean);
        if(!validVitals.length)continue;
        const nextHistory=new Set(rule.reset?[]:history);
        if(!rule.reset)
          for(const id of arr(rule.removeTransformations))nextHistory.delete(id);
        nextHistory.add(rule.id);
        const step={
          transformationId:rule.id,fromType:type,toType:rule.producedSoldierType,
          historyReset:rule.reset===true,
          requiredVitals:validVitals,
          corpseRecoveryRequired:rule.needsCorpseRecovered===true
        };
        const newPath=[...path,step];
        const key=keyOf(rule.id,type);
        const candidate={
          rootProfileId:root.id,
          rootSoldierType:root.soldierType,
          steps:newPath,
          terminalHistory:[...nextHistory].sort(ordered),
          hasHistoryReset:hasReset||step.historyReset,
          vitalContinuityUnverified:previousNeedsDead,
          status:"TYPE_CHANGE_GRAPH_ONLY_NOT_EXECUTED",
          finalStats:null,finalSum:null,
          proof:{research:false,material:false,commendations:false,stats:false,
            eventOrRng:false,vitalStatus:false,chronologicalReplay:false,save:false}
        };
        byEdge.get(key).push(candidate);
        candidatePathCount++;
        maxDepth=Math.max(maxDepth,newPath.length);
        if(candidate.hasHistoryReset)withReset++;
        if(candidate.vitalContinuityUnverified)needUnverifiedVitalTransition++;
        if(type===rule.producedSoldierType)terminalSameBody++;
        originsWithPaths.add(root.id);
        traverse(rule.producedSoldierType,nextHistory,new Set([...used,rule.id]),newPath,
          candidate.hasHistoryReset,previousNeedsDead||
          (validVitals.length===1&&validVitals[0]==="dead"));
      }
    }
    traverse(root.soldierType,originalHistory,new Set(),[],false,false);
  }
  const branches=[...byEdge].sort(([a],[b])=>ordered(a,b)).map(([id,paths])=>{
    const roots=[...new Set(paths.map(p=>p.rootProfileId))].sort(ordered);
    return {id,rootProfileIds:roots,candidateCount:paths.length,
      directRootCount:paths.filter(p=>p.steps.length===1).length,
      viaOtherBodyChangeCount:paths.filter(p=>p.steps.length>1).length,
      maxDepth:Math.max(0,...paths.map(p=>p.steps.length)),
      candidates:paths.sort((a,b)=>
        ordered(a.rootProfileId,b.rootProfileId)||
        ordered(a.steps.map(s=>s.transformationId).join(">"),
          b.steps.map(s=>s.transformationId).join(">"))),
      noRecordedPathMeaning:paths.length?null:
        "Only explicit type-change sequences were enumerated; missing intermediary training is NOT proven impossible"};
  });
  return {schemaVersion:1,kind:"SOURCE_ROOTED_TYPE_CHANGE_CANDIDATES",
    ruleset:"v.o2",scope:"BOUNDED_TYPE_CHANGE_ONLY",
    limits:[
      "One explicit producedSoldierType rule per candidate step; no repeats of a transformation ID",
      "Normal/same-body non-producedSoldierType transformations between body changes are not enumerated",
      "Required history and forbidden history of the chosen body-change steps are checked in order, including resets and removal",
      "No research, medals, rank, stats, materials, RNG, money, timeline, death/revival or corpse continuity has been executed",
      "Paths are neither certifiably feasible nor a complete set of all possible paths; empty path set is NOT an impossibility certificate"
    ],
    summary:{
      originalSpawnProfiles:roots.length,
      examinedBodyChangeRules:transforms.length,
      incomingEdges:branches.length,
      sourceAnchoredCandidates:candidatePathCount,
      rootsWithCandidatePath:originsWithPaths.size,
      longestBodyChangeChain:maxDepth,
      candidatesWithHistoryReset:withReset,
      candidatesRequiringUnverifiedPostDeathContinuity:needUnverifiedVitalTransition,
      candidatesWithSameBodyProducedType:terminalSameBody,
      fullyExecutedCandidates:0,verifiedFinalStatCandidates:0
    },
    branches};
}
