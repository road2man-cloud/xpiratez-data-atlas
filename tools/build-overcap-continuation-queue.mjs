// Exact-witness production queue; keeps live and casualty/repeat obligations separate.
// Derived scheduling artifact, not a campaign/terminal certificate.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {readTrainingLedger,hashLedger} from './overcap-training-ledger-store.mjs';
import {defaultRankData} from './population-frontier-default-rank.mjs';
import {deterministicRule} from './population-scalar-upper-bound.mjs';
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const ledger=readTrainingLedger(arg('training-hash',null)),trainingHash=hashLedger(ledger);
const data=defaultRankData(read('public/data/soldiers-modern-index.json')).data;
assert.equal(data.meta.source.metadataSha256,ledger.sourceMetadataSha256);
const rules=new Map(data.transformations.map(r=>[r.id,r])),bodies=new Map(data.soldiers.map(r=>[r.id,r]));
const witnesses=new Set(ledger.rows.map(r=>r.fullActionHash));
const prior=new Map(),issues=[],sources=new Map();
const key=(a,b)=>a+'|'+b;
for(const b of ledger.batches)for(const s of b.batch?.sources||[])sources.set(s.path,s);
for(const p of process.argv.filter(a=>a.startsWith('--staged=')).map(a=>a.slice(9)))if(!sources.has(p))sources.set(p,{path:p});
for(const s of sources.values()){
 if(!fs.existsSync(s.path)){issues.push({path:s.path,reason:'SOURCE_NOT_PRESENT'});continue;}
 const report=read(s.path);assert.equal(report.schema,'ATLAS_OVERCAP_STAGED_OBSTACLE_V1');
 if(s.hash)assert.equal(hashLedger(report),s.hash);
 if(s.trainingSourceHash)assert.equal(report.trainingSourceHash,s.trainingSourceHash);
 assert.equal(report.sourceMetadataSha256,ledger.sourceMetadataSha256);
 assert.equal(report.terminalSourceHash,ledger.sourceHash);
 const historical=readTrainingLedger(report.trainingSourceHash),byId=new Map(historical.rows.map(r=>[r.id,r]));
 for(const row of report.rows){
  if(row.seedKind!=='terminalTraining')continue;
  const seed=byId.get(row.seedId);assert(seed,'staged seed missing');assert.equal(seed.fullActionHash,row.sourceActionHash);
  const entry={path:s.path,trainingHash:report.trainingSourceHash,rowId:row.id,sourceActionHash:row.sourceActionHash,applied:row.applied,registered:row.applied===true&&witnesses.has(row.fullActionHash),addedResearch:row.addedResearch.length,remaining:row.remaining};
  const k=key(row.seedId,row.goal),list=prior.get(k)||[];list.push(entry);prior.set(k,list);
 }
}
const entries=[],seen=new Set();
for(const row of ledger.rows){
 assert.equal(row.conditionalReplayVerified,true);assert.equal(row.finalAdmission,false);
 for(const ob of row.firstSuccessorInventory.open){
  const k=key(row.id,ob.id);assert(!seen.has(k),'duplicate obligation '+k);seen.add(k);
  const r=rules.get(ob.id),body=bodies.get(row.body),history=new Map(row.history);
  const attempts=prior.get(k)||[],registered=attempts.some(a=>a.registered);
  const prepared=attempts.filter(a=>a.sourceActionHash===row.fullActionHash&&!a.applied).sort((a,b)=>a.remaining.length-b.remaining.length||b.addedResearch-a.addedResearch||a.path.localeCompare(b.path))[0]||null;
  let lane;
  if(!r||!body)lane='UNINDEXED';
  else if(!r.allowsLiveSoldiers)lane=r.allowsDeadSoldiers?'CASUALTY_REQUIRED':r.allowsWoundedSoldiers?'WOUND_REQUIRED':'NONLIVE_UNSUPPORTED';
  else if(r.createsClone||r.producedItem||r.producedSoldierType&&r.producedSoldierType!==row.body||r.reset||r.resetRank||r.removeTransformations?.length)lane='LIFECYCLE_OR_CLONE';
  else if(!deterministicRule(r,[body]))lane='NONDETERMINISTIC';
  else if(history.has(ob.id))lane='REPEAT_REQUIRES_PROOF';
  else if(registered)lane='SUCCESSOR_ALREADY_REGISTERED';
  else if(attempts.some(a=>a.applied))lane='APPLIED_INTAKE_PENDING';
  else if(prepared&&!prepared.remaining.length)lane='READY_BUT_TRANSFORM_UNRESOLVED';
  else if(prepared)lane='RESUME_PARTIAL_RESEARCH';
  else lane=ob.missingResearch.length?'NEW_LIVE_RESEARCH':'NEW_LIVE_READY';
  entries.push({seedId:row.id,sourceActionHash:row.fullActionHash,body:row.body,origin:row.origin,branch:row.branch,difficulty:row.difficulty,goal:ob.id,lane,capTotal:row.capTotal,missingResearch:ob.missingResearch,historyCount:history.get(ob.id)||0,requirements:r?{live:r.allowsLiveSoldiers,dead:r.allowsDeadSoldiers,wounded:r.allowsWoundedSoldiers,corpseRecovered:r.needsCorpseRecovered,requiredHistory:r.requiredPreviousTransformations,forbiddenHistory:r.forbiddenPreviousTransformations,medals:r.requiredCommendations}:null,...(prepared?{prepared}:{}),priorCount:attempts.length});
 }
}
const counts={},groups=new Map();
for(const e of entries){
 counts[e.lane]=(counts[e.lane]||0)+1;
 if(!['NEW_LIVE_RESEARCH','NEW_LIVE_READY','RESUME_PARTIAL_RESEARCH'].includes(e.lane))continue;
 const h=e.prepared?.trainingHash||trainingHash,p=e.prepared?.path||null,k=JSON.stringify([e.body,e.goal,e.lane,h,p]);
 const g=groups.get(k)||{body:e.body,goal:e.goal,lane:e.lane,trainingHash:h,resume:p,seeds:[]};g.seeds.push(e);groups.set(k,g);
}
const batches=[];
for(const g of groups.values()){
 // Same exact goal/immutable source, bounded batches. Never switch seeds by offset.
 g.seeds.sort((a,b)=>b.capTotal-a.capTotal||a.seedId.localeCompare(b.seedId));
 for(let i=0;i<g.seeds.length;i+=3){
  const seedIds=g.seeds.slice(i,i+3).map(e=>e.seedId);
  const args=['tools/build-overcap-staged-obstacle.mjs','--body='+g.body,'--goal='+g.goal,'--training-hash='+g.trainingHash,...seedIds.map(id=>'--seed-id='+id),'--allow-tradeoffs=1','--calls=8','--attempts=120',...(g.resume?['--resume='+g.resume]:[])];
  batches.push({body:g.body,goal:g.goal,lane:g.lane,trainingHash:g.trainingHash,resume:g.resume,seedIds,command:['node',...args]});
 }
}
const order={NEW_LIVE_READY:0,RESUME_PARTIAL_RESEARCH:1,NEW_LIVE_RESEARCH:2};
batches.sort((a,b)=>order[a.lane]-order[b.lane]||a.body.localeCompare(b.body)||a.goal.localeCompare(b.goal)||a.seedIds[0].localeCompare(b.seedIds[0]));
const report={schema:'ATLAS_OVERCAP_CONTINUATION_QUEUE_V1',trainingHash,sourceMetadataSha256:ledger.sourceMetadataSha256,scope:'Indexed first-successor scheduling only. Non-live, repeat and unresolved paths are not discarded and never count as closed.',summary:{witnesses:ledger.rows.length,obligations:entries.length,lanes:counts,batches:batches.length,issues:issues.length,finalAdmission:0},issues,entries,batches};
const path=arg('out','tools/data/overcap-continuation-queue-'+trainingHash.slice(0,16)+'.json');
if(fs.existsSync(path))assert.deepEqual(read(path),report,'queue output differs; choose another output path');else {const payload=JSON.stringify(report)+'\n';fs.writeFileSync(path,path.endsWith('.gz')?gzipSync(payload):payload,{flag:'wx'});}
console.log(JSON.stringify({path,summary:report.summary,first:batches.slice(0,2)}));
