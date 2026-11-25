// Goal-directed extra research, followed by growth/career transformations.
// Bounded scheduling and exact world cache; every published route has a
// full chronological action witness, not a synthetic active research mask.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {MODEL,sha,key,sum,SOURCES,sourceFingerprints,pairKey,dominates,baseline,createResearchCareer} from "./population-research-career-core.mjs";
import {member,exactWorld,statStateKey} from "./population-growth-replay-core.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p)));
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json");
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const hashes=Object.fromEntries([...new Set([...Object.keys(db.populationChronologicalCareer.hashes),"public/soldiers/modern/foundation-research-planner.js","tools/population-research-career-core.mjs","tools/build-population-research-career.mjs"])].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const fingerprints=sourceFingerprints(db),fingerprint=key([MODEL,db.sourceMetadataSha256,fingerprints,hashes]);
const output=arg("out","population-research-career.json.gz"),prior=fs.existsSync(output)?decode(output):null;
if(prior&&prior.fingerprint!==fingerprint){
 assert(process.argv.includes("--migrate-template-cache"),"Source or engine migration required");
 assert.equal(prior.model,MODEL);assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);assert.deepEqual(prior.sourceFingerprints,fingerprints);
 for(const [p,h] of Object.entries(prior.hashes))if(!["tools/build-population-research-career.mjs","tools/population-research-career-core.mjs"].includes(p))assert.equal(hashes[p],h,"Dependency drift "+p);
}
if(db.populationResearchCareer)for(const [id,r] of Object.entries(db.populationResearchCareer.routes))assert.deepEqual(prior?.routes?.[id],r,"Existing published route missing "+id);
const seedCacheHashes=prior?.seedCacheHashes||prior?.hashes||null;
const routes={...(prior?.routes||{})},attempts={...(prior?.attempts||{})},visited={...(prior?.visited||{})};
const engine=createResearchCareer(data,db,hashes,{templates:prior?.planTemplates||{},seedCacheHashes}),{replay}=engine,base=baseline(db),found=new Map([...base].map(([k,v])=>[k,v.slice()]));
function addFront(k,v){const xs=found.get(k)||[];if(xs.some(x=>dominates(x,v)))return false;found.set(k,[...xs.filter(x=>!dominates(v,x)),v]);return true;}
for(const r of Object.values(routes))addFront(pairKey(r),r.permanentVector);
const eligible=new Map();
for(const l of SOURCES)for(const id of db[l].published){
 const r=db[l].routes[id],v=r.permanentCapVector||r.capVector||r.vector;
 if(!v||!r.canonicalStateHash||!engine.byBody.has(r.body))continue;
 const k=pairKey(r),xs=eligible.get(k)||[];
 xs.push({l,id,r,score:sum(v),career:Number(l==="populationChronologicalCareer")});
 xs.sort((a,b)=>b.score-a.score||b.career-a.career||a.r.actions.length-b.r.actions.length);
 // Prefer two distinct end-state seeds, not just multiple names for the
 // same state. This is a heuristic, never a completeness claim.
 const distinct=[],seen=new Set();for(const x of xs){if(seen.has(x.r.canonicalStateHash))continue;seen.add(x.r.canonicalStateHash);distinct.push(x);if(distinct.length===2)break;}
 eligible.set(k,distinct);
}
const selected=[...eligible.values()].flat(),byBranch=new Map();
for(const t of selected){const xs=byBranch.get(t.r.branch)||[];xs.push(t);byBranch.set(t.r.branch,xs);}
for(const xs of byBranch.values())xs.sort((a,b)=>(visited[a.id]||0)-(visited[b.id]||0)||b.career-a.career||b.score-a.score||a.id.localeCompare(b.id));
const branchCounts={};for(const r of Object.values(routes))branchCounts[r.branch]=(branchCounts[r.branch]||0)+1;
const groups=[...byBranch].sort(([a],[b])=>(branchCounts[a]||0)-(branchCounts[b]||0)||a.localeCompare(b));
const queue=[];for(let i=0;;i++){let more=false;for(const [,xs] of groups)if(xs[i]){queue.push(xs[i]);more=true;}if(!more)break;}
const seconds=Number(arg("seconds","20")),goalLimit=Number(arg("goals","80")),perSeed=Number(arg("per-seed","2")),followLimit=Number(arg("follow","3"));
assert(seconds>0&&[goalLimit,perSeed,followLimit].every(n=>Number.isSafeInteger(n)&&n>0));
const started=performance.now(),n0=Object.keys(routes).length,m={seeds:0,seedFailures:0,goalAttempts:0,probeRejected:0,plannerFailed:0,planSuccess:0,transformRejected:0,transformSuccess:0,followupAttempts:0,followupAccepted:0,newRoutes:0,unchanged:0,branchRejected:0,newTerminal:0,previousGoalSkipped:0};
const timely=()=>performance.now()-started<seconds*1000&&m.goalAttempts<goalLimit;
m.chainedResearchAttempts=0;m.chainedResearchSuccess=0;m.chainedNewRoutes=0;
function register(t,b,n,goal,secondaryGoal=null){
 const g=replay.grow(n),f=replay.finish(g.world),k=pairKey({...t.r,body:f.body});
 if((found.get(k)||[]).some(x=>dominates(x,f.permanentVector))){m.unchanged++;return;}
 const full=[...b.birth,...g.steps],allowed=engine.context(t.r.branch,b.p,full,g.world).filter(i=>t.r.allowedDifficulties.includes(i));
 if(!allowed.length){m.branchRejected++;return;}
 const id="POPRCAREER12:"+key([t.r.input,g.steps]).slice(0,24);if(routes[id])return;
 const xs=base.get(k)||[],best=xs.length?Math.max(...xs.map(sum)):null;
 addFront(k,f.permanentVector);
 const additional=[...g.world.researched].filter(id=>replay.active(g.world,id)&&!replay.active(b.n.world,id));
 const suffix=g.steps.slice(t.r.actions.length);
 assert(additional.length&&suffix.some(a=>a.type==="transform"));
 routes[id]={seed:t.id,seedLedger:t.l,seedActionHash:t.r.fullActionHash,seedStateHash:t.r.canonicalStateHash,input:t.r.input,kind:t.r.kind,pair:t.r.pair,origin:t.r.origin,branch:t.r.branch,root:t.r.root,birthActionHash:b.p.fullActionHash,birthStateHash:b.p.stateHash,actions:g.steps,order:g.steps.filter(a=>a.type==="transform").map(a=>a.transform),goal,...(secondaryGoal?{secondaryGoal}:{}),addedResearch:additional,fullActionHash:key(full),canonicalStateHash:exactWorld(g.world),allowedDifficulties:allowed,baselineBestSum:best,sumDelta:best===null?null:sum(f.permanentVector)-best,...f,actualGameCertified:false};
 m.newRoutes++;if(best===null)m.newTerminal++;
}
for(const t of queue){
 if(!timely())break;
 let b;try{b=engine.load(t.l,t.id);}catch(e){m.seedFailures++;continue;}
 m.seeds++;visited[t.id]=(visited[t.id]||0)+1;
 const grown=replay.grow(b.n),targets=engine.targets(grown,t.r.branch);
 let tried=0;
 for(const r of targets){
  if(!timely()||tried>=perSeed)break;
  const aid=key([t.id,r.id]),old=attempts[aid];if(old){m.previousGoalSkipped++;continue;}
  // Check both pre-growth and post-growth seeds. Numeric gate probes
  // avoid spending research time on an already forbidden transformation.
  const n=engine.probe(grown,r)?grown:engine.probe(b.n,r)?b.n:null;
  if(!n){m.probeRejected++;continue;}
  tried++;m.goalAttempts++;
  const rec={seed:t.id,ledger:t.l,rule:r.id,origin:t.r.origin,branch:t.r.branch,missing:r.requires.filter(id=>!replay.active(n.world,id))};
  try{
   const q=engine.plan(n,t.r.branch,b.birth,r);
   if(!q.ok){m.plannerFailed++;attempts[aid]={...rec,status:"LIMITED_UNRESOLVED",reason:q.reason};continue;}
   m.planSuccess++;
   const x=replay.transform(q.n,r);
   if(!x){m.transformRejected++;attempts[aid]={...rec,status:"TRANSFORM_REJECTED_AFTER_PLAN"};continue;}
   const ctx=engine.context(t.r.branch,b.p,[...b.birth,...x.steps],x.world).filter(i=>t.r.allowedDifficulties.includes(i));
   if(!ctx.length){m.branchRejected++;attempts[aid]={...rec,status:"CONTEXT_REJECTED"};continue;}
   m.transformSuccess++;
   register(t,b,x,r.id);
   const y=replay.grow(x),follow=(engine.byBody.get(member(y.world).state.soldierType)||[]).filter(v=>v.requires.every(k=>replay.active(y.world,k)));
   let triedFollow=0;const seen=new Set();
   for(const v of follow){
    if(performance.now()-started>=seconds*1000||triedFollow>=followLimit)break;
    m.followupAttempts++;const n2=replay.transform(y,v);if(!n2)continue;
    const sk=statStateKey(n2.world);if(seen.has(sk))continue;seen.add(sk);triedFollow++;m.followupAccepted++;register(t,b,n2,r.id);
   }
   // At most one further eligible research goal per successful primary.
   // This creates real two-research-stage routes, not just another transform.
   if(process.argv.includes("--chain")&&performance.now()-started<seconds*1000){
    for(const r2 of engine.targets(y,t.r.branch)){
     if(!engine.probe(y,r2))continue;
     m.chainedResearchAttempts++;
     try{
      const q2=engine.plan(y,t.r.branch,b.birth,r2);
      if(q2.ok){
       const x2=replay.transform(q2.n,r2);
       if(x2&&engine.context(t.r.branch,b.p,[...b.birth,...x2.steps],x2.world).some(i=>t.r.allowedDifficulties.includes(i))){
        m.chainedResearchSuccess++;const nBefore=m.newRoutes;register(t,b,x2,r.id,r2.id);m.chainedNewRoutes+=m.newRoutes-nBefore;
       }
      }
     }catch{}
     break;
    }
   }
   attempts[aid]={...rec,status:"CONDITIONAL_REPLAY",addedResearch:q.added};
  }catch(e){m.plannerFailed++;attempts[aid]={...rec,status:"LIMITED_UNRESOLVED",reason:String(e.message)};}
 }
}
const all=Object.values(routes),totals=Object.fromEntries(Object.entries({...m,...engine.metrics}).map(([k,v])=>[k,v+(prior?.totals?.[k]||0)])),elapsedSeconds=(performance.now()-started)/1000;
const summary={seedCandidates:selected.length,visitedSeeds:Object.keys(visited).length,attemptedGoals:Object.keys(attempts).length,successfulGoals:Object.values(attempts).filter(x=>x.status==="CONDITIONAL_REPLAY").length,registeredRoutes:all.length,newRoutes:all.length-n0,improvedPairs:new Set(all.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(all.map(pairKey)).size,improvedOrigins:new Set(all.map(r=>r.origin)).size,improvedBranches:new Set(all.map(r=>r.branch)).size,newResearchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,goalRules:new Set(all.map(r=>r.goal)).size,newTerminalPairBodies:new Set(all.filter(r=>r.baselineBestSum===null).map(pairKey)).size,positiveSumPairBodies:new Set(all.filter(r=>r.sumDelta>0).map(pairKey)).size,maxSumDelta:Math.max(0,...all.map(r=>r.sumDelta||0)),promotionRoutes:all.filter(r=>r.actions.some(a=>a.type==="conditionalPromotion")).length,medalRoutes:all.filter(r=>r.actions.some(a=>a.type==="conditionalMedal")).length,elapsedSeconds,cumulativeSeconds:(prior?.summary.cumulativeSeconds||0)+elapsedSeconds,metrics:{...m,...engine.metrics},totals,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
summary.chainedRoutes=all.filter(r=>r.secondaryGoal).length;
summary.templateBuckets=Object.keys(engine.templates).length;
summary.templateCount=Object.values(engine.templates).reduce((n,x)=>n+x.length,0);
const result={schemaVersion:1,kind:"POPULATION_RESEARCH_CAREER",model:MODEL,fingerprint,hashes,seedCacheHashes,planTemplates:engine.templates,sourceMetadataSha256:db.sourceMetadataSha256,sourceFingerprints:fingerprints,routes,attempts,visited,summary,totals,scope:"Chronological source recruitment and research, extra research actions replayed with branch commitments preserved, assumed cap growth, promotion and required medal decoration, deterministic transformations; conditional supplies and events. Permanent vectors exclude medal bonuses. Bounded goal/seed/follow-up search; failed attempts do not imply impossibility."};
fs.writeFileSync(output+".tmp",z.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);console.log(JSON.stringify(summary));
