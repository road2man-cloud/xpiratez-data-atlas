// Attach conditional career routes and their resumable state proof.
// Compare improvements against ALL earlier groups of the same pair,
// rather than claiming a group-level novelty is a pair-level improvement.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {MODEL,createCareerModel,PROMOTE,GROW} from "./population-career-frontier-core.mjs";
import {CACHE_SCHEMA} from "./population-career-transition-cache.mjs";
import {SCHEDULER_SCHEMA} from "./population-career-closure-scheduler.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=x=>JSON.parse(gunzipSync(x));
const path="public/data/",reg=path+"branch-soldier-results.json.gz",file="soldier-population-career-frontier.json.gz",proofFile="soldier-population-career-frontier-proof.json.gz";
const bytes=fs.readFileSync(path+file),a=decode(bytes),db=decode(fs.readFileSync(reg)),meta=db.populationAssumedBirthClosure,env=db.populationCareerEnvelope,v=db.populationSearch.versions.D3;
assert.equal(a.kind,"POPULATION_CONDITIONAL_CAREER_FRONTIER");assert.equal(a.model,MODEL);
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(a.source.sha256,meta.sha256);assert.equal(a.source.pairMapHash,meta.pairMapHash);assert.equal(a.envelope.sha256,env.sha256);assert.equal(a.sourceD3Sha256,v.sha256);
assert.equal(a.identity,key([MODEL,meta.sha256,env.sha256,v.sha256,a.hashes]));
for(const [p,h] of Object.entries(a.hashes))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,"Source drift "+p);
const load=m=>{const b=fs.readFileSync(path+m.file);assert.equal(sha(b),m.sha256);return decode(b);};
const src=load(meta),snap=load(v),data=JSON.parse(fs.readFileSync(path+"soldiers-modern-index.json"));
assert.deepEqual(a.origins,src.origins);assert.deepEqual(a.branches,src.branches);assert.deepEqual(a.stats,db.stats);
for(const k of ["globalCompleted","globalOptimalCertified","actualGameCertified"])assert.equal(a.summary[k],0);
const {base,preset,scenario,careerBits}=createCareerModel(data,snap);
const proof=fs.readFileSync(process.argv[2]||(a.schedulerSchema===SCHEDULER_SCHEMA?"population-career-frontier-v3.checkpoint.json.gz":a.cacheSchema===CACHE_SCHEMA?"population-career-frontier-v2.checkpoint.json.gz":"population-career-frontier.checkpoint.json.gz")),p=decode(proof);
assert.equal(p.identity,a.identity);assert.equal(p.digest,key(p.payload));
if(a.cacheSchema){assert.equal(a.cacheSchema,CACHE_SCHEMA);assert.equal(p.payload.cacheSchema,CACHE_SCHEMA);assert.deepEqual(a.migration,p.payload.migration);}
if(a.schedulerSchema){assert.equal(a.schedulerSchema,SCHEDULER_SCHEMA);assert.equal(p.payload.schedulerSchema,SCHEDULER_SCHEMA);assert.deepEqual(a.schedulerMigration,p.payload.schedulerMigration);assert.deepEqual(a.summary.roundScheduler,p.payload.roundScheduler);}
assert.equal(p.payload.nodes.length,a.summary.storedStates);
const work=new Map(p.payload.work.map(g=>[g.group,g])),groups={},routeIds=new Set();
let count=0,closed=0,permanentNovel=0;
for(const g of a.groups){
 assert(!groups[g.group]);const source=src.groups[g.group],w=work.get(g.group);
 assert(source&&w);assert.equal(g.mask,source.mask);assert.equal(g.status,w.status);
 assert.equal(g.states,w.records.length);assert.equal(g.expanded,w.cursor);
 const mask=BigInt("0x"+g.mask);assert(mask&careerBits);
 assert.deepEqual(g.medals,preset(mask));
 const model=scenario(mask,g.medals);
 if(g.status==="FIXED_PRESET_NUMERIC_CLOSED"){assert(w.audit?.ok&&w.outside===0&&w.cursor===w.records.length);closed++;}
 for(const f of g.frontier){
  assert(!routeIds.has(f.id));routeIds.add(f.id);count++;
  let s=source.roots[1];
  for(const act of f.actions){
   const i=act.kind==="CAP_TARGET"?GROW:act.kind==="ASSUMED_PROMOTION"?PROMOTE:base.rules.findIndex(r=>r.id===act.id);
   assert(i===GROW||i===PROMOTE||i>=0);
   assert(model.actions(s,mask).includes(i),"Action not in fixed research model");
   const t=model.transition(s,i);assert.equal(t.kind,"OK");s=t.state;
   if(act.kind==="ASSUMED_PROMOTION")assert.equal(s[4],act.rank);
   if(act.kind==="TRANSFORM")assert.deepEqual(act.requiredMedals,base.rules[i].requiredCommendations||{});
  }
  const t=model.terminal(s);
  for(const k of Object.keys(t))assert.deepEqual(f[k],t[k],"Candidate replay differs "+f.id+"/"+k);
  const old=meta.groups[g.group].frontier.filter(x=>x.body===f.body);
  const novel=v=>!old.some(x=>x.vector.every((n,i)=>n>=v[i]));
  assert.equal(f.novelPermanent,novel(f.permanentVector));assert.equal(f.novelMedalInclusive,novel(f.vector));
  assert(f.novelPermanent||f.novelMedalInclusive);if(f.novelPermanent)permanentNovel++;
 }
 groups[g.group]={...g,admittedPairIndices:[]};
}
assert.equal(a.groups.length,work.size);assert.equal(count,a.summary.novelRoutes);assert.equal(closed,a.summary.closedGroups);assert.equal(permanentNovel,a.summary.permanentNovel);
const dominates=(a,b)=>a.every((n,i)=>n>=b[i]),classImprovements={},width=src.branches.length;
let pairImproved=0,admittedImproved=0,medalImproved=0;
for(let pi=0;pi<src.pairGroups.length;pi++){
 const gs=src.pairGroups[pi],admitted=new Set(src.admittedGroups[pi]),i=Math.floor(pi/width),j=pi%width,cid=meta.classIndex[i][j];
 const cl=meta.classes[cid];assert(cl);assert.deepEqual([...gs].sort((a,b)=>a-b),[...cl.groups].sort((a,b)=>a-b));
 for(const gi of gs)if(groups[gi]&&admitted.has(gi))groups[gi].admittedPairIndices.push(pi);
 if(!Object.hasOwn(classImprovements,cid)){
  const previous=gs.flatMap(gi=>meta.groups[gi].frontier);
  const refs=[];
  for(const gi of gs)for(const [ri,f] of (groups[gi]?.frontier||[]).entries()){
   const old=previous.filter(x=>x.body===f.body);
   const permanent=!old.some(x=>dominates(x.vector,f.permanentVector));
   const effective=!old.some(x=>dominates(x.vector,f.vector));
   if(permanent||effective)refs.push({group:gi,route:ri,permanent,effective});
  }
  classImprovements[cid]=refs;
 }
 const refs=classImprovements[cid];
 if(refs.some(r=>r.permanent))pairImproved++;
 if(refs.some(r=>r.permanent&&admitted.has(r.group)))admittedImproved++;
 if(refs.some(r=>r.effective))medalImproved++;
}
const summary={...a.summary,pairLevelPermanentImproved:pairImproved,admittedPairLevelPermanentImproved:admittedImproved,pairLevelEffectiveImproved:medalImproved,
 improvedClasses:Object.values(classImprovements).filter(rs=>rs.some(r=>r.permanent)).length,independentRouteReplays:count};
const old=db.populationCareerFrontier;
if(old){
 if(old.identity!==a.identity){
  assert.equal(a.cacheSchema,CACHE_SCHEMA,"Unknown frontier migration");
  const migration=a.schedulerSchema===SCHEDULER_SCHEMA?a.schedulerMigration:a.migration;
  assert.equal(migration?.fromIdentity,old.identity,"Migration identity mismatch");
  assert.equal(migration?.fromProofSha256,old.proof.sha256,"Migration proof mismatch");
  assert.equal(sha(fs.readFileSync(path+old.proof.file)),old.proof.sha256,"Prior proof asset drift");
  assert.equal(migration.fromGroups,old.summary.processedGroups);
  assert.equal(migration.fromRoutes,old.summary.novelRoutes);
  if(a.schedulerSchema===SCHEDULER_SCHEMA){
   assert.equal(migration.kind,"SCHEDULING_ONLY");
   assert.equal(migration.fromStates,old.summary.storedStates);
   assert.equal(migration.fromClosedGroups,old.summary.closedGroups);
   assert.equal(migration.fromClosedPairs,old.summary.modelClosedPairs);
   assert(summary.modelClosedPairs>=old.summary.modelClosedPairs,"Refusing pair closure rollback");
  }else assert.equal(migration.legacyEdges,migration.uniqueEdges+migration.mergedEdges);
 }
 assert(summary.processedGroups>=old.summary.processedGroups,"Refusing frontier rollback");
 assert(summary.closedGroups>=old.summary.closedGroups,"Refusing closed-group rollback");
 for(const [id,prev] of Object.entries(old.groups)){
  const next=groups[id];assert(next,"Prior group missing "+id);
  if(prev.status==="FIXED_PRESET_NUMERIC_CLOSED"){
   assert.equal(next.status,prev.status,"Closed status changed "+id);
   assert.deepEqual(next.frontier,prev.frontier,"Closed frontier changed "+id);
  }else{
   for(const f of prev.frontier){
    if(next.frontier.some(g=>g.id===f.id))continue;
    const candidates=next.frontier.filter(g=>g.body===f.body);
    assert(!f.novelPermanent||candidates.some(g=>dominates(g.permanentVector,f.permanentVector)),"Prior permanent candidate lost "+f.id);
    assert(!f.novelMedalInclusive||candidates.some(g=>dominates(g.vector,f.vector)),"Prior medal candidate lost "+f.id);
   }
  }
 }
}
fs.writeFileSync(path+proofFile+".tmp",proof);fs.renameSync(path+proofFile+".tmp",path+proofFile);
db.populationCareerFrontier={schemaVersion:1,kind:a.kind,model:a.model,identity:a.identity,sourceMetadataSha256:a.sourceMetadataSha256,
 source:a.source,envelope:a.envelope,scope:a.scope,summary,file,sha256:sha(bytes),bytes:bytes.length,cacheSchema:a.cacheSchema||null,migration:a.migration||null,schedulerSchema:a.schedulerSchema||null,schedulerMigration:a.schedulerMigration||null,
 proof:{file:proofFile,sha256:sha(proof),bytes:proof.length},groups,classImprovements};
db.summary.populationCareerFrontier=summary;
db.sources.POPCAREERFRONTIER12={file:a.schedulerSchema===SCHEDULER_SCHEMA?"tools/build-population-career-frontier-v3.mjs":a.cacheSchema===CACHE_SCHEMA?"tools/build-population-career-frontier-v2.mjs":"tools/build-population-career-frontier.mjs",fingerprint:a.identity,sourceMetadataSha256:a.sourceMetadataSha256,asset:file,sha256:sha(bytes)};
db.policies.POPCAREERFRONTIER12="출생 가정, 관측 고정 연구 및 필수 훈장 단일 프리셋, 가정 승급, 독립 최대 난수/성장 모형의 신규 조건부 파레토 후보. 개별 행동 재생은 수치모형 안의 도달성을 보이며 실제 캠페인 달성이나 전체 분기의 최적성 인증이 아님.";
fs.writeFileSync(reg+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(reg+".tmp",reg);
console.log(JSON.stringify({summary,routeBytes:bytes.length,proofBytes:proof.length,registeredWitnesses:Object.keys(db.witnesses).length}));
