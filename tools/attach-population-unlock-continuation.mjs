// Incrementally attach exact no-intervening-growth transformation sequences
// and separately labelled relaxed numerical envelopes to the common ledger.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const read=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p))),key=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const file="public/data/branch-soldier-results.json.gz",db=read(file),a=read(process.argv[2]||"population-unlock-continuation.json.gz"),u=db.originUnlockSearch;
assert.equal(a.kind,"POPULATION_UNLOCK_CONTINUATION");assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(a.unlockFingerprint,u.fingerprint);assert.equal(a.summary.actualGameCertified,0);
const old=db.originUnlockContinuation;
if(old){assert.equal(old.fingerprint,a.fingerprint);for(const k of ["routes","models"])for(const [id,r] of Object.entries(old[k]))assert.deepEqual(a[k][id],r,"Lost prior "+id);for(const [id,d] of Object.entries(old.completed))assert((a.completed[id]||0)>=d);}
for(const [id,r] of Object.entries(a.routes)){
 const p=u.pairs[r.pair];assert(p&&p.origin===r.origin&&p.branch===r.branch&&p.root===r.root);
 assert.equal(key([...u.roots[p.root].actions,...p.suffix,...r.actions]),r.fullActionHash);
 assert.deepEqual(r.actions.filter(x=>x.type==="transform").map(x=>x.transform),r.order);
 assert.equal(r.actualGameCertified,false);assert(r.order.length>=2&&r.order.length<=3);
 assert([r.raw,r.bonus,r.vector,r.rawBeforeFinalGrowth].every(v=>v.length===12&&v.every(Number.isSafeInteger)));
 if(r.model){const m=a.models[r.model];assert(m&&m.body===r.body&&m.origin===r.origin);assert.deepEqual(m.order,r.order);assert(m.frontier.every(f=>[f.raw,f.bonus,f.vector].every(v=>v.length===12&&v.every(Number.isSafeInteger))));}
 const w={source:"POPUNLOCKCONT12",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:r.raw,bonus:r.bonus,vector:r.vector,steps:r.order.map(id=>({id,count:1})),placement:"REPLAYED_MIN_BIRTH_AND_TRANSFORMS_THEN_CONDITIONAL_CAP",populationUnlockContinuation:{pair:r.pair,route:id,model:r.model,rawBeforeFinalGrowth:r.rawBeforeFinalGrowth},actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],w);db.witnesses[id]=w;
}
for(const [id,d] of Object.entries(a.completed)){assert(u.pairs[id]);assert([2,3].includes(d));}
db.originUnlockContinuation=a;db.summary.originUnlockContinuation=a.summary;
db.sources.POPUNLOCKCONT12={file:"tools/build-population-unlock-continuation.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.POPUNLOCKCONT12="추가 모집 연구 재생 경로의 동일 활성 연구·출생 계급에서 결정론적 시술을 연속 재생. 중간 전투 성장 없이 실제 규칙을 적용하고 마지막 전투캡 투영 및 별도 성장 순서 상계 모형을 표시. 전역 최적성 미증명.";
db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
fs.writeFileSync(file,zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));console.log(JSON.stringify(a.summary));
