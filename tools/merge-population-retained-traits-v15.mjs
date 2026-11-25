// Merge a general retained-trait search batch into an append-only birth catalog.
// Reject concurrent changes to the frontier ledger rather than overwrite them.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {MODEL,LEDGER,birthCatalog,sourceIdentity} from "./population-frontier-chronology-core.mjs";
import {sha,key} from "./population-research-career-core.mjs";
import {proveBirthAppendV2} from "./population-birth-append-v2.mjs";
import {coverageIndex,orderMissing} from "./population-frontier-coverage-seeds.mjs";
import {RETAINED_POLICY,retainedSummary} from "./population-retained-trait-scheduler.mjs";
const read=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const db=read("public/data/branch-soldier-results.json.gz"),old=db[LEDGER],incoming=read(process.argv[2]||"population-frontier-chronology-v15.json.gz"),out=process.argv[3]||"population-frontier-chronology-v15-merged.json.gz";
const source=sourceIdentity(db),{baseline,...stable}=source;
for(const a of [old,incoming]){
 assert.equal(a.model,MODEL);assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
 const {baseline:b,...s}=a.source;assert.equal(a.fingerprint,key([MODEL,a.sourceMetadataSha256,s,a.hashes]));
 if(s.births!==stable.births)proveBirthAppendV2(db,a);else assert.deepEqual(s,stable);
 for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
}
assert.deepEqual(old.cacheHashes,incoming.cacheHashes);
const hashes={...old.hashes,...incoming.hashes};for(const [p,h] of Object.entries(old.hashes))assert.equal(hashes[p],h,"Producer conflict "+p);
for(const p of ["tools/merge-population-retained-traits-v15.mjs","tools/population-birth-append-v2.mjs"])hashes[p]=sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
for(const field of ["routes","attempts","adaptedAttempts","recoveryAttempts","rankDefaultAttempts","chainAttempts","chainAliases","unifiedReuses","rankHorizonAttempts"])for(const [id,r] of Object.entries(old[field]||{}))assert.deepEqual(incoming[field]?.[id],r,"Concurrent ledger change "+field+" "+id);
assert.equal(incoming.summary.retainedTraitPolicy,RETAINED_POLICY);
const routes=incoming.routes,traitSummary=retainedSummary(routes);assert.deepEqual(traitSummary,incoming.summary.retainedTraitSummary);
const birthAppend=old.source.births!==stable.births?proveBirthAppendV2(db,old):null,births=birthCatalog(db);
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const coverage=coverageIndex(routes,births),coverageBefore=coverageIndex(old.routes,births).summary;
const summary={...incoming.summary,birthInputs:births.length,coverage:coverage.summary,coverageBefore,coverageSeedRemaining:orderMissing(coverage,incoming.attempts,db,data).length,newRoutes:Object.keys(routes).length-Object.keys(old.routes).length};
const fingerprint=key([MODEL,db.sourceMetadataSha256,stable,hashes]),migration={kind:birthAppend?"APPEND_ONLY_BIRTH_CATALOG_V2":"WORKLIST_AND_PREFIX_ONLY",fromFingerprint:old.fingerprint,fromRoutes:Object.keys(old.routes).length,fromAttempts:Object.keys(old.attempts).length,...(birthAppend?{birthAppend}:{})};
const {published:ids,comparisons,careerEnvelopeConflicts,file,bytes,sha256,...clean}=incoming;
const result={...clean,source,fingerprint,hashes,migration,summary,expansionInputs:[...new Set([...(incoming.expansionInputs||[]),...(birthAppend?.added||[]).map(t=>t[0])])],retainedTraitImports:[...(old.retainedTraitImports||[]),{from:incoming.fingerprint,added:summary.newRoutes,preserved:migration.fromRoutes,births:births.length}]};
fs.writeFileSync(out+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(out+".tmp",out);
console.log(JSON.stringify({out,added:summary.newRoutes,preserved:migration.fromRoutes,births:births.length,coverage:summary.coverage,measured:traitSummary.measured,gained:traitSummary.gained,maxTraits:traitSummary.maxTraits}));
