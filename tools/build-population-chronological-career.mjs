// Goal-directed career continuations of actual chronological seed models.
// Finite heuristic exploration; never promotes assumed conditions to facts.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {serialize} from "node:v8";
import {performance} from "node:perf_hooks";
import {createCareerReplay,MODEL} from "./population-chronological-career-core.mjs";
import {birthActions,member,exactWorld,statStateKey,MODEL as GROWTH_MODEL} from "./population-growth-replay-core.mjs";
import {createExactPrefixCheckpointCache} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p))),sum=v=>v.reduce((n,x)=>n+x,0);
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json");
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const names=["originExtendedContinuation","originResearchContinuation","originResearchChain","populationGrowthReplay"];
const fingerprints=Object.fromEntries(names.map(k=>[k,key(db[k].published.map(id=>[id,db[k].routes[id].fullActionHash,db[k].routes[id].canonicalStateHash]))]));
const hashes=Object.fromEntries([...Object.keys(db.populationGrowthReplay.hashes),"tools/population-chronological-career-core.mjs","tools/build-population-chronological-career.mjs"].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const fingerprint=key([MODEL,db.sourceMetadataSha256,db.populationCareerEnvelope.sha256,fingerprints,hashes]);
const file=arg("out","population-chronological-career.json.gz"),prior=fs.existsSync(file)?decode(file):null;
if(prior&&prior.fingerprint!==fingerprint){
 assert(process.argv.includes("--migrate-birth-init"),"Source or engine migration required");
 assert.equal(prior.model,MODEL);assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(prior.sourceCareerSha256,db.populationCareerEnvelope.sha256);assert.deepEqual(prior.sourceFingerprints,fingerprints);
 for(const [p,h] of Object.entries(prior.hashes))if(!["tools/build-population-chronological-career.mjs","tools/population-chronological-career-core.mjs"].includes(p))assert.equal(hashes[p],h,"Dependency drift "+p);
}
const routes={...(prior?.routes||{})},attempts={...(prior?.attempts||{})},replay=createCareerReplay(data);
if(process.argv.includes("--retry-failed"))for(const [id,a] of Object.entries(attempts))if(a.status==="SEED_UNRESOLVED")delete attempts[id];
const legacyHashes={...db.originExtendedContinuation.hashes,"tools/build-population-extended-continuation.mjs":"64fa7f15eee999512b0fc6a254b5fa8e2841e5f1ce460650783fc4bafd918f2c"};
const diskBirth=createExactPrefixCheckpointCache(".population-extended-cache",key([db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,legacyHashes]));
const diskGrowth=createExactPrefixCheckpointCache(".population-growth-replay-cache",key([GROWTH_MODEL,db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,hashes["tools/population-growth-replay-core.mjs"]]));
const diskSeed=createExactPrefixCheckpointCache(".population-career-chronological-cache",key([fingerprint,"seed"]));
const byBody=new Map();
for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"))for(const body of r.allowedSoldierTypes||[]){
 const dest=replay.bodies.get(r.producedSoldierType||body);if(!dest||!deterministicRule(r,[dest]))continue;
 const a=byBody.get(body)||[];a.push(r);byBody.set(body,a);
}
const isCareer=r=>Boolean(r.minRank||Object.keys(r.requiredCommendations||{}).length);
const dominates=(a,b)=>a.every((x,i)=>x>=b[i]);
function addFront(map,k,v){const xs=map.get(k)||[];if(xs.some(x=>dominates(x,v)))return false;map.set(k,[...xs.filter(x=>!dominates(v,x)),v]);return true;}
const baseline=new Map(),found=new Map(),selected=new Map(),branchMap=new Map(db.branches.map(b=>[b.id,b]));
const pairKey=r=>r.origin+"|"+r.branch+"|"+r.body;
for(const l of names)for(const id of db[l].published){
 const r=db[l].routes[id],v=r.capVector||r.vector,k=pairKey(r);if(!v||!r.canonicalStateHash)continue;
 addFront(baseline,k,v);
 const available=(byBody.get(r.body)||[]).filter(x=>isCareer(x)&&(!x.minRank||replay.bodies.get(r.body)?.raw?.rankStrings?.length));
 if(!available.length)continue;
 const s=selected.get(k)||[],t={id,l,r,score:sum(v),priority:available.length*15+(l==="populationGrowthReplay"?30:0)};
 s.push(t);s.sort((a,b)=>b.score-a.score||b.priority-a.priority||a.r.actions.length-b.r.actions.length);selected.set(k,s.slice(0,2));
}
for(const [k,v] of baseline)found.set(k,v.slice());
for(const r of Object.values(routes))addFront(found,pairKey(r),r.permanentVector);
const queue=[...selected.values()].flat().filter(t=>!attempts[t.id]).sort((a,b)=>b.priority-a.priority||b.score-a.score||a.id.localeCompare(b.id));
const seconds=Number(arg("seconds","20")),limit=Number(arg("limit","300")),depth=Number(arg("depth","2")),width=Number(arg("width","4"));
assert(seconds>0&&[limit,depth,width].every(n=>Number.isSafeInteger(n)&&n>0));
const started=performance.now(),n0=Object.keys(routes).length,m={visited:0,seedFailures:0,seedCacheHits:0,birthCacheHits:0,careerAttempts:0,careerAccepted:0,followupAttempts:0,followupAccepted:0,duplicates:0,unchanged:0,newRoutes:0,newTerminalBodies:0,closedSeeds:0,missingActiveResearch:0};
const timely=()=>performance.now()-started<seconds*1000&&m.newRoutes<limit;
const births=new Map();
function load(t){
 const {p,steps}=birthActions(db,t.r),full=[...steps,...t.r.actions];
 assert.equal(key(steps),p.fullActionHash);assert.equal(key(full),t.r.fullActionHash);
 const sc=diskSeed.load(full);let w=sc?.world;
 if(w)m.seedCacheHits++;else{
  let b=births.get(p.fullActionHash);if(b)m.birthCacheHits++;
  else{
   const c=diskBirth.load(steps,p.stateHash)||diskGrowth.load(steps,p.stateHash);if(c){b=c.world;m.birthCacheHits++;}
   else{b=replay.replay(steps);assert.equal(sha(serialize(b)),p.stateHash);}
   births.set(p.fullActionHash,b);
  }
  w=replay.replay(t.r.actions,b);
  assert.equal(exactWorld(w),t.r.canonicalStateHash);diskSeed.save({world:w,steps:full,trace:full.map((_,i)=>({index:i})),diagnostics:[]});
 }
 assert.equal(exactWorld(w),t.r.canonicalStateHash);const f=replay.finish(w);assert.deepEqual(f.raw,t.r.raw);assert.deepEqual(f.bonus,t.r.bonus);
 return {p,steps,n:{world:w,steps:t.r.actions}};
}
function register(t,b,n){
 const g=replay.grow(n),f=replay.finish(g.world),k=pairKey({...t.r,body:f.body});
 const newSteps=g.steps.slice(t.r.actions.length);
 if(!newSteps.some(s=>s.type==="conditionalPromotion"||s.type==="conditionalMedal"))return;
 if((found.get(k)||[]).some(v=>dominates(v,f.permanentVector))){m.unchanged++;return;}
 const full=[...b.steps,...g.steps],ctx=auditOriginCampaignContext(full,data),allowed=ctx.allowedDifficulties.filter(i=>b.p.allowedDifficulties.includes(i));
 const branch=branchMap.get(t.r.branch),commit=[...branch.captain,...Object.values(branch.choices||{})].filter(Boolean);
 if(ctx.kind!=="compatible"||!allowed.length||!commit.every(id=>replay.active(g.world,id)))return;
 const id="POPCHCAREER12:"+key([t.r.input,g.steps]).slice(0,24);if(routes[id])return;
 const xs=baseline.get(k)||[],best=xs.length?Math.max(...xs.map(sum)):null;
 addFront(found,k,f.permanentVector);
 routes[id]={seed:t.id,seedLedger:t.l,seedActionHash:t.r.fullActionHash,seedStateHash:t.r.canonicalStateHash,input:t.r.input,kind:t.r.kind,pair:t.r.pair,origin:t.r.origin,branch:t.r.branch,root:t.r.root,birthActionHash:b.p.fullActionHash,birthStateHash:b.p.stateHash,actions:g.steps,order:g.steps.filter(a=>a.type==="transform").map(a=>a.transform),fullActionHash:key(full),canonicalStateHash:exactWorld(g.world),allowedDifficulties:allowed,baselineBestSum:best,sumDelta:best===null?null:sum(f.permanentVector)-best,...f,actualGameCertified:false};
 m.newRoutes++;if(best===null)m.newTerminalBodies++;
}
for(const t of queue){
 if(!timely())break;
 let b;try{b=load(t);}catch(e){m.seedFailures++;attempts[t.id]={status:"SEED_UNRESOLVED",reason:String(e.message)};continue;}
 m.visited++;
 let beam=[b.n],seen=new Set(),done=true;
 for(let lev=0;lev<depth;lev++){
  const next=[];
  for(const n of beam){
   if(!timely()){done=false;break;}
   const grow=replay.grow(n);
   for(const q of grow===n?[n]:[grow,n])for(const r of byBody.get(member(q.world).state.soldierType)||[]){
    if(!timely()){done=false;break;}
    if(lev===0&&!isCareer(r))continue;
    if(!r.requires.every(id=>replay.active(q.world,id))){if(isCareer(r))m.missingActiveResearch++;continue;}
    if(isCareer(r))m.careerAttempts++;else m.followupAttempts++;
    const x=replay.transform(q,r);if(!x)continue;
    if(isCareer(r))m.careerAccepted++;else m.followupAccepted++;
    const k=statStateKey(x.world);if(seen.has(k)){m.duplicates++;continue;}seen.add(k);
    register(t,b,x);const f=replay.finish(x.world);next.push({n:x,body:f.body,score:sum(f.permanentCapVector)});
   }
  }
  next.sort((a,b)=>b.score-a.score);const counts=new Map();beam=[];
  for(const x of next){if(beam.length>=width)break;const n=counts.get(x.body)||0;if(n>=Math.max(1,Math.ceil(width/2)))continue;counts.set(x.body,n+1);beam.push(x.n);}
  if(!beam.length||!done)break;
 }
 if(done){attempts[t.id]={status:"BOUNDED_SEARCH_DONE",depth,width};m.closedSeeds++;}
}
const totals=Object.fromEntries(Object.entries(m).map(([k,v])=>[k,v+(prior?.totals?.[k]||0)])),all=Object.values(routes),elapsed=(performance.now()-started)/1000;
const summary={seedCandidates:[...selected.values()].flat().length,attemptedSeeds:Object.keys(attempts).length,completedSeeds:Object.values(attempts).filter(x=>x.status==="BOUNDED_SEARCH_DONE").length,registeredRoutes:all.length,newRoutes:all.length-n0,improvedPairs:new Set(all.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(all.map(pairKey)).size,improvedOrigins:new Set(all.map(r=>r.origin)).size,improvedBranches:new Set(all.map(r=>r.branch)).size,positiveSumPairBodies:new Set(all.filter(r=>r.sumDelta>0).map(pairKey)).size,newTerminalPairBodies:new Set(all.filter(r=>r.baselineBestSum===null).map(pairKey)).size,promotionRoutes:all.filter(r=>r.actions.some(a=>a.type==="conditionalPromotion")).length,medalRoutes:all.filter(r=>r.actions.some(a=>a.type==="conditionalMedal")).length,maxSumDelta:Math.max(0,...all.map(r=>r.sumDelta||0)),unindexedRankBodies:[...replay.rankDefaultUnknown],elapsedSeconds:elapsed,cumulativeSeconds:(prior?.summary.cumulativeSeconds||0)+elapsed,metrics:m,totals,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
const result={schemaVersion:1,kind:"POPULATION_CHRONOLOGICAL_CAREER",model:MODEL,fingerprint,hashes,sourceMetadataSha256:db.sourceMetadataSha256,sourceCareerSha256:db.populationCareerEnvelope.sha256,sourceFingerprints:fingerprints,routes,attempts,summary,totals,scope:"Chronological recruitment/research seeds with assumed combat-cap growth, explicit assumed promotion and minimum required medal decoration, deterministic transforms, active research only. Permanent vectors exclude medal bonuses. Bounded heuristic beam; campaign feasibility and global optimum unproved."};
fs.writeFileSync(file+".tmp",z.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(file+".tmp",file);console.log(JSON.stringify(summary));
