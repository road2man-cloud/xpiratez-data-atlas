// Import default-rank continuation evidence into the latest append-only ledger.
// Keep unrelated concurrent routes, summaries, and all historical evidence.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {MODEL,LEDGER,sourceIdentity,chronologicalBaseline,pairKey} from "./population-frontier-chronology-core.mjs";
import {key,sha,dominates} from "./population-research-career-core.mjs";
import {RANK_HORIZON} from "./population-rank-horizon-proposals.mjs";
import {routePlateauSummary} from "./population-frontier-plateau-scheduler.mjs";
import {TRAIT_PRIORITY,rankTraitSummary} from "./population-rank-trait-priority.mjs";
import {birthCatalog} from "./population-frontier-chronology-core.mjs";
import {coverageIndex} from "./population-frontier-coverage-seeds.mjs";
const read=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const db=read("public/data/branch-soldier-results.json.gz"),published=db[LEDGER];
const input=process.argv[2]||"population-rank-horizon.json.gz",output=process.argv[3]||"population-rank-horizon-merged.json.gz",incoming=read(input);
const source=sourceIdentity(db),{baseline,...stable}=source;
for(const a of [published,incoming]){
 assert.equal(a.model,MODEL);assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
 const {baseline:b,...s}=a.source;assert.deepEqual(s,stable);
 assert.equal(a.fingerprint,key([MODEL,a.sourceMetadataSha256,s,a.hashes]));
 for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
}
assert.deepEqual(published.cacheHashes,incoming.cacheHashes);
assert.equal(incoming.rankHorizonPolicy?.id,RANK_HORIZON);
if(published.rankHorizonPolicy)assert.deepEqual(published.rankHorizonPolicy,incoming.rankHorizonPolicy);
const routes={...published.routes},rankHorizonAttempts={...published.rankHorizonAttempts},hashes={...published.hashes};
for(const [p,h] of Object.entries(incoming.hashes)){if(hashes[p])assert.equal(hashes[p],h,"Hash conflict "+p);else hashes[p]=h;}
const self="tools/merge-population-rank-traits.mjs";hashes[self]=sha(fs.readFileSync(self,"utf8").replace(/\r\n/g,"\n"));
let imported=0;
for(const [id,r] of Object.entries(incoming.routes)){
 if(routes[id])assert.deepEqual(routes[id],r,"Route conflict "+id);
 else{assert.equal(r.rankHorizonPolicy,RANK_HORIZON);assert.equal(r.actualGameCertified,false);routes[id]=r;imported++;}
}
for(const [id,t] of Object.entries(incoming.rankHorizonAttempts)){
 if(rankHorizonAttempts[id])assert.deepEqual(rankHorizonAttempts[id],t,"Attempt conflict "+id);
 else rankHorizonAttempts[id]=t;
}
for(const r of Object.values(routes))if(r.chainParent)assert(routes[r.chainParent]);
const templates={...published.templates};
for(const [k,vs] of Object.entries(incoming.templates||{})){
 const list=[...(templates[k]||[])];for(const v of vs)if(!list.some(x=>x.hash===v.hash))list.push(v);
 templates[k]=list.slice(0,6);
}
const all=Object.values(routes),base=chronologicalBaseline(db),improved=all.filter(r=>!(base.get(pairKey(r))||[]).some(v=>dominates(v,r.permanentVector))),chainDepths={},rankHorizonDepths={};
for(const r of all){if(r.sourceKind==="BIRTH_RESEARCH_CHAIN")chainDepths[r.order.length]=(chainDepths[r.order.length]||0)+1;if(r.rankHorizonPolicy===RANK_HORIZON)rankHorizonDepths[r.order.length]=(rankHorizonDepths[r.order.length]||0)+1;}
const summary={...published.summary,registeredRoutes:all.length,newRoutes:imported,improvedRoutes:improved.length,improvedPairs:new Set(improved.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(improved.map(pairKey)).size,newTerminalPairBodies:new Set(improved.filter(r=>!base.has(pairKey(r))).map(pairKey)).size,exactNumericMatches:all.filter(r=>r.numericExactMatch).length,additionalResearchRoutes:all.filter(r=>r.addedResearch.length).length,researchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,chainRoutes:all.filter(r=>r.sourceKind==="BIRTH_RESEARCH_CHAIN").length,chainDepths,rankHorizonRound:incoming.summary.rankHorizonRound,rankHorizonPending:incoming.summary.rankHorizonPending,rankHorizonAttempts:Object.keys(rankHorizonAttempts).length,rankHorizonRoutes:all.filter(r=>r.rankHorizonPolicy===RANK_HORIZON).length,rankHorizonDepths,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
if(summary.plateauPolicy)summary.plateauSummary=routePlateauSummary(routes);
if(summary.coveragePolicy)summary.coverage=coverageIndex(routes,birthCatalog(db)).summary;
assert.equal(incoming.summary.rankTraitPolicy,TRAIT_PRIORITY);summary.rankTraitPolicy=TRAIT_PRIORITY;summary.rankTraitRound=incoming.summary.rankTraitRound;summary.rankTraitSummary=rankTraitSummary(routes);
const fingerprint=key([MODEL,db.sourceMetadataSha256,stable,hashes]),migration={kind:"WORKLIST_AND_PREFIX_ONLY",fromFingerprint:published.fingerprint,fromRoutes:Object.keys(published.routes).length,fromAttempts:Object.keys(published.attempts).length};
const {published:ids,comparisons,careerEnvelopeConflicts,file,bytes,sha256,...clean}=published;
const result={...clean,fingerprint,source,hashes,migration,routes,rankHorizonAttempts,rankHorizonPolicy:incoming.rankHorizonPolicy,templates,summary,rankHorizonImports:[...(published.rankHorizonImports||[]),{fingerprint:incoming.fingerprint,artifactSha256:sha(fs.readFileSync(input)),importedRoutes:imported,preservedRoutes:migration.fromRoutes}]};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify({output,imported,preserved:migration.fromRoutes,registeredRoutes:all.length,rankHorizonRoutes:summary.rankHorizonRoutes,rankHorizonDepths,rankHorizonPending:summary.rankHorizonPending,rankTraitSummary:summary.rankTraitSummary}));
