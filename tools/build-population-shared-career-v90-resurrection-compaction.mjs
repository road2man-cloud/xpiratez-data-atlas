import {createClosedRecruitmentWave} from "./population-closed-recruitment-wave-v7-stage-snapshot.mjs";
import {createFinalSuccessorWave} from "./population-final-successor-wave-v13-goal-corridor.mjs";
// Coverage-first production for origins with no published chronological career.
// Reuse concrete pre-recruit prefixes; also try recruiting before branch
// commitments. A conditional birth is not a real campaign acquisition proof.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {key,sha,dominates,createResearchCareer} from "./population-research-career-core.mjs";
import {birthActions,exactWorld,member} from "./population-growth-replay-core.mjs";
import {birthCatalog} from "./population-frontier-chronology-core.mjs";
import {createBranchConstrainedPlanner} from "./population-branch-constrained-planner-v6-corridor.mjs";
import {runDifficultyForks} from "./population-terminal-difficulty-fork.mjs";
import {compactRepeatCareers} from "./population-repeat-career-compaction-v3-resurrection.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {ledgers,project} from "../public/branch-soldier-atlas-career-core.js";
import {hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {createSharedRecruitmentIndex} from "./population-shared-recruitment-research-v2.mjs";
import {loadSupplyRules} from "./atlas-terminal-supply-core-v2.mjs";
import {createTerminalSupplyFollowthrough} from "./population-terminal-supply-followthrough-v2.mjs";
import {incumbentsFromRegistry,createIncumbentScorer} from "./population-career-incumbents.mjs";
import {createCareerWorkPriority} from "./population-career-work-priority-v2.mjs";
import {createTerminalEventRecruitment} from "./population-terminal-event-recruitment.mjs";
import {createTerminalEventRecruitment as createRetainedVariantEventRecruitment} from "./population-terminal-event-recruitment-v2.mjs";
import {createTerminalRecruitmentExtension} from "./population-terminal-recruitment-extension-v2.mjs";
import {createTerminalBranchFork} from "./population-terminal-branch-fork-v5-deferred-repair.mjs";
import {createResearchMaterialPolicy} from "./atlas-research-material-policy.mjs";
import {createTerminalRecruitmentTransfer} from "./population-terminal-recruitment-transfer-v4.mjs";
import {createTerminalTargetScheduler} from "./population-terminal-research-targets-v8-lanes.mjs";
import {createBranchCoverageWave} from "./population-branch-coverage-wave-v3.mjs";
import {createTerminalCareerFrontier} from "./population-terminal-career-frontier-v2.mjs";
import {createTerminalResetRecovery} from "./population-terminal-reset-recovery-v2.mjs";
import {createTerminalActiveResearchIndex} from "./population-terminal-active-research-index-v2.mjs";
import {createCareerProductivity} from "./population-career-productivity.mjs";
import {createTerminalTraitChain} from "./population-terminal-trait-chain-v33-recipe.mjs";
import {createTraitRecipePriority} from "./population-trait-recipe-priority.mjs";
import {createFlatRollReplay,flatRollPolicy,flatRollEvidence} from "./population-shared-flat-roll.mjs";
import {createLifecycleReplay,lifecyclePolicy,lifecycleEvidence,verifyLifecycleEngineSource} from "./population-shared-lifecycle-replay.mjs";
import {sharedRankData,sharedRankPolicy,createSharedRankEvidence} from "./population-shared-default-rank.mjs";
import {createHighTraitPriority} from "./population-high-trait-priority-v2-rank.mjs";
import {createCompactContinuationPriority} from "./population-compact-continuation-priority-v2.mjs";
import {createTerminalHistoryIndex} from "./population-terminal-history-index.mjs";
import {createMaterialPriority} from "./population-career-material-priority-v2.mjs";
import {createCareerParetoSearch} from "./population-career-pareto-search-v7-rank.mjs";
import {researchPriority,followResearchTransform} from "./population-shared-research-followthrough.mjs";
import {createTraitFrontier} from "./population-shared-trait-frontier-v2.mjs";
import {createSharedPrefixReplay} from "./population-shared-prefix-replay-v3-benefit.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
import {traitSnapshot} from "./population-rank-trait-priority.mjs";
import {createConditionalResourceQuotient} from "./final-career-conditional-resource-quotient.mjs";
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const phase=name=>{if(process.argv.includes("--phase-log"))console.error(JSON.stringify({phase:name,elapsedMs:Math.round(performance.now())}));};
phase("registry load");
const db=hydrateResearchPaths(decode("public/data/branch-soldier-results.json.gz")),data=read("public/data/soldiers-modern-index.json");
data.originRows=read("public/data/soldier-acquisition-progression-20261102.json").rows;data.sourceItemIds=new Set(read("public/data/soldier-source-catalog.json").itemIds);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
// Producer-only exploration view. Public final rows are never used as
// terminal-goal coverage or as an intermediate pruning certificate.
if(db.careerCompletion?.finalCareerAdmission){
 const c=db.careerCompletion,e=c.researchLineExploration;
 assert(c.researchLineRows&&e?.summary,"Missing exploration archive");
 db.careerCompletion={...c,...e,rows:c.researchLineRows};
}
phase("registry ready");
const POLICY="COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V96_RESURRECTION_COMPACTION",file="public/data/soldier-population-missing-origin-career.json.gz";
const files=["tools/population-shared-lifecycle-replay.mjs","tools/population-research-donor-projection.mjs","tools/build-population-shared-career-v90-resurrection-compaction.mjs","tools/population-research-transaction-readiness.mjs","tools/population-research-fragments-v2-ready.mjs","tools/population-closed-recruitment-wave-v7-stage-snapshot.mjs","tools/atlas-first-successor-obligations.mjs","tools/population-final-successor-wave-v13-goal-corridor.mjs","tools/population-trait-recipe-priority.mjs","tools/population-shared-flat-roll.mjs","tools/population-shared-default-rank.mjs","tools/population-frontier-default-rank.mjs","tools/population-high-trait-priority-v2-rank.mjs","tools/population-template-replay-memo.mjs","tools/population-compact-continuation-priority-v2.mjs","tools/population-repeat-career-compaction-v2.mjs","tools/population-repeat-career-compaction-v3-resurrection.mjs","tools/population-terminal-difficulty-fork.mjs","public/branch-soldier-research-path-codec.js","tools/population-terminal-history-index.mjs","tools/population-career-productivity.mjs","tools/population-career-material-priority-v2.mjs","public/branch-soldier-material-frontier.js","tools/atlas-research-material-policy.mjs","public/items/acquisition-index.json","tools/population-career-pareto-search-v7-rank.mjs","tools/population-pareto-history-dag.mjs","tools/population-pareto-vector-cover.mjs","tools/population-terminal-branch-fork-v5-deferred-repair.mjs","tools/population-branch-coverage-wave-v3.mjs","tools/population-scalar-upper-bound.mjs","tools/population-career-incumbents.mjs","tools/population-career-work-priority-v2.mjs","tools/population-terminal-recruitment-transfer-v4.mjs","tools/population-terminal-recruitment-extension-v2.mjs","tools/population-terminal-event-recruitment.mjs","tools/population-terminal-event-recruitment-v2.mjs","public/soldiers/modern/event-chronology.js","public/data/soldier-acquisition-progression-20261102.json","tools/population-terminal-trait-chain-v33-recipe.mjs","tools/population-terminal-active-research-index-v2.mjs","tools/population-research-fragments.mjs","tools/population-terminal-reset-recovery-v2.mjs","tools/population-terminal-career-frontier-v2.mjs","tools/atlas-terminal-supply-core-v2.mjs","tools/population-terminal-supply-followthrough-v2.mjs","tools/population-terminal-research-targets-v8-lanes.mjs","tools/population-shared-research-followthrough.mjs","tools/population-shared-trait-frontier-v2.mjs","tools/population-shared-recruitment-research-v2.mjs","tools/population-shared-prefix-replay-v3-benefit.mjs","tools/population-branch-constrained-planner-v6-corridor.mjs","tools/population-recruitment-staged-research.mjs","tools/population-research-career-core.mjs","tools/population-chronological-career-core.mjs","tools/population-growth-replay-core.mjs","tools/final-career-conditional-resource-quotient.mjs","tools/final-career-repeat-quotient.mjs","public/soldiers/modern/foundation-research-planner.js","public/soldiers/modern/origin-witness.js","public/soldiers/modern/campaign-proof.js","public/soldiers/modern/origin-campaign-context.js","public/data/soldiers-modern-index.json"];
const fingerprint=key([POLICY,db.sourceMetadataSha256,files.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])]);
const prior=fs.existsSync(file)?decode(file):null;if(prior?.schema===POLICY)assert.equal(prior.fingerprint,fingerprint);else if(prior){assert.equal(prior.schema,"COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V95_GOAL_CORRIDOR");assert.equal(prior.sourceMetadataSha256,db.sourceMetadataSha256);const oldFiles=files.filter(p=>p!=="tools/population-repeat-career-compaction-v3-resurrection.mjs").map(p=>p.replace("build-population-shared-career-v90-resurrection-compaction.mjs","build-population-shared-career-v89-goal-corridor.mjs"));assert.equal(prior.fingerprint,key([prior.schema,db.sourceMetadataSha256,oldFiles.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])]));assert.equal(prior.sourceGraphSha256,key(prior.graphs));}
const migration=prior?.schema===POLICY?prior.migration:{from:prior?.fingerprint||null,births:Object.keys(prior?.graphs||{}).length,attempts:Object.keys(prior?.attempts||{}).length,parent:prior?.migration||null};
const defaultRankPolicy=sharedRankPolicy(data);
if(prior?.summary?.defaultRankPolicy)assert.deepEqual(prior.summary.defaultRankPolicy,defaultRankPolicy);
const rankEvidence=createSharedRankEvidence(data,defaultRankPolicy);
Object.assign(data,sharedRankData(data,defaultRankPolicy));
const materialPolicy=createResearchMaterialPolicy(data);
const profiles=new Map(data.profiles.map(p=>[p.id,p])),branches=new Map(db.branches.filter(b=>!b.sourceRootConflict&&b.historyCount).map(b=>[b.id,b]));
phase("ledger ready");
const existingRows=ledgers.filter(l=>l.key!=="missingbirth").flatMap(l=>project(l,decode("public/data/"+l.file+".json.gz"),db.sourceMetadataSha256).rows);
const existing=new Set(existingRows.map(r=>r.origin)),existingPairs=new Set([...existingRows,...Object.values(prior?.routes||{})].map(r=>r.origin+"|"+r.branch));
const targets=prior?.targets||data.profiles.filter(p=>!existing.has(p.id)).map(p=>p.id);
const graphs=prior?.graphs||{},attempts=prior?.attempts||{},templates=prior?.templates||{},careerResearch=prior?.careerResearch||{},stagedPrefixes=prior?.stagedPrefixes||{};
 // Published histories are immutable. Validate their original graph prefix
 // once per graph rather than reconstructing thousands of long route paths
 // on every batch. Only edge expansion is allowed on existing nodes.
 const immutablePrefix=(g,n)=>key({...g,nodes:g.nodes.slice(0,n).map(({edges,...node})=>node)});
 const retainedPrefixes=new Map(Object.entries(graphs).map(([id,g])=>[id,{length:g.nodes.length,hash:immutablePrefix(g,g.nodes.length)}]));
 if(prior){assert.equal(prior.sourceGraphSha256,key(graphs));assert.equal(Object.keys(prior.routes).length,Object.keys(prior.indexRoutes).length);}

phase("engine setup");
const {replay,byBody,plan,policy,context,metrics:engineMetrics}=createResearchCareer(data,db,db.populationFrontierChronology.cacheHashes||db.populationFrontierChronology.hashes,{templates});
phase("engine ready");
const randomPolicy=flatRollPolicy(data);
if(prior?.summary?.flatRollPolicy)assert.deepEqual(prior.summary.flatRollPolicy,randomPolicy);
Object.assign(replay,createFlatRollReplay(data,replay,randomPolicy));
verifyLifecycleEngineSource();
const revivalPolicy=lifecyclePolicy(data);
if(prior?.summary?.lifecyclePolicy)assert.deepEqual(prior.summary.lifecyclePolicy,revivalPolicy);
Object.assign(replay,createLifecycleReplay(data,replay,revivalPolicy));
const traitByBody=new Map([...byBody].map(([k,v])=>[k,[...v]]));
for(const r of data.transformations)if(replay.flatRollRules.has(r.id))for(const body of r.allowedSoldierTypes){const a=traitByBody.get(body)||[];a.push(r);traitByBody.set(body,a);}
const config={maxAttempts:320,maxDepth:Infinity,maxSteps:Infinity,methodLimit:100,collectFailures:true};
const fixedPlanners=new Map();let planner;
function selectPlanner(d,b,lane=d){
 const k=JSON.stringify([d??null,b.id,lane??null]);
 if(!fixedPlanners.has(k)){
  if(fixedPlanners.size>=12)fixedPlanners.delete(fixedPlanners.keys().next().value);
  const c=commit(b),forbidden=[...new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!c.includes(k))])];
  fixedPlanners.set(k,createBranchConstrainedPlanner(data,{...config,difficulty:d??null,planningDifficulty:lane??null,forbiddenResearch:forbidden,preserveResearch:c}));
 }
 return fixedPlanners.get(k);
}
const quotient=createConditionalResourceQuotient(data),active=(w,k)=>replay.active(w,k),commit=b=>[...b.captain,...Object.values(b.choices||{})].filter(Boolean);
const allChoice=new Set(db.branches.flatMap(commit));
const prefixes=new Map(),prefixPool=[],donors=new Map();
function recordDonor(id,origin){if(!profiles.has(origin))return;const set=donors.get(id)||new Set();set.add(origin);donors.set(id,set); }
function addPrefix(branch,actions,source,donor=source.origin){
 if(!branches.has(branch)||!Array.isArray(actions)||actions.some(a=>a.type==="recruit"&&a.soldier==="origin"))return;
 const id=key([branch,actions]);recordDonor(id,donor);if(prefixes.has(id))return;
 const p={id,branch,actions,source,topics:new Set(actions.flatMap(a=>[a.id,a.research].filter(Boolean)))};prefixes.set(id,p);prefixPool.push(p);
}
for(const [id,r] of Object.entries(db.populationNewPairEntry.roots)){const b=db.branches.find(x=>x.rank===r.rank);if(b)addPrefix(b.id,r.actions,{kind:"retainedRoot",id});}
for(const b of birthCatalog(db)){
 const {steps}=birthActions(db,b);const i=steps.findIndex(a=>a.type==="recruit"&&a.soldier==="origin");
 if(i>=0)addPrefix(b.branch,steps.slice(0,i),{kind:"preBirth",id:b.input},b.origin);
}
// Also use early prefixes before the original retained root advances months.
const rootBranches=new Map();
for(const p of prefixPool){const a=rootBranches.get(p.branch)||[];a.push(p);rootBranches.set(p.branch,a);}
for(const [bid,a] of rootBranches){
 a.sort((x,y)=>x.actions.length-y.actions.length);
 addPrefix(bid,[],{kind:"foundation",id:bid});
 const root=a[0],wait=root.actions.findIndex(x=>x.type==="advanceMonth"&&x.month>0);
 if(wait>0)addPrefix(bid,root.actions.slice(0,wait),{kind:"earlyPrefix",id:root.id});
}
// Reuse path-neutral action prefixes to create concrete proposals for the previously
// unrepresented CAT path; the changed choice itself must be researched.
const pathChoices=new Set([...branches.values()].map(b=>b.choices.path));
for(const b of branches.values())if(b.choices.path==="STR_CAT_PATH_PREQ"){
 const pool=prefixPool.filter(p=>{const x=branches.get(p.branch);return x.choices.path!==b.choices.path&&JSON.stringify(x.captain)===JSON.stringify(b.captain)&&x.choices.codex===b.choices.codex&&x.choices.queen===b.choices.queen&&x.choices.cause===b.choices.cause;});
 const pp=pool.map(p=>({p,i:p.actions.findIndex(a=>a.type==="research"&&pathChoices.has(a.id))})).filter(x=>x.i>0).sort((a,z)=>a.i-z.i||a.p.actions.length-z.p.actions.length)[0];if(pp)addPrefix(b.id,pp.p.actions.slice(0,pp.i),{kind:"repath",id:pp.p.id});
}
phase("catalog prefixes ready");
// Restore only prefixes that match the original stored hash. V4/V5
// accidentally shared the planner's mutable steps array with later recruitment.
const repairedStages=prior?.repairedStages||{};
for(const [id,p] of Object.entries(stagedPrefixes)){
 if(key([p.branch,p.actions])!==id){
  const at=p.actions.findIndex(a=>a.type==="recruit"&&a.soldier==="origin");
  let match=null;if(at>=0)for(let i=at;i>=0;i--){const a=p.actions.slice(0,i);if(key([p.branch,a])===id){match=a;break;}}
  if(!match)continue;
  const w=replay.replay(match);assert(!member(w));const actual=[...w.researched].filter(k=>active(w,k)).sort();assert.deepEqual(actual,p.active);
  repairedStages[id]={originalActionHash:key(p.actions),originalLength:p.actions.length,restoredLength:match.length};
  stagedPrefixes[id]={...p,actions:match};
 }
}
for(const [id,p] of Object.entries(stagedPrefixes))if(key([p.branch,p.actions])===id)addPrefix(p.branch,p.actions,p.source);
phase("staged prefixes ready");
const deferBirthPrefixReplay=arg("attempts","80")==="0"&&arg("coverage-births","4")==="0"&&arg("shared-scan","96")==="0";
// A successful birth is also a reusable research prefix, independently
// reconstruct the active set at its actual recruitment boundary.
for(const [gid,g] of Object.entries(graphs)){
 const actions=g.birthActions.slice(0,g.birthAt),id=key([g.branch,actions]);recordDonor(id,g.origin);if(stagedPrefixes[id])continue;
 // A closed-recruitment-only batch consumes donor histories directly. Do
 // not replay every unrelated pre-birth history merely to build unused
 // staged-research indices. The original prefix is preserved as a proposal.
 if(deferBirthPrefixReplay){addPrefix(g.branch,actions,{kind:"retainedBirthPrefix",id:gid,origin:g.origin});continue;}
 try{
  const w=replay.replay(actions);if(member(w)||w.pendingFree)continue;
  const source={kind:"stagedResearch",id:gid,origin:g.origin,achieved:profiles.get(g.origin).requires,remaining:[],completed:[]};
  stagedPrefixes[id]={branch:g.branch,actions,source,active:[...w.researched].filter(k=>active(w,k)).sort(),month:w.month};
  addPrefix(g.branch,actions,source);
 }catch{}
}
phase("birth prefixes ready");
const round={followAttempts:0,followApplied:0,followExisting:0,followNew:0,followBodyChanges:0,deferredChortEdges:0,chainExpanded:0,sharedAttempts:0,sharedBirths:0,attempts:0,births:0,earlyBirths:0,directBirths:0,unresolved:0,expanded:0,states:0,aliases:0,researchAttempts:0,researchSuccess:0,stageCalls:0,stageAccepted:0,newStages:0,repathPrefixes:prefixPool.filter(p=>p.source.kind==="repath").length,errors:[]};
const cache=new Map(),prefixCache=new Map(),seen=new Map(),birthReplay=createSharedPrefixReplay(replay,{limit:40});
function remember(k,v){cache.delete(k);cache.set(k,v);if(cache.size>160)cache.delete(cache.keys().next().value);return v;}
function loadPrefix(p){
 if(prefixCache.has(p.id))return planner.clone(prefixCache.get(p.id));
 const n=planner.newNode();for(const [i,a] of p.actions.entries()){if(i===0&&a.type==="campaignContext"&&n.steps[0]?.type==="campaignContext"){assert.equal(a.difficulty,n.steps[0].difficulty);continue;}planner.append(n,a);}
 assert(!n.world.pendingFree&&!member(n.world));
 if(prefixCache.size>=40)prefixCache.delete(prefixCache.keys().next().value);prefixCache.set(p.id,n);return planner.clone(n);
}
function branchOkay(n,b,{requireCommit=true,oldTrace=0}={}){
 const c=commit(b),avoid=new Set(b.blockedResearch||[]);
 if(n.trace.some(t=>(t.added||[]).some(k=>avoid.has(k))))return false;
 if(n.trace.slice(oldTrace).some(t=>(t.added||[]).some(k=>allChoice.has(k)&&!c.includes(k))))return false;
 return !requireCommit||c.every(k=>active(n.world,k));
}
function ensure(n,goals,b){
 if(goals.every(k=>active(n.world,k)))return n;
 const r=planner.ensure(goals,n);
 if(!r.ok){const error=Error(r.reason||"RESEARCH_UNRESOLVED");error.deadEnds=r.deadEnds?.slice(0,8);throw error;}
 if(!branchOkay(r.node,b,{requireCommit:false,oldTrace:n.trace.length})||!goals.every(k=>active(r.node.world,k)))throw Error("BRANCH_CONFLICT");
 return r.node;
}
function staged(n,goals,b,prefix,p,variant){
 const start=n,keep=commit(b).filter(k=>active(n.world,k));
 const st=createStagedResearch({planner,active,accept:(a,z)=>branchOkay(z,b,{requireCommit:false,oldTrace:a.trace.length})&&keep.every(k=>active(z.world,k))&&goals.filter(k=>active(a.world,k)).every(k=>active(z.world,k))&&auditOriginCampaignContext(z.steps,data).kind==="compatible",maxCalls:stageCalls,deadline:Math.min(startTime+maxSeconds*1000,performance.now()+stageSeconds*1000),variant});
 const q=st.run(n,goals);round.stageCalls+=q.stats.calls;round.stageAccepted+=q.stats.accepted;
 if(q.node.steps.length>start.steps.length&&!member(q.node.world)){
  const id=key([b.id,q.node.steps]);
  if(!stagedPrefixes[id]){
   const source={kind:"stagedResearch",id:prefix.id,origin:p.id,achieved:q.achieved,remaining:q.remaining,completed:q.completed};
   stagedPrefixes[id]={branch:b.id,actions:structuredClone(q.node.steps),source,active:[...q.node.world.researched].filter(k=>active(q.node.world,k)).sort(),month:q.node.world.month};
   round.newStages++;
  }
 }
 if(!q.complete){const e=Error("STAGED_RESEARCH_UNRESOLVED");e.deadEnds=q.failures.slice(-5);e.stage={achieved:q.achieved,remaining:q.remaining,completed:q.completed};throw e;}
 return q.node;
}
function register(p,b,prefix,n,birthAt,mode,checkedPrefix=false){
 const ctx=auditOriginCampaignContext(n.steps,data);assert.equal(ctx.kind,"compatible");assert(ctx.allowedDifficulties.length);
 const w=checkedPrefix?n.world:replay.replay(n.steps);assert.equal(exactWorld(w),exactWorld(n.world));assert(member(w)?.state.exactStats&&member(w).state.soldierType===p.soldierType);
 assert(commit(b).every(k=>active(w,k)));const id=key([p.id,b.id,n.steps]);
 if(graphs[id])return id;
 const g={origin:p.id,branch:b.id,birthAt,birthMonth:n.birthMonth??null,mode,prefixSource:prefix.source,prefixHash:prefix.id,birthActions:n.steps,rootStateHash:exactWorld(w),allowedDifficulties:ctx.allowedDifficulties,nodes:[],cursor:0};
 materialPolicy.check(g,null,[]);graphs[id]=g;insert(id,g,w,null,null,[]);round.births++;round.earlyBirths+=Number(mode==="EARLY_BIRTH");round.directBirths+=Number(mode==="DIRECT_ACTIVE");return id;
}
function tryBirth(p,prefix,mode){
 const b=branches.get(prefix.branch),id=key([p.id,prefix.id,mode]);round.attempts++;
 try{
  planner=selectPlanner(prefix.actions[0]?.type==="campaignContext"?prefix.actions[0].difficulty:null,b);
  let n=loadPrefix(prefix);assert(branchOkay(n,b,{requireCommit:false,oldTrace:n.trace.length}));
  const early=mode.includes("EARLY"),goals=early?p.requires:[...new Set([...commit(b),...p.requires])];
  n=mode.startsWith("STAGED")?staged(n,goals,b,prefix,p,mode.endsWith("ALT")?1:0):ensure(n,goals,b);assert(p.requires.every(k=>active(n.world,k)));
  if(!early)assert(commit(b).every(k=>active(n.world,k)));
  const direct=p.requires.every(k=>active(loadPrefix(prefix).world,k))&&commit(b).every(k=>active(loadPrefix(prefix).world,k));
  planner.supply(n,{items:p.acquisitionRequiredItems||{},functions:p.requiresBaseFunc||[],funds:Math.max(0,p.cost||0)},"Conditional recruitment inputs "+p.id);
  const birthAt=n.steps.length,birthMonth=n.world.month;
  planner.append(n,{type:"recruit",soldier:"origin",profile:p.id,band:"min"});
  assert(member(n.world)?.state.exactStats&&member(n.world).state.soldierType===p.soldierType);
  if(early)n=mode.startsWith("STAGED")?staged(n,commit(b),b,prefix,p,mode.endsWith("ALT")?1:0):ensure(n,commit(b),b);
  assert(branchOkay(n,b,{oldTrace:n.trace.length}));
  n.birthMonth=birthMonth;
  const gid=register(p,b,prefix,n,birthAt,early?"EARLY_BIRTH":direct?"DIRECT_ACTIVE":"RESEARCH_THEN_BIRTH");
  attempts[id]={origin:p.id,branch:b.id,prefix:prefix.id,mode,status:"CONDITIONAL_REPLAY",graph:gid};
 }catch(e){round.unresolved++;attempts[id]={origin:p.id,branch:b.id,prefix:prefix.id,mode,status:"LIMITED_UNRESOLVED",reason:String(e.message),deadEnds:e.deadEnds||[],...(e.stage?{stage:e.stage}:{})};}
}
const researchIdentityCache=new WeakMap(),researchIdentityKinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
function researchIdentity(g,i){
 let cache=researchIdentityCache.get(g);if(!cache){cache=new Map();researchIdentityCache.set(g,cache);}
 if(cache.has(i))return cache.get(i);
 const todo=[];let j=i;while(j!==null&&!cache.has(j)){todo.push(j);j=g.nodes[j].parent;}
 let h=j===null?key([]):cache.get(j);
 for(const x of todo.reverse()){for(const a of x===0?g.birthActions:g.nodes[x].steps)if(researchIdentityKinds.has(a.type))h=key([h,a]);cache.set(x,h);}
 return h;
}
function insert(id,g,w,parent,action,steps,exact=false){
 const mstate=parent===null?materialPolicy.extend(materialPolicy.empty(),g.birthActions):materialPolicy.check(g,parent,steps);
 let rh=parent===null?key([]):researchIdentity(g,parent);
 for(const a of parent===null?g.birthActions:steps)if(researchIdentityKinds.has(a.type))rh=key([rh,a]);
 const stateHash=exactWorld(w),projection="EXACT_HISTORY_MATERIAL:"+key([stateHash,rh,mstate]);let m=seen.get(id);if(!m){m=new Map(g.nodes.map((n,i)=>[n.projection,i]));seen.set(id,m);}
 if(m.has(projection)){round.aliases++;return {status:"CONDITIONAL_ALIAS",to:m.get(projection),stateHash,steps,researchTimingUnresolved:true};}
 const i=g.nodes.length;m.set(projection,i);g.nodes.push({parent,action,steps,stateHash,projection,...replay.finish(w),traits:traitSnapshot(w),edges:null});remember(id+"|"+i,w);if(parent!==null)round.states++;
 return {status:"CONDITIONAL_REPLAY",to:i,stateHash,steps};
}
function loadNode(id,g,i){
 const k=id+"|"+i;if(cache.has(k))return remember(k,cache.get(k));
 const path=[];let j=i;while(j!==null&&!cache.has(id+"|"+j)){path.push(j);j=g.nodes[j].parent;}
 let w=j===null?birthReplay.load({id,actions:g.birthActions}):remember(id+"|"+j,cache.get(id+"|"+j));
 for(const a of path.reverse()){if(a)w=replay.replay(g.nodes[a].steps,w);assert.equal(exactWorld(w),g.nodes[a].stateHash);remember(id+"|"+a,w);}return w;
}
function stepsFor(g,i){const path=[];while(i){path.push(g.nodes[i].steps);i=g.nodes[i].parent;}return path.reverse().flat();}
function expand(id,g,i=g.cursor){
 const n=g.nodes[i];assert(!n.edges);const w=loadNode(id,g,i),edges=[],steps=stepsFor(g,i),p={allowedDifficulties:g.allowedDifficulties},b=branches.get(g.branch),base={world:w,steps};
 function offer(action,q){
  if(!q){edges.push({action,status:"UNRESOLVED_LOCAL_GATE"});return;}
  const allowed=context(g.branch,p,[...g.birthActions,...q.steps],q.world);
  if(!allowed.length){edges.push({action,status:"UNRESOLVED_CONTEXT"});return;}
  edges.push({action,...insert(id,g,q.world,i,action,q.steps.slice(steps.length))});
 }
 try{const q=replay.grow(base);if(q.steps.length>steps.length)offer("CAP_GROWTH",q);else edges.push({action:"CAP_GROWTH",status:"AT_CAP"});}catch(e){edges.push({action:"CAP_GROWTH",status:"UNRESOLVED_LOCAL_GATE",reason:String(e.message)});}
 // Continue through actually acquired research, preserving all numerical
 // and history gates. A missing research is an open obligation.
 for(const r of byBody.get(n.body)||[]){
  if(r.forbiddenSoldierTypes?.includes(n.body))continue;
  // The reset destination is a separate job, not a side effect of ordinary
  // expansion. Leave a durable open edge so later Chort work can resume it.
  if(n.body!=="STR_SOLDIER_CHORT"&&r.producedSoldierType==="STR_SOLDIER_CHORT"){edges.push({action:r.id,status:"DEFERRED_CHORT_CLASS"});round.deferredChortEdges++;continue;}
  if(!r.requires.every(k=>active(w,k))){edges.push({action:r.id,status:"INACTIVE_RESEARCH"});continue;}
  const s=member(w).state;if(r.requiredPreviousTransformations?.some(k=>!s.history.has(k))||r.forbiddenPreviousTransformations?.some(k=>s.history.has(k))){edges.push({action:r.id,status:"HISTORY_GATE"});continue;}
  try{offer(r.id,replay.transform(base,r));}catch(e){edges.push({action:r.id,status:"UNRESOLVED_LOCAL_GATE",reason:String(e.message)});}
 }
 n.edges=edges;while(g.cursor<g.nodes.length&&g.nodes[g.cursor].edges)g.cursor++;round.expanded++;
}
function nextResearch(){
 const candidates=[];
 for(const [id,g] of Object.entries(graphs))for(const [i,n] of g.nodes.entries()){
  for(const e of n.edges||[]){
   if(e.status!=="INACTIVE_RESEARCH"&&e.status!=="DEFERRED_CHORT_CLASS")continue;
   const k=key([id,i,e.action]);if(careerResearch[k])continue;
   const r=replay.rules.get(e.action);if(!r)continue;const b=branches.get(g.branch),c=commit(b);if(r.requires.some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!c.includes(k)))continue;
   // Favor permanent traits not present in the concrete state, then fair origin order.
   candidates.push({id,g,i,n,r,k,score:researchPriority(g,n,r,byBody)});
  }
 }
 const fair=round.researchAttempts%3===0;
 return workPriority.choose(candidates,(a,b)=>(fair?(researchTurns.get(a.g.origin)||0)-(researchTurns.get(b.g.origin)||0):0)||b.score-a.score||(researchTurns.get(a.g.origin)||0)-(researchTurns.get(b.g.origin)||0)||a.i-b.i||a.k.localeCompare(b.k));
}
const researchTurns=new Map();for(const r of Object.values(careerResearch))researchTurns.set(r.origin,(researchTurns.get(r.origin)||0)+1);
function expandResearch(t){
 const {id,g,i,n,r,k}=t;round.researchAttempts++;researchTurns.set(g.origin,(researchTurns.get(g.origin)||0)+1);
 const rec={origin:g.origin,branch:g.branch,graph:id,node:i,goal:r.requires,action:r.id};
 try{
  const w=loadNode(id,g,i),steps=stepsFor(g,i),base={world:w,steps};
  if(r.producedSoldierType==="STR_SOLDIER_CHORT"&&r.requires.every(k=>active(w,k))){
   careerResearch[k]={...rec,status:"CONDITIONAL_RESEARCH_REPLAY",to:i,stateHash:n.stateHash,alreadyActive:true};round.researchSuccess++;return;
  }
  const q=plan(base,g.branch,g.birthActions,r);if(!q.ok)throw Error(q.reason||"RESEARCH_UNRESOLVED");
  const allowed=context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...q.n.steps],q.n.world);
  if(!allowed.length)throw Error("UNRESOLVED_CONTEXT");
  assert(r.requires.every(k=>active(q.n.world,k)));
  const e=insert(id,g,q.n.world,i,"RESEARCH:"+r.id,q.n.steps.slice(steps.length),true);
  careerResearch[k]={...rec,status:"CONDITIONAL_RESEARCH_REPLAY",to:e.to,stateHash:e.stateHash};round.researchSuccess++;
 }catch(e){careerResearch[k]={...rec,status:"LIMITED_UNRESOLVED",reason:String(e.message)};}
}
const followThrough=prior?.followThrough||{},chainSeeds=new Map((prior?.chainSeeds||[]).map(t=>[t.id+"|"+t.node,t]));
function enqueue(id,node){if(Number.isInteger(node)&&graphs[id]?.nodes[node])chainSeeds.set(id+"|"+node,{id,node});}
function nextFollow(){
 const choices=Object.entries(careerResearch).filter(([k,r])=>!followThrough[k]&&r.status==="CONDITIONAL_RESEARCH_REPLAY"&&graphs[r.graph]?.nodes[r.to]&&replay.rules.has(r.action));
 return workPriority.choose(choices.map(entry=>({entry,g:graphs[entry[1].graph],n:graphs[entry[1].graph].nodes[entry[1].to],r:replay.rules.get(entry[1].action)})),(a,b)=>researchPriority(b.g,b.n,b.r,byBody)-researchPriority(a.g,a.n,a.r,byBody)||a.entry[1].graph.localeCompare(b.entry[1].graph)||a.entry[1].node-b.entry[1].node);
}
function runFollow(k,rec){
 round.followAttempts++;
 const id=rec.graph,g=graphs[id],r=replay.rules.get(rec.action);
 const outcomes=followResearchTransform({g,id,node:rec.to,r,replay,loadNode,stepsFor,insert,context});
 for(const e of outcomes){
  if(e.status==="CONDITIONAL_REPLAY"||e.status==="CONDITIONAL_ALIAS"||e.status==="EXISTING_REPLAY"){
   round.followApplied++;round.followNew+=Number(e.status==="CONDITIONAL_REPLAY");round.followExisting+=Number(e.status==="EXISTING_REPLAY");
   const n=g.nodes[e.to],p=g.nodes[e.parent];if(n&&p){round.followBodyChanges+=Number(n.body!==p.body);enqueue(id,e.to);}
  }
 }
 followThrough[k]={graph:id,action:rec.action,researchNode:rec.to,outcomes};
}
function nextChain(){
 const choices=[...chainSeeds.values()].filter(t=>{const g=graphs[t.id];return g&&!g.blocker&&g.nodes[t.node]&&!g.nodes[t.node].edges;});
 const score=t=>{const g=graphs[t.id],n=g.nodes[t.node];return n.traits.length*160+n.permanentVector.reduce((s,v)=>s+v,0)*.12+Number(n.body!==g.nodes[0].body)*40;};
 return workPriority.choose(choices.map(t=>({...t,g:graphs[t.id],n:graphs[t.id].nodes[t.node]})),(a,b)=>score(b)-score(a)||a.id.localeCompare(b.id)||a.node-b.node);
}
const maxFollow=Number(arg("follow","24")),maxChain=Number(arg("chain","80"));
const supplyIndex=loadSupplyRules(arg("game-root","C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez"),db.sourceMetadataSha256);
phase("initial indices ready");
const maxSeconds=Number(arg("seconds","25")),maxBirths=Number(arg("attempts","80")),maxNodes=Number(arg("nodes","200")),maxResearch=Number(arg("research","40")),stageSeconds=Number(arg("stage-seconds","3")),stageCalls=Number(arg("stage-calls","18")),staging=process.argv.includes("--stage"),start=performance.now(),startTime=start;
// Difficulty-specific proposals are new histories; do not reinterpret a failed
// mixed-difficulty plan as proof of impossible recruitment.
const originalPool=[...prefixPool];for(const p of originalPool.filter(p=>p.source.kind==="repath"||p.source.kind==="retainedRoot"&&p.actions.length<30&&["STR_WE_NEED_MALE_TOUCH_PREQ","STR_GALS_ARE_SUPERIOR_PREQ"].includes(branches.get(p.branch).choices.path)).slice(0,120))if(p.actions[0]?.type!=="campaignContext")for(let d=0;d<5;d++)addPrefix(p.branch,[{type:"campaignContext",difficulty:d,assumption:true},...p.actions],{kind:"fixedDifficulty",id:p.id,difficulty:d});
const focus=new Set(arg("origins","").split(",").filter(Boolean));
const byOrigin=new Map(),birthCounts=new Map();for(const g of Object.values(graphs))birthCounts.set(g.origin,(birthCounts.get(g.origin)||0)+1);
const attemptCounts=new Map();for(const a of Object.values(attempts))attemptCounts.set(a.origin,(attemptCounts.get(a.origin)||0)+1);
for(const id of process.argv.includes("--shared-only")?[]:targets){
 const p=profiles.get(id);if(!p||p.sourceType==="event"||focus.size&&!focus.has(id))continue;
 const deps=new Set(),qdeps=[...p.requires];for(let i=0;i<qdeps.length;i++){const k=qdeps[i];if(deps.has(k))continue;deps.add(k);const r=data.researchRules[k];if(r)qdeps.push(...(r.dependencies||[]),...(r.requires||[]));}
 const cat=p.id==="direct:STR_SOLDIER_NEKOMIMI_O"||p.requires.includes("STR_THEBAN_ASSAULT_CATGIRLS"),doll=p.id==="direct:STR_SOLDIER_DOLL",robot=p.requires.some(k=>["STR_SDD_CONTROL","STR_SDD_SUMMONING"].includes(k)),xen=p.id==="manufacture:STR_XENFORCER_REPAIR";
 const shared=robot||xen;
 const immediate=new Set(p.requires.flatMap(k=>data.researchRules[k]?.dependencies||[]));
 const solvedPrereqs=new Set(Object.values(graphs).flatMap(g=>profiles.get(g.origin)?.requires||[]).filter(k=>nearDependency(k)));
 function nearDependency(k){return immediate.has(k);}
 const knownWeight=k=>20+Math.min(120,(data.researchRules[k]?.dependencies?.length||0)*4);
 const near=new Set(p.requires);for(let depth=0;depth<3;depth++)for(const k of [...near]){const r=data.researchRules[k];if(r)for(const t of [...(r.dependencies||[]),...(r.requires||[])])near.add(t);}
 const isGold=b=>b.choices.codex==="STR_CODEX_GOLD";
 const branchPriority=q=>{const b=branches.get(q.branch),stage=stagedPrefixes[q.id],already=stage?.active||[...q.topics],progress=already.filter(k=>near.has(k)).length;
  const direct=already.filter(k=>immediate.has(k)).reduce((s,k)=>s+knownWeight(k),0),reused=already.filter(k=>solvedPrereqs.has(k)).length,stageBonus=stage?Math.min(60,progress*3):0;
  if(robot)return 300*reused+direct+stageBonus+(b.choices.codex==="STR_CODEX_RED"?22:isGold(b)?-150:5)+(b.choices.path==="STR_WE_NEED_MALE_TOUCH_PREQ"?8:0);
  if(xen)return 300*Number(already.includes("STR_EMANCIPATION"))+direct+stageBonus+(b.choices.path==="STR_WE_NEED_MALE_TOUCH_PREQ"?8:0);
  return (cat?4*Number(b.choices.path==="STR_CAT_PATH_PREQ")+Number(q.source.kind==="repath"):doll?Number(q.source.kind==="fixedDifficulty"):0)+3*Number(q.source.kind==="stagedResearch"&&q.source.origin===p.id)+Number(q.source.kind==="fixedDifficulty");
 };
 const choices=prefixPool.filter(q=>!p.requires.some(k=>branches.get(q.branch).blockedResearch?.includes(k))).map(q=>({q,score:p.requires.filter(k=>q.topics.has(k)).length,overlap:[...q.topics].filter(k=>deps.has(k)).length,preferred:branchPriority(q)}));
 choices.sort((a,b)=>b.score-a.score||b.preferred-a.preferred||b.overlap-a.overlap||a.q.actions.length-b.q.actions.length||a.q.id.localeCompare(b.q.id));
 // Alternate known-prefix and early recruitment opportunities. Do not
 // discard other candidates; all remain selectable in future rounds.
 const list=[];for(const {q,score} of choices){
  if(staging){if(score===p.requires.length)list.push([q,"BRANCH_FIRST"]);list.push([q,"STAGED_BRANCH_FIRST_V6"]);if(["foundation","earlyPrefix","repath","fixedDifficulty","stagedResearch"].includes(q.source.kind))list.push([q,"STAGED_EARLY_V6"]);continue;}
  if(score===p.requires.length)list.push([q,"BRANCH_FIRST"]);
  if(["foundation","earlyPrefix","repath","fixedDifficulty"].includes(q.source.kind))list.push([q,"EARLY_BIRTH"]);
  if(score!==p.requires.length)list.push([q,"BRANCH_FIRST"]);
 }
 byOrigin.set(id,list.filter(([q,mode])=>!attempts[key([id,q.id,mode])]));
}
const shared=createSharedRecruitmentIndex({data,branches,profiles,prefixPool,donors,replay,commit,allChoice,graphs,attempts,prior:prior?.sharedIndex,scanLimit:Number(arg("shared-scan","96")),existingPairs,deadline:start+maxSeconds*400});
function tryShared(t){
 const p=profiles.get(t.origin),prefix=t.prefix,b=branches.get(prefix.branch),id=key([p.id,prefix.id,"SHARED_DIRECT"]);
 round.attempts++;
 try{
  const w=shared.load(prefix),c=commit(b);
  assert(!member(w)&&!w.pendingFree);
  assert([...c,...p.requires].every(k=>active(w,k)));
  const forbidden=new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!c.includes(k))]);
  assert(![...w.researched].some(k=>forbidden.has(k)));
  // Same conditional input calculation as the branch planner, but no
  // expensive research-method graph build for already active requirements.
  const n={world:w,steps:[...prefix.actions],birthMonth:w.month},items={};
  const append=a=>{n.world=replay.apply(n.world,a);n.steps.push(a);};
  for(const [k,v] of Object.entries(p.acquisitionRequiredItems||{})){const lack=Math.max(0,Math.ceil(Number(v)-Number(w.items[k]||0)));if(lack)items[k]=lack;}
  const functions=(p.requiresBaseFunc||[]).filter(k=>!w.baseFunctions.has(k)),funds=Math.max(0,Math.ceil(Math.max(0,p.cost||0)-w.funds));
  if(Object.keys(items).length||functions.length||funds)append({type:"externalInputs",items,functions,funds,reason:"Conditional recruitment inputs "+p.id,assumption:true});
  const birthAt=n.steps.length;
  append({type:"recruit",soldier:"origin",profile:p.id,band:"min"});
  assert(!n.world.pendingFree&&member(n.world)?.state.exactStats&&member(n.world).state.soldierType===p.soldierType);
  assert(![...n.world.researched].some(k=>forbidden.has(k)));
  const gid=register(p,b,prefix,n,birthAt,"DIRECT_ACTIVE",true);
  attempts[id]={origin:p.id,branch:b.id,prefix:prefix.id,mode:"SHARED_DIRECT",status:"CONDITIONAL_REPLAY",graph:gid};
 }catch(e){round.unresolved++;attempts[id]={origin:p.id,branch:b.id,prefix:prefix.id,mode:"SHARED_DIRECT",status:"LIMITED_UNRESOLVED",reason:String(e.message)};}
}
const sharedLimit=Math.min(maxBirths,Number(arg("shared-attempts","20")));
while(round.sharedAttempts<sharedLimit&&performance.now()-start<maxSeconds*750){
 const t=shared.next();if(!t)break;
 const before=round.births;tryShared(t);
 const rec=attempts[key([t.origin,t.prefix.id,"SHARED_DIRECT"])];rec.donors=t.donors;rec.sharedActiveResearch=t.research;rec.previouslyRegisteredPair=t.known;
 round.sharedAttempts++;round.sharedBirths+=round.births-before;
}
const incumbents=incumbentsFromRegistry(db),incumbentScorer=createIncumbentScorer({data,incumbents});
const careerClass=arg("career-class",Number(arg("chort-share","0"))>0?"all":"ordinary");
assert(["ordinary","chort","all"].includes(careerClass),"Unknown career class");
const workPriority=createCareerWorkPriority({mode:careerClass,specialShare:Number(arg("chort-share","0")),graphs,historicalRecords:prior?.traitChain?.records});
const frontier=createTraitFrontier(graphs,byBody,prior?.traitSchedule,workPriority),quantum=Math.max(1,Number(arg("quantum","5")));
const maxTerminal=Number(arg("terminal","5")),terminalRule=db.careerCompletion?.terminalRule;
// Selection is a scheduling scope only. All other graphs, witnesses and records
// remain in the ledger and remain available as research donors.
function scopedGraphFilter(pathArg,originArg,branchArg,defaultPath="",defaultOrigin="",defaultBranch=""){
 const paths=new Set(arg(pathArg,defaultPath).split(",").filter(Boolean)),origins=new Set(arg(originArg,defaultOrigin).split(",").filter(Boolean)),branchIds=new Set(arg(branchArg,defaultBranch).split(",").filter(Boolean));
 for(const id of branchIds)assert(branches.has(id),"Unknown retained research branch: "+id);
 for(const p of paths)assert([...branches.values()].some(b=>b.choices.path===p),"Unknown research path: "+p);
 for(const o of origins)assert(profiles.has(o),"Unknown origin: "+o);
 return (g,b)=>(!paths.size||paths.has(b.choices.path))&&(!origins.size||origins.has(g.origin))&&(!branchIds.size||branchIds.has(g.branch));
}
const terminalGraphFilter=scopedGraphFilter("terminal-path","terminal-origin","terminal-branch");
const traitGraphFilter=scopedGraphFilter("trait-path","trait-origin","trait-branch",arg("terminal-path",""),arg("terminal-origin",""),arg("terminal-branch",""));
const terminal=createTerminalTargetScheduler({data,terminalRule,graphs,branches,commit,allChoice,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,
 prior:prior?.terminalResearch?.sourceFingerprint===terminalRule?.fingerprint?prior.terminalResearch:{},
 deadline:()=>start+maxSeconds*1000,focus:arg("terminal-focus","").split(",").filter(Boolean),graphFilter:terminalGraphFilter,resumeFirst:arg("terminal-resume-first",careerClass==="ordinary"?"1":"0")!=="0"||process.argv.includes("--terminal-resume-first"),workPriority,coveredOrigins:Object.entries(db.careerCompletion?.originCoverage||{}).filter(([,v])=>v.witnesses>0).map(([k])=>k),coverageFirst:arg("terminal-coverage-first","1")!=="0",coveredBranches:[...new Set(Object.values(db.careerCompletion?.researchTraitSets?.pairs||{}).filter(p=>p.body!=="STR_SOLDIER_CHORT").map(p=>p.branch))],branchFirst:arg("terminal-branch-first","1")!=="0",difficultyLanes:arg("difficulty-lanes","1")!=="0"});
phase("closed recruitment start");
const closedRecruitLimit=Number(arg("closed-recruit",careerClass==="ordinary"&&!arg("terminal-path","")&&!arg("terminal-origin","")&&!arg("terminal-branch","")?"4":"0"));
assert(Number.isSafeInteger(closedRecruitLimit)&&closedRecruitLimit>=0);
const closedRecruitDeadline=Math.min(start+maxSeconds*1000,performance.now()+1000*Number(arg("closed-recruit-seconds",String(maxSeconds*.5))));
const closedRecruit=closedRecruitLimit>0?createClosedRecruitmentWave({db,data,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,stagedPrefixes,selectPlanner,insert,enqueue,materialPolicy,deadline:()=>closedRecruitDeadline,focus:arg("closed-recruit-origins","").split(",").filter(Boolean),focusResume:arg("closed-recruit-resume","0")==="1",choiceFork:arg("closed-recruit-choice-fork","1")!=="0",focusPaths:arg("closed-recruit-paths","").split(",").filter(Boolean),diversePaths:arg("closed-recruit-diverse-paths","1")!=="0"}):null;
if(closedRecruit)closedRecruit.run(closedRecruitLimit,Number(arg("closed-recruit-attempts",String(closedRecruitLimit*4))));
phase("closed recruitment finished");
const compactLimit=Number(arg("repeat-compact",careerClass==="chort"?"0":"6"));
const compactAttempts=Number(arg("repeat-compact-attempts",String(Math.max(0,compactLimit*3))));
assert(Number.isSafeInteger(compactLimit)&&compactLimit>=0&&Number.isSafeInteger(compactAttempts)&&compactAttempts>=0);
const compactDeadline=performance.now()+Math.min(maxSeconds*1000,Number(arg("repeat-compact-ms","12000")));
const repeatCompaction=compactRepeatCareers({data,db,graphs,branches,replay,loadNode,stepsFor,insert,enqueue,context,terminal,terminalRule,materialPolicy,prior:prior?.summary?.repeatCompaction,deadline:()=>Math.min(start+maxSeconds*1000,compactDeadline),limit:compactLimit,attemptLimit:compactAttempts});
const difficultyForkLimit=Number(arg("difficulty-fork","0"));
const forkDifficulty=Number(arg("fork-difficulty","1"));
assert(Number.isSafeInteger(difficultyForkLimit)&&difficultyForkLimit>=0&&Number.isInteger(forkDifficulty)&&forkDifficulty>=0&&forkDifficulty<=4);
if(difficultyForkLimit>0&&careerClass==="ordinary")round.difficultyFork=runDifficultyForks({data,graphs,profiles,branches,terminal,terminalRule,replay,register,insert,enqueue,stepsFor,commit,context,workPriority,deadline:()=>start+maxSeconds*1000,limit:difficultyForkLimit,difficulty:forkDifficulty});
const transferScope=arg("transfer-scope",db.careerCompletion?.summary?.completeOrigins===profiles.size?"pair":"origin");
const transfer=createTerminalRecruitmentTransfer({db,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,deadline:()=>start+maxSeconds*1000,scope:transferScope,loadNode,materialPolicy,slotPriority:arg("transfer-slot-priority","early"),perBranch:Number(arg("transfer-per-branch","2")),focusOrigins:arg("transfer-origins","").split(",").filter(Boolean),focusBranches:arg("transfer-branch",arg("terminal-branch","")).split(",").filter(Boolean)});
const transferLimit=Number(arg("terminal-transfer",careerClass==="chort"||arg("terminal-path","")||arg("terminal-origin","")||arg("terminal-branch","")?"0":transferScope==="pair"?"2":"8"));
const transferDonorLimit=Number(arg("transfer-donors","12")),transferQuantum=Math.max(1,Number(arg("transfer-quantum","2")));
if(transferLimit>0)transfer.run(Math.min(transferLimit,transferQuantum),transferDonorLimit);
const forkLimit=Number(arg("terminal-fork","0"));
const forkSeconds=Number(arg("fork-seconds",String(Number(arg("trait-chain","40"))>0?maxSeconds*0.55:maxSeconds)));
assert(Number.isFinite(forkSeconds)&&forkSeconds>=0);
const forkDeadline=Math.min(start+maxSeconds*1000,performance.now()+forkSeconds*1000);
const branchFork=forkLimit>0&&careerClass!=="chort"?createTerminalBranchFork({db,data,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,stagedPrefixes,selectPlanner,deadline:()=>forkDeadline,focusBranches:arg("fork-branches","").split(",").filter(Boolean),focusOrigins:arg("fork-origins","").split(",").filter(Boolean),focusPaths:arg("fork-paths","").split(",").filter(Boolean),balancedPaths:arg("fork-path-balanced","1")!=="0"}):null;
if(branchFork)branchFork.run(forkLimit,Number(arg("fork-attempts","8")));
const extensionLimit=Number(arg("terminal-extension",careerClass==="chort"||arg("terminal-path","")||arg("terminal-origin","")||arg("terminal-branch","")?"0":"3"));
const extension=extensionLimit>0?createTerminalRecruitmentExtension({db,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,stagedPrefixes,selectPlanner,deadline:()=>start+maxSeconds*1000,focus:arg("extension-origins","").split(",").filter(Boolean)}):null;
if(extension)extension.run(extensionLimit,Number(arg("extension-attempts","8")));
const eventRecruitLimit=Number(arg("terminal-event-recruit",careerClass==="chort"||arg("terminal-path","")||arg("terminal-origin","")||arg("terminal-branch","")?"0":"3"));
const eventStrategy=arg("event-recruit-strategy","earliest-slot");
assert(["earliest-slot","retained-variant"].includes(eventStrategy),"Unknown event recruitment strategy");
const eventFactory=eventStrategy==="retained-variant"?createRetainedVariantEventRecruitment:createTerminalEventRecruitment;
const eventRecruit=eventRecruitLimit>0&&[...profiles.values()].some(p=>p.sourceType==="event"&&!db.careerCompletion?.originCoverage?.[p.id]?.witnesses&&!Object.values(graphs).some(g=>g.origin===p.id&&!g.blocker))?eventFactory({db,data,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,selectPlanner,deadline:()=>start+maxSeconds*1000,focus:arg("event-recruit-origins","").split(",").filter(Boolean)}):null;
if(eventRecruit){const maxEventAttempts=Number(arg("event-recruit-attempts","20"));if(eventStrategy==="retained-variant")eventRecruit.run(eventRecruitLimit,maxEventAttempts);else eventRecruit.run(eventRecruitLimit,Number(arg("event-recruit-donors","5")),maxEventAttempts);}
const maxSupply=Number(arg("supply-plans","16")),maxTerminalFollow=Number(arg("terminal-follow","12")),maxSupplyResearch=Number(arg("supply-research","6"));
const supply=createTerminalSupplyFollowthrough({terminal,terminalRule,graphs,byBody,data,index:supplyIndex,replay,loadNode,stepsFor,context,insert,enqueue,branches,commit,allChoice,selectPlanner,
 prior:prior?.terminalSupply?.sourceFingerprint===supplyIndex.evidence.fingerprint?prior.terminalSupply:{},deadline:()=>start+maxSeconds*1000});
const endStage=createTerminalCareerFrontier({terminal,terminalRule,graphs,branches,byBody,data,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,expand,deadline:()=>start+maxSeconds*1000,prior:prior?.endStage?.sourceFingerprint===terminalRule.fingerprint?prior.endStage:{},workPriority});
const maxEndStage=Number(arg("end-stage","60")),maxEndResearch=Number(arg("end-research","14"));
const recovery=createTerminalResetRecovery({terminal,terminalRule,graphs,branches,byBody,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,deadline:()=>start+maxSeconds*1000,prior:prior?.resetRecovery?.sourceFingerprint===terminalRule.fingerprint?prior.resetRecovery:{},workPriority});
const maxRecovery=Number(arg("reset-recovery","30"));
const traitBodies=new Set(arg("trait-bodies","").split(",").filter(Boolean));
for(const id of traitBodies)assert(data.soldiers.some(s=>s.id===id),"Unknown trait body: "+id);
const activeIndex=createTerminalActiveResearchIndex({db,prior,graphs}),historyIndex=createTerminalHistoryIndex({data});
const traitPriorityMode=arg("trait-priority",careerClass==="ordinary"?"pareto":"cap"),numericParetoSearch=Number(arg("trait-chain","40"))>0&&traitPriorityMode==="pareto"?createCareerParetoSearch({db,data,byBody,commit,allChoice,terminalRule,scopeMode:arg("pareto-scope","global-numeric"),deadline:()=>start+maxSeconds*1000,coverVisits:Number(arg("pareto-cover-visits","256")),historyStates:Number(arg("pareto-history-states","512"))}):null;
const materialWeight=Number(arg("material-priority-weight","18"));
assert(Number.isFinite(materialWeight)&&materialWeight>=0,"Invalid material-priority-weight");
const paretoSearch=numericParetoSearch&&materialWeight>0?createMaterialPriority({db,materialPolicy,numericSearch:numericParetoSearch,weight:materialWeight}):numericParetoSearch;
const productivityWeight=Number(arg("productivity-weight","24"));
assert(Number.isFinite(productivityWeight)&&productivityWeight>=0,"Invalid productivity-weight");
const productivity=traitPriorityMode==="pareto"&&productivityWeight>0?createCareerProductivity({records:prior?.traitChain?.records||{},graphs,weight:productivityWeight}):null;
const compactPriority=createCompactContinuationPriority(graphs,repeatCompaction.records);
const depthQuota=Number(arg("trait-depth-quota","2"));
const depthMinimum=Number(arg("trait-depth-minimum","10"));
assert(Number.isSafeInteger(depthQuota)&&depthQuota>=0&&depthQuota<=4&&Number.isSafeInteger(depthMinimum)&&depthMinimum>=0);
const depthPriority=Number(arg("trait-chain","40"))>0&&depthQuota>0&&careerClass!=="chort"?createHighTraitPriority({graphs,records:prior?.traitChain?.records,activeIndex,compactPriority,minimum:depthMinimum}):null;
const recipeQuota=Number(arg("trait-recipe-quota","2"));
assert(Number.isSafeInteger(recipeQuota)&&recipeQuota>=0&&recipeQuota<=4);
const recipePriority=Number(arg("trait-chain","40"))>0&&recipeQuota>0&&careerClass!=="chort"?createTraitRecipePriority({routes:prior?.routes,graphs,rules:replay.rules,branches,activeIndex,commit,allChoice}):null;
const traitChain=createTerminalTraitChain({recipePriority,recipeQuota,flatRollQuota:Number(arg("trait-flat-roll-quota","1")),rankPolicy:defaultRankPolicy,depthPriority,depthQuota,compactPriority,compactQuota:Number(arg("trait-compact-quota","1")),templateMemoLimit:Number(arg("template-memo-limit","160")),terminal,terminalRule,graphs,branches,byBody:traitByBody,data,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,endStage,recovery,deadline:()=>start+maxSeconds*1000,prior:prior?.traitChain?.sourceFingerprint===terminalRule.fingerprint?prior.traitChain:{},graphFilter:traitGraphFilter,retryFirst:process.argv.includes("--trait-retry-first"),workPriority,incumbentScorer,bodyFilter:body=>!traitBodies.size||traitBodies.has(body),numericPriority:traitPriorityMode,paretoSearch,productivity,paretoPrune:false,paretoProofThreshold:Number(arg("pareto-proof-threshold","35")),activeIndex,activeFirst:!process.argv.includes("--trait-no-active-first"),activeQuota:Number(arg("trait-active-quota","3")),researchQuota:Number(arg("trait-research-quota","1")),materialPolicy,historyIndex,continuationWeight:Number(arg("trait-continuation-weight","26"))});
const closureLimit=Number(arg("closure-wave","12"));
assert(Number.isSafeInteger(closureLimit)&&closureLimit>=0);
const closureBodies=new Set(arg("closure-bodies",arg("trait-bodies","")).split(",").filter(Boolean));
const closureWave=createFinalSuccessorWave({data,graphs,branches,terminal,terminalRule,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,materialPolicy,graphFilter:traitGraphFilter,bodyFilter:body=>!closureBodies.size||closureBodies.has(body),deadline:()=>Math.min(start+maxSeconds*1000,closureDeadline),prior:prior?.closureWave,chainQuantum:Number(arg("closure-chain-quantum","6")),rootAttemptBudget:Number(arg("closure-root-attempts","8")),ruleAttemptBudget:Number(arg("closure-rule-attempts","2")),stagedPrefixes,preserveBody:arg("closure-preserve-body","0")==="1",excludeChort:arg("closure-exclude-chort",careerClass==="ordinary"?"1":"0")==="1",historyIndex,activeIndex,admissionWitnesses:db.careerCompletion?.finalCareerAdmission?.witnesses||{},priorRoutes:prior?.routes||{},postRevivalOnly:arg("closure-post-revival","0")==="1",focusActions:arg("closure-focus-actions","").split(",").filter(Boolean),fragmentMs:Number(arg("closure-fragment-ms","1500"))});
const closureDeadline=performance.now()+Number(arg("closure-seconds",String(maxSeconds)))*1000;
if(closureLimit>0)closureWave.run(closureLimit);
const maxTraitChain=Number(arg("trait-chain","40"));
// Numeric dominance is a scheduling hint only. No intermediate Pareto pruning or sweep.
let supplyCalls=0,followCalls=0,supplyResearchCalls=0;
// Explicit path coverage. Reuse the actual pre-birth witnesses in the
// retained branch catalogue. This bypasses the old missing-origin-only filter.
const coveragePath=arg("coverage-path","STR_HYBRID_PATH_PREQ"),coverageLimit=Number(arg("coverage-births",careerClass==="chort"?"0":"4"));
const coverageBranches=new Set(arg("coverage-branch",arg("terminal-branch","")).split(",").filter(Boolean));
for(const id of coverageBranches)assert(branches.has(id),"Unknown retained coverage branch: "+id);
const coverageProfiles=arg("coverage-origins","manufacture:STR_HYBRID_LONER_RECRUITMENT,manufacture:STR_HYBRID_HIVER_RECRUITMENT,direct:STR_SOLDIER_HYBRID,manufacture:STR_HYBRID_OF_TWILIGHT_RECRUITMENT").split(",").filter(k=>profiles.has(k));
const autoCoverage=arg("coverage-auto",careerClass==="ordinary"&&!arg("coverage-path","")&&!arg("coverage-origins","")&&!arg("coverage-branch","")&&!arg("terminal-path","")&&!arg("terminal-origin","")&&!arg("terminal-branch","")?"1":"0")==="1";
const coverageWave=autoCoverage&&coverageLimit>0?createBranchCoverageWave({db,graphs,profiles,branches,prefixPool,attempts,commit,allChoice,terminalRule,terminalRecords:terminal.records,focus:[...coverageBranches],maxSeedsPerBranch:Number(arg("coverage-seeds-per-branch","1"))}):null;
const coverageTurns=new Map(),coverageJobs=[];
for(const v of Object.values(attempts))if(v.mode==="STAGED_COVERAGE_V17")coverageTurns.set(v.origin,(coverageTurns.get(v.origin)||0)+1);
for(const origin of autoCoverage?[]:coverageProfiles){
 const p=profiles.get(origin);if(p.sourceType==="event")continue;
 for(const prefix of prefixPool){
  const b=branches.get(prefix.branch);if((coverageBranches.size?!coverageBranches.has(b.id):b.choices.path!==coveragePath)||p.requires.some(k=>b.blockedResearch?.includes(k)))continue;
  if(attempts[key([origin,prefix.id,"STAGED_COVERAGE_V17"])])continue;
  if(Object.values(graphs).some(g=>g.origin===origin&&g.branch===prefix.branch))continue;
  const activeWeight=p.requires.filter(k=>prefix.topics.has(k)).length;
  coverageJobs.push({origin,p,prefix,score:1000*activeWeight+Number(prefix.source.kind==="retainedRoot")*100+Number(b.choices.cause===null)*20+Math.min(prefix.actions.length,60)});
 }
}
let coverageAttempts=0,coverageBirths=0,explicitTerminalCalls=0;
function nextCoverage(){
 if(coverageWave)return coverageWave.next();
 coverageJobs.sort((a,b)=>(coverageTurns.get(a.origin)||0)-(coverageTurns.get(b.origin)||0)||b.score-a.score||a.prefix.id.localeCompare(b.prefix.id));
 while(coverageJobs.length){const t=coverageJobs.shift();if(!Object.values(graphs).some(g=>g.origin===t.origin&&g.branch===t.prefix.branch))return t;}
}
const cursors=new Map();let work=true;
while(work&&performance.now()-start<maxSeconds*1000){
 work=false;
 if(coverageAttempts<coverageLimit&&performance.now()-start<maxSeconds*1000){const t=nextCoverage();if(t){const before=round.births;tryBirth(t.p,t.prefix,"STAGED_COVERAGE_V17");coverageAttempts++;coverageBirths+=round.births-before;if(coverageWave)coverageWave.finish(t,round.births>before);coverageTurns.set(t.origin,(coverageTurns.get(t.origin)||0)+1);work=true;}}
 if(supplyCalls<maxSupply&&performance.now()-start<maxSeconds*1000){const t=supply.nextPlan();if(t){supply.runPlan(t);supplyCalls++;work=true;}}
 if(supplyResearchCalls<maxSupplyResearch&&performance.now()-start<maxSeconds*1000){const t=supply.nextResearch();if(t){supply.runResearch(t);supplyResearchCalls++;work=true;}}
 if(followCalls<maxTerminalFollow&&performance.now()-start<maxSeconds*1000){const t=supply.next();if(t){supply.run(t);followCalls++;work=true;}}
 if(explicitTerminalCalls<maxTerminal&&performance.now()-start<maxSeconds*1000){const t=terminal.next();if(t){explicitTerminalCalls++;workPriority.run(t,"terminal",()=>terminal.run(t));work=true;}}
 if(transfer.stats.births<transferLimit&&performance.now()-start<maxSeconds*1000){const before=transfer.stats.births,donorsBefore=transfer.stats.donorTrials;transfer.run(Math.min(transferLimit,before+transferQuantum),transferDonorLimit);if(transfer.stats.births>before||transfer.stats.donorTrials>donorsBefore)work=true;}
 if(round.attempts<maxBirths&&!process.argv.includes("--shared-only")){
  const choices=[...byOrigin].filter(([id,a])=>(cursors.get(id)||0)<a.length).sort((a,b)=>(birthCounts.get(a[0])||0)-(birthCounts.get(b[0])||0)||(attemptCounts.get(a[0])||0)-(attemptCounts.get(b[0])||0)||a[0].localeCompare(b[0]));
  if(choices.length){const [id,a]=choices[0],i=cursors.get(id)||0;const before=round.births;cursors.set(id,i+1);tryBirth(profiles.get(id),...a[i]);attemptCounts.set(id,(attemptCounts.get(id)||0)+1);if(round.births>before)birthCounts.set(id,(birthCounts.get(id)||0)+1);work=true;}
 }
 if(traitChain.metrics.attempts<maxTraitChain&&performance.now()-start<maxSeconds*1000){const t=traitChain.next();if(t){workPriority.run(t,"traitChain",()=>traitChain.run(t));work=true;}}
 if(recovery.metrics.attempts<maxRecovery&&performance.now()-start<maxSeconds*1000){const t=recovery.next();if(t){workPriority.run(t,"resetRecovery",()=>recovery.run(t));work=true;}}
 if(endStage.metrics.examined<maxEndStage&&round.expanded<maxNodes&&performance.now()-start<maxSeconds*1000){
  for(let j=0;j<4&&endStage.metrics.examined<maxEndStage&&round.expanded<maxNodes&&performance.now()-start<maxSeconds*1000;j++){const t=endStage.next();if(!t)break;workPriority.run(t,"endStage",()=>endStage.run(t));work=true;}
 }
 if(endStage.metrics.researchAttempts<maxEndResearch&&performance.now()-start<maxSeconds*1000){const t=endStage.nextResearch();if(t){workPriority.run(t,"endResearch",()=>endStage.runResearch(t));work=true;}}
 if(round.followAttempts<maxFollow&&performance.now()-start<maxSeconds*1000){const t=nextFollow();if(t){workPriority.run(t,"follow",()=>runFollow(...t.entry));work=true;}}
 if(round.researchAttempts<maxResearch&&performance.now()-start<maxSeconds*1000){const t=nextResearch();if(t){workPriority.run(t,"research",()=>expandResearch(t));work=true;}}
 if(round.expanded<maxNodes&&round.chainExpanded<maxChain&&performance.now()-start<maxSeconds*1000){
  const t=nextChain();if(t){const {id,node}=t,g=graphs[id];try{workPriority.run(t,"chain",()=>expand(id,g,node));round.chainExpanded++;for(const e of g.nodes[node].edges||[])if(e.status==="CONDITIONAL_REPLAY"&&e.to!==undefined)enqueue(id,e.to);}catch(e){g.blocker=String(e.message);round.errors.push({id,reason:g.blocker});}work=true;}
 }
 if(round.expanded<maxNodes){const picked=frontier.pick();if(picked){const {id,g,priority}=picked;
  for(let q=0;q<quantum&&round.expanded<maxNodes&&performance.now()-start<maxSeconds*1000;q++){
   const i=frontier.pickNode(g,priority);if(i===null)break;
   try{frontier.selected(g,i,priority);workPriority.run({g,i,n:g.nodes[i]},"general",()=>expand(id,g,i));}catch(e){g.blocker=String(e.message);round.errors.push({id,reason:g.blocker});}work=true;
  }
 }}

}
// Preserve existing action-trie indices and published row identities.
for(const [id,r] of retainedPrefixes){const g=graphs[id];assert(g&&g.nodes.length>=r.length);assert.equal(immutablePrefix(g,r.length),r.hash,"Previously recorded graph history changed: "+id);}
phase("publication start");
const routes={...prior?.routes},indexRoutes={...prior?.indexRoutes},nodes=prior?.nodes?.slice()||[{parent:null,action:null}],actionNodes=prior?.actionNodes?.slice()||[{parent:null,action:null}],rm=new Map(),am=new Map();
for(const [arr,map] of [[nodes,rm],[actionNodes,am]])for(let i=1;i<arr.length;i++){const n=arr[i];assert(Number.isInteger(n.parent)&&n.parent<i);map.set(key([n.parent,n.action]),i);}
const publicationWork={retained:Object.keys(routes).length,appended:0,retainedActionNodes:actionNodes.length,retainedResearchNodes:nodes.length};
const researchKinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch"]);
function push(arr,map,parent,action){const k=key([parent,action]);if(map.has(k))return map.get(k);const i=arr.length;arr.push({parent,action});map.set(k,i);return i;}

const previous=new Map();for(const r of Object.values(prior?.routes||{})){const a=previous.get(r.sourceGraph)||[];a.push(r.sourceNode);previous.set(r.sourceGraph,a);}
for(const [id,g] of Object.entries(graphs)){
 const front=new Map();for(const [i,n] of g.nodes.entries()){
  const k=key([n.body,n.traits,n.rank,n.medals]),a=front.get(k)||[];
  const d=(a,b)=>dominates(a.permanentVector,b.permanentVector)&&dominates(a.permanentCapVector,b.permanentCapVector);

  if(!a.some(j=>d(g.nodes[j],n)))front.set(k,[...a.filter(j=>!d(n,g.nodes[j])),i]);
 }
 // Terminal research continuations must remain addressable even when the
 // soldier's vector and traits are unchanged. Do not prune by numeric rank.
 const terminalNodes=Object.values(terminal.records).filter(r=>r.graph===id&&Number.isInteger(r.to)&&r.suffixHash).map(r=>r.to);
 // Preserve terminal descendants even if their numerical vectors are dominated.
 for(const r of Object.values(supply.front))if(r.graph===id)terminalNodes.push(r.node);
 terminalNodes.push(...endStage.publishedNodes(id),...recovery.publishedNodes(id),...traitChain.publishedNodes(id),...repeatCompaction.publishedNodes(id),...closureWave.publishedNodes(id),...(closedRecruit?.publishedNodes(id)||[]));
 for(const i of new Set([0,...(previous.get(id)||[]),...terminalNodes,...[...front.values()].flat()])){
  const n=g.nodes[i],rid="MISSCAR:"+id+":"+i;
  if(routes[rid]){assert.equal(routes[rid].canonicalStateHash,n.stateHash);assert.equal(indexRoutes[rid].fullActionHash,routes[rid].fullActionHash);continue;}
  publicationWork.appended++;
  const full=[...g.birthActions,...stepsFor(g,i)],ctx=auditOriginCampaignContext(full,data),allowed=ctx.allowedDifficulties.filter(x=>g.allowedDifficulties.includes(x));assert(ctx.kind==="compatible"&&allowed.length);

  let rp=0,ap=0;const order=[],transformGates=[];
  for(const [j,a] of full.entries()){ap=push(actionNodes,am,ap,a);if(researchKinds.has(a.type))rp=push(nodes,rm,rp,a);if(a.type==="transform"){const r=replay.rules.get(a.transform);assert(r);transformGates.push({index:j,prefix:rp,transform:a.transform,requires:r.requires});if(a.soldier==="origin")order.push(a.transform);}}
  const hash=key(full),rankDefault=rankEvidence(full),flatRoll=flatRollEvidence(full,randomPolicy),lifecycle=lifecycleEvidence(full,revivalPolicy);routes[rid]={origin:g.origin,branch:g.branch,body:n.body,order,permanentVector:n.permanentVector,permanentCapVector:n.permanentCapVector,fullActionHash:hash,canonicalStateHash:n.stateHash,allowedDifficulties:allowed,traitEvidence:{retained:n.traits},rank:n.rank,medals:n.medals,sourceGraph:id,sourceNode:i,birthEvidence:{scope:"CONDITIONAL_MIN_RECRUITMENT",mode:g.mode,birthAt:g.birthAt,birthMonth:g.birthMonth,prefixSource:g.prefixSource,requiredResearch:profiles.get(g.origin).requires},...(rankDefault?{rankDefault}:{}),...(flatRoll?{flatRoll}:{}),...(lifecycle?{lifecycle}:{}),actualGameCertified:false};
  indexRoutes[rid]={origin:g.origin,branch:g.branch,fullActionHash:hash,prefix:rp,fullPrefix:ap,transformGates,history:key([g.branch,rp]),sourceGraph:id,sourceNode:i,actionCount:full.length};
 }
}
for(const [id,r] of Object.entries(prior?.routes||{}))assert.deepEqual(routes[id],r,"Lost published witness");
const covered=new Set(Object.values(graphs).map(g=>g.origin));



const materialDescription=materialPolicy.describe();
const summary={publicationWork,closedRecruitment:closedRecruit?.metrics||null,closureWave:closureWave.metrics,lifecyclePolicy:revivalPolicy,lifecycleRoutes:Object.values(routes).filter(r=>r.lifecycle).length,flatRollPolicy:randomPolicy,flatRollRoutes:Object.values(routes).filter(r=>r.flatRoll).length,flatRollPruningScope:"DETERMINISTIC_BOUND_NOT_APPLIED_TO_EXPANDED_MODEL",finalAdmissionPolicy:"SUCCESSOR_CLOSURE_REQUIRED",intermediatePruning:"EXACT_WORLD_RESEARCH_HISTORY_MATERIAL_ONLY",researchDepthLimit:null,surgeryDepthLimit:null,defaultRankPolicy,defaultRankRoutes:Object.values(routes).filter(r=>r.rankDefault).length,repeatCompaction:{policy:"EXACT_REPLAY_SHORTER_NONREMOVABLE_REPEAT_V1",...repeatCompaction.metrics,records:repeatCompaction.records},materialBudget:{schema:materialDescription.schema,counts:materialDescription.counts,metrics:materialDescription.metrics,finiteCount:materialPolicy.finite.size},previousMaterialTransfer:prior?.summary?.mergedTerminalTransfer||prior?.summary?.previousMaterialTransfer||null,repairedStages:Object.keys(repairedStages).length,stagedPrefixes:Object.keys(stagedPrefixes).length,stagedUniqueResearch:new Set(Object.values(stagedPrefixes).flatMap(p=>p.source.completed||[])).size,researchAttempts:Object.keys(careerResearch).length,researchSuccess:Object.values(careerResearch).filter(r=>r.status==="CONDITIONAL_RESEARCH_REPLAY").length,transformedStates:Object.values(graphs).reduce((s,g)=>s+g.nodes.filter(n=>n.action&&replay.rules.has(n.action)).length,0),targetOrigins:targets.length,coveredOrigins:targets.filter(k=>covered.has(k)).length,sharedOrigins:covered.size,sharedPairs:new Set(Object.values(graphs).map(g=>g.origin+"|"+g.branch)).size,sharedSuccessful:Object.values(attempts).filter(a=>a.mode==="SHARED_DIRECT"&&a.status==="CONDITIONAL_REPLAY").length,sharedAttempted:Object.values(attempts).filter(a=>a.mode==="SHARED_DIRECT").length,sharedNewPairs:new Set(Object.values(attempts).filter(a=>a.mode==="SHARED_DIRECT"&&a.status==="CONDITIONAL_REPLAY"&&!a.previouslyRegisteredPair).map(a=>a.origin+"|"+a.branch)).size,sharedIndex:{...shared.metrics,replay:{...shared.replayMetrics},total:Object.keys(shared.records).length,pendingPrefixes:shared.pendingPrefixes},missingOrigins:targets.filter(k=>!covered.has(k)),births:Object.keys(graphs).length,attempted:Object.keys(attempts).length,unresolved:Object.values(attempts).filter(a=>a.status==="LIMITED_UNRESOLVED").length,states:Object.values(graphs).reduce((s,g)=>s+g.nodes.length,0),processed:Object.values(graphs).reduce((s,g)=>s+g.nodes.filter(n=>n.edges!==null).length,0),terminalResearch:{...terminal.summary(),explicitTerminalCalls,automaticRegistrationCalls:terminal.stats.attempts-explicitTerminalCalls},workPriority:workPriority.metrics,incumbentBaseline:incumbents.summary,previousBalancedWork:prior?.summary?.previousBalancedWork||prior?.summary?.workPriority||null,terminalEventRecruitment:{...(eventRecruit?.stats||{}),cumulativeBirths:Object.values(attempts).filter(a=>a.mode==="TERMINAL_EVENT_RECRUITMENT_V1"&&a.status==="CONDITIONAL_REPLAY").length},terminalExtension:{...(extension?.stats||{}),cumulativeBirths:Object.values(attempts).filter(a=>a.mode==="TERMINAL_RECRUITMENT_EXTENSION_V1"&&a.status==="CONDITIONAL_REPLAY").length},previousRecruitmentExtension:prior?.summary?.mergedRecruitmentExtension||prior?.summary?.previousRecruitmentExtension||null,terminalBranchFork:{...(branchFork?.stats||{}),cumulativeReady:Object.values(attempts).filter(a=>a.mode==="TERMINAL_BRANCH_FORK_V1"&&a.status==="CONDITIONAL_REPLAY").length,cumulativePartial:Object.values(attempts).filter(a=>a.mode==="TERMINAL_BRANCH_FORK_V1"&&a.status==="PARTIAL_RESEARCH").length},terminalTransfer:{...transfer.stats,eligibleDonors:transfer.eligibleDonors,cumulativeBirths:Object.values(attempts).filter(r=>["TERMINAL_TRANSFER_V1","TERMINAL_TRANSFER_MATERIAL_V2"].includes(r.mode)&&r.status==="CONDITIONAL_REPLAY").length,cumulativePairBirths:Object.values(attempts).filter(r=>["TERMINAL_PAIR_TRANSFER_V1","TERMINAL_PAIR_TRANSFER_MATERIAL_V2"].includes(r.mode)&&r.status==="CONDITIONAL_REPLAY").length},endStage:endStage.summary(),resetRecovery:recovery.summary(),traitChain:traitChain.summary(),branchCoverage:{mode:autoCoverage?"AUTOMATIC_NEW_BRANCH_WAVE":"EXPLICIT_BRANCH_SCOPE",wave:coverageWave?.stats||null,path:autoCoverage?null:coveragePath,exactBranches:[...coverageBranches],attempts:coverageAttempts,births:coverageBirths,totalGraphs:Object.values(graphs).filter(g=>autoCoverage||coverageBranches.size?(!coverageBranches.size||coverageBranches.has(g.branch)):branches.get(g.branch).choices.path===coveragePath).length,origins:[...new Set(Object.values(graphs).filter(g=>autoCoverage||coverageBranches.size?(!coverageBranches.size||coverageBranches.has(g.branch)):branches.get(g.branch).choices.path===coveragePath).map(g=>g.origin))]},previousBranchWave:prior?.summary?.mergedBranchCoverage||prior?.summary?.previousBranchWave||null,terminalSupply:supply.summary(),researchFollowThrough:{processed:Object.keys(followThrough).length,successful:Object.values(followThrough).filter(r=>r.outcomes.some(e=>["CONDITIONAL_REPLAY","CONDITIONAL_ALIAS","EXISTING_REPLAY"].includes(e.status))).length,chainSeeds:chainSeeds.size,pendingChain:[...chainSeeds.values()].filter(t=>graphs[t.id]?.nodes[t.node]&&!graphs[t.id].nodes[t.node].edges).length},traitFrontier:{...frontier.metrics,rootReplay:birthReplay.metrics,maxTraits:Math.max(...Object.values(graphs).flatMap(g=>g.nodes.map(n=>n.traits.length)))},published:Object.keys(routes).length,earlyBirths:Object.values(graphs).filter(g=>g.mode==="EARLY_BIRTH").length,directBirths:Object.values(graphs).filter(g=>g.mode==="DIRECT_ACTIVE").length,round,actualGameCertified:0};

phase("publication assembled");
const sourceGraphSha256=key(graphs),out={schema:POLICY,fingerprint,sourceMetadataSha256:db.sourceMetadataSha256,sourceGraphSha256,scope:"Conditional minimum birth and subsequent growth/active research transformation paths. Real campaign resources, time and full research alternatives remain unproved.",targets,summary,graphs,attempts,careerResearch,templates,routes,nodes,actionNodes,indexRoutes,migration,closureWave:{records:closureWave.records,metrics:closureWave.metrics},stagedPrefixes,repairedStages,sharedIndex:{records:shared.records},traitSchedule:frontier.schedule,followThrough,terminalResearch:{...terminal.summary(),records:terminal.records,anchors:terminal.anchors},endStage:{...endStage.summary(),records:endStage.records,research:endStage.research,turns:endStage.turns},resetRecovery:{...recovery.summary(),records:recovery.records,turns:recovery.turns},traitChain:{...traitChain.summary(),records:traitChain.records,turns:traitChain.turns,groupTurns:traitChain.groupTurns,paretoReceipts:traitChain.paretoReceipts},terminalSupply:{...supply.summary(),sourceEvidence:supply.sourceEvidence,plans:supply.plans,front:supply.front,records:supply.records,attempted:supply.attempted,resourceResearch:supply.resourceResearch},chainSeeds:[...chainSeeds.values()]};
 // Keep route and witness data together, expose a separate compact index only
 // for the existing comparison table's lazy action-history view.
phase("serialize ledger");
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(out)));fs.renameSync(file+".tmp",file);

fs.writeFileSync("public/data/soldier-population-missing-origin-career-index.json.gz",gzipSync(JSON.stringify({sourceMetadataSha256:db.sourceMetadataSha256,sourceGraphSha256,nodes,actionNodes,routes:indexRoutes})));
fs.writeFileSync("public/branch-soldier-missing-origin-summary.js","export const missingOriginSummary="+JSON.stringify({...summary,sourceMetadataSha256:db.sourceMetadataSha256,details:targets.map(id=>({id,name:profiles.get(id).sourceKoName,attempts:Object.values(attempts).filter(a=>a.origin===id).length,graphs:Object.values(graphs).filter(g=>g.origin===id).length,routes:Object.values(routes).filter(r=>r.origin===id).length}))})+";\n");
console.log(JSON.stringify(summary));
