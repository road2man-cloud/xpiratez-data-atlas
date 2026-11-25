// Publish growth-inserted chronological candidates without upgrading them to
// actual game proofs. Recheck original and new paths from a common birth.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {serialize} from "node:v8";
import {createGrowthReplay,birthActions,exactWorld,MODEL} from "./population-growth-replay-core.mjs";
import {createExactPrefixCheckpointCache} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),read=p=>JSON.parse(fs.readFileSync(p)),decode=b=>JSON.parse(z.gunzipSync(b));
const file="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(file)),bytes=fs.readFileSync(process.argv[2]||"population-growth-replay.json.gz"),a=decode(bytes),data=read("public/data/soldiers-modern-index.json");
assert.equal(a.kind,"POPULATION_GROWTH_REPLAY");assert.equal(a.model,MODEL);assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.equal(a.sourceV4Sha256,db.populationAssumedBirthClosure.sha256);assert.equal(a.sourceCareerSha256,db.populationCareerEnvelope.sha256);
const names=["originExtendedContinuation","originResearchContinuation","originResearchChain"];
const fingerprints=Object.fromEntries(names.map(k=>[k,key((db[k].published||[]).map(id=>[id,db[k].routes[id].fullActionHash,db[k].routes[id].canonicalStateHash]))]));
assert.deepEqual(a.sourceFingerprints,fingerprints);
assert.equal(a.fingerprint,key([MODEL,a.sourceMetadataSha256,a.sourceV4Sha256,a.sourceCareerSha256,fingerprints,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Dependency drift "+p);
for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
const old=db.populationGrowthReplay;if(old){for(const [id,r] of Object.entries(old.routes))assert.deepEqual(a.routes[id],r,"Lost prior candidate "+id);}
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const replay=createGrowthReplay(data),memo=new Map(),seedMemo=new Map(),baseline=new Map(),sum=v=>v.reduce((n,x)=>n+x,0),dominates=(a,b)=>a.every((n,i)=>n>=b[i]);
const legacyHashes={...db.originExtendedContinuation.hashes,"tools/build-population-extended-continuation.mjs":"64fa7f15eee999512b0fc6a254b5fa8e2841e5f1ce460650783fc4bafd918f2c"};
const diskBirth=createExactPrefixCheckpointCache(".population-extended-cache",key([db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,legacyHashes]));
const diskNew=createExactPrefixCheckpointCache(".population-growth-replay-cache",key([MODEL,db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,a.hashes["tools/population-growth-replay-core.mjs"]]));
for(const l of names)for(const id of db[l].published){
 const r=db[l].routes[id],k=r.pair+"|"+r.body;if(!r.capVector||!r.canonicalStateHash)continue;
 const f=baseline.get(k)||[];if(!f.some(v=>dominates(v,r.capVector)))baseline.set(k,[...f.filter(v=>!dominates(r.capVector,v)),r.capVector]);
}
const branches=new Map(db.branches.map(b=>[b.id,b])),env=db.populationCareerEnvelope,oi=new Map(env.origins.map((k,i)=>[k,i])),bi=new Map(env.branches.map((k,i)=>[k,i]));
const before=Object.keys(db.witnesses).length,published=[],compared=new Map(),outside=[];
let birthsReplayed=0,birthCacheHits=0;
for(const [id,r] of Object.entries(a.routes)){
 assert(names.includes(r.seedLedger)&&db[r.seedLedger].published.includes(r.seed));
 const seed=db[r.seedLedger].routes[r.seed];for(const k of ["input","kind","pair","origin","branch","root"])assert.equal(r[k],seed[k]);
 assert.equal(seed.fullActionHash,r.seedActionHash);assert.equal(seed.canonicalStateHash,r.seedStateHash);
 const {p,steps}=birthActions(db,seed);assert.equal(key(steps),p.fullActionHash);assert.equal(p.fullActionHash,r.birthActionHash);assert.equal(p.stateHash,r.birthStateHash);
 assert.equal(key([...steps,...seed.actions]),seed.fullActionHash);assert.equal(key([...steps,...r.actions]),r.fullActionHash);assert.equal(id,"POPGROW12:"+key([r.input,r.actions]).slice(0,24));
 let world=memo.get(p.fullActionHash);
 if(!world){const n=diskBirth.load(steps,p.stateHash)||diskNew.load(steps,p.stateHash);if(n){world=n.world;birthCacheHits++;}else{world=replay.replay(steps);birthsReplayed++;assert.equal(sha(serialize(world)),p.stateHash);}memo.set(p.fullActionHash,world);}
 if(!seedMemo.has(r.seed)){const s=replay.replay(seed.actions,world),f=replay.finish(s);assert.equal(exactWorld(s),seed.canonicalStateHash);assert.deepEqual(f.raw,seed.raw);assert.deepEqual(f.bonus,seed.bonus);seedMemo.set(r.seed,true);}
 const next=replay.replay(r.actions,world),f=replay.finish(next);assert.equal(exactWorld(next),r.canonicalStateHash);
 for(const k of ["body","raw","bonus","vector","capRaw","capVector"])assert.deepEqual(r[k],f[k],k);
 assert.deepEqual(r.vector,r.capVector);assert(r.actualGameCertified===false&&r.growthActions>0);
 assert.equal(r.growthActions,r.actions.filter(s=>s.type==="conditionalCapGrowth").length);assert.deepEqual(r.order,r.actions.filter(s=>s.type==="transform").map(s=>s.transform));
 const ctx=auditOriginCampaignContext([...steps,...r.actions],data),branch=branches.get(r.branch);assert(branch&&!branch.sourceRootConflict&&ctx.kind==="compatible");assert.deepEqual(r.allowedDifficulties,ctx.allowedDifficulties.filter(i=>p.allowedDifficulties.includes(i)));assert(r.allowedDifficulties.length);
 assert([...branch.captain,...Object.values(branch.choices||{})].filter(Boolean).every(k=>replay.active(next,k)));
 const pk=r.pair+"|"+r.body,base=baseline.get(pk)||[],best=base.length?Math.max(...base.map(sum)):null;
 assert(!base.some(v=>dominates(v,r.vector)));assert.equal(best,r.baselineBestSum);assert.equal(r.sumDelta,best===null?null:sum(r.vector)-best);
 const bound=env.groups[env.pairClasses[oi.get(r.origin)][bi.get(r.branch)]]?.bounds.find(x=>x.body===r.body);
 if(!bound||r.vector.some((v,i)=>v>bound.effective[i])||r.raw.some((v,i)=>v>bound.raw[i]))outside.push(id);
 const prev=compared.get(pk);if(!prev||sum(r.vector)>sum(prev.vector))compared.set(pk,{id,...r,careerGap:bound?sum(bound.effective)-sum(r.vector):null});
 const witness={source:"POPGROW12",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:r.raw,bonus:r.bonus,vector:r.vector,steps:r.order.map(id=>({id,count:1})),research:[...new Set(r.order.flatMap(id=>replay.rules.get(id)?.requires||[]))],placement:"CONDITIONAL_INTERMEDIATE_CAP_GROWTH_REPLAY",populationGrowth:{route:id,seed:r.seed,fullActionHash:r.fullActionHash,growthActions:r.growthActions},actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],witness);db.witnesses[id]=witness;published.push(id);
}
assert.equal(published.length,a.summary.registeredRoutes);
const top=[...compared.values()].sort((x,y)=>(y.sumDelta??0)-(x.sumDelta??0)||sum(y.vector)-sum(x.vector)).slice(0,20).map(({id,origin,branch,body,vector,baselineBestSum,sumDelta,careerGap,growthActions})=>({id,origin,branch,body,total:sum(vector),baselineBestSum,sumDelta,careerGap,growthActions}));
const final={...a.summary,independentReplayRoutes:published.length,independentSeedChecks:seedMemo.size,independentBirthChecks:memo.size,birthsReplayed,birthCacheHits,careerEnvelopeOutside:outside.length,top};
assert.equal(new Set(Object.values(a.routes).map(r=>r.pair)).size,final.improvedPairs);
const asset="soldier-population-growth-replay.json.gz";fs.writeFileSync("public/data/"+asset,bytes);
db.populationGrowthReplay={...a,published,summary:final,file:asset,sha256:sha(bytes),bytes:bytes.length,careerEnvelopeConflicts:outside};
db.summary.populationGrowthReplay=final;db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPGROW12={file:"tools/build-population-growth-replay.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.POPGROW12="원본 시간순 모집·연구 이력에 중간 전투캡 성장 가정을 명시적으로 삽입하고 결정론적 시술을 후속 재생한 제한 후보. 실제 성장 공동 달성·자원·훈장·승급·전체 최적성 미인증. 기존 세 모집 후속 원장 대비 비지배 후보.";
fs.writeFileSync(file+".tmp",z.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);console.log(JSON.stringify({summary:final,newWitnesses:Object.keys(db.witnesses).length-before,witnesses:Object.keys(db.witnesses).length}));
