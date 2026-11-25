// Incremental attach to the current shared registry, never replace other ledgers.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const file="public/data/branch-soldier-results.json.gz",db=decode(file),a=decode(process.argv[2]||"population-research-chain.json.gz"),u=db.originUnlockSearch,e=db.originEventBirth,s=db.originResearchContinuation;
assert(u&&e&&s&&a.kind==="POPULATION_RESEARCH_CHAIN");
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(a.unlockFingerprint,u.fingerprint);assert.equal(a.eventFingerprint,e.fingerprint);assert.equal(a.seedFingerprint,s.fingerprint);
assert.equal(a.fingerprint,key([db.sourceMetadataSha256,u.fingerprint,e.fingerprint,s.fingerprint,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Dependency drift "+p);
const old=db.originResearchChain;if(old){
 assert.equal(old.fingerprint,a.fingerprint);
 for(const k of ["routes","researchAttempts","subtrees"])for(const [id,r] of Object.entries(old[k]||{}))assert.deepEqual(a[k]?.[id],r,"Lost prior "+id);
 for(const k of ["completed","visits"])for(const [id,n] of Object.entries(old[k]||{}))assert((a[k]?.[id]||0)>=n,"Lost prior progress "+id);
}
const valid=v=>Array.isArray(v)&&v.length===db.stats.length&&v.every(Number.isSafeInteger),branches=new Map(db.branches.map(b=>[b.id,b]));
const before=Object.keys(db.witnesses).length,published=[];
assert.equal(a.summary.registeredRoutes,Object.keys(a.routes).length);assert.equal(a.summary.actualGameCertified,0);assert.equal(a.summary.globalOptimalCertified,0);
for(const [id,r] of Object.entries(a.routes)){
 const seed=s.routes[r.seed];assert(seed&&db.witnesses[r.seed]?.source==="POPRESEARCH12");
 for(const k of ["input","kind","pair","origin","branch","root","birthActionHash","birthStateHash"])assert.equal(r[k],seed[k],k);
 assert.equal(r.seedActionHash,seed.fullActionHash);assert.equal(r.seedStateHash,seed.canonicalStateHash);
 assert.deepEqual(r.actions.slice(0,seed.actions.length),seed.actions);
 assert(branches.has(r.branch)&&!branches.get(r.branch).sourceRootConflict);
 const p=r.kind==="unlock"?u.pairs[r.pair]:e.variants[r.input.slice(6)];assert(p&&p.origin===r.origin&&p.branch===r.branch&&p.root===r.root);
 assert.equal(r.input,r.kind==="unlock"?"unlock:"+r.pair:"event:"+p.id);
 const root=(r.kind==="unlock"?u:e).roots[p.root].actions;
 const full=r.kind==="unlock"?[...root,...p.suffix]:[...root.slice(0,p.insertionAt),...p.extraBeforeBirth,...p.inserted,...root.slice(p.insertionAt)];
 assert.equal(key(full),p.fullActionHash);assert.equal(r.birthActionHash,p.fullActionHash);assert.equal(r.birthStateHash,p.stateHash);
 assert.equal(id,"PXRCHAIN12:"+key([r.input,r.actions]).slice(0,24));assert.equal(key([...full,...r.actions]),r.fullActionHash);
 assert(r.actualGameCertified===false&&r.allowedDifficulties.length&&r.allowedDifficulties.every(k=>seed.allowedDifficulties.includes(k)&&p.allowedDifficulties.includes(k)));
 assert.deepEqual(r.order,r.actions.filter(a=>a.type==="transform").map(a=>a.transform));assert(r.order.length>=2&&r.order.length<=6);
 assert.deepEqual(r.missing,seed.missing);assert.deepEqual(r.addedResearch,[...new Set([...seed.addedResearch,...r.secondaryResearch])]);
 assert([r.raw,r.bonus,r.vector,r.capRaw,r.capVector].every(valid));
 const effective=v=>v.map((x,i)=>db.stats[i]==="psiSkill"&&x<=0&&r.bonus[i]>0?x:Math.max(db.stats[i]==="health"?1:0,x+r.bonus[i]));
 assert.deepEqual(r.vector,effective(r.raw));assert.deepEqual(r.capVector,effective(r.capRaw));
 const ctx=r.kind==="unlock"?{populationUnlock:{pair:r.pair,actions:r.actions,rawBeforeFinalGrowth:r.raw}}:{populationEvent:{variant:p.id,actions:r.actions,rawBeforeFinalGrowth:r.raw}};
 const w={source:"POPRESEARCHCHAIN12",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:r.capRaw,bonus:r.bonus,vector:r.capVector,steps:r.order.map(id=>({id,count:1})),research:[...new Set([...seed.goal,...r.secondaryResearch])],placement:"REPLAYED_BIRTH_RESEARCH_AND_TRANSFORM_CHAIN_THEN_CONDITIONAL_CAP",populationResearchChain:{route:id,seed:r.seed,fullActionHash:r.fullActionHash,secondaryResearch:r.secondaryResearch},...ctx,actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],w,"Witness collision "+id);
 db.witnesses[id]=w;published.push(id);
}
for(const [id,d] of Object.entries(a.completed)){assert(s.routes[id]);assert(Number.isInteger(d)&&d>=2&&d<=6);}
db.originResearchChain={...a,published};db.summary.originResearchChain={...a.summary,published:published.length};db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPRESEARCHCHAIN12={file:"tools/build-population-research-chain.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.POPRESEARCHCHAIN12="모집 후 연구·첫 시술의 정확 상태를 재생한 뒤 동일 활성 연구의 결정론적 후속 시술 또는 별도 제한 추가 연구를 재생. 순서별 행동과 상태 해시 보존. 중간 성장·무작위·전역 최고 미인증; 마지막 전투캡 조건부 투영.";
fs.writeFileSync(file+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({published:published.length,newWitnesses:Object.keys(db.witnesses).length-before,registeredWitnesses:db.summary.registeredWitnesses}));
