// Attach preset resource and joint-stat queries to the existing GATE12 profiles.
import {createHash} from "node:crypto";
export function mergeResourceGoalCheckpoints({data,branches,profiles,witnesses,global,stats}){
 if(data.kind!=="XPZ_D5_RESOURCE_GOAL_CHECKPOINTS"||data.stats.join(",")!==stats.join(",")||data.mode!=="CAP_TARGET"||data.depth!==5)
  throw Error("Resource goal frontier scope mismatch");
 const signature=w=>JSON.stringify([w.body,w.vector,w.raw,w.bonus,w.steps,w.growthBefore]);
 const existing=new Map();
 for(const [id,w] of Object.entries(witnesses))if(w.source==="GATE12")existing.set(signature(w),id);
 let reused=0,added=0,refs=0,profileCount=0;
 const metrics={};
 const map=new Map(branches.filter(b=>b.legacyKey).map(b=>[b.legacyKey,b]));
 for(const [cls,c] of Object.entries(data.classes)){
  const combo=cls==="damsel"?"D_W":cls==="madgal"?"M_M":null;
  if(!combo)throw Error("Unknown class "+cls);
  const local=new Map();
  function register(id){
   if(local.has(id))return local.get(id);
   const w=c.witnesses[id];if(!w||w.source!=="GATE12"||w.sourceKind!=="D5_RESOURCE_GOAL_CHECKPOINT")throw Error("Missing skyline witness "+id);
   const key=signature(w),prior=existing.get(key),ref=prior||id;
   if(prior)reused++;
   else{
    if(witnesses[id])throw Error("Conflicting existing witness "+id);
    witnesses[id]=w;existing.set(key,id);added++;
   }
   local.set(id,ref);return ref;
  }
  const mapped=new Map();
  function attach(profileId,record){
   const p=profiles[profileId];
   if(!p||p.source!=="GATE12"||!record)throw Error("Missing GATE12 profile "+profileId);
   if(mapped.has(profileId)){
    if(mapped.get(profileId)!==record)throw Error("Resource goal profile ambiguity "+profileId);
    return;
   }
   mapped.set(profileId,record);
   p.resourceGoalCandidates=[...new Set(record.ids.map(register))];
   p.resourceGoalCheckpoints=Object.fromEntries(record.checkpoints.map(x=>[x.preset,{
    best:x.best.map(id=>id===null?null:register(id)),
    goals:Object.fromEntries(Object.entries(x.goals).map(([id,byObjective])=>[id,Object.fromEntries(Object.entries(byObjective).map(([o,w])=>[o,w===null?null:register(w)]))]))
   }]));
   refs+=p.resourceGoalCandidates.length;profileCount++;
  }
  for(const p of c.parentCases){
   const branch=map.get(p.caseKey);if(!branch)throw Error("Resource goal branch crosswalk "+p.caseKey);
   const profileId=branch.results[combo]?.CAP_TARGET;
   if(profileId!==combo+"|CAP_TARGET|"+p.profileId)throw Error("Resource goal profile crosswalk "+profileId);
   attach(profileId,c.profiles[p.profileId]);
  }
  attach(global[combo].CAP_TARGET,c.global);
  metrics[cls]=c.metrics;
 }
 return {mode:data.mode,depth:data.depth,presets:data.presets,goals:data.goals,objectives:data.objectives,sourceClasses:metrics,witnessesAdded:added,witnessesReused:reused,
  profileCount,resourceReferences:refs,scope:data.scope};
}
export function attachResourceGoalCheckpoints(db,bytes,filename){
 const data=JSON.parse(bytes);
 if(data.sourceMetadataSha256!==db.sourceMetadataSha256)throw Error("Resource goal source version mismatch");
 if(db.summary.resourceGoalCheckpoints)throw Error("Resource goal checkpoints already attached; regenerate the common registry instead");
 db.summary.resourceGoalCheckpoints=mergeResourceGoalCheckpoints({data,...db});
 db.sources.RESOURCEGOAL12={file:filename,sha256:createHash("sha256").update(bytes).digest("hex"),kind:data.kind};
 const row=db.catalog.find(x=>x.file===filename);
 if(row)row.integrated=true;else db.catalog.push({file:filename,integrated:true});
 db.summary.inventoryReports=db.catalog.length;
 db.summary.resourceGoalWitnesses=new Set(Object.values(db.profiles).flatMap(p=>p.resourceGoalCandidates||[])).size;
 db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
 return db.summary.resourceGoalCheckpoints;
}
