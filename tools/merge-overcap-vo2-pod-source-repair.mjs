// Merge resumable source-repair batches and produce a canonical intake queue.
// Failed jobs stay visible, and a successful replay is not official admission.
import fs from "node:fs";
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
const dir="tools/data",read=p=>JSON.parse(fs.readFileSync(p));
const version=Number(process.argv.find(x=>x.startsWith("--version="))?.slice(10)||1);
assert(Number.isSafeInteger(version)&&version>=1);
const names=fs.readdirSync(dir).filter(n=>/^overcap-vo2-pod-source-repair-\d+-\d+\.json$/.test(n)).sort((a,b)=>Number(a.split("-").at(-2))-Number(b.split("-").at(-2)));
assert(names.length,"No repair batches");
const files=names.map(n=>({name:n,data:read(dir+"/"+n)})),first=files[0].data;
const total=first.batch.total,seenJobs=new Set(),records=[],errors=[];
for(const {name,data:d} of files){
 assert.equal(d.schema,"ATLAS_VO2_POD_SOURCE_REPAIR_V1");
 for(const k of ["sourceMetadataSha256","sourceGraphSha256","materialBudgetHash"])assert.equal(d[k],first[k]);
 assert.deepEqual(d.sourceRuleHashes,first.sourceRuleHashes);
 assert.equal(d.batch.total,total);
 const {offset,limit}=d.batch,n=Math.min(limit,total-offset);
 assert(n>0&&d.records.length+d.errors.length===n);
 for(let i=offset;i<offset+n;i++){assert(!seenJobs.has(i),"Overlapping batch "+name);seenJobs.add(i);}
 for(const r of d.records){assert.equal(r.actionHash,key(r.actions));assert.equal(r.id,"VO2-POD-REPAIR:"+r.actionHash);assert.deepEqual(r.material.issues,{hard:[],uncertain:[]});assert.equal(r.finalAdmission,false);records.push(r);}
 errors.push(...d.errors);
}
// Retry batches supplement failures without mutating the original intake.
const retryReplacements=[];
if(version>=3){
 const retryNames=fs.readdirSync(dir).filter(n=>/^overcap-vo2-pod-source-repair-\d+-1-retry-v\d+\.json$/.test(n)).sort((a,b)=>Number(a.match(/-retry-v(\d+)/)[1])-Number(b.match(/-retry-v(\d+)/)[1])||Number(a.match(/repair-(\d+)/)[1])-Number(b.match(/repair-(\d+)/)[1]));
 for(const name of retryNames){
  const d=read(dir+"/"+name);assert.equal(d.schema,first.schema);for(const k of ["sourceMetadataSha256","sourceGraphSha256","materialBudgetHash"])assert.equal(d[k],first[k]);
  assert.deepEqual(d.sourceRuleHashes,first.sourceRuleHashes);assert.equal(d.batch.total,total);assert.equal(d.batch.limit,1);assert(d.batch.offset>=0&&d.batch.offset<total);assert.equal(d.records.length+d.errors.length,1);
  if(!d.records.length)continue; // Preserve failed retry in its own receipt, not as a new job.
  const r=d.records[0];assert.equal(r.actionHash,key(r.actions));assert.equal(r.id,"VO2-POD-REPAIR:"+r.actionHash);assert.deepEqual(r.material.issues,{hard:[],uncertain:[]});assert.equal(r.finalAdmission,false);
  assert(!records.some(x=>x.priorRoute===r.priorRoute),"Retry cannot overwrite successful repair");
  const i=errors.findIndex(x=>x.priorRoute===r.priorRoute);
  if(seenJobs.has(d.batch.offset)){
   assert(i>=0,"Retry must replace a recorded failure");
   const old=errors[i];for(const k of ["priorPair","priorRoute","origin","body","branch"])assert.equal(old[k],r[k]);errors.splice(i,1);
   retryReplacements.push({name,offset:d.batch.offset,priorRoute:r.priorRoute,priorReason:old.reason});
  }else{
   assert(i<0);seenJobs.add(d.batch.offset);
   retryReplacements.push({name,offset:d.batch.offset,priorRoute:r.priorRoute,priorReason:"UNATTEMPTED"});
  }
  records.push(r);files.push({name,data:d});
 }
}
assert.equal(new Set([...records,...errors].map(r=>r.priorRoute)).size,seenJobs.size);
const eligible=records.filter(r=>r.scope.closed),pending=records.filter(r=>!r.scope.closed),grouped=new Map();
for(const r of eligible){if(!grouped.has(r.pairId))grouped.set(r.pairId,[]);grouped.get(r.pairId).push(r);}
const summary={priorPairs:first.summary.priorPairs,totalJobs:total,attempted:seenJobs.size,unattempted:total-seenJobs.size,replayed:records.length,sourceRepairedPriorPairs:new Set(records.map(r=>r.priorPair)).size,closureReadyPriorPairs:new Set(eligible.map(r=>r.priorPair)).size,closureReadyWitnesses:eligible.length,closureReadyPairCandidates:grouped.size,openSuccessorWitnesses:pending.length,failed:errors.length,officialFinalAdded:0};
const out={schema:"ATLAS_VO2_POD_REPAIR_INTAKE_V1",sourceMetadataSha256:first.sourceMetadataSha256,sourceGraphSha256:first.sourceGraphSha256,materialBudgetHash:first.materialBudgetHash,sourceRuleHashes:first.sourceRuleHashes,sourceBatches:files.map(({name,data})=>({name,hash:key(data)})),...(version>=3?{retryReplacements}:{}),summary,unattemptedOffsets:Array.from({length:total},(_,i)=>i).filter(i=>!seenJobs.has(i)),closedCandidates:[...grouped].map(([pairId,rows])=>({pairId,priorPairs:[...new Set(rows.map(r=>r.priorPair))],witnesses:rows})),openSuccessorQueue:pending,failedQueue:errors,scope:"Conditional source repair and fixed-body closure candidates. Research chronology changes; old IDs cannot be relabeled. No official admission, actual manufacture or physical campaign acquisition certified."};
// Keep the original queue immutable when a staged canonical graph already
// references its exact hash. Additional repairs use a versioned queue.
const file=dir+"/overcap-vo2-pod-repair-intake"+(version===1?"":"-v"+version)+".json";
if(fs.existsSync(file)){
 const prior=read(file);
 assert.equal(key(prior),key(out),"Existing intake is immutable; use a new --version");
}
fs.writeFileSync(file,JSON.stringify(out)+"\n");console.log(JSON.stringify({file,summary,unattemptedOffsets:out.unattemptedOffsets}));
