// Whole-population pairing: conditional recruitment after a shared, exact
// chronological research prefix. Not a complete career search or global proof.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {gunzipSync,gzipSync} from "node:zlib";
import {serialize} from "node:v8";
import {performance} from "node:perf_hooks";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
import {STAT_KEYS,bonusStats} from "../public/soldiers/modern/eligibility.js";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const git=(a)=>execFileSync("git",a,{maxBuffer:256*1024*1024,windowsHide:true});
const hash=b=>createHash("sha256").update(b).digest("hex");
const key=x=>hash(JSON.stringify(x));
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const base=arg("base",git(["rev-parse","origin/main"]).toString().trim());
const asset="public/data/branch-soldier-results.json.gz";
const db=JSON.parse(gunzipSync(git(["show",base+":"+asset])));
const data=read("public/data/soldiers-modern-index.json"), ledger=read("public/data/soldier-acquisition-progression-20261102.json"), cat=read("public/data/soldier-source-catalog.json");
const engineFiles=["public/data/soldiers-modern-index.json","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json",...fs.readdirSync("public/soldiers/modern").filter(x=>x.endsWith(".js")).sort().map(x=>"public/soldiers/modern/"+x)];
const engineHashes=Object.fromEntries(engineFiles.map(f=>[f,hash(fs.readFileSync(f))]));
const fingerprint=key(["all-origin-pair-v1",db.sourceMetadataSha256,engineHashes,hash(fs.readFileSync(new URL(import.meta.url)))]);
if(db.sourceMetadataSha256!==data.meta.source.metadataSha256||JSON.stringify(STAT_KEYS)!==JSON.stringify(db.stats)||data.profiles.length!==72||JSON.stringify(cat.sourceHashes)!==JSON.stringify(data.meta.source.rules))throw Error("Source identity mismatch");
data.originRows=ledger.rows;data.sourceItemIds=new Set(cat.itemIds);
const branches=db.branches.filter(b=>b.historyCount>0&&!b.sourceRootConflict).sort((a,b)=>a.rank-b.rank),origins=[...data.profiles].sort((a,b)=>a.id.localeCompare(b.id));
const rankIndex=new Map(branches.map((b,i)=>[b.rank,i])),idIndex=new Map(branches.map((b,i)=>[b.id,i])),originIndex=new Map(origins.map((p,i)=>[p.id,i]));
const N=branches.length,O=origins.length;
const exp=arg("out","experiments/endgame-current-save"),stem="12-damsel-madgal-2280-cap-",root=read(path.join(exp,stem+"root-chronology.json"));
const extensions=["research-extension","joint-research-extension","prerequisite-research-extension"].map(n=>path.join(exp,stem+n+".json")).filter(f=>fs.existsSync(f)).map(read);
if([root,...extensions].some(x=>x.sourceMetadataSha256!==db.sourceMetadataSha256))throw Error("History source mismatch");
const plans=new Map([...(root.oldExactRootPlans||[]),...(root.oldChosenCauseRawProbes||[]),...root.newNoCauseProbes].map(x=>[x.rank,x]));
const histories=new Map();
for(const h of [...root.evidence,...extensions.flatMap(x=>x.evidence||[])])if(h.rawActionsRetained&&Array.isArray(h.rawActions)&&rankIndex.has(h.rank))histories.set(h.id,{...h,digest:key(h.rawActions)});
const byRank=new Map();
for(const h of histories.values()){const arr=byRank.get(h.rank)||[];arr.push(h);byRank.set(h.rank,arr);}
const birthModels=new Map(Object.entries(db.originCap12?.models||{}).filter(([,m])=>m.order?.length===0).map(([id,m])=>[m.profileId,id]));
const rows=origins.map(p=>({id:p.id,name:p.sourceKoName,body:p.soldierType,sourceType:p.sourceType,birthModel:birthModels.get(p.id)||null,status:new Uint8Array(N),registry:new Uint16Array(N),rootOnly:new Uint16Array(N)}));
for(const w of Object.values(db.witnesses)){
 const i=originIndex.get(w.originProfile);if(i===undefined)continue;
 for(const id of w.branchIds||[]){const j=idIndex.get(id);if(j===undefined)continue;
  if(["UNIFIED12","CAREER12"].includes(w.source)){rows[i].status[j]=1;rows[i].registry[j]=Math.min(65535,rows[i].registry[j]+1);}
  else if(["ORIGINCAP12","ORIGINEXT12"].includes(w.source))rows[i].rootOnly[j]=Math.min(65535,rows[i].rootOnly[j]+1);
 }
}
const old=db.originPairSearch;
if(old&&old.fingerprint!==fingerprint)throw Error("Pair engine fingerprint changed; explicit cache migration required");
const saved={...(old?.pairs||{})},roots={...(old?.roots||{})},failures={...(old?.limitedAttempts||{})};
for(const [id,p] of Object.entries(saved)){
 const i=originIndex.get(p.origin),j=idIndex.get(p.branch);
 if(i===undefined||j===undefined||!roots[p.root]||!birthModels.has(p.origin))throw Error("Stale pair identity "+id);
 rows[i].status[j]=2;
}
for(const p of Object.values(failures)){const i=originIndex.get(p.origin),j=idIndex.get(p.branch);if(i!==undefined&&j!==undefined&&!rows[i].status[j])rows[i].status[j]=5;}
const priorPairs=Object.keys(saved).length,planner=createFoundationResearchPlanner(data,{maxAttempts:180,maxDepth:84,maxSteps:5000,allowUnrankedMethods:true,maxMethodOptions:36});
const sourceRows=new Map(ledger.rows.map(r=>[r.id,r]));
const ids=[...new Set(origins.flatMap(p=>p.requires||[]))].sort(),bit=new Map(ids.map((id,i)=>[id,1n<<BigInt(i)]));
const mask=values=>values.reduce((s,id)=>s|(bit.get(id)||0n),0n),required=origins.map(p=>mask(p.requires||[]));
const eligible=origins.map(p=>p.sourceType!=="event"&&sourceRows.get(p.id)?.kind==="SOURCE_SPAWN"&&birthModels.has(p.id));
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const validRoot=(n,plan)=>plan&&plan.requiredActive.every(id=>active(n.world,id))&&!n.trace.some(t=>t.added?.some(id=>plan.avoidIds.includes(id)))&&!n.world.soldiers.some(x=>x.id==="origin");
const chosen=[];
for(const b of branches){
 const j=idIndex.get(b.id),plan=plans.get(b.rank);if(!plan)continue;
 const options=(byRank.get(b.rank)||[]).map(h=>{const a=mask(h.finalActiveIds||[]);return {h,score:origins.reduce((n,p,i)=>n+Number(eligible[i]&&rows[i].status[j]===0&&(a&required[i])===required[i]),0)};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.h.rawActions.length-b.h.rawActions.length||a.h.id.localeCompare(b.h.id));
 if(options.length)chosen.push({b,j,plan,...options[0]});
}
// Round-robin captain leaves, high coverage within each leaf.
const lanes=new Map();
for(const x of chosen.sort((a,b)=>b.score-a.score||a.b.rank-b.b.rank)){const l=x.b.captain.at(-1),a=lanes.get(l)||[];a.push(x);lanes.set(l,a);}
const queue=[];for(let i=0;;i++){let any=false;for(const a of lanes.values())if(a[i]){queue.push(a[i]);any=true;}if(!any)break;}
const limit=Number(arg("limit","500")),seconds=Number(arg("seconds","24")),start=performance.now(),cpu=process.cpuUsage(),rootMemo=new Map(),benchmark=[];
let tested=0,newPairs=0,rootReplays=0,rootHits=0,prefixSteps=0,avoidedSteps=0,bitsetRejected=0,rootFailed=0,limited=0,peakRss=process.memoryUsage().rss;
const sampleSize=Number(arg("benchmark","12"));
function rootFor(x){
 // Cache full chronological action prefix, NOT merely final research set.
 const k=x.h.digest,old=rootMemo.get(k);if(old){rootHits++;return old;}
 const r=replayOriginWitness(x.h.rawActions,data,{maxSteps:5000});
 rootReplays++;prefixSteps+=x.h.rawActions.length;
 if(!r.ok)return null;
 const n={world:r.world,steps:x.h.rawActions.slice(),trace:r.trace,diagnostics:[]};rootMemo.set(k,n);return n;
}
for(const x of queue){
 if(tested>=limit||performance.now()-start>seconds*1000)break;
 const prefix=rootFor(x);
 if(!prefix||!validRoot(prefix,x.plan)){rootFailed++;continue;}
 const actualMask=mask([...prefix.world.researched].filter(id=>active(prefix.world,id)));
 let useCount=0;
 for(let i=0;i<O;i++){
  if(tested>=limit||performance.now()-start>seconds*1000)break;
  const p=origins[i],row=rows[i],id=p.id+"|"+x.b.id;
  if(!eligible[i]||row.status[x.j]!==0)continue;
  if((actualMask&required[i])!==required[i]||!(p.requires||[]).every(id=>active(prefix.world,id))){bitsetRejected++;continue;}
  tested++;useCount++;
  try{
   const n=planner.clone(prefix);
   planner.supply(n,{items:p.acquisitionRequiredItems||{},functions:p.requiresBaseFunc||[],funds:Math.max(0,p.cost||0)},"Conditional indexed recruitment inputs "+p.id);
   planner.append(n,{type:"recruit",soldier:"origin",profile:p.id,band:"min"});
   if(!x.plan.requiredActive.every(id=>active(n.world,id)))throw Error("Lost branch commitment");
   const m=n.world.soldiers.find(s=>s.id==="origin"),st=m?.state;
   if(!st?.exactStats||st.soldierType!==p.soldierType)throw Error("Invalid recruitment state");
   const raw=STAT_KEYS.map(k=>st.currentStats[k]),bonusMap=bonusStats(st,data,{commendations:m.commendations}),bonus=STAT_KEYS.map(k=>bonusMap[k]||0);
   if(![...raw,...bonus].every(Number.isSafeInteger))throw Error("Invalid 12-stat birth state");
   const suffix=n.steps.slice(prefix.steps.length),stateHash=hash(serialize(n.world));
   const record={origin:p.id,branch:x.b.id,root:x.h.digest,historyId:x.h.id,suffix,fullActionHash:key(n.steps),stateHash,body:st.soldierType,raw,bonus,birthModel:birthModels.get(p.id),conditional:true,actualGameCertified:false};
   if(!roots[x.h.digest])roots[x.h.digest]={historyId:x.h.id,actions:x.h.rawActions,actionHash:x.h.digest};
   saved[id]=record;row.status[x.j]=2;newPairs++;
   if(benchmark.length<sampleSize)benchmark.push({prefix:x.h.rawActions,suffix,stateHash});
  }catch(e){failures[id]={origin:p.id,branch:x.b.id,historyId:x.h.id,reason:String(e.message),status:"LIMITED_UNRESOLVED"};row.status[x.j]=5;limited++;}
 }
 avoidedSteps+=Math.max(0,useCount-1)*x.h.rawActions.length;
 peakRss=Math.max(peakRss,process.memoryUsage().rss);
 // Keep only a bounded working set; persistent provenance stored once in roots.
 if(rootMemo.size>16)rootMemo.delete(rootMemo.keys().next().value);
}
const elapsed=(performance.now()-start)/1000,used=process.cpuUsage(cpu);
// Same-input comparison on successful samples. Exact full-world bytes must match.
let individualMs=0,sharedMs=0,benchOK=0;
if(benchmark.length){
 let t=performance.now();for(const b of benchmark){const r=replayOriginWitness([...b.prefix,...b.suffix],data,{maxSteps:5000});if(!r.ok||hash(serialize(r.world))!==b.stateHash)throw Error("Individual replay differs");}individualMs=performance.now()-t;
 t=performance.now();const memo=new Map();
 for(const b of benchmark){const k=key(b.prefix);if(!memo.has(k)){const r=replayOriginWitness(b.prefix,data,{maxSteps:5000});if(!r.ok)throw Error("Prefix replay differs");memo.set(k,{world:r.world,steps:b.prefix.slice(),trace:r.trace,diagnostics:[]});}const n=planner.clone(memo.get(k));for(const s of b.suffix)planner.append(n,s);if(hash(serialize(n.world))!==b.stateHash)throw Error("Shared replay differs");benchOK++;}
 sharedMs=performance.now()-t;
}
const counts={unexplored:0,conditionalRegistry:0,jointBirth:0,reusedCompleteState:0,impossibleProven:0,limited:0,globalOptimalCertified:0};
const statusNames=["unexplored","conditionalRegistry","jointBirth","reusedCompleteState","impossibleProven","limited","globalOptimalCertified"];
const results=rows.map(r=>{const c=Object.fromEntries(statusNames.map(k=>[k,0]));let rootMatchedOnly=0;for(let j=0;j<N;j++){c[statusNames[r.status[j]]]++;counts[statusNames[r.status[j]]]++;if(r.rootOnly[j]&&r.status[j]===0)rootMatchedOnly++;}return {id:r.id,name:r.name,body:r.body,sourceType:r.sourceType,birthModel:r.birthModel,counts:c,rootMatchedOnly,status:Array.from(r.status)};});
const summary={origins:O,researchParents:N,applicableCandidates:O*N,counts,conditionalPairs:counts.conditionalRegistry+counts.jointBirth,remainingUncertified:O*N,priorPairs,newPairs,registeredJointBirths:Object.keys(saved).length,numericBirthModelReferences:Object.keys(saved).length,numericBirthModelsUsed:new Set(Object.values(saved).map(p=>p.birthModel)).size,historyPrefixes:Object.keys(roots).length,tested,limited,rootReplays,rootCacheHits:rootHits,rootFailed,prefixSteps,avoidedPrefixSteps:avoidedSteps,bitsetRejectedWithoutProof:bitsetRejected,seconds:elapsed,pairsPerSecond:elapsed?newPairs/elapsed:0,cpuSeconds:(used.user+used.system)/1e6,peakRssBytes:peakRss,benchmark:{samples:benchmark.length,equalWorlds:benchOK,individualMs,sharedMs,speedup:sharedMs?individualMs/sharedMs:null},actualGameCertified:0,globalOptimalCertified:0,safeBoundPruned:0,fullStateMerged:0};
const report={schemaVersion:1,kind:"ALL_ORIGIN_PAIR_SEARCH",sourceMetadataSha256:db.sourceMetadataSha256,fingerprint,engineHashes,baseCommit:base,generatedAt:new Date().toISOString(),statusNames,branches:branches.map(b=>({id:b.id,rank:b.rank})),origins:results,pairs:saved,roots,limitedAttempts:failures,summary,policy:"Exact chronological prefix reuse and active-research bitset prefilter. Birth uses explicit conditional indexed inputs and min roll; numeric origin birth-cap model is separate relaxed arithmetic, not joint final optimality. No event recruitment, irreversible pruning, full-state equivalence, or global optimality claim. Root-only links do not certify pairing."};
const output=path.join(exp,"12-all-origin-pair-search.json");fs.writeFileSync(output+".tmp",JSON.stringify(report));fs.renameSync(output+".tmp",output);
console.log(JSON.stringify({file:output,summary}));
