// Produce a scoped v10 admission receipt on the actual staged canonical ledger.
// A focused result is deliberately NOT installed in the published registry.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {execFileSync} from "node:child_process";
import {key} from "./population-research-career-core.mjs";
import {createSharedCareerReplay} from "./population-shared-lifecycle-replay.mjs";
import {hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {hydrateSharedCareerSections} from "../public/branch-soldier-registry-shared.js";
import {ledgers,project} from "../public/branch-soldier-atlas-career-core.js";
import {classifyCandidate} from "./atlas-career-completion-core.mjs";
import {buildTerminalResearchTraitSets} from "./atlas-terminal-research-trait-sets.mjs";
import {admitResearchLines} from "./atlas-research-line-admission.mjs";
import {buildCareerMaterialBudget} from "./atlas-career-material-budget-v2-vo2.mjs";

const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const body=process.argv.find(x=>x.startsWith("--body="))?.slice(7)||"POD_REPAIR";
assert(/^[A-Z0-9_]+$/.test(body));
const stage="tools/data/overcap-intake-stage-"+body+"/";
const ledger=decode(stage+"soldier-population-missing-origin-career.json.gz"),index=decode(stage+"soldier-population-missing-origin-career-index.json.gz");
const patch=read("tools/data/overcap-canonical-graph-patch-"+body+".json"),receipt=read("tools/data/overcap-staged-intake-receipt-"+body+".json");
const db=hydrateSharedCareerSections(hydrateResearchPaths(decode("public/data/branch-soldier-results.json.gz")));
const data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
const catalog=read("public/data/soldier-source-catalog.json");data.sourceItemIds=new Set(catalog.itemIds);
assert.equal(db.sourceMetadataSha256,ledger.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.equal(key(ledger.graphs),ledger.sourceGraphSha256);assert.equal(index.sourceGraphSha256,ledger.sourceGraphSha256);
assert.equal(receipt.sourceGraphSha256,ledger.sourceGraphSha256);assert.equal(receipt.patchHash,key(patch));
// Follow the staged append receipts back to the actual published graph.
const chain=[{body,patch,receipt}],seenStages=new Set([body]);let cursor=receipt;
while(cursor.baseStage){
 const prev=cursor.baseStage;assert(/^[A-Z0-9_]+$/.test(prev)&&!seenStages.has(prev));seenStages.add(prev);
 const pp=read("tools/data/overcap-canonical-graph-patch-"+prev+".json"),pr=read("tools/data/overcap-staged-intake-receipt-"+prev+".json");
 assert.equal(pr.patchHash,key(pp));assert.equal(pr.sourceGraphSha256,cursor.baseGraphHash);assert.equal(pr.baseGraphHash,pp.baseGraphHash);
 assert.equal(pr.sourceMetadataSha256,ledger.sourceMetadataSha256);
 chain.unshift({body:prev,patch:pp,receipt:pr});cursor=pr;
}
const baseGraphHash=chain[0].patch.baseGraphHash;
assert.equal(db.careerCompletion.researchTraitSets.sourceGraphSha256,baseGraphHash);
const candidateReceipts=chain.flatMap(x=>x.patch.receipts);
for(const r of candidateReceipts){assert.equal(ledger.routes[r.routeId]?.fullActionHash,r.actionHash);assert.equal(ledger.routes[r.routeId]?.canonicalStateHash,r.stateHash);}
const c=db.careerCompletion,priorRows=c.rows.slice(),priorSets=c.researchTraitSets,priorLines=c.researchLineRows;
const reuseStage=process.argv.find(x=>x.startsWith("--reuse-stage="))?.slice(14)||null;
let previous=null;
if(reuseStage){
 assert(/^[A-Z0-9_]+$/.test(reuseStage)&&reuseStage!==body);
 const prev=chain.find(x=>x.body===reuseStage);assert(prev,"Snapshot reuse must follow the verified append chain");
 const old=decode("tools/data/overcap-intake-stage-"+reuseStage+"/vo2-full-prepared.json.gz"),m=read("tools/data/overcap-vo2-full-prepared-manifest-"+reuseStage+".json");
 assert.equal(key(old),m.preparedHash);assert.equal(old.sourceGraphSha256,prev.receipt.sourceGraphSha256);assert.equal(old.sourceMetadataSha256,ledger.sourceMetadataSha256);
 assert.equal(old.baseGraphHash,baseGraphHash);assert.equal(key(old.plan),m.planHash);
 previous={old,manifest:m};
}
const replay=createSharedCareerReplay(data,ledger.summary);
const budget=buildCareerMaterialBudget(data,ledger);
const ids=new Set(candidateReceipts.map(r=>r.routeId));
const priorMaterialIssues=priorRows.map(row=>{
 const all=[row,...(row.alternatives||[])],passing=all.filter(r=>!budget.records[r.routeId]?.hard?.length&&!budget.records[r.routeId]?.uncertain?.length&&budget.checkedRouteIds.includes(r.routeId));
 return {id:row.id,witnesses:all.length,passing:passing.length};
}).filter(r=>!r.passing);
console.log(JSON.stringify({phase:"v.o2 budget produced",checked:budget.checked,finite:Object.values(budget.finite).map(x=>[x.id,x.cap]),priorPairsWithNoPassingMaterialWitness:priorMaterialIssues.length}));
const selected=ledger;
// Earlier classifications are reusable only under exact route/index identity.
const basePath="public/data/soldier-population-missing-origin-career.json.gz",baseIndexPath="public/data/soldier-population-missing-origin-career-index.json.gz";
const gitDecode=p=>JSON.parse(gunzipSync(fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:256*1024*1024})));
const base=gitDecode(basePath),baseIndex=gitDecode(baseIndexPath);
assert.equal(base.sourceGraphSha256,baseGraphHash);assert.equal(key(base.graphs),baseGraphHash);assert.equal(baseIndex.sourceGraphSha256,baseGraphHash);
assert.equal(key(base.routes),c.sourceHashes.missingbirth.routes);
assert.deepEqual(index.nodes.slice(0,baseIndex.nodes.length),baseIndex.nodes);
assert.deepEqual(index.actionNodes.slice(0,baseIndex.actionNodes.length),baseIndex.actionNodes);
const l=ledgers.find(l=>l.key==="missingbirth"),p=project(l,selected,db.sourceMetadataSha256),classes={};
assert.deepEqual(p.rejected,[]);
let reused=0,fresh=0;
for(const row of p.rows){
 const raw=selected.routes[row.id],old=base.routes[row.id],priorClass=c.classifications.missingbirth[row.id],eid=key([row.origin,row.branch,row.hash]);
 if(old){
  assert.deepEqual(old,raw);assert.deepEqual(baseIndex.routes[row.id],index.routes[row.id]);
  assert(priorClass?.traceHashVerified&&priorClass.evidenceId===eid,"Prior classification not source-bound "+row.id);
  const {finalCareerStatus,nextCareerRoute,researchLineId,gameplayProofMissing,...kept}=priorClass;
  classes[row.id]={...kept,status:"INTERMEDIATE"};reused++;
 }else{
  const cls=classifyCandidate({ledger:l,row,raw,db,index});
  assert(cls.traceHashVerified,JSON.stringify({route:row.id,error:cls.traceError}));
  classes[row.id]={status:cls.category,traceHashVerified:true,assumptions:cls.assumptions,missing:cls.missing,evidenceId:eid};fresh++;
 }
}
assert.equal(reused,Object.keys(base.routes).length);
console.log(JSON.stringify({phase:"classification prepared",reused,fresh}));
c.classifications={...c.classifications,missingbirth:classes};c.materialBudget=budget;
const sets=buildTerminalResearchTraitSets({db,ledger:selected,index,replay,prior:previous?.old.researchTraitSets||priorSets});c.researchTraitSets=sets;
const lines=admitResearchLines({db,sets,ledger:selected,classifications:c.classifications,prior:{rows:priorLines}});
console.log(JSON.stringify({phase:"research/trait snapshots",summary:sets.summary,lines:lines.rows.length,rejected:lines.rejected.length}));
const seen=new Set(lines.rows.map(r=>r.id));for(const r of priorLines)assert(seen.has(r.id),"Lost prior research line "+r.id);
if(previous)for(const r of previous.old.researchLineRows)assert(seen.has(r.id),"Lost earlier staged research line "+r.id);
const priorIds=new Set(priorRows.map(r=>r.id)),candidatePairs=new Set(candidateReceipts.map(r=>sets.records[r.routeId]?.pairId));assert(!candidatePairs.has(undefined));
for(const r of candidateReceipts)if(r.expectedPair)assert.equal(sets.records[r.routeId].pairId,r.expectedPair);
const priority=line=>candidatePairs.has(line.id)?0:priorIds.has(line.id)?1:2;
const ordered=lines.rows.slice().sort((a,b)=>priority(a)-priority(b)||sets.pairs[a.id].body.localeCompare(sets.pairs[b.id].body)||a.id.localeCompare(b.id));
const plan=ordered.map(r=>({id:r.id,priority:priority(r),body:sets.pairs[r.id].body,routes:[r,...r.alternatives].map(x=>x.routeId)}));
const summary={previousPublicPairs:priorRows.length,researchLines:lines.rows.length,researchLineWitnesses:lines.covered.size,reusedClassifications:reused,newClassifications:fresh,priorPairsWithNoPassingMaterialWitness:priorMaterialIssues.length,priorityNewPairs:plan.filter(r=>r.priority===0).length,priorityPriorPairs:plan.filter(r=>r.priority===1).length,otherPairs:plan.filter(r=>r.priority===2).length,officialFinalAdded:0,...(previous?{reusedStagedSnapshots:sets.summary.metrics.reusedRecords,newStagedSnapshots:sets.summary.metrics.freshRecords}:{} )};
const out={schema:"ATLAS_VO2_FULL_PREPARED_V1",sourceMetadataSha256:ledger.sourceMetadataSha256,sourceGraphSha256:ledger.sourceGraphSha256,baseGraphHash,...(previous?{previousPreparation:{stage:reuseStage,preparedHash:previous.manifest.preparedHash,graph:previous.old.sourceGraphSha256}}:{}),stageChain:chain.map(x=>({body:x.body,patchHash:x.receipt.patchHash,sourceGraphSha256:x.receipt.sourceGraphSha256})),summary,priorMaterialIssues,previousPublicPairIds:[...priorIds].sort(),candidateReceipts,materialBudget:budget,researchTraitSets:sets,researchLineRows:ordered,researchLineRejected:lines.rejected,classifications:classes,plan,planHash:key(plan)};
const file=stage+"vo2-full-prepared.json.gz";
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(out),{level:4}));fs.renameSync(file+".tmp",file);
const manifest={schema:out.schema,sourceMetadataSha256:out.sourceMetadataSha256,sourceGraphSha256:out.sourceGraphSha256,baseGraphHash,...(out.previousPreparation?{previousPreparation:out.previousPreparation}:{}),stageChain:out.stageChain,summary,planHash:out.planHash,preparedHash:key(out),replayFingerprint:sets.replayFingerprint,materialBudgetHash:budget.sha256,plan:plan.map(({id,priority,body,routes})=>({id,priority,body,witnesses:routes.length})),priorMaterialIssues,candidateReceipts:candidateReceipts.map(({candidate,priorPair,expectedPair,routeId})=>({candidate,priorPair:priorPair||null,expectedPair:expectedPair||null,routeId}))};
fs.writeFileSync("tools/data/overcap-vo2-full-prepared-manifest-"+body+".json",JSON.stringify(manifest)+"\n");
console.log(JSON.stringify({file,summary,metrics:sets.summary.metrics,planHash:out.planHash,preparedHash:manifest.preparedHash}));
