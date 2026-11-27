// Consolidate fixed-body closure certificates and prepare exact intake
// witnesses for the existing shared career producer; no registry mutation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const life=read('public/data/soldier-overcap-expanded-lifecycle.json'),next=read('public/data/soldier-overcap-direct-successors.json'),term=read('public/data/soldier-overcap-terminal-continuations.json'),training=read('public/data/soldier-overcap-terminal-training.json');
const parents=new Map(life.results.map(r=>[r.id,r])),children=new Map(next.rows.map(r=>[r.id,r])),terms=new Map(term.rows.map(r=>[r.id,r])),seeds=new Map([...term.rows,...training.rows].map(r=>[r.id,r]));
const files=process.argv.slice(2);assert(files.length);
const records=new Map(),closed=new Map(),errors=[],batches=[];let meta=null;
for(const file of files){
 const d=read(file);assert.equal(d.schema,'ATLAS_OVERCAP_FIXED_BODY_CLOSURE_LEDGER_V1');assert.equal(d.terminalSourceHash,hash(term));assert.equal(d.trainingSourceHash,hash(training));assert.equal(d.sourceMetadataSha256,term.sourceMetadataSha256);assert.equal(d.sourceLedgerHash,term.sourceLedgerHash);
 const head={scope:d.scope,sourceMetadataSha256:d.sourceMetadataSha256,sourceLedgerHash:d.sourceLedgerHash,terminalSourceHash:d.terminalSourceHash,trainingSourceHash:d.trainingSourceHash,terminalRuleHash:d.terminalRuleHash,sourceCatalogHash:d.sourceCatalogHash,fingerprints:d.fingerprints,body:d.summary.body,total:d.batch.total};
 if(meta)assert.deepEqual(meta,head);else meta=head;
 batches.push({file,hash:hash(d),batch:d.batch,summary:d.summary});
 for(const r of d.records){assert(!records.has(r.seedId)&&seeds.has(r.seedId));assert.equal(r.sourceActionHash,seeds.get(r.seedId).fullActionHash);records.set(r.seedId,r);}
 for(const c of d.closed){assert(!closed.has(c.seedId)&&records.has(c.seedId));assert.equal(c.proofHash,hash(c.certificate));assert.equal(c.certificate.independentReplay,true);assert.equal(c.certificate.openGrowth,false);assert.deepEqual(c.certificate.openRules,[]);assert.deepEqual(c.certificate.unknownRules,[]);assert.equal(c.finalAdmission,false);assert.equal(c.certificate.material.ok,true);assert.equal(c.certificate.sourceActionHash,records.get(c.seedId).sourceActionHash);closed.set(c.seedId,c);}
 errors.push(...d.errors);
}
assert.equal(records.size+errors.length,meta.total);
const groups=new Map(),intake=[];
for(const c of closed.values()){
 const r=seeds.get(c.seedId),t=r.sourceTerminalId?terms.get(r.sourceTerminalId):r,child=children.get(t.sourceRecordId),parent=parents.get(t.parentRecordId),actions=[...parent.actions,...child.suffix,...t.suffix,...(r.sourceTerminalId?r.suffix:[])];
 assert.equal(hash(actions),c.sourceActionHash);
 const p=c.certificate;
 // Display grouping is deliberately not the canonical research/trait pair ID.
 const k=hash([c.origin,c.body,c.branch,c.difficulty,c.target,p.raw,p.cap,p.rank,p.traits.map(([id])=>id),p.history.map(([id])=>id),p.activeResearch,p.disabledResearch]);
 const g=groups.get(k)||[];g.push(c.id);groups.set(k,g);
 intake.push({id:c.id,origin:c.origin,body:c.body,branch:c.branch,difficulty:c.difficulty,target:c.target,sourceTerminalId:c.sourceTerminalId,seedId:c.seedId,actions,actionHash:c.sourceActionHash,proofHash:c.proofHash,raw:p.raw,cap:p.cap,traits:p.traits,rank:p.rank,activeResearch:p.activeResearch,disabledResearch:p.disabledResearch,finalAdmission:false,status:'READY_FOR_CANONICAL_GRAPH_INSERTION'});
}
const rr=[...records.values()],cc=[...closed.values()],summary={body:meta.body,inputs:meta.total,replayed:rr.length,closedCandidates:cc.length,coveredTerminalSeeds:new Set(cc.map(r=>r.sourceTerminalId)).size,displayGroups:groups.size,open:rr.filter(r=>r.status==='OPEN_FIXED_BODY').length,irreversibleProofs:rr.reduce((n,r)=>n+r.blocked.filter(x=>x.reason==='IRREVERSIBLE_INDEXED_RESEARCH_EXCLUSION').length,0),repeatProofs:rr.reduce((n,r)=>n+r.repeatProofs.length,0),errors:errors.length,intakeWitnesses:intake.length,finalAdmission:0};
const report={schema:'ATLAS_OVERCAP_FIXED_BODY_CLOSURE_MERGED_V1',...meta,summary,batches,records:rr,closed:cc,displayGroups:Object.fromEntries(groups),errors};
const body=meta.body.replace('STR_SOLDIER_',''),file='public/data/soldier-overcap-fixed-body-closure-'+body+'.json',intakeFile='tools/data/overcap-fixed-body-intake-'+body+'.json';
fs.writeFileSync(file,JSON.stringify(report)+'\n');fs.writeFileSync(intakeFile,JSON.stringify({schema:'ATLAS_OVERCAP_CANONICAL_INTAKE_V1',...meta,closureLedgerHash:hash(report),summary:{rows:intake.length,finalAdmission:0},rows:intake})+'\n');
console.log(JSON.stringify({file,intakeFile,summary}));
