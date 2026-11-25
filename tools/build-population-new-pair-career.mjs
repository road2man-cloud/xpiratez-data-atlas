// Resumable deterministic continuation from newly acquired minimum births.
// Preserve pre-growth and post-growth paths, including non-improving states.
// Conditional model only: no global optimality, no numeric dominance pruning of work.
import fs from "node:fs";
import z from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {createGrowthReplay,exactWorld,member} from "./population-growth-replay-core.mjs";
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
const routes={...prior?.routes},states={...prior?.states},g=createGrowthReplay(data);
const planner=createFoundationResearchPlanner(data,{maxAttempts:90,maxDepth:30,maxSteps:1800,methodLimit:24});
const planTemplates={...prior?.planTemplates};
if(prior?.scheduler!==2)for(const s of Object.values(states)){s.cursor=0;s.done=false;delete s.signature;}
const rootCache=new Map(),seedCache=new Map(),byBody=new Map(),front=new Map(),pending=[],queued=new Set(),sum=v=>v.reduce((a,b)=>a+b,0),dom=(a,b)=>a.every((x,i)=>x>=b[i]);
const pk=r=>r.origin+"|"+r.branch+"|"+r.body;
function addFront(r){const k=pk(r),xs=front.get(k)||[];if(xs.some(v=>dom(v,r.vector)))return false;front.set(k,[...xs.filter(v=>!dom(r.vector,v)),r.vector]);return true;}
for(const r of Object.values(entry.routes))addFront(r);for(const r of Object.values(routes))addFront(r);
for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"))for(const b of r.allowedSoldierTypes||[]){const dest=g.bodies.get(r.producedSoldierType||b);if(!dest||!deterministicRule(r,[dest]))continue;const xs=byBody.get(b)||[];xs.push(r);byBody.set(b,xs);}
for(const xs of byBody.values())xs.sort((a,b)=>a.id.localeCompare(b.id));
const m={seedReplays:0,rootReplays:0,rootHits:0,statesExpanded:0,attempts:0,success:0,rejected:0,contextRejected:0,unchanged:0,newRoutes:0,newBodyPairs:0,preGrowthAttempts:0,preGrowthSuccess:0,postGrowthAttempts:0,postGrowthSuccess:0,errors:0,noop:0,researchAttempts:0,researchSuccess:0,researchFailed:0,probeRejected:0,templateHits:0,templateRejected:0,plannerCalls:0};
function probe(n,r){const m=member(n.world);try{const p=applyTransformation(r,m.state,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:m.commendations||{},statsKnown:true,medalsKnown:true});return p.verdict.kind==="eligible"&&p.state.exactStats&&!p.state.retired;}catch{return false;}}
function plan(b,n,r){
 const goals=[...new Set([...b.r.commit,...r.requires])],avoid=new Set(b.r.avoid),missing=r.requires.filter(k=>!g.active(n.world,k));if(!missing.length)return n;
 if(missing.some(k=>avoid.has(k)||n.world.disabled.has(k)))return null;
 const full=[...b.root.actions,...b.birth,...n.steps],tk=key(missing.slice().sort());
 function validate(suffix){try{if(!suffix.length||full.length+suffix.length>1800)return null;let w=n.world;for(const a of suffix){const next=g.apply(w,a);if([...next.researched].some(k=>!w.researched.has(k)&&avoid.has(k))||b.r.commit.some(k=>g.active(w,k)&&!g.active(next,k)))return null;w=next;}return !w.pendingFree&&goals.every(k=>g.active(w,k))?{world:w,steps:[...n.steps,...suffix]}:null;}catch{return null;}}
 for(const suffix of planTemplates[tk]||[]){const x=validate(suffix);if(x){m.templateHits++;return x;}m.templateRejected++;}
 m.plannerCalls++;const start={world:n.world,steps:full,trace:[],diagnostics:[]},q=planner.ensure(goals,start);if(!q.ok)return null;
 const suffix=q.node.steps.slice(full.length),x=validate(suffix);if(x){const old=planTemplates[tk]||[];if(!old.some(s=>key(s)===key(suffix)))planTemplates[tk]=[suffix,...old].slice(0,4);}return x;
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
 if(!states[id].done&&!queued.has(id)){pending.push(id);queued.add(id);}
}
for(const [id,s] of Object.entries(states))if(!s.done){pending.push(id);queued.add(id);}
for(const [id,r] of Object.entries(entry.routes))enqueue(id,[],null,r.allowedDifficulties);
// Initial seeds first, then round-robin deeper states; never starve new births.
pending.sort((a,b)=>states[a].actions.length-states[b].actions.length);
const t0=performance.now(),seconds=Number(arg("seconds","25")),limit=Number(arg("limit","2400")),timely=()=>m.attempts<limit&&performance.now()-t0<seconds*1000;
for(let i=0;i<pending.length&&timely();i++){
 const s=states[pending[i]];
 try{
  const b=seed(s.seed),w=g.replay(s.actions,b.world),n={world:w,steps:s.actions};
  if(s.stateHash)assert.equal(exactWorld(w),s.stateHash);else s.stateHash=exactWorld(w);
  const grown=g.grow(n),choices=(byBody.get(member(w).state.soldierType)||[]).filter(r=>r.requires.every(k=>!b.r.avoid.includes(k)&&!w.disabled.has(k)));
  const moves=choices.flatMap(r=>grown===n?[{r,n,phase:"pre"}]:[{r,n,phase:"pre"},{r,n:grown,phase:"post"}]);
  const sig=key(moves.map(x=>[x.r.id,x.phase]));if(s.signature)assert.equal(s.signature,sig);s.signature=sig;
  for(;s.cursor<moves.length&&timely();s.cursor++){
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
    m.success++;m[phase+"GrowthSuccess"]++;enqueue(s.seed,x.steps,hash,allowed);
    const end=g.grow(x),f=g.finish(end.world),v={origin:b.r.origin,branch:b.r.branch,...f};
    const isNewBody=!front.has(pk(v));if(!addFront(v)){m.unchanged++;continue;}
    const id="POPNEWCAREER12:"+key([s.seed,end.steps]).slice(0,24);
    const fullEnd=[...b.root.actions,...b.birth,...end.steps];
    routes[id]={seed:s.seed,seedActionHash:b.r.fullActionHash,origin:b.r.origin,branch:b.r.branch,root:b.r.root,actions:end.steps,order:end.steps.filter(a=>a.type==="transform").map(a=>a.transform),fullActionHash:key(fullEnd),canonicalStateHash:exactWorld(end.world),allowedDifficulties:allowed,...f,actualGameCertified:false};
    m.newRoutes++;if(isNewBody)m.newBodyPairs++;
   }catch(e){m.errors++;s.lastError=String(e.message);}
  }
  if(s.cursor===moves.length){s.done=true;m.statesExpanded++;}
 }catch(e){s.error=String(e.message);m.errors++;}
}
const values=Object.values(routes),summary={...m,registeredRoutes:values.length,coveredPairs:new Set(values.map(r=>r.origin+"|"+r.branch)).size,coveredPairBodies:new Set(values.map(pk)).size,seedCandidates:entry.published.length,processedSeedStates:Object.values(states).filter(s=>!s.actions.length&&s.done).length,states:Object.keys(states).length,pendingStates:Object.values(states).filter(s=>!s.done).length,maxTransforms:Math.max(0,...values.map(r=>r.order.length)),elapsedSeconds:(performance.now()-t0)/1000,fullCompleted:0,actualGameCertified:0};
const result={kind:"POPULATION_NEW_PAIR_CAREER",schemaVersion:1,scheduler:2,sourceMetadataSha256:db.sourceMetadataSha256,routes,states,planTemplates,published:Object.keys(routes),summary,scope:"Conditional deterministic transformations with additional replayed research from registered minimum births; pre/post combat-cap growth; conditional resources; bounded batches, no global certification."};
fs.writeFileSync(out+".tmp",z.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(out+".tmp",out);console.log(JSON.stringify(summary));
