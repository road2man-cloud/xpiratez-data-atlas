// Extend newly unlocked chronological recruitments, preserving every successful
// ordered action route. Numerical cap projection is not growth replay.
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {serialize} from "node:v8";
import {performance} from "node:perf_hooks";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
import {applyTransformation,bonusStats,STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {evaluateCapGrowthChronologies} from "./damsel-madgal-cap-growth-chronology-core.mjs";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p))),hash=x=>createHash("sha256").update(x).digest("hex"),key=x=>hash(JSON.stringify(x)),arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),a=db.originUnlockSearch,data=read("public/data/soldiers-modern-index.json"),ledger=read("public/data/soldier-acquisition-progression-20261102.json"),catalog=read("public/data/soldier-source-catalog.json");
if(!a||a.sourceMetadataSha256!==data.meta.source.metadataSha256||a.sourceMetadataSha256!==db.sourceMetadataSha256)throw Error("Source mismatch");
data.originRows=ledger.rows;data.sourceItemIds=new Set(catalog.itemIds);
const fingerprint=key([a.fingerprint,...["tools/build-population-unlock-continuation.mjs","tools/damsel-madgal-cap-growth-chronology-core.mjs","public/soldiers/modern/growth-envelope.js","public/soldiers/modern/stat-envelope.js"].map(p=>hash(fs.readFileSync(p)))]);
const old=db.originUnlockContinuation;
if(old&&old.fingerprint!==fingerprint)throw Error("Continuation fingerprint changed");
const routes={...(old?.routes||{})},models={...(old?.models||{})},completed={...(old?.completed||{})};
const planner=createFoundationResearchPlanner(data,{maxSteps:1200});
const bodies=new Map(data.soldiers.map(s=>[s.id,s])),rules=data.transformations.filter(r=>r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"));
const byBody=new Map();for(const r of rules)for(const b of r.allowedSoldierTypes||[]){const list=byBody.get(b)||[];list.push(r);byBody.set(b,list);}
const vec=s=>STAT_KEYS.map(k=>s[k]),active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id),member=n=>n.world.soldiers.find(s=>s.id==="origin");
function finish(s){const body=bodies.get(s.soldierType),raw=vec(s.currentStats);for(let i=0;i<12;i++){const k=STAT_KEYS[i],cap=body.statCaps[k];if(k==="mana"&&!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary)continue;if(cap>raw[i])raw[i]=k==="bravery"?raw[i]+10*Math.floor((cap-raw[i])/10):cap;}const m=bonusStats(s,data),bonus=STAT_KEYS.map(k=>m[k]||0);return {body:s.soldierType,raw,bonus,vector:raw.map((x,i)=>STAT_KEYS[i]==="psiSkill"&&x<=0&&bonus[i]>0?x:Math.max(STAT_KEYS[i]==="health"?1:0,x+bonus[i]))};}
const start=performance.now(),cpu=process.cpuUsage(),maxSeconds=Number(arg("seconds","45")),maxRoutes=Number(arg("limit","2500")),depth=Number(arg("depth","2"));
if(![2,3].includes(depth))throw Error("Depth 2 or 3 only");
const m={newRoutes:0,rootReplays:0,rootReuse:0,birthReplays:0,birthFailures:0,transitions:0,gateRejected:0,numericComputed:0,numericReused:0,numericErrors:0,completedNow:0};
const enough=()=>m.newRoutes<maxRoutes&&performance.now()-start<maxSeconds*1000;
const rootMemo=new Map();
function rootFor(p){
 if(rootMemo.has(p.root)){m.rootReuse++;return rootMemo.get(p.root);}
 const root=a.roots[p.root];if(key(root.actions)!==p.root)throw Error("Root identity");
 const r=replayOriginWitness(root.actions,data,{requireCompatibleContext:true});m.rootReplays++;
 if(!r.ok)throw Error(r.reason);
 const n={world:r.world,steps:root.actions,trace:r.trace,diagnostics:[]};rootMemo.set(p.root,n);return n;
}
function numeric(origin,order,body){
 const id="PUNM12:"+key([origin,order]).slice(0,24);
 if(models[id]){m.numericReused++;return id;}
 try{
  const r=evaluateCapGrowthChronologies(data,origin,order,{maxTransformations:12,deduplicateEnvelopes:true,correlatedPercent:true,tightenStatGates:true});
  if(r.finalBody!==body)throw Error("Terminal body mismatch");
  const frontier=r.frontiers.twelve.map(x=>({raw:vec(x.rawUpper),bonus:vec(x.permanentBonus),vector:vec(x.highEffective),schedule:x.schedule,conditionalGateCrossings:x.conditionalGateCrossings}));
  if(!frontier.length||frontier.some(x=>[...x.raw,...x.bonus,...x.vector].some(n=>!Number.isSafeInteger(n))))throw Error("Incomplete numerical envelope");
  models[id]={origin,order,body,frontier,actualGameCertified:false};m.numericComputed++;return id;
 }catch(e){m.numericErrors++;return null;}
}
function visit(id,p,n,order,steps){
 if(order.length>=depth)return true;
 for(const r of byBody.get(member(n).state.soldierType)||[]){
  if(!enough())return false;
  if(!r.requires.every(x=>active(n.world,x)))continue;
  const s=member(n).state,probe=applyTransformation(r,s,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:member(n).commendations,statsKnown:true,medalsKnown:true});
  if(probe.verdict.kind!=="eligible"||!probe.state.exactStats||probe.state.retired){m.gateRejected++;continue;}
  const t=planner.clone(n),ord=[...order,r.id];
  try{
   planner.supply(t,{items:r.requiredItems||{},functions:r.requiresBaseFunc||[],funds:Math.max(0,r.cost||0)},"Conditional indexed continuation inputs "+r.id);
   planner.append(t,{type:"transform",soldier:"origin",transform:r.id});
  }catch(e){m.gateRejected++;continue;}
  const next=member(t)?.state;if(!next?.exactStats||next.retired){m.gateRejected++;continue;}
  m.transitions++;
  const rid="PUNC12:"+key([id,ord]).slice(0,24),stateHash=hash(serialize(t.world));
  if(ord.length>=2){
   if(routes[rid]){if(routes[rid].stateHash!==stateHash)throw Error("Prior state changed "+rid);}
   else{
    const f=finish(next),model=numeric(p.origin,ord,f.body),suffix=t.steps.slice(a.roots[p.root].actions.length+p.suffix.length);
    routes[rid]={pair:id,origin:p.origin,branch:p.branch,root:p.root,order:ord,actions:suffix,fullActionHash:key(t.steps),stateHash,rawBeforeFinalGrowth:vec(next.currentStats),...f,model,actualGameCertified:false};
    m.newRoutes++;
   }
  }
  if(!visit(id,p,t,ord,steps))return false;
 }
 return true;
}
// Breadth across origins, then additional branch pairs. Completed depth is
// persisted and skipped on next run; partial work remains available.
const grouped=new Map();for(const [id,p] of Object.entries(a.pairs)){if((completed[id]||0)>=depth)continue;const g=grouped.get(p.origin)||[];g.push([id,p]);grouped.set(p.origin,g);}
const queue=[];for(let i=0;;i++){let any=false;for(const g of grouped.values())if(g[i]){queue.push(g[i]);any=true;}if(!any)break;}
for(const [id,p] of queue){
 if(!enough())break;
 try{
  const n=planner.clone(rootFor(p));for(const s of p.suffix)planner.append(n,s);m.birthReplays++;
  if(hash(serialize(n.world))!==p.stateHash||key(n.steps)!==p.fullActionHash)throw Error("Birth state differs");
  if(visit(id,p,n,[],[])){completed[id]=depth;m.completedNow++;}
 }catch(e){if(e.message.startsWith("Prior state changed"))throw e;m.birthFailures++;console.log("UNRESOLVED",id,e.message);}
}
const all=Object.values(routes),elapsedMs=Math.round(performance.now()-start),u=process.cpuUsage(cpu),byDepth={};for(const r of all)byDepth[r.order.length]=(byDepth[r.order.length]||0)+1;
const summary={...m,registeredRoutes:all.length,registeredOrigins:new Set(all.map(r=>r.origin)).size,registeredBranches:new Set(all.map(r=>r.branch)).size,pairsWithContinuation:new Set(all.map(r=>r.pair)).size,completedPairs:Object.values(completed).filter(d=>d>=depth).length,depth,byDepth,registeredModels:Object.keys(models).length,elapsedMs,cpuMs:Math.round((u.user+u.system)/1000),peakRssBytes:process.resourceUsage().maxRSS*1024,actualGameCertified:0};
const result={schemaVersion:1,kind:"POPULATION_UNLOCK_CONTINUATION",fingerprint,unlockFingerprint:a.fingerprint,sourceMetadataSha256:a.sourceMetadataSha256,routes,models,completed,summary,scope:"Same conditional recruitment and fixed active research. Exact immediate deterministic live transforms without intervening growth; independent relaxed numerical growth envelope, no actual growth or global maximum proof."};
fs.writeFileSync(arg("out","population-unlock-continuation.json.gz"),zlib.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));
console.log(JSON.stringify(summary));
