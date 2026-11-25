// Attach research constraints and branch-conditioned upper bounds to the
// latest registry without deleting or relabelling any independent evidence.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const decode=b=>JSON.parse(gunzipSync(b)),read=p=>fs.readFileSync("public/data/"+p);
const registry="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(registry)),p=db.populationSearch;
const cf="soldier-population-research-constraints.json.gz",bf="soldier-population-branch-invariant.json.gz",cb=read(cf),bb=read(bf),c=decode(cb),a=decode(bb);
assert.equal(c.kind,"POPULATION_RESEARCH_NECESSARY_CONSTRAINT");assert.equal(a.kind,"POPULATION_BRANCH_INDUCTIVE_BOUND");
assert.equal(c.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(c.sourceD3Sha256,p.versions.D3.sha256);assert.equal(a.researchConstraint.sha256,sha(cb));assert.equal(a.researchConstraint.identity,c.identity);
assert.equal(a.base.sha256,db.populationInvariantBound.sha256);assert.equal(a.base.identity,db.populationInvariantBound.identity);
assert.equal(sha(read(a.base.file)),a.base.sha256);
assert.equal(c.identity,key([db.sourceMetadataSha256,c.sourceD3Sha256,c.hashes,p.branches,c.records.map(x=>[x.branch,x.group,x.commitments,x.fallback])]));
assert.equal(a.identity,key([db.sourceMetadataSha256,sha(cb),a.base.sha256,a.hashes]));
for(const x of [a,c])for(const [f,h] of Object.entries(x.hashes))assert.equal(sha(fs.readFileSync(f,"utf8").replace(/\r\n/g,"\n")),h,"Source drift "+f);
for(const x of [a,c]){assert.deepEqual(x.origins,p.origins);assert.deepEqual(x.branches,p.branches);}
assert.deepEqual(a.rules,c.rules);assert.deepEqual(a.stats,db.stats);
assert.equal(a.proof.fullCampaign,false);assert.equal(a.proof.witnessConsistency,true);assert.equal(a.summary.witnessOutside,0);
for(const x of [a,c]){assert.equal(x.summary.globalCompleted,0);assert.equal(x.summary.globalImpossible,0);}
assert.equal(a.summary.coveredUpperBoundPairs,p.origins.length*p.branches.length);
const oi=new Map(p.origins.map((id,i)=>[id,i])),bi=new Map(p.branches.map((id,i)=>[id,i]));
const expectedMasks=c.groups.map(g=>new Set(g.branches)),maskByBranch=c.records.map((r,j)=>{
 assert.equal(r.branch,p.branches[j]);assert(expectedMasks[r.group]?.delete(r.branch));return r.group;
});
assert(expectedMasks.every(s=>s.size===0));
assert.equal(c.groups.length,a.maskRecords.length);assert.equal(a.pairClasses.length,p.origins.length);
for(let i=0;i<c.groups.length;i++){
 const m=a.maskRecords[i];assert.equal(m.maskGroup,i);assert.equal(m.mask,c.groups[i].mask);assert.equal(m.originGroups.length,p.origins.length);
 for(let j=0;j<p.origins.length;j++)for(const b of c.groups[i].branches)assert.equal(a.pairClasses[j][bi.get(b)],m.originGroups[j]);
}
const vector=v=>Array.isArray(v)&&v.length===12&&v.every(Number.isSafeInteger);
const groupIds=new Set(),groups=a.groups.map((g,i)=>{
 const r=g.result;assert([r.rawMax,r.effectiveMax,r.bonusUpper].every(vector));
 assert(r.bounds.every(b=>vector(b.raw)&&vector(b.effective)));
 const caps=a.rules.map(id=>r.repeatCaps[id]);assert(caps.every(n=>n===null||Number.isSafeInteger(n)&&n>=0));
 return {baseGroup:g.baseGroup,reusedUniversal:g.reusedUniversal,reachableMask:g.reachableMask,rawMax:r.rawMax,effectiveMax:r.effectiveMax,bonusUpper:r.bonusUpper,bounds:r.bounds,repeatCaps:caps};
});
for(const row of a.pairClasses){assert.equal(row.length,p.branches.length);for(const id of row){assert(groups[id]);groupIds.add(id);}}
assert.equal(groupIds.size,a.summary.independentGroups);assert.equal(groupIds.size,groups.length);
let currentWitnessChecks=0;
for(const [id,w] of Object.entries(db.witnesses)){
 const i=oi.get(w.originProfile);if(i===undefined||w.vector?.length!==12)continue;
 for(const branch of w.branchIds||[]){
  const j=bi.get(branch);if(j===undefined)continue;
  const b=groups[a.pairClasses[i][j]].bounds.find(x=>x.body===w.body);
  assert(b&&w.vector.every((n,k)=>n<=b.effective[k]),"Latest registered witness exceeds bound "+id);
  currentWitnessChecks++;
 }
}
const cmeta={schemaVersion:1,kind:c.kind,sourceMetadataSha256:c.sourceMetadataSha256,identity:c.identity,file:cf,bytes:cb.length,sha256:sha(cb),sourceD3Sha256:c.sourceD3Sha256,
 summary:c.summary,scope:c.scope,branches:c.branches,rules:c.rules,maskByBranch,groups:c.groups.map(g=>({mask:g.mask,bddRoot:g.bddRoot,branches:g.branches.length,allowedRules:g.allowedRules.length}))};
const meta={schemaVersion:1,kind:a.kind,sourceMetadataSha256:a.sourceMetadataSha256,identity:a.identity,file:bf,bytes:bb.length,sha256:sha(bb),researchConstraint:a.researchConstraint,base:a.base,
 summary:a.summary,scope:a.scope,proof:a.proof,origins:a.origins,branches:a.branches,stats:a.stats,rules:a.rules,pairClasses:a.pairClasses,groups};
db.populationResearchConstraints=cmeta;db.summary.populationResearchConstraints=c.summary;
db.populationBranchInvariant=meta;db.summary.populationBranchInvariant=a.summary;
db.sources.POPRESEARCHCONSTRAINT12={file:"tools/build-population-research-constraint.mjs",fingerprint:c.identity,sourceMetadataSha256:c.sourceMetadataSha256,asset:cf,sha256:cmeta.sha256};
db.sources.POPBRANCHINVARIANT12={file:"tools/build-population-branch-invariant.mjs",fingerprint:a.identity,sourceMetadataSha256:a.sourceMetadataSha256,asset:bf,sha256:meta.sha256};
db.policies.POPRESEARCHCONSTRAINT12="색인된 0시작 연구 모델의 처리 이력/활성 상태 분리, 획득 대안 하이퍼그래프, 양방향 영구 배제, 행동 집합 BDD. 기존 근거와 충돌하는 분기는 안전하게 허용으로 되돌림. 실제 게임 전체 연구 불가능성 증명 아님.";
db.policies.POPBRANCHINVARIANT12="연구 마스크별 SCC 반복 횟수 증명과 정수 상자 불변식. BDD의 추가 행동 쌍 제약은 수치 계산에 아직 미적용. 독립 능력치 상계로 실제 도달 벡터 및 전체 완전 판정과 별도 관리.";
fs.writeFileSync(registry+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(registry+".tmp",registry);
console.log(JSON.stringify({research:{file:cf,sha256:cmeta.sha256,bytes:cmeta.bytes,summary:c.summary},branch:{file:bf,sha256:meta.sha256,bytes:meta.bytes,summary:a.summary},currentWitnessChecks,registeredWitnesses:db.summary.registeredWitnesses}));
