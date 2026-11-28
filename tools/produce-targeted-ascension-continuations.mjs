// Targeted conditional continuation producer; does not mutate the shared ledger.
// Use an exact registered route as the prefix. All suffixes use the existing
// replay engine and pass branch, campaign-difficulty, and finite-input checks.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {gunzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createSharedCareerReplay} from "./population-shared-lifecycle-replay.mjs";
import {createBranchConstrainedPlanner} from "./population-branch-constrained-planner-v6-corridor.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
import {createResearchMaterialPolicy} from "./atlas-research-material-policy.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {createStatGainGatePreparation,statGain} from "./population-stat-gain-gate-preparation.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const read=p=>JSON.parse(fs.readFileSync(p));
const decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const ledger=decode("public/data/soldier-population-missing-origin-career.json.gz");
const db=decode("public/data/branch-soldier-results.json.gz");
const data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;
data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.source.metadataSha256,ledger.sourceMetadataSha256);
assert.equal(ledger.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(key(ledger.graphs),ledger.sourceGraphSha256);
const rp=createSharedCareerReplay(data,ledger.summary),materials=createResearchMaterialPolicy(data);
const medalPrep=createStatGainGatePreparation(data,rp);
const body=arg("body","STR_SOLDIER_HERO");
const targets=arg("targets","STR_HERO_RED_TRAINING,STR_HERO_GREEN_TRAINING,STR_HERO_GOLD_TRAINING,STR_PARIAH_TRAINING").split(",").filter(Boolean);
const helpers=arg("helpers","STR_PROUD_WARRIOR,STR_PARIAH_TRAINING,STR_HOLY_WARRIOR_TRAINING,STR_BREAD_AND_FISHES_TRAINING,STR_GREEN_BEAUTY,STR_UBERIZATION,STR_JUDICAL_EDUCATION,STR_CAPTAINS_11,STR_OFFICER_TRAINING,STR_BRIDES_TO_THE_QUEEN,STR_PERSONAL_ATTENTION,STR_SUN_WARRIORS_TRAINING,STR_BOOT_CAMP_TRAINING,STR_SCHOOL_OF_HARD_KNOCKS").split(",").filter(Boolean);
const out=arg("out","docs/career-batches/hero-targeted-continuations.json");
const seconds=Number(arg("seconds","40")),maxSeeds=Number(arg("max-seeds","18")),maxPlans=Number(arg("max-plans","6"));
assert(seconds>0&&seconds<=180&&Number.isInteger(maxSeeds)&&maxSeeds>0&&maxSeeds<=200&&Number.isInteger(maxPlans)&&maxPlans>=0&&maxPlans<=30);
assert(!fs.existsSync(out),"Refuse to overwrite an existing production receipt");
for(const k of [...targets,...helpers])assert(rp.rules.has(k),"Unknown rule: "+k);
const start=performance.now(),deadline=start+seconds*1000;
const commit=b=>[...(b.captain||[]),...Object.values(b.choices||{})].filter(Boolean);
const branches=new Map(db.branches.map(b=>[b.id,b]));
const allChoice=new Set(db.branches.flatMap(commit));
const active=(w,k)=>rp.active(w,k);
const forbidden=b=>new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!commit(b).includes(k))]);
const exactPath=(g,i)=>{const a=[];while(i){assert(g.nodes[i]);a.push(g.nodes[i].steps);i=g.nodes[i].parent;}return a.reverse().flat();};
const valid=(g,b,full,w,suffix,i)=>{
  assert(!w.pendingFree&&member(w)?.state.exactStats&&!member(w).state.retired);
  assert(commit(b).every(k=>active(w,k)),"Branch commitment lost");
  assert(![...w.researched].some(k=>forbidden(b).has(k)),"Branch conflict");
  materials.check(g,i,suffix);
  const ctx=auditOriginCampaignContext(full,data);
  assert.equal(ctx.kind,"compatible");
  const allowed=ctx.allowedDifficulties.filter(k=>g.allowedDifficulties.includes(k));
  assert(allowed.length,"No compatible difficulty");
  return allowed;
};
const hasRule=(w,k)=>member(w).state.history.has(k);
const ruleGoals=r=>(r.requires||[]).filter(k=>k!=="STR_UNAVAILABLE");
const vectorGap=(v,r)=>STAT_KEYS.reduce((s,k,i)=>s+Math.max(0,Number(r.requiredMinStats?.[k]||0)-v[i]),0);
const routes=Object.entries(ledger.routes).filter(([,r])=>r.body===body);
const jobs=[];
for(const [id,r] of routes){
  const g=ledger.graphs[r.sourceGraph],n=g?.nodes[r.sourceNode],b=branches.get(r.branch);
  if(!g||!n||!b||b.sourceRootConflict||!db.populationMissingOriginCareer?.routes?.[id])continue;
  const suffix=exactPath(g,r.sourceNode),full=[...g.birthActions,...suffix];
  assert.equal(key(full),r.fullActionHash);
  const seenResearch=new Set(full.filter(a=>["research","repeatResearch","freeResearch","eventResearch","missionResearch"].includes(a.type)).map(a=>a.research||a.id));
  for(const id2 of targets){
    const rule=rp.rules.get(id2);
    if(!rule.allowedSoldierTypes?.includes(body)||ruleGoals(rule).some(k=>forbidden(b).has(k))||r.order.includes(id2))continue;
    jobs.push({id,r,g,n,b,full,target:id2,missingHint:ruleGoals(rule).filter(k=>!seenResearch.has(k)).length,gap:vectorGap(n.permanentVector,rule)});
  }
}
jobs.sort((a,b)=>a.missingHint-b.missingHint||a.gap-b.gap||b.n.traits.length-a.n.traits.length||a.full.length-b.full.length||a.id.localeCompare(b.id)||a.target.localeCompare(b.target));
const seeds=[],seenSeeds=new Set(),seenGroups=new Set();
const diverse=[],rest=[];
for(const j of jobs){const k=key([j.target,j.b.id]);if(seenGroups.has(k))rest.push(j);else{seenGroups.add(k);diverse.push(j);}}
for(const j of [...diverse,...rest]){
  // At most one candidate per exact state/target; distinct research histories
  // retain distinct exact hashes and are not removed from the source ledger.
  const k=key([j.r.canonicalStateHash,j.target]);
  if(seenSeeds.has(k))continue;
  seenSeeds.add(k);seeds.push(j);
  if(seeds.length>=maxSeeds)break;
}
const receipt={schema:"TARGETED_CONDITIONAL_TRANSFORMATION_CONTINUATIONS_V1",sourceMetadataSha256:ledger.sourceMetadataSha256,sourceGraphSha256:ledger.sourceGraphSha256,sourceLedgerFingerprint:ledger.fingerprint,body,targets,helpers,sourceRoutes:routes.length,candidateJobs:jobs.length,selectedSeeds:seeds.length,attempts:[],produced:[],partial:[],actualGameCertified:false,registered:false,finalAdmission:false};
const cache=new Map();
function load(j){
  const k=j.r.sourceGraph+":"+j.r.sourceNode;
  if(cache.has(k))return cache.get(k);
  const w=rp.replay(j.full);assert.equal(exactWorld(w),j.r.canonicalStateHash);
  assert.deepEqual(rp.finish(w).permanentVector,j.n.permanentVector);
  if(cache.size>=4)cache.delete(cache.keys().next().value);cache.set(k,w);return w;
}
const planners=new Map();
let plans=0;
function propose(j,w,rule){
  if(ruleGoals(rule).every(k=>active(w,k)))return {world:w,steps:[]};
  if(plans>=maxPlans||performance.now()>=deadline)return null;
  plans++;
  const d=j.full[0]?.type==="campaignContext"?j.full[0].difficulty:null;
  const k=key([j.b.id,d]);
  let p=planners.get(k);
  if(!p){p=createBranchConstrainedPlanner(data,{maxAttempts:180,maxDepth:Infinity,maxSteps:Infinity,methodLimit:60,collectFailures:true,difficulty:d,planningDifficulty:d,forbiddenResearch:[...forbidden(j.b)],preserveResearch:commit(j.b)});planners.set(k,p);}
  const accept=(_,z)=>{try{
    const suffix=z.steps.slice(j.full.length),actual=rp.replay(suffix,w);
    assert.equal(exactWorld(actual),exactWorld(z.world));
    valid(j.g,j.b,[...j.full,...suffix],actual,suffix,j.r.sourceNode);return true;
  }catch{return false;}};
  const q=createStagedResearch({planner:p,active,accept,deadline:Math.min(deadline,performance.now()+4500),maxCalls:5,maxDepth:Infinity,variant:plans-1}).run({world:w,steps:j.full.slice(),trace:[],diagnostics:[]},ruleGoals(rule));
  const suffix=q.node.steps.slice(j.full.length);
  if(!suffix.length)return {world:w,steps:[],remaining:q.remaining,failures:q.failures};
  const result=rp.replay(suffix,w);
  valid(j.g,j.b,[...j.full,...suffix],result,suffix,j.r.sourceNode);
  return {world:result,steps:suffix,remaining:q.remaining,failures:q.failures};
}
const unique=new Set();
function save(j,w,suffix,kind,rec){
  if(!suffix.length)return;
  let actual=w;const medalActions=[];for(const a of suffix){if(a.type==="conditionalMedal")medalActions.push({medal:a.medal,level:a.level,statGain:statGain(member(actual).state),assumption:true});actual=rp.apply(actual,a);}assert(!actual.pendingFree);const after=rp.finish(actual);
  const allowed=valid(j.g,j.b,[...j.full,...suffix],actual,suffix,j.r.sourceNode);
  assert.equal(after.body,body,"Unexpected body change");
  const sig=key([j.id,suffix]);if(unique.has(sig))return;unique.add(sig);
  const evidence={sourceRoute:j.id,sourceGraph:j.r.sourceGraph,sourceNode:j.r.sourceNode,branch:j.r.branch,origin:j.r.origin,beforeStateHash:exactWorld(w),afterStateHash:exactWorld(actual),prefixActionHash:j.r.fullActionHash,fullActionHash:key([...j.full,...suffix]),target:j.target,allowedDifficulties:allowed,before:rp.finish(w).permanentVector,after:after.permanentVector,afterCap:after.permanentCapVector,medalActions,suffix,status:kind,remaining:rec.remaining||[],actualGameCertified:false};
  if(kind==="TARGET_TRANSFORM_REPLAYED"){assert(hasRule(actual,j.target)&&!hasRule(w,j.target));receipt.produced.push(evidence);}
  else receipt.partial.push(evidence);
}
function transform(w,rule,steps=[]){
  const base={world:w,steps};const direct=rp.transform(base,rule);if(direct)return direct;
  const bases=[base];try{const grown=rp.grow(base);if(grown.steps.length>steps.length){const q=rp.transform(grown,rule);if(q)return q;bases.push(grown);}}catch{}
  for(const b of bases)for(const c of medalPrep.candidates(b,rule)){const q=rp.transform(c,rule);if(q)return q;}
  return null;
}
for(const j of seeds){
  if(performance.now()>=deadline)break;
  const rec={route:j.id,target:j.target,hintMissing:j.missingHint,hintGap:j.gap,status:"UNRESOLVED",trials:[]};receipt.attempts.push(rec);
  try{
    const w=load(j),target=rp.rules.get(j.target);
    if(hasRule(w,j.target)){rec.status="ALREADY_APPLIED";continue;}
    rec.active=ruleGoals(target).every(k=>active(w,k));
    rec.gap=vectorGap(rp.finish(w).permanentVector,target);
    rec.actualGateVector=target.includeBonusesForMinStats?rp.finish(w).vector:rp.finish(w).raw;rec.statGain=statGain(member(w).state);
    let q=transform(w,target);
    if(q){save(j,w,q.steps,"TARGET_TRANSFORM_REPLAYED",rec);rec.status="TARGET_TRANSFORM_REPLAYED";continue;}
    // Prefer exact active support transformations; their projected improvement
    // is only used to select candidates, not to admit any result.
    const v=rp.finish(w).permanentVector;
    const gain=r=>STAT_KEYS.reduce((s,k,i)=>s+Math.min(Math.max(0,Number(target.requiredMinStats?.[k]||0)-v[i]),Math.max(0,Number(r.fixedEffectiveDelta?.[k]||0))),0);
    const support=helpers.filter(k=>k!==j.target&&!hasRule(w,k)).map(k=>rp.rules.get(k)).filter(r=>r.allowedSoldierTypes?.includes(body)&&!r.reset&&!r.producedSoldierType&&gain(r)>0&&!ruleGoals(r).some(k=>forbidden(j.b).has(k))).sort((a,b)=>Number(!ruleGoals(a).every(k=>active(w,k)))-Number(!ruleGoals(b).every(k=>active(w,k)))||gain(b)-gain(a)||a.id.localeCompare(b.id));
    for(const h of support){
      if(performance.now()>=deadline)break;
      let base={world:w,steps:[]};
      if(!ruleGoals(h).every(k=>active(w,k))){
        if(!rec.active||rec.gap>10)continue;
        const p=propose(j,w,h);
        if(!p)continue;
        if(p.remaining?.length){rec.trials.push({helper:h.id,remaining:p.remaining,failures:p.failures?.slice(-2)});save(j,w,p.steps,"PARTIAL_RESEARCH",p);continue;}
        base=p;
      }
      const b=transform(base.world,h,base.steps);
      if(!b)continue;
      const gap=vectorGap(rp.finish(b.world).permanentVector,target);
      rec.trials.push({helper:h.id,gap});
      if(gap>=rec.gap)continue;
      const next=transform(b.world,target,b.steps);
      if(next){save(j,w,next.steps,"TARGET_TRANSFORM_REPLAYED",rec);rec.status="TARGET_TRANSFORM_REPLAYED";break;}
      save(j,w,b.steps,"SUPPORT_TRANSFORM_REPLAYED",rec);
    }
    if(rec.status==="TARGET_TRANSFORM_REPLAYED")continue;
    if(!rec.active&&rec.gap===0){
      const p=propose(j,w,target);
      if(p){
        rec.trials.push({target:j.target,remaining:p.remaining,failures:p.failures?.slice(-2)});
        const next=transform(p.world,target,p.steps);
        if(next){save(j,w,next.steps,"TARGET_TRANSFORM_REPLAYED",rec);rec.status="TARGET_TRANSFORM_REPLAYED";continue;}
        save(j,w,p.steps,"PARTIAL_RESEARCH",p);
      }
    }
  }catch(e){rec.status="REJECTED";rec.error=String(e.message).slice(0,400);}
}
receipt.medalGatePolicy=medalPrep.policy;
receipt.planCalls=plans;
receipt.elapsedMs=Math.round(performance.now()-start);
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({sourceRoutes:receipt.sourceRoutes,candidateJobs:receipt.candidateJobs,selectedSeeds:receipt.selectedSeeds,attempts:receipt.attempts.length,produced:receipt.produced.length,partial:receipt.partial.length,planCalls:plans,elapsedMs:receipt.elapsedMs,out,results:receipt.produced.map(x=>({target:x.target,sourceRoute:x.sourceRoute,before:x.before,after:x.after})),errors:receipt.attempts.filter(x=>x.error).map(x=>x.error).slice(0,5)}));
