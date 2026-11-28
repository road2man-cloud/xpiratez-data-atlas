// Merge exact terminal-goal-retaining training waves without promoting open states.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mergeTrainingReceipts} from './overcap-training-resume-core.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const terminal=read('public/data/soldier-overcap-terminal-continuations.json'),life=read('public/data/soldier-overcap-expanded-lifecycle.json'),next=read('public/data/soldier-overcap-direct-successors.json'),source=read('tools/data/overcap-terminal-source-v1.json');
assert.equal(terminal.sourceHash,hash(next));assert.equal(terminal.baseSourceHash,hash(life));assert.equal(terminal.terminalSourceHash,hash(source));
const jobs=new Map(terminal.rows.filter(r=>r.status==='CONDITIONAL_TERMINAL_RESEARCH_READY').map(r=>[r.id,r])),parents=new Map(life.results.map(r=>[r.id,r])),children=new Map(next.rows.map(r=>[r.id,r])),branches=new Map(source.branches.map(b=>[b.id,b])),targets=new Map(source.terminalRule.targets.map(t=>[t.id,t]));
const rows=new Map(),coverage=new Map(),batches=[],seenBatches=new Set();
for(const path of process.argv.slice(2)){
 const p=read(path);assert.equal(p.schema,'ATLAS_OVERCAP_TERMINAL_TRAINING_WAVE_V1');assert.equal(p.sourceHash,hash(terminal));assert.equal(p.terminalSourceHash,hash(source));assert.equal(p.sourceMetadataSha256,terminal.sourceMetadataSha256);assert.equal(p.sourceLedgerHash,terminal.sourceLedgerHash);
 const batchHash=hash(p);if(seenBatches.has(batchHash))continue;seenBatches.add(batchHash);
 batches.push({path,hash:batchHash,batch:p.batch,summary:p.summary});
 for(const r of p.rows){
  const j=jobs.get(r.sourceTerminalId),child=children.get(r.sourceRecordId),parent=parents.get(r.parentRecordId),b=branches.get(r.branch),t=targets.get(r.target);
  assert(j&&child&&parent&&b&&t&&j.sourceRecordId===child.id&&j.parentRecordId===parent.id&&j.branch===r.branch&&j.target===r.target&&j.difficulty===r.difficulty);
  assert.equal(r.sourceActionHash,j.fullActionHash);assert.equal(r.suffixHash,hash(r.suffix));assert.equal(r.fullActionHash,hash([...parent.actions,...child.suffix,...j.suffix,...r.suffix]));
  assert.equal(r.id,'OVERCAP-END-NEXT:'+hash([j.id,r.suffix]));assert.equal(r.conditionalReplayVerified,true);assert.equal(r.finalAdmission,false);assert.equal(r.materialBudgetVerified,false);assert.equal(r.commendationStatsIncluded,false);assert.equal(r.material.ok,true);
  assert(t.researchGoals.every(k=>r.activeResearch.includes(k)));assert(!(t.inactiveResearch||[]).some(k=>r.activeResearch.includes(k)));assert([...b.captain,...Object.values(b.choices||{})].filter(Boolean).every(k=>r.activeResearch.includes(k)));
  assert.equal(r.capGain,r.capTotal-j.capTotal);
  if(rows.has(r.id))assert.deepEqual(rows.get(r.id),r);else rows.set(r.id,r);
 }
 for(const r of p.coverage){assert(jobs.has(r.id));assert(r.produced.every(k=>rows.get(k)?.sourceTerminalId===r.id));coverage.set(r.id,mergeTrainingReceipts(coverage.get(r.id),r));}
}
const results=[...rows.values()].sort((a,b)=>a.id.localeCompare(b.id)),receipts=[...coverage.values()],groups=new Map(),byBody={},byTarget={};
for(const c of receipts){const b=byBody[c.body]??={attempted:0,productiveSeeds:0,successors:0,maxCapGain:0,firstInventoryClosed:0};b.attempted++;b.productiveSeeds+=Number(c.produced.length>0);}
for(const r of results){const b=byBody[r.body];b.successors++;b.maxCapGain=Math.max(b.maxCapGain,r.capGain);b.firstInventoryClosed+=Number(r.firstSuccessorInventory.firstInventoryClosed);byTarget[r.target]=(byTarget[r.target]||0)+1;
 const k=hash([r.origin,r.body,r.branch,r.difficulty,r.target,r.rank,r.raw,r.capRaw,r.traits,r.history,r.activeResearch,r.disabledResearch]);
 const ids=groups.get(k)||[];ids.push(r.id);groups.set(k,ids);
}
const summary={inputSeeds:jobs.size,attemptedSeeds:receipts.length,replayedSeeds:receipts.filter(r=>r.seedReplayVerified).length,productiveSeeds:receipts.filter(r=>r.produced.length).length,uniqueActionWitnesses:results.length,displayGroups:groups.size,firstInventoryClosed:results.filter(r=>r.firstSuccessorInventory.firstInventoryClosed).length,byBody,byTarget,replayErrors:receipts.filter(r=>r.error).length,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_TERMINAL_TRAINING_LEDGER_V1',sourceMetadataSha256:terminal.sourceMetadataSha256,sourceLedgerHash:terminal.sourceLedgerHash,sourceHash:hash(terminal),terminalSourceHash:hash(source),scope:'Productive conditional training retaining terminal research; bounded search, first-action inventory and display groups do not establish final closure.',summary,batches,coverage:receipts,displayGroups:Object.fromEntries(groups),rows:results};
fs.writeFileSync('public/data/soldier-overcap-terminal-training.json',JSON.stringify(report)+'\n');console.log(JSON.stringify(summary));
