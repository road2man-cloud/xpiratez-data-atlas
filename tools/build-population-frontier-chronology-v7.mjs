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
const output=arg("out","population-frontier-chronology-v7b.json.gz");
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
const self="tools/build-population-frontier-chronology-v7.mjs";for(const p of [self,"tools/population-frontier-birth-migration.mjs","tools/population-frontier-birth-proposals.mjs"])hashes[p]=sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
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
const births=birthCatalog(db),newInputs=new Set((migration?.birthAppend?.added||[]).map(t=>t[0]));
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
const all=Object.values(routes),improved=all.filter(r=>!(base.get(pairKey(r))||[]).some(v=>dominates(v,r.permanentVector))),elapsedSeconds=(performance.now()-start)/1000;
const arows=Object.values(attempts),rrows=Object.values(rankDefaultAttempts),expansion=arows.filter(t=>t.birthExpansion);
const summary={...prior.summary,birthInputs:births.length,eligiblePairs:pairQueues.length,remainingProposals:queue.length-round.attempted,attempted:arows.length,replayedProposals:arows.filter(a=>a.status!=="LIMITED_UNRESOLVED").length,unresolvedProposals:arows.filter(a=>a.status==="LIMITED_UNRESOLVED").length,registeredRoutes:all.length,newRoutes:round.newRoutes,improvedRoutes:improved.length,improvedPairs:new Set(improved.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(improved.map(pairKey)).size,newTerminalPairBodies:new Set(improved.filter(r=>!base.has(pairKey(r))).map(pairKey)).size,exactNumericMatches:all.filter(r=>r.numericExactMatch).length,additionalResearchRoutes:all.filter(r=>r.addedResearch.length).length,researchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,elapsedSeconds,cumulativeSeconds:(prior.summary.cumulativeSeconds||0)+elapsedSeconds,rankDefaultAttempts:rrows.length,rankDefaultSuccesses:rrows.filter(r=>r.status!=="LIMITED_UNRESOLVED").length,rankDefaultRoutes:all.filter(r=>r.rankDefault).length,birthExpansionInputs:newInputs.size,birthExpansionAttempts:expansion.length,birthExpansionRoutes:all.filter(r=>newInputs.has(r.input)).length,birthExpansionCapRoutes:all.filter(r=>newInputs.has(r.input)&&r.sourceKind==="BASE_CAP_REPLAY").length,birthExpansionResearchRoutes:all.filter(r=>newInputs.has(r.input)&&r.sourceKind==="BIRTH_RESEARCH_PROPOSAL").length,birthExpansionUnsupported:skippedUnsupported,birthExpansionRemaining:queue.length-round.attempted,birthExpansionRound:round,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
const {published,comparisons,careerEnvelopeConflicts,file,bytes,sha256,...clean}=prior;
const result={...clean,fingerprint,source,hashes,cacheHashes,routes,attempts,rankDefaultAttempts,rankPolicy:RANK_POLICY,migration,templates:bridge.templates,summary,scope:"Append-only indexed recruitment expansion and chronological replay, separate conditional default rank policy; exact game optimum not certified."};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify({registeredRoutes:all.length,birthInputs:births.length,birthExpansionInputs:newInputs.size,birthExpansionAttempts:expansion.length,birthExpansionRoutes:summary.birthExpansionRoutes,birthExpansionRemaining:summary.birthExpansionRemaining,round,elapsedSeconds,capRoutes:summary.birthExpansionCapRoutes,researchRoutes:summary.birthExpansionResearchRoutes,exactNumericMatches:summary.exactNumericMatches}));
