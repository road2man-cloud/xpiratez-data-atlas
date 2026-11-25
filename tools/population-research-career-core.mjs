// Shared chronological seed and research-prefix machinery. No research
// grants: the foundation planner emits original replayable game actions.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {serialize} from "node:v8";
import {createCareerReplay} from "./population-chronological-career-core.mjs";
import {birthActions,exactWorld,member,MODEL as GROWTH_MODEL} from "./population-growth-replay-core.mjs";
import {createExactPrefixCheckpointCache} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {applyTransformation} from "../public/soldiers/modern/eligibility.js";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
export const MODEL="CHRONOLOGICAL_RESEARCH_CAREER_GROWTH_V1";
export const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),sum=v=>v.reduce((n,x)=>n+x,0);
export const SOURCES=["originExtendedContinuation","originResearchContinuation","originResearchChain","populationGrowthReplay","populationChronologicalCareer"];
export const pairKey=r=>r.origin+"|"+r.branch+"|"+r.body;
export const dominates=(a,b)=>a.every((x,i)=>x>=b[i]);
export function sourceFingerprints(db){return Object.fromEntries(SOURCES.map(k=>[k,key(db[k].published.map(id=>[id,db[k].routes[id].fullActionHash,db[k].routes[id].canonicalStateHash]))]));}
export function baseline(db){
 const b=new Map();
 for(const l of SOURCES)for(const id of db[l].published){
  const r=db[l].routes[id],v=r.permanentCapVector||r.capVector||r.vector,k=pairKey(r);
  if(!v||!r.canonicalStateHash)continue;
  const xs=b.get(k)||[];if(!xs.some(x=>dominates(x,v)))b.set(k,[...xs.filter(x=>!dominates(v,x)),v]);
 }
 return b;
}
export function createResearchCareer(data,db,hashes){
 const replay=createCareerReplay(data),planner=createFoundationResearchPlanner(data,{maxAttempts:65,maxDepth:25,maxSteps:1800,methodLimit:16}),branches=new Map(db.branches.map(b=>[b.id,b]));
 const legacyHashes={...db.originExtendedContinuation.hashes,"tools/build-population-extended-continuation.mjs":"64fa7f15eee999512b0fc6a254b5fa8e2841e5f1ce460650783fc4bafd918f2c"};
 const diskBirth=createExactPrefixCheckpointCache(".population-extended-cache",key([db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,legacyHashes]));
 const diskGrowth=createExactPrefixCheckpointCache(".population-growth-replay-cache",key([GROWTH_MODEL,db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,hashes["tools/population-growth-replay-core.mjs"]]));
 const diskSeed=createExactPrefixCheckpointCache(".population-research-career-cache",key([MODEL,db.sourceMetadataSha256,hashes]));
 const births=new Map(),seeds=new Map(),plans=new Map(),byBody=new Map();
 const choices=new Set(db.branches.flatMap(b=>[...b.captain,...Object.values(b.choices||{})]).filter(Boolean));
 const metrics={birthHits:0,birthReplays:0,seedHits:0,seedReplays:0,planHits:0,planComputations:0,plannerAttempts:0};
 for(const r of data.transformations)if(r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE"))for(const body of r.allowedSoldierTypes||[]){
  const dest=replay.bodies.get(r.producedSoldierType||body);if(!dest||!deterministicRule(r,[dest]))continue;
  const xs=byBody.get(body)||[];xs.push(r);byBody.set(body,xs);
 }
 function load(l,id){
  if(seeds.has(id)){metrics.seedHits++;return seeds.get(id);}
  const r=db[l].routes[id],{p,steps}=birthActions(db,r),full=[...steps,...r.actions];
  assert.equal(key(steps),p.fullActionHash);assert.equal(key(full),r.fullActionHash);
  let w=diskSeed.load(full)?.world;
  if(w)metrics.seedHits++;else{
   let b=births.get(p.fullActionHash);
   if(b)metrics.birthHits++;else{
    const c=diskBirth.load(steps,p.stateHash)||diskGrowth.load(steps,p.stateHash);
    if(c){b=c.world;metrics.birthHits++;}else{b=replay.replay(steps);assert.equal(sha(serialize(b)),p.stateHash);metrics.birthReplays++;}
    births.set(p.fullActionHash,b);
   }
   w=replay.replay(r.actions,b);assert.equal(exactWorld(w),r.canonicalStateHash);metrics.seedReplays++;
   diskSeed.save({world:w,steps:full,trace:full.map((_,i)=>({index:i})),diagnostics:[]});
  }
  assert.equal(exactWorld(w),r.canonicalStateHash);
  const f=replay.finish(w);assert.deepEqual(f.raw,r.raw);assert.deepEqual(f.bonus,r.bonus);if(r.permanentVector)assert.deepEqual(f.permanentVector,r.permanentVector);
  const out={r,p,birth:steps,n:{world:w,steps:r.actions}};
  seeds.set(id,out);return out;
 }
 function policy(b,n){
  const branch=branches.get(b);assert(branch&&!branch.sourceRootConflict);
  const commit=[...branch.captain,...Object.values(branch.choices||{})].filter(Boolean),blocked=new Set(branch.blockedResearch||[]);
  const opposing=new Set([...choices].filter(k=>!commit.includes(k)&&!n.world.researched.has(k)));
  return {commit,blocked,opposing};
 }
 function targets(n,b){
  const {commit,blocked,opposing}=policy(b,n),active=k=>replay.active(n.world,k);
  return (byBody.get(member(n.world).state.soldierType)||[]).filter(r=>r.requires.some(k=>!active(k))&&r.requires.every(k=>!blocked.has(k)&&!opposing.has(k)&&!n.world.disabled.has(k))).sort((a,b)=>{
   const cost=r=>r.requires.reduce((v,k)=>v+(active(k)?0:planner.distance.get(k)??1e8),0);
   return Number(Boolean(b.minRank||Object.keys(b.requiredCommendations||{}).length))-Number(Boolean(a.minRank||Object.keys(a.requiredCommendations||{}).length))||cost(a)-cost(b)||a.id.localeCompare(b.id);
  });
 }
 function probe(n,r){
  // A cheap feasibility filter only. The real research and transformation
  // are subsequently replayed; no fabricated researched state is registered.
  const q=replay.meet(n,r);if(!q)return false;
  const m=member(q.world);try{
   const x=applyTransformation(r,m.state,data,{mode:"current",researched:r.requires,disabled:[],baseFunctions:r.requiresBaseFunc||[],items:r.requiredItems||{},funds:Math.max(0,r.cost||0),commendations:m.commendations||{},statsKnown:true,medalsKnown:true});
   return x.verdict.kind==="eligible"&&x.state.exactStats&&!x.state.retired;
  }catch{return false;}
 }
 function plan(n,b,birth,r){
  const p=policy(b,n),goals=[...new Set([...p.commit,...r.requires])],before=exactWorld(n.world),k=key([before,goals,[...p.blocked].sort(),[...p.opposing].sort(),birth.length+n.steps.length]);
  let suffix=plans.get(k);
  if(suffix)metrics.planHits++;else{
   metrics.planComputations++;
   const start={world:n.world,steps:[...birth,...n.steps],trace:[],diagnostics:[]};
   const q=planner.ensure(goals,start);metrics.plannerAttempts+=q.attempts||0;
   if(!q.ok)return {ok:false,reason:q.reason||"RESEARCH_UNRESOLVED"};
   if(q.node.trace.some(z=>(z.added||[]).some(id=>p.blocked.has(id)||p.opposing.has(id))||(z.closed||[]).some(id=>p.commit.includes(id))))return {ok:false,reason:"BRANCH_CONFLICT"};
   suffix=q.node.steps.slice(start.steps.length);
   if(!suffix.length)return {ok:false,reason:"NO_NEW_RESEARCH_ACTION"};
   if(plans.size<10000)plans.set(k,suffix);
  }
  // Check every emitted step against the original verifier even on cache hit.
  let w=n.world;
  for(const a of suffix){
   const next=replay.apply(w,a);
   if([...next.researched].some(id=>!w.researched.has(id)&&(p.blocked.has(id)||p.opposing.has(id)))||p.commit.some(id=>w.researched.has(id)&&!w.disabled.has(id)&&next.disabled.has(id)))return {ok:false,reason:"BRANCH_CONFLICT_REPLAY"};
   w=next;
  }
  if(w.pendingFree||!goals.every(id=>replay.active(w,id)))return {ok:false,reason:"GOAL_INACTIVE"};
  const added=[...w.researched].filter(id=>replay.active(w,id)&&!replay.active(n.world,id));
  if(!added.length)return {ok:false,reason:"NO_NEW_ACTIVE_RESEARCH"};
  return {ok:true,n:{world:w,steps:[...n.steps,...suffix]},suffix,added};
 }
 function context(b,p,steps,w){
  const branch=branches.get(b),commit=[...branch.captain,...Object.values(branch.choices||{})].filter(Boolean),ctx=auditOriginCampaignContext(steps,data);
  if(branch.sourceRootConflict||ctx.kind!=="compatible"||!commit.every(k=>replay.active(w,k)))return [];
  return ctx.allowedDifficulties.filter(i=>p.allowedDifficulties.includes(i));
 }
 return {replay,load,targets,probe,plan,context,policy,byBody,metrics,planner};
}
