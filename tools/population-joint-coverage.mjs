// One pair-level status across chronological and numerical evidence families.
// Counts are disjoint; detailed evidence remains separately preserved.
export function refreshPopulationJointCoverage(db){
 const p=db.populationSearch,v=p.versions[p.latest];
 const joined=new Set(Object.keys(db.originPairSearch?.pairs||{})),unlock=new Set(Object.keys(db.originUnlockSearch?.pairs||{})),events=new Set(Object.keys(db.originEventBirth?.pairs||{}));
 const conditional=new Set(Object.values(db.witnesses).filter(w=>["UNIFIED12","CAREER12"].includes(w.source)&&w.originProfile).flatMap(w=>(w.branchIds||[]).map(b=>w.originProfile+"|"+b)));
 const counts={unexplored:0,conditionalPath:0,chronologicalUnlock:0,jointBirth:0,eventBirth:0,limitedReused:0,limitedDirect:0,impossibleProven:0,globalOptimalCertified:0};
 let overlapJoint=0,overlapConditional=0,unlockOutsideModel=0,eventOutsideModel=0,eventOutsidePrior=0,eventOverlap=0;
 const rows=p.origins.map((pid,i)=>p.branches.map((bid,j)=>{
  const id=pid+"|"+bid,groups=v.matrix[i][j],reused=groups.length>0&&groups.every(k=>v.groups[k].primaryBranch!==j);
  if(unlock.has(id)){if(joined.has(id))overlapJoint++;if(conditional.has(id))overlapConditional++;if(!groups.length)unlockOutsideModel++;}
  if(events.has(id)){if(!groups.length)eventOutsideModel++;if(!groups.length&&!conditional.has(id)&&!unlock.has(id)&&!joined.has(id))eventOutsidePrior++;if(conditional.has(id)||unlock.has(id)||joined.has(id))eventOverlap++;}
  const [code,label]=conditional.has(id)?[1,"conditionalPath"]:unlock.has(id)?[5,"chronologicalUnlock"]:events.has(id)?[6,"eventBirth"]:joined.has(id)?[4,"jointBirth"]:groups.length?(reused?[2,"limitedReused"]:[3,"limitedDirect"]):[0,"unexplored"];
  counts[label]++;return code;
 }).join(""));
 const applicablePairs=p.origins.length*p.branches.length,uniqueCovered=applicablePairs-counts.unexplored,chronologicalOrExistingConditional=counts.conditionalPath+counts.chronologicalUnlock+counts.jointBirth+counts.eventBirth;
 const summary={uniqueCovered,counts,applicablePairs,chronologicalOrExistingConditional,unlockOutsideModel,eventOutsideModel,eventOutsidePrior,eventOverlap,overlapJoint,overlapConditional};
 db.populationJointCoverage={schemaVersion:2,sourceMetadataSha256:db.sourceMetadataSha256,origins:p.origins,branches:p.branches,status:rows,...summary,actualGameCertified:0};
 if(db.originUnlockSearch){Object.assign(db.originUnlockSearch.summary,summary);db.summary.originUnlockSearch=db.originUnlockSearch.summary;}
 if(db.originEventBirth){Object.assign(db.originEventBirth.summary,{eventOutsideModel,eventOutsidePrior,eventOverlap});db.summary.originEventBirth=db.originEventBirth.summary;}
 db.summary.populationJointCoverage=summary;
 return summary;
}
