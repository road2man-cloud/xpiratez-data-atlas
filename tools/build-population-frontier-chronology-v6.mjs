// Worklist of diverse numeric frontier proposals linked to indexed births.
// Prioritize genuinely new chronological candidates, not numerical maxima
// alone. Every registered route contains the full replayable suffix.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {MODEL,LEDGER,birthCatalog,sourceIdentity,chronologicalBaseline,createBridge,pairKey} from "./population-frontier-chronology-core.mjs";
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
const output=arg("out","population-frontier-chronology-v6.json.gz");
const legacy=arg("legacy","population-frontier-chronology-v5.json.gz");
const prior=fs.existsSync(output)?decode(output):fs.existsSync(legacy)?decode(legacy):db[LEDGER];
assert(prior&&db[LEDGER]);
const source=sourceIdentity(db),{baseline:baselineIdentity,...stable}=source;
const {baseline:oldBaseline,...oldStable}=prior.source;
assert.deepEqual(stable,oldStable);
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
const self="tools/build-population-frontier-chronology-v6.mjs";for(const p of [self,"tools/population-frontier-default-rank.mjs"])hashes[p]=sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
const fingerprint=key([MODEL,db.sourceMetadataSha256,stable,hashes]);
let migration=prior.migration||null;
if(prior.fingerprint!==fingerprint)migration={kind:"WORKLIST_AND_PREFIX_ONLY",fromFingerprint:prior.fingerprint,fromRoutes:Object.keys(prior.routes).length,fromAttempts:Object.keys(prior.attempts).length};
for(const [id,r] of Object.entries(db[LEDGER].routes))assert.deepEqual(prior.routes[id],r,"Published route missing "+id);
const routes={...prior.routes},attempts={...prior.attempts},bridge=createBridge(data,db,cacheHashes,{templates:prior.templates||structuredClone(db.populationResearchCareer.planTemplates||{})});
const base=chronologicalBaseline(db);
const baselineSources=new Set(["POPUNLOCK12","POPUNLOCKCONT12","POPEVENT12","POPEXT12","POPRESEARCH12","POPRESEARCHCHAIN12","POPGROW12","POPCHCAREER12","POPRCAREER12"]);
for(const w of Object.values(db.witnesses))if(baselineSources.has(w.source)&&Array.isArray(w.vector)&&w.vector.length===12)for(const branch of w.branchIds||[]){
 const k=w.originProfile+"|"+branch+"|"+w.body,x=base.get(k)||[];
 if(!x.some(v=>dominates(v,w.vector)))base.set(k,[...x.filter(v=>!dominates(w.vector,v)),w.vector]);
}
const found=new Map([...base].map(([k,v])=>[k,v.slice()]));
const add=(k,v)=>{const xs=found.get(k)||[];if(xs.some(x=>dominates(x,v)))return false;found.set(k,[...xs.filter(x=>!dominates(v,x)),v]);return true;};
const routeKeys=new Set(),adaptedAttempts={...prior?.adaptedAttempts};
for(const r of Object.values(routes)){routeKeys.add(key([r.input,r.fullActionHash]));add(pairKey(r),r.permanentVector);}
const rankData=defaultRankData(data),rankBridge=createBridge(rankData.data,db,cacheHashes,{templates:structuredClone(prior.templates||{}),cache:false});
const births=birthCatalog(db),byInput=new Map(births.map(b=>[b.input,b])),rankDefaultAttempts={...prior.rankDefaultAttempts},queue=[];
for(const [id,t] of Object.entries(attempts)){
 if(t.status!=="LIMITED_UNRESOLVED"||t.reason!=="Promotion rank list unindexed"||rankDefaultAttempts[id])continue;
 const birth=byInput.get(t.input),f=frontier.groups[t.group]?.frontier.find(x=>x.id===t.sourceRoute);
 if(birth&&f)queue.push({id,t,birth,f});
}
// Reuse previously verified birth states, not rank-modified birth assumptions.
// createBridge owns its internal birth loader; it independently verifies the original birth hash.
queue.sort((a,b)=>a.f.actions.length-b.f.actions.length||a.id.localeCompare(b.id));
const seconds=Number(arg("seconds","30")),limit=Number(arg("limit","800"));
const start=performance.now(),round={attempted:0,completed:0,newRoutes:0,duplicate:0,failed:0};
for(const q of queue){
 if(round.attempted>=limit||performance.now()-start>=seconds*1000)break;
 round.attempted++;
 const record={originalAttempt:q.id,policy:RANK_POLICY.id};
 let result;try{result=rankBridge.follow(q.birth,q.t.group,q.f);}catch(e){result={ok:false,reason:String(e.message),at:0};}
 if(!result.ok){round.failed++;rankDefaultAttempts[q.id]={...record,status:"LIMITED_UNRESOLVED",reason:result.reason,at:result.at};continue;}
 round.completed++;
 const r=result.route,rk=key([r.input,r.fullActionHash]),id="POPFRONTCH12:"+rk.slice(0,24);
 if(routeKeys.has(rk)){round.duplicate++;rankDefaultAttempts[q.id]={...record,status:"DUPLICATE_REPLAY",route:id};continue;}
 r.rankDefault={policy:RANK_POLICY.id,originalAttempt:q.id,exactBuildVerified:false};
 routes[id]=r;routeKeys.add(rk);add(pairKey(r),r.permanentVector);round.newRoutes++;
 rankDefaultAttempts[q.id]={...record,status:"CONDITIONAL_DEFAULT_RANK_REPLAY",route:id};
}
const all=Object.values(routes),improved=all.filter(r=>!(base.get(pairKey(r))||[]).some(v=>dominates(v,r.permanentVector))),elapsedSeconds=(performance.now()-start)/1000;
const records=Object.values(rankDefaultAttempts);
const summary={...prior.summary,registeredRoutes:all.length,newRoutes:round.newRoutes,improvedRoutes:improved.length,improvedPairs:new Set(improved.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(improved.map(pairKey)).size,newTerminalPairBodies:new Set(improved.filter(r=>!base.has(pairKey(r))).map(pairKey)).size,exactNumericMatches:all.filter(r=>r.numericExactMatch).length,additionalResearchRoutes:all.filter(r=>r.addedResearch.length).length,researchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,elapsedSeconds,cumulativeSeconds:(prior.summary.cumulativeSeconds||0)+elapsedSeconds,rankDefaultRound:round,rankDefaultBodies:rankData.indexed,rankDefaultAttempts:records.length,rankDefaultSuccesses:records.filter(r=>r.status!=="LIMITED_UNRESOLVED").length,rankDefaultRoutes:all.filter(r=>r.rankDefault).length,rankDefaultRemaining:queue.length-round.attempted,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
const result={...prior,fingerprint,source,hashes,cacheHashes,routes,attempts,adaptedAttempts,rankDefaultAttempts,rankPolicy:RANK_POLICY,migration,templates:prior.templates,summary,scope:"Indexed minimum-birth replay. Separate conditional upstream OXCE default rank policy; exact installed 8.7 build and actual promotion requirements unverified. Original failures retained."};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify({registeredRoutes:all.length,rankDefaultRound:round,rankDefaultAttempts:summary.rankDefaultAttempts,rankDefaultSuccesses:summary.rankDefaultSuccesses,rankDefaultRoutes:summary.rankDefaultRoutes,rankDefaultRemaining:summary.rankDefaultRemaining,rankDefaultBodies:rankData.indexed,elapsedSeconds,improvedRoutes:summary.improvedRoutes,improvedPairs:summary.improvedPairs,exactNumericMatches:summary.exactNumericMatches}));
