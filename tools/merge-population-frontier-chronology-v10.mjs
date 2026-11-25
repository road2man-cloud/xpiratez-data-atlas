// Strict append-only union of concurrent bounded and full-horizon producers.
// Refuse any conflicting identity rather than overwrite published evidence.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {MODEL,LEDGER,sourceIdentity,chronologicalBaseline,pairKey} from "./population-frontier-chronology-core.mjs";
import {key,sha,dominates} from "./population-research-career-core.mjs";
import {HORIZON_POLICY} from "./population-full-horizon-proposals.mjs";
const read=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const db=read("public/data/branch-soldier-results.json.gz"),published=db[LEDGER];
const input=process.argv[2]||"population-frontier-chronology-v10.json.gz",output=process.argv[3]||"population-frontier-chronology-v10-merged.json.gz",incoming=read(input);
const source=sourceIdentity(db),{baseline:baseId,...stable}=source;
function validate(a){
 assert.equal(a.model,MODEL);assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
 const {baseline:b,...s}=a.source;assert.deepEqual(stable,s);
 assert.equal(a.fingerprint,key([MODEL,a.sourceMetadataSha256,s,a.hashes]));
 for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
}
validate(published);validate(incoming);
assert.deepEqual(published.cacheHashes,incoming.cacheHashes);
function union(a={},b={},label="record"){
 const out={...a};for(const [k,v] of Object.entries(b)){if(Object.hasOwn(out,k))assert.deepEqual(out[k],v,"Conflicting "+label+" "+k);else out[k]=v;}return out;
}
const hashes=union(published.hashes,incoming.hashes,"producer hash");
const self="tools/merge-population-frontier-chronology-v10.mjs";hashes[self]=sha(fs.readFileSync(self,"utf8").replace(/\r\n/g,"\n"));
const fingerprint=key([MODEL,db.sourceMetadataSha256,stable,hashes]);
const fields=["routes","attempts","adaptedAttempts","recoveryAttempts","rankDefaultAttempts","chainAttempts","chainAliases","horizonAliases"];
const merged=Object.fromEntries(fields.map(k=>[k,union(published[k],incoming[k],k)]));
const {routes,chainAttempts,chainAliases}=merged;
for(const [id,r] of Object.entries(routes)){
 if(r.sourceKind==="BIRTH_RESEARCH_CHAIN")assert(routes[r.chainParent],"Missing predecessor "+id);
}
const templates={...published.templates};
for(const [k,vs] of Object.entries(incoming.templates||{})){
 const list=[...(templates[k]||[])];for(const v of vs)if(!list.some(x=>x.hash===v.hash))list.push(v);
 templates[k]=list.slice(0,6);
}
const all=Object.values(routes),base=chronologicalBaseline(db),improved=all.filter(r=>!(base.get(pairKey(r))||[]).some(v=>dominates(v,r.permanentVector)));
const chainDepths={},boundedDepths={},horizonDepths={};
for(const r of all)if(r.sourceKind==="BIRTH_RESEARCH_CHAIN"){
 chainDepths[r.order.length]=(chainDepths[r.order.length]||0)+1;const m=r.horizonPolicy===HORIZON_POLICY?horizonDepths:boundedDepths;m[r.order.length]=(m[r.order.length]||0)+1;
}
const summary={...published.summary,...incoming.summary,registeredRoutes:all.length,newRoutes:all.length-Object.keys(published.routes).length,improvedRoutes:improved.length,improvedPairs:new Set(improved.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(improved.map(pairKey)).size,newTerminalPairBodies:new Set(improved.filter(r=>!base.has(pairKey(r))).map(pairKey)).size,exactNumericMatches:all.filter(r=>r.numericExactMatch).length,additionalResearchRoutes:all.filter(r=>r.addedResearch.length).length,researchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,chainDepths,boundedDepths,horizonDepths,chainRoutes:all.filter(r=>r.sourceKind==="BIRTH_RESEARCH_CHAIN").length,chainAttempts:Object.keys(chainAttempts).length,chainAliasCount:Object.keys(chainAliases).length,horizonRoutes:all.filter(r=>r.horizonPolicy===HORIZON_POLICY).length,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
if(published.summary.horizonRound){summary.horizonRound=published.summary.horizonRound;summary.horizonPending=published.summary.horizonPending;}
const migration={kind:"WORKLIST_AND_PREFIX_ONLY",fromFingerprint:published.fingerprint,fromRoutes:Object.keys(published.routes).length,fromAttempts:Object.keys(published.attempts).length};
const mergeReceipt={publishedFingerprint:published.fingerprint,incomingFingerprint:incoming.fingerprint,incomingSha256:sha(fs.readFileSync(input)),importedRoutes:summary.newRoutes,preservedPublishedRoutes:migration.fromRoutes};
const {published:ids,comparisons,careerEnvelopeConflicts,file,bytes,sha256,...clean}=published;
const result={...clean,...merged,fingerprint,source,hashes,migration,templates,expansionInputs:[...new Set([...(published.expansionInputs||[]),...(incoming.expansionInputs||[])])],summary,mergeReceipts:[...(published.mergeReceipts||[]),mergeReceipt],scope:"Combined append-only bounded six-stage and full-horizon conditional deterministic live chronology; actual game optimum not certified."};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify({output,registeredRoutes:summary.registeredRoutes,chainRoutes:summary.chainRoutes,chainDepths,boundedDepths,horizonDepths,horizonRoutes:summary.horizonRoutes,chainAliasCount:summary.chainAliasCount,...mergeReceipt}));
