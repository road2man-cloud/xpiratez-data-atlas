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
import {preflightTemplate} from "./population-research-template-selector.mjs";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {applyTransformation} from "../public/soldiers/modern/eligibility.js";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(z.gunzipSync(fs.readFileSync(p))),key=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json"),entry=db.populationNewPairEntry;
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const out=arg("out","population-new-pair-career.json.gz"),prior=fs.existsSync(out)?decode(out):db.populationNewPairCareer;
if(prior){assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);for(const [id,r] of Object.entries(db.populationNewPairCareer?.routes||{}))assert.deepEqual(prior.routes[id],r);}
const routes={...prior?.routes},states={...prior?.states},{g,finish,rankDefaultBodies}=createNewPairCareerPolicy(data);
const planner=createFoundationResearchPlanner(data,{maxAttempts:90,maxDepth:30,maxSteps:1800,methodLimit:24});
const planTemplates={...prior?.planTemplates};
if(prior?.scheduler!==3)for(const s of Object.values(states)){s.cursor=0;s.done=false;delete s.signature;}
const rootCache=new Map(),seedCache=new Map(),byBody=new Map(),front=new Map(),pending=[],hot=[],queued=new Set();let running=false;
const sum=v=>v.reduce((a,b)=>a+b,0),dom=(a,b)=>a.every((x,i)=>x>=b[i]);
const pk=r=>r.origin+"|"+r.branch+"|"+r.body;
function addFront(r){const k=pk(r),xs=front.get(k)||[];if(xs.some(v=>dom(v,r.vector)))return false;front.set(k,[...xs.filter(v=>!dom(r.vector,v)),r.vector]);return true;}
for(const r of Object.values(entry.routes))addFront(r);for(const r of Object.values(routes))addFront(r);
for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"))for(const b of r.allowedSoldierTypes||[]){const dest=g.bodies.get(r.producedSoldierType||b);if(!dest||!deterministicRule(r,[dest]))continue;const xs=byBody.get(b)||[];xs.push(r);byBody.set(b,xs);}
for(const xs of byBody.values())xs.sort((a,b)=>a.id.localeCompare(b.id));
const m={seedReplays:0,rootReplays:0,rootHits:0,statesExpanded:0,attempts:0,success:0,rejected:0,contextRejected:0,unchanged:0,newRoutes:0,newBodyPairs:0,preGrowthAttempts:0,preGrowthSuccess:0,postGrowthAttempts:0,postGrowthSuccess:0,errors:0,noop:0,researchAttempts:0,researchSuccess:0,researchFailed:0,probeRejected:0,templateHits:0,templateRejected:0,plannerCalls:0,templatePreflightRejects:0,exactPlanHits:0,rankMedalSuccess:0};
const exactPlans=new Map(),prefixWorlds=new Map();
const prefixLimit=Number(arg("prefix-cache","512")),quantum=Number(arg("quantum","12"));
assert(Number.isSafeInteger(prefixLimit)&&prefixLimit>=0&&Number.isSafeInteger(quantum)&&quantum>0);
Object.assign(m,{prefixHits:0,prefixStores:0,prefixEvictions:0,prefixReplayAvoided:0,quantumYields:0,hotTurns:0,coldTurns:0});
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
 function validate(suffix){try{if(!suffix.length||full.length+suffix.length>1800)return null;let w=n.world;for(const a of suffix){const next=g.apply(w,a);if([...next.researched].some(k=>!w.researched.has(k)&&avoid.has(k))||b.r.commit.some(k=>g.active(w,k)&&!g.active(next,k)))return null;w=next;}return !w.pendingFree&&goals.every(k=>g.active(w,k))?{world:w,steps:[...n.steps,...suffix]}:null;}catch{return null;}}
 const exact=exactPlans.get(ek);if(exact){const x=validate(exact);if(x){m.exactPlanHits++;return x;}}
 for(const suffix of planTemplates[tk]||[]){if(preflightTemplate(n.world,suffix,data)){m.templatePreflightRejects++;continue;}const x=validate(suffix);if(x){m.templateHits++;exactPlans.set(ek,suffix);return x;}m.templateRejected++;}
 m.plannerCalls++;const start={world:n.world,steps:full,trace:[],diagnostics:[]},q=planner.ensure(goals,start);if(!q.ok)return null;
 const suffix=q.node.steps.slice(full.length),x=validate(suffix);if(x){exactPlans.set(ek,suffix);const old=planTemplates[tk]||[];if(!old.some(s=>key(s)===key(suffix)))planTemplates[tk]=[suffix,...old].slice(0,4);}return x;
}
function seed(id){
 if(seedCache.has(id))return seedCache.get(id);
 const r=entry.routes[id],root=entry.roots[r.root];assert(r&&root);
 let base=rootCache.get(r.root);
 if(!base){const rr=replayOriginWitness(root.actions,data,{requireCompatibleContext:true});assert(rr.ok,rr.reason);base=rr.world;rootCache.set(r.root,base);m.rootReplays++;}else m.rootHits++;
 const birth=r.actions.at(-1)?.type==="conditionalCapGrowth"?r.actions.slice(0,-1):r.actions;
 const w=g.replay(birth,base),grown=g.grow({world:w,steps:birth});assert.equal(exactWorld(grown.world),r.canonicalStateHash);
 const s={r,root,birth,world:w};seedCache.set(id,s);m.seedReplays++;return s;
}
function enqueue(seedId,actions,hash,allowed){
 const id=key([seedId,actions]);if(!states[id])states[id]={seed:seedId,actions,stateHash:hash,allowedDifficulties:allowed,cursor:0};
 if(!states[id].done&&!queued.has(id)){(running?hot:pending).push(id);queued.add(id);}
}
for(const [id,s] of Object.entries(states))if(!s.done){pending.push(id);queued.add(id);}
for(const [id,r] of Object.entries(entry.routes))enqueue(id,[],null,r.allowedDifficulties);
// First interleave origins within each depth, then interleave depth levels.
// This avoids starving continuations behind hundreds of fresh birth states.
const groups=new Map();for(const id of pending){const s=states[id],r=entry.routes[s.seed],depth=s.actions.filter(a=>a.type==="transform").length;const byOrigin=groups.get(depth)||new Map(),xs=byOrigin.get(r.origin)||[];xs.push(id);byOrigin.set(r.origin,xs);groups.set(depth,byOrigin);}
const levels=[...groups].sort((a,b)=>b[0]-a[0]).map(([depth,byOrigin])=>{const tiers=[...byOrigin.values()],out=[];for(const xs of tiers)xs.sort((a,b)=>Number(states[b].cursor>0)-Number(states[a].cursor>0));for(let i=0;tiers.some(xs=>i<xs.length);i++)for(const xs of tiers)if(xs[i])out.push(xs[i]);return out;});
pending.length=0;for(let i=0;levels.some(xs=>i<xs.length);i++)for(const xs of levels)if(xs[i])pending.push(xs[i]);
const t0=performance.now(),seconds=Number(arg("seconds","25")),limit=Number(arg("limit","2400")),timely=()=>m.attempts<limit&&performance.now()-t0<seconds*1000;
running=true;
let coldAt=0,hotAt=0,preferHot=false;
while((coldAt<pending.length||hotAt<hot.length)&&timely()){
 const takeHot=hotAt<hot.length&&(preferHot||coldAt>=pending.length),id=takeHot?hot[hotAt++]:pending[coldAt++];
 preferHot=!takeHot;m[takeHot?"hotTurns":"coldTurns"]++;
 const s=states[id];if(s.done)continue;
 try{
  const b=seed(s.seed),w=replayState(s,b),n={world:w,steps:s.actions};
  if(s.stateHash)assert.equal(exactWorld(w),s.stateHash);else s.stateHash=exactWorld(w);
  if(s.actions.length)rememberWorld(s.seed,s.actions,w);
  const grown=g.grow(n),choices=(byBody.get(member(w).state.soldierType)||[]).filter(r=>r.requires.every(k=>!b.r.avoid.includes(k)&&!w.disabled.has(k)));
  const moves=choices.flatMap(r=>grown===n?[{r,n,phase:"pre"}]:[{r,n,phase:"pre"},{r,n:grown,phase:"post"}]);
  const sig=key(moves.map(x=>[x.r.id,x.phase]));if(s.signature)assert.equal(s.signature,sig);s.signature=sig;
  const stop=Math.min(moves.length,s.cursor+quantum);
  for(;s.cursor<stop&&timely();s.cursor++){
   const {r,n:c,phase}=moves[s.cursor];m.attempts++;m[phase+"GrowthAttempts"]++;
   try{
    if(!probe(c,r)){m.probeRejected++;continue;}
    const needs=r.requires.some(k=>!g.active(c.world,k));let planned=c;
    if(needs){m.researchAttempts++;planned=plan(b,c,r);if(!planned){m.researchFailed++;continue;}}
    const x=g.transform(planned,r);if(!x){m.rejected++;continue;}if(needs)m.researchSuccess++;
    const full=[...b.root.actions,...b.birth,...x.steps];
    if(full.length>1800||!b.r.commit.every(k=>g.active(x.world,k))){m.contextRejected++;continue;}
    const ctx=auditOriginCampaignContext(full,data),allowed=ctx.allowedDifficulties.filter(k=>s.allowedDifficulties.includes(k));
    if(ctx.kind!=="compatible"||!allowed.length){m.contextRejected++;continue;}
    const hash=exactWorld(x.world);if(hash===exactWorld(c.world)){m.noop++;continue;}
    m.success++;m[phase+"GrowthSuccess"]++;rememberWorld(s.seed,x.steps,x.world);enqueue(s.seed,x.steps,hash,allowed);
    const end=g.grow(x),f=finish(end.world,end.steps),v={origin:b.r.origin,branch:b.r.branch,...f};
    if(f.careerPolicy)m.rankMedalSuccess++;
    const isNewBody=!front.has(pk(v));if(!addFront(v)){m.unchanged++;continue;}
    const id="POPNEWCAREER12:"+key([s.seed,end.steps]).slice(0,24);
    const fullEnd=[...b.root.actions,...b.birth,...end.steps];
    routes[id]={seed:s.seed,seedActionHash:b.r.fullActionHash,origin:b.r.origin,branch:b.r.branch,root:b.r.root,actions:end.steps,order:end.steps.filter(a=>a.type==="transform").map(a=>a.transform),fullActionHash:key(fullEnd),canonicalStateHash:exactWorld(end.world),allowedDifficulties:allowed,...f,actualGameCertified:false};
    m.newRoutes++;if(isNewBody)m.newBodyPairs++;
   }catch(e){m.errors++;s.lastError=String(e.message);}
  }
  if(s.cursor===moves.length){s.done=true;m.statesExpanded++;}else if(timely()){hot.push(id);m.quantumYields++;}
 }catch(e){s.error=String(e.message);m.errors++;}
}
const values=Object.values(routes),summary={...m,registeredRoutes:values.length,coveredPairs:new Set(values.map(r=>r.origin+"|"+r.branch)).size,coveredPairBodies:new Set(values.map(pk)).size,seedCandidates:entry.published.length,processedSeedStates:Object.values(states).filter(s=>!s.actions.length&&s.done).length,states:Object.keys(states).length,pendingStates:Object.values(states).filter(s=>!s.done).length,maxTransforms:Math.max(0,...values.map(r=>r.order.length)),rankMedalRoutes:values.filter(r=>r.careerPolicy).length,promotionRoutes:values.filter(r=>r.actions.some(a=>a.type==="conditionalPromotion")).length,medalRoutes:values.filter(r=>r.actions.some(a=>a.type==="conditionalMedal")).length,elapsedSeconds:(performance.now()-t0)/1000,fullCompleted:0,actualGameCertified:0};
const result={kind:"POPULATION_NEW_PAIR_CAREER",schemaVersion:1,scheduler:3,careerPolicy:POLICY,rankDefaultBodies,sourceMetadataSha256:db.sourceMetadataSha256,routes,states,planTemplates,published:Object.keys(routes),summary,scope:"Conditional deterministic transformations with additional replayed research from registered minimum births; pre/post combat-cap growth, assumed rank and required medals; medal decoration excluded from permanent comparison; conditional resources; bounded batches, no global certification."};
fs.writeFileSync(out+".tmp",z.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(out+".tmp",out);console.log(JSON.stringify(summary));
