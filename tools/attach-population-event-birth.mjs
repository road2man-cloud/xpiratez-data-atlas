import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {refreshPopulationJointCoverage} from "./population-joint-coverage.mjs";
const decode=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p))),key=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const file="public/data/branch-soldier-results.json.gz",db=decode(file),a=decode(process.argv[2]||"population-event-birth.json.gz");
assert.equal(a.kind,"POPULATION_EVENT_BIRTH_INSERTION");assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(a.summary.actualGameCertified,0);
const old=db.originEventBirth;if(old){assert.equal(old.fingerprint,a.fingerprint);for(const k of ["roots","variants","witnesses","attempts"])for(const [id,v] of Object.entries(old[k]))assert.deepEqual(a[k][id],v);for(const [id,p] of Object.entries(old.pairs))assert(p.variants.every(v=>a.pairs[id].variants.includes(v)));}
if(old?.rootFailures)for(const [id,v] of Object.entries(old.rootFailures))assert.deepEqual(a.rootFailures?.[id],v,"Lost rejected-root record");
if(a.schedulerVersion===2){assert.equal(typeof a.schedulerFingerprint,"string");assert.equal(a.summary.rootFailureRecords,Object.keys(a.rootFailures).length);for(const r of Object.values(a.rootFailures)){assert.equal(r.status,"EXACT_ROOT_REPLAY_REJECTED_NOT_PAIR_IMPOSSIBLE");assert(Number.isSafeInteger(r.actions)&&r.actions>=0);}}
const p=db.populationSearch,origins=new Set(p.origins),branches=new Set(p.branches),all=new Set();
for(const [id,r] of Object.entries(a.pairs)){
 assert.equal(id,r.origin+"|"+r.branch);assert(origins.has(r.origin)&&branches.has(r.branch)&&r.origin.startsWith("event:"));
 for(const vid of r.variants){
  assert(!all.has(vid));all.add(vid);const v=a.variants[vid],root=a.roots[v.root];assert.equal(v.id,vid);assert.equal(v.pair,id);assert.equal(v.origin,r.origin);assert.equal(v.branch,r.branch);assert.equal(key(root.actions),v.root);assert.equal(v.actualGameCertified,false);assert(v.allowedDifficulties.length);
  assert(v.insertionAt>=0&&v.insertionAt<=root.actions.length);
  assert.equal(key([...root.actions.slice(0,v.insertionAt),...v.extraBeforeBirth,...v.inserted,...root.actions.slice(v.insertionAt)]),v.fullActionHash);
  const birth=v.inserted.at(-1);assert.equal(birth.type,"recruit");assert.equal(birth.profile,r.origin);assert.equal(birth.script,v.script);assert.equal(birth.band,"min");assert.equal(birth.assumeOutcome,true);
  for(const wid of v.witnessIds){const w=a.witnesses[wid];assert.equal(w.source,"POPEVENT12");assert.equal(w.populationEvent.variant,vid);assert.equal(w.originProfile,r.origin);assert.deepEqual(w.branchIds,[r.branch]);assert(w.actualGameCertified===false&&[w.raw,w.bonus,w.vector,w.populationEvent.rawBeforeFinalGrowth].every(x=>x.length===12&&x.every(Number.isSafeInteger)));if(db.witnesses[wid])assert.deepEqual(db.witnesses[wid],w);db.witnesses[wid]=w;}
 }
}
assert.equal(all.size,Object.keys(a.variants).length);
db.originEventBirth=a;db.sources.POPEVENT12={file:a.schedulerVersion===2?"tools/build-population-event-birth-v2.mjs":"tools/build-population-event-birth.mjs",fingerprint:a.fingerprint,...(a.schedulerVersion===2?{schedulerFingerprint:a.schedulerFingerprint}:{}),sourceMetadataSha256:a.sourceMetadataSha256,sourceRootSha256:a.sourceRootSha256};
db.policies.POPEVENT12="원본 이벤트 스크립트의 월·연구·금지 조건을 재생하고 기존 연구 이력 중간 또는 뒤에 조건부 출생을 삽입. 시작 국가·지역 및 확률·공동 보상 등 미확인 조건 보존. 출생 최솟값과 즉시 시술만 재생; 전투캡 수치는 가정.";
refreshPopulationJointCoverage(db);db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
fs.writeFileSync(file,zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));console.log(JSON.stringify({event:a.summary,coverage:db.populationJointCoverage.counts,covered:db.populationJointCoverage.uniqueCovered,witnesses:db.summary.registeredWitnesses}));
