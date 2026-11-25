// Register the same route records in the shared Soldier/Captain registry.
// Preserve all previously published routes and replay each new witness.
// The source graph and detailed action trie remain in the companion assets.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {key,sha} from "./population-research-career-core.mjs";
import {createCareerReplay} from "./population-chronological-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {traitSnapshot} from "./population-rank-trait-priority.mjs";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const file="public/data/branch-soldier-results.json.gz",asset="soldier-population-missing-origin-career.json.gz",db=decode(file),a=decode("public/data/"+asset),index=decode("public/data/soldier-population-missing-origin-career-index.json.gz");
const data=read("public/data/soldiers-modern-index.json");data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);assert.equal(index.sourceGraphSha256,a.sourceGraphSha256);assert.equal(key(a.graphs),a.sourceGraphSha256);
assert.equal(a.summary.actualGameCertified,0);
const old=db.populationMissingOriginCareer,branches=new Map(db.branches.map(b=>[b.id,b])),profiles=new Map(data.profiles.map(p=>[p.id,p])),replay=createCareerReplay(data);
for(const [id,r] of Object.entries(old?.routes||{}))assert.deepEqual(a.routes[id],r);
const active=(w,k)=>replay.active(w,k),worldCache=new Map([[0,foundationWorld()]]);
function full(prefix){const out=[];let i=prefix;while(i!==0){assert(Number.isInteger(i)&&i>0&&i<index.actionNodes.length);const n=index.actionNodes[i];out.push(n.action);assert(n.parent<i);i=n.parent;}return out.reverse();}
const replayMetrics={applied:0,checkpointHits:0};
function remember(i,w){
 if(i===0)return;
 worldCache.delete(i);worldCache.set(i,w);
 if(worldCache.size>160){const victim=[...worldCache.keys()].find(k=>k!==0);worldCache.delete(victim);}
}
function world(prefix){
 let p=prefix,path=[];while(!worldCache.has(p)){const n=index.actionNodes[p];assert(n.parent<p);path.push(p);p=n.parent;}
 let w=worldCache.get(p);if(p!==0){replayMetrics.checkpointHits++;remember(p,w);}
 let step=0;for(const i of path.reverse()){w=replay.apply(w,index.actionNodes[i].action);replayMetrics.applied++;if(++step%32===0||i===prefix)remember(i,w);}return w;
}
function ancestor(prefix,count){
 let i=prefix;for(let n=0;n<count;n++){assert(i>0);i=index.actionNodes[i].parent;}return i;
}
let replayed=0;
for(const [id,r] of Object.entries(a.routes)){
 const g=a.graphs[r.sourceGraph],n=g?.nodes[r.sourceNode],i=index.routes[id],b=branches.get(r.branch),p=profiles.get(r.origin);
 assert(g&&n&&i&&b&&p&&b.historyCount&&!b.sourceRootConflict);assert.equal(g.origin,r.origin);assert.equal(g.branch,r.branch);assert.equal(i.fullActionHash,r.fullActionHash);assert.equal(id,"MISSCAR:"+r.sourceGraph+":"+r.sourceNode);
 const steps=full(i.fullPrefix);assert.equal(key(steps),r.fullActionHash);assert.equal(steps.length,i.actionCount);
 const birth=steps[r.birthEvidence.birthAt];assert.equal(birth.type,"recruit");assert.equal(birth.profile,r.origin);assert.equal(birth.band,"min");assert.equal(birth.soldier,"origin");
 assert.equal(steps.filter(x=>x.type==="recruit"&&x.soldier==="origin").length,1);
 const c=auditOriginCampaignContext(steps,data);assert.equal(c.kind,"compatible");assert.deepEqual(r.allowedDifficulties,c.allowedDifficulties.filter(k=>g.allowedDifficulties.includes(k)));
 if(!old?.routes?.[id]){
  const before=world(ancestor(i.fullPrefix,steps.length-r.birthEvidence.birthAt));assert(!before.pendingFree&&!member(before));assert(p.requires.every(k=>active(before,k)));
  const w=world(i.fullPrefix);assert(!w.pendingFree);
  assert([...b.captain,...Object.values(b.choices||{})].filter(Boolean).every(k=>active(w,k)));
  assert(!(b.blockedResearch||[]).some(k=>w.researched.has(k)));
  assert.equal(exactWorld(w),r.canonicalStateHash);const f=replay.finish(w);
  for(const k of ["body","permanentVector","permanentCapVector","rank","medals"])assert.deepEqual(r[k],f[k]);
  assert.deepEqual(r.traitEvidence.retained,traitSnapshot(w));assert.equal(r.actualGameCertified,false);
  assert.deepEqual(r.order,steps.filter(x=>x.type==="transform"&&x.soldier==="origin").map(x=>x.transform));
  replayed++;
 }
 const witness={source:"MISSCAR",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:n.raw,bonus:n.permanentBonus,vector:r.permanentVector,steps:r.order.map(id=>({id,count:1})),research:[...new Set([...p.requires,...r.order.flatMap(id=>replay.rules.get(id)?.requires||[])])],placement:"REPLAYED_RECRUITMENT_AND_CONDITIONAL_CAREER",populationMissingOriginCareer:{route:id,sourceGraph:r.sourceGraph,sourceNode:r.sourceNode,fullActionHash:r.fullActionHash,allowedDifficulties:r.allowedDifficulties},actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],witness);db.witnesses[id]=witness;
}
const published=Object.keys(a.routes),pairs=new Set(Object.values(a.routes).map(r=>r.origin+"|"+r.branch));
db.populationMissingOriginCareer={schema:a.schema,sourceMetadataSha256:a.sourceMetadataSha256,sourceGraphSha256:a.sourceGraphSha256,fingerprint:a.fingerprint,file:asset,sha256:sha(fs.readFileSync("public/data/"+asset)),routes:a.routes,published,summary:{...a.summary,registeredPairs:pairs.size,newIndependentReplays:replayed},scope:a.scope};
db.summary.populationMissingOriginCareer=db.populationMissingOriginCareer.summary;db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.MISSCAR={file:a.schema==="COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V8_SHARED_PREFIX"?"tools/build-population-shared-career-v2.mjs":a.schema==="COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V7_SHARED"?"tools/build-population-shared-career-v1.mjs":"tools/build-population-missing-origin-career-v6.mjs",sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.MISSCAR="동일 v.o2 연구·모집·성장·시술의 조건부 시간순 재생. 최솟값 모집, 자원 및 성장 가정. 실제 게임 전역 인증 아님.";
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(db),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({routes:published.length,pairs:pairs.size,replayed,origins:new Set(Object.values(a.routes).map(r=>r.origin)).size,replayMetrics}));
