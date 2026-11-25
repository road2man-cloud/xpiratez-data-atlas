// Incrementally publish independently replayed, matching-birth evidence.
// Nonmatching legacy state hashes are retained in the audit ledger, not maxima.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const file="public/data/branch-soldier-results.json.gz",db=decode(file),a=decode(process.argv[2]||"population-extended-continuation.json.gz");
const u=db.originUnlockSearch,e=db.originEventBirth;
assert.equal(a.kind,"POPULATION_EXTENDED_CONTINUATION");
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(a.unlockFingerprint,u.fingerprint);assert.equal(a.eventFingerprint,e.fingerprint);
assert.equal(a.summary.actualGameCertified,0);assert.equal(a.summary.globalOptimalCertified,0);
assert.equal(a.engine,key([a.sourceMetadataSha256,u.fingerprint,e.fingerprint,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Dependency changed "+p);
const old=db.originExtendedContinuation;
if(old){assert.equal(old.engine,a.engine);for(const k of ["routes","models"])for(const [id,r] of Object.entries(old[k]))assert.deepEqual(a[k][id],r,"Lost prior "+id);}
const before=Object.keys(db.witnesses).length,published=[],quarantined=[];
const valid=v=>Array.isArray(v)&&v.length===12&&v.every(Number.isSafeInteger);
for(const [id,r] of Object.entries(a.routes)){
 const p=r.kind==="unlock"?u.pairs[r.pair]:e.variants[r.input.slice(6)];
 assert(p&&p.origin===r.origin&&p.branch===r.branch&&p.root===r.root);
 assert.equal(r.input,r.kind==="unlock"?"unlock:"+r.pair:"event:"+p.id);
 const root=(r.kind==="unlock"?u:e).roots[p.root].actions;
 const full=r.kind==="unlock"?[...root,...p.suffix]:[...root.slice(0,p.insertionAt),...p.extraBeforeBirth,...p.inserted,...root.slice(p.insertionAt)];
 assert.equal(key(full),p.fullActionHash);assert.equal(r.birthActionHash,p.fullActionHash);
 assert.equal(r.birthProof.expected,p.stateHash);
 assert.equal(r.birthProof.hashMatch,r.birthProof.expected===r.birthProof.observed);
 assert(r.birthProof.allowedDifficulties.length&&r.birthProof.allowedDifficulties.every(x=>p.allowedDifficulties.includes(x)));
 assert.equal(key([...full,...r.actions]),r.fullActionHash);
 assert.equal(id,"PXC12:"+key([r.input,r.order]).slice(0,24));
 assert.deepEqual(r.order,r.actions.filter(x=>x.type==="transform").map(x=>x.transform));
 assert(r.order.length>=1&&r.order.length<=6&&r.actualGameCertified===false);
 assert([r.raw,r.bonus,r.vector,r.capRaw,r.capVector].every(valid));
 const effective=v=>v.map((x,i)=>db.stats[i]==="psiSkill"&&x<=0&&r.bonus[i]>0?x:Math.max(db.stats[i]==="health"?1:0,x+r.bonus[i]));
 assert.deepEqual(r.vector,effective(r.raw));assert.deepEqual(r.capVector,effective(r.capRaw));
 if(r.model){const m=a.models[r.model];assert(m&&m.origin===r.origin&&m.body===r.body);assert.deepEqual(m.order,r.order);assert(m.frontier.every(f=>[f.raw,f.bonus,f.vector].every(valid)));}
 if(!r.birthProof.hashMatch){quarantined.push(id);continue;}
 const metadata=r.kind==="unlock"?{populationUnlock:{pair:r.pair,actions:r.actions,rawBeforeFinalGrowth:r.raw}}:{populationEvent:{variant:p.id,actions:r.actions,rawBeforeFinalGrowth:r.raw}};
 const w={source:"POPEXT12",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:r.capRaw,bonus:r.bonus,vector:r.capVector,steps:r.order.map(id=>({id,count:1})),placement:"REPLAYED_BIRTH_AND_TRANSFORMS_THEN_CONDITIONAL_CAP",populationExtended:{route:id,input:r.input,model:r.model,rawBeforeFinalGrowth:r.raw,fullActionHash:r.fullActionHash},...metadata,actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],w);db.witnesses[id]=w;published.push(id);
}
assert.equal(published.length+quarantined.length,a.summary.registeredRoutes);
db.originExtendedContinuation={...a,published,quarantined};
db.summary.originExtendedContinuation={...a.summary,published:published.length,quarantined:quarantined.length};
db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPEXT12={file:"tools/build-population-extended-continuation.mjs",fingerprint:a.engine,sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.POPEXT12="추가 연구·이벤트 출생의 원본 행동과 모집 상태 해시가 일치한 경로만 비교에 등록. 시술 직후 재생값과 마지막 전투캡 조건부 투영을 구분하며 별도 성장 순서 상계는 실제 달성 미인증. 이전 모집 해시 불일치는 독립 원장에만 보존.";
fs.writeFileSync(file+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({published:published.length,quarantined:quarantined.length,newWitnesses:Object.keys(db.witnesses).length-before,registeredWitnesses:db.summary.registeredWitnesses}));
