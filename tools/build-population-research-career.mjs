// Goal-directed extra research, followed by growth/career transformations.
// Bounded scheduling and exact world cache; every published route has a
// full chronological action witness, not a synthetic active research mask.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {MODEL,sha,key,sum,SOURCES,sourceFingerprints,pairKey,dominates,baseline,createResearchCareer} from "./population-research-career-v2-core.mjs";
import {createQueueRecovery} from "./population-research-queue-recovery.mjs";
import {member,exactWorld,statStateKey} from "./population-growth-replay-core.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p)));
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json");
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const hashes=Object.fromEntries([...new Set([...Object.keys(db.populationChronologicalCareer.hashes),"public/soldiers/modern/foundation-research-planner.js","tools/population-research-career-core.mjs","tools/population-research-career-v2-core.mjs","tools/population-research-template-selector.mjs","tools/population-research-queue-recovery.mjs","tools/build-population-research-career.mjs"])].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const fingerprints=sourceFingerprints(db),fingerprint=key([MODEL,db.sourceMetadataSha256,fingerprints,hashes]);
const output=arg("out","population-research-career.json.gz"),prior=fs.existsSync(output)?decode(output):null;
if(prior&&prior.fingerprint!==fingerprint){
 assert(process.argv.includes("--migrate-template-cache"),"Source or engine migration required");
 assert.equal(prior.model,MODEL);assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);assert.deepEqual(prior.sourceFingerprints,fingerprints);
 for(const [p,h] of Object.entries(prior.hashes))if(!["tools/build-population-research-career.mjs","tools/population-research-career-core.mjs"].includes(p))assert.equal(hashes[p],h,"Dependency drift "+p);
}
if(db.populationResearchCareer)for(const [id,r] of Object.entries(db.populationResearchCareer.routes))assert.deepEqual(prior?.routes?.[id],r,"Existing published route missing "+id);
const seedCacheHashes=[...new Map([...(Array.isArray(prior?.seedCacheHashes)?prior.seedCacheHashes:prior?.seedCacheHashes?[prior.seedCacheHashes]:[]),...(prior?.hashes?[prior.hashes]:[])].map(h=>[key(h),h])).values()].filter(h=>key(h)!==key(hashes));
const routes={...(prior?.routes||{})},attempts={...(prior?.attempts||{})},visited={...(prior?.visited||{})},retryHistory={...(prior?.retryHistory||{})};
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
// Globally prioritize unseen seeds, retaining branch round-robin order within each tier.
const unseenOnly=process.argv.includes("--unvisited-only");
queue.sort((a,b)=>Number(Boolean(visited[a.id]))-Number(Boolean(visited[b.id])));
const seconds=Number(arg("seconds","20")),goalLimit=Number(arg("goals","80")),perSeed=Number(arg("per-seed","2")),followLimit=Number(arg("follow","3")),chainDepth=Number(arg("chain-depth",process.argv.includes("--chain")?"2":"1")),retryLimit=Number(arg("retry-limit","1"));
const retryEnabled=process.argv.includes("--retry-unresolved");
assert(Number.isSafeInteger(chainDepth)&&chainDepth>=1&&chainDepth<=3&&Number.isSafeInteger(retryLimit)&&retryLimit>=0);
assert(seconds>0&&[goalLimit,perSeed,followLimit].every(n=>Number.isSafeInteger(n)&&n>0));
const started=performance.now(),n0=Object.keys(routes).length,m={seeds:0,seedFailures:0,goalAttempts:0,probeRejected:0,plannerFailed:0,planSuccess:0,transformRejected:0,transformSuccess:0,followupAttempts:0,followupAccepted:0,newRoutes:0,unchanged:0,branchRejected:0,newTerminal:0,previousGoalSkipped:0};
const timely=()=>performance.now()-started<seconds*1000&&m.goalAttempts<goalLimit;
m.chainedResearchAttempts=0;m.chainedResearchSuccess=0;m.chainedNewRoutes=0;m.thirdResearchAttempts=0;m.thirdResearchSuccess=0;m.thirdNewRoutes=0;m.retryAttempts=0;m.retrySuccess=0;
function register(t,b,n,goal,secondaryGoal=null,tertiaryGoal=null,...laterGoals){
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
 routes[id]={seed:t.id,seedLedger:t.l,seedActionHash:t.r.fullActionHash,seedStateHash:t.r.canonicalStateHash,input:t.r.input,kind:t.r.kind,pair:t.r.pair,origin:t.r.origin,branch:t.r.branch,root:t.r.root,birthActionHash:b.p.fullActionHash,birthStateHash:b.p.stateHash,actions:g.steps,order:g.steps.filter(a=>a.type==="transform").map(a=>a.transform),goal,...(secondaryGoal?{secondaryGoal}:{}),...(tertiaryGoal?{tertiaryGoal}:{}),...(laterGoals.length?{researchGoals:[goal,secondaryGoal,tertiaryGoal,...laterGoals]}:{}),addedResearch:additional,fullActionHash:key(full),canonicalStateHash:exactWorld(g.world),allowedDifficulties:allowed,baselineBestSum:best,sumDelta:best===null?null:sum(f.permanentVector)-best,...f,actualGameCertified:false};
 m.newRoutes++;if(best===null)m.newTerminal++;
}
const continuationStates={...(prior?.continuationStates||{})};
const stateQueueMode=process.argv.includes("--state-queue");
if(!stateQueueMode)for(const t of queue){
 if(!timely())break;
 if(unseenOnly&&visited[t.id])continue;
 let b;try{b=engine.load(t.l,t.id);}catch(e){m.seedFailures++;continue;}
 m.seeds++;visited[t.id]=(visited[t.id]||0)+1;
 const grown=replay.grow(b.n),targets=engine.targets(grown,t.r.branch);
 let tried=0;
 for(const r of targets){
  if(!timely()||tried>=perSeed)break;
  const aid=key([t.id,r.id]),old=attempts[aid],retry=Boolean(old);
  if(old&&(!retryEnabled||old.status==="CONDITIONAL_REPLAY"||(retryHistory[aid]?.length||0)>=retryLimit)){m.previousGoalSkipped++;continue;}
  // Check both pre-growth and post-growth seeds. Numeric gate probes
  // avoid spending research time on an already forbidden transformation.
  const n=engine.probe(grown,r)?grown:engine.probe(b.n,r)?b.n:null;
  if(!n){m.probeRejected++;continue;}
  tried++;m.goalAttempts++;
  if(retry){retryHistory[aid]=[...(retryHistory[aid]||[]),old];m.retryAttempts++;}
  const rec={seed:t.id,ledger:t.l,rule:r.id,origin:t.r.origin,branch:t.r.branch,missing:r.requires.filter(id=>!replay.active(n.world,id))};
  try{
   const q=engine.plan(n,t.r.branch,b.birth,r);
   if(!q.ok){m.plannerFailed++;attempts[aid]={...rec,status:"LIMITED_UNRESOLVED",reason:q.reason};continue;}
   m.planSuccess++;
   const x=replay.transform(q.n,r);
   if(!x){m.transformRejected++;attempts[aid]={...rec,status:"TRANSFORM_REJECTED_AFTER_PLAN"};continue;}
   const ctx=engine.context(t.r.branch,b.p,[...b.birth,...x.steps],x.world).filter(i=>t.r.allowedDifficulties.includes(i));
   if(!ctx.length){m.branchRejected++;attempts[aid]={...rec,status:"CONTEXT_REJECTED"};continue;}
   m.transformSuccess++;if(retry)m.retrySuccess++;
   register(t,b,x,r.id);
   const y=replay.grow(x),follow=(engine.byBody.get(member(y.world).state.soldierType)||[]).filter(v=>v.requires.every(k=>replay.active(y.world,k)));
   let triedFollow=0;const seen=new Set();
   for(const v of follow){
    if(performance.now()-started>=seconds*1000||triedFollow>=followLimit)break;
    m.followupAttempts++;const n2=replay.transform(y,v);if(!n2)continue;
    const sk=statStateKey(n2.world);if(seen.has(sk))continue;seen.add(sk);triedFollow++;m.followupAccepted++;register(t,b,n2,r.id);
   }
   // Bounded consecutive research stages. Each stage requires an actually
   // missing active research goal on the preceding replayed world.
   let current=y,chain=[r.id];
   for(let level=2;level<=chainDepth&&performance.now()-started<seconds*1000;level++){
    let advanced=false;
    for(const nextRule of engine.targets(current,t.r.branch)){
     if(!engine.probe(current,nextRule))continue;
     m.chainedResearchAttempts++;if(level===3)m.thirdResearchAttempts++;
     try{
      const q2=engine.plan(current,t.r.branch,b.birth,nextRule);
      if(q2.ok){
       const x2=replay.transform(q2.n,nextRule);
       if(x2&&engine.context(t.r.branch,b.p,[...b.birth,...x2.steps],x2.world).some(i=>t.r.allowedDifficulties.includes(i))){
        m.chainedResearchSuccess++;if(level===3)m.thirdResearchSuccess++;
        chain.push(nextRule.id);const nBefore=m.newRoutes;register(t,b,x2,...chain);
        const delta=m.newRoutes-nBefore;m.chainedNewRoutes+=delta;if(level===3)m.thirdNewRoutes+=delta;
        current=replay.grow(x2);advanced=true;
       }
      }
     }catch{}
     break;
    }
    if(!advanced)break;
   }
   attempts[aid]={...rec,status:"CONDITIONAL_REPLAY",addedResearch:q.added};
  }catch(e){m.plannerFailed++;attempts[aid]={...rec,status:"LIMITED_UNRESOLVED",reason:String(e.message)};}
 }
}
// Persistent, depth-independent continuation queue. Exact action histories
// are deduplicated; numeric dominance never prevents further expansion.
if(stateQueueMode){
 const pending=[],known=new Set(),activeFollow=process.argv.includes("--active-follow"),recover=process.argv.includes("--recover-queue");
 const recovery=recover?createQueueRecovery(data,engine):null;
 const retryKeys=s=>Object.keys(s.outcomes||{}).filter(k=>!k.startsWith("active:")&&s.outcomes[k].status==="LIMITED_UNRESOLVED"&&!s.recovery?.[k]);
 const depth=s=>s.goals.length;
 const finished=s=>s.done&&(!activeFollow||s.activeDone)&&(!recover||!retryKeys(s).length);
 const outcome=(s,k,status,reason)=>{s.outcomes??={};s.outcomes[k]={status,...(reason?{reason}: {})};};
 function enqueue(s){
  const id=key([s.seed,s.ledger,s.actions,s.goals]);
  if(!continuationStates[id])continuationStates[id]={...s,cursor:0};
  if(!known.has(id)&&!finished(continuationStates[id])){known.add(id);pending.push(id);}
 }
 for(const [id,s] of Object.entries(continuationStates))if(!finished(s)){known.add(id);pending.push(id);}
 for(const r of Object.values(routes).sort((a,b)=>(b.researchGoals?.length||Number(!!b.tertiaryGoal)+Number(!!b.secondaryGoal)+1)-(a.researchGoals?.length||Number(!!a.tertiaryGoal)+Number(!!a.secondaryGoal)+1)))enqueue({seed:r.seed,ledger:r.seedLedger,actions:r.actions,goals:r.researchGoals||[r.goal,r.secondaryGoal,r.tertiaryGoal].filter(Boolean),stateHash:r.canonicalStateHash});
 // Interleave depths, deepest first. Do not leave newly discovered long
 // careers behind every shallow seed on each subsequent bounded run.
 const buckets=new Map();for(const id of pending){const d=depth(continuationStates[id]);if(!buckets.has(d))buckets.set(d,[]);buckets.get(d).push(id);}
 const tiers=[...buckets].sort((a,b)=>b[0]-a[0]).map(x=>x[1]);
 pending.length=0;for(let i=0;tiers.some(x=>i<x.length);i++)for(const x of tiers)if(x[i])pending.push(x[i]);
 m.queueAttempts=0;m.queueSuccess=0;m.queueExpanded=0;m.queueFailures=0;m.queueProbeRejected=0;
 m.queueActiveAttempts=0;m.queueActiveSuccess=0;m.queueActiveExpanded=0;m.queueNoop=0;m.queueRecoveryAttempts=0;m.queueRecoverySuccess=0;
 const recoveryLimit=Number(arg("recovery-limit","30"));assert(Number.isSafeInteger(recoveryLimit)&&recoveryLimit>0);
 function successor(s,t,b,x,goals){
  const g=replay.grow(x),stateHash=exactWorld(g.world);
  if(stateHash===s.stateHash){m.queueNoop++;return;}
  enqueue({seed:s.seed,ledger:s.ledger,actions:g.steps,goals,stateHash});
  register(t,b,x,...goals);
 }
 for(let i=0;i<pending.length&&timely();i++){
  const s=continuationStates[pending[i]];
  try{
   const b=engine.load(s.ledger,s.seed),t={id:s.seed,l:s.ledger,r:b.r};
   const world=replay.replay(s.actions.slice(b.r.actions.length),b.n.world);
   assert.equal(exactWorld(world),s.stateHash);
   const n={world,steps:s.actions},grown=replay.grow(n),targets=engine.targets(grown,b.r.branch);
   // Store the target ordering to detect any scheduler/model drift on resume.
   const signature=key(targets.map(r=>r.id));if(s.targetSignature)assert.equal(s.targetSignature,signature);s.targetSignature=signature;
   if(recover)for(const id of retryKeys(s)){
    if(!timely()||m.queueRecoveryAttempts>=recoveryLimit)break;
    const r=targets.find(x=>x.id===id);if(!r)continue;
    const candidate=engine.probe(grown,r)?grown:engine.probe(n,r)?n:null;if(!candidate)continue;
    s.recovery??={};m.goalAttempts++;m.queueRecoveryAttempts++;
    try{
     const q=recovery.plan(candidate,b.r.branch,b.birth,r);
     if(!q.ok){s.recovery[id]={status:"LIMITED_UNRESOLVED",reason:q.reason,unresolved:q.unresolved};continue;}
     const x=replay.transform(q.n,r);
     if(!x||!engine.context(b.r.branch,b.p,[...b.birth,...x.steps],x.world).some(i=>b.r.allowedDifficulties.includes(i))){s.recovery[id]={status:"TRANSFORM_OR_CONTEXT_REJECTED"};continue;}
     successor(s,t,b,x,[...s.goals,r.id]);m.queueRecoverySuccess++;s.recovery[id]={status:"CONDITIONAL_REPLAY"};
    }catch(e){s.recovery[id]={status:"LIMITED_UNRESOLVED",reason:String(e.message)};}
   }
   for(;s.cursor<targets.length&&timely();s.cursor++){
    const r=targets[s.cursor],candidate=engine.probe(grown,r)?grown:engine.probe(n,r)?n:null;
    if(!candidate){m.queueProbeRejected++;outcome(s,r.id,"PROBE_REJECTED");continue;}
    m.goalAttempts++;m.queueAttempts++;
    try{
     const q=engine.plan(candidate,b.r.branch,b.birth,r);
     if(!q.ok){m.queueFailures++;outcome(s,r.id,"LIMITED_UNRESOLVED",q.reason);continue;}
     const x=replay.transform(q.n,r);
     if(!x||!engine.context(b.r.branch,b.p,[...b.birth,...x.steps],x.world).some(i=>b.r.allowedDifficulties.includes(i))){m.queueFailures++;outcome(s,r.id,"TRANSFORM_OR_CONTEXT_REJECTED");continue;}
     successor(s,t,b,x,[...s.goals,r.id]);m.queueSuccess++;outcome(s,r.id,"CONDITIONAL_REPLAY");
    }catch(e){m.queueFailures++;outcome(s,r.id,"LIMITED_UNRESOLVED",String(e.message));}
   }
   if(s.cursor===targets.length&&!s.done){s.done=true;m.queueExpanded++;}
   // A research-free transformation can open a new body and future research
   // options. Keep the same research-goal chain, but preserve its action witness.
   if(activeFollow&&!s.activeDone){
    const active=(engine.byBody.get(member(grown.world).state.soldierType)||[]).filter(r=>r.requires.every(k=>replay.active(grown.world,k))).sort((a,b)=>a.id.localeCompare(b.id));
    const sig=key(active.map(r=>r.id));if(s.activeSignature)assert.equal(s.activeSignature,sig);s.activeSignature=sig;
    s.activeCursor??=0;
    for(;s.activeCursor<active.length&&timely();s.activeCursor++){
     const r=active[s.activeCursor];m.goalAttempts++;m.queueActiveAttempts++;
     try{
      const x=replay.transform(grown,r);
      if(!x||b.birth.length+x.steps.length>1800||!engine.context(b.r.branch,b.p,[...b.birth,...x.steps],x.world).some(i=>b.r.allowedDifficulties.includes(i))){outcome(s,"active:"+r.id,"TRANSFORM_OR_CONTEXT_OR_BUDGET_REJECTED");continue;}
      successor(s,t,b,x,s.goals);m.queueActiveSuccess++;outcome(s,"active:"+r.id,"CONDITIONAL_REPLAY");
     }catch(e){outcome(s,"active:"+r.id,"LIMITED_UNRESOLVED",String(e.message));}
    }
    if(s.activeCursor===active.length){s.activeDone=true;m.queueActiveExpanded++;}
   }
   delete s.error;
  }catch(e){s.error=String(e.message);m.seedFailures++;}
 }
 if(recovery)Object.assign(m,recovery.metrics);
}
const all=Object.values(routes),totals=Object.fromEntries([...new Set([...Object.keys(prior?.totals||{}),...Object.keys(m),...Object.keys(engine.metrics)])].map(k=>[k,(m[k]||engine.metrics[k]||0)+(prior?.totals?.[k]||0)])),elapsedSeconds=(performance.now()-started)/1000;
const summary={seedCandidates:selected.length,visitedSeeds:Object.keys(visited).length,attemptedGoals:Object.keys(attempts).length,successfulGoals:Object.values(attempts).filter(x=>x.status==="CONDITIONAL_REPLAY").length,registeredRoutes:all.length,newRoutes:all.length-n0,improvedPairs:new Set(all.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(all.map(pairKey)).size,improvedOrigins:new Set(all.map(r=>r.origin)).size,improvedBranches:new Set(all.map(r=>r.branch)).size,newResearchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,goalRules:new Set(all.map(r=>r.goal)).size,newTerminalPairBodies:new Set(all.filter(r=>r.baselineBestSum===null).map(pairKey)).size,positiveSumPairBodies:new Set(all.filter(r=>r.sumDelta>0).map(pairKey)).size,maxSumDelta:Math.max(0,...all.map(r=>r.sumDelta||0)),promotionRoutes:all.filter(r=>r.actions.some(a=>a.type==="conditionalPromotion")).length,medalRoutes:all.filter(r=>r.actions.some(a=>a.type==="conditionalMedal")).length,elapsedSeconds,cumulativeSeconds:(prior?.summary.cumulativeSeconds||0)+elapsedSeconds,metrics:{...m,...engine.metrics},totals,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
summary.chainedRoutes=all.filter(r=>r.secondaryGoal).length;
summary.thirdStageRoutes=all.filter(r=>r.tertiaryGoal).length;
summary.retryGoalCount=Object.keys(retryHistory).length;
summary.recoveredGoals=Object.keys(retryHistory).filter(k=>attempts[k]?.status==="CONDITIONAL_REPLAY").length;
summary.remainingUnvisited=selected.filter(t=>!visited[t.id]).length;
summary.templateBuckets=Object.keys(engine.templates).length;
summary.templateCount=Object.values(engine.templates).reduce((n,x)=>n+x.length,0);
summary.continuationStates=Object.keys(continuationStates).length;
summary.continuationPending=Object.values(continuationStates).filter(s=>!s.done).length;
summary.maxResearchStages=Math.max(0,...all.map(r=>r.researchGoals?.length||1+Number(!!r.secondaryGoal)+Number(!!r.tertiaryGoal)));
summary.fourPlusStageRoutes=all.filter(r=>(r.researchGoals?.length||0)>3).length;
summary.activeContinuationPending=Object.values(continuationStates).filter(s=>!s.activeDone).length;
summary.queueRecoveryAttempted=Object.values(continuationStates).reduce((n,s)=>n+Object.keys(s.recovery||{}).length,0);
summary.queueRecoveryRecovered=Object.values(continuationStates).reduce((n,s)=>n+Object.values(s.recovery||{}).filter(o=>o.status==="CONDITIONAL_REPLAY").length,0);
summary.queueOutcomeCounts={};for(const s of Object.values(continuationStates))for(const o of Object.values(s.outcomes||{}))summary.queueOutcomeCounts[o.status]=(summary.queueOutcomeCounts[o.status]||0)+1;
const result={schemaVersion:1,kind:"POPULATION_RESEARCH_CAREER",model:MODEL,fingerprint,hashes,seedCacheHashes,planTemplates:engine.templates,sourceMetadataSha256:db.sourceMetadataSha256,sourceFingerprints:fingerprints,routes,attempts,visited,retryHistory,continuationStates,summary,totals,scope:"Chronological source recruitment and research, extra research actions replayed with branch commitments preserved, assumed cap growth, promotion and required medal decoration, deterministic transformations; conditional supplies and events. Permanent vectors exclude medal bonuses. Bounded goal/seed/follow-up search; failed attempts do not imply impossibility."};
fs.writeFileSync(output+".tmp",z.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);console.log(JSON.stringify(summary));
