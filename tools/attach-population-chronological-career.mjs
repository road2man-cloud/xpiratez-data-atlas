// Register independently replayed chronological career candidates.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {serialize} from "node:v8";
import {createCareerReplay,MODEL} from "./population-chronological-career-core.mjs";
import {birthActions,exactWorld,MODEL as GROWTH_MODEL} from "./population-growth-replay-core.mjs";
import {createExactPrefixCheckpointCache} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),read=p=>JSON.parse(fs.readFileSync(p)),decode=b=>JSON.parse(z.gunzipSync(b)),sum=v=>v.reduce((a,b)=>a+b,0);
const file="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(file)),bytes=fs.readFileSync(process.argv[2]||"population-chronological-career.json.gz"),a=decode(bytes),data=read("public/data/soldiers-modern-index.json");
assert.equal(a.kind,"POPULATION_CHRONOLOGICAL_CAREER");assert.equal(a.model,MODEL);assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.equal(a.sourceCareerSha256,db.populationCareerEnvelope.sha256);
const names=["originExtendedContinuation","originResearchContinuation","originResearchChain","populationGrowthReplay"];
const fingerprints=Object.fromEntries(names.map(k=>[k,key(db[k].published.map(id=>[id,db[k].routes[id].fullActionHash,db[k].routes[id].canonicalStateHash]))]));
assert.deepEqual(a.sourceFingerprints,fingerprints);assert.equal(a.fingerprint,key([MODEL,a.sourceMetadataSha256,a.sourceCareerSha256,fingerprints,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Dependency changed "+p);
for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
if(db.populationChronologicalCareer)for(const [id,r] of Object.entries(db.populationChronologicalCareer.routes))assert.deepEqual(a.routes[id],r,"Prior candidate lost "+id);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const replay=createCareerReplay(data),births=new Map(),seeds=new Map(),base=new Map(),branches=new Map(db.branches.map(b=>[b.id,b]));
const pairKey=r=>r.origin+"|"+r.branch+"|"+r.body,dominates=(a,b)=>a.every((v,i)=>v>=b[i]);
for(const l of names)for(const id of db[l].published){
 const r=db[l].routes[id],v=r.capVector||r.vector,k=pairKey(r);if(!v||!r.canonicalStateHash)continue;
 const f=base.get(k)||[];if(!f.some(x=>dominates(x,v)))base.set(k,[...f.filter(x=>!dominates(v,x)),v]);
}
const legacyHashes={...db.originExtendedContinuation.hashes,"tools/build-population-extended-continuation.mjs":"64fa7f15eee999512b0fc6a254b5fa8e2841e5f1ce460650783fc4bafd918f2c"};
const diskBirth=createExactPrefixCheckpointCache(".population-extended-cache",key([db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,legacyHashes]));
const diskGrowth=createExactPrefixCheckpointCache(".population-growth-replay-cache",key([GROWTH_MODEL,db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,a.hashes["tools/population-growth-replay-core.mjs"]]));
const env=db.populationCareerEnvelope,oi=new Map(env.origins.map((id,i)=>[id,i])),bi=new Map(env.branches.map((id,i)=>[id,i]));
const before=Object.keys(db.witnesses).length,published=[],byPair=new Map(),outside=[];
let independentBirths=0,cacheHits=0;
for(const [id,r] of Object.entries(a.routes)){
 assert(names.includes(r.seedLedger)&&db[r.seedLedger].published.includes(r.seed));
 const seed=db[r.seedLedger].routes[r.seed];for(const k of ["input","kind","pair","origin","branch","root"])assert.equal(r[k],seed[k]);
 assert.equal(r.seedActionHash,seed.fullActionHash);assert.equal(r.seedStateHash,seed.canonicalStateHash);
 const {p,steps}=birthActions(db,seed);assert.equal(key(steps),p.fullActionHash);assert.equal(p.fullActionHash,r.birthActionHash);assert.equal(p.stateHash,r.birthStateHash);
 assert.equal(key([...steps,...seed.actions]),seed.fullActionHash);assert.equal(key([...steps,...r.actions]),r.fullActionHash);assert.equal(id,"POPCHCAREER12:"+key([r.input,r.actions]).slice(0,24));assert.deepEqual(r.actions.slice(0,seed.actions.length),seed.actions);
 let w=births.get(p.fullActionHash);
 if(!w){const c=diskBirth.load(steps,p.stateHash)||diskGrowth.load(steps,p.stateHash);if(c){w=c.world;cacheHits++;}else{w=replay.replay(steps);assert.equal(sha(serialize(w)),p.stateHash);independentBirths++;}births.set(p.fullActionHash,w);}
 let sw=seeds.get(r.seed);if(!sw){sw=replay.replay(seed.actions,w);assert.equal(exactWorld(sw),seed.canonicalStateHash);const f=replay.finish(sw);assert.deepEqual(f.raw,seed.raw);assert.deepEqual(f.bonus,seed.bonus);seeds.set(r.seed,sw);}
 const suffix=r.actions.slice(seed.actions.length),next=replay.replay(suffix,sw),f=replay.finish(next);
 assert.equal(exactWorld(next),r.canonicalStateHash);
 for(const k of Object.keys(f))assert.deepEqual(r[k],f[k],"Terminal mismatch "+k);
 assert(r.actualGameCertified===false&&suffix.some(s=>s.type==="conditionalPromotion"||s.type==="conditionalMedal"));
 assert.deepEqual(r.permanentVector,r.permanentCapVector);assert.deepEqual(r.order,r.actions.filter(s=>s.type==="transform").map(s=>s.transform));
 const branch=branches.get(r.branch),ctx=auditOriginCampaignContext([...steps,...r.actions],data);
 assert(branch&&!branch.sourceRootConflict&&ctx.kind==="compatible");assert.deepEqual(r.allowedDifficulties,ctx.allowedDifficulties.filter(i=>p.allowedDifficulties.includes(i)));assert(r.allowedDifficulties.length);
 assert([...branch.captain,...Object.values(branch.choices||{})].filter(Boolean).every(k=>replay.active(next,k)));
 const pk=pairKey(r),xs=base.get(pk)||[],best=xs.length?Math.max(...xs.map(sum)):null;
 assert(!xs.some(v=>dominates(v,r.permanentVector)));assert.equal(r.baselineBestSum,best);assert.equal(r.sumDelta,best===null?null:sum(r.permanentVector)-best);
 const bound=env.groups[env.pairClasses[oi.get(r.origin)][bi.get(r.branch)]]?.bounds.find(b=>b.body===r.body);
 if(!bound||r.vector.some((n,i)=>n>bound.effective[i])||r.raw.some((n,i)=>n>bound.raw[i]))outside.push(id);
 const old=byPair.get(pk);if(!old||sum(r.permanentVector)>sum(old.permanentVector))byPair.set(pk,{id,...r,careerGap:bound?sum(bound.effective)-sum(r.vector):null});
 const witness={source:"POPCHCAREER12",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:r.raw,bonus:r.permanentBonus,vector:r.permanentVector,steps:r.order.map(id=>({id,count:1})),research:[...new Set(r.order.flatMap(id=>replay.rules.get(id)?.requires||[]))],placement:"CHRONOLOGICAL_ASSUMED_CAREER_GROWTH_PERMANENT_ONLY",populationChronologicalCareer:{route:id,seed:r.seed,fullActionHash:r.fullActionHash,rank:r.rank,medals:r.medals},actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],witness);db.witnesses[id]=witness;published.push(id);
}
assert.equal(published.length,a.summary.registeredRoutes);
const top=[...byPair.values()].sort((a,b)=>(b.sumDelta??0)-(a.sumDelta??0)||sum(b.permanentVector)-sum(a.permanentVector)).slice(0,20).map(({id,origin,branch,body,permanentVector,vector,baselineBestSum,sumDelta,rank,medals,careerGap})=>({id,origin,branch,body,total:sum(permanentVector),medalTotal:sum(vector),baselineBestSum,sumDelta,rank,medals,careerGap}));
const summary={...a.summary,independentRouteReplays:published.length,independentSeedReplays:seeds.size,birthPrefixes:births.size,independentBirths,cacheHits,careerEnvelopeConflicts:outside.length,top};
const asset="soldier-population-chronological-career.json.gz";fs.writeFileSync("public/data/"+asset,bytes);
db.populationChronologicalCareer={...a,published,summary,file:asset,sha256:sha(bytes),bytes:bytes.length,careerEnvelopeConflicts:outside};
db.summary.populationChronologicalCareer=summary;db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPCHCAREER12={file:"tools/build-population-chronological-career.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.POPCHCAREER12="시간순 모집·연구 이력에 조건부 전투캡 성장, 승급, 요구 훈장 획득을 삽입한 시술 후보. 훈장 자체 보너스를 제외한 영구 수치만 공통 최고치에 반영. 실제 획득·캠페인 최적성 미인증.";
fs.writeFileSync(file+".tmp",z.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);console.log(JSON.stringify({registered:published.length,newWitnesses:Object.keys(db.witnesses).length-before,total:Object.keys(db.witnesses).length,conflicts:outside.length,top:top.slice(0,5),replayed:seeds.size,birthPrefixes:births.size}));
