// Publish independently replayed chronological bridges without overwriting
// the fixed numeric closure or existing chronological research ledgers.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {MODEL,LEDGER,birthCatalog,sourceIdentity,createBridge,pairKey} from "./population-frontier-chronology-core.mjs";
import {sha,key,sum,dominates} from "./population-research-career-core.mjs";
import {exactWorld} from "./population-growth-replay-core.mjs";
const reg="public/data/branch-soldier-results.json.gz",decode=x=>JSON.parse(gunzipSync(x)),read=p=>JSON.parse(fs.readFileSync(p));
const bytes=fs.readFileSync(process.argv[2]||"population-frontier-chronology.json.gz"),a=decode(bytes),db=decode(fs.readFileSync(reg)),data=read("public/data/soldiers-modern-index.json");
assert.equal(a.kind,"POPULATION_FRONTIER_CHRONOLOGY");assert.equal(a.model,MODEL);
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const {baseline:oldBaseline,...stable}=a.source,{baseline:currentBaseline,...current}=sourceIdentity(db);
assert.deepEqual(stable,current);assert.equal(a.fingerprint,key([MODEL,a.sourceMetadataSha256,stable,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Dependency drift "+p);
for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
if(db[LEDGER])for(const [id,r] of Object.entries(db[LEDGER].routes))assert.deepEqual(a.routes[id],r,"Prior route lost "+id);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const frontier=db.populationCareerFrontier,assumed=db.populationAssumedBirthClosure,env=db.populationCareerEnvelope;
const origins=new Map(assumed.origins.map((x,i)=>[x,i])),branches=new Map(assumed.branches.map((x,i)=>[x,i])),births=new Map(birthCatalog(db).map(r=>[r.input,r]));
const bridge=createBridge(data,db,a.hashes,{cache:false}),{replay,engine}=bridge;
// Compare to chronological witnesses, including the original birth and
// immediate transformation layers omitted from the worklist heuristic.
const baselineSources=new Set(["POPUNLOCK12","POPUNLOCKCONT12","POPEVENT12","POPEXT12","POPRESEARCH12","POPRESEARCHCHAIN12","POPGROW12","POPCHCAREER12","POPRCAREER12"]);
const base=new Map();
for(const w of Object.values(db.witnesses)){
 if(!baselineSources.has(w.source)||!Array.isArray(w.vector)||w.vector.length!==12)continue;
 for(const branch of w.branchIds||[]){
  const k=w.originProfile+"|"+branch+"|"+w.body,x=base.get(k)||[];
  if(!x.some(v=>dominates(v,w.vector)))base.set(k,[...x.filter(v=>!dominates(w.vector,v)),w.vector]);
 }
}
const comparisons={},published=[],improvedPairs=new Set(),improvedBodies=new Set(),positivePairs=new Set(),newBodies=new Set(),outside=[],maxima=Array(12).fill(null);
let exactMatches=0,addedResearch=0,improved=0,positive=0,maxDelta=0;
const before=Object.keys(db.witnesses).length;
for(const [id,r] of Object.entries(a.routes)){
 const origin=births.get(r.input);assert(origin);
 for(const [k,v] of Object.entries(origin))assert.equal(r[k],v);
 const i=origins.get(r.origin),j=branches.get(r.branch),cl=assumed.classes[assumed.classIndex[i][j]];
 assert(cl.groups.includes(r.sourceGroup));
 const f=frontier.groups[r.sourceGroup].frontier.find(x=>x.id===r.sourceRoute);assert(f);
 assert.equal(r.sourceActionHash,key(f.actions));assert.deepEqual(r.sourcePermanentVector,f.permanentVector);
 assert.deepEqual(r.order,f.actions.filter(x=>x.kind==="TRANSFORM").map(x=>x.id));
 const b=bridge.loadBirth(origin);assert.equal(r.birthActionHash,b.p.fullActionHash);assert.equal(r.birthStateHash,b.p.stateHash);
 assert.equal(r.fullActionHash,key([...b.birth,...r.actions]));assert.equal(id,"POPFRONTCH12:"+key([r.input,r.fullActionHash]).slice(0,24));
 const policy=engine.policy(r.branch,b.n);let w=b.n.world;
 for(const action of r.actions){
  const next=replay.apply(w,action);
  assert(![...next.researched].some(k=>!w.researched.has(k)&&(policy.blocked.has(k)||policy.opposing.has(k))),"Opposing or blocked research");
  assert(!policy.commit.some(k=>replay.active(w,k)&&!replay.active(next,k)),"Branch commitment lost");
  w=next;
 }
 assert(!w.pendingFree);assert.equal(exactWorld(w),r.canonicalStateHash);
 const end=replay.finish(w);for(const k of Object.keys(end))assert.deepEqual(r[k],end[k],"Final field "+k);
 assert.equal(r.body,f.body);assert.deepEqual(r.order,r.actions.filter(a=>a.type==="transform").map(a=>a.transform));
 assert.equal(r.actualGameCertified,false);
 assert.deepEqual(r.allowedDifficulties,engine.context(r.branch,b.p,[...b.birth,...r.actions],w));assert(r.allowedDifficulties.length);
 const research=[...w.researched].filter(k=>replay.active(w,k)&&!replay.active(b.n.world,k));assert.deepEqual(research,r.addedResearch);
 const match=JSON.stringify(r.permanentVector)===JSON.stringify(f.permanentVector);assert.equal(r.numericExactMatch,match);
 if(match)exactMatches++;if(research.length)addedResearch++;
 const k=pairKey(r),old=base.get(k)||[],best=old.length?Math.max(...old.map(sum)):null,total=sum(r.permanentVector),delta=best===null?null:total-best;
 const novel=!old.some(v=>dominates(v,r.permanentVector));
 comparisons[id]={baselineBestSum:best,total,sumDelta:delta,novel,newBody:!old.length};
 if(novel){improved++;improvedPairs.add(r.origin+"|"+r.branch);improvedBodies.add(k);if(!old.length)newBodies.add(k);}
 if(delta>0){positive++;positivePairs.add(k);maxDelta=Math.max(maxDelta,delta);}
 for(let j=0;j<12;j++)maxima[j]=Math.max(maxima[j]??-Infinity,r.permanentVector[j]);
 const bound=env.groups[env.pairClasses[i][j]]?.bounds.find(x=>x.body===r.body);
 if(!bound||r.vector.some((v,k)=>v>bound.effective[k])||r.raw.some((v,k)=>v>bound.raw[k]))outside.push(id);
 const witness={source:"POPFRONTCH12",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:r.raw,bonus:r.permanentBonus,vector:r.permanentVector,
  steps:r.order.map(id=>({id,count:1})),research:[...new Set([...r.addedResearch,...r.order.flatMap(id=>replay.rules.get(id)?.requires||[])])],
  placement:"FRONTIER_GUIDED_MIN_BIRTH_CHRONOLOGY",populationFrontierChronology:{route:id,sourceGroup:r.sourceGroup,sourceRoute:r.sourceRoute,fullActionHash:r.fullActionHash,rank:r.rank,medals:r.medals},actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],witness);db.witnesses[id]=witness;published.push(id);
}
assert.equal(published.length,a.summary.registeredRoutes);assert.equal(exactMatches,a.summary.exactNumericMatches);assert.equal(addedResearch,a.summary.additionalResearchRoutes);
for(const t of Object.values(a.attempts))if(t.status==="CONDITIONAL_REPLAY")assert(a.routes[t.route]);
const top=published.filter(id=>comparisons[id].novel).sort((x,y)=>(comparisons[y].sumDelta??-1)-(comparisons[x].sumDelta??-1)||comparisons[y].total-comparisons[x].total).slice(0,20).map(id=>({id,origin:a.routes[id].origin,branch:a.routes[id].branch,body:a.routes[id].body,...comparisons[id]}));
const summary={...a.summary,worklistComparison:{improvedRoutes:a.summary.improvedRoutes,newTerminalPairBodies:a.summary.newTerminalPairBodies},
 improvedRoutes:improved,improvedPairs:improvedPairs.size,improvedPairBodies:improvedBodies.size,newTerminalPairBodies:newBodies.size,
 positiveSumRoutes:positive,positiveSumPairBodies:positivePairs.size,maxSumDelta:maxDelta,permanentMax:maxima,independentRouteReplays:published.length,
 independentBirthReplays:bridge.metrics.birthReplays,careerEnvelopeConflicts:outside.length,baselineSources:[...baselineSources],top};
const asset="soldier-population-frontier-chronology.json.gz";fs.writeFileSync("public/data/"+asset+".tmp",bytes);fs.renameSync("public/data/"+asset+".tmp","public/data/"+asset);
db[LEDGER]={...a,summary,published,comparisons,careerEnvelopeConflicts:outside,file:asset,bytes:bytes.length,sha256:sha(bytes)};
db.summary[LEDGER]=summary;db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPFRONTCH12={file:"tools/build-population-frontier-chronology.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256,asset,sha256:sha(bytes)};
db.policies.POPFRONTCH12="고정 수치모형 파레토 행동 순서를 원본 최솟값 출생·실제 색인 연구 규칙에서 조건부 재생. 성장·계급·훈장·자원·이벤트 가정 유지, 미해결은 불가능성 아님. 원시 및 영구 수치 재계산, 전체 캠페인 전역 미인증.";
fs.writeFileSync(reg+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(reg+".tmp",reg);
console.log(JSON.stringify({summary:{...summary,top:top.slice(0,5)},newWitnesses:Object.keys(db.witnesses).length-before,registeredWitnesses:db.summary.registeredWitnesses,bytes:bytes.length}));
