// Diagnostic only: can a registered highest-ceiling route omit a transform
// while retaining all source research, materials, and chronological evidence?
// Never publish a shortened witness without a separate full replay and hash.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {originRankingCandidates,sharedTerminalCandidates} from '../public/soldiers/modern/shared-terminal-targets.js';
import {projectCandidateGrowthLimit} from '../public/soldiers/modern/score-growth-12.js';
import {replayOriginWitness} from '../public/soldiers/modern/origin-witness.js';
import {sameRouteStatVector,preferredOriginCandidate} from '../public/soldiers/modern/origin-route-tiebreak.js';
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json','utf8'));
data.sourceItemIds=new Set(catalog.itemIds);
data.originRows=report.records.map(r=>r.sourceProof);
const compatible=c=>c.campaignContext?.kind==='compatible';
let attempted=0,possible=0,replayed=0,valid=0;
const findings=[];
function audit(record,candidates,target){
  if(!candidates.length)return;
  const scored=candidates.map(c=>({...c,growth:projectCandidateGrowthLimit(record,c,data)}));
  const score=c=>c.growth.kind==='conditional-upper-envelope'?c.growth.total:-1;
  const best=scored.reduce((a,b)=>preferredOriginCandidate(a,b,score),null);
  const checkpoints=process.argv.includes('--all')
    ? scored.filter(c=>score(c)===score(best))
    : [best];
  const cache=new Map();
  for(const candidate of checkpoints){
    for(let at=0;at<candidate.steps.length;at++){
      if(candidate.steps[at].type!=='transform')continue;
      attempted++;
      const trialSteps=candidate.steps.filter((_,i)=>i!==at);
      const transforms=trialSteps.filter(s=>s.type==='transform').map(s=>s.transform);
      const proposal={...candidate,steps:trialSteps,transforms};
      const projection=projectCandidateGrowthLimit(record,proposal,data);
      if(projection.kind!=='conditional-upper-envelope'||projection.finalSoldierType!==candidate.finalSoldierType)
        continue;
      proposal.growth=projection;
      if(!sameRouteStatVector(proposal,candidate))continue;
      possible++;
      const witness=replayOriginWitness(trialSteps,data,{birthCache:cache,requireCompatibleContext:true});
      replayed++;
      if(!witness.ok||!witness.exact||witness.campaignCompatible!==true)continue;
      valid++;
      findings.push({id:record.profileId,target,sourceCandidate:candidate.id,
        removed: candidate.steps[at].transform,removedStepIndex:at,
        priorTransforms:candidate.transforms,proposedTransforms:transforms,
        originalGrowth:candidate.growth.total,newWitnessUngrownTotal:witness.total});
    }
  }
}
for(const record of report.records){
  audit(record,originRankingCandidates(record,compatible),'origin');
  if(process.argv.includes('--special'))
    audit(record,sharedTerminalCandidates(record,compatible),'chort');
}
const output={kind:'soldier-route-pruning-proof-v1',sourceVersion:report.sourceVersion,
  sourceHash:report.sourceHash,scope:'registered top-score candidates; delete one transform only; original research steps retained',
  stats:{attempted,possible,replayed,valid},findings};
if(process.argv.includes('--check')){
  const published=JSON.parse(fs.readFileSync('public/data/soldier-route-pruning-audit.json','utf8'));
  assert.deepEqual(published,output,'Published pruning audit no longer matches original chronological replay');
  console.log('PASS audited route-pruning witness: '+valid+' replays / '+attempted+' potential removals; no canonical candidates changed');
}else if(process.argv.includes('--summary'))console.log(JSON.stringify({sourceHash:output.sourceHash,stats:output.stats,origins:[...new Set(findings.map(x=>x.id))]},null,2));
else console.log(JSON.stringify(output,null,2));
