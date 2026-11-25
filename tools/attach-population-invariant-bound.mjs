// Publish the inductive numeric bound and its repeat proof without changing
// existing campaign evidence or full-game completion counters.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const decode=b=>JSON.parse(gunzipSync(b));
const registry="public/data/branch-soldier-results.json.gz";
const file="soldier-population-invariant-bound-v2.json.gz";
const bb=fs.readFileSync("public/data/"+file),a=decode(bb),db=decode(fs.readFileSync(registry)),p=db.populationSearch;
assert.equal(a.kind,"POPULATION_INDUCTIVE_UPPER_BOUND");
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
assert.deepEqual(a.origins,p.origins);assert.deepEqual(a.branches,p.branches);assert.deepEqual(a.stats,db.stats);
assert.equal(a.identity,key([db.sourceMetadataSha256,a.hashes,p.origins,p.branches]));
for(const [path,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(path,"utf8").replace(/\r\n/g,"\n")),h,"Bound source changed "+path);
const rb=fs.readFileSync("public/data/"+a.repeatProof.file),r=decode(rb);
assert.equal(sha(rb),a.repeatProof.sha256);assert.equal(rb.length,a.repeatProof.bytes);
assert.equal(r.kind,"POPULATION_REPEAT_UPPER_PROOF");assert.equal(r.identity,a.identity);
assert.equal(r.sourceMetadataSha256,a.sourceMetadataSha256);assert.deepEqual(r.hashes,a.hashes);
assert.deepEqual(r.summary,a.repeatProof.summary);assert.deepEqual(r.summary,a.summary.repeat);
assert.deepEqual(r.rows.map(x=>x.rule),a.rules);assert.equal(r.origins.length,72);assert.equal(new Set(r.origins).size,72);
assert.equal(a.proof.globalCampaign,false);assert.equal(a.proof.everyRelaxedTransitionBounded,true);
for(const k of ["fullCompleted","globalOptimalCertified","actualGameCertified","globalImpossible"])assert.equal(a.summary[k],0);
assert.equal(a.summary.pairCount,p.origins.length*p.branches.length);
assert.equal(a.summary.coveredUpperBoundPairs,a.summary.pairCount);
assert.equal(a.summary.independentOriginGroups,a.groups.length);
assert.equal(a.rows.length,p.origins.length);assert.deepEqual(a.rows.map(x=>x.origin),p.origins);
const validVector=v=>Array.isArray(v)&&v.length===db.stats.length&&v.every(Number.isSafeInteger);
const groups=a.groups.map(g=>{
 const x=g.result;
 assert([x.rawMax,x.effectiveMax,x.bonusUpper,x.iniLo,x.iniHi,x.birth].every(validVector));
 assert(x.layers.length>0&&x.bounds.length>0);
 assert.equal(x.bounds.length,new Set(x.bounds.map(b=>b.body)).size);
 for(const b of x.bounds){
  assert(validVector(b.raw)&&validVector(b.effective));
  assert.deepEqual(b.effective,b.raw.map((n,i)=>n+x.bonusUpper[i]));
  assert(x.layers.filter(l=>l.body===b.body).every(l=>l.raw.every((n,i)=>n<=b.raw[i])));
 }
 assert.deepEqual(x.rawMax,db.stats.map((_,i)=>Math.max(...x.bounds.map(b=>b.raw[i]))));
 assert.deepEqual(x.effectiveMax,x.rawMax.map((n,i)=>n+x.bonusUpper[i]));
 assert.equal(x.trackedRules.length,x.countLimits.length);
 assert(x.layers.every(l=>validVector(l.raw)&&l.counts.length===x.countLimits.length&&l.counts.every((n,i)=>Number.isSafeInteger(n)&&n>=0&&n<=x.countLimits[i])));
 return {signature:g.signature,body:x.body,rawMax:x.rawMax,effectiveMax:x.effectiveMax,bonusUpper:x.bonusUpper,bounds:x.bounds,repeatCaps:x.repeatCaps,trackedRules:x.trackedRules,countLimits:x.countLimits,layers:x.layers.length};
});
const used=new Set();
for(const row of a.rows){
 assert(groups[row.group]);used.add(row.group);
 const i=r.origins.indexOf(row.origin);assert(i>=0);
 assert.deepEqual(groups[row.group].repeatCaps,Object.fromEntries(r.rows.map(t=>[t.rule,t.bounds[i]])));
}
assert.equal(used.size,groups.length);
const originIndex=Object.fromEntries(a.rows.map(x=>[x.origin,x.group]));
db.populationInvariantBound={schemaVersion:1,model:"ALL_RESEARCH_RELAXED_REPEAT_BOX_V2",identity:a.identity,sourceMetadataSha256:a.sourceMetadataSha256,
 file,bytes:bb.length,sha256:sha(bb),repeatProof:a.repeatProof,scope:a.scope,proof:a.proof,summary:a.summary,origins:a.origins,branches:a.branches,originIndex,groups};
db.summary.populationInvariantBound=a.summary;
db.sources.POPINVARIANT12={file:"tools/build-population-invariant-bound.mjs",fingerprint:a.identity,sourceMetadataSha256:a.sourceMetadataSha256,asset:file,sha256:sha(bb)};
db.policies.POPINVARIANT12="모든 연구 허용의 낙관적 정수 상자 고정점과 병종·이력 반복 횟수 상계. 12능력치별 독립 상계이며 도달 가능한 단일 능력치 벡터나 실제 게임 전역 최적성·불가능 증명이 아님.";
fs.writeFileSync(registry+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(registry+".tmp",registry);
console.log(JSON.stringify({file,sha256:sha(bb),bytes:bb.length,repeat:a.repeatProof,summary:a.summary,registeredWitnesses:db.summary.registeredWitnesses}));
