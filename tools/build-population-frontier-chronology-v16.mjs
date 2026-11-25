// Resumable full-horizon continuation of the existing chronological registry.
// No transformation-count cutoff. No terminal-score dominance pruning.
// Each budget stops work, not the model. Unsupported action families stay open.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {MODEL,LEDGER,birthCatalog,sourceIdentity,chronologicalBaseline,createBridge,pairKey} from "./population-frontier-chronology-core.mjs";
import {sha,key,sum,dominates} from "./population-research-career-core.mjs";
import {HORIZON_POLICY} from "./population-full-horizon-proposals.mjs";
import {successorKey} from "./population-frontier-chain-extended.mjs";
import {UNIFIED_POLICY,atGrowthCap,knownTransitions,createIndexedHorizon,makeReuse} from "./population-frontier-unified-scheduler.mjs";
import {PRIORITY_POLICY,branchGateIndex,gateId,gainPriority,orderCandidates} from "./population-frontier-priority-index.mjs";
import {PLATEAU_POLICY,edgeClass,createPlateauIndex,routePlateauSummary,isDeferred,makeFairLanes} from "./population-frontier-plateau-scheduler.mjs";
import {COVERAGE_POLICY,birthPair,coverageIndex,orderMissing} from "./population-frontier-coverage-seeds.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {RETAINED_POLICY,createRetainedPriority,retainedSummary,traitTransition} from "./population-retained-trait-scheduler.mjs";
import {proveBirthAppendV2} from "./population-birth-append-v2.mjs";
import {COVERAGE_TRAIT_POLICY,traitCoverage,orderMissingOrigins,createCoveragePriority} from "./population-trait-coverage-scheduler.mjs";
const arg=(k,d)=>process.argv.find(s=>s.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.mod.version,"v.o2");assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const output=arg("out","population-frontier-chronology-v16.json.gz"),published=db[LEDGER],prior=fs.existsSync(output)?decode(output):published;
const source=sourceIdentity(db),{baseline:baselineIdentity,...stable}=source,{baseline:oldBaseline,...oldStable}=prior.source;
const birthAppend=stable.births!==oldStable.births?proveBirthAppendV2(db,prior):null;
if(!birthAppend)assert.deepEqual(stable,oldStable,"Source migration required");
assert.equal(prior.model,MODEL);assert.equal(prior.fingerprint,key([MODEL,db.sourceMetadataSha256,oldStable,prior.hashes]));
const hashes={...prior.hashes},cacheHashes=prior.cacheHashes||prior.hashes;
for(const [p,h] of Object.entries(prior.hashes)){
 const actual=sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
 if(actual!==h&&p==="tools/build-population-research-career.mjs")continue;
 assert.equal(actual,h,"Dependency drift "+p);
}
for(const p of ["tools/build-population-frontier-chronology-v16.mjs","tools/population-trait-coverage-scheduler.mjs"])hashes[p]=sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
const fingerprint=key([MODEL,db.sourceMetadataSha256,stable,hashes]);
const migration=published.fingerprint===fingerprint?published.migration:{kind:birthAppend?"APPEND_ONLY_BIRTH_CATALOG_V2":"WORKLIST_AND_PREFIX_ONLY",fromFingerprint:published.fingerprint,fromRoutes:Object.keys(published.routes).length,fromAttempts:Object.keys(published.attempts).length,...(birthAppend?{birthAppend}:{})};
for(const [id,r] of Object.entries(published.routes))assert.deepEqual(prior.routes[id],r,"Published route lost "+id);
for(const [id,a] of Object.entries(published.chainAttempts||{}))assert.deepEqual(prior.chainAttempts[id],a,"Published attempt lost "+id);
const routes={...prior.routes},attempts={...prior.attempts},chainAttempts={...prior.chainAttempts},unifiedReuses={...prior.unifiedReuses};
for(const [id,t] of Object.entries(published.unifiedReuses||{}))assert.deepEqual(unifiedReuses[id],t,"Published reuse lost "+id);
const imports=[...(prior.horizonImports||[])],importPath=arg("import","");
if(importPath){
 const bytes=fs.readFileSync(importPath),incoming=JSON.parse(gunzipSync(bytes));
 const {baseline:ib,...istable}=incoming.source;
 assert.deepEqual(istable,stable);assert.equal(incoming.sourceMetadataSha256,db.sourceMetadataSha256);
 assert.equal(incoming.fingerprint,key([MODEL,db.sourceMetadataSha256,istable,incoming.hashes]));
 assert.equal(incoming.horizonPolicy?.id,HORIZON_POLICY);
 for(const [p,h] of Object.entries(incoming.cacheHashes||{}))assert.equal(cacheHashes[p],h,"Import runtime provenance drift "+p);
 let importedRoutes=0,importedAttempts=0;
 for(const [id,r] of Object.entries(incoming.routes)){
  if(routes[id]){assert.deepEqual(routes[id],r,"Import conflict "+id);continue;}
  assert.equal(r.horizonPolicy,HORIZON_POLICY);assert.equal(r.actualGameCertified,false);
  routes[id]=r;importedRoutes++;
 }
 for(const [id,t] of Object.entries(incoming.chainAttempts||{})){
  if(chainAttempts[id]){assert.deepEqual(chainAttempts[id],t,"Import attempt conflict "+id);continue;}
  assert.equal(t.horizonPolicy,HORIZON_POLICY);assert(routes[t.parent]);
  if(t.status==="CONDITIONAL_CHAIN_REPLAY")assert(routes[t.route]);
  chainAttempts[id]=t;importedAttempts++;
 }
 for(const r of Object.values(routes))if(r.horizonPolicy===HORIZON_POLICY)assert(routes[r.chainParent],"Import parent absent");
 imports.push({fingerprint:incoming.fingerprint,artifactSha256:sha(bytes),producerHashes:incoming.hashes,importedRoutes,importedAttempts});
 console.log(JSON.stringify({importedRoutes,importedAttempts}));
}

const bridge=createBridge(data,db,cacheHashes,{templates:structuredClone(prior.templates||{}),cache:true});
const {engine,replay}=bridge,births=birthCatalog(db),birthById=new Map(births.map(b=>[b.input,b]));
const routeKeys=new Map(Object.entries(routes).map(([id,r])=>[key([r.input,r.fullActionHash]),id]));
const beforeCoverage=coverageIndex(routes,births),seedQueue=orderMissingOrigins(beforeCoverage,attempts,db,data),seedSeconds=Number(arg("seed-seconds","20")),seedLimit=Number(arg("seed-limit","150"));
assert(Number.isFinite(seedSeconds)&&seedSeconds>=0&&Number.isSafeInteger(seedLimit)&&seedLimit>=0);
const seedStart=performance.now(),coverageRound={attempted:0,registered:0,duplicate:0,unresolved:0,reasons:{}};
for(const q of seedQueue){
 if(coverageRound.attempted>=seedLimit||performance.now()-seedStart>=seedSeconds*1000)break;
 coverageRound.attempted++;
 const rec={input:q.birth.input,origin:q.birth.origin,branch:q.birth.branch,group:q.gi,sourceRoute:q.f.id,actionCount:1,coverageSeed:true};
 let result;try{result=bridge.follow(q.birth,q.gi,q.f);}catch(e){result={ok:false,reason:String(e.message),at:0};}
 if(!result.ok){attempts[q.id]={...rec,status:"LIMITED_UNRESOLVED",reason:result.reason,at:result.at};coverageRound.unresolved++;coverageRound.reasons[result.reason]=(coverageRound.reasons[result.reason]||0)+1;continue;}
 const r=result.route,rk=key([r.input,r.fullActionHash]),id="POPFRONTCH12:"+rk.slice(0,24);
 if(routeKeys.has(rk)){coverageRound.duplicate++;attempts[q.id]={...rec,status:"DUPLICATE_REPLAY",route:routeKeys.get(rk)};continue;}
 r.sourceKind=q.f.sourceKind;r.numericExactMatch=false;
 routes[id]=r;routeKeys.set(rk,id);attempts[q.id]={...rec,status:"CONDITIONAL_REPLAY",route:id};coverageRound.registered++;
}
coverageRound.elapsedSeconds=(performance.now()-seedStart)/1000;
const allocation=coverageIndex(routes,births);
const seedWorlds=new Map(),aliases={...prior.horizonAliases};
const indexedPropose=createIndexedHorizon(data),known=knownTransitions(routes,chainAttempts),revisitKnown=arg("revisit-known","0")==="1";
const getGate=branchGateIndex(db),score=gainPriority(data),branchGates={},gateRefs={},priorityRound=(prior.summary.priorityRoundNumber||0)+1;
const batchSize=Number(arg("batch","6"));assert(Number.isSafeInteger(batchSize)&&batchSize>=1&&batchSize<=24);
const period=Number(arg("plateau-period","8"));assert(Number.isSafeInteger(period)&&period>=2&&period<=32);
const plateauInfo=createPlateauIndex(routes),lanes=makeFairLanes(batchSize,period,prior.summary.plateauSchedulerTick||0),traitPriority=createCoveragePriority(db,data,routes,births);
const pairVisits=new Map(),originVisits=new Map();for(const t of Object.values(chainAttempts)){const r=routes[t.parent];if(!r)continue;const k=birthPair(r);pairVisits.set(k,(pairVisits.get(k)||0)+1);originVisits.set(r.origin,(originVisits.get(r.origin)||0)+1);}
const stats={attempted:0,completed:0,newRoutes:0,duplicate:0,failed:0,probeRejected:0,planFailed:0,seedFailed:0,seedHits:0,seedReplays:0,reuseReferences:0,oldReuseReferences:0,retryCandidates:0,activeTransforms:0,researchPlans:0,staticGateEdges:0,historyRejected:0,priorityScoreSum:0,plateauDeferredEdges:0,plateauAttempts:0,plateauProduced:0,changedVectorRoutes:0,sameVectorRoutes:0,exactLoopRoutes:0,newTraitRoutes:0,netTraitGainRoutes:0,traitLossRoutes:0,newResearchRoutes:0};
const reasons={},newIds=[],initialRoutes=Object.keys(routes).length;
let queuedEdges=0,rankDefaultParents=0,aliasParents=0;
const policyRecord={id:HORIZON_POLICY,depthLimit:null,completion:"NO_GAME_CERTIFICATE",scope:"All registered non-default-rank chronology seeds, deterministic live transformations, conditional cap growth and indexed research planning with minimum required promotion and medal assumptions.",unmodeled:["Unrepresented origin/branch births and unobserved research histories","Partial growth and actual battle growth outcomes","Actual rank/commendation acquisition and default-rank variants","Random transformations, wounds, death, revival, cloning, calendar, events and material acquisition","Proof of all successor families and repeat/loop closure"],plannerLimitsAreUnresolved:true};
function enqueue(id,r,front=false){
 if(r.rankDefault){rankDefaultParents++;return;}
 if(!birthById.has(r.input))return;
 // Do not collapse entire parents or mark failed searches impossible.
 // Only a known successful edge may be reused, with explicit provenance.
 const xs=[];
 for(const rule of engine.byBody.get(r.body)||[]){
  const f=indexedPropose(id,r,rule);if(!f)continue;
  const aid=key([r.input,f.id]);if(chainAttempts[aid])continue;
  const sk=successorKey(r,rule.id),hit=atGrowthCap(r)?known.success.get(sk):null;
  if(!revisitKnown&&unifiedReuses[aid]){stats.oldReuseReferences++;continue;}
  if(!revisitKnown&&hit){unifiedReuses[aid]=makeReuse(id,r,f,hit);stats.reuseReferences++;continue;}
  const gate=getGate(r.branch,rule);if(gate){const gid=gateId(gate);branchGates[gid]=gate;gateRefs[aid]={parent:id,gate:gid};stats.staticGateEdges++;continue;}
  const retry=known.tried.has(sk);if(retry)stats.retryCandidates++;
  xs.push({id,parent:r,f,aid,sk,retry});
 }
 const ordered=xs.sort((a,b)=>traitPriority.score(id,r,b.f.rule)-traitPriority.score(id,r,a.f.rule)||Number(a.retry)-Number(b.retry)||a.f.rule.id.localeCompare(b.f.rule.id)),pi=plateauInfo(id);
 const regular=[],deferred=[];
 for(const q of ordered)(traitPriority.defer(id,r,q.f.rule)?deferred:regular).push(q);
 stats.plateauDeferredEdges+=deferred.length;
 lanes.enqueue(r.origin,regular,false,front&&pi.streak===0);
 lanes.enqueue(r.origin,deferred,true);
 queuedEdges+=xs.length;
}
// Prefer origins not visited in the last run, then existing longer paths.
// There is neither a minimum nor a maximum transformation count.
const lastOrigins=new Set(prior.summary.horizonRound?.visitedOrigins||[]);
const seeds=Object.entries(routes).filter(([,r])=>!r.rankDefault).sort((a,b)=>traitPriority.seedCompare(a,b,originVisits,pairVisits,known.visited,lastOrigins,plateauInfo));
rankDefaultParents=Object.values(routes).filter(r=>r.rankDefault).length;
for(const [id,r] of seeds)enqueue(id,r);
const initialEdges=queuedEdges,initialOrigins=lanes.origins(),initialLanes=lanes.remaining();
const seconds=Number(arg("seconds","25")),limit=Number(arg("limit","200"));
assert(Number.isFinite(seconds)&&seconds>0&&Number.isSafeInteger(limit)&&limit>0);
const start=performance.now(),visited=new Set();
while(stats.attempted<limit&&performance.now()-start<seconds*1000){
 const q=lanes.next();if(!q)break;
 stats.attempted++;if(q.deferred)stats.plateauAttempts++;visited.add(q.parent.origin);
 const knownHit=atGrowthCap(q.parent)?known.success.get(q.sk):null;
 if(!revisitKnown&&knownHit){unifiedReuses[q.aid]=makeReuse(q.id,q.parent,q.f,knownHit);stats.reuseReferences++;continue;}
 const rec={parent:q.id,rule:q.f.rule.id,input:q.parent.input,sourceRoute:q.f.id,horizonPolicy:HORIZON_POLICY};
 const fail=reason=>{stats.failed++;reasons[reason]=(reasons[reason]||0)+1;chainAttempts[q.aid]={...rec,status:"LIMITED_UNRESOLVED",reason};};
 try{
  const birth=birthById.get(q.parent.input);assert(birth);
  let b=seedWorlds.get(q.id);
  if(!b){
   stats.seedReplays++;
   const original=bridge.loadBirth(birth),w=replay.replay(q.parent.actions,original.n.world);
   assert.equal(exactWorld(w),q.parent.canonicalStateHash,"Parent state replay drift");
   b={original,n:{world:w,steps:q.parent.actions}};
   if(seedWorlds.size>=40)seedWorlds.delete(seedWorlds.keys().next().value);
   seedWorlds.set(q.id,b);
  }else{stats.seedHits++;seedWorlds.delete(q.id);seedWorlds.set(q.id,b);}
  let n=b.n,rule=q.f.rule;
  const p=engine.policy(birth.branch,n);
  if(rule.requires.some(k=>p.blocked.has(k)||p.opposing.has(k)||n.world.disabled.has(k))){fail("BRANCH_RESEARCH_GATE");continue;}
  const history=member(n.world).state.history;
  if(rule.requiredPreviousTransformations?.some(k=>!history.has(k))||rule.forbiddenPreviousTransformations?.some(k=>history.has(k))){stats.historyRejected++;fail("TRANSFORM_HISTORY_GATE");continue;}
  n=replay.grow(n);
  if(!engine.probe(n,rule)){stats.probeRejected++;fail("NUMERIC_OR_RANK_GATE");continue;}
  if(!rule.requires.every(k=>replay.active(n.world,k))){
   stats.researchPlans++;
   const plan=engine.plan(n,birth.branch,b.original.birth,rule);
   if(!plan.ok){stats.planFailed++;fail(plan.reason||"RESEARCH_UNRESOLVED");continue;}
   n=plan.n;
  }else stats.activeTransforms++;
  const x=replay.transform(n,rule);if(!x){fail("TRANSFORM_GATE");continue;}
  const g=replay.grow(x),full=[...b.original.birth,...g.steps];
  const allowed=engine.context(birth.branch,b.original.p,full,g.world).filter(i=>q.parent.allowedDifficulties.includes(i));
  if(!allowed.length){fail("CONTEXT_GATE");continue;}
  const f=replay.finish(g.world);assert.equal(f.body,q.f.body);
  const fullActionHash=key(full),rk=key([birth.input,fullActionHash]),id="POPFRONTCH12:"+rk.slice(0,24);
  stats.completed++;stats.priorityScoreSum+=score(q.parent,rule);
  if(routeKeys.has(rk)){stats.duplicate++;chainAttempts[q.aid]={...rec,status:"DUPLICATE_REPLAY",route:routeKeys.get(rk)};continue;}
  const traitEvidence=traitTransition(b.n.world,g.world);
  const r={traitEvidence,...birth,sourceGroup:q.parent.sourceGroup,sourceRoute:q.f.id,sourceActionHash:key(q.f.actions),sourcePermanentVector:q.f.permanentVector,sourceKind:"BIRTH_RESEARCH_CHAIN",horizonPolicy:HORIZON_POLICY,chainParent:q.id,chainRule:rule.id,birthActionHash:b.original.p.fullActionHash,birthStateHash:b.original.p.stateHash,actions:g.steps,order:g.steps.filter(a=>a.type==="transform").map(a=>a.transform),addedResearch:[...g.world.researched].filter(k=>replay.active(g.world,k)&&!replay.active(b.original.n.world,k)),allowedDifficulties:allowed,fullActionHash,canonicalStateHash:exactWorld(g.world),...f,numericExactMatch:false,actualGameCertified:false};
  assert.deepEqual(r.order,[...q.parent.order,rule.id]);
  stats.newTraitRoutes+=Number(traitEvidence.gained.length>0);stats.netTraitGainRoutes+=Number(traitEvidence.after.length>traitEvidence.before.length);stats.traitLossRoutes+=Number(traitEvidence.lost.length>0);stats.newResearchRoutes+=Number(traitEvidence.newResearch.length>0);
  routes[id]=r;routeKeys.set(rk,id);newIds.push(id);stats.newRoutes++;
  const kind=edgeClass(q.parent,r);if(q.deferred)stats.plateauProduced++;
  if(kind==="EXACT_WORLD_LOOP")stats.exactLoopRoutes++;else if(kind==="SAME_VECTOR_STATE_CHANGE")stats.sameVectorRoutes++;else stats.changedVectorRoutes++;
  chainAttempts[q.aid]={...rec,status:"CONDITIONAL_CHAIN_REPLAY",route:id};
  if(atGrowthCap(q.parent))known.success.set(q.sk,{attempt:q.aid,parent:q.id,route:id});
  if(seedWorlds.size>=40)seedWorlds.delete(seedWorlds.keys().next().value);
  seedWorlds.set(id,{original:b.original,n:g});enqueue(id,r,true);
 }catch(e){stats.seedFailed++;fail(String(e.message));}
}
const all=Object.values(routes),newRoutes=newIds.map(id=>routes[id]),base=chronologicalBaseline(db);
const improved=all.filter(r=>!(base.get(pairKey(r))||[]).some(v=>dominates(v,r.permanentVector)));
const history={};for(const r of newRoutes)history[r.order.length]=(history[r.order.length]||0)+1;
const pending=queuedEdges-stats.attempted,pendingLanes=lanes.remaining();assert.equal(pending,pendingLanes[0]+pendingLanes[1]);
const horizonRound={...stats,initialRoutes,initialEdges,initialOrigins,initialLanes,queuedEdges,pending,pendingLanes,visitedOrigins:[...visited],newOrigins:new Set(newRoutes.map(r=>r.origin)).size,newPairs:new Set(newRoutes.map(r=>r.pair)).size,newDepthHistogram:history,maxNewDepth:Math.max(0,...newRoutes.map(r=>r.order.length)),rankDefaultParents,aliasParents,reasons,elapsedSeconds:(performance.now()-start)/1000};
const chainDepths={},horizonDepths={};for(const r of all)if(r.sourceKind==="BIRTH_RESEARCH_CHAIN"){chainDepths[r.order.length]=(chainDepths[r.order.length]||0)+1;if(r.horizonPolicy===HORIZON_POLICY)horizonDepths[r.order.length]=(horizonDepths[r.order.length]||0)+1;}
const unifiedTotals={...(prior.summary.unifiedTotals||{})};for(const k of ["seedHits","seedReplays","reuseReferences","activeTransforms","researchPlans"])unifiedTotals[k]=(unifiedTotals[k]||0)+stats[k];
const plateauSummary=routePlateauSummary(routes),plateauTotals={...(prior.summary.plateauTotals||{})};for(const k of ["plateauAttempts","plateauProduced","changedVectorRoutes","sameVectorRoutes","exactLoopRoutes"])plateauTotals[k]=(plateauTotals[k]||0)+stats[k];
const coverage=coverageIndex(routes,births).summary,coverageAttempts=Object.values(attempts).filter(t=>t.coverageSeed),coverageRemaining=orderMissing(coverageIndex(routes,births),attempts,db,data).length;
const summary={...prior.summary,registeredRoutes:all.length,newRoutes:stats.newRoutes+coverageRound.registered,attempted:Object.keys(attempts).length,replayedProposals:Object.values(attempts).filter(t=>t.status!=="LIMITED_UNRESOLVED").length,unresolvedProposals:Object.values(attempts).filter(t=>t.status==="LIMITED_UNRESOLVED").length,coveragePolicy:COVERAGE_POLICY,coverage,coverageBefore:beforeCoverage.summary,coverageRound,coverageSeedRoutes:all.filter(r=>r.sourceKind==="COVERAGE_CAP_REPLAY").length,coverageSeedAttempts:coverageAttempts.length,coverageSeedRemaining:coverageRemaining,improvedRoutes:improved.length,improvedPairs:new Set(improved.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(improved.map(pairKey)).size,newTerminalPairBodies:new Set(improved.filter(r=>!base.has(pairKey(r))).map(pairKey)).size,exactNumericMatches:all.filter(r=>r.numericExactMatch).length,additionalResearchRoutes:all.filter(r=>r.addedResearch.length).length,researchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,chainRoutes:all.filter(r=>r.sourceKind==="BIRTH_RESEARCH_CHAIN").length,chainAttempts:Object.keys(chainAttempts).length,chainDepths,horizonDepths,unifiedRound:horizonRound,unifiedTotals,unifiedReuseCount:Object.keys(unifiedReuses).length,unifiedPolicy:UNIFIED_POLICY,priorityPolicy:PRIORITY_POLICY,priorityRoundNumber:priorityRound,plateauPolicy:PLATEAU_POLICY,plateauPeriod:period,plateauSchedulerTick:lanes.tick(),plateauSummary,plateauTotals,plateauDeferredPending:pendingLanes[1],plateauRegularPending:pendingLanes[0],staticGateGroups:Object.keys(branchGates).length,staticGateEdges:Object.keys(gateRefs).length,horizonRound,horizonPending:pending,horizonRoutes:all.filter(r=>r.horizonPolicy===HORIZON_POLICY).length,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
summary.birthInputs=births.length;summary.retainedTraitPolicy=RETAINED_POLICY;summary.retainedTraitSummary=retainedSummary(routes);summary.retainedTraitRound=horizonRound;
summary.traitCoveragePolicy=COVERAGE_TRAIT_POLICY;summary.traitCoverage=traitCoverage(routes,data.profiles.map(p=>p.id));summary.traitCoverageBefore=traitPriority.measured;
const {published:oldPublished,comparisons,careerEnvelopeConflicts,file,bytes,sha256,...clean}=prior;
const result={...clean,fingerprint,source,hashes,cacheHashes,migration,routes,expansionInputs:[...new Set([...(prior.expansionInputs||[]),...(birthAppend?.added||[]).map(t=>t[0])])],attempts,chainAttempts,unifiedReuses,branchGates,gateRefs,horizonAliases:aliases,horizonImports:imports,horizonPolicy:policyRecord,templates:bridge.templates,summary,scope:"Unified bounded/horizon successful-edge reuse and unbounded deterministic live continuation. Known successes are references, not universal closure; all unsupported action families and game optimum remain unresolved."};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify({output,coverage,coverageRound,coverageSeedRemaining:coverageRemaining,horizonRound,horizonRoutes:summary.horizonRoutes,unifiedReuseCount:summary.unifiedReuseCount,staticGateGroups:summary.staticGateGroups,staticGateEdges:summary.staticGateEdges,plateauSummary,plateauTotals,unifiedTotals,chainDepths,registeredRoutes:all.length,retainedTraitSummary:summary.retainedTraitSummary,traitCoverage:{...summary.traitCoverage,byOrigin:undefined,byPair:undefined},actualGameCertified:0,examples:newRoutes.sort((a,b)=>b.order.length-a.order.length).slice(0,5).map(r=>({origin:r.origin,branch:r.branch,order:r.order,vector:r.permanentVector,traits:r.traitEvidence}))}));
