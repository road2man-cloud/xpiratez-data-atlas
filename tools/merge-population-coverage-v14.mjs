// Merge coverage work with concurrent rank-horizon results. Preserve all evidence.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {MODEL,LEDGER,sourceIdentity,chronologicalBaseline,pairKey,birthCatalog} from "./population-frontier-chronology-core.mjs";
import {key,sha,dominates} from "./population-research-career-core.mjs";
import {coverageIndex} from "./population-frontier-coverage-seeds.mjs";
import {routePlateauSummary} from "./population-frontier-plateau-scheduler.mjs";
import {HORIZON_POLICY} from "./population-full-horizon-proposals.mjs";
const read=p=>JSON.parse(gunzipSync(fs.readFileSync(p))),db=read("public/data/branch-soldier-results.json.gz"),published=db[LEDGER];
const input=process.argv[2]||"population-frontier-chronology-v14.json.gz",output=process.argv[3]||"population-frontier-chronology-v14-merged.json.gz",incoming=read(input);
const source=sourceIdentity(db),{baseline,...stable}=source;
for(const a of [published,incoming]){
 assert.equal(a.model,MODEL);assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
 const {baseline:b,...s}=a.source;assert.deepEqual(s,stable);assert.equal(a.fingerprint,key([MODEL,a.sourceMetadataSha256,s,a.hashes]));
 for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
}
assert.deepEqual(published.cacheHashes,incoming.cacheHashes);
function union(a={},b={},label="record"){const out={...a};for(const [k,v] of Object.entries(b)){if(Object.hasOwn(out,k))assert.deepEqual(out[k],v,"Conflict "+label+" "+k);else out[k]=v;}return out;}
const hashes=union(published.hashes,incoming.hashes,"hash"),self="tools/merge-population-coverage-v14.mjs";hashes[self]=sha(fs.readFileSync(self,"utf8").replace(/\r\n/g,"\n"));
const fields=["routes","attempts","chainAttempts","chainAliases","unifiedReuses","adaptedAttempts","rankDefaultAttempts","recoveryAttempts","rankHorizonAttempts"];
const merged=Object.fromEntries(fields.map(k=>[k,union(published[k],incoming[k],k)])),{routes,attempts,chainAttempts,unifiedReuses}=merged;
const all=Object.values(routes),base=chronologicalBaseline(db),improved=all.filter(r=>!(base.get(pairKey(r))||[]).some(v=>dominates(v,r.permanentVector)));
const chainDepths={},horizonDepths={};for(const r of all){if(r.sourceKind==="BIRTH_RESEARCH_CHAIN")chainDepths[r.order.length]=(chainDepths[r.order.length]||0)+1;if(r.horizonPolicy===HORIZON_POLICY)horizonDepths[r.order.length]=(horizonDepths[r.order.length]||0)+1;}
const rankFields=Object.fromEntries(Object.entries(published.summary).filter(([k])=>k.startsWith("rankHorizon")));
const coverage=coverageIndex(routes,birthCatalog(db)).summary;
const summary={...published.summary,...incoming.summary,...rankFields,registeredRoutes:all.length,newRoutes:all.length-Object.keys(published.routes).length,improvedRoutes:improved.length,improvedPairs:new Set(improved.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(improved.map(pairKey)).size,newTerminalPairBodies:new Set(improved.filter(r=>!base.has(pairKey(r))).map(pairKey)).size,exactNumericMatches:all.filter(r=>r.numericExactMatch).length,additionalResearchRoutes:all.filter(r=>r.addedResearch.length).length,researchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,chainRoutes:all.filter(r=>r.sourceKind==="BIRTH_RESEARCH_CHAIN").length,chainAttempts:Object.keys(chainAttempts).length,chainDepths,horizonDepths,horizonRoutes:all.filter(r=>r.horizonPolicy===HORIZON_POLICY).length,unifiedReuseCount:Object.keys(unifiedReuses).length,plateauSummary:routePlateauSummary(routes),coverage,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
const templates={...published.templates};for(const [k,vs] of Object.entries(incoming.templates||{})){const list=[...(templates[k]||[])];for(const v of vs)if(!list.some(x=>x.hash===v.hash))list.push(v);templates[k]=list.slice(0,6);}
const fingerprint=key([MODEL,db.sourceMetadataSha256,stable,hashes]),migration={kind:"WORKLIST_AND_PREFIX_ONLY",fromFingerprint:published.fingerprint,fromRoutes:Object.keys(published.routes).length,fromAttempts:Object.keys(published.attempts).length};
const {published:ids,comparisons,careerEnvelopeConflicts,file,bytes,sha256,...clean}=published;
const result={...clean,...merged,fingerprint,source,hashes,migration,templates,summary,branchGates:incoming.branchGates,gateRefs:incoming.gateRefs,scope:"Intermediate conditional birth/chronology witnesses only; no final career comparison certified.",coverageImports:[...(published.coverageImports||[]),{fingerprint:incoming.fingerprint,importedRoutes:summary.newRoutes,artifactSha256:sha(fs.readFileSync(input))}]};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);console.log(JSON.stringify({output,registeredRoutes:summary.registeredRoutes,newRoutes:summary.newRoutes,coverage,rankHorizonRoutes:summary.rankHorizonRoutes}));
