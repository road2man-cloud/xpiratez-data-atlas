// Merge independently replayed terminal research waves; never a final certificate.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const source=read('tools/data/overcap-terminal-source-v1.json'),life=read('public/data/soldier-overcap-expanded-lifecycle.json'),next=read('public/data/soldier-overcap-direct-successors.json');
const parents=new Map(life.results.map(r=>[r.id,r])),children=new Map(next.rows.map(r=>[r.id,r])),jobs=new Map(next.terminalCandidates.map(r=>[r.id+'|'+r.branch,r]));
const targets=new Map(source.terminalRule.targets.map(t=>[t.id,t])),branches=new Map(source.branches.map(b=>[b.id,b]));
const allChoice=new Set(source.branches.flatMap(b=>[...b.captain,...Object.values(b.choices||{})].filter(Boolean)));
const rows=new Map(),coverage=new Map(),batches=[];
for(const path of process.argv.slice(2)){
 const p=read(path);assert.equal(p.schema,'ATLAS_OVERCAP_TERMINAL_CONTINUATION_WAVE_V1');assert.equal(p.sourceHash,hash(next));assert.equal(p.terminalSourceHash,hash(source));assert.equal(p.sourceLedgerHash,next.sourceLedgerHash);assert.equal(p.sourceMetadataSha256,next.sourceMetadataSha256);
 batches.push({path,hash:hash(p),summary:p.summary,batch:p.batch});
 for(const r of p.rows){
  const child=children.get(r.sourceRecordId),parent=parents.get(r.parentRecordId),j=jobs.get(r.sourceRecordId+'|'+r.branch),t=targets.get(r.target),b=branches.get(r.branch);
  assert(child&&parent&&j&&t&&b&&child.sourceRecordId===parent.id);
  assert.equal(r.sourceActionHash,child.fullActionHash);assert.equal(r.suffixHash,hash(r.suffix));assert.equal(r.fullActionHash,hash([...parent.actions,...child.suffix,...r.suffix]));
  assert.equal(r.id,'OVERCAP-TERMINAL:'+hash([child.id,b.id,t.id,r.suffix]));assert.equal(r.conditionalReplayVerified,true);assert.equal(r.finalAdmission,false);assert.equal(r.materialBudgetVerified,false);assert.equal(r.commendationStatsIncluded,false);
  assert.deepEqual(r.raw,child.raw);assert.deepEqual(r.traits,child.traits);assert.deepEqual(r.history,child.history);assert.equal(r.rank,child.rank);
  const active=new Set(r.activeResearch),keep=[...b.captain,...Object.values(b.choices||{})].filter(Boolean);
  assert(keep.every(k=>active.has(k))&&[...allChoice].every(k=>!active.has(k)||keep.includes(k))&&b.blockedResearch.every(k=>!active.has(k)));
  const missing=t.researchGoals.filter(k=>!active.has(k));assert.deepEqual(r.remaining,missing);
  if(r.status==='CONDITIONAL_TERMINAL_RESEARCH_READY')assert(!missing.length&&!(t.inactiveResearch||[]).some(k=>active.has(k)));
  if(rows.has(r.id))assert.deepEqual(rows.get(r.id),r);else rows.set(r.id,r);
 }
 for(const c of p.coverage){
  const k=c.id+'|'+c.branch;assert(jobs.has(k));assert(c.produced.every(id=>rows.has(id)));
  const old=coverage.get(k);if(old)throw Error('duplicate seed '+k);coverage.set(k,c);
 }
}
const results=[...rows.values()].sort((a,b)=>a.id.localeCompare(b.id)),receipts=[...coverage.values()],ready=results.filter(r=>r.status==='CONDITIONAL_TERMINAL_RESEARCH_READY');
const byBody={},byTarget={};
for(const r of ready){const b=byBody[r.body]??={ready:0,minAddedResearch:Infinity,maxAddedResearch:0};b.ready++;b.minAddedResearch=Math.min(b.minAddedResearch,r.addedResearch.length);b.maxAddedResearch=Math.max(b.maxAddedResearch,r.addedResearch.length);byTarget[r.target]=(byTarget[r.target]||0)+1;}
const summary={inputPairs:jobs.size,attemptedPairs:coverage.size,readyPairs:new Set(ready.map(r=>r.sourceRecordId+'|'+r.branch)).size,readyRows:ready.length,partialRows:results.length-ready.length,replayErrors:receipts.filter(r=>r.error).length,byBody,byTarget,donorReplays:batches.reduce((s,b)=>s+b.summary.donorReplays,0),plannerCalls:batches.reduce((s,b)=>s+b.summary.plannerCalls,0),researchAttempts:batches.reduce((s,b)=>s+b.summary.researchAttempts,0),finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_TERMINAL_CONTINUATION_LEDGER_V1',sourceMetadataSha256:next.sourceMetadataSha256,sourceLedgerHash:next.sourceLedgerHash,sourceHash:hash(next),baseSourceHash:hash(life),terminalSourceHash:hash(source),terminalRuleHash:source.terminalRuleHash,registryCommit:source.registryCommit,scope:'Terminal research reached, not actual victory, final closure, or material certification.',summary,batches,coverage:receipts,rows:results};
fs.writeFileSync('public/data/soldier-overcap-terminal-continuations.json',JSON.stringify(report)+'\n');
console.log(JSON.stringify(summary));
