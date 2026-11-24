// Benchmark and publish shared numerical transition cache from immutable main.
// Only this report + its UI are added; never stage a shared dirty checkout.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {performance} from "node:perf_hooks";
import {gunzipSync,gzipSync} from "node:zlib";
const git=(a,o={})=>execFileSync("git",a,{maxBuffer:256*1024*1024,windowsHide:true,...o});
const str=(a,o={})=>git(a,{...o,encoding:"utf8"}).trim();
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const hash=x=>sha(JSON.stringify(x));
const asset="public/data/branch-soldier-results.json.gz",modern="public/data/soldiers-modern-index.json";
const core="tools/origin-numeric-transition-cache.mjs",builder="tools/build-all-origin-numeric-cache.mjs",ui="public/origin-numeric-cache.js";
const deps=["public/soldiers/modern/eligibility.js","public/soldiers/modern/stat-envelope.js","public/soldiers/modern/growth-envelope.js","public/soldiers/modern/research-training-locks.js","tools/damsel-madgal-cap-growth-chronology-core.mjs"];
git(["fetch","origin","refs/heads/main:refs/remotes/origin/main"]);const base=str(["rev-parse","origin/main"]);
const get=(rev,p)=>git(["show",rev+":"+p]);
const dataBytes=get(base,modern),data=JSON.parse(dataBytes),db=JSON.parse(gunzipSync(get(base,asset)));
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.equal(data.profiles.length,72);
const o=db.originCap12;assert(o&&o.summary.modeledOrigins===72);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"xpz-numeric-cache-"));
try{
 fs.writeFileSync(path.join(tmp,"package.json"),'{"type":"module"}');
 const inputs=new Map(deps.map(p=>[p,get(base,p)]));inputs.set(core,fs.readFileSync(core));
 for(const [p,b] of inputs){const f=path.join(tmp,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b);}
 const {createNumericTransitionCache}=await import(pathToFileURL(path.join(tmp,core)).href);
 const {evaluateCapGrowthChronologies}=await import(pathToFileURL(path.join(tmp,deps.at(-1))).href);
 const fingerprints=Object.fromEntries([...inputs].map(([p,b])=>[p,sha(b)]));
 const fingerprint=hash([db.sourceMetadataSha256,sha(dataBytes),fingerprints]);
 const jobs=new Map();
 const add=(profile,order,body,ref,kind)=>{const id=hash([profile,order]).slice(0,24);let j=jobs.get(id);if(!j){j={id,profile,order,body,archive:[],extensions:[]};jobs.set(id,j);}assert.equal(j.body,body);j[kind].push(ref);};
 for(const [id,m] of Object.entries(o.models))add(m.profileId,m.order,m.finalBody,id,"archive");
 for(const id of db.originExtension12?.witnessIds||[]){const w=db.witnesses[id];assert(w?.originProfile&&w.steps.every(s=>(s.count??1)===1));add(w.originProfile,w.steps.map(s=>s.id),w.body,id,"extensions");}
 const list=[...jobs.values()].sort((a,b)=>a.profile.localeCompare(b.profile)||a.order.length-b.order.length||a.id.localeCompare(b.id));
 const numeric=createNumericTransitionCache(data);
 const started=performance.now(),cpu=process.cpuUsage();let archiveChecked=0,archiveVectors=0,extensionChecked=0;
 const newModels={},differences=[],failures=[],reference=(rows)=>rows.map(x=>x.vector.join(",")).sort(),statVec=x=>db.stats.map(k=>x[k]);
 const normalize=rows=>rows.map(x=>JSON.stringify([x.vector,x.raw,x.bonus,x.schedule,x.warnings])).sort();
 for(const j of list){
  try{
   const r=numeric.evaluate(j.profile,j.order);assert.equal(r.body,j.body);
   for(const id of j.archive){
    const m=o.models[id],old=m.witnessIds.map(id=>db.witnesses[id]),expected=old.map(w=>({vector:w.vector,raw:w.raw,bonus:w.bonus,schedule:w.growthSchedule,warnings:w.conditionalGateCrossings}));
    if(JSON.stringify(normalize(r.frontier))!==JSON.stringify(normalize(expected))||JSON.stringify(r.coordinateMax)!==JSON.stringify(m.independentMaxima)){
     // A numerical disagreement is a release blocker, never pruning evidence.
     differences.push({id,profile:j.profile,order:j.order,old:reference(expected),next:reference(r.frontier)});continue;
    }
    archiveChecked++;archiveVectors+=old.length;
   }
   if(j.extensions.length){
    // New relaxed chronological envelope for the independently replayed suffix.
    // Verify every new order against the pinned baseline before publishing.
    const exact=evaluateCapGrowthChronologies(data,j.profile,j.order,{maxTransformations:16,deduplicateEnvelopes:true,correlatedPercent:true,tightenStatGates:true});
    const expected=exact.frontiers.twelve.map(x=>({vector:statVec(x.highEffective),raw:statVec(x.rawUpper),bonus:statVec(x.permanentBonus),schedule:x.schedule,warnings:x.conditionalGateCrossings}));
    assert.deepEqual(normalize(r.frontier),normalize(expected));
    assert.deepEqual(r.coordinateMax,db.stats.map(k=>exact.perStatOptimisticUpper[k].relaxedUpper));
    assert.equal(r.eligibleSchedules,exact.totals.eligibleSchedulesAfterStatGate);
    newModels[j.id]={...r,archiveModelIds:j.archive,extensionWitnessIds:j.extensions,scope:"RELAXED_NUMERICAL_ONLY",campaignCertified:false};
    extensionChecked+=j.extensions.length;
   }
  }catch(e){failures.push({id:j.id,origin:j.profile,order:j.order,archive:j.archive,extensions:j.extensions,error:String(e.message).slice(0,500)});}
 }
 const elapsed=(performance.now()-started)/1000,used=process.cpuUsage(cpu);
 assert.equal(differences.length,0,JSON.stringify(differences.slice(0,5)));
 assert.equal(archiveChecked,Object.keys(o.models).length,JSON.stringify(failures.slice(0,5)));
 // Fair same-input benchmark with both caches cold. Select a deterministic
 // broad cohort (up to 20 jobs per origin); compare entire output per job.
 const count=new Map(),sample=list.filter(j=>{const n=count.get(j.profile)||0;count.set(j.profile,n+1);return n<20;});
 function bench(enabled){
  const c=createNumericTransitionCache(data,{enabled}),start=performance.now(),u=process.cpuUsage(),results=[];
  for(const j of sample)try{results.push(hash(c.evaluate(j.profile,j.order)));}catch(e){results.push("ERROR:"+e.message);}
  const seconds=(performance.now()-start)/1000,p=process.cpuUsage(u);
  return {seconds,cpuSeconds:(p.user+p.system)/1e6,metrics:c.metrics,digest:hash(results)};
 }
 const uncached=bench(false),cached=bench(true);assert.equal(uncached.digest,cached.digest);
 const branches=db.branches.filter(b=>b.historyCount>0&&!b.sourceRootConflict);
 const summary={origins:data.profiles.length,researchParents:branches.length,initialPairs:data.profiles.length*branches.length,archiveModelsChecked:archiveChecked,archiveVectorsPreserved:archiveVectors,extensionWitnessesChecked:extensionChecked,extensionNumericModels:Object.keys(newModels).length,newExtensionOrders:Object.values(newModels).filter(m=>!m.archiveModelIds.length).length,uniqueJobs:list.length,failures:failures.length,seconds:elapsed,cpuSeconds:(used.user+used.system)/1e6,peakRssBytes:process.resourceUsage().maxRSS*1024,transitionMetrics:numeric.metrics,benchmark:{jobs:sample.length,uncached,cached,speedup:uncached.seconds/cached.seconds},fullCampaignStateMerged:0,safeGlobalBoundPruned:0,globalOptimalCertified:0};
 const result={schemaVersion:1,kind:"ORIGIN_NUMERIC_TRANSITION_CACHE",sourceMetadataSha256:db.sourceMetadataSha256,sourceDataSHA256:sha(dataBytes),fingerprint,fingerprints,baseCommit:base,generatedAt:new Date().toISOString(),summary,extensionModels:newModels,failures,scope:"Exact cache of pinned relaxed numerical transfers only. Full research/campaign state, RNG feasibility, resource availability, promotion and global bounds are not certified. Existing origin and branch evidence unchanged."};
 const artifact="experiments/endgame-current-save/12-all-origin-numeric-cache.json";
 fs.writeFileSync(artifact+".tmp",JSON.stringify(result));fs.renameSync(artifact+".tmp",artifact);
 console.log(JSON.stringify({localArtifact:artifact,summary,failures:failures.slice(0,5)}));
 // Re-read latest remote before publishing. If only unrelated evidence advanced,
 // attach to that newer registry, retaining every existing field and witness.
 git(["fetch","origin","refs/heads/main:refs/remotes/origin/main"]);const latest=str(["rev-parse","origin/main"]);
 assert.equal(sha(get(latest,modern)),result.sourceDataSHA256,"Rule data moved; rerun");
 for(const p of deps)assert.equal(sha(get(latest,p)),fingerprints[p],"Pinned dependency moved: "+p);
 const latestDB=JSON.parse(gunzipSync(get(latest,asset)));
 assert.equal(latestDB.sourceMetadataSha256,result.sourceMetadataSha256);
 assert.deepEqual(latestDB.originCap12.models,o.models,"Origin model scope moved; rerun");
 for(const id of db.originExtension12?.witnessIds||[])assert.deepEqual(latestDB.witnesses[id],db.witnesses[id],"Extension changed: "+id);
 if(latestDB.originNumericCache){for(const [id,m] of Object.entries(latestDB.originNumericCache.extensionModels||{}))assert.deepEqual(result.extensionModels[id],m,"Refusing to lose previous numeric result "+id);}
 latestDB.originNumericCache=result;latestDB.summary.originNumericCache=summary;
 const bytes=gzipSync(Buffer.from(JSON.stringify(latestDB)),{level:6}),patch=new Map([[asset,bytes],[core,inputs.get(core)],[builder,fs.readFileSync(builder)],[ui,fs.readFileSync(ui)]]);
 for(const [p,prefix] of [["public/soldiers/modern/index.html","../../"],["public/captains/index.html","../"]]){
  let h=get(latest,p).toString("utf8");
  if(!h.includes("data-origin-numeric-cache")){
   const anchor=p.includes("soldiers/modern")?'<details id="integratedCaps"':'<section id="integratedBranches"';
   assert.equal(h.split(anchor).length,2,"Missing/ambiguous UI anchor");
   h=h.replace(anchor,'<details class="card"><summary>전체 병종 성장 탐색 가속화 · 계산 재사용</summary><section data-origin-numeric-cache><p>펼치면 공통 원장의 수치 계산 진척을 불러옵니다.</p></section></details>\n'+anchor);
  }
  if(!h.includes("origin-numeric-cache.js"))h=h.replace("</body>",'<script type="module" src="'+prefix+'origin-numeric-cache.js?v=20261124-cache-1"></script>\n</body>');
  patch.set(p,Buffer.from(h));
 }
 for(const [p,b] of patch)if(/\.(m?js)$/.test(p))execFileSync(process.execPath,["--input-type=module","--check"],{input:b,stdio:["pipe","inherit","inherit"]});
 const env={...process.env,GIT_INDEX_FILE:path.join(tmp,"publish-index")};
 git(["read-tree",latest],{env});for(const [p,b] of patch){const blob=str(["hash-object","-w","--stdin"],{input:b});git(["update-index","--add","--cacheinfo","100644,"+blob+","+p],{env});}
 const tree=str(["write-tree"],{env}),commit=str(["commit-tree",tree,"-p",latest,"-m","feat(atlas): reuse exact numerical growth transitions and model active-research suffixes"],{env});
 const changed=str(["diff-tree","--no-commit-id","--name-only","-r",commit]).split("\n").filter(Boolean);assert(changed.every(p=>patch.has(p)));
 assert.equal(str(["ls-remote","origin","refs/heads/main"]).split(/\s+/)[0],latest,"Remote advanced; rerun");
 if(process.argv.includes("--push"))git(["push","origin",commit+":refs/heads/main"]);
 console.log(JSON.stringify({base,latest,commit,pushed:process.argv.includes("--push"),changed,registrySHA256:sha(bytes),summary,failures:failures.slice(0,5)},null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
