// Registered conditional training paths: can a SECOND training be omitted after
// a published one-step research/resource-pruned witness? No global optimization claim.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {sameRouteStatVector} from '../public/soldiers/modern/origin-route-tiebreak.js';
import {replayOriginWitness} from '../public/soldiers/modern/origin-witness.js';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const data=read('public/data/soldiers-modern-index.json');
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const prior=read('public/data/soldier-route-dependency-audit.json');
const catalog=read('public/data/soldier-source-catalog.json');
data.sourceItemIds=new Set(catalog.itemIds);
data.originRows=report.records.map(r=>r.sourceProof);
assert.equal(prior.kind,'soldier-route-dependency-pruning-v1');
assert.equal(prior.sourceHash,report.sourceHash);
const records=new Map(report.records.map(r=>[r.profileId,r]));
const birthCache=new Map();
const stats={priorClaims:prior.findings.length,transformPairsConsidered:0,
  sameGrowthPairs:0,fullReplays:0,secondTransformValidated:0,
  withNewResearchRemoved:0,withNewInputRemoved:0};
const findings=[];
function researchId(step){
  if(['research','repeatResearch'].includes(step?.type))return step.id;
  if(['eventResearch','freeResearch','missionResearch'].includes(step?.type))return step.research;
  return null;
}
function candidate(source,record,removed){
  const steps=source.steps.filter((_,i)=>!removed.has(i));
  const transforms=steps.filter(s=>s.type==='transform').map(s=>s.transform);
  const out={...source,steps,transforms};
  out.growth=projectCandidateGrowthLimit(record,out,data);
  return out;
}
function replay(steps){
  stats.fullReplays++;
  const result=replayOriginWitness(steps,data,{birthCache,requireCompatibleContext:true});
  return result.ok&&result.exact&&result.campaignCompatible===true?result:null;
}
function sameWitness(first,second){
  return !!(first&&second&&JSON.stringify(first.stats)===JSON.stringify(second.stats)&&
    JSON.stringify(first.raw)===JSON.stringify(second.raw)&&
    JSON.stringify(first.bonus)===JSON.stringify(second.bonus));
}
function inputsBefore(steps,at,id){
  const step=steps[at-1];
  return step?.type==='externalInputs'&&step.reason?.includes(id)?[at-1]:[];
}
function researchGroup(steps,at,id){
  const group=[...inputsBefore(steps,at,id),at];
  for(let i=at+1;i<steps.length&&steps[i].type==='freeResearch'&&
    steps[i].source===id;i++)group.push(i);
  return group;
}
function stepDescription(step,index){
  return {index,type:step.type,researchId:researchId(step),
    ...(step.type==='externalInputs'?{items:step.items||{},functions:step.functions||[],
      funds:step.funds||0,reason:step.reason}:{} )};
}
for(const proof of prior.findings){
  const record=records.get(proof.id);
  const source=record?.candidates.find(c=>c.id===proof.sourceCandidate);
  assert(source,proof.id+': source candidate missing');
  const baseRemoved=new Set(proof.removedIndices);
  const base=candidate(source,record,baseRemoved);
  assert.equal(base.growth.kind,'conditional-upper-envelope');
  assert.equal(base.growth.total,proof.conditionalCeiling);
  const reference=replay(base.steps);
  assert(reference,'Previously published pruned witness no longer replays: '+source.id);
  function attempt(indices){
    const proposed=candidate(source,record,indices);
    if(proposed.growth.kind!=='conditional-upper-envelope'||
      proposed.growth.finalSoldierType!==base.growth.finalSoldierType||
      !sameRouteStatVector(base,proposed))return null;
    const outcome=replay(proposed.steps);
    return sameWitness(reference,outcome)?{proposed,outcome}:null;
  }
  for(let at=0;at<source.steps.length;at++){
    const step=source.steps[at];
    if(step.type!=='transform'||baseRemoved.has(at))continue;
    stats.transformPairsConsidered++;
    const removed=new Set([...baseRemoved,at]);
    const projected=candidate(source,record,removed);
    if(projected.growth.kind!=='conditional-upper-envelope'||
      projected.growth.finalSoldierType!==base.growth.finalSoldierType||
      !sameRouteStatVector(projected,base))continue;
    stats.sameGrowthPairs++;
    if(!attempt(removed))continue;
    stats.secondTransformValidated++;
    const accept=extra=>{
      const additions=extra.filter(i=>!removed.has(i));
      if(!additions.length)return false;
      if(!attempt(new Set([...removed,...additions])))return false;
      for(const i of additions)removed.add(i);
      return true;
    };
    accept(inputsBefore(source.steps,at,step.transform));
    // Drop this training's explicit research (and its free-research outcome)
    // only if that complete group is dispensable under the original rules.
    for(let i=0;i<at;i++){
      if(removed.has(i)||researchId(source.steps[i])!==step.transform)continue;
      accept(researchGroup(source.steps,i,step.transform));
    }
    const reduced=attempt(removed);
    assert(reduced,'Accepted second-training omission no longer replays');
    const extraRemoved=[...removed].filter(i=>!baseRemoved.has(i)).sort((a,b)=>a-b);
    const newResearch=extraRemoved.filter(i=>researchId(source.steps[i]))
      .map(i=>stepDescription(source.steps[i],i));
    const newInputs=extraRemoved.filter(i=>source.steps[i].type==='externalInputs')
      .map(i=>stepDescription(source.steps[i],i));
    if(newResearch.length)stats.withNewResearchRemoved++;
    if(newInputs.length)stats.withNewInputRemoved++;
    findings.push({
      profileId:proof.id,target:proof.target,sourceCandidate:source.id,
      firstTransform:proof.removed,firstTransformIndex:proof.removedStepIndex,
      secondTransform:step.transform,secondTransformIndex:at,
      removedIndices:[...removed].sort((a,b)=>a-b),
      newRemovedIndices:extraRemoved,newResearch,newInputs,
      originalStepsHash:digest(source.steps),reducedStepsHash:digest(reduced.proposed.steps),
      remainingTransforms:reduced.proposed.transforms,
      conditionalCeiling:reduced.proposed.growth.total,
      replayUngrownTotal:reduced.outcome.total,
      certifiedMaximum:false
    });
  }
}
// Verify whether a third independent training can also be omitted from a
// verified two-training route. This is a bounded neighborhood, not a proof
// that every pair or simultaneous removal order has been explored.
const third=[];
stats.thirdTransformPairsConsidered=0;
stats.thirdTransformValidated=0;
for(const proof of findings){
  const record=records.get(proof.profileId);
  const source=record.candidates.find(c=>c.id===proof.sourceCandidate);
  const removed=new Set(proof.removedIndices);
  const baseline=candidate(source,record,removed);
  const witness=replay(baseline.steps);
  assert(witness,'Two-transform proof no longer replays');
  for(let at=0;at<source.steps.length;at++){
    if(source.steps[at].type!=='transform'||removed.has(at))continue;
    stats.thirdTransformPairsConsidered++;
    const further=candidate(source,record,new Set([...removed,at]));
    if(further.growth.kind!=='conditional-upper-envelope'||
      further.growth.finalSoldierType!==baseline.growth.finalSoldierType||
      !sameRouteStatVector(further,baseline))continue;
    const r=replay(further.steps);
    if(!sameWitness(r,witness))continue;
    stats.thirdTransformValidated++;
    third.push({profileId:proof.profileId,sourceCandidate:proof.sourceCandidate,
      priorRemoved:proof.removedIndices,thirdTransform:source.steps[at].transform,thirdTransformIndex:at});
  }
}
const output={kind:'soldier-route-iterative-pruning-v1',sourceVersion:report.sourceVersion,
  sourceHash:report.sourceHash,priorAuditHash:digest(prior),
  scope:'one additional independent transform omitted after each published one-transform-and-dependencies witness; same final body, exact ungrown 12 stats and conditional growth 12-vector; chronological replay; no exhaustive global minimum',
  stats,findings,third};
if(process.argv.includes('--check')){
  assert.deepEqual(read('public/data/soldier-route-iterative-audit.json'),output);
  console.log('PASS iterative training audit: '+stats.secondTransformValidated+' two-transform omissions / '+
    stats.transformPairsConsidered+' proposals; '+stats.fullReplays+' chronological replays');
}else if(process.argv.includes('--summary')){
  console.log(JSON.stringify({stats,findings:findings.map(x=>({
    id:x.profileId,from:x.sourceCandidate,
    removed:[x.firstTransform,x.secondTransform],
    otherResearch:x.newResearch.map(s=>s.researchId),inputs:x.newInputs.length
  }))},null,2));
}else console.log(JSON.stringify(output,null,2));
