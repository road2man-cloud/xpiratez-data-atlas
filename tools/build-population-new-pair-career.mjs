// Resumable deterministic continuation from newly acquired minimum births.
// Preserve pre-growth and post-growth paths, including non-improving states.
// Conditional model only: no global optimality, no numeric dominance pruning of work.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createNewPairCareerPolicy,POLICY} from "./population-new-pair-career-policy.mjs";
import {createEventSeeds,replayEventSeed} from "./population-new-pair-event-seeds.mjs";
import {preflightTemplate} from "./population-research-template-selector.mjs";
import {createSharedResearchPool} from "./population-new-pair-template-pool.mjs";
import {pairShard,depthOf} from "./population-new-pair-shards.mjs";
import {traitEvidence,traitKey,traitSummary} from "./population-new-pair-trait-evidence.mjs";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {applyTransformation} from "../public/soldiers/modern/eligibility.js";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p))),key=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json"),nonEventEntry=db.populationNewPairEntry,eventSeeds=createEventSeeds(db),entry={...nonEventEntry,routes:{...nonEventEntry.routes,...eventSeeds.routes},published:[...nonEventEntry.published,...Object.keys(eventSeeds.routes)]};
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const out=arg("out","population-new-pair-career.json.gz"),priorFile=arg("prior",out),prior=fs.existsSync(priorFile)?decode(priorFile):db.populationNewPairCareer;
const shardCount=Number(arg("shard-count","1")),shardIndex=Number(arg("shard-index","0"));
assert(Number.isSafeInteger(shardCount)&&shardCount>=1&&Number.isSafeInteger(shardIndex)&&shardIndex>=0&&shardIndex<shardCount);
const manifestPath=arg("shard-manifest",null),manifest=manifestPath?read(manifestPath):null;
if(manifest)assert.equal(manifest.count,shardCount);
const owns=id=>shardCount===1||pairShard(entry.routes[id],shardCount,manifest)===shardIndex;
if(shardCount>1)assert(prior?.scheduler===3,"Migrate the checkpoint before sharding");
if(prior){assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);for(const [id,r] of Object.entries(db.populationNewPairCareer?.routes||{}))assert.deepEqual(prior.routes[id],r);}
const routes={...prior?.routes},states={...prior?.states},{g,finish,rankDefaultBodies}=createNewPairCareerPolicy(data);
const planner=createFoundationResearchPlanner(data,{maxAttempts:90,maxDepth:30,maxSteps:1800,methodLimit:24});
const planTemplates={...prior?.planTemplates},sharedPool=createSharedResearchPool(db),sharedLimit=Number(arg("shared-limit","0")),adaptiveShared=process.argv.includes("--adapt-shared");
assert(Number.isSafeInteger(sharedLimit)&&sharedLimit>=0);
if(prior?.scheduler!==3)for(const s of Object.values(states)){s.cursor=0;s.done=false;delete s.signature;}
const rootCache=new Map(),seedCache=new Map(),byBody=new Map(),front=new Map(),pending=[],hot=[],queued=new Set();let running=false;
const sum=v=>v.reduce((a,b)=>a+b,0),dom=(a,b)=>a.every((x,i)=>x>=b[i]);
const pk=r=>r.origin+"|"+r.branch+"|"+r.body;
function addFront(r){const k=pk(r),xs=front.get(k)||[];if(xs.some(v=>dom(v,r.vector)))return false;front.set(k,[...xs.filter(v=>!dom(r.vector,v)),r.vector]);return true;}
for(const r of Object.values(entry.routes))addFront(r);for(const r of Object.values(routes))addFront(r);
for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"))for(const b of r.allowedSoldierTypes||[]){const dest=g.bodies.get(r.producedSoldierType||b);if(!dest||!deterministicRule(r,[dest]))continue;const xs=byBody.get(b)||[];xs.push(r);byBody.set(b,xs);}
for(const xs of byBody.values())xs.sort((a,b)=>a.id.localeCompare(b.id));
const m={seedReplays:0,rootReplays:0,rootHits:0,statesExpanded:0,attempts:0,success:0,rejected:0,contextRejected:0,unchanged:0,newRoutes:0,newBodyPairs:0,preGrowthAttempts:0,preGrowthSuccess:0,postGrowthAttempts:0,postGrowthSuccess:0,errors:0,noop:0,researchAttempts:0,researchSuccess:0,researchFailed:0,probeRejected:0,templateHits:0,templateRejected:0,plannerCalls:0,templatePreflightRejects:0,exactPlanHits:0,rankMedalSuccess:0};
const exactPlans=new Map(),failedPlans=new Map(),prefixWorlds=new Map();
const breadth=process.argv.includes("--breadth"),initialOnly=process.argv.includes("--initial-only"),eligibleQuota=process.argv.includes("--eligible-quota"),seedQuota=Number(arg("seed-quota","24")),seedAttempts=new Map(),seedWork=new Map();
const quotaCount=id=>eligibleQuota?(seedWork.get(id)||0):(seedAttempts.get(id)||0);
const minDepth=Number(arg("deep-min","0")),retainTraits=process.argv.includes("--retain-traits");
assert(Number.isSafeInteger(minDepth)&&minDepth>=0&&(!initialOnly||minDepth===0));
const selected=s=>depthOf(s)>=minDepth&&(!initialOnly||!s.actions.length);
const traitSets=new Set(Object.values(routes).filter(r=>r.traitEvidence).map(r=>traitKey(r,r.traitEvidence)));
assert(Number.isSafeInteger(seedQuota)&&seedQuota>0);
const prefixLimit=Number(arg("prefix-cache","512")),quantum=Number(arg("quantum","12"));
assert(Number.isSafeInteger(prefixLimit)&&prefixLimit>=0&&Number.isSafeInteger(quantum)&&quantum>0);
Object.assign(m,{prefixHits:0,prefixStores:0,prefixEvictions:0,prefixReplayAvoided:0,quantumYields:0,hotTurns:0,coldTurns:0,eventSeedReplays:0,eventSeedErrors:0,exactFailureHits:0,exactFailureStores:0,quotaDeferrals:0,freshSeedTurns:0,distinctSeedsAttempted:0,eligibleWork:0,eligibleQuota,cheapProbeSkips:0,retainedSetAdds:0,traitOnlyAdds:0,recoveredStateRoutes:0});
function register(b,n,allowed,recovered=false){
 const end=g.grow(n),f=finish(end.world,end.steps),v={origin:b.r.origin,branch:b.r.branch,...f};
 const order=end.steps.filter(a=>a.type==="transform").map(a=>a.transform);
 if(!order.length)return false;
 // The actual seed ID is supplied by the caller; never infer it from body.
 const rid="POPNEWCAREER12:"+key([b.seed,end.steps]).slice(0,24);
 if(routes[rid])return false;
 const evidence=retainTraits?traitEvidence(end.world,end.steps,g.rules):null,tk=evidence?traitKey(v,evidence):null;
 const fresh=Boolean(evidence&&evidence.retained.length>=2&&!traitSets.has(tk));
 const isNewBody=!front.has(pk(v)),improved=!(front.get(pk(v))||[]).some(old=>dom(old,v.vector));
 if(!improved&&!fresh){m.unchanged++;return false;}
 const fullEnd=[...b.root.actions,...b.birth,...end.steps];
 if(fullEnd.length>1800||!b.r.commit.every(k=>g.active(end.world,k)))return false;
 const ctx=auditOriginCampaignContext(fullEnd,data);if(ctx.kind!=="compatible"||!ctx.allowedDifficulties.length)return false;
 assert.deepEqual(allowed,ctx.allowedDifficulties.filter(k=>b.r.allowedDifficulties.includes(k)));
 if(improved)assert(addFront(v));
 routes[rid]={seed:b.seed,seedActionHash:b.r.fullActionHash,origin:b.r.origin,branch:b.r.branch,root:b.r.root,actions:end.steps,order,fullActionHash:key(fullEnd),canonicalStateHash:exactWorld(end.world),allowedDifficulties:allowed,...f,...(evidence?{traitEvidence:evidence,publication:improved?"PARETO_IMPROVEMENT":"RETAINED_TRAIT_SET"}:{}),actualGameCertified:false};
 if(evidence)traitSets.add(tk);if(fresh)m.retainedSetAdds++;if(!improved)m.traitOnlyAdds++;if(recovered)m.recoveredStateRoutes++;
 m.newRoutes++;if(isNewBody)m.newBodyPairs++;return true;
}
function rememberWorld(seedId,actions,w){
 if(!prefixLimit)return;
 const k=key([seedId,actions]);if(prefixWorlds.has(k))return;
 if(prefixWorlds.size>=prefixLimit){prefixWorlds.delete(prefixWorlds.keys().next().value);m.prefixEvictions++;}
 prefixWorlds.set(k,w);m.prefixStores++;
}
function replayState(s,b){
 for(let i=s.actions.length;i>0;i--){
  const k=key([s.seed,s.actions.slice(0,i)]),w=prefixWorlds.get(k);
  if(!w)continue;
  m.prefixHits++;m.prefixReplayAvoided+=i;
  return i===s.actions.length?w:g.replay(s.actions.slice(i),w);
 }
 return g.replay(s.actions,b.world);
}
function probe(n,r){const q=g.meet(n,r);if(!q)return false;const m=member(q.world);try{const p=applyTransformation(r,m.state,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:m.commendations||{},statsKnown:true,medalsKnown:true});return p.verdict.kind==="eligible"&&p.state.exactStats&&!p.state.retired;}catch{return false;}}
function plan(b,n,r){
 const goals=[...new Set([...b.r.commit,...r.requires])],avoid=new Set(b.r.avoid),missing=r.requires.filter(k=>!g.active(n.world,k));if(!missing.length)return n;
 if(missing.some(k=>avoid.has(k)||n.world.disabled.has(k)))return null;
 const full=[...b.root.actions,...b.birth,...n.steps],tk=key(missing.slice().sort()),ek=key([exactWorld(n.world),goals,[...avoid].sort(),full.length]);
 function validate(suffix,adapt=false){try{
  if(!suffix.length||full.length+suffix.length>1800)return null;
  let w=n.world;const used=[];let skipped=0;
  for(let i=0;i<suffix.length;i++){
   const a=suffix[i],nextAction=suffix[i+1];
   // This constructs a NEW proposal, not an equivalent-state claim. Only
   // omit an already-satisfied goal or an obsolete wait outside a free queue.
   const already=(a.type==="research"&&g.active(w,a.id))||(["eventResearch","missionResearch","freeResearch"].includes(a.type)&&g.active(w,a.research))||(a.type==="advanceMonth"&&Number.isInteger(a.month)&&a.month<=w.month);
   if(adapt&&!w.pendingFree&&already){skipped++;continue;}
   if(adapt&&!w.pendingFree&&a.type==="repeatResearch"&&nextAction?.type==="freeResearch"&&nextAction.source===a.id&&g.active(w,nextAction.research)){skipped+=2;i++;continue;}
   const next=g.apply(w,a);if([...next.researched].some(k=>!w.researched.has(k)&&avoid.has(k))||b.r.commit.some(k=>g.active(w,k)&&!g.active(next,k)))return null;w=next;used.push(a);
  }
  if(w.pendingFree||!goals.every(k=>g.active(w,k))||!used.length)return null;
  return {world:w,steps:[...n.steps,...used],skipped};
 }catch{return null;}}
 const exact=exactPlans.get(ek);if(exact){const x=validate(exact);if(x){m.exactPlanHits++;return x;}}
 for(const suffix of planTemplates[tk]||[]){if(preflightTemplate(n.world,suffix,data)){m.templatePreflightRejects++;continue;}const x=validate(suffix);if(x){m.templateHits++;exactPlans.set(ek,suffix);return x;}m.templateRejected++;}
 // Try positive proposals from the other ledgers before invoking the bounded solver.
 if(sharedLimit)for(const e of sharedPool.candidates(tk,n.world,data,planTemplates[tk]||[],sharedLimit,adaptiveShared)){
  let x=preflightTemplate(n.world,e.suffix,data)?null:validate(e.suffix);
  if(!x&&adaptiveShared){sharedPool.metrics.sharedAdaptedAttempts++;x=validate(e.suffix,true);if(x&&x.skipped){sharedPool.metrics.sharedAdaptedHits++;sharedPool.metrics.sharedAdaptedSkipped+=x.skipped;}}
  sharedPool.attempt(e,Boolean(x));
  if(x){const suffix=x.steps.slice(n.steps.length),h=key(suffix);exactPlans.set(ek,suffix);const old=planTemplates[tk]||[];if(!old.some(s=>key(s)===h))planTemplates[tk]=[suffix,...old].slice(0,4);return x;}
 }
 // Memoize only this batch's identical bounded planner failure, after trying all current templates. A later run or a new template may still succeed.
 if(failedPlans.has(ek)){m.exactFailureHits++;return null;}
 m.plannerCalls++;const start={world:n.world,steps:full,trace:[],diagnostics:[]},q=planner.ensure(goals,start);if(!q.ok){failedPlans.set(ek,{reason:q.reason,unresolved:q.unresolved,attempts:q.attempts});m.exactFailureStores++;return null;}
 const suffix=q.node.steps.slice(full.length),x=validate(suffix);if(x){exactPlans.set(ek,suffix);const old=planTemplates[tk]||[];if(!old.some(s=>key(s)===key(suffix)))planTemplates[tk]=[suffix,...old].slice(0,4);}return x;
}
function seed(id){
 if(seedCache.has(id))return seedCache.get(id);
 const r=entry.routes[id];assert(r);
 if(r.eventVariant){const s=replayEventSeed(r,data,g);seedCache.set(id,s);m.seedReplays++;m.eventSeedReplays++;return s;}
 const root=entry.roots[r.root];assert(root);
 let base=rootCache.get(r.root);
 if(!base){const rr=replayOriginWitness(root.actions,data,{requireCompatibleContext:true});assert(rr.ok,rr.reason);base=rr.world;rootCache.set(r.root,base);m.rootReplays++;}else m.rootHits++;
 const birth=r.actions.at(-1)?.type==="conditionalCapGrowth"?r.actions.slice(0,-1):r.actions;
 const w=g.replay(birth,base),grown=g.grow({world:w,steps:birth});assert.equal(exactWorld(grown.world),r.canonicalStateHash);
 const s={r,root,birth,world:w};seedCache.set(id,s);m.seedReplays++;return s;
}
function enqueue(seedId,actions,hash,allowed){
 if(!owns(seedId))return;
 const id=key([seedId,actions]);if(!states[id])states[id]={seed:seedId,actions,stateHash:hash,allowedDifficulties:allowed,cursor:0};
 // Initial-pass mode defers continuations without deleting their work records.
 if(!states[id].done&&!queued.has(id)&&selected(states[id])){(running?hot:pending).push(id);queued.add(id);}
}
for(const [id,s] of Object.entries(states))if(owns(s.seed)&&!s.done&&selected(s)){pending.push(id);queued.add(id);}
for(const [id,r] of Object.entries(entry.routes))enqueue(id,[],null,r.allowedDifficulties);
// First interleave origins within each depth, then interleave depth levels.
// This avoids starving continuations behind hundreds of fresh birth states.
const eventFirst=process.argv.includes("--event-first"),originRoutes=new Map();
for(const r of Object.values(routes))originRoutes.set(r.origin,(originRoutes.get(r.origin)||0)+1);
const groups=new Map();for(const id of pending){const s=states[id],r=entry.routes[s.seed],depth=s.actions.filter(a=>a.type==="transform").length;const byOrigin=groups.get(depth)||new Map(),xs=byOrigin.get(r.origin)||[];xs.push(id);byOrigin.set(r.origin,xs);groups.set(depth,byOrigin);}
const levels=[...groups].sort((a,b)=>breadth?Number(b[0]===0)-Number(a[0]===0)||b[0]-a[0]:b[0]-a[0]).map(([depth,byOrigin])=>{const tiers=[...byOrigin.entries()].sort((a,b)=>(breadth?(originRoutes.get(a[0])||0)-(originRoutes.get(b[0])||0):0)||(eventFirst?Number(b[0].startsWith("event:"))-Number(a[0].startsWith("event:")):0)||a[0].localeCompare(b[0])).map(x=>x[1]),out=[];for(const xs of tiers)xs.sort((a,b)=>breadth?(states[a].visits||0)-(states[b].visits||0)||states[a].cursor-states[b].cursor:Number(states[b].cursor>0)-Number(states[a].cursor>0));for(let i=0;tiers.some(xs=>i<xs.length);i++)for(const xs of tiers)if(xs[i])out.push(xs[i]);return out;});
pending.length=0;for(let i=0;levels.some(xs=>i<xs.length);i++)for(const xs of levels)if(xs[i])pending.push(xs[i]);
const t0=performance.now(),seconds=Number(arg("seconds","25")),limit=Number(arg("limit","2400")),timely=()=>m.attempts<limit&&performance.now()-t0<seconds*1000;
running=true;
let coldAt=0,hotAt=0,preferHot=false,coldSinceHot=0;
while((coldAt<pending.length||hotAt<hot.length)&&timely()){
 const takeHot=hotAt<hot.length&&((breadth?coldSinceHot>=3:preferHot)||coldAt>=pending.length),id=takeHot?hot[hotAt++]:pending[coldAt++];
 preferHot=!takeHot;coldSinceHot=takeHot?0:coldSinceHot+1;m[takeHot?"hotTurns":"coldTurns"]++;
 const s=states[id];if(s.done)continue;
 if(breadth&&quotaCount(s.seed)>=seedQuota){m.quotaDeferrals++;continue;}
 if(!s.actions.length&&!s.visits&&!s.cursor)m.freshSeedTurns++;
 s.visits=(s.visits||0)+1;
 try{
  const b={...seed(s.seed),seed:s.seed},w=replayState(s,b),n={world:w,steps:s.actions};
  if(s.stateHash)assert.equal(exactWorld(w),s.stateHash);else s.stateHash=exactWorld(w);
  if(s.actions.length)rememberWorld(s.seed,s.actions,w);
  if(retainTraits&&s.actions.length)register(b,n,s.allowedDifficulties,true);
  const grown=g.grow(n),choices=(byBody.get(member(w).state.soldierType)||[]).filter(r=>r.requires.every(k=>!b.r.avoid.includes(k)&&!w.disabled.has(k)));
  const moves=choices.flatMap(r=>grown===n?[{r,n,phase:"pre"}]:[{r,n,phase:"pre"},{r,n:grown,phase:"post"}]);
  const sig=key(moves.map(x=>[x.r.id,x.phase]));if(s.signature)assert.equal(s.signature,sig);s.signature=sig;
  const stop=Math.min(moves.length,s.cursor+(eligibleQuota?Math.max(quantum,48):quantum),breadth&&!eligibleQuota?s.cursor+seedQuota-quotaCount(s.seed):Infinity);
  let work=0;
  for(;s.cursor<stop&&timely()&&(!eligibleQuota||(work<quantum&&(!breadth||quotaCount(s.seed)<seedQuota)));s.cursor++){
   const {r,n:c,phase}=moves[s.cursor];m.attempts++;m[phase+"GrowthAttempts"]++;seedAttempts.set(s.seed,(seedAttempts.get(s.seed)||0)+1);
   try{
    if(!probe(c,r)){m.probeRejected++;if(eligibleQuota)m.cheapProbeSkips++;continue;}
    work++;m.eligibleWork++;seedWork.set(s.seed,(seedWork.get(s.seed)||0)+1);
    const needs=r.requires.some(k=>!g.active(c.world,k));let planned=c;
    if(needs){m.researchAttempts++;planned=plan(b,c,r);if(!planned){m.researchFailed++;continue;}}
    const x=g.transform(planned,r);if(!x){m.rejected++;continue;}if(needs)m.researchSuccess++;
    const full=[...b.root.actions,...b.birth,...x.steps];
    if(full.length>1800||!b.r.commit.every(k=>g.active(x.world,k))){m.contextRejected++;continue;}
    const ctx=auditOriginCampaignContext(full,data),allowed=ctx.allowedDifficulties.filter(k=>s.allowedDifficulties.includes(k));
    if(ctx.kind!=="compatible"||!allowed.length){m.contextRejected++;continue;}
    const hash=exactWorld(x.world);if(hash===exactWorld(c.world)){m.noop++;continue;}
    m.success++;m[phase+"GrowthSuccess"]++;rememberWorld(s.seed,x.steps,x.world);enqueue(s.seed,x.steps,hash,allowed);
    if(x.steps.some(a=>a.type==="conditionalPromotion"||a.type==="conditionalMedal"))m.rankMedalSuccess++;
    register(b,x,allowed);
   }catch(e){m.errors++;s.lastError=String(e.message);}
  }
  if(s.cursor===moves.length){s.done=true;m.statesExpanded++;}else if(timely()){hot.push(id);m.quantumYields++;}
 }catch(e){s.error=String(e.message);m.errors++;if(entry.routes[s.seed]?.eventVariant)m.eventSeedErrors++;}
}
m.distinctSeedsAttempted=seedAttempts.size;Object.assign(m,sharedPool.metrics);
const values=Object.values(routes),summary={...m,...traitSummary(routes),minDepth,retainTraits,initialOnly,breadth,seedQuota,visitedInitialSeeds:Object.values(states).filter(s=>!s.actions.length&&(s.visits||s.cursor||s.done)).length,registeredRoutes:values.length,coveredPairs:new Set(values.map(r=>r.origin+"|"+r.branch)).size,coveredPairBodies:new Set(values.map(pk)).size,seedCandidates:entry.published.length,nonEventSeedCandidates:nonEventEntry.published.length,eventSeedCandidates:Object.keys(eventSeeds.routes).length,eventSeedRejected:Object.keys(eventSeeds.skipped).length,eventCareerRoutes:values.filter(r=>entry.routes[r.seed]?.eventVariant).length,eventCareerPairs:new Set(values.filter(r=>entry.routes[r.seed]?.eventVariant).map(r=>r.origin+"|"+r.branch)).size,processedSeedStates:Object.values(states).filter(s=>!s.actions.length&&s.done).length,states:Object.keys(states).length,pendingStates:Object.values(states).filter(s=>!s.done).length,maxTransforms:Math.max(0,...values.map(r=>r.order.length)),rankMedalRoutes:values.filter(r=>r.careerPolicy).length,promotionRoutes:values.filter(r=>r.actions.some(a=>a.type==="conditionalPromotion")).length,medalRoutes:values.filter(r=>r.actions.some(a=>a.type==="conditionalMedal")).length,elapsedSeconds:(performance.now()-t0)/1000,fullCompleted:0,actualGameCertified:0};
const result={kind:"POPULATION_NEW_PAIR_CAREER",schemaVersion:1,scheduler:3,careerPolicy:POLICY,rankDefaultBodies,sourceMetadataSha256:db.sourceMetadataSha256,...(shardCount>1?{shard:{count:shardCount,index:shardIndex,ownedSeeds:entry.published.filter(owns).length},batchMetrics:m}:{}),routes,states,planTemplates,published:Object.keys(routes),summary,scope:"Conditional deterministic transformations with additional replayed research from registered non-event and event minimum births; pre/post combat-cap growth, assumed rank and required medals; medal decoration excluded from permanent comparison; conditional resources; bounded batches, no global certification."};
fs.writeFileSync(out+".tmp",z.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(out+".tmp",out);console.log(JSON.stringify(summary));
