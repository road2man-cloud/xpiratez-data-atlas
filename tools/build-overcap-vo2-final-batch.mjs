// Resumable full-registry v10 admission. Every batch sees ALL descendants of
// its source graphs; no limited batch is allowed to declare a global final table.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
import {createSharedCareerReplay} from "./population-shared-lifecycle-replay.mjs";
import {hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {hydrateSharedCareerSections} from "../public/branch-soldier-registry-shared.js";
import {unpackBodyScopeWitness} from "../public/branch-soldier-final-scope-codec.js";
import {classifyFinalCareers} from "./atlas-final-career-admission-v10-vo2-irreversible.mjs";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const body=process.argv.find(x=>x.startsWith("--body="))?.slice(7)||"POD_REPAIR";
const offset=Number(process.argv.find(x=>x.startsWith("--offset="))?.slice(9)||0),limit=Number(process.argv.find(x=>x.startsWith("--limit="))?.slice(8)||6);
assert(/^[A-Z0-9_]+$/.test(body)&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0);
const stage="tools/data/overcap-intake-stage-"+body+"/";
const prep=decode(stage+"vo2-full-prepared.json.gz"),manifest=read("tools/data/overcap-vo2-full-prepared-manifest-"+body+".json");
assert.equal(prep.schema,"ATLAS_VO2_FULL_PREPARED_V1");assert.equal(key(prep),manifest.preparedHash);assert.equal(key(prep.plan),manifest.planHash);
const ledger=decode(stage+"soldier-population-missing-origin-career.json.gz");
assert.equal(key(ledger.graphs),prep.sourceGraphSha256);assert.equal(ledger.sourceGraphSha256,prep.sourceGraphSha256);
const db=hydrateSharedCareerSections(hydrateResearchPaths(decode("public/data/branch-soldier-results.json.gz")));
assert.equal(db.sourceMetadataSha256,prep.sourceMetadataSha256);assert.equal(db.careerCompletion.researchTraitSets.sourceGraphSha256,prep.baseGraphHash);
const data=read("public/data/soldiers-modern-index.json"),catalog=read("public/data/soldier-source-catalog.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(catalog.itemIds);
assert.equal(data.meta.source.metadataSha256,prep.sourceMetadataSha256);assert.equal(catalog.sourceVersion,"v.o2");assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
const lines=prep.researchLineRows.slice(offset,offset+limit);assert(lines.length>0);
assert.deepEqual(lines.map(x=>x.id),prep.plan.slice(offset,offset+limit).map(x=>x.id));
const ids=new Set(lines.flatMap(r=>[r,...r.alternatives].map(x=>x.routeId)));
const graphs=new Set([...ids].map(id=>{const r=ledger.routes[id];assert(r);return r.sourceGraph;}));
// The v10 gate examines every descendant node in each selected graph.
// Other graphs are irrelevant to local successor checks, and the cross-
// graph repeat quotient is performed only once during the global merge.
const selected={...ledger,graphs:Object.fromEntries(Object.entries(ledger.graphs).filter(([id])=>graphs.has(id)))};
const c=db.careerCompletion;
c.researchTraitSets=prep.researchTraitSets;c.materialBudget=prep.materialBudget;
c.classifications={...c.classifications,missingbirth:Object.fromEntries([...ids].map(id=>[id,structuredClone(prep.classifications[id])]))};
const final=classifyFinalCareers({db,ledger:selected,data,replay:createSharedCareerReplay(data,ledger.summary),lines,sourceCatalog:catalog,requireFullRegression:false});
assert.deepEqual(Object.keys(final.witnesses).sort(),[...ids].sort());
const witnesses=Object.fromEntries(Object.entries(final.witnesses).map(([id,w])=>[id,unpackBodyScopeWitness(w,final.inventory)]));
for(const [id,v] of Object.entries(witnesses)){
 const r=prep.researchTraitSets.records[id];assert.equal(v.actionHash,r.actionHash);assert.equal(v.stateHash,r.stateHash);assert.equal(v.pairId,r.pairId);
 if(v.certificate){assert.equal(key(v.certificate),v.proofHash);assert.equal(v.certificate.graph,prep.sourceGraphSha256);assert.deepEqual(v.certificate.sourceHashes,final.sourceHashes);}
}
const summary={attemptedPairs:lines.length,attemptedWitnesses:ids.size,localClosedPairs:final.rows.length,localEquivalentPairs:final.equivalent.length,unresolved:Object.values(witnesses).filter(v=>v.status.startsWith("UNRESOLVED")).length,counts:final.summary.counts,officialFinalAdded:0};
const out={schema:"ATLAS_VO2_FULL_FINAL_BATCH_V1",sourceMetadataSha256:prep.sourceMetadataSha256,sourceGraphSha256:prep.sourceGraphSha256,preparedHash:manifest.preparedHash,planHash:prep.planHash,sourceHashes:final.sourceHashes,materialBudgetHash:prep.materialBudget.sha256,batch:{offset,limit,total:prep.plan.length},pairIds:lines.map(r=>r.id),summary,witnesses,ogreRegression:final.summary.ogreRegression,scope:"Local classification; final cross-batch quotient and all-pair coverage required before registry replacement."};
const file=stage+"vo2-final-batch-"+offset+"-"+limit+".json.gz";
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(out),{level:4}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({file,summary,byBody:final.summary.byFinalBody,metrics:final.summary.incremental,hash:key(out)}));
