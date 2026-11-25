// Ordered follow-up transforms after independently replayed post-birth research.
// Exact-world transition reuse does not merge ordered action witnesses.
// One optional new research goal per seed is separately budgeted, not exhaustive.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {serialize} from "node:v8";
import {performance} from "node:perf_hooks";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {STAT_KEYS,bonusStats,applyTransformation} from "../public/soldiers/modern/eligibility.js";
import {exactStateHash,createExactPrefixCheckpointCache} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(s=>s.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),u=db.originUnlockSearch,e=db.originEventBirth,x=db.originExtendedContinuation,seed=db.originResearchContinuation;
assert(u&&e&&x&&seed&&seed.sourceMetadataSha256===db.sourceMetadataSha256);
const data=read("public/data/soldiers-modern-index.json"),ledger=read("public/data/soldier-acquisition-progression-20261102.json"),catalog=read("public/data/soldier-source-catalog.json");
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);assert.equal(STAT_KEYS.join(),db.stats.join());
data.originRows=ledger.rows;data.sourceItemIds=new Set(catalog.itemIds);
const hashFile=p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
for(const [p,h] of Object.entries(seed.hashes))assert.equal(hashFile(p),h,"Seed engine drift "+p);
const hashes={...seed.hashes,"tools/build-population-research-chain.mjs":hashFile("tools/build-population-research-chain.mjs")};
const fingerprint=key([db.sourceMetadataSha256,u.fingerprint,e.fingerprint,seed.fingerprint,hashes]);
const file=arg("out","population-research-chain.json.gz"),local=fs.existsSync(file)?decode(file):null,remote=db.originResearchChain;
const prior=local||remote;
if(prior)assert.equal(prior.fingerprint,fingerprint,"Explicit chain engine migration required");
if(local&&remote)for(const k of ["routes","models","completed","researchAttempts"])for(const [id,r] of Object.entries(remote[k]||{})){
 if(k==="completed")assert((local[k]?.[id]||0)>=r,"Missing public completion "+id);
 else assert.deepEqual(local[k]?.[id],r,"Missing public evidence "+id);
}
const routes={...(prior?.routes||{})},completed={...(prior?.completed||{})},visits={...(prior?.visits||{})},researchAttempts={...(prior?.researchAttempts||{})},subtrees={...(prior?.subtrees||{})};
const branches=new Map(db.branches.map(b=>[b.id,b])),tasks=[];
for(const [id,r] of Object.entries(seed.routes)){
 const p=r.kind==="unlock"?u.pairs[r.pair]:e.variants[r.input.slice(6)];
 assert(p&&r.origin===p.origin&&r.branch===p.branch&&r.root===p.root&&r.birthStateHash===p.stateHash);
 const root=(r.kind==="unlock"?u:e).roots[p.root].actions;
 const birthActions=r.kind==="unlock"?[...root,...p.suffix]:[...root.slice(0,p.insertionAt),...p.extraBeforeBirth,...p.inserted,...root.slice(p.insertionAt)];
 assert.equal(key(birthActions),p.fullActionHash);assert.equal(key([...birthActions,...r.actions]),r.fullActionHash);
 tasks.push({id,r,p,birthActions});
}
const legacyHashes={...x.hashes,"tools/build-population-extended-continuation.mjs":"64fa7f15eee999512b0fc6a254b5fa8e2841e5f1ce460650783fc4bafd918f2c"};
for(const [p,h] of Object.entries(x.hashes))if(p!=="tools/build-population-extended-continuation.mjs")assert.equal(hashFile(p),h,"Birth engine drift "+p);
const birthCache=createExactPrefixCheckpointCache(".population-extended-cache",key([db.sourceMetadataSha256,u.fingerprint,e.fingerprint,legacyHashes]));
const seedCache=createExactPrefixCheckpointCache(".population-research-chain-cache",fingerprint);
const planner=createFoundationResearchPlanner(data,{maxAttempts:85,maxDepth:28,maxSteps:1200,methodLimit:16});
const member=n=>n.world.soldiers.find(s=>s.id==="origin"),vec=s=>STAT_KEYS.map(k=>s[k]||0),active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const deterministic=r=>!STAT_KEYS.some(k=>r.rerollStats?.[k]||["flat","percent","percentGained"].some(s=>Number(r[s+"Min"]?.[k]||0)!==Number(r[s+"Max"]?.[k]||0)));
const byBody=new Map(),bodies=new Map(data.soldiers.map(b=>[b.id,b]));
for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE")&&deterministic(r))for(const body of r.allowedSoldierTypes||[]){const a=byBody.get(body)||[];a.push(r);byBody.set(body,a);}
for(const a of byBody.values())a.sort((a,b)=>a.id.localeCompare(b.id));
const branchChoices=new Set(db.branches.flatMap(b=>[...b.captain,...Object.values(b.choices||{})]).filter(Boolean));
const depth=Number(arg("depth","4")),limit=Number(arg("limit","1200")),seconds=Number(arg("seconds","24")),extraResearch=process.argv.includes("--research");
assert(Number.isSafeInteger(depth)&&depth>=2&&depth<=6&&Number.isSafeInteger(limit)&&limit>0&&Number.isFinite(seconds)&&seconds>0);
const start=performance.now(),before=Object.keys(routes).length,m={newRoutes:0,visited:0,seedReplayed:0,seedCacheHits:0,seedFailures:0,transitionRequests:0,transitionComputed:0,transitionReused:0,gateRejected:0,completedNow:0,subtreesReused:0,researchGoals:0,researchFailed:0,researchSuccess:0,byBranch:{},bySource:{},byDepth:{}};
let stopAt=0;
const enough=()=>m.newRoutes<limit&&m.newRoutes<stopAt&&performance.now()-start<seconds*1000;
const timely=()=>performance.now()-start<seconds*1000;
const exactEdges=new Map();
function loadSeed(t){
 const full=[...t.birthActions,...t.r.actions];
 let n=seedCache.load(full);
 if(n)m.seedCacheHits++;
 else{
  n=birthCache.load(t.birthActions,t.p.stateHash);
  if(!n){n=planner.newNode();for(const step of t.birthActions)planner.append(n,step);assert.equal(sha(serialize(n.world)),t.p.stateHash);birthCache.save(n,t.p.stateHash);}
  n=planner.clone(n);for(const step of t.r.actions)planner.append(n,step);
  m.seedReplayed++;
 }
 assert.equal(key(n.steps),t.r.fullActionHash);assert.equal(exactStateHash(n.world),t.r.canonicalStateHash);
 const s=member(n)?.state;assert(s?.exactStats&&!s.retired);assert.equal(s.soldierType,t.r.body);assert.deepEqual(vec(s.currentStats),t.r.raw);assert.deepEqual(vec(bonusStats(s,data,{commendations:member(n).commendations||{}})),t.r.bonus);
 if(!seedCache.load(full))seedCache.save(n);
 return n;
}
function finish(n){
 const s=member(n).state,body=bodies.get(s.soldierType),raw=vec(s.currentStats),bonus=vec(bonusStats(s,data,{commendations:member(n).commendations||{}}));
 const capRaw=raw.map((v,i)=>{const k=STAT_KEYS[i],cap=body.statCaps[k];if(k==="mana"&&!data.growthRules.manaPrimary&&!data.growthRules.manaSecondary)return v;return cap>v?(k==="bravery"?v+10*Math.floor((cap-v)/10):cap):v;});
 if(![...raw,...bonus,...capRaw].every(Number.isSafeInteger))throw Error("Invalid vector");
 const effective=a=>a.map((v,i)=>STAT_KEYS[i]==="psiSkill"&&v<=0&&bonus[i]>0?v:Math.max(STAT_KEYS[i]==="health"?1:0,v+bonus[i]));
 return {body:s.soldierType,raw,bonus,vector:effective(raw),capRaw,capVector:effective(capRaw)};
}
function transform(n,r,stateHash){
 m.transitionRequests++;
 const ek=key([stateHash,r.id]),edge=exactEdges.get(ek);
 if(edge&&n.steps.length+edge.actions.length<=1200){
  m.transitionReused++;
  return {world:edge.world,steps:[...n.steps,...edge.actions],trace:[...n.trace,...edge.trace.map((v,i)=>({...v,index:n.steps.length+i}))],diagnostics:[...n.diagnostics]};
 }
 const c=planner.clone(n);
 try{
  planner.supply(c,{items:r.requiredItems||{},functions:r.requiresBaseFunc||[],funds:Math.max(0,r.cost||0)},"Conditional research-chain transform "+r.id);
  planner.append(c,{type:"transform",soldier:"origin",transform:r.id});
 }catch{m.gateRejected++;return null;}
 const s=member(c)?.state;if(!s?.exactStats||s.retired){m.gateRejected++;return null;}
 m.transitionComputed++;
 // Only successful deterministic transitions, never discard aliases or
 // cache failure caused by a step budget. No goal planning is memoized.
 if(exactEdges.size<10000)exactEdges.set(ek,{world:c.world,actions:c.steps.slice(n.steps.length),trace:c.trace.slice(n.trace.length)});
 return c;
}
function register(t,n,addedResearch){
 const actions=n.steps.slice(t.birthActions.length),order=actions.filter(a=>a.type==="transform").map(a=>a.transform),id="PXRCHAIN12:"+key([t.r.input,actions]).slice(0,24),canonical=exactStateHash(n.world);
 const old=routes[id];
 if(old){assert.equal(old.fullActionHash,key(n.steps));assert.equal(old.canonicalStateHash,canonical);return;}
 const ctx=auditOriginCampaignContext(n.steps,data),allowed=ctx.allowedDifficulties.filter(k=>t.r.allowedDifficulties.includes(k));
 if(ctx.kind!=="compatible"||!allowed.length)throw Error("Chain campaign context mismatch");
 const f=finish(n);
 const r={seed:t.id,input:t.r.input,kind:t.r.kind,pair:t.r.pair,origin:t.r.origin,branch:t.r.branch,root:t.r.root,order,actions,seedActionHash:t.r.fullActionHash,seedStateHash:t.r.canonicalStateHash,birthActionHash:t.r.birthActionHash,birthStateHash:t.r.birthStateHash,fullActionHash:key(n.steps),canonicalStateHash:canonical,allowedDifficulties:allowed,missing:t.r.missing,addedResearch:[...new Set([...t.r.addedResearch,...addedResearch])],secondaryResearch:addedResearch,...f,actualGameCertified:false};
 routes[id]=r;
 m.newRoutes++;m.byBranch[r.branch]=(m.byBranch[r.branch]||0)+1;m.bySource[r.kind]=(m.bySource[r.kind]||0)+1;m.byDepth[order.length]=(m.byDepth[order.length]||0)+1;
}
function visit(t,n,level,addedResearch){
 if(level>=depth)return true;
 const sk=key([t.id,key(n.steps),depth]);if(subtrees[sk]){m.subtreesReused++;return true;}
 const stateHash=exactStateHash(n.world);
 for(const r of byBody.get(member(n).state.soldierType)||[]){
  if(!enough())return false;
  if(!r.requires.every(k=>active(n.world,k)))continue;
  const c=transform(n,r,stateHash);if(!c)continue;
  register(t,c,addedResearch);if(!visit(t,c,level+1,addedResearch))return false;
 }
 subtrees[sk]=true;return true;
}
function extra(t,n){
 const b=branches.get(t.r.branch),commitments=[...b.captain,...Object.values(b.choices||{}).filter(Boolean)],blocked=new Set(b.blockedResearch||[]),opposing=new Set([...branchChoices].filter(k=>!commitments.includes(k)&&!n.world.researched.has(k)));
 const s=member(n).state;
 const targets=(byBody.get(s.soldierType)||[]).filter(r=>r.requires.some(k=>!active(n.world,k))&&r.requires.every(k=>!blocked.has(k)&&!opposing.has(k))&&r.minRank<=s.rank);
 targets.sort((a,b)=>a.requires.reduce((v,k)=>v+(active(n.world,k)?0:planner.distance.get(k)??1e8),0)-b.requires.reduce((v,k)=>v+(active(n.world,k)?0:planner.distance.get(k)??1e8),0)||a.id.localeCompare(b.id));
 let tried=0;
 for(const r of targets){
  if(!enough()||tried>=2)break;
  const aid=key([t.id,r.id]);if(researchAttempts[aid])continue;
  let probe;try{probe=applyTransformation(r,s,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:member(n).commendations,statsKnown:true,medalsKnown:true});}catch{continue;}
  if(probe.verdict.kind!=="eligible"||!probe.state.exactStats||probe.state.retired)continue;
  tried++;m.researchGoals++;
  try{
   const q=planner.ensure([...new Set([...commitments,...r.requires])],n);if(!q.ok)throw Error(q.reason||"Research unresolved");
   const c=q.node,trace=c.trace.slice(n.trace.length);
   if(c.steps.length===n.steps.length||!commitments.every(k=>active(c.world,k))||!r.requires.every(k=>active(c.world,k)))throw Error("Missing active commitments");
   if(trace.some(z=>(z.added||[]).some(k=>opposing.has(k)||blocked.has(k))||(z.closed||[]).some(k=>commitments.includes(k))))throw Error("Branch conflict");
   const ctx=auditOriginCampaignContext(c.steps,data);if(ctx.kind!=="compatible"||!ctx.allowedDifficulties.some(k=>t.r.allowedDifficulties.includes(k)))throw Error("Campaign conflict");
   const f=transform(c,r,exactStateHash(c.world));if(!f)throw Error("Transform rejected");
   const added=[...f.world.researched].filter(k=>active(f.world,k)&&!active(n.world,k));
   register(t,f,added);m.researchSuccess++;
   researchAttempts[aid]={seed:t.id,rule:r.id,status:"CONDITIONAL_REPLAY"};
  }catch(err){m.researchFailed++;researchAttempts[aid]={seed:t.id,rule:r.id,status:"LIMITED_UNRESOLVED",reason:String(err.message)};}
 }
}
const groups=new Map();
for(const t of tasks){if(!extraResearch&&(completed[t.id]||0)>=depth)continue;const a=groups.get(t.r.branch)||[];a.push(t);groups.set(t.r.branch,a);}
const branchCounts={};for(const r of Object.values(routes))branchCounts[r.branch]=(branchCounts[r.branch]||0)+1;
const grouped=[...groups].sort(([a],[b])=>(branchCounts[a]||0)-(branchCounts[b]||0)||a.localeCompare(b));
for(const [,a] of grouped)a.sort((a,b)=>(visits[a.id]||0)-(visits[b.id]||0)||a.id.localeCompare(b.id));
const queue=[];for(let i=0;;i++){let any=false;for(const [,a] of grouped)if(a[i]){queue.push(a[i]);any=true;}if(!any)break;}
const quota=Math.max(3,Math.ceil(limit/Math.max(1,groups.size))),perSeed=Math.max(3,Math.ceil(quota/4));
for(const t of queue){
 if(!timely()||m.newRoutes>=limit)break;
 const remaining=quota-(m.byBranch[t.r.branch]||0);if(remaining<=0)continue;
 stopAt=m.newRoutes+Math.min(remaining,perSeed);m.visited++;visits[t.id]=(visits[t.id]||0)+1;
 let n;try{n=loadSeed(t);}catch(err){m.seedFailures++;console.log("SEED_UNRESOLVED",t.id,String(err.message));continue;}
 if(extraResearch)extra(t,n);
 else if(visit(t,n,1,[])){completed[t.id]=Math.max(completed[t.id]||0,depth);m.completedNow++;}
}
const all=Object.values(routes),summary={...m,priorRoutes:before,registeredRoutes:all.length,registeredOrigins:new Set(all.map(r=>r.origin)).size,registeredPairs:new Set(all.map(r=>r.pair)).size,registeredBranches:new Set(all.map(r=>r.branch)).size,registeredSeeds:new Set(all.map(r=>r.seed)).size,seedCount:tasks.length,requestedDepth:depth,completedInputs:Object.values(completed).filter(n=>n>=depth).length,completedByDepth:Object.fromEntries([2,3,4,5,6].map(d=>[d,Object.values(completed).filter(n=>n>=d).length])),secondaryResearchRoutes:all.filter(r=>r.secondaryResearch.length).length,attemptedResearchGoals:Object.keys(researchAttempts).length,subtreeRecords:Object.keys(subtrees).length,uniqueTransitionEdges:exactEdges.size,seconds:(performance.now()-start)/1000,birthCache:birthCache.metrics,seedCache:seedCache.metrics,actualGameCertified:0,globalOptimalCertified:0};
const result={schemaVersion:1,kind:"POPULATION_RESEARCH_CHAIN",fingerprint,hashes,sourceMetadataSha256:db.sourceMetadataSha256,unlockFingerprint:u.fingerprint,eventFingerprint:e.fingerprint,seedFingerprint:seed.fingerprint,routes,completed,visits,researchAttempts,subtrees,summary,scope:"Verified post-birth research seed; ordered deterministic follow-up transforms, or separately bounded secondary research goal. Immediate stat replay and conditional final combat-cap projection. Full-world edge reuse preserves aliases. No intervening growth, random outcomes, or global optimum proof."};
fs.writeFileSync(file+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(file+".tmp",file);console.log(JSON.stringify(summary));
