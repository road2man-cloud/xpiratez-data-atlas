// Independent worker partitions, atomic merge after every worker succeeds.
// No state is removed and no branch-local Pareto frontier is split.
import fs from "node:fs";
import z from "node:zlib";
import path from "node:path";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {pairShard,weightedPairManifest} from "./population-new-pair-shards.mjs";
import {traitSummary} from "./population-new-pair-trait-evidence.mjs";
const key=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex"),sha=x=>createHash("sha256").update(x).digest("hex"),decode=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const count=Number(arg("workers","3")),seconds=Number(arg("seconds","20")),heap=Number(arg("heap-mb","4096"));
assert(Number.isSafeInteger(count)&&count>=2&&count<=8&&Number.isFinite(seconds)&&seconds>0&&Number.isSafeInteger(heap)&&heap>=2048);
const registryPath="public/data/branch-soldier-results.json.gz",registryHash=sha(fs.readFileSync(registryPath)),db=decode(registryPath);
const out=arg("out","population-new-pair-career.json.gz"),prior=fs.existsSync(out)?decode(out):db.populationNewPairCareer;
assert.equal(prior.scheduler,3);assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);
for(const [id,r] of Object.entries(db.populationNewPairCareer.routes))assert.deepEqual(prior.routes[id],r);
const seedMap={...db.populationNewPairEntry.routes,...db.originEventBirth.variants},dir=fs.mkdtempSync(".population-new-pair-parallel-"),base=path.join(dir,"base.json.gz");
fs.writeFileSync(base,z.gzipSync(Buffer.from(JSON.stringify(prior)),{level:3}));
const weighted=process.argv.includes("--weighted"),manifest=weighted?weightedPairManifest(seedMap,prior.states,count,{minDepth:Number(arg("deep-min","0")),initialOnly:process.argv.includes("--initial-only"),seedQuota:process.argv.includes("--breadth")?Number(arg("seed-quota","24")):0}):null,manifestPath=path.join(dir,"manifest.json");
if(manifest)fs.writeFileSync(manifestPath,JSON.stringify(manifest));
const started=performance.now(),options=process.argv.slice(2).filter(a=>!/^--(?:workers|seconds|heap-mb|out|prior|shard-count|shard-index)=/.test(a));
function run(i){
 const file=path.join(dir,"worker-"+i+".json.gz");
 return new Promise((resolve,reject)=>{
  const args=["--max-old-space-size="+heap,"tools/build-population-new-pair-career.mjs",...options,"--seconds="+seconds,"--prior="+base,"--out="+file,"--shard-count="+count,"--shard-index="+i,...(manifest?["--shard-manifest="+manifestPath]:[])];
  const child=spawn(process.execPath,args,{stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";
  child.stdout.on("data",b=>{stdout+=b;});child.stderr.on("data",b=>{stderr+=b;});
  child.on("error",reject);child.on("close",code=>{if(code!==0)reject(Error("Worker "+i+" exited "+code+" "+stderr));else{console.log("WORKER "+i+" "+stdout.trim());resolve(decode(file));}});
 });
}
const workers=await Promise.allSettled(Array.from({length:count},(_,i)=>run(i)));
if(workers.some(x=>x.status==="rejected"))throw Error("No checkpoint replaced; worker results retained in "+dir+" "+workers.filter(x=>x.status==="rejected").map(x=>x.reason).join("; "));
assert.equal(sha(fs.readFileSync(registryPath)),registryHash,"Registry changed during batch");
const batches=workers.map(x=>x.value),routes={...prior.routes},states={...prior.states},planTemplates={...prior.planTemplates},metrics={},receipts=[];
const baseRoutes=Object.keys(prior.routes).length,baseStates=Object.keys(prior.states).length;
for(let i=0;i<count;i++){
 const a=batches[i];assert.deepEqual(a.shard,{count,index:i,ownedSeeds:a.shard.ownedSeeds});assert.equal(a.scheduler,3);assert.equal(a.sourceMetadataSha256,prior.sourceMetadataSha256);assert.deepEqual(a.careerPolicy,prior.careerPolicy);
 for(const [id,r] of Object.entries(prior.routes))assert.deepEqual(a.routes[id],r,"Lost existing route "+id);
 for(const [id,s] of Object.entries(prior.states)){assert(a.states[id],"Lost existing state "+id);if(pairShard(seedMap[s.seed],count,manifest)!==i)assert.deepEqual(a.states[id],s,"Out-of-shard mutation "+id);}
 let addedRoutes=0,addedStates=0;
 for(const [id,r] of Object.entries(a.routes)){if(prior.routes[id])continue;assert.equal(pairShard(seedMap[r.seed],count,manifest),i);assert(!routes[id]);routes[id]=r;addedRoutes++;}
 for(const [id,s] of Object.entries(a.states)){
  if(pairShard(seedMap[s.seed],count,manifest)!==i){assert(prior.states[id]);continue;}
  assert.equal(id,key([s.seed,s.actions]));
  const old=prior.states[id];if(old){assert(s.cursor>=old.cursor);assert(!old.done||s.done);if(old.stateHash)assert.equal(s.stateHash,old.stateHash);if(old.signature)assert.equal(s.signature,old.signature);}else addedStates++;
  states[id]=s;
 }
 for(const [k,ss] of Object.entries(a.planTemplates||{})){const union=new Map([...(planTemplates[k]||[]),...ss].map(s=>[key(s),s]));planTemplates[k]=[...union.values()];}
 for(const [k,v] of Object.entries(a.batchMetrics)){
  if(typeof v==="number"){if(["sharedTemplateBuckets","sharedTemplateCount"].includes(k))metrics[k]=Math.max(metrics[k]||0,v);else metrics[k]=(metrics[k]||0)+v;}
  else if(typeof v==="boolean"){if(k in metrics)assert.equal(metrics[k],v);metrics[k]=v;}
  else if(k==="sharedTemplateSourceHits"){metrics[k]??={};for(const [s,n] of Object.entries(v))metrics[k][s]=(metrics[k][s]||0)+n;}
 }
 assert.equal(addedRoutes,a.summary.registeredRoutes-baseRoutes);assert.equal(addedStates,a.summary.states-baseStates);
 receipts.push({index:i,ownedSeeds:a.shard.ownedSeeds,addedRoutes,addedStates,attempts:a.summary.attempts,elapsedSeconds:a.summary.elapsedSeconds,errors:a.summary.errors});
}
const values=Object.values(routes),sv=Object.values(states),first=batches[0].summary,pair=r=>r.origin+"|"+r.branch;
assert.equal(receipts.reduce((n,r)=>n+r.ownedSeeds,0),first.seedCandidates);
const summary={...first,...metrics,...traitSummary(routes),parallelPartition:manifest?.mode||"SHA256_ORIGIN_BRANCH",...(manifest?{parallelEstimatedLoads:manifest.loads,parallelAssignedPairs:manifest.pairs}:{}),parallelWorkers:count,parallelWorkerSeconds:receipts.reduce((n,r)=>n+r.elapsedSeconds,0),parallelReceipts:receipts,newRoutes:values.length-baseRoutes,registeredRoutes:values.length,coveredPairs:new Set(values.map(pair)).size,coveredPairBodies:new Set(values.map(r=>pair(r)+"|"+r.body)).size,eventCareerRoutes:values.filter(r=>db.originEventBirth.variants[r.seed]).length,eventCareerPairs:new Set(values.filter(r=>db.originEventBirth.variants[r.seed]).map(pair)).size,visitedInitialSeeds:sv.filter(s=>!s.actions.length&&(s.visits||s.cursor||s.done)).length,processedSeedStates:sv.filter(s=>!s.actions.length&&s.done).length,states:sv.length,pendingStates:sv.filter(s=>!s.done).length,maxTransforms:Math.max(0,...values.map(r=>r.order.length)),rankMedalRoutes:values.filter(r=>r.careerPolicy).length,promotionRoutes:values.filter(r=>r.actions.some(a=>a.type==="conditionalPromotion")).length,medalRoutes:values.filter(r=>r.actions.some(a=>a.type==="conditionalMedal")).length,elapsedSeconds:(performance.now()-started)/1000,fullCompleted:0,actualGameCertified:0};
assert.equal(values.length-baseRoutes,receipts.reduce((n,r)=>n+r.addedRoutes,0));
const {shard,batchMetrics,...header}=batches[0];
const result={...header,routes,states,planTemplates,published:Object.keys(routes),summary,parallel:{schema:1,partition:manifest?.mode||"SHA256_ORIGIN_BRANCH",...(manifest?{manifestHash:key(manifest),estimatedLoads:manifest.loads}:{}),registryHash,receipts,baseRoutes,baseStates}};
fs.writeFileSync(out+".tmp",z.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(out+".tmp",out);
console.log("MERGED "+JSON.stringify(summary));
