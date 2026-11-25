// Convert fixed numeric frontier plans into chronological conditional witnesses.
// Keep the legacy minimum-birth verifier unchanged. A maximum-birth numeric
// target is a proposal only, never a grant of stats or active research.
import assert from "node:assert/strict";
import {serialize} from "node:v8";
import {createResearchCareer,sha,key,sum,dominates,baseline} from "./population-research-career-core.mjs";
import {birthActions,exactWorld,member,MODEL as GROWTH_MODEL} from "./population-growth-replay-core.mjs";
import {createExactPrefixCheckpointCache} from "./origin-pair-exact-prefix-checkpoint.mjs";
export const MODEL="FRONTIER_GUIDED_MIN_BIRTH_CHRONOLOGY_V1";
export const LEDGER="populationFrontierChronology";
export const pairKey=r=>r.origin+"|"+r.branch+"|"+r.body;
export function birthCatalog(db){
 const result=[];
 for(const [pair,p] of Object.entries(db.originUnlockSearch.pairs))if(p.fullActionHash&&p.stateHash)result.push({input:"unlock:"+pair,kind:"unlock",pair,origin:p.origin,branch:p.branch,root:p.root});
 for(const [id,p] of Object.entries(db.originEventBirth.variants))if(p.fullActionHash&&p.stateHash)result.push({input:"event:"+id,kind:"event",pair:p.pair,origin:p.origin,branch:p.branch,root:p.root});
 return result;
}
export function sourceIdentity(db){
 return {frontier:db.populationCareerFrontier.identity,frontierSha256:db.populationCareerFrontier.sha256,
 assumedBirth:db.populationAssumedBirthClosure.pairMapHash,births:key(birthCatalog(db).map(r=>{const {p}=birthActions(db,r);return [r.input,p.fullActionHash,p.stateHash];})),
 baseline: key(["originExtendedContinuation","originResearchContinuation","originResearchChain","populationGrowthReplay","populationChronologicalCareer","populationResearchCareer"].map(k=>[k,(db[k]?.published||[]).map(id=>[id,db[k].routes[id].fullActionHash])]))};
}
export function chronologicalBaseline(db){
 const b=baseline(db);
 for(const r of Object.values(db.populationResearchCareer?.routes||{})){
  const v=r.permanentVector,k=pairKey(r),xs=b.get(k)||[];
  if(v&&!xs.some(x=>dominates(x,v)))b.set(k,[...xs.filter(x=>!dominates(v,x)),v]);
 }
 return b;
}
export function createBridge(data,db,hashes,{templates={},cache=true}={}){
 const engine=createResearchCareer(data,db,hashes,{templates}),{replay}=engine;
 const oldHashes={...db.originExtendedContinuation.hashes,"tools/build-population-extended-continuation.mjs":"64fa7f15eee999512b0fc6a254b5fa8e2841e5f1ce460650783fc4bafd918f2c"};
 const oldBirth=createExactPrefixCheckpointCache(".population-extended-cache",key([db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,oldHashes]),{enabled:cache});
 const growthBirth=createExactPrefixCheckpointCache(".population-growth-replay-cache",key([GROWTH_MODEL,db.sourceMetadataSha256,db.originUnlockSearch.fingerprint,db.originEventBirth.fingerprint,hashes["tools/population-growth-replay-core.mjs"]]),{enabled:cache});
 const disk=createExactPrefixCheckpointCache(".population-frontier-chronology-cache",key([MODEL,db.sourceMetadataSha256,hashes]),{enabled:cache});
 const births=new Map(),prefixes=new Map(),metrics={birthHits:0,birthReplays:0,prefixHits:0,prefixComputed:0,researchPlans:0,researchFailures:0,transformFailures:0,unsupportedRules:0,contextFailures:0,completed:0};
 const supported=new Set([...engine.byBody.values()].flat().map(r=>r.id));
 function loadBirth(r){
  if(births.has(r.input)){metrics.birthHits++;return births.get(r.input);}
  const {p,steps}=birthActions(db,r);assert.equal(key(steps),p.fullActionHash);
  let w=(disk.load(steps,p.stateHash)||oldBirth.load(steps,p.stateHash)||growthBirth.load(steps,p.stateHash))?.world;
  if(w)metrics.birthHits++;
  else{w=replay.replay(steps);assert.equal(sha(serialize(w)),p.stateHash);metrics.birthReplays++;
   disk.save({world:w,steps,trace:steps.map((_,index)=>({index})),diagnostics:[]},p.stateHash);}
  assert(member(w)?.state.exactStats);
  const out={p,birth:steps,n:{world:w,steps:[]}};births.set(r.input,out);return out;
 }
 function follow(r,group,f){
  const b=loadBirth(r),policy=engine.policy(r.branch,b.n);
  let n=b.n,at=0;
  // Exact within-birth action-prefix reuse; cache never crosses a birth
  // world or branch. Research planner templates are independently replayed.
  const prefix=[r.input,b.p.fullActionHash];
  for(const action of f.actions){
   prefix.push(action);const k=key(prefix);
   const cached=prefixes.get(k);
   if(cached){metrics.prefixHits++;if(!cached.ok)return {...cached,at};n=cached.n;at++;continue;}
   metrics.prefixComputed++;
   let error=null;
   try{
    if(action.kind==="CAP_TARGET")n=replay.grow(n);
    else if(action.kind==="ASSUMED_PROMOTION"){
     const rank=member(n.world).state.rank;
     if(rank<action.rank){
      assert.equal(action.rank,rank+1);
      n=replay.append(n,{type:"conditionalPromotion",soldier:"origin",rank:action.rank,assumption:true});
     }
    }else{
     assert.equal(action.kind,"TRANSFORM");const rule=replay.rules.get(action.id);
     if(!rule||!supported.has(rule.id)){metrics.unsupportedRules++;error="UNSUPPORTED_RANDOM_OR_RULE";}
     else if(!(engine.byBody.get(member(n.world).state.soldierType)||[]).some(x=>x.id===rule.id)){metrics.transformFailures++;error="BODY_GATE";}
     else{
      if(!rule.requires.every(id=>replay.active(n.world,id))){
       if(!engine.probe(n,rule)){metrics.transformFailures++;error="PRE_RESEARCH_NUMERIC_GATE";}
       else{metrics.researchPlans++;const q=engine.plan(n,r.branch,b.birth,rule);
        if(!q.ok){metrics.researchFailures++;error="RESEARCH_"+q.reason;}else n=q.n;}
      }
      if(!error){const t=replay.transform(n,rule);if(!t){metrics.transformFailures++;error="TRANSFORM_GATE";}else n=t;}
     }
    }
    if(!error&&policy.commit.some(id=>replay.active(b.n.world,id)&&!replay.active(n.world,id)))error="BRANCH_COMMITMENT_LOST";
   }catch(e){error=String(e.message);}
   const outcome=error?{ok:false,reason:error}:{ok:true,n};
   if(prefixes.size<5000)prefixes.set(k,outcome);
   if(error)return {...outcome,at};
   at++;
  }
  const allowed=engine.context(r.branch,b.p,[...b.birth,...n.steps],n.world);
  if(!allowed.length){metrics.contextFailures++;return {ok:false,reason:"CONTEXT_REJECTED",at};}
  const end=replay.finish(n.world);
  if(end.body!==f.body){metrics.transformFailures++;return {ok:false,reason:"TERMINAL_BODY_MISMATCH",at};}
  metrics.completed++;
  const route={...r,sourceGroup:group,sourceRoute:f.id,sourceActionHash:key(f.actions),sourcePermanentVector:f.permanentVector,
   birthActionHash:b.p.fullActionHash,birthStateHash:b.p.stateHash,actions:n.steps,order:n.steps.filter(a=>a.type==="transform").map(a=>a.transform),
   addedResearch:[...n.world.researched].filter(id=>replay.active(n.world,id)&&!replay.active(b.n.world,id)),allowedDifficulties:allowed,
   fullActionHash:key([...b.birth,...n.steps]),canonicalStateHash:exactWorld(n.world),...end,
   numericExactMatch:JSON.stringify(end.permanentVector)===JSON.stringify(f.permanentVector),actualGameCertified:false};
  return {ok:true,route,at};
 }
 return {engine,replay,loadBirth,follow,metrics,templates:engine.templates,supported};
}
