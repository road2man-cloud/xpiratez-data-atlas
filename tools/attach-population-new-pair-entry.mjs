// Independently replay new pair entry witnesses against the current registry.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
import {createGrowthReplay,exactWorld,member} from "./population-growth-replay-core.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {integratedCoverage} from "../public/branch-soldier-integrated-coverage.js";
const decode=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p))),read=p=>JSON.parse(fs.readFileSync(p)),sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const file="public/data/branch-soldier-results.json.gz",db=decode(file),a=decode(process.argv[2]||"population-new-pair-entry.json.gz"),data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(a.kind,"POPULATION_NEW_PAIR_ENTRY");assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.equal(a.summary.fullCompleted,0);assert.equal(a.summary.actualGameCertified,0);
const rootFile="D:/xpiratez-data-atlas/experiments/endgame-current-save/12-damsel-madgal-2280-cap-root-chronology.json",raw=fs.readFileSync(rootFile);assert.equal(sha(raw),a.sourceRootSha256);
const rd=JSON.parse(raw),evidence=new Map(rd.evidence.filter(e=>e.rawActionsRetained&&Array.isArray(e.rawActions)).map(e=>[e.rank+"|"+e.id,e])),plans=new Map([...(rd.oldExactRootPlans||[]),...(rd.oldChosenCauseRawProbes||[]),...(rd.newNoCauseProbes||[])].map(p=>[p.rank,p]));
const prior=db.populationNewPairEntry;
if(prior){for(const k of ["roots","routes","attempts"])for(const [id,v] of Object.entries(prior[k]))assert.deepEqual(a[k][id],v,"Lost old "+k+" "+id);}
const g=createGrowthReplay(data),branches=new Map(db.branches.map(b=>[b.id,b])),origins=new Map(data.profiles.map(p=>[p.id,p])),before=integratedCoverage(db);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
let replayed=0,newPairs=0,reused=0;
for(const [id,r] of Object.entries(a.routes)){
 const root=a.roots[r.root],p=origins.get(r.origin),b=branches.get(r.branch);
 assert(p&&b&&!b.sourceRootConflict&&b.historyCount&&b.rank===root.rank&&p.sourceType!=="event");
 assert.equal(id,"POPNEWPAIR12:"+key([r.origin,r.branch,[...root.actions,...r.actions]]).slice(0,24));
 assert.equal(key(root.actions),r.root);assert.equal(key([...root.actions,...r.actions]),r.fullActionHash);
 const ev=evidence.get(root.rank+"|"+root.historyId);assert(ev);assert.deepEqual(ev.rawActions,root.actions);
 const plan=plans.get(root.rank),commit=[...new Set([...plan.requiredActive,...b.captain,...Object.values(b.choices||{}).filter(Boolean)])],avoid=[...new Set([...plan.avoidIds,...(b.blockedResearch||[])])].sort();
 assert.deepEqual(r.commit,commit);assert.deepEqual(r.avoid,avoid);
 if(!prior?.routes?.[id]){
  const all=[...root.actions,...r.actions],birth=all.findIndex(x=>x.type==="recruit"&&x.soldier==="origin");
  assert(birth>=root.actions.length);assert.equal(all[birth].profile,r.origin);assert.equal(all[birth].band,"min");assert.equal(all.filter(x=>x.type==="recruit"&&x.soldier==="origin").length,1);
  const end=all[birth+1];assert(all.length===birth+1||(all.length===birth+2&&end.type==="conditionalCapGrowth"));
  const q=replayOriginWitness(all.slice(0,birth+1),data,{requireCompatibleContext:true});assert(q.ok,q.reason);
  assert(!q.trace.some(t=>t.added?.some(k=>avoid.includes(k))));assert(commit.every(k=>active(q.world,k)));assert(p.requires.every(k=>active(q.world,k)));
  assert.equal(member(q.world).state.soldierType,p.soldierType);
  const ctx=auditOriginCampaignContext(all.slice(0,birth+1),data);assert.equal(ctx.kind,"compatible");assert.deepEqual(r.allowedDifficulties,ctx.allowedDifficulties);
  const w=end?g.apply(q.world,end):q.world;assert.equal(exactWorld(w),r.canonicalStateHash);
  const f=g.finish(w);for(const k of Object.keys(f))assert.deepEqual(r[k],f[k],k);
  assert.deepEqual(r.raw,r.capRaw);assert.equal(r.actualGameCertified,false);
  replayed++;if(!before.pair(r.origin,r.branch)?.conditional)newPairs++;
 }else reused++;
 const witness={source:"POPNEWPAIR12",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:r.raw,bonus:r.bonus,vector:r.vector,steps:[],research:p.requires,placement:"REPLAYED_RETAINED_ROOT_MIN_BIRTH_AND_CONDITIONAL_CAP",populationNewPairEntry:{route:id,root:r.root,fullActionHash:r.fullActionHash,allowedDifficulties:r.allowedDifficulties},actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],witness);db.witnesses[id]=witness;
}
assert.equal(a.published.length,Object.keys(a.routes).length);assert.equal(new Set(a.published).size,a.published.length);
for(const id of a.published)assert(a.routes[id]);
const asset="soldier-population-new-pair-entry.json.gz",bytes=fs.readFileSync(process.argv[2]||"population-new-pair-entry.json.gz");
fs.writeFileSync("public/data/"+asset,bytes);
db.populationNewPairEntry={...a,file:asset,sha256:sha(bytes),bytes:bytes.length,summary:{...a.summary,newIndependentReplays:replayed,reusedPublished:reused,newConditionalPairs:newPairs}};
db.summary.populationNewPairEntry=db.populationNewPairEntry.summary;db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPNEWPAIR12={file:"tools/build-population-new-pair-entry.mjs",sourceRootSha256:a.sourceRootSha256,sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.POPNEWPAIR12="기존 조건부 근거가 없던 조합에서 보존 연구 이력과 비이벤트 출생 최솟값 모집을 재생하고 전투캡 성장을 가정한 별도 원장. 전역 미인증.";
fs.writeFileSync(file+".tmp",z.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({registered:a.published.length,replayed,reused,newPairs,total:Object.keys(db.witnesses).length}));
