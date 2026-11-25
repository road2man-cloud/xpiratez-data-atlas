// Publish independently replayed chronological bridges without overwriting
// the fixed numeric closure or existing chronological research ledgers.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {serialize} from "node:v8";
import {performance} from "node:perf_hooks";
import {MODEL,LEDGER,birthCatalog,sourceIdentity,createBridge,pairKey} from "./population-frontier-chronology-core.mjs";
import {sha,key,sum,dominates} from "./population-research-career-core.mjs";
import {recoveryProposal} from "./population-frontier-recovery-core.mjs";
import {RANK_POLICY,defaultRankData} from "./population-frontier-default-rank.mjs";
import {proveBirthAppend} from "./population-frontier-birth-migration.mjs";
import {baseBirthProposals} from "./population-frontier-birth-proposals.mjs";
import {chainProposal} from "./population-frontier-chain-proposals.mjs";
import {extendedChainProposal,successorKey} from "./population-frontier-chain-extended.mjs";
import {horizonProposal,HORIZON_POLICY} from "./population-full-horizon-proposals.mjs";
import {rankHorizonProposal,RANK_HORIZON} from "./population-rank-horizon-proposals.mjs";
import {UNIFIED_POLICY,atGrowthCap} from "./population-frontier-unified-scheduler.mjs";
import {PRIORITY_POLICY,branchGateIndex,gateId} from "./population-frontier-priority-index.mjs";
import {PLATEAU_POLICY,routePlateauSummary} from "./population-frontier-plateau-scheduler.mjs";
import {exactWorld,birthActions} from "./population-growth-replay-core.mjs";
const reg="public/data/branch-soldier-results.json.gz",decode=x=>JSON.parse(gunzipSync(x)),read=p=>JSON.parse(fs.readFileSync(p));
const bytes=fs.readFileSync(process.argv[2]||"population-frontier-chronology-v3.json.gz"),a=decode(bytes),db=decode(fs.readFileSync(reg)),data=read("public/data/soldiers-modern-index.json");
assert.equal(a.kind,"POPULATION_FRONTIER_CHRONOLOGY");assert.equal(a.model,MODEL);
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const {baseline:oldBaseline,...stable}=a.source,{baseline:currentBaseline,...current}=sourceIdentity(db);
assert.deepEqual(stable,current);assert.equal(a.fingerprint,key([MODEL,a.sourceMetadataSha256,stable,a.hashes]));
const historicalBuilderDrift=[];
for(const [p,h] of Object.entries(a.hashes)){
 const actual=sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
 if(actual!==h&&p==="tools/build-population-research-career.mjs"&&db[LEDGER]?.hashes?.[p]===h){
  // The historical worklist builder is provenance only; the bridge imports
  // its unchanged core and planner directly. Do not waive any runtime hash.
  historicalBuilderDrift.push({file:p,expected:h,current:actual});continue;
 }
 assert.equal(actual,h,"Dependency drift "+p);
}
for(const k of ["fullCompleted","actualGameCertified","globalOptimalCertified"])assert.equal(a.summary[k],0);
if(db[LEDGER]){
 const old=db[LEDGER];
 if(old.fingerprint!==a.fingerprint){
  if(a.migration?.kind==="APPEND_ONLY_BIRTH_CATALOG")assert.deepEqual(a.migration.birthAppend,proveBirthAppend(db,old));
  else{assert.equal(a.migration?.kind,"WORKLIST_AND_PREFIX_ONLY");const {baseline:ob,...os}=old.source;assert.deepEqual(os,stable);}
  assert.equal(a.migration.fromFingerprint,old.fingerprint);
  assert(a.migration.fromRoutes>=old.summary.registeredRoutes);
  for(const [p,h] of Object.entries(old.hashes))assert.equal(a.hashes[p],h,"Migration dependency drift "+p);
 }
 for(const [id,r] of Object.entries(old.routes))assert.deepEqual(a.routes[id],r,"Prior route lost "+id);
 for(const [id,t] of Object.entries(old.attempts))assert.deepEqual(a.attempts[id],t,"Prior attempt lost "+id);
 for(const [id,t] of Object.entries(old.adaptedAttempts||{}))assert.deepEqual(a.adaptedAttempts?.[id],t,"Prior adaptation lost "+id);
 for(const [id,t] of Object.entries(old.recoveryAttempts||{}))assert.deepEqual(a.recoveryAttempts?.[id],t,"Prior recovery lost "+id);
 for(const [id,t] of Object.entries(old.rankDefaultAttempts||{}))assert.deepEqual(a.rankDefaultAttempts?.[id],t,"Prior rank retry lost "+id);
 for(const [id,t] of Object.entries(old.chainAttempts||{}))assert.deepEqual(a.chainAttempts?.[id],t,"Prior chain attempt lost "+id);
 for(const [id,t] of Object.entries(old.chainAliases||{}))assert.deepEqual(a.chainAliases?.[id],t,"Prior state alias lost "+id);
 for(const [id,t] of Object.entries(old.unifiedReuses||{}))assert.deepEqual(a.unifiedReuses?.[id],t,"Prior unified success reference lost "+id);
 for(const [id,t] of Object.entries(old.rankHorizonAttempts||{}))assert.deepEqual(a.rankHorizonAttempts?.[id],t,"Prior rank horizon attempt lost "+id);
}
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
const frontier=db.populationCareerFrontier,assumed=db.populationAssumedBirthClosure,env=db.populationCareerEnvelope;
const origins=new Map(assumed.origins.map((x,i)=>[x,i])),branches=new Map(assumed.branches.map((x,i)=>[x,i])),births=new Map(birthCatalog(db).map(r=>[r.input,r]));
const recoveryProfiles=new Map(data.profiles.map(p=>[p.id,p])),recoveryRules=new Map(data.transformations.map(r=>[r.id,r]));
const proposeChain=a.hashes["tools/population-frontier-chain-extended.mjs"]?extendedChainProposal:chainProposal;
if(a.chainAliases){
 assert.equal(Object.keys(a.chainAliases).length,a.summary.chainAliasCount);
 for(const [aid,t] of Object.entries(a.chainAliases)){
  assert(!a.chainAttempts[aid]);const parent=a.routes[t.parent],other=a.routes[t.equivalent.parent],target=a.routes[t.equivalent.route],success=a.chainAttempts[t.equivalent.attempt];
  assert(parent&&other&&target&&success);assert.equal(parent.input,t.input);
  const f=proposeChain(data,t.parent,parent,t.rule);assert(f);assert.equal(f.id,t.sourceRoute);assert.equal(aid,key([t.input,f.id]));
  assert.equal(t.successorKey,successorKey(parent,t.rule));assert.equal(t.successorKey,successorKey(other,t.rule));
  assert.equal(success.status,"CONDITIONAL_CHAIN_REPLAY");assert.equal(success.parent,t.equivalent.parent);assert.equal(success.rule,t.rule);assert.equal(success.route,t.equivalent.route);
  assert.equal(target.chainParent,success.parent);assert.equal(target.chainRule,t.rule);
 }
}
if(a.unifiedReuses){
 assert.equal(a.summary.unifiedPolicy,UNIFIED_POLICY);
 assert.equal(Object.keys(a.unifiedReuses).length,a.summary.unifiedReuseCount);
 for(const [aid,t] of Object.entries(a.unifiedReuses)){
  assert.equal(t.policy,UNIFIED_POLICY);
  const parent=a.routes[t.parent],other=a.routes[t.equivalent.parent],target=a.routes[t.equivalent.route],success=a.chainAttempts[t.equivalent.attempt];
  assert(parent&&other&&target&&success);assert.equal(parent.input,t.input);
  assert(atGrowthCap(parent)&&atGrowthCap(other),"Unified reference requires unchanged cap growth");
  const f=horizonProposal(data,t.parent,parent,t.rule);assert(f);assert.equal(f.id,t.sourceRoute);assert.equal(aid,key([t.input,f.id]));
  assert.equal(t.successorKey,successorKey(parent,t.rule));assert.equal(t.successorKey,successorKey(other,t.rule));
  assert.equal(success.status,"CONDITIONAL_CHAIN_REPLAY");assert.equal(success.parent,t.equivalent.parent);assert.equal(success.rule,t.rule);assert.equal(success.route,t.equivalent.route);
  assert.equal(target.chainParent,success.parent);assert.equal(target.chainRule,t.rule);
 }
}
// The gate index is a snapshot of explicit branch-policy exclusions, not
// an append-only global impossibility certificate. Rebuild every reference
// against the current source and the original horizon proposal.
if(a.branchGates||a.gateRefs){
 assert.equal(a.summary.priorityPolicy,PRIORITY_POLICY);
 assert.equal(Object.keys(a.branchGates||{}).length,a.summary.staticGateGroups);
 assert.equal(Object.keys(a.gateRefs||{}).length,a.summary.staticGateEdges);
 const getGate=branchGateIndex(db),used=new Set();
 for(const [gid,g] of Object.entries(a.branchGates||{})){
  const r=recoveryRules.get(g.rule);assert(r);
  assert.equal(g.policy,PRIORITY_POLICY);assert.equal(gid,gateId(g));
  assert.deepEqual(g,getGate(g.branch,r));
 }
 for(const [aid,t] of Object.entries(a.gateRefs||{})){
  assert(!a.chainAttempts[aid]&&!a.unifiedReuses?.[aid]);
  const g=a.branchGates[t.gate],p=a.routes[t.parent];assert(g&&p);
  assert.equal(p.branch,g.branch);
  const f=horizonProposal(data,t.parent,p,g.rule);assert(f);
  assert.equal(aid,key([p.input,f.id]));used.add(t.gate);
 }
 assert.equal(used.size,Object.keys(a.branchGates||{}).length);
}
if(a.summary.plateauPolicy){
 assert.equal(a.summary.plateauPolicy,PLATEAU_POLICY);
 assert.deepEqual(a.summary.plateauSummary,routePlateauSummary(a.routes));
 assert.equal(a.summary.plateauRegularPending+a.summary.plateauDeferredPending,a.summary.horizonPending);
}
if(a.rankHorizonAttempts){
 assert.equal(a.rankHorizonPolicy?.id,RANK_HORIZON);assert.deepEqual(a.rankHorizonPolicy.rankPolicy,RANK_POLICY);assert.equal(a.rankHorizonPolicy.depthLimit,null);assert.equal(a.rankHorizonPolicy.actualGameCertified,false);
 assert.equal(Object.keys(a.rankHorizonAttempts).length,a.summary.rankHorizonAttempts);
 assert.equal(Object.values(a.routes).filter(r=>r.rankHorizonPolicy===RANK_HORIZON).length,a.summary.rankHorizonRoutes);
 for(const [aid,t] of Object.entries(a.rankHorizonAttempts)){const p=a.routes[t.parent];assert(p?.rankDefault);assert.equal(t.rankHorizonPolicy,RANK_HORIZON);assert.equal(t.input,p.input);const f=rankHorizonProposal(data,t.parent,p,t.rule);assert(f);assert.equal(f.id,t.sourceRoute);assert.equal(aid,key([t.input,f.id]));if(t.status==="CONDITIONAL_CHAIN_REPLAY"){const r=a.routes[t.route];assert(r);assert.equal(r.rankHorizonPolicy,RANK_HORIZON);assert.equal(r.chainParent,t.parent);assert.equal(r.chainRule,t.rule);}else if(t.status==="DUPLICATE_REPLAY"){assert(a.routes[t.route]);}else{assert.equal(t.status,"LIMITED_UNRESOLVED");assert(t.reason);}}
}
const cacheHashes=a.cacheHashes||a.hashes;
for(const [p,h] of Object.entries(cacheHashes))assert.equal(a.hashes[p],h,"Cache runtime/provenance mismatch "+p);
const bridge=createBridge(data,db,cacheHashes,{cache:true}),{replay,engine}=bridge;
let rankBridge=null;
if(a.rankPolicy){assert.deepEqual(a.rankPolicy,RANK_POLICY);const rd=defaultRankData(data);assert.deepEqual(rd.indexed,a.summary.rankDefaultBodies);rankBridge=createBridge(rd.data,db,cacheHashes,{cache:false});}
// Share independent replay prefixes, not precomputed final states.
// Every branch point is built by applying the original actions to the
// empty world; applyOriginWitnessStep clones its input. Retain only fork
// worlds and final worlds to bound the amount of live state.
const trie={children:new Map(),world:replay.replay([])},birthPaths=new Map();
for(const [id,r] of Object.entries(a.routes)){
 if(db[LEDGER]?.routes[id]||birthPaths.has(r.input))continue;
 const {steps}=birthActions(db,r),path=[trie];let n=trie;
 for(const action of steps){
  const k=JSON.stringify(action);
  if(!n.children.has(k))n.children.set(k,{children:new Map(),action});
  n=n.children.get(k);path.push(n);
 }
 n.terminal=true;birthPaths.set(r.input,path);
}
let independentBirthSteps=0,sharedBirthSteps=0;
function replayBirthPrefix(input){
 const path=birthPaths.get(input);assert(path);
 let i=path.length-1;while(!path[i].world)i--;
 let w=path[i].world;sharedBirthSteps+=i;
 for(let j=i+1;j<path.length;j++){
  const n=path[j];w=replay.apply(w,n.action);independentBirthSteps++;
  if(n.children.size>1||n.terminal)n.world=w;
 }
 assert(!w.pendingFree);return w;
}
// Legacy byte hashes can differ after independent V8 serialization. A
// cached birth is accepted only by the exact expected byte hash in the
// cache loader, then compared to a fresh independent replay using the
// topology- and iteration-order-sensitive exactWorld hash.
const checkedBirths=new Map();let byteDifferentCanonicalEqual=0;
function independentBirth(origin){
 if(checkedBirths.has(origin.input))return checkedBirths.get(origin.input);
 const b=bridge.loadBirth(origin),w=replayBirthPrefix(origin.input),observed=sha(serialize(w));
 assert.equal(exactWorld(w),exactWorld(b.n.world),"Independent birth differs from exact verified birth "+origin.input);
 if(observed!==b.p.stateHash)byteDifferentCanonicalEqual++;
 const out={...b,n:{world:w,steps:[]}};checkedBirths.set(origin.input,out);return out;
}
// Compare to chronological witnesses, including the original birth and
// immediate transformation layers omitted from the worklist heuristic.
const baselineSources=new Set(["POPUNLOCK12","POPUNLOCKCONT12","POPEVENT12","POPEXT12","POPRESEARCH12","POPRESEARCHCHAIN12","POPGROW12","POPCHCAREER12","POPRCAREER12"]);
const base=new Map();
for(const w of Object.values(db.witnesses)){
 if(!baselineSources.has(w.source)||!Array.isArray(w.vector)||w.vector.length!==12)continue;
 for(const branch of w.branchIds||[]){
  const k=w.originProfile+"|"+branch+"|"+w.body,x=base.get(k)||[];
  if(!x.some(v=>dominates(v,w.vector)))base.set(k,[...x.filter(v=>!dominates(w.vector,v)),w.vector]);
 }
}
const comparisons={},published=[],improvedPairs=new Set(),improvedBodies=new Set(),positivePairs=new Set(),newBodies=new Set(),outside=[],maxima=Array(12).fill(null);
let exactMatches=0,addedResearch=0,improved=0,positive=0,maxDelta=0;
const before=Object.keys(db.witnesses).length,oldLedger=db[LEDGER];
const receiptFile="population-frontier-chronology-attach-receipts.json.gz";
const receiptIdentity=key([a.fingerprint,sha(bytes),sha(fs.readFileSync("tools/attach-population-frontier-chronology.mjs","utf8").replace(/\r\n/g,"\n"))]);
const saved=fs.existsSync(receiptFile)?decode(fs.readFileSync(receiptFile)):null;
const receipts=saved?.identity===receiptIdentity?saved.receipts:{};
if(saved?.identity===receiptIdentity)assert.equal(saved.digest,key(receipts),"Receipt digest mismatch");
function saveReceipts(){fs.writeFileSync(receiptFile+".tmp",gzipSync(Buffer.from(JSON.stringify({identity:receiptIdentity,receipts,digest:key(receipts)})),{level:4}));fs.renameSync(receiptFile+".tmp",receiptFile);}
const start=performance.now(),budget=Number(process.argv.find(x=>x.startsWith("--seconds="))?.slice(10)||"32")*1000;
assert(Number.isFinite(budget)&&budget>0);
let reusedPublished=0,reusedReceipts=0,fresh=0,paused=false;
for(const [id,r] of Object.entries(a.routes)){
 const origin=births.get(r.input);assert(origin);
 for(const [k,v] of Object.entries(origin))assert.equal(r[k],v);
 const i=origins.get(r.origin),j=branches.get(r.branch),cl=assumed.classes[assumed.classIndex[i][j]];
 assert(cl.groups.includes(r.sourceGroup));
 const chainParent=r.sourceKind==="BIRTH_RESEARCH_CHAIN"?a.routes[r.chainParent]:null;
 const candidates=chainParent?[(r.rankHorizonPolicy===RANK_HORIZON?rankHorizonProposal:r.horizonPolicy===HORIZON_POLICY?horizonProposal:proposeChain)(data,r.chainParent,chainParent,r.chainRule)].filter(Boolean):r.sourceKind?baseBirthProposals(db,data,r.origin,r.sourceGroup):frontier.groups[r.sourceGroup]?.frontier||[];
 const f=candidates.find(x=>x.id===r.sourceRoute);assert(f);assert.equal(r.sourceKind,f.sourceKind);
 if(r.sourceKind==="BIRTH_RESEARCH_CHAIN"){
  assert(chainParent&&!r.adaptation);if(r.rankHorizonPolicy){assert.equal(r.rankHorizonPolicy,RANK_HORIZON);assert(rankBridge&&chainParent.rankDefault);assert.deepEqual(r.rankDefault,chainParent.rankDefault);assert.equal(a.rankHorizonPolicy?.id,RANK_HORIZON);assert.equal(a.rankHorizonPolicy.depthLimit,null);assert.deepEqual(a.rankHorizonPolicy.rankPolicy,RANK_POLICY);}else assert(!r.rankDefault);assert.equal(chainParent.input,r.input);assert.equal(chainParent.sourceGroup,r.sourceGroup);
  assert.deepEqual(r.actions.slice(0,chainParent.actions.length),chainParent.actions);
  assert(r.actions.length>chainParent.actions.length);
  assert.deepEqual(r.order,[...chainParent.order,r.chainRule]);
  const c=(r.rankHorizonPolicy?a.rankHorizonAttempts:a.chainAttempts)?.[key([r.input,f.id])];if(r.rankHorizonPolicy)assert.equal(c?.rankHorizonPolicy,RANK_HORIZON);assert.equal(c?.parent,r.chainParent);assert.equal(c?.rule,r.chainRule);assert.equal(c?.route,id);assert.equal(c?.status,"CONDITIONAL_CHAIN_REPLAY");
  if(r.horizonPolicy){assert.equal(r.horizonPolicy,HORIZON_POLICY);assert.equal(c.horizonPolicy,HORIZON_POLICY);assert.equal(a.horizonPolicy?.depthLimit,null);}
 }
 assert.equal(r.sourceActionHash,key(f.actions));assert.deepEqual(r.sourcePermanentVector,f.permanentVector);
 let proposal=f.actions;
 if(r.rankDefault&&!r.rankHorizonPolicy){const x=r.rankDefault,t=a.attempts[x.originalAttempt],alt=a.rankDefaultAttempts?.[x.originalAttempt];assert(rankBridge);assert.equal(x.policy,RANK_POLICY.id);assert.equal(x.exactBuildVerified,false);assert.equal(x.originalAttempt,key([r.input,f.id]));assert.equal(t?.status,"LIMITED_UNRESOLVED");assert.equal(t?.reason,"Promotion rank list unindexed");assert.equal(t?.input,r.input);assert.equal(t?.group,r.sourceGroup);assert.equal(t?.sourceRoute,f.id);assert.equal(alt?.status,"CONDITIONAL_DEFAULT_RANK_REPLAY");assert.equal(alt?.route,id);assert.equal(alt?.policy,RANK_POLICY.id);assert(!r.adaptation);}
 if(r.adaptation?.recoveryAttempt){
  const x=r.adaptation,t=a.attempts[x.originalAttempt],alt=a.recoveryAttempts?.[x.recoveryAttempt];
  assert(t&&t.status==="LIMITED_UNRESOLVED");
  assert.equal(t.input,r.input);assert.equal(t.group,r.sourceGroup);assert.equal(t.sourceRoute,f.id);
  assert.equal(x.originalAttempt,key([r.input,f.id]));assert.equal(x.recoveryAttempt,key([x.originalAttempt,x.kind]));
  assert.equal(alt?.originalAttempt,x.originalAttempt);assert.equal(alt?.kind,x.kind);assert.equal(alt?.route,id);assert.equal(alt?.status,"CONDITIONAL_ALTERNATIVE_REPLAY");
  const variant=recoveryProposal(f,t,x.kind,recoveryRules,recoveryProfiles.get(r.origin)?.soldierType);assert(variant);
  assert.equal(x.actionHash,key(variant.actions));assert.equal(alt.actionHash,x.actionHash);assert.equal(alt.terminalBody,variant.body);assert.equal(r.body,variant.body);assert.deepEqual(alt.vector,r.permanentVector);
  proposal=variant.actions;
 }else if(r.adaptation){
  const x=r.adaptation,t=a.attempts[x.originalAttempt],alt=a.adaptedAttempts[x.originalAttempt];
  assert.equal(x.kind,"RANK_BLOCKED_PREFIX_THEN_CAP");assert.equal(x.appendCap,true);
  assert(t&&t.status==="LIMITED_UNRESOLVED"&&t.reason==="Promotion rank list unindexed");
  assert.equal(t.input,r.input);assert.equal(t.group,r.sourceGroup);assert.equal(t.sourceRoute,f.id);
  assert.equal(x.originalAttempt,key([r.input,f.id]));assert.equal(x.prefixLength,t.at);
  assert.equal(f.actions[t.at]?.kind,"ASSUMED_PROMOTION");
  assert.equal(alt?.route,id);assert.equal(alt?.status,"CONDITIONAL_PREFIX_REPLAY");
  proposal=[...f.actions.slice(0,t.at),{kind:"CAP_TARGET"}];
 }
 assert.deepEqual(r.order,proposal.filter(x=>x.kind==="TRANSFORM").map(x=>x.id));
 const {p:birthProof,steps:birthSteps}=birthActions(db,origin);
 assert.equal(r.birthActionHash,birthProof.fullActionHash);assert.equal(r.birthStateHash,birthProof.stateHash);
 assert.equal(key(birthSteps),birthProof.fullActionHash);assert.equal(r.fullActionHash,key([...birthSteps,...r.actions]));assert.equal(id,"POPFRONTCH12:"+key([r.input,r.fullActionHash]).slice(0,24));
 if(!r.adaptation)assert.equal(r.body,f.body);
 assert.deepEqual(r.order,r.actions.filter(a=>a.type==="transform").map(a=>a.transform));assert.equal(r.actualGameCertified,false);
 const routeHash=key(r);
 if(oldLedger?.routes[id]&&oldLedger.published.includes(id)&&db.witnesses[id]){
  assert.deepEqual(oldLedger.routes[id],r);reusedPublished++;
 }else if(receipts[id]){
  assert.equal(receipts[id].routeHash,routeHash);assert.equal(receipts[id].stateHash,r.canonicalStateHash);reusedReceipts++;
 }else{
  if(performance.now()-start>=budget){paused=true;break;}
  const b=independentBirth(origin),activeBridge=r.rankDefault?rankBridge:bridge,activeReplay=activeBridge.replay,activeEngine=activeBridge.engine,policy=activeEngine.policy(r.branch,b.n);let w=b.n.world;
  if(r.rankDefault){const rb=rankBridge.loadBirth(origin);assert.equal(exactWorld(rb.n.world),exactWorld(w),"Rank policy changed original birth");}
  for(const action of r.actions){
   const next=activeReplay.apply(w,action);
   assert(![...next.researched].some(k=>!w.researched.has(k)&&(policy.blocked.has(k)||policy.opposing.has(k))),"Opposing or blocked research");
   assert(!policy.commit.some(k=>activeReplay.active(w,k)&&!activeReplay.active(next,k)),"Branch commitment lost");
   w=next;
  }
  assert(!w.pendingFree);assert.equal(exactWorld(w),r.canonicalStateHash);
  const end=activeReplay.finish(w);for(const k of Object.keys(end))assert.deepEqual(r[k],end[k],"Final field "+k);
  const allowed=activeEngine.context(r.branch,b.p,[...b.birth,...r.actions],w);assert.deepEqual(r.allowedDifficulties,chainParent?allowed.filter(i=>chainParent.allowedDifficulties.includes(i)):allowed);assert(r.allowedDifficulties.length);
  const research=[...w.researched].filter(k=>activeReplay.active(w,k)&&!activeReplay.active(b.n.world,k));assert.deepEqual(research,r.addedResearch);
  receipts[id]={routeHash,stateHash:r.canonicalStateHash,birthHash:exactWorld(b.n.world),birthByteDifferent:sha(serialize(b.n.world))!==b.p.stateHash};
  fresh++;saveReceipts();
 }
 const match=!["BIRTH_RESEARCH_PROPOSAL","BIRTH_RESEARCH_CHAIN"].includes(r.sourceKind)&&r.body===f.body&&JSON.stringify(r.permanentVector)===JSON.stringify(f.permanentVector);assert.equal(r.numericExactMatch,match);
 if(match)exactMatches++;if(r.addedResearch.length)addedResearch++;
 const k=pairKey(r),old=base.get(k)||[],best=old.length?Math.max(...old.map(sum)):null,total=sum(r.permanentVector),delta=best===null?null:total-best;
 const novel=!old.some(v=>dominates(v,r.permanentVector));
 comparisons[id]={baselineBestSum:best,total,sumDelta:delta,novel,newBody:!old.length};
 if(novel){improved++;improvedPairs.add(r.origin+"|"+r.branch);improvedBodies.add(k);if(!old.length)newBodies.add(k);}
 if(delta>0){positive++;positivePairs.add(k);maxDelta=Math.max(maxDelta,delta);}
 for(let j=0;j<12;j++)maxima[j]=Math.max(maxima[j]??-Infinity,r.permanentVector[j]);
 const bound=env.groups[env.pairClasses[i][j]]?.bounds.find(x=>x.body===r.body);
 if(!bound||r.vector.some((v,k)=>v>bound.effective[k])||r.raw.some((v,k)=>v>bound.raw[k]))outside.push(id);
 const witness={source:"POPFRONTCH12",originProfile:r.origin,branchIds:[r.branch],body:r.body,raw:r.raw,bonus:r.permanentBonus,vector:r.permanentVector,
  steps:r.order.map(id=>({id,count:1})),research:[...new Set([...r.addedResearch,...r.order.flatMap(id=>replay.rules.get(id)?.requires||[])])],
  placement:"FRONTIER_GUIDED_MIN_BIRTH_CHRONOLOGY",populationFrontierChronology:{route:id,sourceGroup:r.sourceGroup,sourceRoute:r.sourceRoute,...(r.sourceKind?{sourceKind:r.sourceKind}:{}),...(chainParent?{chainParent:r.chainParent,chainRule:r.chainRule}:{}),fullActionHash:r.fullActionHash,rank:r.rank,medals:r.medals,...(r.adaptation?{adaptation:r.adaptation}:{}),...(r.rankDefault?{rankDefault:r.rankDefault}:{})},actualGameCertified:false};
 if(db.witnesses[id])assert.deepEqual(db.witnesses[id],witness);db.witnesses[id]=witness;published.push(id);
}
if(paused){console.log(JSON.stringify({status:"ATTACH_PAUSED",processed:published.length,total:a.summary.registeredRoutes,reusedPublished,reusedReceipts,fresh,receipts:Object.keys(receipts).length}));process.exit(0);}
assert.equal(published.length,a.summary.registeredRoutes);assert.equal(exactMatches,a.summary.exactNumericMatches);assert.equal(addedResearch,a.summary.additionalResearchRoutes);
for(const t of Object.values(a.attempts))if(t.status==="CONDITIONAL_REPLAY")assert(a.routes[t.route]);
const top=published.filter(id=>comparisons[id].novel).sort((x,y)=>(comparisons[y].sumDelta??-1)-(comparisons[x].sumDelta??-1)||comparisons[y].total-comparisons[x].total).slice(0,20).map(id=>({id,origin:a.routes[id].origin,branch:a.routes[id].branch,body:a.routes[id].body,...comparisons[id]}));
const summary={...a.summary,worklistComparison:{improvedRoutes:a.summary.improvedRoutes,newTerminalPairBodies:a.summary.newTerminalPairBodies},
 improvedRoutes:improved,improvedPairs:improvedPairs.size,improvedPairBodies:improvedBodies.size,newTerminalPairBodies:newBodies.size,
 positiveSumRoutes:positive,positiveSumPairBodies:positivePairs.size,maxSumDelta:maxDelta,permanentMax:maxima,independentRouteReplays:published.length,
 independentBirthReplays:new Set(Object.keys(receipts).map(id=>a.routes[id].input)).size,byteDifferentCanonicalEqual:Object.values(receipts).filter(r=>r.birthByteDifferent).length,registration:{reusedPublished,reusedReceipts,fresh,receiptCount:Object.keys(receipts).length,historicalBuilderDrift,independentBirthSteps,sharedBirthSteps},careerEnvelopeConflicts:outside.length,baselineSources:[...baselineSources],top};
const asset="soldier-population-frontier-chronology.json.gz";fs.writeFileSync("public/data/"+asset+".tmp",bytes);fs.renameSync("public/data/"+asset+".tmp","public/data/"+asset);
db[LEDGER]={...a,summary,published,comparisons,careerEnvelopeConflicts:outside,file:asset,bytes:bytes.length,sha256:sha(bytes)};
db.summary[LEDGER]=summary;db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
db.sources.POPFRONTCH12={file:a.hashes["tools/build-population-frontier-chronology-v13.mjs"]?"tools/build-population-frontier-chronology-v13.mjs":a.hashes["tools/build-population-frontier-chronology-v12.mjs"]?"tools/build-population-frontier-chronology-v12.mjs":a.hashes["tools/build-population-frontier-chronology-v11.mjs"]?"tools/build-population-frontier-chronology-v11.mjs":a.hashes["tools/merge-population-frontier-chronology-v10.mjs"]?"tools/merge-population-frontier-chronology-v10.mjs":a.hashes["tools/build-population-full-horizon.mjs"]?"tools/build-population-full-horizon.mjs":a.hashes["tools/build-population-frontier-chronology-v10.mjs"]?"tools/build-population-frontier-chronology-v10.mjs":a.hashes["tools/build-population-frontier-chronology-v9.mjs"]?"tools/build-population-frontier-chronology-v9.mjs":a.hashes["tools/build-population-frontier-chronology-v8.mjs"]?"tools/build-population-frontier-chronology-v8.mjs":a.hashes["tools/build-population-frontier-chronology-v7.mjs"]?"tools/build-population-frontier-chronology-v7.mjs":a.hashes["tools/build-population-frontier-chronology-v6.mjs"]?"tools/build-population-frontier-chronology-v6.mjs":a.hashes["tools/build-population-frontier-chronology-v5.mjs"]?"tools/build-population-frontier-chronology-v5.mjs":a.hashes["tools/build-population-frontier-chronology-v4.mjs"]?"tools/build-population-frontier-chronology-v4.mjs":a.hashes["tools/build-population-frontier-chronology-v3.mjs"]?"tools/build-population-frontier-chronology-v3.mjs":a.hashes["tools/build-population-frontier-chronology-v2.mjs"]?"tools/build-population-frontier-chronology-v2.mjs":"tools/build-population-frontier-chronology.mjs",fingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256,asset,sha256:sha(bytes)};
db.policies.POPFRONTCH12="고정 수치모형 파레토 행동 순서를 원본 최솟값 출생·실제 색인 연구 규칙에서 조건부 재생. 성장·계급·훈장·자원·이벤트 가정 유지, 미해결은 불가능성 아님. 원시 및 영구 수치 재계산, 전체 캠페인 전역 미인증.";
fs.writeFileSync(reg+".tmp",gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));fs.renameSync(reg+".tmp",reg);
console.log(JSON.stringify({summary:{...summary,top:top.slice(0,5)},newWitnesses:Object.keys(db.witnesses).length-before,registeredWitnesses:db.summary.registeredWitnesses,bytes:bytes.length}));
