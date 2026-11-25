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
const files=[...new Set([...Object.keys(db.populationResearchCareer.hashes),"tools/population-frontier-chronology-core.mjs","tools/build-population-frontier-chronology.mjs","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json"])];
const hashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f,"utf8").replace(/\r\n/g,"\n"))]));
const source=sourceIdentity(db),{baseline:baselineIdentity,...stable}=source;
const fingerprint=key([MODEL,db.sourceMetadataSha256,stable,hashes]);
const output=arg("out","population-frontier-chronology.json.gz"),prior=fs.existsSync(output)?decode(output):null;
if(prior){assert.equal(prior.fingerprint,fingerprint,"Source or engine migration required");}
if(db[LEDGER])for(const [id,r] of Object.entries(db[LEDGER].routes))assert.deepEqual(prior?.routes[id],r,"Published route missing "+id);
const routes={...prior?.routes},attempts={...prior?.attempts},bridge=createBridge(data,db,hashes,{templates:prior?.templates||structuredClone(db.populationResearchCareer.planTemplates||{})});
const base=chronologicalBaseline(db),found=new Map([...base].map(([k,v])=>[k,v.slice()]));
const add=(k,v)=>{const xs=found.get(k)||[];if(xs.some(x=>dominates(x,v)))return false;found.set(k,[...xs.filter(x=>!dominates(v,x)),v]);return true;};
const routeKeys=new Set();
for(const r of Object.values(routes)){routeKeys.add(key([r.input,r.fullActionHash]));add(pairKey(r),r.permanentVector);}
const origins=new Map(assumed.origins.map((id,i)=>[id,i])),branches=new Map(assumed.branches.map((id,i)=>[id,i]));
const births=birthCatalog(db),byClass=new Map(),queueByPair=new Map();
const supported=f=>f.actions.every(a=>a.kind!=="TRANSFORM"||bridge.supported.has(a.id));
function candidates(cid){
 if(byClass.has(cid))return byClass.get(cid);
 const gs=assumed.classes[cid].groups,all=[];
 for(const gi of gs)for(const f of frontier.groups[gi]?.frontier||[])if(f.novelPermanent&&supported(f))all.push({gi,f});
 // Diverse directional records per final body. Do not enumerate the
 // same numeric route once for every equivalent source history.
 const byBody=new Map();
 for(const t of all){const xs=byBody.get(t.f.body)||[];xs.push(t);byBody.set(t.f.body,xs);}
 const chosen=new Map();
 for(const xs of byBody.values()){
  const pick=score=>xs.slice().sort((a,b)=>score(b.f)-score(a.f)||a.f.actions.length-b.f.actions.length||a.f.id.localeCompare(b.f.id))[0];
  for(const t of [pick(f=>sum(f.permanentVector)),...db.stats.map((_,k)=>pick(f=>f.permanentVector[k]*100000+sum(f.permanentVector)))]){
   if(t)chosen.set(key(t.f.actions),t);
  }
 }
 const result=[...chosen.values()];byClass.set(cid,result);return result;
}
for(const birth of births){
 const i=origins.get(birth.origin),j=branches.get(birth.branch);if(i===undefined||j===undefined)continue;
 const cid=assumed.classIndex[i][j];if(cid==null)continue;
 const xs=queueByPair.get(birth.origin+"|"+birth.branch)||[];
 for(const t of candidates(cid)){
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
for(const xs of queueByPair.values())xs.sort((a,b)=>b.score-a.score||a.f.actions.length-b.f.actions.length||a.id.localeCompare(b.id));
const visited={...prior?.visited},pairQueues=[...queueByPair].filter(([,xs])=>xs.length).sort(([a,x],[b,y])=>(visited[a]||0)-(visited[b]||0)||y[0].score-x[0].score||a.localeCompare(b));
const queue=[];for(let i=0;;i++){let any=false;for(const [,xs] of pairQueues)if(xs[i]){queue.push(xs[i]);any=true;}if(!any)break;}
const seconds=Number(arg("seconds","25")),limit=Number(arg("limit","100"));
assert(Number.isFinite(seconds)&&seconds>0&&Number.isSafeInteger(limit)&&limit>0);
const start=performance.now(),round={attempted:0,completed:0,failed:0,duplicates:0,newRoutes:0,newImproved:0,dominated:0};
for(const t of queue){
 if(round.attempted>=limit||performance.now()-start>=seconds*1000)break;
 const pk=t.birth.origin+"|"+t.birth.branch;visited[pk]=(visited[pk]||0)+1;round.attempted++;
 const record={input:t.birth.input,origin:t.birth.origin,branch:t.birth.branch,group:t.gi,sourceRoute:t.f.id,actionCount:t.f.actions.length};
 let result;try{result=bridge.follow(t.birth,t.gi,t.f);}catch(e){result={ok:false,reason:String(e.message),at:0};}
 if(!result.ok){round.failed++;attempts[t.id]={...record,status:"LIMITED_UNRESOLVED",reason:result.reason,at:result.at};continue;}
 round.completed++;const r=result.route,rk=key([r.input,r.fullActionHash]);
 if(routeKeys.has(rk)){round.duplicates++;attempts[t.id]={...record,status:"DUPLICATE_REPLAY"};continue;}
 const id="POPFRONTCH12:"+rk.slice(0,24),k=pairKey(r),novel=add(k,r.permanentVector);
 routeKeys.add(rk);routes[id]=r;round.newRoutes++;if(novel)round.newImproved++;else round.dominated++;
 attempts[t.id]={...record,status:"CONDITIONAL_REPLAY",route:id};
}
const all=Object.values(routes),improved=all.filter(r=>!(base.get(pairKey(r))||[]).some(v=>dominates(v,r.permanentVector)));
const metrics={...bridge.metrics,...Object.fromEntries(Object.entries(bridge.engine.metrics).map(([k,v])=>["planner_"+k,v]))};
const totals=Object.fromEntries(Object.entries({...round,...metrics}).map(([k,v])=>[k,v+(prior?.totals?.[k]||0)]));
const elapsedSeconds=(performance.now()-start)/1000,summary={birthInputs:births.length,eligiblePairs:pairQueues.length,remainingProposals:Math.max(0,queue.length-round.attempted),attempted:Object.keys(attempts).length,
 registeredRoutes:all.length,newRoutes:round.newRoutes,replayedProposals:Object.values(attempts).filter(a=>a.status!=="LIMITED_UNRESOLVED").length,
 unresolvedProposals:Object.values(attempts).filter(a=>a.status==="LIMITED_UNRESOLVED").length,
 improvedRoutes:improved.length,improvedPairs:new Set(improved.map(r=>r.origin+"|"+r.branch)).size,improvedPairBodies:new Set(improved.map(pairKey)).size,
 newTerminalPairBodies:new Set(improved.filter(r=>!base.has(pairKey(r))).map(pairKey)).size,
 exactNumericMatches:all.filter(r=>r.numericExactMatch).length,additionalResearchRoutes:all.filter(r=>r.addedResearch.length).length,
 researchTopics:new Set(all.flatMap(r=>r.addedResearch)).size,elapsedSeconds,cumulativeSeconds:(prior?.summary.cumulativeSeconds||0)+elapsedSeconds,
 round,metrics,totals,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0};
const result={schemaVersion:1,kind:"POPULATION_FRONTIER_CHRONOLOGY",model:MODEL,fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,source,hashes,routes,attempts,visited,templates:bridge.templates,summary,totals,
 scope:"Minimum indexed birth replay, deterministic subset of fixed numerical frontier plans, actual indexed research actions and conditional growth, promotion, medal, resource and event assumptions. All candidate vectors are recomputed from chronological states. Failed proposals are unresolved, not impossibility."};
fs.writeFileSync(output+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify(summary));
