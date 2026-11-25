// Independent chronological replay for new-pair continuations.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createGrowthReplay,exactWorld,member} from "./population-growth-replay-core.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(z.gunzipSync(b)),read=p=>JSON.parse(fs.readFileSync(p));
const file="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(file)),bytes=fs.readFileSync(process.argv[2]||"population-new-pair-career.json.gz"),a=decode(bytes),data=read("public/data/soldiers-modern-index.json"),entry=db.populationNewPairEntry;
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(a.kind,"POPULATION_NEW_PAIR_CAREER");assert.equal(a.scheduler,2);assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.equal(a.summary.actualGameCertified,0);assert.equal(a.summary.fullCompleted,0);
const prior=db.populationNewPairCareer;
if(prior){for(const [id,r] of Object.entries(prior.routes))assert.deepEqual(a.routes[id],r,"Lost route "+id);}
const g=createGrowthReplay(data),rootCache=new Map(),seedCache=new Map(),active=(w,k)=>g.active(w,k);
function seed(id){
 if(seedCache.has(id))return seedCache.get(id);
 const r=entry.routes[id],root=entry.roots[r.root];assert(r&&root&&db.witnesses[id]);
 let base=rootCache.get(r.root);if(!base){const rr=replayOriginWitness(root.actions,data,{requireCompatibleContext:true});assert(rr.ok,rr.reason);base=rr.world;rootCache.set(r.root,base);}
 const birth=r.actions.at(-1)?.type==="conditionalCapGrowth"?r.actions.slice(0,-1):r.actions;
 const w=g.replay(birth,base);assert.equal(exactWorld(g.grow({world:w,steps:birth}).world),r.canonicalStateHash);
 const b={r,root,birth,world:w};seedCache.set(id,b);return b;
}
const hashes=Object.fromEntries(["tools/population-growth-replay-core.mjs","tools/population-scalar-upper-bound.mjs","tools/origin-pair-exact-prefix-checkpoint.mjs",...fs.readdirSync("public/soldiers/modern").filter(n=>n.endsWith(".js")&&n!=="app.js").sort().map(n=>"public/soldiers/modern/"+n)].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const sameDeps=prior&&key(prior.replayHashes)===key(hashes);
let replayed=0,reused=0,added=0;
for(const [id,r] of Object.entries(a.routes)){
 const p=entry.routes[r.seed];assert(p);
 for(const k of ["origin","branch","root"])assert.equal(r[k],p[k]);assert.equal(r.seedActionHash,p.fullActionHash);
 assert.equal(id,"POPNEWCAREER12:"+key([r.seed,r.actions]).slice(0,24));assert.equal(r.actualGameCertified,false);
 assert(r.order.length&&r.allowedDifficulties.length);
 if(prior?.routes[id]&&sameDeps){assert(db.witnesses[id]);reused++;}
 else{
  const b=seed(r.seed),full=[...b.root.actions,...b.birth,...r.actions];assert.equal(key(full),r.fullActionHash);
  let w=b.world;for(const step of r.actions){
   assert(!["recruit","conditionalPromotion","conditionalMedal"].includes(step.type));
   const next=g.apply(w,step);
   assert(![...next.researched].some(k=>!w.researched.has(k)&&p.avoid.includes(k)),"Forbidden research");
   assert(!p.commit.some(k=>active(w,k)&&!active(next,k)),"Commitment lost");
   w=next;
  }
  assert(!w.pendingFree&&p.commit.every(k=>active(w,k)));assert.equal(exactWorld(w),r.canonicalStateHash);
  const f=g.finish(w);for(const k of Object.keys(f))assert.deepEqual(r[k],f[k],k);
  assert.deepEqual(r.raw,r.capRaw);
  assert.deepEqual(r.order,r.actions.filter(a=>a.type==="transform").map(a=>a.transform));
  const ctx=auditOriginCampaignContext(full,data);assert.equal(ctx.kind,"compatible");assert.deepEqual(r.allowedDifficulties,ctx.allowedDifficulties.filter(k=>p.allowedDifficulties.includes(k)));
  replayed++;
 }
 const witness={source:"POPNEWCAREER12",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:r.raw,bonus:r.bonus,vector:r.vector,steps:r.order.map(id=>({id,count:1})),research:[...new Set(r.order.flatMap(id=>g.rules.get(id)?.requires||[]))],placement:"REPLAYED_NEW_PAIR_RESEARCH_GROWTH_TRANSFORM",populationNewPairCareer:{route:id,seed:r.seed,fullActionHash:r.fullActionHash,allowedDifficulties:r.allowedDifficulties},actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],witness);else added++;db.witnesses[id]=witness;
}
assert.equal(a.published.length,Object.keys(a.routes).length);assert.equal(new Set(a.published).size,a.published.length);for(const id of a.published)assert(a.routes[id]);
assert.equal(a.summary.registeredRoutes,a.published.length);
const asset="soldier-population-new-pair-career.json.gz";
fs.writeFileSync("public/data/"+asset,bytes);
db.populationNewPairCareer={...a,replayHashes:hashes,file:asset,bytes:bytes.length,sha256:sha(bytes),summary:{...a.summary,newIndependentReplays:replayed,reusedPublished:reused}};
db.summary.populationNewPairCareer=db.populationNewPairCareer.summary;db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPNEWCAREER12={file:"tools/build-population-new-pair-career.mjs",sourceMetadataSha256:a.sourceMetadataSha256,replayHashes:hashes};
db.policies.POPNEWCAREER12="신규 출생처·분기 모집 상태에서 추가 연구·전투캡 성장 전후 결정론 시술을 재생한 조건부 경로. 전역 미인증.";
fs.writeFileSync(file+".tmp",z.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({registered:a.published.length,replayed,reused,added,total:Object.keys(db.witnesses).length}));
