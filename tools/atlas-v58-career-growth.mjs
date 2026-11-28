// Replay every subset of growth checkpoints for already successful ordered
// training routes. A checkpoint is conditional cap growth, not a native battle.
import {createHash} from 'node:crypto';
import {produceForwardCareer} from './atlas-v53-career-engine.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function produceCareerGrowth({data,snapshot,graph,graphFile,graphSha256,seed,seedSha256,maxAttempts=1000,maxSlots=8}){
 if(seed?.schema!=='ATLAS_FORWARD_CAREER_PERMUTATIONS_V1'||seed.graphSha256!==graphSha256||seed.sourceMetadataSha256!==snapshot.sourceFingerprint||!Array.isArray(seed.results))throw Error('growth-seed-source-mismatch');
 if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||!Number.isSafeInteger(maxSlots)||maxSlots<1||maxSlots>12)throw Error('invalid-growth-bounds');
 const jobs=[],seen=new Set(),excluded=[];
 for(const r of seed.results){
  if(r.schema!=='ATLAS_FORWARD_CAREER_REPLAY_V1'||r.graphSha256!==graphSha256||r.sourceMetadataSha256!==snapshot.sourceFingerprint||r.gameCertified!==false||!Array.isArray(r.trainingIds)||!r.trainingIds.length||r.financeMode!==seed.financeMode)throw Error('invalid-growth-seed-row');
  const key=JSON.stringify([r.targetState,r.profileId,r.trainingIds,r.financeMode,r.conditionalPromotion]);
  if(seen.has(key))continue;seen.add(key);
  const slots=r.trainingIds.length+1;
  if(slots>maxSlots){excluded.push({targetState:r.targetState,profileId:r.profileId,trainingIds:r.trainingIds,reason:'checkpoint-count-bound'});continue;}
  for(let mask=0;mask<2**slots;mask++){
   const growthSlots=Array.from({length:slots},(_,i)=>i).filter(i=>mask&(1<<i));
   jobs.push({r,growthSlots});
  }
 }
 const results=[],failures=[],prefixCache=new Map();
 for(const {r,growthSlots} of jobs.slice(0,maxAttempts)){
  try{
   const row=produceForwardCareer({data,snapshot,graph,graphFile,graphSha256,targetState:r.targetState,profileId:r.profileId,trainingIds:r.trainingIds,birthBand:r.birthBand,financeMode:r.financeMode,conditionalPromotion:r.conditionalPromotion===true,growthSlots,prefixCache});
   if(!growthSlots.length&&row.finalStateHash!==r.finalStateHash)throw Error('baseline-replay-mismatch');
   results.push(row);
  }catch(e){failures.push({targetState:r.targetState,profileId:r.profileId,trainingIds:r.trainingIds,growthSlots,reason:String(e.message??e)});}
 }
 const keys=new Set(results.map(r=>JSON.stringify([r.profileId,r.body,r.trainingIds,r.growthSlots,r.after.stats])));
 const vectors=new Set(results.map(r=>JSON.stringify([r.profileId,r.body,r.after.stats])));
 return {schema:'ATLAS_FORWARD_CAREER_GROWTH_V1',sourceMetadataSha256:snapshot.sourceFingerprint,graphFile,graphSha256,seedSha256,financeMode:seed.financeMode,limits:{maxAttempts,maxSlots,successfulSeedSequencesOnly:true,oneCapGrowthPerCheckpoint:true},summary:{seedRoutes:seen.size,scheduled:jobs.length,attempts:results.length+failures.length,successful:results.length,failed:failures.length,unprocessed:Math.max(0,jobs.length-maxAttempts),excluded:excluded.length,uniqueOrderedPlacements:keys.size,uniqueEffectiveVectors:vectors.size},results,failures,excluded,gameCertified:false,globalMaximum:false,exhaustive:false};
}
