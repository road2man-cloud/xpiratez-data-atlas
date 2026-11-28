// Discover ordered training paths with growth BEFORE an otherwise blocked
// transformation, rather than decorating only successful no-growth seeds.
import {produceForwardCareer} from './atlas-v53-career-engine.mjs';
export function produceCareerGrowthSearch({data,snapshot,graph,graphFile,graphSha256,profileIds,targetStates,maxTrainings=4,maxAttempts=5000,financeMode='unlimited',conditionalPromotion=true}){
 if(!Number.isSafeInteger(maxTrainings)||maxTrainings<1||maxTrainings>8||!Number.isSafeInteger(maxAttempts)||maxAttempts<1)throw Error('invalid-growth-search-bounds');
 if(!['funded','unlimited'].includes(financeMode))throw Error('invalid-finance-mode');
 const nodes=new Map(graph.nodes.map(n=>[n.id,n])),states=[...new Set(targetStates??[])];
 if(!states.length||states.some(id=>!nodes.has(id)||nodes.get(id).pendingFree))throw Error('explicit-resolved-target-states-required');
 const profiles=data.profiles.filter(p=>p.sourceType==='direct'&&(!profileIds||profileIds.includes(p.id)));
 if(profileIds?.some(id=>!profiles.some(p=>p.id===id)))throw Error('unsupported-profile-id');
 const available=new Map(),queue=[],seen=new Set(),results=[],failures=[],prefixCache=new Map();
 let cursor=0,depthBound=0;
 function add(state,profileId,trainingIds,growthSlots){
  const key=JSON.stringify([state,profileId,trainingIds,growthSlots]);
  if(seen.has(key))return;seen.add(key);
  queue.push({state,profileId,trainingIds,growthSlots});
 }
 for(const state of states){
  const n=nodes.get(state),active=ids=>Array.isArray(ids)&&ids.every(id=>n.completed.includes(id)&&!n.disabled.includes(id));
  const ts=data.transformations.filter(t=>active(t.requires));
  available.set(state,ts);
  for(const p of profiles)if(active(p.requires))for(const t of ts)if(t.allowedSoldierTypes?.includes(p.soldierType)){
   add(state,p.id,[t.id],[]);add(state,p.id,[t.id],[0]);
  }
 }
 while(cursor<queue.length&&cursor<maxAttempts){
  const job=queue[cursor++];
  let r;
  try{r=produceForwardCareer({data,snapshot,graph,graphFile,graphSha256,targetState:job.state,profileId:job.profileId,trainingIds:job.trainingIds,growthSlots:job.growthSlots,financeMode,conditionalPromotion,prefixCache});}
  catch(e){failures.push({...job,reason:String(e.message??e)});continue;}
  results.push(r);
  const length=job.trainingIds.length;
  // A successful prefix can be grown at its terminal checkpoint. On append
  // this exact growth becomes the precondition of the new transformation.
  if(!job.growthSlots.includes(length))add(job.state,job.profileId,job.trainingIds,[...job.growthSlots,length]);
  const next=available.get(job.state).filter(t=>t.allowedSoldierTypes?.includes(r.body)&&!job.trainingIds.includes(t.id));
  if(length>=maxTrainings){if(next.length)depthBound++;continue;}
  for(const t of next)add(job.state,job.profileId,[...job.trainingIds,t.id],job.growthSlots);
 }
 const routeKey=r=>JSON.stringify([r.profileId,r.body,r.trainingIds,r.growthSlots,r.after.stats]);
 const vectorKey=r=>JSON.stringify([r.profileId,r.body,r.after.stats]);
 const sequenceKey=r=>JSON.stringify([r.targetState,r.profileId,r.trainingIds]);
 const noGrowth=new Set(results.filter(r=>!r.growthSlots.length).map(sequenceKey));
 const noGrowthFailed=new Set(failures.filter(r=>!r.growthSlots.length).map(r=>JSON.stringify([r.state,r.profileId,r.trainingIds])));
 const enabled=new Set(results.filter(r=>r.growthSlots.some(s=>s<r.trainingIds.length)&&!noGrowth.has(sequenceKey(r))&&noGrowthFailed.has(sequenceKey(r))).map(sequenceKey));
 return {schema:'ATLAS_FORWARD_CAREER_GROWTH_V1',producer:'growth-aware-prefix-search-v59',sourceMetadataSha256:snapshot.sourceFingerprint,graphFile,graphSha256,financeMode,limits:{maxTrainings,maxAttempts,conditionalPromotion,targetStates:states,directProfilesOnly:true,distinctTrainingIdsOnly:true,oneCapGrowthPerCheckpoint:true,birthBand:'min'},summary:{scheduled:queue.length,attempts:cursor,successful:results.length,failed:failures.length,unprocessed:queue.length-cursor,depthBound,uniqueOrderedPlacements:new Set(results.map(routeKey)).size,uniqueEffectiveVectors:new Set(results.map(vectorKey)).size,uniqueTrainingSequences:new Set(results.map(r=>JSON.stringify([r.profileId,r.trainingIds,r.body]))).size,growthEnabledSequences:enabled.size,successfulProfiles:[...new Set(results.map(r=>r.profileId))].sort()},results,failures,growthEnabledSequenceKeys:[...enabled],gameCertified:false,globalMaximum:false,exhaustive:false};
}
