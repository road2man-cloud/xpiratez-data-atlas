// Bounded exact continuation production. Uses trusted queue data, no shell.
// Run in an isolated checkout; preserves every staged receipt and old ledger.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {readTrainingLedger,hashLedger,assertAppendOnly} from './overcap-training-ledger-store.mjs';
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const arg=(k,d)=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const int=(k,d,lo,hi)=>{const n=Number(arg(k,d));assert(Number.isSafeInteger(n)&&n>=lo&&n<=hi,k);return n;};
const path=arg('queue','');assert(path,'--queue required');
const q=read(path);assert.equal(q.schema,'ATLAS_OVERCAP_CONTINUATION_QUEUE_V1');
assert.equal(q.summary.finalAdmission,0);
const qHash=hashLedger(q),initial=readTrainingLedger(),pinned=readTrainingLedger(q.trainingHash);
assertAppendOnly(pinned,initial);
assert.equal(q.sourceMetadataSha256,initial.sourceMetadataSha256);
const lane=arg('lane','NEW_LIVE_READY');
assert(['NEW_LIVE_READY','RESUME_PARTIAL_RESEARCH','NEW_LIVE_RESEARCH','ALL_LIVE'].includes(lane));
const offset=int('offset',0,0,q.batches.length),limit=int('limit',3,1,20),timeout=int('timeout-seconds',90,5,600)*1000;
const chosen=q.batches.map((b,i)=>({b,i})).filter(({b,i})=>i>=offset&&(lane==='ALL_LIVE'||b.lane===lane)).slice(0,limit);
assert(chosen.length,'no selected batches');
const entries=new Map(q.entries.map(e=>[e.seedId+'|'+e.goal,e]));
const prior=new Map(initial.batches.flatMap(b=>(b.batch?.sources||[]).map(s=>[s.path,s])));
const known=new Set(initial.rows.map(r=>r.fullActionHash));
const lock='tools/data/.overcap-continuation-run.lock';
let fd;
function run(script,args){
 const p=spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout,maxBuffer:16*1024*1024,windowsHide:true});
 if(p.error||p.status!==0)throw Error(script+': '+(p.error?.message||'exit '+p.status)+' '+String(p.stderr||p.stdout||'').slice(-3000));
 const lines=p.stdout.trim().split(/\r?\n/);return JSON.parse(lines.at(-1));
}
function store(p,obj){if(fs.existsSync(p))assert.deepEqual(read(p),obj,'immutable report differs: '+p);else fs.writeFileSync(p,JSON.stringify(obj)+'\n',{flag:'wx'});}
try{
 fd=fs.openSync(lock,'wx');
 const receipts=[],staged=[];
 for(const {b,i} of chosen){
  const receipt={index:i,body:b.body,goal:b.goal,lane:b.lane,seedIds:b.seedIds,status:'OPEN'};
  const out='tools/data/overcap-continuation-receipt-'+hashLedger([qHash,i,b]).slice(0,24)+'.json';
  try{
   assert(['NEW_LIVE_READY','RESUME_PARTIAL_RESEARCH','NEW_LIVE_RESEARCH'].includes(b.lane));
   const old=readTrainingLedger(b.trainingHash),oldRows=new Map(old.rows.map(r=>[r.id,r]));
   assert.equal(old.sourceHash,initial.sourceHash);
   assert(Array.isArray(b.seedIds)&&b.seedIds.length>0&&b.seedIds.length<=3&&new Set(b.seedIds).size===b.seedIds.length);
   for(const id of b.seedIds){const e=entries.get(id+'|'+b.goal),r=oldRows.get(id);assert(e&&r&&e.body===b.body&&e.lane===b.lane&&r.fullActionHash===e.sourceActionHash);assert.equal(e.prepared?.path||null,b.resume||null);assert.equal(e.prepared?.trainingHash||q.trainingHash,b.trainingHash);}
   if(fs.existsSync(out)){
    const prev=read(out);assert.equal(prev.queueHash,qHash);assert.equal(prev.index,i);
    if(prev.file){assert.equal(hashLedger(read(prev.file)),prev.reportHash);if(!prior.has(prev.file))staged.push(prev.file);}
    receipts.push({...prev,reused:true});continue;
   }
   const args=['--body='+b.body,'--goal='+b.goal,'--training-hash='+b.trainingHash,...b.seedIds.map(id=>'--seed-id='+id),'--allow-tradeoffs=1','--calls=8','--attempts=120',...(b.resume?['--resume='+b.resume]:[])];
   const result=run('tools/build-overcap-staged-obstacle.mjs',args),r=read(result.file);
   assert.equal(r.schema,'ATLAS_OVERCAP_STAGED_OBSTACLE_V1');assert.equal(r.trainingSourceHash,b.trainingHash);assert.equal(r.body,b.body);assert.equal(r.goal,b.goal);
   assert.deepEqual(r.batch.seedIds,b.seedIds);assert.equal(r.summary.errors,0,'staged errors; inspect output');
   Object.assign(receipt,{queueHash:qHash,file:result.file,reportHash:hashLedger(r),summary:r.summary,status:'PRODUCED',registeredAlready:r.rows.filter(x=>x.applied&&known.has(x.fullActionHash)).length});
   store(out,receipt);if(!prior.has(result.file))staged.push(result.file);
  }catch(e){Object.assign(receipt,{queueHash:qHash,status:'ERROR',error:e.message});}
  receipts.push(receipt);
 }
 let intake=null,merged=null;
 const paths=[...new Set(staged)];
 if(paths.length){
  assert.equal(hashLedger(readTrainingLedger()),hashLedger(initial),'ledger changed during run');
  intake=run('tools/build-overcap-terminal-training-wave.mjs',paths.map(p=>'--staged-wave='+p));
  assert.equal(intake.summary.errors,0);
  assert.equal(hashLedger(readTrainingLedger()),hashLedger(initial),'ledger changed before merge');
  merged=run('tools/merge-overcap-terminal-training-waves.mjs',[...new Set([...initial.batches.map(b=>b.path),intake.file])]);
 }
 const next=readTrainingLedger();assertAppendOnly(initial,next);
 const summary={selected:chosen.length,produced:receipts.filter(r=>r.status==='PRODUCED').length,errors:receipts.filter(r=>r.status==='ERROR').length,staged:paths.length,applied:receipts.reduce((n,r)=>n+(r.summary?.transformations||0),0),added:next.rows.length-initial.rows.length,witnesses:next.rows.length,displayGroups:next.summary.displayGroups,finalAdmission:0};
 const report={schema:'ATLAS_OVERCAP_CONTINUATION_RUN_V1',queuePath:path,queueHash:qHash,initialHash:hashLedger(initial),currentHash:hashLedger(next),selection:{lane,offset,limit},summary,receipts,intake,merged};
 const file='tools/data/overcap-continuation-run-'+hashLedger(report).slice(0,24)+'.json';store(file,report);
 console.log(JSON.stringify({file,summary,hash:report.currentHash,staged:paths,intake:intake?.file,errors:receipts.filter(r=>r.error)}));
 if(summary.errors)process.exitCode=1;
}finally{if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}}
