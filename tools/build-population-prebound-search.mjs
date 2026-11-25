// Objective-specific pre-generation branch-and-bound. Does not construct the
// complete D4+ graph. Re-group original research histories at the new depth.
// Run --full for a same-input independent exhaustive label scan.
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import assert from "node:assert/strict";
import {initialState,applyTransformation,bonusStats,STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {createScalarBound,scalarGrowth} from "./population-scalar-upper-bound.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const decode=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)));
const db=decode("public/data/branch-soldier-results.json.gz"),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json")),v=db.populationSearch.versions.D3;
const input=fs.readFileSync("public/data/"+v.file),a=JSON.parse(zlib.gunzipSync(input));
assert.equal(sha(input),v.sha256);assert.equal(a.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
const depth=Number(arg("depth","4")),full=process.argv.includes("--full"),queryName=arg("query","mana");
if(!Number.isInteger(depth)||depth<3||depth>6)throw Error("Supported depth 3..6");
const query=({mana:{objective:"mana",targets:{psiStrength:60},maxFees:100000},firing:{objective:"firing",targets:{tu:100,health:90},maxFees:200000},strength:{objective:"strength",targets:{},maxFees:null},total:{objective:"total",targets:{},maxFees:null}})[queryName];
if(!query)throw Error("Unknown query");
const oi=STAT_KEYS.indexOf(query.objective),target=Object.entries(query.targets).map(([k,n])=>[STAT_KEYS.indexOf(k),k,n]);
const score=vec=>oi<0?vec.reduce((x,y)=>x+y,0):vec[oi];
const feasible=(f,fees)=> (query.maxFees==null||fees<=query.maxFees)&&target.every(([i,k,n])=>f.vector[i]>=n);
const ruleMap=new Map(data.transformations.map(r=>[r.id,r])),rules=a.rules.map(id=>ruleMap.get(id));
assert(rules.every(Boolean));assert.deepEqual(rules.map(r=>r.id),data.transformations.filter(r=>r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE")).map(r=>r.id));
const bodies=new Map(data.soldiers.map(b=>[b.id,b])),profileMap=new Map(data.profiles.map(p=>[p.id,p]));
const byBody=new Map(),bits=rules.map((_,i)=>1n<<BigInt(i));
for(let i=0;i<rules.length;i++)for(const b of rules[i].allowedSoldierTypes){const x=byBody.get(b)||[];x.push(i);byBody.set(b,x);}
const researchBits=new Map(a.researchVocabulary.map((id,i)=>[id,1n<<BigInt(i)]));
const historyMasks=a.histories.map(h=>BigInt("0x"+h.activeMaskHex));
const active=(mask,id)=>!!(mask&(researchBits.get(id)||0n));
const available=historyMasks.map(mask=>rules.reduce((m,r,i)=>r.requires.every(id=>active(mask,id))?m|bits[i]:m,0n));
function reachable(body){let m=0n,bs=new Set([body]);for(let i=0;i<depth;i++){const n=new Set(bs);for(const b of bs)for(const ri of byBody.get(b)||[]){m|=bits[ri];n.add(rules[ri].producedSoldierType||b);}bs=n;}return m;}
const groups=[],pairs=new Set(),d3Incumbent=new Map();let initialBest=-Infinity;
for(const g of a.groups){
 let best=-Infinity;
 for(const [n,band,steps,growth,fees] of g.labels){const s=g.states[n];if(feasible(s,fees))best=Math.max(best,score(s.vector));}
 initialBest=Math.max(initialBest,best);
 for(const hi of g.historyIndices)d3Incumbent.set(g.originProfile+"|"+hi,best);
}
for(const p of data.profiles){
 const reach=reachable(p.soldierType),m=new Map();
 for(let hi=0;hi<a.histories.length;hi++){
  if((p.requires||[]).some(id=>!active(historyMasks[hi],id)))continue;
  const mask=available[hi]&reach,k=mask.toString(16);let g=m.get(k);
  if(!g){g={originProfile:p.id,mask:k,historyIndices:[],branchIds:[],seedBest:-Infinity};m.set(k,g);}
  g.historyIndices.push(hi);g.seedBest=Math.max(g.seedBest,d3Incumbent.get(p.id+"|"+hi)??-Infinity);pairs.add(p.id+"|"+a.histories[hi].branchId);
 }
 for(const g of m.values()){g.branchIds=[...new Set(g.historyIndices.map(i=>a.histories[i].branchId))].sort();g.index=groups.length;groups.push(g);}
}
assert.equal(pairs.size,a.summary.coveredPairs);assert.equal(groups.reduce((n,g)=>n+g.historyIndices.length,0),a.summary.historyOriginRequests-a.summary.historyOriginBirthGateMissing);
const vec=s=>STAT_KEYS.map(k=>s[k]),sorted=m=>[...m].sort(([x],[y])=>x.localeCompare(y));
const project=s=>[s.soldierType,s.armorId,s.status,s.corpseRecovered,s.rank,vec(s.initialStats),vec(s.currentStats),sorted(s.history),sorted(s.bonusCounts),[...s.bonusIds].sort(),s.retired,s.historyKnown,s.exactStats];
const states=[],stateIds=new Map();
function intern(s){
 const k=JSON.stringify(project(s));if(stateIds.has(k))return stateIds.get(k);
 const i=states.length;states.push({s,key:k,terminal:null,grown:null,edges:new Map()});stateIds.set(k,i);return i;
}
function grown(id){
 const n=states[id];if(n.grown!=null)return n.grown;
 const s=n.s,b=bodies.get(s.soldierType),raw=Object.fromEntries(STAT_KEYS.map(k=>[k,scalarGrowth(b,k,s.currentStats[k],data)]));
 n.grown=STAT_KEYS.every(k=>s.currentStats[k]===raw[k])?id:intern({...s,currentStats:raw});
 return n.grown;
}
function terminal(id){
 const n=states[id];if(n.terminal)return n.terminal;
 const s=n.s,t=states[grown(id)].s,raw=vec(t.currentStats),bonus=vec(bonusStats(s,data));
 const vector=raw.map((x,i)=>STAT_KEYS[i]==="psiSkill"&&x<=0&&bonus[i]>0?x:Math.max(STAT_KEYS[i]==="health"?1:0,x+bonus[i]));
 n.terminal={body:s.soldierType,raw,bonus,vector};return n.terminal;
}
const metrics={visitedLabels:0,attemptedEdges:0,computedTransitions:0,reusedTransitions:0,gateOrRandomRejected:0,prunedPrefixes:0,prunedBeforeTransition:0,prunedByObjective:0,prunedByTarget:0,prunedByFees:0,abstractCalls:0,abstractComputed:0,abstractHits:0,abstractTransitions:0,scalarParityChecks:0,groupsVisited:0,groupsWithWinningTies:0};
function transition(id,ri,grow){
 const before=grow?grown(id):id;if(grow&&before===id)return null;
 const n=states[before];metrics.attemptedEdges++;
 if(n.edges.has(ri)){metrics.reusedTransitions++;return n.edges.get(ri);}
 metrics.computedTransitions++;const r=rules[ri],x=applyTransformation(r,n.s,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:{},statsKnown:true,medalsKnown:true});
 const to=x.verdict.kind==="eligible"&&x.state.exactStats&&!x.state.retired?intern(x.state):null;
 if(to===null)metrics.gateOrRandomRejected++;
 n.edges.set(ri,to);return to;
}
let incumbent=initialBest,ties=[],certificates=[];
const start=performance.now(),cpu=process.cpuUsage(),maxSeconds=Number(arg("seconds","180")),queryStats=oi<0?STAT_KEYS:[query.objective];
let complete=true;
function savePrune(g,band,order,growth,fees,left,reason,bound,threshold){
 metrics.prunedPrefixes++;metrics["prunedBy"+reason]++;
 certificates.push({group:g.index,band,order:[...order],growth:[...growth],fees,left,reason,bound:Number.isFinite(bound)?bound:null,threshold});
}
const batches=new Map();
for(const g of groups){const xs=batches.get(g.mask)||[];xs.push(g);batches.set(g.mask,xs);}
const batchList=[...batches.values()].map(xs=>xs.sort((x,y)=>y.seedBest-x.seedBest||x.index-y.index)).sort((x,y)=>y[0].seedBest-x[0].seedBest||x[0].index-y[0].index);
let ub=null,lastMask=null;
const flush=()=>{if(ub){metrics.abstractCalls+=ub.metrics.calls;metrics.abstractComputed+=ub.metrics.computed;metrics.abstractHits+=ub.metrics.hits;metrics.abstractTransitions+=ub.metrics.scalarTransitions;metrics.scalarParityChecks+=ub.metrics.parityChecks;}};
for(const g of batchList.flat()){
 if(performance.now()-start>maxSeconds*1000){complete=false;break;}
 const p=profileMap.get(g.originProfile),mask=BigInt("0x"+g.mask);
 if(!full&&lastMask!==g.mask){flush();ub=createScalarBound(data,rules,mask,{checkScalar:process.argv.includes("--check-scalar")});lastMask=g.mask;}
 const objectiveBound=(s,left)=>queryStats.reduce((n,k)=>n+ub.upper(s,left,k),0);
 metrics.groupsVisited++;
 function visit(id,band,order,growth,fees){
  const left=depth-order.length,s=states[id].s;
  if(!full){
   if(query.maxFees!=null&&fees>query.maxFees){savePrune(g,band,order,growth,fees,left,"Fees",fees,query.maxFees);return;}
   const upper=objectiveBound(s,left);
   if(upper<incumbent){savePrune(g,band,order,growth,fees,left,"Objective",upper,incumbent);return;}
   for(const [i,k,n] of target){const u=ub.upper(s,left,k);if(u<n){savePrune(g,band,order,growth,fees,left,"Target",u,n);return;}}
  }
  metrics.visitedLabels++;
  const f=terminal(id);
  if(feasible(f,fees)){
   const val=score(f.vector);
   if(val>incumbent){incumbent=val;ties=[];}
   if(val===incumbent)ties.push({group:g.index,band,order:[...order],growth:[...growth],fees,...f});
  }
  if(!left)return;
  for(const ri of byBody.get(s.soldierType)||[])if(mask&bits[ri]){
   const nextFees=fees+Math.max(0,rules[ri].cost||0);
   // A nonnegative direct fee already exceeding the budget cannot be repaired
   // by any future action. No call to the exact state engine is needed.
   if(!full&&query.maxFees!=null&&nextFees>query.maxFees){
    for(const grow of [0,1]){if(grow&&grown(id)===id)continue;metrics.prunedBeforeTransition++;savePrune(g,band,[...order,ri],[...growth,grow],nextFees,left-1,"Fees",nextFees,query.maxFees);}
    continue;
   }
   for(const grow of [0,1]){const to=transition(id,ri,grow);if(to!==null)visit(to,band,[...order,ri],[...growth,grow],nextFees);}
  }
 }
 for(const band of ["min","max"]){const s={...initialState(data,p,{band}),historyKnown:true,exactStats:true};visit(intern(s),band,[],[],0);}
}
flush();
ties.sort((x,y)=>x.group-y.group||x.band.localeCompare(y.band)||JSON.stringify([x.order,x.growth]).localeCompare(JSON.stringify([y.order,y.growth])));
metrics.groupsWithWinningTies=new Set(ties.map(t=>t.group)).size;
const elapsedMs=Math.round(performance.now()-start),u=process.cpuUsage(cpu),summary={...metrics,depth,full,queryName,query,initialBest:Number.isFinite(initialBest)?initialBest:null,bestScore:Number.isFinite(incumbent)?incumbent:null,ties:ties.length,complete,groups:groups.length,distinctMasks:batches.size,pairs:pairs.size,modeledOrigins:new Set(groups.map(g=>g.originProfile)).size,historyOriginRequests:groups.reduce((n,g)=>n+g.historyIndices.length,0),exactStatesGenerated:states.length,elapsedMs,cpuMs:Math.round((u.user+u.system)/1000),peakRssBytes:process.resourceUsage().maxRSS*1024,actualGameCertified:0};
const engine=key(["tools/build-population-prebound-search.mjs","tools/population-scalar-upper-bound.mjs","public/soldiers/modern/eligibility.js","public/soldiers/modern/research-training-locks.js","public/data/soldiers-modern-index.json"].map(p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))));
const report={schemaVersion:1,kind:"POPULATION_PREGENERATION_BOUND",sourceMetadataSha256:a.sourceMetadataSha256,sourceD3Sha256:v.sha256,engine,depth,queryName,query,groups:groups.map(({seedBest,...g})=>g),rules:a.rules,ties,certificates,summary,tieSha256:key(ties),scope:"Fixed active research, deterministic healthy no-clone transforms, min/max birth vectors, growth only none or full combat-cap before each action and final growth, assumed direct resources, no promotion/medals. Strict objective upper bounds preserve all ties within finite depth. Not unrestricted game optimality."};
fs.writeFileSync(arg("out","population-prebound-"+queryName+"-d"+depth+(full?"-full":"")+".json.gz"),zlib.gzipSync(Buffer.from(JSON.stringify(report)),{level:6}));
console.log(JSON.stringify(summary));console.log("tie SHA256",report.tieSha256);
