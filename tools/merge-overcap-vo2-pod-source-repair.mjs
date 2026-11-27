// Merge resumable source-repair batches and produce a canonical intake queue.
// Failed jobs stay visible, and a successful replay is not official admission.
import fs from "node:fs";
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
const dir="tools/data",read=p=>JSON.parse(fs.readFileSync(p));
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
assert.equal(new Set([...records,...errors].map(r=>r.priorRoute)).size,seenJobs.size);
const eligible=records.filter(r=>r.scope.closed),pending=records.filter(r=>!r.scope.closed),grouped=new Map();
for(const r of eligible){if(!grouped.has(r.pairId))grouped.set(r.pairId,[]);grouped.get(r.pairId).push(r);}
const summary={priorPairs:first.summary.priorPairs,totalJobs:total,attempted:seenJobs.size,unattempted:total-seenJobs.size,replayed:records.length,sourceRepairedPriorPairs:new Set(records.map(r=>r.priorPair)).size,closureReadyPriorPairs:new Set(eligible.map(r=>r.priorPair)).size,closureReadyWitnesses:eligible.length,closureReadyPairCandidates:grouped.size,openSuccessorWitnesses:pending.length,failed:errors.length,officialFinalAdded:0};
const out={schema:"ATLAS_VO2_POD_REPAIR_INTAKE_V1",sourceMetadataSha256:first.sourceMetadataSha256,sourceGraphSha256:first.sourceGraphSha256,materialBudgetHash:first.materialBudgetHash,sourceRuleHashes:first.sourceRuleHashes,sourceBatches:files.map(({name,data})=>({name,hash:key(data)})),summary,unattemptedOffsets:Array.from({length:total},(_,i)=>i).filter(i=>!seenJobs.has(i)),closedCandidates:[...grouped].map(([pairId,rows])=>({pairId,priorPairs:[...new Set(rows.map(r=>r.priorPair))],witnesses:rows})),openSuccessorQueue:pending,failedQueue:errors,scope:"Conditional source repair and fixed-body closure candidates. Research chronology changes; old IDs cannot be relabeled. No official admission, actual manufacture or physical campaign acquisition certified."};
const file=dir+"/overcap-vo2-pod-repair-intake.json";fs.writeFileSync(file,JSON.stringify(out)+"\n");console.log(JSON.stringify({file,summary,unattemptedOffsets:out.unattemptedOffsets}));
