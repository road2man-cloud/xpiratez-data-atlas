import fs from "node:fs";

const ids=v=>(Array.isArray(v)?v:[]).map(x=>typeof x==="string"?x:x?.id).filter(x=>typeof x==="string");
export function auditMultiPrerequisiteBranches(topics){
  const byId=new Map(topics.map(t=>[t.id,t]));
  const incomingUnlocks=new Map();
  for(const source of topics)for(const target of ids(source.unlocks)){
    if(!incomingUnlocks.has(target))incomingUnlocks.set(target,[]);
    incomingUnlocks.get(target).push(source.id);
  }
  let multipleCount=0,conflictCount=0,selfLockCount=0,hardConflictCount=0,unsafeUnlockCount=0;
  let selfDisablingSourceTargets=0,selfDisablingSourceEdges=0;
  const affected=[];
  for(const t of topics){
    const requirements=ids(t.requires);
    const dep=ids(t.dependencies).filter(id=>!requirements.includes(id));
    const prerequisite=[...dep.map(id=>({id,field:"dependencies"})),
      ...requirements.map(id=>({id,field:"requires"}))];
    if(prerequisite.length>=2)multipleCount++;
    const conflicts=[];
    for(let i=0;i<prerequisite.length;i++)for(let j=i+1;j<prerequisite.length;j++){
      const a=prerequisite[i],b=prerequisite[j];
      for(const [from,to] of [[a,b],[b,a]]){
        if(from.id===to.id)continue;
        if(ids(byId.get(from.id)?.disables).includes(to.id)){
          conflicts.push({from:from.id,to:to.id,fromField:from.field,toField:to.field,
            requiresAffected:from.field==="requires"||to.field==="requires"});
        }
      }
    }
    const selfLocks=prerequisite.filter(from=>ids(byId.get(from.id)?.disables).includes(t.id));
    if(conflicts.length||selfLocks.length){
      if(conflicts.length)conflictCount++;
      if(selfLocks.length)selfLockCount++;
      if(conflicts.some(x=>x.requiresAffected))hardConflictCount++;
      const allUnlockSources=incomingUnlocks.get(t.id)||[];
      const unsafeUnlockSources=allUnlockSources.filter(source=>ids(byId.get(source)?.disables).includes(t.id));
      // OXCE first adds the source to discovered, then processes its disables,
      // *removing its own discovered flag too*. Only currently discovered
      // sources supply an unlock in getAvailableResearchProjects().
      const selfDisablingUnlockSources=allUnlockSources.filter(source=>
        source!==t.id&&ids(byId.get(source)?.disables).includes(source));
      const unlockSources=allUnlockSources.filter(source=>
        !unsafeUnlockSources.includes(source)&&!selfDisablingUnlockSources.includes(source));
      if(unsafeUnlockSources.length)unsafeUnlockCount++;
      if(selfDisablingUnlockSources.length)selfDisablingSourceTargets++;
      selfDisablingSourceEdges+=selfDisablingUnlockSources.length;
      affected.push({id:t.id,koName:t.koName||"",enName:t.enName||"",
        dependencies:dep,requires:requirements,unlockSources,unsafeUnlockSources,
        selfDisablingUnlockSources,
        conflicts,selfLocks:selfLocks.map(x=>({from:x.id,field:x.field}))});
    }
  }
  // An incoming unlock edge is a bypass mechanism, not a proof that its
  // granting research is reachable. Check the unlocker's OWN nominal gates.
  // This is only a one-hop warning: an event, getOneFree, or another unlock
  // may bypass those gates too, so it must not become a hard exclusion.
  const collisionById=new Map(affected.map(row=>[row.id,row.conflicts]));
  const sourceIdsWithConflicts=new Set();
  let nestedConflictTargets=0,nestedConflictRoutes=0;
  for(const row of affected){
    row.unlockSourceConflicts=row.unlockSources.flatMap(source=>{
      const sourcePairs=collisionById.get(source)||[];
      if(!sourcePairs.length)return [];
      sourceIdsWithConflicts.add(source);
      return [{source,pairCount:new Set(sourcePairs.map(pair=>[pair.from,pair.to].sort().join("|"))).size}];
    });
    if(row.unlockSourceConflicts.length)nestedConflictTargets++;
    nestedConflictRoutes+=row.unlockSourceConflicts.length;
  }
  return {schemaVersion:2,meta:{total:topics.length,multipleCount,conflictCount,selfLockCount,
    hardConflictCount,unsafeUnlockCount,selfDisablingSourceTargets,selfDisablingSourceEdges,
    nestedConflictTargets,nestedConflictRoutes,
    nestedConflictSources:sourceIdsWithConflicts.size,affected:affected.length},affected};
}

if(process.argv[1]?.replaceAll("\\","/").endsWith("/research-branch-audit.mjs")){
  const topics=JSON.parse(fs.readFileSync("public/data/choice-simulator-index.json","utf8")).topics;
  const report=auditMultiPrerequisiteBranches(topics);
  console.log("Summary:",report.meta);
  for(const r of report.affected)console.log(r.id+" | "+r.koName+" | dep="+r.dependencies.length+" req="+r.requires.length+" conflict="+r.conflicts.length+" self="+r.selfLocks.length+" unlock="+r.unlockSources.length);
}
