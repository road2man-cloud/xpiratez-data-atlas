// Worklist of diverse numeric frontier proposals linked to indexed births.
// Prioritize genuinely new chronological candidates, not numerical maxima
// alone. Every registered route contains the full replayable suffix.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {MODEL,LEDGER,birthCatalog,sourceIdentity,chronologicalBaseline,createBridge,pairKey} from "./population-frontier-chronology-core.mjs";
import {sha,key,sum,dominates} from "./population-research-career-core.mjs";
const arg=(k,d)=>process.argv.find(s=>s.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const frontier=db.populationCareerFrontier,assumed=db.populationAssumedBirthClosure;
assert.equal(frontier.summary.modelClosedPairs,frontier.summary.pairCount);
assert.equal(sha(fs.readFileSync("public/data/"+frontier.file)),frontier.sha256);
const output=arg("out","population-frontier-chronology-v3.json.gz");
const legacy=arg("legacy","population-frontier-chronology-v2.json.gz");
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
const self="tools/build-population-frontier-chronology-v3.mjs";hashes[self]=sha(fs.readFileSync(self,"utf8").replace(/\r\n/g,"\n"));
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
const origins=new Map(assumed.origins.map((id,i)=>[id,i])),branches=new Map(assumed.branches.map((id,i)=>[id,i]));
const births=birthCatalog(db),byClass=new Map(),queueByPair=new Map();
const bodyIndex=new Map(data.soldiers.map(b=>[b.id,b])),profileIndex=new Map(data.profiles.map(p=>[p.id,p])),transformIndex=new Map(data.transformations.map(r=>[r.id,r]));
const rankRisk=(f,startBody)=>{
 let body=startBody;
 for(const a of f.actions){
  if(a.kind==="ASSUMED_PROMOTION"&&!bodyIndex.get(body)?.raw?.rankStrings?.length)return true;
  if(a.kind==="TRANSFORM"){
   const r=transformIndex.get(a.id);
   if(r?.minRank&&!bodyIndex.get(body)?.raw?.rankStrings?.length)return true;
   body=r?.producedSoldierType||body;
  }
 }
 return false;
};
let alternativeDirectionalCandidates=0,allSupportedCandidates=0;
const supported=f=>f.actions.every(a=>a.kind!=="TRANSFORM"||bridge.supported.has(a.id));
function candidates(cid,body){
 const ck=cid+"|"+body;
 if(byClass.has(ck))return byClass.get(ck);
 const gs=assumed.classes[cid].groups,all=[];
 for(const gi of gs)for(const f of frontier.groups[gi]?.frontier||[])if(f.novelPermanent&&supported(f))all.push({gi,f});
 // Diverse directional records per final body. Do not enumerate the
 // same numeric route once for every equivalent source history.
 const byBody=new Map();
 for(const t of all){const xs=byBody.get(t.f.body)||[];xs.push(t);byBody.set(t.f.body,xs);}
 const chosen=new Map();
 allSupportedCandidates+=all.length;
 for(const xs of byBody.values()){
  const scores=[f=>sum(f.permanentVector),...db.stats.map((_,k)=>f=>f.permanentVector[k]*100000+sum(f.permanentVector))];
  const collect=(pool,alternate)=>{
   if(!pool.length)return;
   for(const score of scores){
    let t=null;for(const x of pool)if(!t||score(x.f)>score(t.f)||score(x.f)===score(t.f)&&(x.f.actions.length<t.f.actions.length||x.f.actions.length===t.f.actions.length&&x.f.id.localeCompare(t.f.id)<0))t=x;
    const k=key(t.f.actions);
    if(!chosen.has(k)){chosen.set(k,{...t,rankRisk:rankRisk(t.f,body),alternativeDirectional:alternate});if(alternate)alternativeDirectionalCandidates++;}
   }
  };
  collect(xs,false);
  // Preserve the unconstrained directional winners. Also select winners
  // from rank-indexed paths, which may have lower hypothetical maxima but
  // a better chance to replay. This is ordering, not impossibility.
  collect(xs.filter(t=>!rankRisk(t.f,body)),true);
 }
 const result=[...chosen.values()];byClass.set(ck,result);return result;
}
for(const birth of births){
 const i=origins.get(birth.origin),j=branches.get(birth.branch);if(i===undefined||j===undefined)continue;
 const cid=assumed.classIndex[i][j];if(cid==null)continue;
 const xs=queueByPair.get(birth.origin+"|"+birth.branch)||[];
 for(const t of candidates(cid,profileIndex.get(birth.origin)?.soldierType)){
  const id=key([birth.input,t.f.id]);if(attempts[id])continue;
  const old=found.get(pairKey({...birth,body:t.f.body}))||[];
  if(old.some(v=>dominates(v,t.f.permanentVector)))continue;
  const priorSum=old.length?Math.max(...old.map(sum)):0;
  const maxByStat=db.stats.map((_,k)=>Math.max(0,...old.map(v=>v[k])));
  const gap=t.f.permanentVector.reduce((n,v,k)=>n+Math.max(0,v-maxByStat[k]),0);
  const score=gap+Math.max(0,sum(t.f.permanentVector)-priorSum);
  xs.push({...t,birth,id,score});
 }
 queueByPair.set(birth.origin+"|"+birth.branch,xs);
}
for(const xs of queueByPair.values())xs.sort((a,b)=>Number(a.rankRisk)-Number(b.rankRisk)||b.score-a.score||a.f.actions.length-b.f.actions.length||a.id.localeCompare(b.id));
const visited={...prior?.visited},pairQueues=[...queueByPair].filter(([,xs])=>xs.length).sort(([a,x],[b,y])=>(visited[a]||0)-(visited[b]||0)||y[0].score-x[0].score||a.localeCompare(b));
const queue=[];for(let i=0;;i++){let any=false;for(const [,xs] of pairQueues)if(xs[i]){queue.push(xs[i]);any=true;}if(!any)break;}
// Recover a concrete prefix of a failed proposal before its unknown rank
// action. This is not a replay of the entire proposed numerical target.
// Preserve original proposal identity and calculate actual terminal body.
const byInput=new Map(births.map(b=>[b.input,b])),profiles=new Map(data.profiles.map(p=>[p.id,p])),ruleMap=new Map(data.transformations.map(r=>[r.id,r]));
const alternative=[];
for(const [id,t] of Object.entries(attempts)){
 if(t.status!=="LIMITED_UNRESOLVED"||t.reason!=="Promotion rank list unindexed"||adaptedAttempts[id])continue;
 const birth=byInput.get(t.input),f=frontier.groups[t.group]?.frontier.find(f=>f.id===t.sourceRoute);
 if(!birth||!f||!Number.isSafeInteger(t.at)||t.at<1||f.actions[t.at]?.kind!=="ASSUMED_PROMOTION")continue;
 const actions=f.actions.slice(0,t.at);
 if(!actions.some(a=>a.kind==="TRANSFORM"))continue;
 let body=profiles.get(birth.origin)?.soldierType;assert(body);
 for(const a of actions)if(a.kind==="TRANSFORM")body=ruleMap.get(a.id).producedSoldierType||body;
 // A cap-target after the prefix remains an explicit conditional growth.
 actions.push({kind:"CAP_TARGET"});
 alternative.push({birth,gi:t.group,f,variant:{...f,body,actions},id,prefixLength:t.at});
}
alternative.sort((a,b)=>a.prefixLength-b.prefixLength||a.id.localeCompare(b.id));
const seconds=Number(arg("seconds","25")),limit=Number(arg("limit","100"));
assert(Number.isFinite(seconds)&&seconds>0&&Number.isSafeInteger(limit)&&limit>0);
const start=performance.now(),round={attempted:0,completed:0,failed:0,duplicates:0,newRoutes:0,newImproved:0,dominated:0};
for(const t of queue){
 if(round.attempted>=limit||performance.now()-start>=seconds*1000)break;
 const pk=t.birth.origin+"|"+t.birth.branch;visited[pk]=(visited[pk]||0)+1;round.attempted++;
 const record={input:t.birth.input,origin:t.birth.origin,branch:t.birth.branch,group:t.gi,sourceRoute:t.f.id,actionCount:t.f.actions.length,alternativeDirectional:!!t.alternativeDirectional,rankRisk:!!t.rankRisk};
 let result;try{result=bridge.follow(t.birth,t.gi,t.f);}catch(e){result={ok:false,reason:String(e.message),at:0};}
 if(!result.ok){round.failed++;attempts[t.id]={...record,status:"LIMITED_UNRESOLVED",reason:result.reason,at:result.at};continue;}
 round.completed++;const r=result.route,rk=key([r.input,r.fullActionHash]);
 if(routeKeys.has(rk)){round.duplicates++;attempts[t.id]={...record,status:"DUPLICATE_REPLAY"};continue;}
 const id="POPFRONTCH12:"+rk.slice(0,24),k=pairKey(r),novel=add(k,r.permanentVector);
 routeKeys.add(rk);routes[id]=r;round.newRoutes++;if(novel)round.newImproved++;else round.dominated++;
 attempts[t.id]={...record,status:"CONDITIONAL_REPLAY",route:id};
}
// Use a separate bounded share of the batch for actual alternative
// production, never overwrite or mark the original failure solved.
const recoveryStart=performance.now(),recoverySeconds=Number(arg("recovery-seconds","12"));
const recovery={attempted:0,completed:0,newRoutes:0,improved:0,duplicate:0,dominated:0,failed:0};
for(const t of alternative){
 if(performance.now()-recoveryStart>=recoverySeconds*1000||recovery.attempted>=60)break;
 recovery.attempted++;
 let q;try{q=bridge.follow(t.birth,t.gi,t.variant);}catch(e){q={ok:false,reason:String(e.message),at:0};}
 if(!q.ok){recovery.failed++;adaptedAttempts[t.id]={status:"LIMITED_UNRESOLVED",reason:q.reason,at:q.at,prefixLength:t.prefixLength};continue;}
 recovery.completed++;
 const r=q.route;
 r.sourceActionHash=key(t.f.actions);r.sourcePermanentVector=t.f.permanentVector;
 r.numericExactMatch=r.body===t.f.body&&JSON.stringify(r.permanentVector)===JSON.stringify(t.f.permanentVector);
 r.adaptation={kind:"RANK_BLOCKED_PREFIX_THEN_CAP",originalAttempt:t.id,prefixLength:t.prefixLength,appendCap:true};
 const rk=key([r.input,r.fullActionHash]),k=pairKey(r);
 if(routeKeys.has(rk)){recovery.duplicate++;adaptedAttempts[t.id]={status:"DUPLICATE_REPLAY",prefixLength:t.prefixLength};continue;}
 if(!add(k,r.permanentVector)){recovery.dominated++;adaptedAttempts[t.id]={status:"REPLAYED_EXISTING_DOMINATES",prefixLength:t.prefixLength,vector:r.permanentVector,body:r.body};continue;}
 const id="POPFRONTCH12:"+rk.slice(0,24);routeKeys.add(rk);routes[id]=r;recovery.newRoutes++;recovery.improved++;
 adaptedAttempts[t.id]={status:"CONDITIONAL_PREFIX_REPLAY",route:id,prefixLength:t.prefixLength};
}
const all=Object.values(routes),improved=all.filter(r=>!(base.get(pairKey(r))||[]).some(v=>dominates(v,r.permanentVector)));
const metrics={...bridge.metrics,...Object.fromEntries(Object.entries(bridge.engine.metrics).map(([k,v])=>["planner_"+k,v]))};
const totals=Object.fromEntries(Object.entries({...round,...metrics,...Object.fromEntries(Object.entries(recovery).map(([k,v])=>["recovery_"+k,v]))}).map(([k,v])=>[k,v+(prior?.totals?.[k]||0)]));
const elapsedSeconds=(performance.now()-start)/1000,summary={birthInputs:births.length,eligiblePairs:pairQueues.length,remainingProposals:Math.max(0,queue.length-round.attempted),attempted:Object.keys(attempts).length,
 registeredRoutes:all.length,newRoutes:round.newRoutes+recovery.newRoutes,replayedProposals:Object.values(attempts).filter(a=>a.status!=="LIMITED_UNRESOLVED").length,
 unresolvedProposals:Object.values(attempts).filter(a=>a.status==="LIMITED_UNRESOLVED").length,
 improvedRoutes:improved.length,improvedPairs:new Set(improved.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(improved.map(pairKey)).size,
 newTerminalPairBodies:new Set(improved.filter(r=>!base.has(pairKey(r))).map(pairKey)).size,
 exactNumericMatches:all.filter(r=>r.numericExactMatch).length,additionalResearchRoutes:all.filter(r=>r.addedResearch.length).length,
 researchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,elapsedSeconds,cumulativeSeconds:(prior?.summary.cumulativeSeconds||0)+elapsedSeconds,
 round,metrics,totals,recovery,alternativeDirectionalCandidates,allSupportedCandidates,alternativeDirectionalAttempts:Object.values(attempts).filter(t=>t.alternativeDirectional).length,alternativeDirectionalSuccesses:Object.values(attempts).filter(t=>t.alternativeDirectional&&t.status==="CONDITIONAL_REPLAY").length,provenanceDrift,adaptedRoutes:all.filter(r=>r.adaptation).length,adaptedAttempts:Object.keys(adaptedAttempts).length,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
const result={schemaVersion:1,kind:"POPULATION_FRONTIER_CHRONOLOGY",model:MODEL,fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,source,hashes,cacheHashes,routes,attempts,adaptedAttempts,visited,migration,templates:bridge.templates,summary,totals,
 scope:"Minimum indexed birth replay, deterministic subset of fixed numerical frontier plans, actual indexed research actions and conditional growth, promotion, medal, resource and event assumptions. All candidate vectors are recomputed from chronological states. Failed proposals are unresolved, not impossibility."};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify(summary));
