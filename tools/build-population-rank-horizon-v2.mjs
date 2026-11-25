// Continue every default-rank conditional witness, without a depth cutoff.
// Keep rank-assumed successors separate from exact-index successor reuse.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {MODEL,LEDGER,birthCatalog,sourceIdentity,chronologicalBaseline,createBridge,pairKey} from "./population-frontier-chronology-core.mjs";
import {sha,key,sum,dominates} from "./population-research-career-core.mjs";
import {defaultRankData,RANK_POLICY} from "./population-frontier-default-rank.mjs";
import {rankHorizonProposal,RANK_HORIZON} from "./population-rank-horizon-proposals.mjs";
import {TRAIT_PRIORITY,traitTransition,traitPriority,rankTraitSummary} from "./population-rank-trait-priority.mjs";
import {makeFairLanes,routePlateauSummary} from "./population-frontier-plateau-scheduler.mjs";
import {proveBirthAppendV2} from "./population-birth-append-v2.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json"),published=db[LEDGER];
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.mod.version,"v.o2");assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.deepEqual(published.rankPolicy,RANK_POLICY);
const output=arg("out","population-rank-horizon-v2.json.gz"),prior=fs.existsSync(output)?decode(output):published;
const source=sourceIdentity(db),{baseline:unused,...stable}=source,{baseline:unused2,...oldStable}=prior.source;
const birthAppend=stable.births!==oldStable.births?proveBirthAppendV2(db,prior):null;
if(!birthAppend)assert.deepEqual(stable,oldStable);assert.equal(prior.model,MODEL);assert.equal(prior.fingerprint,key([MODEL,db.sourceMetadataSha256,oldStable,prior.hashes]));
const hashes={...prior.hashes},cacheHashes=prior.cacheHashes||prior.hashes;
for(const [p,h] of Object.entries(prior.hashes)){
 const actual=sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
 if(actual!==h&&p==="tools/build-population-research-career.mjs")continue;
 assert.equal(actual,h,"Dependency drift "+p);
}
for(const p of ["tools/build-population-rank-horizon-v2.mjs","tools/population-rank-trait-priority.mjs","tools/population-birth-append-v2.mjs"])hashes[p]=sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
const fingerprint=key([MODEL,db.sourceMetadataSha256,stable,hashes]),migration=published.fingerprint===fingerprint?published.migration:{kind:birthAppend?"APPEND_ONLY_BIRTH_CATALOG_V2":"WORKLIST_AND_PREFIX_ONLY",fromFingerprint:published.fingerprint,fromRoutes:Object.keys(published.routes).length,fromAttempts:Object.keys(published.attempts).length,...(birthAppend?{birthAppend}:{})};
for(const [id,r] of Object.entries(published.routes))assert.deepEqual(prior.routes[id],r);
for(const [id,r] of Object.entries(published.rankHorizonAttempts||{}))assert.deepEqual(prior.rankHorizonAttempts[id],r);
const routes={...prior.routes},attempts={...prior.rankHorizonAttempts};
const rd=defaultRankData(data);assert.deepEqual(rd.indexed,published.summary.rankDefaultBodies);
const bridge=createBridge(rd.data,db,cacheHashes,{templates:structuredClone(prior.templates||{}),cache:false}),{engine,replay}=bridge;
const births=new Map(birthCatalog(db).map(b=>[b.input,b])),branches=new Map(db.branches.map(b=>[b.id,b])),priority=traitPriority(data,routes);
const batch=Number(arg("batch","5")),period=Number(arg("repeat-period","6"));assert(Number.isSafeInteger(batch)&&batch>0&&Number.isSafeInteger(period)&&period>=2);
const lanes=makeFairLanes(batch,period,prior.summary.rankTraitRound?.laneTick||0);
const routeKeys=new Map(Object.entries(routes).map(([id,r])=>[key([r.input,r.fullActionHash]),id])),seedCache=new Map();
const visits=new Map(),pairVisits=new Map();const pk=r=>r.origin+"|"+r.branch;
for(const t of Object.values(attempts)){visits.set(t.parent,(visits.get(t.parent)||0)+1);const p=routes[t.parent];if(p)pairVisits.set(pk(p),(pairVisits.get(pk(p))||0)+1);}
const stats={attempted:0,completed:0,newRoutes:0,duplicate:0,failed:0,seedReplays:0,seedHits:0,activeTransforms:0,researchPlans:0,historyRejected:0,staticBlocked:0,queued:0,regularAttempts:0,deferredAttempts:0,newTraitRoutes:0,netTraitGainRoutes:0,newResearchRoutes:0,changedVectorRoutes:0};
const reasons={},newIds=[],visited=new Set(),visitedPairs=new Set(),before=Object.keys(routes).length;
function enqueue(id,r,hot=false){
 if(!r.rankDefault||!births.has(r.input))return;
 const blocked=new Set(branches.get(r.branch).blockedResearch||[]),xs=[];
 for(const rule of engine.byBody.get(r.body)||[]){
  const f=rankHorizonProposal(data,id,r,rule.id);if(!f)continue;
  const aid=key([r.input,f.id]);if(attempts[aid])continue;
  if(rule.requires.some(k=>blocked.has(k))){stats.staticBlocked++;continue;}
  xs.push({id,r,rule,f,aid,score:priority.score(id,r,rule),defer:priority.deferred(id,r,rule)});
 }
 if(!xs.length)return;
 // Priority changes traversal order only. All other candidates are retained.
 xs.sort((a,b)=>b.score-a.score||a.rule.id.localeCompare(b.rule.id));
 lanes.enqueue(r.origin,xs.filter(q=>!q.defer),false,hot);lanes.enqueue(r.origin,xs.filter(q=>q.defer),true,false);
 stats.queued+=xs.length;
}
const last=new Set(prior.summary.rankHorizonRound?.visitedOrigins||[]);
const distinct=r=>new Set(r.order).size;
const seeds=Object.entries(routes).filter(([,r])=>r.rankDefault).sort((a,b)=>Number(last.has(a[1].origin))-Number(last.has(b[1].origin))||(pairVisits.get(pk(a[1]))||0)-(pairVisits.get(pk(b[1]))||0)||(visits.get(a[0])||0)-(visits.get(b[0])||0)||distinct(b[1])-distinct(a[1])||(a[1].order.length-distinct(a[1]))-(b[1].order.length-distinct(b[1]))||sum(b[1].permanentVector)-sum(a[1].permanentVector)||a[0].localeCompare(b[0]));
for(const [id,r] of seeds)enqueue(id,r);
const initialOrigins=lanes.origins(),initialQueue=stats.queued,seconds=Number(arg("seconds","25")),limit=Number(arg("limit","180"));
assert(seconds>0&&Number.isSafeInteger(limit)&&limit>0);const start=performance.now();
while(stats.attempted<limit&&performance.now()-start<seconds*1000){
 const q=lanes.next();if(!q)break;stats.attempted++;stats[q.deferred?"deferredAttempts":"regularAttempts"]++;visited.add(q.r.origin);visitedPairs.add(pk(q.r));
 const rec={parent:q.id,rule:q.rule.id,input:q.r.input,sourceRoute:q.f.id,rankHorizonPolicy:RANK_HORIZON};
 const fail=reason=>{stats.failed++;reasons[reason]=(reasons[reason]||0)+1;attempts[q.aid]={...rec,status:"LIMITED_UNRESOLVED",reason};};
 try{
  const birth=births.get(q.r.input);let b=seedCache.get(q.id);
  if(!b){stats.seedReplays++;const original=bridge.loadBirth(birth),w=replay.replay(q.r.actions,original.n.world);assert.equal(exactWorld(w),q.r.canonicalStateHash,"Parent state drift");b={original,n:{world:w,steps:q.r.actions}};if(seedCache.size>=32)seedCache.delete(seedCache.keys().next().value);seedCache.set(q.id,b);}else stats.seedHits++;
  let n=b.n;const r=q.rule,p=engine.policy(birth.branch,n),h=member(n.world).state.history;
  if(r.requires.some(k=>p.blocked.has(k)||p.opposing.has(k)||n.world.disabled.has(k))){fail("BRANCH_GATE");continue;}
  if(r.requiredPreviousTransformations?.some(k=>!h.has(k))||r.forbiddenPreviousTransformations?.some(k=>h.has(k))){stats.historyRejected++;fail("HISTORY_GATE");continue;}
  n=replay.grow(n);
  if(!engine.probe(n,r)){fail("NUMERIC_OR_RANK_GATE");continue;}
  if(!r.requires.every(k=>replay.active(n.world,k))){stats.researchPlans++;const plan=engine.plan(n,birth.branch,b.original.birth,r);if(!plan.ok){fail(plan.reason||"RESEARCH_UNRESOLVED");continue;}n=plan.n;}else stats.activeTransforms++;
  const x=replay.transform(n,r);if(!x){fail("TRANSFORM_GATE");continue;}
  const g=replay.grow(x),full=[...b.original.birth,...g.steps],allowed=engine.context(birth.branch,b.original.p,full,g.world).filter(k=>q.r.allowedDifficulties.includes(k));
  if(!allowed.length){fail("CONTEXT_GATE");continue;}
  const f=replay.finish(g.world);assert.equal(f.body,q.f.body);const fullActionHash=key(full),rk=key([birth.input,fullActionHash]),id="POPFRONTCH12:"+rk.slice(0,24);
  stats.completed++;
  if(routeKeys.has(rk)){stats.duplicate++;attempts[q.aid]={...rec,status:"DUPLICATE_REPLAY",route:routeKeys.get(rk)};continue;}
  const rankTraitEvidence=traitTransition(b.n.world,g.world);
  const result={rankTraitEvidence,...birth,sourceGroup:q.r.sourceGroup,sourceRoute:q.f.id,sourceActionHash:key(q.f.actions),sourcePermanentVector:q.f.permanentVector,sourceKind:"BIRTH_RESEARCH_CHAIN",rankHorizonPolicy:RANK_HORIZON,rankDefault:{...q.r.rankDefault},chainParent:q.id,chainRule:r.id,birthActionHash:b.original.p.fullActionHash,birthStateHash:b.original.p.stateHash,actions:g.steps,order:g.steps.filter(a=>a.type==="transform").map(a=>a.transform),addedResearch:[...g.world.researched].filter(k=>replay.active(g.world,k)&&!replay.active(b.original.n.world,k)),allowedDifficulties:allowed,fullActionHash,canonicalStateHash:exactWorld(g.world),...f,numericExactMatch:false,actualGameCertified:false};
  assert.deepEqual(result.order,[...q.r.order,r.id]);
  stats.newTraitRoutes+=Number(rankTraitEvidence.gained.length>0);stats.netTraitGainRoutes+=Number(rankTraitEvidence.after.length>rankTraitEvidence.before.length);stats.newResearchRoutes+=Number(rankTraitEvidence.newResearch.length>0);stats.changedVectorRoutes+=Number(result.permanentVector.some((v,i)=>v!==q.r.permanentVector[i]));
  routes[id]=result;routeKeys.set(rk,id);newIds.push(id);stats.newRoutes++;
  attempts[q.aid]={...rec,status:"CONDITIONAL_CHAIN_REPLAY",route:id};
  if(seedCache.size>=32)seedCache.delete(seedCache.keys().next().value);seedCache.set(id,{original:b.original,n:g});enqueue(id,result,true);
 }catch(e){fail(String(e.message));}
}
const all=Object.values(routes),newRoutes=newIds.map(id=>routes[id]),base=chronologicalBaseline(db),improved=all.filter(r=>!(base.get(pairKey(r))||[]).some(v=>dominates(v,r.permanentVector)));
const rankHorizonDepths={},chainDepths={};for(const r of all){if(r.sourceKind==="BIRTH_RESEARCH_CHAIN")chainDepths[r.order.length]=(chainDepths[r.order.length]||0)+1;if(r.rankHorizonPolicy===RANK_HORIZON)rankHorizonDepths[r.order.length]=(rankHorizonDepths[r.order.length]||0)+1;}
const [regularPending,deferredPending]=lanes.remaining();assert.equal(regularPending+deferredPending,stats.queued-stats.attempted);
const round={...stats,initialOrigins,initialQueue,initialRoutes:before,pending:regularPending+deferredPending,regularPending,deferredPending,laneTick:lanes.tick(),visitedPairs:[...visitedPairs],visitedOrigins:[...visited],newOrigins:new Set(newRoutes.map(r=>r.origin)).size,newPairs:new Set(newRoutes.map(r=>r.pair)).size,maxNewDepth:Math.max(0,...newRoutes.map(r=>r.order.length)),reasons,elapsedSeconds:(performance.now()-start)/1000};
const summary={...prior.summary,registeredRoutes:all.length,newRoutes:stats.newRoutes,improvedRoutes:improved.length,improvedPairs:new Set(improved.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(improved.map(pairKey)).size,newTerminalPairBodies:new Set(improved.filter(r=>!base.has(pairKey(r))).map(pairKey)).size,exactNumericMatches:all.filter(r=>r.numericExactMatch).length,additionalResearchRoutes:all.filter(r=>r.addedResearch.length).length,researchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,chainRoutes:all.filter(r=>r.sourceKind==="BIRTH_RESEARCH_CHAIN").length,chainDepths,rankHorizonRound:round,rankHorizonAttempts:Object.keys(attempts).length,rankHorizonRoutes:all.filter(r=>r.rankHorizonPolicy===RANK_HORIZON).length,rankHorizonDepths,rankHorizonPending:round.pending,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
summary.birthInputs=births.size;summary.rankTraitPolicy=TRAIT_PRIORITY;summary.rankTraitRound=round;summary.rankTraitSummary=rankTraitSummary(routes);if(summary.plateauPolicy)summary.plateauSummary=routePlateauSummary(routes);
const {published:ids,comparisons,careerEnvelopeConflicts,file,bytes,sha256,...clean}=prior;
const result={...clean,fingerprint,source,hashes,cacheHashes,migration,routes,expansionInputs:[...new Set([...(prior.expansionInputs||[]),...(birthAppend?.added||[]).map(t=>t[0])])],rankHorizonAttempts:attempts,rankHorizonPolicy:{id:RANK_HORIZON,rankPolicy:RANK_POLICY,depthLimit:null,actualGameCertified:false,scope:"Inherited conditional default rank, deterministic live transforms, cap growth, indexed research, minimum required rank/medals. Failed planning remains unresolved."},templates:bridge.templates,summary};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify({output,round,rankHorizonRoutes:summary.rankHorizonRoutes,rankHorizonDepths,rankTraitSummary:summary.rankTraitSummary,registeredRoutes:all.length,examples:newRoutes.slice(0,6).map(r=>({origin:r.origin,body:r.body,order:r.order,vector:r.permanentVector,traits:r.rankTraitEvidence}))}));
