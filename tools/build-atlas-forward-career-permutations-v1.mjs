// Bounded same-campaign ordered career production. No synthetic research or resources.
import {produceForwardCareer} from './build-atlas-forward-career-replay-v1.mjs';

export function produceCareerPermutations({data,snapshot,graph,graphFile,graphSha256,profileIds,targetStates,maxTrainings=4,maxAttempts=1000,financeMode='unlimited',replay=produceForwardCareer}){
 if(!Number.isSafeInteger(maxTrainings)||maxTrainings<1||maxTrainings>83||!Number.isSafeInteger(maxAttempts)||maxAttempts<1)throw Error('invalid-career-search-bounds');
 if(!['unlimited','funded'].includes(financeMode))throw Error('invalid-finance-mode');
 if(!Array.isArray(graph.nodes)||!Array.isArray(data.profiles)||!Array.isArray(data.transformations))throw Error('invalid-input');
 const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
 const profiles=data.profiles.filter(p=>p.sourceType==='direct'&&(!profileIds||profileIds.includes(p.id)));
 const states=targetStates??graph.nodes.map(n=>n.id);
 if(states.some(id=>!nodes.has(id)))throw Error('unknown-target-state');
 if(profileIds&&profileIds.some(id=>!profiles.some(p=>p.id===id)))throw Error('unsupported-profile-id');
 const active=(n,ids)=>ids.every(k=>n.completed.includes(k)&&!n.disabled.includes(k));
 const queue=[],seen=new Set(),results=[],failures=[];
 let cursor=0,attempts=0,depthBound=0;
 // Start with all legal research intersections; never union different nodes.
 const add=(state,profileId,sequence)=>{
  const key=JSON.stringify([state,profileId,sequence]);
  if(seen.has(key))return;seen.add(key);
  queue.push({state,profileId,sequence});
 };
 const available=new Map();
 for(const state of new Set(states)){
  const n=nodes.get(state);
  const ts=data.transformations.filter(t=>Array.isArray(t.requires)&&active(n,t.requires));
  available.set(state,ts);
  for(const p of profiles){
   if(!Array.isArray(p.requires)||!active(n,p.requires))continue;
   for(const t of ts)if(t.allowedSoldierTypes?.includes(p.soldierType))add(state,p.id,[t.id]);
  }
 }
 while(cursor<queue.length&&attempts<maxAttempts){
  const job=queue[cursor++];attempts++;
  let result;
  try{
   result=replay({data,snapshot,graph,graphFile,graphSha256,targetState:job.state,profileId:job.profileId,trainingIds:job.sequence,financeMode});
  }catch(e){failures.push({...job,reason:String(e.message??e)});continue;}
  results.push(result);
  // Never deduplicate by unordered training set or score.
  // A successful complete sequence is the only prefix we expand.
  const next=available.get(job.state).filter(t=>t.allowedSoldierTypes?.includes(result.body)&&!job.sequence.includes(t.id));
  if(job.sequence.length>=maxTrainings){if(next.length)depthBound++;continue;}
  for(const t of next)add(job.state,job.profileId,[...job.sequence,t.id]);
 }
 return {schema:'ATLAS_FORWARD_CAREER_PERMUTATIONS_V1',sourceMetadataSha256:snapshot.sourceFingerprint,graphFile,graphSha256,financeMode,limits:{maxTrainings,maxAttempts,distinctTrainingIdsOnly:true,directProfilesOnly:true,birthBand:'min',profileResearchRequiredAtTarget:true},summary:{attempts,successful:results.length,failed:failures.length,unprocessed:queue.length-cursor,depthBound},results,failures,gameCertified:false,globalMaximum:false,exhaustive:false};
}
