// Merge independently produced final classification batches. A partial
// result cannot be installed in the canonical registry. Only global repeat
// equivalence and complete plan coverage can produce a full admission index.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
import {packBodyScopeInventory} from "../public/branch-soldier-final-scope-codec.js";
import {FINAL_SCHEMA} from "./atlas-final-career-admission-v10-vo2-irreversible.mjs";
const body=process.argv.find(x=>x.startsWith("--body="))?.slice(7)||"POD_REPAIR";
assert(/^[A-Z0-9_]+$/.test(body));
const stage="tools/data/overcap-intake-stage-"+body+"/",read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const prep=decode(stage+"vo2-full-prepared.json.gz"),manifest=read("tools/data/overcap-vo2-full-prepared-manifest-"+body+".json");
assert.equal(key(prep),manifest.preparedHash);assert.equal(key(prep.plan),manifest.planHash);
const ledger=decode(stage+"soldier-population-missing-origin-career.json.gz");
assert.equal(key(ledger.graphs),prep.sourceGraphSha256);
const files=fs.readdirSync(stage).filter(n=>/^vo2-final-(?:batch-\d+-\d+|(?:fast|static|next)-batch-[a-f0-9]+)\.json\.gz$/.test(n)).sort();
assert(files.length,"No completed batches");
const witnesses={},seen=new Set(),sourceBatches=[],regressions=new Map(),rows=[];
let sourceHashes=null;
for(const name of files){
 const d=decode(stage+name);assert.equal(d.schema,"ATLAS_VO2_FULL_FINAL_BATCH_V1");
 for(const k of ["sourceMetadataSha256","sourceGraphSha256","planHash"])assert.equal(d[k],prep[k]);
 assert.equal(d.preparedHash,manifest.preparedHash);assert.equal(d.materialBudgetHash,prep.materialBudget.sha256);
 assert.equal(d.batch.total,prep.plan.length);const {offset,limit}=d.batch;
 const indices=d.batch.indices||Array.from({length:Math.min(limit,prep.plan.length-offset)},(_,i)=>offset+i);
 assert(indices.length&&indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<prep.plan.length));assert.equal(new Set(indices).size,indices.length);
 const expected=indices.map(i=>prep.plan[i]);assert.deepEqual(d.pairIds,expected.map(x=>x.id));assert(expected.length);
 if(name.startsWith("vo2-final-fast-batch-"))assert(Object.values(d.witnesses).every(v=>["KNOWN_CONTINUATION","UNRESOLVED_FINITE_MATERIAL"].includes(v.status)));
 if(name.startsWith("vo2-final-static-batch-"))assert(Object.values(d.witnesses).every(v=>["KNOWN_CONTINUATION","UNRESOLVED_FINITE_MATERIAL","OPEN_RESEARCH_OR_GROWTH","OPEN_TRANSFORMATION"].includes(v.status)));
 for(const p of expected){assert(!seen.has(p.id),"Overlapping batch pair "+p.id);seen.add(p.id);}
 const refs=expected.flatMap(x=>x.routes);assert.deepEqual(Object.keys(d.witnesses).sort(),refs.slice().sort());
 if(sourceHashes)assert.deepEqual(d.sourceHashes,sourceHashes);else sourceHashes=d.sourceHashes;
 for(const [p,h] of Object.entries(sourceHashes))assert.equal(key(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Gate source changed "+p);
 for(const [id,v] of Object.entries(d.witnesses)){
  assert(!witnesses[id]);const r=prep.researchTraitSets.records[id];
  assert.equal(v.actionHash,r.actionHash);assert.equal(v.stateHash,r.stateHash);assert.equal(v.pairId,r.pairId);
  if(["FINAL_CLOSED","FINAL_EQUIVALENT"].includes(v.status)){
   const c=v.certificate;assert(c&&c.independentReplay&&c.schema===FINAL_SCHEMA&&c.graph===prep.sourceGraphSha256&&c.pair===v.pairId&&c.state===v.stateHash&&c.actions===v.actionHash&&key(c)===v.proofHash);
   assert.deepEqual(c.sourceHashes,sourceHashes);assert(c.terminalEffect&&!c.openRules.length&&!c.openGrowth&&!c.unknownRules.length&&!c.unknownResearchFields.length);
   // Restore the pre-quotient set so representatives are chosen globally.
   const {equivalentTo,equivalentPair,...raw}=v;witnesses[id]={...raw,status:"FINAL_CLOSED"};
  }else witnesses[id]=v;
 }
 for(const r of d.ogreRegression||[])regressions.set(key(r),r);
 sourceBatches.push({name,hash:key(d),offset,limit,...(d.batch.indices?{indicesHash:key(indices)}:{}),pairs:expected.length,witnesses:refs.length});
}
for(const line of prep.researchLineRows){
 if(!seen.has(line.id))continue;
 const refs=[line,...line.alternatives].filter(r=>witnesses[r.routeId]?.status==="FINAL_CLOSED").map(r=>({...r,closureProofHash:witnesses[r.routeId].proofHash}));
 if(refs.length){const primary=refs.find(r=>r.routeId===line.routeId)||refs[0];rows.push({...line,...primary,alternatives:refs.filter(r=>r!==primary)});}
}
const order=id=>ledger.routes[id].order;
function shorterRepeat(a,b){
 const x=order(a),y=order(b);if(x.length>=y.length)return false;
 const used=new Set(x);let i=0;for(const k of y){if(i<x.length&&x[i]===k)i++;else if(!used.has(k))return false;}return i===x.length;
}
const kept=[],equivalent=[],rawClosedCombinations=rows.length;
const effect=id=>witnesses[id].certificate.terminalEffect;
for(const row of rows.slice().sort((a,b)=>order(a.routeId).length-order(b.routeId).length||a.id.localeCompare(b.id))){
 const refs=[row,...row.alternatives],master=kept.find(k=>refs.every(r=>[k,...k.alternatives].some(q=>effect(q.routeId)===effect(r.routeId)&&shorterRepeat(q.routeId,r.routeId))));
 if(!master){kept.push(row);continue;}
 equivalent.push({pair:row.id,representative:master.id,routes:refs.map(r=>r.routeId)});
 for(const r of refs){const q=[master,...master.alternatives].find(q=>effect(q.routeId)===effect(r.routeId)&&shorterRepeat(q.routeId,r.routeId));witnesses[r.routeId]={...witnesses[r.routeId],status:"FINAL_EQUIVALENT",equivalentTo:q.routeId,equivalentPair:master.id};}
}
for(const r of regressions.values())if(witnesses[r.from])assert.notEqual(witnesses[r.from].status,"FINAL_CLOSED","Ogre intermediate admitted");
const complete=seen.size===prep.plan.length;
if(complete){assert.equal(Object.keys(witnesses).length,prep.summary.researchLineWitnesses);assert(regressions.size,"Missing Ogre regression");}
const prior=new Set(prep.previousPublicPairIds),finalIds=new Set(kept.map(r=>r.id)),repaired=new Map();
for(const r of prep.candidateReceipts)if(r.priorPair&&["FINAL_CLOSED","FINAL_EQUIVALENT"].includes(witnesses[r.routeId]?.status))repaired.set(r.priorPair,{priorPair:r.priorPair,replacementPair:witnesses[r.routeId].equivalentPair||witnesses[r.routeId].pairId,routeId:r.routeId});
const priorStatus=prep.previousPublicPairIds.map(id=>({id,status:finalIds.has(id)?"RETAINED":repaired.has(id)?"REPLACEMENT_CANDIDATE":seen.has(id)?"NOT_CLOSED_V10":"UNPROCESSED",replacement:repaired.get(id)||null}));
const counts={};for(const v of Object.values(witnesses))counts[v.status]=(counts[v.status]||0)+1;
const summary={planPairs:prep.plan.length,processedPairs:seen.size,unprocessedPairs:prep.plan.length-seen.size,processedWitnesses:Object.keys(witnesses).length,rawClosedCombinations,equivalentCombinations:equivalent.length,conditionalClosedPairs:kept.length,previousPublicPairs:prior.size,priorRetained:priorStatus.filter(x=>x.status==="RETAINED").length,priorReplacementCandidates:repaired.size,priorUnprocessed:priorStatus.filter(x=>x.status==="UNPROCESSED").length,priorNotClosed:priorStatus.filter(x=>x.status==="NOT_CLOSED_V10").length,counts,complete,officialFinalAdded:0};
const inventory=packBodyScopeInventory(witnesses);
const out={schema:"ATLAS_VO2_FULL_FINAL_MERGE_V1",sourceMetadataSha256:prep.sourceMetadataSha256,sourceGraphSha256:prep.sourceGraphSha256,preparedHash:manifest.preparedHash,planHash:prep.planHash,materialBudgetHash:prep.materialBudget.sha256,sourceHashes,summary,sourceBatches,priorStatus,unprocessed:prep.plan.map((p,i)=>({i,...p})).filter(p=>!seen.has(p.id)).map(({i,id,priority,body})=>({i,id,priority,body})),admission:{schema:FINAL_SCHEMA,sourceMetadataSha256:prep.sourceMetadataSha256,sourceGraphSha256:prep.sourceGraphSha256,sourceHashes,rows:kept,witnesses,inventory,equivalent,ogreRegression:[...regressions.values()]},publicationReady:false,scope:"Staged global repeat quotient over processed pairs. Complete plan and independent public registry reconstruction required."};
const file=stage+"vo2-final-merged.json.gz";fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(out),{level:4}));fs.renameSync(file+".tmp",file);
const report={...out};delete report.admission;delete report.unprocessed;report.mergeHash=key(out);report.nextOffsets=out.unprocessed.slice(0,12).map(p=>p.i);
fs.writeFileSync("tools/data/overcap-vo2-final-merge-progress-"+body+".json",JSON.stringify(report)+"\n");
console.log(JSON.stringify({file,summary,nextOffsets:report.nextOffsets,mergeHash:report.mergeHash}));
