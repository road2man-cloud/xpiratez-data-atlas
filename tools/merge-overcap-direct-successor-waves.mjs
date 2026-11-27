// Merge bounded direct waves, preserving every distinct full action witness.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const life=read('public/data/soldier-overcap-expanded-lifecycle.json'),queue=read('tools/data/overcap-continuation-queue-v2.json');
const base=new Map(life.results.map(r=>[r.id,r])),jobs=new Map(queue.jobs.map(j=>[j.sourceRecordId,j]));
const inputs=process.argv.slice(2);assert(inputs.length,'supply explicit batch files');
const rows=new Map(),coverage=new Map(),batches=[];
for(const path of inputs){
 const p=read(path);assert.equal(p.schema,'ATLAS_OVERCAP_DIRECT_SUCCESSOR_WAVE_V1');assert.equal(p.sourceHash,hash(life));assert.equal(p.queueHash,hash(queue));assert.equal(p.sourceMetadataSha256,life.sourceMetadataSha256);assert.equal(p.sourceLedgerHash,life.sourceLedgerHash);
 batches.push({path,hash:hash(p),batch:p.batch,summary:p.summary});
 for(const r of p.rows){
  const s=base.get(r.sourceRecordId),j=jobs.get(r.sourceRecordId);assert(s&&j&&s.origin===r.origin&&s.body===r.body&&s.difficulty===r.difficulty);
  assert.equal(r.sourceActionHash,hash(s.actions));assert.equal(r.suffixHash,hash(r.suffix));assert.equal(r.fullActionHash,hash([...s.actions,...r.suffix]));
  assert.equal(r.id,'OVERCAP-NEXT:'+hash([s.id,r.suffix]));assert.equal(r.conditionalReplayVerified,true);assert.equal(r.finalAdmission,false);assert.equal(r.materialBudgetVerified,false);assert.equal(r.commendationStatsIncluded,false);
  assert(r.fullyActiveBranchCandidates.every(id=>j.candidates.some(c=>c.id===id)));
  if(rows.has(r.id)){assert.deepEqual(r,rows.get(r.id));continue;}rows.set(r.id,r);
 }
 for(const c of p.coverage){
  assert(base.has(c.sourceRecordId));assert.equal(c.sourceActionHash,hash(base.get(c.sourceRecordId).actions));assert(c.produced.every(id=>rows.has(id)));
  const old=coverage.get(c.sourceRecordId)||{sourceRecordId:c.sourceRecordId,sourceId:c.sourceId,origin:c.origin,body:c.body,difficulty:c.difficulty,seedReplayVerified:false,produced:[],trials:[]};
  old.seedReplayVerified||=c.seedReplayVerified;old.produced=[...new Set([...old.produced,...c.produced])].sort();
  old.trials.push({batch:path,status:c.status,firstOpen:c.firstOpen,firstBlocked:c.firstBlocked,unknownRules:c.unknownRules,openGrowth:c.openGrowth,attempted:c.attempted,error:c.error||null});
  coverage.set(c.sourceRecordId,old);
 }
}
const results=[...rows.values()].sort((a,b)=>a.id.localeCompare(b.id)),receipts=[...coverage.values()];
const ready=results.filter(r=>r.fullyActiveBranchCandidates.length);
const groups=new Map();
for(const r of results){
 // A display group only. It does not establish future-state equivalence,
 // and never discards ordered witnesses or resource differences.
 const k=hash([r.origin,r.body,r.difficulty,r.rank,r.raw,r.capRaw,r.traits,r.history,r.activeResearch,r.disabledResearch,r.fullyActiveBranchCandidates]);
 const a=groups.get(k)||[];a.push(r.id);groups.set(k,a);
}
const byBody={};for(const r of receipts){const b=byBody[r.body]??={seeds:0,productiveSeeds:0,successors:0,activeBranchSuccessors:0};b.seeds+=Number(r.seedReplayVerified);b.productiveSeeds+=Number(r.produced.length>0);}
for(const r of results){byBody[r.body].successors++;byBody[r.body].activeBranchSuccessors+=Number(r.fullyActiveBranchCandidates.length>0);}
const summary={totalOriginalSeeds:life.results.length,attemptedSeeds:receipts.length,replayedSeeds:receipts.filter(r=>r.seedReplayVerified).length,productiveSeeds:receipts.filter(r=>r.produced.length).length,unattemptedSeeds:life.results.length-receipts.length,uniqueActionWitnesses:results.length,displayEndpointGroups:groups.size,activeBranchSuccessors:ready.length,activeBranchPairs:ready.reduce((n,r)=>n+r.fullyActiveBranchCandidates.length,0),maxCapGain:Math.max(0,...results.map(r=>r.capGain)),byBody,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_DIRECT_SUCCESSOR_LEDGER_V1',sourceMetadataSha256:life.sourceMetadataSha256,sourceLedgerHash:life.sourceLedgerHash,sourceHash:hash(life),queueHash:hash(queue),scope:'Exact replayed bounded successors. Display groups are not equivalence proofs; active commitments are not terminal victory/closure certificates. No final admission.',summary,batches,coverage:receipts,displayGroups:Object.fromEntries(groups),terminalCandidates:ready.flatMap(r=>r.fullyActiveBranchCandidates.map(branch=>({id:r.id,sourceRecordId:r.sourceRecordId,origin:r.origin,body:r.body,branch,difficulty:r.difficulty,fullActionHash:r.fullActionHash,status:'ACTIVE_COMMITMENTS_NOT_TERMINAL_PROVEN'}))),rows:results};
fs.writeFileSync('public/data/soldier-overcap-direct-successors.json',JSON.stringify(report)+'\n');console.log(JSON.stringify(summary));
