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
      const unlockSources=allUnlockSources.filter(source=>!unsafeUnlockSources.includes(source));
      if(unsafeUnlockSources.length)unsafeUnlockCount++;
      affected.push({id:t.id,koName:t.koName||"",enName:t.enName||"",
        dependencies:dep,requires:requirements,unlockSources,unsafeUnlockSources,
        conflicts,selfLocks:selfLocks.map(x=>({from:x.id,field:x.field}))});
    }
  }
  return {schemaVersion:1,meta:{total:topics.length,multipleCount,conflictCount,selfLockCount,
    hardConflictCount,unsafeUnlockCount,affected:affected.length},affected};
}

if(process.argv[1]?.replaceAll("\\","/").endsWith("/research-branch-audit.mjs")){
  const topics=JSON.parse(fs.readFileSync("public/data/choice-simulator-index.json","utf8")).topics;
  const report=auditMultiPrerequisiteBranches(topics);
  console.log("Summary:",report.meta);
  for(const r of report.affected)console.log(r.id+" | "+r.koName+" | dep="+r.dependencies.length+" req="+r.requires.length+" conflict="+r.conflicts.length+" self="+r.selfLocks.length+" unlock="+r.unlockSources.length);
}
