// Register the new optimistic rank/bonus bounds without changing campaign
// evidence, existing proof ledgers or completion counters.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const decode=x=>JSON.parse(gunzipSync(x));
const registry="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(registry));
const file="soldier-population-career-envelope.json.gz",bytes=fs.readFileSync("public/data/"+file),a=decode(bytes);
const b=db.populationBranchInvariant,c=db.populationResearchConstraints;
assert.equal(a.kind,"POPULATION_CAREER_ENVELOPE");assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(a.base.sha256,b.sha256);assert.equal(a.base.identity,b.identity);
assert.equal(a.research.sha256,c.sha256);assert.equal(a.research.identity,c.identity);
assert.equal(a.identity,key([b.identity,c.identity,b.sha256,c.sha256,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Source drift "+p);
assert.deepEqual(a.stats,db.stats);assert.deepEqual(a.origins,b.origins);assert.deepEqual(a.branches,b.branches);
assert.equal(a.proof.globalCampaign,false);
for(const k of ["globalCompleted","globalImpossible","actualGameCertified"])assert.equal(a.summary[k],0);
const vector=x=>Array.isArray(x)&&x.length===12&&x.every(Number.isSafeInteger);
const groups=a.groups.map(g=>{
 const x=g.value,old=b.groups[g.baseGroup];assert(old);
 assert(vector(x.rawMax)&&vector(x.effectiveMax));
 assert(x.rawMax.every((n,i)=>n<=old.rawMax[i])&&x.effectiveMax.every((n,i)=>n<=old.effectiveMax[i]));
 for(const v of x.bounds){
  const u=old.bounds.find(y=>y.body===v.body);assert(u&&vector(v.raw)&&vector(v.effective)&&vector(v.bonusUpper));
  assert(v.raw.every((n,i)=>n<=u.raw[i])&&v.effective.every((n,i)=>n<=u.effective[i]));
 }
 return {baseGroup:g.baseGroup,initialRank:x.initialRank,failedOpen:!!g.failedOpen,rawMax:x.rawMax,effectiveMax:x.effectiveMax,bounds:x.bounds.map(v=>({body:v.body,raw:v.raw,effective:v.effective,bonusUpper:v.bonusUpper,ranks:v.ranks}))};
});
assert.equal(a.pairClasses.length,a.origins.length);
const used=new Set();
for(let i=0;i<a.origins.length;i++){
 assert.equal(a.pairClasses[i].length,a.branches.length);
 for(let j=0;j<a.branches.length;j++){const k=a.pairClasses[i][j];assert(groups[k]);assert.equal(groups[k].baseGroup,b.pairClasses[i][j]);used.add(k);}
}
assert.equal(used.size,groups.length);assert.equal(groups.length,a.summary.independentGroups);
assert.equal(a.summary.coveredUpperBoundPairs,a.origins.length*a.branches.length);
const oi=new Map(a.origins.map((x,i)=>[x,i])),bi=new Map(a.branches.map((x,i)=>[x,i]));
let latestWitnessChecks=0;
for(const [id,w] of Object.entries(db.witnesses)){
 const i=oi.get(w.originProfile);if(i===undefined||w.vector?.length!==12||!vector(w.vector))continue;
 for(const branch of w.branchIds||[]){
  const j=bi.get(branch);if(j===undefined)continue;
  const v=groups[a.pairClasses[i][j]].bounds.find(v=>v.body===w.body);
  assert(v&&w.vector.every((n,k)=>n<=v.effective[k]),"Latest witness exceeds career envelope "+id);latestWitnessChecks++;
 }
}
for(let k=0;k<12;k++){
 const t=a.targets[k];assert.equal(t.stat,a.stats[k]);if(t.target===null)continue;
 const ids=new Set();let remaining=0;
 for(const row of a.pairClasses)for(const i of row)if(groups[i].effectiveMax[k]>=t.target){remaining++;ids.add(i);}
 assert.equal(remaining,t.remainingPairs);assert.equal(ids.size,t.remainingGroups);
 assert.deepEqual([...ids].sort((i,j)=>groups[j].effectiveMax[k]-groups[i].effectiveMax[k]||i-j),t.groups);
}
db.populationCareerEnvelope={schemaVersion:1,kind:a.kind,identity:a.identity,sourceMetadataSha256:a.sourceMetadataSha256,file,bytes:bytes.length,sha256:sha(bytes),
 base:a.base,research:a.research,scope:a.scope,proof:a.proof,summary:a.summary,stats:a.stats,origins:a.origins,branches:a.branches,
 medalUpper:a.medalUpper,medalUnionUpper:a.medalUnionUpper,groups,pairClasses:a.pairClasses,targets:a.targets.map(({groups,...t})=>t)};
db.summary.populationCareerEnvelope=a.summary;
db.sources.POPCAREERENV12={file:"tools/build-population-career-envelope.mjs",fingerprint:a.identity,sourceMetadataSha256:a.sourceMetadataSha256,asset:file,sha256:sha(bytes)};
db.policies.POPCAREERENV12="분기별 원시 상계 + 계급 상태·변신 초기화·보너스 보유 가능성의 유한 폐쇄, 일반 훈장별 한 등급 및 모듈형 훈장 보수적 합집합 상계. 승급/훈장 획득 가정, 독립 수치 상계만 제공. 목표 필터는 제한 수치모형에만 적용하고 전역 완결 및 실제 달성으로 집계하지 않음.";
fs.writeFileSync(registry+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(registry+".tmp",registry);
console.log(JSON.stringify({file,sha256:sha(bytes),bytes:bytes.length,summary:a.summary,latestWitnessChecks,registeredWitnesses:db.summary.registeredWitnesses}));
