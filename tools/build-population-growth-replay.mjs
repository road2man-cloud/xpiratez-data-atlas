// Bounded chronological search, with explicit assumed cap growth at arbitrary
// intermediate stages. Seed identity, recruitment research and branch
// commitments are preserved. No completeness or campaign feasibility claim.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {serialize} from "node:v8";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {createExactPrefixCheckpointCache} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {createGrowthReplay,birthActions,member,exactWorld,MODEL,statStateKey} from "./population-growth-replay-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(s=>s.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json"),v4=db.populationAssumedBirthClosure,career=db.populationCareerEnvelope;
assert(v4&&career);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const hashes=Object.fromEntries(["tools/build-population-growth-replay.mjs","tools/population-growth-replay-core.mjs","tools/population-scalar-upper-bound.mjs","tools/origin-pair-exact-prefix-checkpoint.mjs","public/soldiers/modern/eligibility.js","public/soldiers/modern/origin-witness.js","public/soldiers/modern/campaign-proof.js","public/soldiers/modern/origin-campaign-context.js","public/data/soldiers-modern-index.json","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json"].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const ledgers=["originExtendedContinuation","originResearchContinuation","originResearchChain"];
const sourceFingerprints=Object.fromEntries(ledgers.map(k=>[k,key((db[k].published||[]).map(id=>[id,db[k].routes[id].fullActionHash,db[k].routes[id].canonicalStateHash]))]));
const fingerprint=key([MODEL,db.sourceMetadataSha256,v4.sha256,career.sha256,sourceFingerprints,hashes]);
const out=arg("out","population-growth-replay.json.gz"),prior=fs.existsSync(out)?decode(out):null;
if(prior&&prior.fingerprint!==fingerprint){
 assert(process.argv.includes("--migrate-cache-only"),"Explicit source migration required");
 assert.equal(prior.model,MODEL);assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);
 assert.equal(prior.sourceV4Sha256,v4.sha256);assert.equal(prior.sourceCareerSha256,career.sha256);assert.deepEqual(prior.sourceFingerprints,sourceFingerprints);
 for(const [p,h] of Object.entries(prior.hashes))if(p!=="tools/build-population-growth-replay.mjs")assert.equal(hashes[p],h,"Non-cache dependency changed "+p);
}
const routes={...(prior?.routes||{})},attempts={...(prior?.attempts||{})};
const sum=v=>v.reduce((n,x)=>n+x,0),dominates=(a,b)=>a.every((n,i)=>n>=b[i]);
const baseline=new Map(),seeds=new Map(),replay=createGrowthReplay(data),bodies=new Map(),birthCache=new Map(),seedCache=new Map();
function addFront(map,k,v){
 const a=map.get(k)||[];if(a.some(x=>dominates(x,v)))return false;
 map.set(k,[...a.filter(x=>!dominates(v,x)),v]);return true;
}
for(const l of ledgers)for(const id of db[l].published||[]){
 const r=db[l].routes[id];if(!r||!r.capVector||!r.canonicalStateHash)continue;
 const k=r.pair+"|"+r.body;addFront(baseline,k,r.capVector);
 const old=seeds.get(k);if(!old||sum(r.capVector)>sum(old.r.capVector)||sum(r.capVector)===sum(old.r.capVector)&&r.actions.length<old.r.actions.length)seeds.set(k,{id,l,r});
}
const legacyHashes={...db.originExtendedContinuation.hashes,"tools/build-population-extended-continuation.mjs":"64fa7f15eee999512b0fc6a254b5fa8e2841e5f1ce460650783fc4bafd918f2c"};
const diskBirth=createExactPrefixCheckpointCache(".population-extended-cache",key([db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,legacyHashes]));
const diskNew=createExactPrefixCheckpointCache(".population-growth-replay-cache",key([MODEL,db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,hashes["tools/population-growth-replay-core.mjs"]]));
const found=new Map([...baseline].map(([k,a])=>[k,a.slice()]));
for(const r of Object.values(routes))addFront(found,r.pair+"|"+r.body,r.vector);
const oi=new Map(v4.origins.map((x,i)=>[x,i])),bi=new Map(v4.branches.map((x,i)=>[x,i]));
const ci=new Map(career.origins.map((x,i)=>[x,i])),cj=new Map(career.branches.map((x,i)=>[x,i]));
const branchMap=new Map(db.branches.map(b=>[b.id,b]));
for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"))for(const b of r.allowedSoldierTypes||[]){const a=bodies.get(b)||[];a.push(r);bodies.set(b,a);}
function priority(t){
 const r=t.r,c=v4.classes[v4.classIndex[oi.get(r.origin)][bi.get(r.branch)]],best=c?.bodies.find(b=>b.body===r.body)?.bestSum??sum(r.capVector);
 const env=career.groups[career.pairClasses[ci.get(r.origin)][cj.get(r.branch)]]?.bounds.find(b=>b.body===r.body);
 // Heuristic only: prioritize observed numeric opportunity and relative closeness
 // to the tighter career envelope; never eliminate a route on this score.
 return Math.max(0,best-sum(r.capVector))*3+Math.max(0,500-(sum(env?.effective||r.capVector)-sum(r.capVector)));
}
const queue=[...seeds.values()].filter(t=>!attempts[t.id]).map(t=>({...t,priority:priority(t)})).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
const seconds=Number(arg("seconds","22")),depth=Number(arg("depth","2")),width=Number(arg("width","4")),limit=Number(arg("limit","1000"));
assert(seconds>0&&[depth,width,limit].every(n=>Number.isSafeInteger(n)&&n>0));
const start=performance.now(),before=Object.keys(routes).length,m={visited:0,seedReplayed:0,birthCacheHits:0,seedFailures:0,variants:0,transformAttempts:0,transformAccepted:0,duplicateStates:0,newRoutes:0,newBodyRoutes:0,unchanged:0,failedGrowthVariants:0};
const timely=()=>performance.now()-start<seconds*1000&&m.newRoutes<limit;
function load(t){
 const {p,steps}=birthActions(db,t.r),k=key(steps);
 assert.equal(k,p.fullActionHash);assert.equal(key([...steps,...t.r.actions]),t.r.fullActionHash);
 let w=birthCache.get(k);if(w)m.birthCacheHits++;
 else{
  const checkpoint=diskBirth.load(steps,p.stateHash)||diskNew.load(steps,p.stateHash);
  if(checkpoint){w=checkpoint.world;m.birthCacheHits++;}
  else{
   w=replay.replay(steps);assert.equal(sha(serialize(w)),p.stateHash,"Birth state differs");
   // The cache expects a trace record per original action; this cache is
   // private to this extension and never supplies legacy trace evidence.
   diskNew.save({world:w,steps,trace:steps.map((_,i)=>({index:i})),diagnostics:[]},p.stateHash);
  }
  birthCache.set(k,w);
 }
 const n={world:replay.replay(t.r.actions,w),steps:t.r.actions};
 assert.equal(exactWorld(n.world),t.r.canonicalStateHash,"Seed state differs");
 const f=replay.finish(n.world);assert.deepEqual(f.raw,t.r.raw);assert.deepEqual(f.bonus,t.r.bonus);m.seedReplayed++;
 return {p,steps,w,n};
}
function register(t,b,n,kind){
 const g=replay.grow(n),f=replay.finish(g.world),k=t.r.pair+"|"+f.body;
 if((found.get(k)||[]).some(v=>dominates(v,f.vector))){m.unchanged++;return;}
 const full=[...b.steps,...g.steps],ctx=auditOriginCampaignContext(full,data);
 const allowed=ctx.allowedDifficulties.filter(i=>b.p.allowedDifficulties.includes(i));
 if(ctx.kind!=="compatible"||!allowed.length)return;
 const branch=branchMap.get(t.r.branch),commit=[...branch.captain,...Object.values(branch.choices||{})].filter(Boolean);
 if(!commit.every(id=>replay.active(g.world,id)))return;
 const id="POPGROW12:"+key([t.r.input,g.steps]).slice(0,24);
 if(routes[id])return;
 const initial=baseline.get(k)||[],bestBefore=initial.length?Math.max(...initial.map(sum)):null;
 addFront(found,k,f.vector);
 routes[id]={seed:t.id,seedLedger:t.l,seedActionHash:t.r.fullActionHash,seedStateHash:t.r.canonicalStateHash,input:t.r.input,kind:t.r.kind,pair:t.r.pair,origin:t.r.origin,branch:t.r.branch,root:t.r.root,birthActionHash:b.p.fullActionHash,birthStateHash:b.p.stateHash,actions:g.steps,order:g.steps.filter(s=>s.type==="transform").map(s=>s.transform),growthActions:g.steps.filter(s=>s.type==="conditionalCapGrowth").length,fullActionHash:key(full),canonicalStateHash:exactWorld(g.world),allowedDifficulties:allowed,...f,baselineBestSum:bestBefore,sumDelta:bestBefore===null?null:sum(f.vector)-bestBefore,searchKind:kind,actualGameCertified:false};
 m.newRoutes++;if(!initial.length)m.newBodyRoutes++;
}
function variant(t,b){
 let n={world:b.w,steps:[]};
 for(const s of t.r.actions){
  if(s.type==="transform")n=replay.grow(n);
  n={world:replay.apply(n.world,s),steps:[...n.steps,s]};
 }
 return n;
}
for(const t of queue){
 if(!timely())break;
 let b;try{b=load(t);}catch(e){m.seedFailures++;attempts[t.id]={status:"SEED_UNRESOLVED",reason:String(e.message)};continue;}
 m.visited++;const n=b.n,starts=[n];
 try{const q=variant(t,b);starts.push(q);m.variants++;register(t,b,q,"GROWTH_BEFORE_EXISTING_TRANSFORMS");}catch(e){m.failedGrowthVariants++;}
 let beam=starts,seen=new Set(beam.map(n=>statStateKey(n.world))),completed=true;
 for(let level=0;level<depth;level++){
  const candidates=[];
  for(const q of beam){
   if(!timely()){completed=false;break;}
   const grown=replay.grow(q),variants=grown===q?[q]:[q,grown];
   for(const base of variants)for(const r of bodies.get(member(base.world).state.soldierType)||[]){
    if(!timely()){completed=false;break;}
    if(!r.requires.every(id=>replay.active(base.world,id)))continue;
    m.transformAttempts++;
    const x=replay.transform(base,r);if(!x)continue;m.transformAccepted++;
    const k=statStateKey(x.world);if(seen.has(k)){m.duplicateStates++;continue;}seen.add(k);
    register(t,b,x,"GROWTH_AND_FOLLOWUP_TRANSFORM");
    const f=replay.finish(x.world);candidates.push({n:x,body:f.body,score:sum(f.capVector)});
   }
  }
  // Beam is deliberately bounded; keep body diversity. This is search
  // prioritization, not a completeness-preserving dominance proof.
  candidates.sort((a,b)=>b.score-a.score);
  const selected=[],bodyCount=new Map();
  for(const x of candidates){if(selected.length>=width)break;const c=bodyCount.get(x.body)||0;if(c>=Math.max(1,Math.ceil(width/2)))continue;bodyCount.set(x.body,c+1);selected.push(x.n);}
  beam=selected;if(!beam.length||!completed)break;
 }
 if(completed)attempts[t.id]={status:"BOUNDED_SEARCH_DONE",depth,width,priority:t.priority};
}
const elapsed=(performance.now()-start)/1000,all=Object.values(routes),bestByPair=new Map();
for(const r of all){const k=r.pair+"|"+r.body,old=bestByPair.get(k);if(!old||sum(r.vector)>sum(old.vector))bestByPair.set(k,r);}
const totals={};for(const k of Object.keys(m))totals[k]=(prior?.totals?.[k]||0)+m[k];
const summary={seedCandidates:seeds.size,attemptedSeeds:Object.keys(attempts).length,completedSeeds:Object.values(attempts).filter(x=>x.status==="BOUNDED_SEARCH_DONE").length,registeredRoutes:all.length,newRoutes:all.length-before,improvedPairs:new Set(all.map(r=>r.pair)).size,improvedPairBodies:bestByPair.size,improvedOrigins:new Set(all.map(r=>r.origin)).size,improvedBranches:new Set(all.map(r=>r.branch)).size,newBodyPairBodies:[...bestByPair.values()].filter(r=>r.baselineBestSum===null).length,positiveSumPairBodies:[...bestByPair.values()].filter(r=>r.sumDelta>0).length,maxSumDelta:Math.max(0,...all.map(r=>r.sumDelta||0)),depth,width,elapsedSeconds:elapsed,cumulativeSeconds:(prior?.summary.cumulativeSeconds||0)+elapsed,metrics:m,totals,birthCheckpoint:diskBirth.metrics,newBirthCheckpoint:diskNew.metrics,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
const result={schemaVersion:1,kind:"POPULATION_GROWTH_REPLAY",model:MODEL,fingerprint,hashes,sourceMetadataSha256:db.sourceMetadataSha256,sourceV4Sha256:v4.sha256,sourceCareerSha256:career.sha256,sourceFingerprints,routes,attempts,summary,totals,scope:"Existing chronological recruitment and research replay, deterministic transforms, explicitly assumed combat-cap growth between transforms and at terminal. Resource and growth joint feasibility, random outcomes, promotions, medals, unobserved research and global optimality remain unproved. Bounded heuristic beam."};
fs.writeFileSync(out+".tmp",z.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(out+".tmp",out);console.log(JSON.stringify(summary));
