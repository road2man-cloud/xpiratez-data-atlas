// Incremental campaign repair ledger. Source batches remain the authoritative
// ordered-action witnesses. This index deduplicates routes without upgrading
// conditional growth, resource or branch evidence to native/terminal proof.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function buildCampaignRepairLedger(inputs){
 const need=(ok,msg)=>{if(!ok)throw Error(msg)};
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const identityFields=['sourceCommit','sourceMetadataSha256','prefixInputHash','queueInputHash'];
 need(Array.isArray(inputs)&&inputs.length>0,'no-batches');
 const identity=Object.fromEntries(identityFields.map(k=>[k,inputs[0].batch[k]]));
 need(identityFields.every(k=>typeof identity[k]==='string'&&identity[k].length>0),'missing-source-identity');
 const jobs=new Map(),routes=new Map(),manifest=[],seenPaths=new Set();
 let attempts=0,successfulAttempts=0;
 for(const {path,blobSha,batch:b} of inputs){
  need(typeof path==='string'&&!seenPaths.has(path),'duplicate-input:'+path);seenPaths.add(path);
  need(b.schema==='ATLAS_CAMPAIGN_SUFFIX_REPAIR_V1'&&identityFields.every(k=>b[k]===identity[k]),'mixed-batch-source:'+path);
  need(Array.isArray(b.records)&&b.summary?.processed===b.records.length,'batch-record-count:'+path);
  need(b.summary.normalizedTerminal===0&&b.summary.gameCertified===0,'unexpected-certification:'+path);
  const good=b.records.filter(r=>r.status==='conditional-career-replayed').length;
  need(good===b.summary.completed&&b.records.length-good===b.summary.failed,'batch-summary-count:'+path);
  manifest.push({path,blobSha,selection:b.selection,processed:b.records.length,completed:good,startRegion:b.startRegion??null});
  for(const [recordIndex,r] of b.records.entries()){
   attempts++;
   need(typeof r.legacyId==='string'&&typeof r.legacyActionHash==='string'&&typeof r.source==='string','missing-legacy-identity:'+path+':'+recordIndex);
   need(r.gameCertified===false&&r.terminalCertified===false,'unexpected-route-certification:'+r.legacyId);
   const scenario={difficulty:r.difficulty??null,startRegion:r.startRegion??b.startRegion??null,startCountry:r.startCountry??b.startCountry??null};
   const key=JSON.stringify([r.source,r.legacyId,r.legacyActionHash,scenario.difficulty,scenario.startRegion,scenario.startCountry]);
   const pointer={path,recordIndex};
   if(!jobs.has(key))jobs.set(key,{source:r.source,legacyId:r.legacyId,legacyActionHash:r.legacyActionHash,legacyBody:r.legacyBody??null,legacyBranch:r.legacyBranch??null,priority:r.priority??null,scenario,routeIds:[],failures:[],attempts:[]});
   const j=jobs.get(key);j.attempts.push(pointer);
   if(r.status!=='conditional-career-replayed'){
    j.failures.push({...pointer,failedAt:r.failedAt??null,reason:r.reason??'unknown'});
    continue;
   }
   successfulAttempts++;
   need(typeof r.routeId==='string'&&typeof r.stateHash==='string'&&typeof r.producedActionHash==='string'&&r.state&&Array.isArray(r.producedActions)&&r.producedActions.length>0,'missing-route-evidence:'+r.legacyId);
   need(!r.producedActions.some(a=>a.type==='externalInputs'||a.type==='campaignContext'),'external-state-in-success:'+r.legacyId);
   need(Number.isInteger(scenario.difficulty)&&scenario.difficulty>=0&&scenario.difficulty<=4,'invalid-success-difficulty:'+r.legacyId);
   const s=r.state;
   need(typeof s.body==='string'&&typeof s.originProfile==='string'&&s.raw&&s.stats,'missing-soldier-vector:'+r.legacyId);
   need(typeof r.researchPathId==='string'&&typeof r.traitId==='string'&&typeof r.pairId==='string','missing-pair-evidence:'+r.legacyId);
   const vector={raw:s.raw,bonus:s.bonus,stats:s.stats,permanentBonus:s.permanentBonus??null,permanentStats:s.permanentStats??null,commendations:s.commendations??null,traitCounts:s.traitCounts,rank:s.rank,exactStats:s.exactStats,retired:s.retired};
   const row={routeId:r.routeId,stateHash:r.stateHash,producedActionHash:r.producedActionHash,scenario,body:s.body,originProfile:s.originProfile,researchPathId:r.researchPathId,traitId:r.traitId,pairId:r.pairId,actionCount:r.producedActions.length,growthCount:r.producedActions.filter(a=>a.type==='conditionalCapGrowth').length,transformCount:r.producedActions.filter(a=>a.type==='transform').length,vector,preferredWitness:pointer,witnesses:[pointer],jobKeys:[key],gameCertified:false,terminalCertified:false};
   const prev=routes.get(r.routeId);
   if(prev){
    need(['stateHash','producedActionHash','scenario','body','originProfile','researchPathId','traitId','pairId','actionCount'].every(k=>eq(prev[k],row[k])),'route-identity-collision:'+r.routeId);
    if(prev.vector.permanentStats&&row.vector.permanentStats)need(eq(prev.vector,row.vector),'conflicting-rich-vector:'+r.routeId);
    prev.witnesses.push(pointer);if(!prev.jobKeys.includes(key))prev.jobKeys.push(key);
    if(!prev.vector.permanentStats&&row.vector.permanentStats){prev.vector=row.vector;prev.preferredWitness=pointer;}
   }else routes.set(r.routeId,row);
   if(!j.routeIds.includes(r.routeId))j.routeIds.push(r.routeId);
  }
 }
 const jobRows=[...jobs.entries()].map(([key,j])=>({key,...j,status:j.routeIds.length?'conditional-career-replayed':'suffix-repair-pending'}));
 const routeRows=[...routes.values()].sort((a,b)=>a.routeId.localeCompare(b.routeId,'en'));
 const byBody={};for(const r of routeRows){const x=byBody[r.body]??={routes:0,growthRoutes:0,transformRoutes:0};x.routes++;if(r.growthCount)x.growthRoutes++;if(r.transformCount)x.transformRoutes++;}
 const pending=jobRows.filter(j=>!j.routeIds.length);
 const blockers={};for(const j of pending){const reason=j.failures.at(-1)?.reason??'unknown';blockers[reason]=(blockers[reason]||0)+1;}
 const pairs=new Map();for(const r of routeRows){if(!pairs.has(r.pairId))pairs.set(r.pairId,{pairId:r.pairId,researchPathId:r.researchPathId,traitId:r.traitId,routeIds:[]});const p=pairs.get(r.pairId);need(p.researchPathId===r.researchPathId&&p.traitId===r.traitId,'pair-identity-collision');p.routeIds.push(r.routeId);}
 return {schema:'ATLAS_CAMPAIGN_REPAIR_LEDGER_V1',...identity,scope:'CONDITIONAL_REPAIR_PROGRESS_ONLY; NO_CANONICAL_BRANCH_OR_TERMINAL_ADMISSION',inputs:manifest,
  summary:{rawAttempts:attempts,successfulAttempts,attemptedScenarioJobs:jobRows.length,completedScenarioJobs:jobRows.length-pending.length,pendingScenarioJobs:pending.length,distinctRoutes:routeRows.length,conditionalPairHashes:pairs.size,growthRoutes:routeRows.filter(r=>r.growthCount).length,transformRoutes:routeRows.filter(r=>r.transformCount).length,terminalCertified:0,gameCertified:0,byBody,blockers},
  jobs:jobRows,routes:routeRows,pairs:[...pairs.values()].sort((a,b)=>a.pairId.localeCompare(b.pairId,'en'))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),output=args.find(x=>x.startsWith('--out='))?.slice(6);
 const files=args.filter(x=>!x.startsWith('--'));
 if(!output||!files.length||files.some(x=>path.resolve(x)===path.resolve(output)))throw Error('usage: node tools/build-atlas-campaign-repair-ledger-v1.mjs --out=ledger.json batch1.json batch2.json ...');
 const inputs=files.map(file=>{const bytes=fs.readFileSync(file),blobSha=createHash('sha1').update('blob '+bytes.length+'\\0'.replace('\\0','\0')).update(bytes).digest('hex');return {path:file.replaceAll('\\\\','/'),blobSha,batch:JSON.parse(bytes)};});
 const result=buildCampaignRepairLedger(inputs);
 fs.writeFileSync(output+'.tmp',JSON.stringify(result));fs.renameSync(output+'.tmp',output);
 console.log(JSON.stringify(result.summary));
}
