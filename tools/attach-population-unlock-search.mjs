// Merge a chronological unlock run into the latest common registry.
// Preserve distinct evidence scopes and recompute pair coverage by identity.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {refreshPopulationJointCoverage} from "./population-joint-coverage.mjs";
const read=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p))),key=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const path="public/data/branch-soldier-results.json.gz",db=read(path),a=read(process.argv[2]||"population-unlock-search.json.gz");
assert.equal(a.kind,"POPULATION_RECRUITMENT_UNLOCK_SEARCH");assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(a.summary.actualGameCertified,0);
const old=db.originUnlockSearch;
if(old){assert.equal(old.fingerprint,a.fingerprint);for(const k of ["pairs","roots","witnesses","attempts"])for(const [id,x] of Object.entries(old[k]))assert.deepEqual(a[k][id],x,"Lost prior "+k+" "+id);}
const p=db.populationSearch,v=p.versions[p.latest],origins=new Set(p.origins),branches=new Set(p.branches);
for(const [id,r] of Object.entries(a.pairs)){
 assert.equal(id,r.origin+"|"+r.branch);assert(origins.has(r.origin)&&branches.has(r.branch));
 const root=a.roots[r.root];assert.equal(key(root.actions),r.root);assert.equal(key([...root.actions,...r.suffix]),r.fullActionHash);
 assert(r.missing.length&&r.allowedDifficulties.length&&r.raw.length===12&&r.bonus.length===12&&r.actualGameCertified===false);
 const birth=r.suffix.at(-1);assert.equal(birth.type,"recruit");assert.equal(birth.profile,r.origin);assert.equal(birth.band,"min");
 for(const wid of r.witnessIds){const w=a.witnesses[wid];assert.equal(w.source,"POPUNLOCK12");assert.equal(w.populationUnlock.pair,id);assert.equal(w.originProfile,r.origin);assert.deepEqual(w.branchIds,[r.branch]);assert(w.actualGameCertified===false&&w.vector.length===12&&[...w.raw,...w.bonus,...w.vector].every(Number.isSafeInteger));if(db.witnesses[wid])assert.deepEqual(db.witnesses[wid],w);db.witnesses[wid]=w;}
}
db.originUnlockSearch=a;
refreshPopulationJointCoverage(db);
db.sources.POPUNLOCK12={file:"tools/build-population-unlock-search.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256,sourceRootSha256:a.sourceRootSha256};
db.policies.POPUNLOCK12="선택된 연구 이력 접두부에서 부족한 모집 연구를 실제 규칙으로 추가한 조건부 시간순 경로. 출생 최솟값·즉시 시술은 재생, 마지막 전투캡 성장은 별도 수치 가정. 모집 재료·연구 표본 및 이벤트 결과는 조건부. 전역 최고·불가능 미인증.";
db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
fs.writeFileSync(path,zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));
console.log(JSON.stringify(a.summary));
