// Revalidate each published one-training omission after deleting only directly
// attributable research and external-input assumptions. Diagnostic evidence:
// this is NOT a globally minimum campaign or an OXCE execution certificate.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {sameRouteStatVector} from '../public/soldiers/modern/origin-route-tiebreak.js';
import {replayOriginWitness} from '../public/soldiers/modern/origin-witness.js';

const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const data=read('public/data/soldiers-modern-index.json');
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const catalog=read('public/data/soldier-source-catalog.json');
const prior=read('public/data/soldier-route-pruning-audit.json');
data.sourceItemIds=new Set(catalog.itemIds);
data.originRows=report.records.map(r=>r.sourceProof);
assert.equal(prior.kind,'soldier-route-pruning-proof-v1');
assert.equal(prior.sourceHash,report.sourceHash);
assert.equal(prior.stats.valid,prior.findings.length);
const byRecord=new Map(report.records.map(r=>[r.profileId,r]));
const birthCache=new Map();
const counters={replayAttempts:0,attemptedGroups:0,acceptedGroups:0};
const statuses={research:0,assumptions:0,additional:0};
const findings=[];

function stepResearchId(step){
  if(['research','repeatResearch'].includes(step.type))return step.id;
  if(['eventResearch','missionResearch','freeResearch'].includes(step.type))return step.research;
  return null;
}
function relatedInput(steps,index,target){
  const previous=steps[index-1];
  if(previous?.type!=='externalInputs'||!previous.reason||!previous.reason.includes(target))
    return [];
  return [index-1];
}
function linkedFreeSteps(steps,index,id){
  const linked=[];
  for(let i=index+1;i<steps.length&&steps[i].type==='freeResearch';i++){
    if(steps[i].source!==id)break;
    linked.push(i);
  }
  return linked;
}
function researchGroup(steps,index,id){
  const step=steps[index];
  if(stepResearchId(step)!==id)return [];
  return [...relatedInput(steps,index,id),index,...linkedFreeSteps(steps,index,id)];
}
function stepInfo(step,index){
  if(step.type==='externalInputs')return {stepIndex:index,type:step.type,items:step.items||{},
    funds:step.funds||0,functions:step.functions||[],reason:step.reason};
  return {stepIndex:index,type:step.type,id:stepResearchId(step)||null};
}
function optionalAncestors(id,steps,at){
  const parents=new Map();
  for(const [source,rule] of Object.entries(data.researchRules)){
    for(const child of [...(rule.unlocks||[]),...(rule.getOneFree||[]),...(rule.lookup?[rule.lookup]:[])]) {
      if(!parents.has(child))parents.set(child,new Set());
      parents.get(child).add(source);
    }
    for(const [guard,choices] of Object.entries(rule.getOneFreeProtected||{}))
      for(const child of choices){
        if(!parents.has(child))parents.set(child,new Set());
        parents.get(child).add(source);
        parents.get(child).add(guard);
      }
  }
  const ids=new Set([id]),frontier=[id];
  for(let depth=0;depth<3;depth++){
    const next=[];
    for(const curr of frontier)for(const parent of parents.get(curr)||[]){
      if(!ids.has(parent)){ids.add(parent);next.push(parent);}
    }
    frontier.splice(0,frontier.length,...next);
  }
  ids.delete(id);
  return steps.map((step,index)=>({step,index})).filter(({step,index})=>
    index<at && ids.has(stepResearchId(step))).sort((a,b)=>b.index-a.index);
}
for(const claim of prior.findings){
  const record=byRecord.get(claim.id);
  const original=record?.candidates.find(c=>c.id===claim.sourceCandidate);
  const trainingAt=claim.removedStepIndex;
  assert(original && original.steps[trainingAt]?.type==='transform');
  assert.equal(original.steps[trainingAt].transform,claim.removed);
  const sourceGrowth=projectCandidateGrowthLimit(record,original,data);
  assert.equal(sourceGrowth.kind,'conditional-upper-envelope');
  assert.equal(sourceGrowth.total,claim.originalGrowth);
  const originalScored={...original,growth:sourceGrowth};
  const canonicalSteps=original.steps;
  const removed=new Set([trainingAt]);
  const createProposal=indexes=>{
    const steps=canonicalSteps.filter((_,i)=>!indexes.has(i));
    const transforms=steps.filter(s=>s.type==='transform').map(s=>s.transform);
    const candidate={...original,steps,transforms};
    const growth=projectCandidateGrowthLimit(record,candidate,data);
    return {...candidate,growth};
  };
  const base=createProposal(removed);
  assert.equal(base.growth.kind,'conditional-upper-envelope');
  assert.equal(base.growth.finalSoldierType,original.finalSoldierType);
  assert(sameRouteStatVector(base,originalScored));
  function verify(indexes,reference){
    const proposal=createProposal(indexes);
    if(proposal.growth.kind!=='conditional-upper-envelope'||
       proposal.growth.finalSoldierType!==base.growth.finalSoldierType||
       !sameRouteStatVector(proposal,base))return null;
    counters.replayAttempts++;
    const result=replayOriginWitness(proposal.steps,data,{birthCache,requireCompatibleContext:true});
    if(!result.ok||!result.exact||result.campaignCompatible!==true)return null;
    if(reference && (JSON.stringify(result.stats)!==JSON.stringify(reference.stats)||
       JSON.stringify(result.raw)!==JSON.stringify(reference.raw)||
       JSON.stringify(result.bonus)!==JSON.stringify(reference.bonus)))return null;
    return {result,proposal};
  }
  const baseline=verify(removed,null);
  assert(baseline,'Prior accepted one-transform proof can no longer replay: '+claim.sourceCandidate);
  const attempt=group=>{
    const extra=group.filter(i=>i>=0&&!removed.has(i));
    if(!extra.length)return false;
    counters.attemptedGroups++;
    const indexes=new Set([...removed,...extra]);
    const tested=verify(indexes,baseline.result);
    if(!tested)return false;
    counters.acceptedGroups++;
    for(const i of extra)removed.add(i);
    return true;
  };
  const matching=canonicalSteps.map((step,index)=>({step,index})).filter(({step,index})=>
    index<trainingAt&&stepResearchId(step)===claim.removed).map(x=>x.index);
  const researchGroups=matching.map(i=>researchGroup(canonicalSteps,i,claim.removed))
    .filter(g=>g.length);
  const directInput=relatedInput(canonicalSteps,trainingAt,claim.removed);
  // A single replay can verify both the research and the material/funds
  // hypothesis. If linked free awards matter, keep them and try smaller groups.
  const combined=[...new Set([...directInput,...researchGroups.flat()])];
  if(!attempt(combined)){
    for(const group of researchGroups)attempt(group);
    attempt(directInput);
  }
  // Only trace literal research unlock/free/lookup ancestry, never arbitrary
  // nearby or unrelated research. A survivor may be shared by other actions.
  let ancestorAttempts=0;
  for(const {step,index} of optionalAncestors(claim.removed,canonicalSteps,trainingAt)){
    if(ancestorAttempts>=4)break;
    if(removed.has(index))continue;
    const group=researchGroup(canonicalSteps,index,stepResearchId(step));
    if(!group.length)continue;
    ancestorAttempts++;
    attempt(group);
  }
  const confirmed=verify(removed,baseline.result);
  assert(confirmed);
  const dropped=[...removed].filter(i=>i!==trainingAt).sort((a,b)=>a-b);
  const removedResearch=dropped.filter(i=>stepResearchId(canonicalSteps[i]))
    .map(i=>stepInfo(canonicalSteps[i],i));
  const removedInputs=dropped.filter(i=>canonicalSteps[i].type==='externalInputs')
    .map(i=>stepInfo(canonicalSteps[i],i));
  if(removedResearch.length)statuses.research++;
  if(removedInputs.length)statuses.assumptions++;
  if(dropped.length)statuses.additional++;
  findings.push({
    id:claim.id,target:claim.target,sourceCandidate:claim.sourceCandidate,
    removed:claim.removed,removedStepIndex:trainingAt,removedIndices:[...removed].sort((a,b)=>a-b),
    removedResearch,removedInputs,removedOther:dropped.filter(i=>
      !stepResearchId(canonicalSteps[i])&&canonicalSteps[i].type!=='externalInputs')
      .map(i=>stepInfo(canonicalSteps[i],i)),
    originalStepsHash:digest(original.steps),reducedStepsHash:digest(confirmed.proposal.steps),
    remainingResearchSteps:confirmed.proposal.steps.filter(s=>stepResearchId(s)).length,
    remainingTransforms:confirmed.proposal.transforms.length,
    conditionalCeiling:confirmed.proposal.growth.total,
    replayUngrownTotal:confirmed.result.total,certifiedMaximum:false
  });
}
const output={
  kind:'soldier-route-dependency-pruning-v1',
  sourceVersion:report.sourceVersion,sourceHash:report.sourceHash,
  priorAuditHash:digest(prior),
  scope:'published one-training omissions; directly linked research, input assumptions and bounded research ancestry only; full chronological replay; no global cost or maximum certification',
  stats:{claims:prior.findings.length,...counters,
    withResearchRemoved:statuses.research,
    withInputAssumptionsRemoved:statuses.assumptions,
    withAdditionalStepsRemoved:statuses.additional},
  findings
};
if(process.argv.includes('--check')){
  assert.deepEqual(read('public/data/soldier-route-dependency-audit.json'),output);
  console.log('PASS route dependency audit: '+output.stats.withResearchRemoved+' research-pruned cases, '+
    output.stats.withInputAssumptionsRemoved+' input-pruned cases / '+output.stats.claims+
    ' original training proofs; each proposal fully replayed');
}else if(process.argv.includes('--summary')){
  console.log(JSON.stringify({sourceHash:output.sourceHash,stats:output.stats,
    sample:output.findings.slice(0,8).map(x=>({
      origin:x.id,removed:x.removed,research:x.removedResearch.map(v=>v.id),
      inputCount:x.removedInputs.length}))},null,2));
}else{
  console.log(JSON.stringify(output,null,2));
}
