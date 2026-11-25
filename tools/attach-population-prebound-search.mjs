// Attach finite-objective proofs and all tie/provenance sidecars. Never
// substitute these objective-specific results for unrestricted body maxima.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(zlib.gunzipSync(b));
const file="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(file)),v=db.populationSearch.versions.D3;
const engine=key(["tools/build-population-prebound-search.mjs","tools/population-scalar-upper-bound.mjs","public/soldiers/modern/eligibility.js","public/soldiers/modern/research-training-locks.js","public/data/soldiers-modern-index.json"].map(p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))));
const source=decode(fs.readFileSync("public/data/"+v.file)),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const profiles=new Map(data.profiles.map(p=>[p.id,p])),rules=new Map(data.transformations.map(r=>[r.id,r]));
const existing=db.populationPreboundSearch,versions={...(existing?.versions||{})},stats=db.stats;
const specs=process.argv.slice(2);if(!specs.length)specs.push("total-d5","mana-d6","firing-d6","strength-d6","total-d6");
const count=x=>x.reduce((s,n)=>s+n,0);
for(const spec of specs){
 const input="population-prebound-"+spec+".json.gz",bytes=fs.readFileSync(input),a=decode(bytes),s=a.summary;
 assert.equal(a.kind,"POPULATION_PREGENERATION_BOUND");assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(a.sourceD3Sha256,v.sha256);assert.equal(a.engine,engine);
 assert(s.complete&&!s.full&&s.groupsVisited===a.groups.length&&s.actualGameCertified===0);assert.equal(a.tieSha256,key(a.ties));assert.equal(s.ties,a.ties.length);assert.equal(s.prunedPrefixes,a.certificates.length);
 assert.deepEqual(a.rules,source.rules);assert.equal(s.pairs,source.summary.coveredPairs);assert.equal(s.modeledOrigins,new Set(a.groups.map(g=>g.originProfile)).size);
 const seen=new Set();
 for(const g of a.groups){
  assert.equal(a.groups[g.index],g);assert(profiles.has(g.originProfile));assert.deepEqual(g.branchIds,[...new Set(g.historyIndices.map(i=>source.histories[i].branchId))].sort());
  for(const hi of g.historyIndices){const k=g.originProfile+"|"+hi;assert(!seen.has(k));seen.add(k);}
 }
 const expected=new Set(source.groups.flatMap(g=>g.historyIndices.map(i=>g.originProfile+"|"+i)));
 assert.equal(seen.size,expected.size);assert([...seen].every(k=>expected.has(k)));
 const oi=stats.indexOf(a.query.objective),score=t=>oi<0?count(t.vector):t.vector[oi];
 const byGroup=new Map();
 for(let i=0;i<a.ties.length;i++){
  const t=a.ties[i],g=a.groups[t.group];assert(g&&t.order.length<=a.depth&&t.order.length===t.growth.length);assert(["min","max"].includes(t.band));
  assert(t.order.every(j=>BigInt("0x"+g.mask)&(1n<<BigInt(j))));assert.equal(score(t),s.bestScore);
  assert([t.raw,t.bonus,t.vector].every(x=>x.length===12&&x.every(Number.isSafeInteger)));
  assert(a.query.maxFees==null||t.fees<=a.query.maxFees);assert(Object.entries(a.query.targets).every(([k,n])=>t.vector[stats.indexOf(k)]>=n));
  assert.equal(t.fees,t.order.reduce((n,j)=>n+Math.max(0,rules.get(a.rules[j]).cost||0),0));
  let xs=byGroup.get(t.group);if(!xs){xs=[];byGroup.set(t.group,xs);}xs.push(i);
 }
 for(const c of a.certificates){
  assert(a.groups[c.group]&&c.order.length===c.growth.length&&c.left+c.order.length===a.depth);
  assert(["Objective","Target","Fees"].includes(c.reason));
  if(c.reason==="Fees")assert(c.bound>c.threshold&&c.threshold===a.query.maxFees);
  else {assert(c.bound<c.threshold);if(c.reason==="Objective")assert(c.threshold<=s.bestScore);else assert(Object.values(a.query.targets).includes(c.threshold));}
 }
 // Every exact tie is retained in the public artifact; select a small set of
 // explanatory representatives, not an independently synthesized stat vector.
 const representatives=new Set();
 for(const xs of byGroup.values()){
  const select=(cmp)=>xs.reduce((best,i)=>cmp(a.ties[i],a.ties[best])<0?i:best,xs[0]);
  representatives.add(select((x,y)=>count(y.vector)-count(x.vector)||x.fees-y.fees||x.order.length-y.order.length));
  representatives.add(select((x,y)=>x.fees-y.fees||x.order.length-y.order.length||count(y.vector)-count(x.vector)));
  representatives.add(select((x,y)=>x.order.length-y.order.length||x.fees-y.fees||count(y.vector)-count(x.vector)));
  for(let j=0;j<12;j++)representatives.add(select((x,y)=>y.vector[j]-x.vector[j]||x.fees-y.fees||x.order.length-y.order.length));
 }
 const ids=[];
 for(const i of representatives){
  const t=a.ties[i],g=a.groups[t.group],order=t.order.map(j=>a.rules[j]),id="POPPREBOUND12:"+key([spec,a.tieSha256,i]).slice(0,24);
  const w={source:"POPPREBOUND12",originProfile:g.originProfile,branchIds:g.branchIds,body:t.body,raw:t.raw,bonus:t.bonus,vector:t.vector,steps:order.map(id=>({id,count:1})),growthBefore:t.growth.map(Boolean),birthBand:t.band,fees:t.fees,research:[...new Set([...(profiles.get(g.originProfile).requires||[]),...order.flatMap(id=>rules.get(id).requires)])].sort(),placement:"FIXED_ACTIVE_RESEARCH_PREBOUND_CAP_TARGET",populationPrebound:{version:spec,tieIndex:i,group:t.group,historyIds:g.historyIndices.map(j=>source.histories[j].id),tieSha256:a.tieSha256},actualGameCertified:false};
  if(db.witnesses[id])assert.deepEqual(db.witnesses[id],w);db.witnesses[id]=w;ids.push(id);
 }
 const asset="soldier-population-prebound-"+spec+".json.gz";fs.writeFileSync("public/data/"+asset,bytes);
 let benchmark=null;
 const baselinePath="population-prebound-"+spec+"-full.json.gz";
 if(fs.existsSync(baselinePath)){
  const bBytes=fs.readFileSync(baselinePath),b=decode(bBytes);
  if(b.engine===a.engine){
   assert(b.summary.full&&b.summary.complete);assert.deepEqual(b.groups,a.groups);assert.deepEqual(b.query,a.query);assert.equal(b.tieSha256,a.tieSha256);assert.deepEqual(b.ties,a.ties);assert.equal(b.summary.bestScore,s.bestScore);
   const bFile="soldier-population-prebound-"+spec+"-full.json.gz";fs.writeFileSync("public/data/"+bFile,bBytes);
   benchmark={file:bFile,sha256:sha(bBytes),bytes:bBytes.length,sameTieHash:true,fullLabels:b.summary.visitedLabels,fullStates:b.summary.exactStatesGenerated,fullMs:b.summary.elapsedMs,speedup:b.summary.elapsedMs/s.elapsedMs,fullCpuMs:b.summary.cpuMs,fullPeakRssBytes:b.summary.peakRssBytes};
  }
 }
 const entry={id:spec,depth:a.depth,query:a.query,engine,sourceD3Sha256:v.sha256,summary:s,benchmark,scope:a.scope,file:asset,sha256:sha(bytes),bytes:bytes.length,tieSha256:a.tieSha256,witnessIds:ids,winningGroups:[...byGroup].map(([g,xs])=>({group:g,originProfile:a.groups[g].originProfile,branchIds:a.groups[g].branchIds,ties:xs.length})),actualGameCertified:false};
 versions[spec]=entry;console.log(JSON.stringify({spec,score:s.bestScore,ties:s.ties,representatives:ids.length,bytes:bytes.length,benchmark}));
}
const latest={};for(const [id,x] of Object.entries(versions)){const k=x.query.objective;if(!latest[k]||versions[latest[k]].depth<x.depth)latest[k]=id;}
db.populationPreboundSearch={schemaVersion:1,sourceMetadataSha256:db.sourceMetadataSha256,sourceD3Sha256:v.sha256,versions,latest,scope:"FINITE_OBJECTIVE_PROOF_NOT_GLOBAL_GAME: fixed research and deterministic ordinary actions, min/max birth and CAP_TARGET growth, no future research/rank/medals/random transforms/full growth paths; independent scalar bounds relax cross-stat gates and keep positive bonuses."};
db.summary.populationPreboundSearch={versions:Object.keys(versions).length,latest:Object.fromEntries(Object.entries(latest).map(([k,id])=>[k,{id,depth:versions[id].depth,bestScore:versions[id].summary.bestScore,ties:versions[id].summary.ties,benchmark:versions[id].benchmark}])),actualGameCertified:0};
db.sources.POPPREBOUND12={file:"tools/build-population-prebound-search.mjs",engine,sourceD3Sha256:v.sha256,sourceMetadataSha256:db.sourceMetadataSha256};
db.policies.POPPREBOUND12="미생성 후속 상태에서 목적별 스칼라 상계로 엄격하게 열등한 경로만 생략. 27개 출생처·539그룹 제한 모델이며 실제 게임 전역 최적성은 미인증. 모든 동점 순서·가지치기 증거는 별도 gzip에 보존.";
db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
fs.writeFileSync(file,zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));
console.log("registered",db.summary.registeredWitnesses);
