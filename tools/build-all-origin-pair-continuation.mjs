// Joint birth + active-research suffix replay for the whole-population ledger.
// Preserve full chronological provenance, resource assumptions and rank gates.
// Numeric growth envelopes are a separate relaxed model, never actual gameplay.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {serialize} from "node:v8";
import {performance} from "node:perf_hooks";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
import {STAT_KEYS,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {evaluateCapGrowthChronologies} from "./damsel-madgal-cap-growth-chronology-core.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const git=a=>execFileSync("git",a,{maxBuffer:256*1024*1024,windowsHide:true});
const hash=b=>createHash("sha256").update(b).digest("hex"),key=x=>hash(JSON.stringify(x));
const read=f=>JSON.parse(fs.readFileSync(f,"utf8"));
const base=arg("base",git(["rev-parse","origin/main"]).toString().trim());
const db=JSON.parse(gunzipSync(git(["show",base+":public/data/branch-soldier-results.json.gz"])));
const cohort=db.originPairSearch;
if(!cohort)throw Error("Missing joint pair ledger");
const data=read("public/data/soldiers-modern-index.json"),ledger=read("public/data/soldier-acquisition-progression-20261102.json"),cat=read("public/data/soldier-source-catalog.json");
if(cohort.sourceMetadataSha256!==db.sourceMetadataSha256||data.meta.source.metadataSha256!==db.sourceMetadataSha256||STAT_KEYS.join()!==db.stats.join())throw Error("Source identity mismatch");
for(const [f,h] of Object.entries(cohort.engineHashes))if(hash(fs.readFileSync(f))!==h)throw Error("Replay engine changed; migrate birth proofs first: "+f);
data.originRows=ledger.rows;data.sourceItemIds=new Set(cat.itemIds);
const numericFiles=["tools/damsel-madgal-cap-growth-chronology-core.mjs","public/soldiers/modern/stat-envelope.js","public/soldiers/modern/growth-envelope.js","public/soldiers/modern/eligibility.js","public/soldiers/modern/research-training-locks.js"];
const numericHashes=Object.fromEntries(numericFiles.map(f=>[f,hash(fs.readFileSync(f))]));
const engine=key(["JOINT_SUFFIX_V1",cohort.fingerprint,numericHashes,hash(fs.readFileSync(new URL(import.meta.url)))]);
const prior=db.originPairContinuation;
if(prior&&prior.engine!==engine)throw Error("Continuation engine migration required");
const routes={...(prior?.routes||{})},models={...(prior?.models||{})},attempts={...(prior?.attempts||{})};
const profiles=new Map(data.profiles.map(p=>[p.id,p])),rules=new Map(data.transformations.map(r=>[r.id,r]));
const byBody=new Map();
const deterministic=r=>!STAT_KEYS.some(k=>r.rerollStats?.[k]||["flat","percent","percentGained"].some(s=>Number(r[s+"Min"]?.[k]||0)!==Number(r[s+"Max"]?.[k]||0)));
for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE")&&deterministic(r))
 for(const body of r.allowedSoldierTypes||[]){const a=byBody.get(body)||[];a.push(r);byBody.set(body,a);}
for(const a of byBody.values())a.sort((x,y)=>x.id.localeCompare(y.id));
const planner=createFoundationResearchPlanner(data,{maxAttempts:180,maxDepth:84,maxSteps:5000,allowUnrankedMethods:true,maxMethodOptions:36});
const rootMemo=new Map(),member=n=>n.world.soldiers.find(x=>x.id==="origin"),vec=o=>STAT_KEYS.map(k=>o[k]||0);
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
function snapshot(n){
 const m=member(n),s=m?.state;if(!s?.exactStats||s.retired)throw Error("Non-exact or retired state");
 const raw=vec(s.currentStats),bonus=vec(bonusStats(s,data,{commendations:m.commendations||{}}));
 if(![...raw,...bonus].every(Number.isSafeInteger))throw Error("Noninteger state");
 const effective=raw.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&bonus[i]>0?v:Math.max(STAT_KEYS[i]==="health"?1:0,v+bonus[i]));
 return {body:s.soldierType,raw,bonus,effective,rank:s.rank,stateHash:hash(serialize(n.world))};
}
let rootReplays=0,rootHits=0,birthReplays=0,transitions=0,numericComputed=0,numericHits=0,numericErrors=0,newRoutes=0,unresolved=0,peakRss=process.memoryUsage().rss;
const start=performance.now(),cpu=process.cpuUsage(),limit=Number(arg("limit","300")),seconds=Number(arg("seconds","24")),depth=Number(arg("depth","3"));
if(!Number.isInteger(depth)||depth<1||depth>3)throw Error("Depth out of bounds");
const before=Object.keys(routes).length;
function rootFor(p){
 if(rootMemo.has(p.root)){rootHits++;return rootMemo.get(p.root);}
 const r=cohort.roots[p.root];if(!r||key(r.actions)!==p.root)throw Error("Invalid root identity");
 const z=replayOriginWitness(r.actions,data,{maxSteps:5000});rootReplays++;if(!z.ok)throw Error(z.reason);
 const n={world:z.world,steps:r.actions.slice(),trace:z.trace,diagnostics:[]};rootMemo.set(p.root,n);
 if(rootMemo.size>12)rootMemo.delete(rootMemo.keys().next().value);
 return n;
}
function numeric(p,order,body){
 const id="OPM12:"+key([p.origin,order]).slice(0,24);
 if(models[id]){numericHits++;return id;}
 try{
  const m=evaluateCapGrowthChronologies(data,p.origin,order,{maxTransformations:12,deduplicateEnvelopes:true,correlatedPercent:true,tightenStatGates:true});
  if(m.finalBody!==body)throw Error("Different terminal body");
  const frontier=m.frontiers.twelve.map(x=>({vector:vec(x.highEffective),raw:vec(x.rawUpper),bonus:vec(x.permanentBonus),schedule:x.schedule,conditionalGateCrossings:x.conditionalGateCrossings}));
  if(!frontier.length||frontier.some(x=>[x.vector,x.raw,x.bonus].some(v=>v.length!==12||!v.every(Number.isSafeInteger))))throw Error("Invalid numeric frontier");
  models[id]={origin:p.origin,order,body,frontier,actualGameCertified:false,scope:"RELAXED_CHRONOLOGICAL_GROWTH_ENVELOPE"};
  numericComputed++;return id;
 }catch(e){numericErrors++;return null;}
}
function run(p,id,n,order,depthLeft){
 if(depthLeft<=0||newRoutes>=limit||performance.now()-start>seconds*1000)return;
 const m=member(n),s=m.state;
 for(const r of byBody.get(s.soldierType)||[]){
  if(newRoutes>=limit||performance.now()-start>seconds*1000)break;
  if(!r.requires.every(i=>active(n.world,i))||(r.forbiddenSoldierTypes||[]).includes(s.soldierType))continue;
  const nextOrder=[...order,r.id],rid="OPR12:"+key([id,nextOrder]).slice(0,24);
  // Only reuse a successful identical chronological label, not a rejected gate.
  // The root and birth record remain immutable, and the full suffix is retained.
  let t;
  try{
   t=planner.clone(n);
   planner.supply(t,{items:r.requiredItems||{},functions:r.requiresBaseFunc||[],funds:Math.max(0,r.cost||0)},"Conditional indexed training inputs "+r.id);
   planner.append(t,{type:"transform",soldier:"origin",transform:r.id});
   transitions++;
   const st=snapshot(t);
   if(routes[rid]){
    if(routes[rid].stateHash!==st.stateHash)throw Error("Prior route state changed");
   }else{
    const model=numeric(p,nextOrder,st.body);
    const suffix=t.steps.slice(cohort.roots[p.root].actions.length);
    routes[rid]={pair:id,origin:p.origin,branch:p.branch,root:p.root,order:nextOrder,suffix,fullActionHash:key(t.steps),...st,model,conditional:true,actualGameCertified:false};
    newRoutes++;
   }
   run(p,id,t,nextOrder,depthLeft-1);
  }catch(e){
   if(routes[rid])throw e;
   if(!attempts[rid]){attempts[rid]={pair:id,order:nextOrder,reason:String(e.message),status:"LIMITED_GATE_OR_UNRESOLVED"};unresolved++;}
  }
 }
}
const pairCounts=new Map();
for(const r of Object.values(routes))pairCounts.set(r.pair,(pairCounts.get(r.pair)||0)+1);
const grouped=new Map();
for(const [id,p] of Object.entries(cohort.pairs)){const a=grouped.get(p.origin)||[];a.push([id,p]);grouped.set(p.origin,a);}
for(const a of grouped.values())a.sort((x,y)=>(pairCounts.get(x[0])||0)-(pairCounts.get(y[0])||0)||x[0].localeCompare(y[0]));
const queue=[];for(let i=0;;i++){let any=false;for(const a of grouped.values())if(a[i]){queue.push(a[i]);any=true;}if(!any)break;}
let pairsVisited=0,birthFailures=0;
for(const [id,p] of queue){
 if(newRoutes>=limit||performance.now()-start>seconds*1000)break;
 try{
  const n=planner.clone(rootFor(p));
  for(const step of p.suffix)planner.append(n,step);
  birthReplays++;
  if(snapshot(n).stateHash!==p.stateHash||key(n.steps)!==p.fullActionHash)throw Error("Birth proof differs");
  pairsVisited++;run(p,id,n,[],depth);
 }catch(e){birthFailures++;if(e.message==="Prior route state changed")throw e;console.log("PAIR_UNRESOLVED",id,e.message);}
 peakRss=Math.max(peakRss,process.memoryUsage().rss);
}
const all=Object.values(routes),originCounts={},byDepth={};
for(const r of all){originCounts[r.origin]=(originCounts[r.origin]||0)+1;byDepth[r.order.length]=(byDepth[r.order.length]||0)+1;}
const elapsed=(performance.now()-start)/1000,u=process.cpuUsage(cpu);
const summary={registeredRoutes:all.length,priorRoutes:before,newRoutes,pairedOrigins:Object.keys(originCounts).length,pairsWithTraining:new Set(all.map(r=>r.pair)).size,pairedBranches:new Set(all.map(r=>r.branch)).size,byDepth,originCounts,numericModels:Object.keys(models).length,numericModelReferences:all.filter(r=>r.model).length,numericComputed,numericHits,numericErrors,pairsVisited,birthReplays,birthFailures,rootReplays,rootHits,transitions,limitedUnresolved:Object.keys(attempts).length,newUnresolved:unresolved,seconds:elapsed,cpuSeconds:(u.user+u.system)/1e6,peakRssBytes:peakRss,actualGameCertified:0,globalOptimalCertified:0};
const result={schemaVersion:1,kind:"ALL_ORIGIN_PAIR_CONTINUATION",baseCommit:base,sourceMetadataSha256:db.sourceMetadataSha256,engine,numericHashes,birthFingerprint:cohort.fingerprint,generatedAt:new Date().toISOString(),routes,models,attempts,summary,policy:"Same chronological joint birth prefix, active research only, deterministic live transforms at actual birth rank, explicit indexed external resource assumptions. No mid-route growth replay, future research, random transforms, or new medals. Separate numerical envelope is relaxed, not proof that maximal roll schedule is attainable."};
const file=path.join("experiments/endgame-current-save","12-all-origin-pair-continuation.json");fs.writeFileSync(file+".tmp",JSON.stringify(result));fs.renameSync(file+".tmp",file);console.log(JSON.stringify({file,summary}));
