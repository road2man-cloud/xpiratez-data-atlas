// Merge chronological research-continuation output into a newer shared registry.
// Only the owned ledger, its witness records and its summary/source/policy change.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
const key=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const file="public/data/branch-soldier-results.json.gz",snapshot=process.argv[2];
assert(snapshot,"Usage: node tools/attach-population-research-continuation.mjs <generated-registry.gz>");
const db=decode(file),src=decode(snapshot),a=src.originResearchContinuation,u=db.originUnlockSearch,e=db.originEventBirth;
assert(a&&u&&e&&a.kind==="POPULATION_RESEARCH_CONTINUATION");
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(a.unlockFingerprint,u.fingerprint);assert.equal(a.eventFingerprint,e.fingerprint);
assert.equal(a.fingerprint,key([db.sourceMetadataSha256,u.fingerprint,e.fingerprint,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(createHash("sha256").update(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")).digest("hex"),h,"Dependency drift "+p);
const old=db.originResearchContinuation;
if(old){assert.equal(old.fingerprint,a.fingerprint);for(const k of ["routes","attempts"])for(const [id,r] of Object.entries(old[k]||{}))assert.deepEqual(a[k]?.[id],r,"Lost prior evidence "+id);for(const [id,n] of Object.entries(old.visits||{}))assert((a.visits[id]||0)>=n,"Lost visit "+id);}
const before=Object.keys(db.witnesses).length,valid=v=>Array.isArray(v)&&v.length===db.stats.length&&v.every(Number.isSafeInteger),branches=new Map(db.branches.map(b=>[b.id,b]));
assert.equal(a.published.length,Object.keys(a.routes).length);assert.equal(new Set(a.published).size,a.published.length);
assert.equal(a.summary.registeredRoutes,a.published.length);assert.equal(a.summary.actualGameCertified,0);assert.equal(a.summary.globalOptimalCertified,0);
for(const id of a.published){
 const r=a.routes[id],w=src.witnesses[id];assert(r&&w&&w.source==="POPRESEARCH12"&&r.actualGameCertified===false&&w.actualGameCertified===false);
 const p=r.kind==="unlock"?u.pairs[r.pair]:e.variants[r.input.slice(6)];assert(p&&p.origin===r.origin&&p.branch===r.branch&&p.root===r.root);
 assert(branches.has(r.branch)&&!branches.get(r.branch).sourceRootConflict);
 assert.equal(r.input,r.kind==="unlock"?"unlock:"+r.pair:"event:"+p.id);
 const root=(r.kind==="unlock"?u:e).roots[p.root].actions,full=r.kind==="unlock"?[...root,...p.suffix]:[...root.slice(0,p.insertionAt),...p.extraBeforeBirth,...p.inserted,...root.slice(p.insertionAt)];
 assert.equal(key(full),r.birthActionHash);assert.equal(r.birthActionHash,p.fullActionHash);assert.equal(r.birthStateHash,p.stateHash);
 assert.equal(key([...full,...r.actions]),r.fullActionHash);assert.equal(id,"PXR12:"+key([r.input,r.actions]).slice(0,24));
 assert(r.allowedDifficulties.length&&r.allowedDifficulties.every(x=>p.allowedDifficulties.includes(x)));
 assert.deepEqual(r.order,r.actions.filter(x=>x.type==="transform").map(x=>x.transform));assert(r.order.length===1&&r.missing.length&&r.actions.length>1);
 assert([r.raw,r.bonus,r.vector,r.capRaw,r.capVector,w.raw,w.bonus,w.vector].every(valid));
 assert.deepEqual(w.branchIds,[r.branch]);assert.equal(w.originProfile,r.origin);assert.equal(w.body,r.body);
 assert.deepEqual(w.raw,r.capRaw);assert.deepEqual(w.bonus,r.bonus);assert.deepEqual(w.vector,r.capVector);assert.deepEqual(w.steps,r.order.map(id=>({id,count:1})));
 assert.equal(w.populationResearch.route,id);assert.equal(w.populationResearch.fullActionHash,r.fullActionHash);
 const pctx=r.kind==="unlock"?w.populationUnlock:w.populationEvent;assert(pctx);assert.deepEqual(pctx.actions,r.actions);assert.deepEqual(pctx.rawBeforeFinalGrowth,r.raw);
 if(r.kind==="unlock")assert.equal(pctx.pair,r.pair);else assert.equal(pctx.variant,p.id);
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],w,"Witness collision "+id);
 db.witnesses[id]=w;
}
db.originResearchContinuation=a;db.summary.originResearchContinuation=a.summary;db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPRESEARCH12=src.sources.POPRESEARCH12;db.policies.POPRESEARCH12=src.policies.POPRESEARCH12;
fs.writeFileSync(file+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({published:a.published.length,newWitnesses:Object.keys(db.witnesses).length-before,registeredWitnesses:db.summary.registeredWitnesses,branches:a.summary.registeredBranches}));
