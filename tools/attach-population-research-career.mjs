// Independently replay the extra-research witnesses before publishing.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {MODEL,sha,key,sum,SOURCES,sourceFingerprints,pairKey,dominates,baseline,createResearchCareer} from "./population-research-career-v2-core.mjs";
import {exactWorld} from "./population-growth-replay-core.mjs";
const file="public/data/branch-soldier-results.json.gz",decode=b=>JSON.parse(z.gunzipSync(b)),read=p=>JSON.parse(fs.readFileSync(p));
const db=decode(fs.readFileSync(file)),bytes=fs.readFileSync(process.argv[2]||"population-research-career.json.gz"),a=decode(bytes),data=read("public/data/soldiers-modern-index.json");
assert.equal(a.kind,"POPULATION_RESEARCH_CAREER");assert.equal(a.model,MODEL);assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.deepEqual(a.sourceFingerprints,sourceFingerprints(db));assert.equal(a.fingerprint,key([MODEL,a.sourceMetadataSha256,a.sourceFingerprints,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Dependency drift "+p);
for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
if(db.populationResearchCareer)for(const [id,r] of Object.entries(db.populationResearchCareer.routes))assert.deepEqual(a.routes[id],r,"Prior route lost "+id);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const engine=createResearchCareer(data,db,a.hashes,{seedCacheHashes:a.seedCacheHashes||null}),{replay}=engine,base=baseline(db),best=new Map(),published=[],outside=[];
const env=db.populationCareerEnvelope,oi=new Map(env.origins.map((id,i)=>[id,i])),bi=new Map(env.branches.map((id,i)=>[id,i]));
const before=Object.keys(db.witnesses).length;
for(const [id,r] of Object.entries(a.routes)){
 assert(SOURCES.includes(r.seedLedger)&&db[r.seedLedger].published.includes(r.seed));
 const b=engine.load(r.seedLedger,r.seed),s=b.r;
 for(const k of ["input","kind","pair","origin","branch","root"])assert.equal(r[k],s[k]);
 assert.equal(r.seedActionHash,s.fullActionHash);assert.equal(r.seedStateHash,s.canonicalStateHash);
 assert.equal(r.birthActionHash,b.p.fullActionHash);assert.equal(r.birthStateHash,b.p.stateHash);
 assert.equal(r.fullActionHash,key([...b.birth,...r.actions]));assert.equal(id,"POPRCAREER12:"+key([r.input,r.actions]).slice(0,24));
 assert.deepEqual(r.actions.slice(0,s.actions.length),s.actions);
 const suffix=r.actions.slice(s.actions.length),policy=engine.policy(r.branch,b.n);let w=b.n.world,goalSeen=false,secondarySeen=false,secondaryMissing=false;
 for(const action of suffix){
  const primary=action.type==="transform"&&action.transform===r.goal&&!goalSeen;
  if(primary){
   const rule=replay.rules.get(r.goal);assert(rule.requires.every(k=>replay.active(w,k)));assert(rule.requires.some(k=>!replay.active(b.n.world,k)));
  }
  if(!primary&&r.secondaryGoal&&goalSeen&&action.type==="transform"&&action.transform===r.secondaryGoal&&!secondarySeen){
   assert(secondaryMissing,"Secondary research not newly needed after primary");
   assert(replay.rules.get(r.secondaryGoal).requires.every(k=>replay.active(w,k)));secondarySeen=true;
  }
  const next=replay.apply(w,action);
  if(primary){goalSeen=true;if(r.secondaryGoal)secondaryMissing=replay.rules.get(r.secondaryGoal).requires.some(k=>!replay.active(next,k));}
  assert(![...next.researched].some(k=>!w.researched.has(k)&&(policy.blocked.has(k)||policy.opposing.has(k))),"Opposing/blocked research");
  assert(!policy.commit.some(k=>replay.active(w,k)&&!replay.active(next,k)),"Branch commitment lost");
  w=next;
 }
 assert(goalSeen&&!w.pendingFree);if(r.secondaryGoal)assert(secondarySeen,"Secondary transformation missing");assert.equal(exactWorld(w),r.canonicalStateHash);
 const f=replay.finish(w);for(const k of Object.keys(f))assert.deepEqual(r[k],f[k],"Final state "+k);
 assert.deepEqual(r.permanentVector,r.permanentCapVector);assert.equal(r.actualGameCertified,false);
 const added=[...w.researched].filter(k=>replay.active(w,k)&&!replay.active(b.n.world,k));assert(added.length);assert.deepEqual(r.addedResearch,added);
 assert.deepEqual(r.order,r.actions.filter(a=>a.type==="transform").map(a=>a.transform));
 const allowed=engine.context(r.branch,b.p,[...b.birth,...r.actions],w).filter(i=>s.allowedDifficulties.includes(i));assert(allowed.length);assert.deepEqual(r.allowedDifficulties,allowed);
 const pk=pairKey(r),xs=base.get(pk)||[],old=xs.length?Math.max(...xs.map(sum)):null;
 assert(!xs.some(v=>dominates(v,r.permanentVector)));assert.equal(r.baselineBestSum,old);assert.equal(r.sumDelta,old===null?null:sum(r.permanentVector)-old);
 const bound=env.groups[env.pairClasses[oi.get(r.origin)][bi.get(r.branch)]]?.bounds.find(v=>v.body===r.body);
 if(!bound||r.vector.some((v,i)=>v>bound.effective[i])||r.raw.some((v,i)=>v>bound.raw[i]))outside.push(id);
 const prev=best.get(pk);if(!prev||sum(r.permanentVector)>sum(prev.permanentVector))best.set(pk,{id,...r,careerGap:bound?sum(bound.effective)-sum(r.vector):null});
 const witness={source:"POPRCAREER12",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:r.raw,bonus:r.permanentBonus,vector:r.permanentVector,steps:r.order.map(id=>({id,count:1})),research:[...new Set([...r.addedResearch,...r.order.flatMap(id=>replay.rules.get(id)?.requires||[])])],placement:"CHRONOLOGICAL_ADDITIONAL_RESEARCH_CAREER_GROWTH",populationResearchCareer:{route:id,seed:r.seed,goal:r.goal,...(r.secondaryGoal?{secondaryGoal:r.secondaryGoal}:{}),addedResearch:r.addedResearch,fullActionHash:r.fullActionHash,rank:r.rank,medals:r.medals},actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],witness);db.witnesses[id]=witness;published.push(id);
}
assert.equal(published.length,a.summary.registeredRoutes);assert.equal(best.size,a.summary.improvedPairBodies);
assert.equal(Object.values(a.routes).filter(r=>r.secondaryGoal).length,a.summary.chainedRoutes??0);
const top=[...best.values()].sort((x,y)=>(y.sumDelta??-1)-(x.sumDelta??-1)||sum(y.permanentVector)-sum(x.permanentVector)).slice(0,20).map(({id,origin,branch,body,goal,addedResearch,permanentVector,vector,baselineBestSum,sumDelta,careerGap})=>({id,origin,branch,body,goal,researchCount:addedResearch.length,total:sum(permanentVector),medalTotal:sum(vector),baselineBestSum,sumDelta,careerGap}));
const newTerminals=[...best.values()].filter(r=>r.baselineBestSum===null).sort((x,y)=>sum(y.permanentVector)-sum(x.permanentVector)).slice(0,20).map(({id,origin,branch,body,goal,permanentVector})=>({id,origin,branch,body,goal,total:sum(permanentVector)}));
const summary={...a.summary,independentRouteReplays:published.length,replayMetrics:engine.metrics,careerEnvelopeConflicts:outside.length,top,newTerminals};
const asset="soldier-population-research-career.json.gz";fs.writeFileSync("public/data/"+asset,bytes);
db.populationResearchCareer={...a,published,summary,file:asset,sha256:sha(bytes),bytes:bytes.length,careerEnvelopeConflicts:outside};
db.summary.populationResearchCareer=summary;db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPRCAREER12={file:"tools/build-population-research-career.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.POPRCAREER12="시간순 모집·연구 상태에서 추가 연구를 실제 규칙으로 재생하고 성장·승급·훈장 조건을 가정한 시술 후보. 기존 분기 선택 유지, 훈장 자체 보너스 제외, 제한 탐색이며 전역 미인증.";
fs.writeFileSync(file+".tmp",z.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({registered:published.length,newWitnesses:Object.keys(db.witnesses).length-before,total:Object.keys(db.witnesses).length,conflicts:outside.length,top:top.slice(0,5),newTerminals:newTerminals.slice(0,4),replayMetrics:engine.metrics}));
