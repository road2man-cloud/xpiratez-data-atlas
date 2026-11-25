// Worklist of diverse numeric frontier proposals linked to indexed births.
// Prioritize genuinely new chronological candidates, not numerical maxima
// alone. Every registered route contains the full replayable suffix.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {MODEL,LEDGER,birthCatalog,sourceIdentity,chronologicalBaseline,createBridge,pairKey} from "./population-frontier-chronology-core.mjs";
import {proveBirthAppend} from "./population-frontier-birth-migration.mjs";
import {baseBirthProposals} from "./population-frontier-birth-proposals.mjs";
import {chainProposal} from "./population-frontier-chain-proposals.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {RANK_POLICY,defaultRankData} from "./population-frontier-default-rank.mjs";
import {sha,key,sum,dominates} from "./population-research-career-core.mjs";
const arg=(k,d)=>process.argv.find(s=>s.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const frontier=db.populationCareerFrontier,assumed=db.populationAssumedBirthClosure;
assert.equal(frontier.summary.modelClosedPairs,frontier.summary.pairCount);
assert.equal(sha(fs.readFileSync("public/data/"+frontier.file)),frontier.sha256);
const output=arg("out","population-frontier-chronology-v8.json.gz");
const prior=fs.existsSync(output)?decode(output):db[LEDGER];
assert(prior&&db[LEDGER]);
const source=sourceIdentity(db),{baseline:baselineIdentity,...stable}=source;
const {baseline:oldBaseline,...oldStable}=prior.source;
const birthAppend=stable.births!==oldStable.births?proveBirthAppend(db,prior):null;
if(!birthAppend)assert.deepEqual(stable,oldStable);
assert.equal(prior.model,MODEL);
assert.equal(prior.fingerprint,key([MODEL,db.sourceMetadataSha256,oldStable,prior.hashes]));
// Preserve the historical worklist provenance. Only that non-imported
// producer may drift independently. All replay/runtime dependencies are
// still pinned. The cached birth identity remains the original V2 key.
const hashes={...prior.hashes},cacheHashes=prior.cacheHashes||prior.hashes,provenanceDrift=[];
for(const [p,h] of Object.entries(prior.hashes)){
 const current=sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
 if(current!==h&&p==="tools/build-population-research-career.mjs"){
  provenanceDrift.push({file:p,expected:h,current});continue;
 }
 assert.equal(current,h,"Migration runtime dependency drift "+p);
}
const self="tools/build-population-frontier-chronology-v8.mjs";for(const p of [self,"tools/population-frontier-birth-migration.mjs","tools/population-frontier-birth-proposals.mjs","tools/population-frontier-chain-proposals.mjs"])hashes[p]=sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
const fingerprint=key([MODEL,db.sourceMetadataSha256,stable,hashes]);
let migration=prior.migration||null;
if(prior.fingerprint!==fingerprint)migration={kind:birthAppend?"APPEND_ONLY_BIRTH_CATALOG":"WORKLIST_AND_PREFIX_ONLY",fromFingerprint:prior.fingerprint,fromRoutes:Object.keys(prior.routes).length,fromAttempts:Object.keys(prior.attempts).length,...(birthAppend?{birthAppend}:{})};
for(const [id,r] of Object.entries(db[LEDGER].routes))assert.deepEqual(prior.routes[id],r,"Published route missing "+id);
const routes={...prior.routes},attempts={...prior.attempts},bridge=createBridge(data,db,cacheHashes,{templates:prior.templates||structuredClone(db.populationResearchCareer.planTemplates||{})});
const base=chronologicalBaseline(db),found=new Map([...base].map(([k,v])=>[k,v.slice()]));
const add=(k,v)=>{const xs=found.get(k)||[];if(xs.some(x=>dominates(x,v)))return false;found.set(k,[...xs.filter(x=>!dominates(v,x)),v]);return true;};
const routeKeys=new Set(),rankDefaultAttempts={...prior.rankDefaultAttempts};
for(const r of Object.values(routes)){routeKeys.add(key([r.input,r.fullActionHash]));add(pairKey(r),r.permanentVector);}
const rankData=defaultRankData(data),rankBridge=createBridge(rankData.data,db,cacheHashes,{templates:structuredClone(prior.templates||{}),cache:false});
const births=birthCatalog(db),newInputs=new Set([...(prior.expansionInputs||[]),...Object.values(attempts).filter(a=>a.birthExpansion).map(a=>a.input),...(migration?.birthAppend?.added||[]).map(t=>t[0])]);
const oi=new Map(assumed.origins.map((x,i)=>[x,i])),bi=new Map(assumed.branches.map((x,i)=>[x,i]));
const pairQueues=[],supported=f=>f.actions.every(a=>a.kind!=="TRANSFORM"||bridge.supported.has(a.id));
let skippedUnsupported=0;
for(const birth of births){
 if(!newInputs.has(birth.input))continue;
 const i=oi.get(birth.origin),j=bi.get(birth.branch),cid=assumed.classIndex[i]?.[j];if(cid==null)continue;
 const xs=[];
 for(const gi of assumed.classes[cid].groups)for(const f of frontier.groups[gi]?.frontier||baseBirthProposals(db,data,birth.origin,gi)){
  if(!supported(f)){skippedUnsupported++;continue;}
  const id=key([birth.input,f.id]);if(attempts[id])continue;
  xs.push({birth,gi,f,id});
 }
 xs.sort((a,b)=>Number(b.f.sourceKind==="BASE_CAP_REPLAY")-Number(a.f.sourceKind==="BASE_CAP_REPLAY")||Number(b.f.novelPermanent)-Number(a.f.novelPermanent)||sum(b.f.permanentVector)-sum(a.f.permanentVector)||a.f.actions.length-b.f.actions.length||a.id.localeCompare(b.id));
 if(xs.length)pairQueues.push(xs);
}
const queue=[];for(let i=0;;i++){let any=false;for(const xs of pairQueues)if(xs[i]){queue.push(xs[i]);any=true;}if(!any)break;}
const seconds=Number(arg("seconds","30")),limit=Number(arg("limit","250"));
assert(Number.isFinite(seconds)&&seconds>0&&Number.isSafeInteger(limit)&&limit>0);
const start=performance.now(),round={attempted:0,completed:0,newRoutes:0,duplicate:0,failed:0,rankAttempted:0,rankCompleted:0,rankNew:0};
for(const q of queue){
 if(round.attempted>=limit||performance.now()-start>=seconds*1000)break;
 round.attempted++;
 const record={input:q.birth.input,origin:q.birth.origin,branch:q.birth.branch,group:q.gi,sourceRoute:q.f.id,actionCount:q.f.actions.length,birthExpansion:true};
 let result;try{result=bridge.follow(q.birth,q.gi,q.f);}catch(e){result={ok:false,reason:String(e.message),at:0};}
 let rank=false;
 if(!result.ok){
  attempts[q.id]={...record,status:"LIMITED_UNRESOLVED",reason:result.reason,at:result.at};
  if(result.reason!=="Promotion rank list unindexed"){round.failed++;continue;}
  round.rankAttempted++;rank=true;
  try{result=rankBridge.follow(q.birth,q.gi,q.f);}catch(e){result={ok:false,reason:String(e.message),at:0};}
  if(!result.ok){round.failed++;rankDefaultAttempts[q.id]={originalAttempt:q.id,policy:RANK_POLICY.id,status:"LIMITED_UNRESOLVED",reason:result.reason,at:result.at};continue;}
  round.rankCompleted++;
 }
 round.completed++;
 const r=result.route,rk=key([r.input,r.fullActionHash]),id="POPFRONTCH12:"+rk.slice(0,24);
 if(q.f.sourceKind){r.sourceKind=q.f.sourceKind;if(q.f.sourceKind==="BIRTH_RESEARCH_PROPOSAL")r.numericExactMatch=false;}
 if(routeKeys.has(rk)){round.duplicate++;if(rank)rankDefaultAttempts[q.id]={originalAttempt:q.id,policy:RANK_POLICY.id,status:"DUPLICATE_REPLAY",route:id};else attempts[q.id]={...record,status:"DUPLICATE_REPLAY"};continue;}
 if(rank){r.rankDefault={policy:RANK_POLICY.id,originalAttempt:q.id,exactBuildVerified:false};rankDefaultAttempts[q.id]={originalAttempt:q.id,policy:RANK_POLICY.id,status:"CONDITIONAL_DEFAULT_RANK_REPLAY",route:id};round.rankNew++;}
 else attempts[q.id]={...record,status:"CONDITIONAL_REPLAY",route:id};
 routes[id]=r;routeKeys.add(rk);add(pairKey(r),r.permanentVector);round.newRoutes++;
}
// Chain exploration is a separate bounded worklist: do not treat numeric
// dominance as proof that a chronological state cannot have useful successors.
const chainAttempts={...prior.chainAttempts},birthById=new Map(births.map(b=>[b.input,b]));
const chainSeconds=Number(arg("chain-seconds","18")),chainLimit=Number(arg("chain-limit","160"));
assert(Number.isFinite(chainSeconds)&&chainSeconds>=0&&Number.isSafeInteger(chainLimit)&&chainLimit>=0);
const chainRound={attempted:0,completed:0,newRoutes:0,duplicate:0,failed:0,probeRejected:0,planFailed:0,seedFailed:0};
const chainStart=performance.now(),chainQueue=[],stateSeen=new Set(),chainSeeds=[];
for(const [id,parent] of Object.entries(routes)){
 if(parent.rankDefault||!["BIRTH_RESEARCH_PROPOSAL","BIRTH_RESEARCH_CHAIN"].includes(parent.sourceKind)||parent.order.length>=4)continue;
 const sk=key([parent.input,parent.canonicalStateHash]);
 if(stateSeen.has(sk))continue;stateSeen.add(sk);
 const xs=[];
 for(const rule of bridge.engine.byBody.get(parent.body)||[]){
  const f=chainProposal(data,id,parent,rule.id);if(!f)continue;
  const aid=key([parent.input,f.id]);if(chainAttempts[aid])continue;
  xs.push({id,parent,f,aid});
 }
 if(xs.length){xs.sort((a,b)=>a.f.rule.requires.length-b.f.rule.requires.length||a.f.rule.id.localeCompare(b.f.rule.id));chainSeeds.push(xs);}
}
chainSeeds.sort((a,b)=>a[0].parent.order.length-b[0].parent.order.length||sum(b[0].parent.permanentVector)-sum(a[0].parent.permanentVector)||a[0].id.localeCompare(b[0].id));
for(let i=0;;i++){let any=false;for(const xs of chainSeeds)if(xs[i]){chainQueue.push(xs[i]);any=true;}if(!any)break;}
const seedWorlds=new Map(),engine=bridge.engine,replay=bridge.replay;
for(const q of chainQueue){
 if(chainRound.attempted>=chainLimit||performance.now()-chainStart>=chainSeconds*1000)break;
 chainRound.attempted++;
 const rec={parent:q.id,rule:q.f.rule.id,input:q.parent.input,sourceRoute:q.f.id};
 const fail=(reason)=>{chainRound.failed++;chainAttempts[q.aid]={...rec,status:"LIMITED_UNRESOLVED",reason};};
 try{
  const birth=birthById.get(q.parent.input);assert(birth);
  let b=seedWorlds.get(q.id);
  if(!b){
   const original=bridge.loadBirth(birth),w=replay.replay(q.parent.actions,original.n.world);
   assert.equal(exactWorld(w),q.parent.canonicalStateHash);
   b={original,n:{world:w,steps:q.parent.actions}};
   if(seedWorlds.size<60)seedWorlds.set(q.id,b);
  }
  let n=b.n,rule=q.f.rule;
  const p=engine.policy(birth.branch,n);
  if(rule.requires.some(k=>p.blocked.has(k)||p.opposing.has(k)||n.world.disabled.has(k))){fail("BRANCH_RESEARCH_GATE");continue;}
  if(!engine.probe(n,rule)){chainRound.probeRejected++;fail("NUMERIC_OR_RANK_GATE");continue;}
  if(!rule.requires.every(k=>replay.active(n.world,k))){
   const plan=engine.plan(n,birth.branch,b.original.birth,rule);
   if(!plan.ok){chainRound.planFailed++;fail(plan.reason||"RESEARCH_UNRESOLVED");continue;}
   n=plan.n;
  }
  const x=replay.transform(n,rule);if(!x){fail("TRANSFORM_GATE");continue;}
  const g=replay.grow(x),full=[...b.original.birth,...g.steps];
  const allowed=engine.context(birth.branch,b.original.p,full,g.world).filter(i=>q.parent.allowedDifficulties.includes(i));
  if(!allowed.length){fail("CONTEXT_GATE");continue;}
  const f=replay.finish(g.world);assert.equal(f.body,q.f.body);
  const fullActionHash=key(full),rk=key([birth.input,fullActionHash]),id="POPFRONTCH12:"+rk.slice(0,24);
  chainRound.completed++;
  if(routeKeys.has(rk)){chainRound.duplicate++;chainAttempts[q.aid]={...rec,status:"DUPLICATE_REPLAY",route:id};continue;}
  const r={...birth,sourceGroup:q.parent.sourceGroup,sourceRoute:q.f.id,sourceActionHash:key(q.f.actions),sourcePermanentVector:q.f.permanentVector,sourceKind:q.f.sourceKind,chainParent:q.id,chainRule:rule.id,birthActionHash:b.original.p.fullActionHash,birthStateHash:b.original.p.stateHash,actions:g.steps,order:g.steps.filter(a=>a.type==="transform").map(a=>a.transform),addedResearch:[...g.world.researched].filter(k=>replay.active(g.world,k)&&!replay.active(b.original.n.world,k)),allowedDifficulties:allowed,fullActionHash,canonicalStateHash:exactWorld(g.world),...f,numericExactMatch:false,actualGameCertified:false};
  routes[id]=r;routeKeys.add(rk);add(pairKey(r),r.permanentVector);chainRound.newRoutes++;
  chainAttempts[q.aid]={...rec,status:"CONDITIONAL_CHAIN_REPLAY",route:id};
 }catch(e){chainRound.seedFailed++;fail(String(e.message));}
}
const chainRemaining=Math.max(0,chainQueue.length-chainRound.attempted);
const all=Object.values(routes),improved=all.filter(r=>!(base.get(pairKey(r))||[]).some(v=>dominates(v,r.permanentVector))),elapsedSeconds=(performance.now()-start)/1000;
const arows=Object.values(attempts),rrows=Object.values(rankDefaultAttempts),expansion=arows.filter(t=>t.birthExpansion);
const summary={...prior.summary,birthInputs:births.length,eligiblePairs:pairQueues.length,remainingProposals:queue.length-round.attempted,attempted:arows.length,replayedProposals:arows.filter(a=>a.status!=="LIMITED_UNRESOLVED").length,unresolvedProposals:arows.filter(a=>a.status==="LIMITED_UNRESOLVED").length,registeredRoutes:all.length,newRoutes:round.newRoutes+chainRound.newRoutes,improvedRoutes:improved.length,improvedPairs:new Set(improved.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(improved.map(pairKey)).size,newTerminalPairBodies:new Set(improved.filter(r=>!base.has(pairKey(r))).map(pairKey)).size,exactNumericMatches:all.filter(r=>r.numericExactMatch).length,additionalResearchRoutes:all.filter(r=>r.addedResearch.length).length,researchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,elapsedSeconds,cumulativeSeconds:(prior.summary.cumulativeSeconds||0)+elapsedSeconds,rankDefaultAttempts:rrows.length,rankDefaultSuccesses:rrows.filter(r=>r.status!=="LIMITED_UNRESOLVED").length,rankDefaultRoutes:all.filter(r=>r.rankDefault).length,birthExpansionInputs:newInputs.size,birthExpansionAttempts:expansion.length,birthExpansionRoutes:all.filter(r=>newInputs.has(r.input)&&r.sourceKind!=="BIRTH_RESEARCH_CHAIN").length,birthExpansionCapRoutes:all.filter(r=>newInputs.has(r.input)&&r.sourceKind==="BASE_CAP_REPLAY").length,birthExpansionResearchRoutes:all.filter(r=>newInputs.has(r.input)&&r.sourceKind==="BIRTH_RESEARCH_PROPOSAL").length,birthExpansionUnsupported:skippedUnsupported,birthExpansionRemaining:queue.length-round.attempted,birthExpansionRound:round,chainRound,chainAttempts:Object.keys(chainAttempts).length,chainRoutes:all.filter(r=>r.sourceKind==="BIRTH_RESEARCH_CHAIN").length,chainRemaining,chainSeedCount:chainSeeds.length,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
const {published,comparisons,careerEnvelopeConflicts,file,bytes,sha256,...clean}=prior;
const result={...clean,fingerprint,source,hashes,cacheHashes,routes,attempts,rankDefaultAttempts,rankPolicy:RANK_POLICY,migration,chainAttempts,expansionInputs:[...newInputs],templates:bridge.templates,summary,scope:"Append-only indexed recruitment expansion and chronological replay, separate conditional default rank policy; exact game optimum not certified."};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify({registeredRoutes:all.length,birthInputs:births.length,birthExpansionInputs:newInputs.size,birthExpansionAttempts:expansion.length,birthExpansionRoutes:summary.birthExpansionRoutes,birthExpansionRemaining:summary.birthExpansionRemaining,round,chainRound,chainRemaining,chainRoutes:summary.chainRoutes,elapsedSeconds,capRoutes:summary.birthExpansionCapRoutes,researchRoutes:summary.birthExpansionResearchRoutes,exactNumericMatches:summary.exactNumericMatches}));
