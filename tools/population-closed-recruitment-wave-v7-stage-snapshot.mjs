// Produce genuinely new terminal careers for already-known origins.
// Donor research is a proposal: replay from foundation without donor soldier
// actions, solve missing recruitment / final transformation prerequisites,
// recruit the actual profile, then execute the one-shot transformation and cap
// growth. An independent final gate still decides publication.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createFirstSuccessorIndex} from "./atlas-first-successor-obligations.mjs";
import {createSharedPrefixReplay} from "./population-shared-prefix-replay-v3-benefit.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
import {createResearchFragmentIndex} from "./population-research-fragments-v2-ready.mjs";
import {createTransactionReadiness} from "./population-research-transaction-readiness.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
const MODE="TERMINAL_CLOSED_RECRUITMENT_V1",REVISION="PATH_BALANCED_CLOSED_RECRUITMENT_V7_STAGE_SNAPSHOT";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
import {projectResearchDonor} from "./population-research-donor-projection.mjs";
export function createClosedRecruitmentWave({db,data,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,stagedPrefixes,selectPlanner,insert,enqueue,materialPolicy,deadline,focus=[],focusResume=false,choiceFork=true,focusPaths=[],diversePaths=true}){
 const sets=db.careerCompletion?.researchTraitSets,first=createFirstSuccessorIndex(data),finite=Object.fromEntries(materialPolicy.finite);
 const closed=db.careerCompletion?.finalCareerAdmission?.rows||[],covered=new Set(),branchTurns=new Map(),originTurns=new Map(),goalTurns=new Map(),pathTurns=new Map(),pathAttempts=new Map(),branchAttempts=new Map(),originBranchTurns=new Map(),pathScope=new Set(focusPaths);
 for(const row of closed){const p=sets?.pairs[row.id];if(!p)continue;covered.add(key([p.origin,p.branch,p.pathId]));branchTurns.set(p.branch,(branchTurns.get(p.branch)||0)+1);if(p.body!=="STR_SOLDIER_CHORT"){const path=branches.get(p.branch)?.choices.path;pathTurns.set(path,(pathTurns.get(path)||0)+1);const k=key([p.origin,p.branch]);originBranchTurns.set(k,(originBranchTurns.get(k)||0)+1);}}
 const candidates=[];
 // No hand-written list of bodies. This lane handles bodies whose complete
 // first-action inventory consists of zero or one irreversible live action.
 // All other bodies remain with the general continuation producer.
 for(const p of profiles.values()){
  if(p.sourceType==="event"||focus.length&&!focus.includes(p.id))continue;
  const rules=(first.byBody.get(p.soldierType)||[]).filter(r=>!r.requires.includes("STR_UNAVAILABLE")&&!r.forbiddenSoldierTypes?.includes(p.soldierType));
  if(rules.length>1)continue;
  const r=rules[0]||null;
  if(r&&(!r.allowsLiveSoldiers||r.createsClone||r.reset||r.producedItem||r.producedSoldierType&&r.producedSoldierType!==p.soldierType||!r.forbiddenPreviousTransformations?.includes(r.id)||r.removeTransformations?.includes(r.id)))continue;
  if(!first.unknown.length)candidates.push({p,r,goals:[...new Set([...p.requires,...(r?.requires||[])])]});
 }
 const metrics={policy:MODE,stageSnapshots:0,stageReused:0,invalidStages:0,eligibleOrigins:candidates.map(x=>x.p.id),donors:0,jobs:0,attempts:0,births:0,transformed:0,closedCandidates:0,newBranches:[],partial:0,addedResearch:0,plannerCalls:0,donorReplays:0,reusedDonors:0,alreadyClosed:0,resumed:0,resumedWithoutProgress:0,fragmentCount:0,fragmentTrials:0,fragmentApplied:0,fragmentRejected:0,fragmentResearch:0,fragmentComplete:0,preflightRejected:0,choiceForks:0,choiceForkReady:0,choiceForkPartial:0,choiceForkReplayTrials:0,choiceForkReplayAccepted:0,choiceForkPreflightSkipped:0,choiceForkConflicts:0,choiceForkResumed:0,choiceForkAvoided:0,pivotJobs:0,pivotAttempts:0,pivotReady:0,pivotPartial:0,pivotBranches:[],pathCandidates:{},pathAttempts:{},pathCompleted:{},pathBefore:Object.fromEntries(pathTurns),pathAfter:{},difficultyLanes:{},failures:{},outcomes:[]};
 const previous=new Map(),published=new Map(),donors=new Map(),used=new Set();
 // Hash the owned snapshot, not a working array that can acquire a recruit.
 const stageValidity=new Map();
 function readStage(id){
  if(!id)return null;
  const p=stagedPrefixes[id];if(!p)return null;
  if(p.source?.kind!=="closedRecruitmentExtension")return null;
  if(!stageValidity.has(id)){
   const ok=Array.isArray(p.actions)&&!p.actions.some(a=>a.type==="recruit"||a.type==="transform"||a.type==="conditionalCapGrowth"||a.type==="conditionalPromotion"||a.type==="conditionalMedal")&&key([p.branch,p.actions])===id;
   stageValidity.set(id,ok);if(!ok)metrics.invalidStages++;
  }
  return stageValidity.get(id)?p:null;
 }
 function saveStage(branch,actions,source,w){
  const snapshot=structuredClone(actions),id=key([branch,snapshot]);
  if(stagedPrefixes[id]){
   if(!readStage(id))throw Error("STAGE_CONTENT_ADDRESS_CONFLICT");
   metrics.stageReused++;
  }else{
   if(snapshot.some(a=>["recruit","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"].includes(a.type)))throw Error("STAGE_CONTAINS_SOLDIER_ACTION");
   stagedPrefixes[id]={branch,actions:snapshot,source:structuredClone(source),active:[...w.researched].filter(k=>active(w,k)).sort(),month:w.month};
   stageValidity.set(id,true);metrics.stageSnapshots++;
  }
  return id;
 }
 for(const a of Object.values(attempts))if(a.mode===MODE){const k=key([a.origin,a.donorHash]);const prev=previous.get(k);if(!prev||a.variant>prev.variant)previous.set(k,a);originTurns.set(a.origin,(originTurns.get(a.origin)||0)+1);if(a.status==="CONDITIONAL_CLOSED_CANDIDATE")goalTurns.set(a.target,(goalTurns.get(a.target)||0)+1);}
 const ready=(t,w)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
 const branchOK=(b,w)=>commit(b).every(k=>active(w,k))&&![...w.researched].some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!commit(b).includes(k));
 for(const pair of Object.values(sets?.pairs||{})){
  const path=sets.paths[pair.pathId],b=branches.get(pair.branch);if(!path||!b||b.sourceRootConflict)continue;
  const rid=pair.routes[0],raw=db.populationMissingOriginCareer?.routes?.[rid],g=raw&&graphs[raw.sourceGraph],n=g?.nodes[raw.sourceNode];
  if(!n||g.blocker)continue;
  const full=[...g.birthActions,...stepsFor(g,raw.sourceNode)];
  const actions=projectResearchDonor(full);if(!actions)continue;
  const id=key([b.id,actions]);if(donors.has(id))continue;
  const activeTopics=new Set(path.active),keep=new Set(commit(b)),blocked=new Set(b.blockedResearch||[]);
  const goals=terminalRule.targets.filter(t=>t.researchGoals.every(k=>activeTopics.has(k))&&!(t.inactiveResearch||[]).some(k=>activeTopics.has(k))).map(t=>t.id);
  if(!goals.length)continue;
  donors.set(id,{id,b,rid,pathId:pair.pathId,actions,activeTopics,goals,possible:candidates.filter(x=>x.goals.every(k=>!blocked.has(k)&&(!allChoice.has(k)||keep.has(k))))});
 }
 metrics.donors=donors.size;
 // Preserve entire triggering research transactions, including free rewards.
 const fragments=createResearchFragmentIndex(data),readiness=createTransactionReadiness(data);for(const d of donors.values())fragments.add(d.actions,d.rid);
 for(const id of Object.keys(stagedPrefixes)){const p=readStage(id);if(p)fragments.add(p.actions,id);}
 metrics.fragmentCount=fragments.size;
 // Find observed alternate irreversible choices on successful research
 // histories. A successful donor suggests a different campaign, not proof
 // that every other campaign is impossible.
 const reenabled=new Set(Object.values(data.researchRules).flatMap(r=>r.reenables||[]));
 const reciprocal=new Map();
 for(const [k,r] of Object.entries(data.researchRules))if(r.cost>0&&!reenabled.has(k))for(const alt of r.disables||[]){
  const q=data.researchRules[alt];if(q?.cost>0&&!reenabled.has(alt)&&q.disables?.includes(k)){const a=reciprocal.get(k)||[];a.push(alt);reciprocal.set(k,a);}
 }
 const readyDonors=new Map();
 for(const x of candidates){const ds=[...donors.values()].filter(d=>x.goals.every(k=>d.activeTopics.has(k)));readyDonors.set(x.p.id,ds);}
 function hint(p,b,topics,actions){
  if(!choiceFork||!actions.length)return null;
  const activeSet=new Set(topics),allowedChoice=new Set(commit(b)),forbid=new Set(b.blockedResearch||[]),ds=readyDonors.get(p.id)||[];
  for(const [i,a] of actions.entries()){
   if(a.type!=="research"||!activeSet.has(a.id))continue;
   for(const alt of reciprocal.get(a.id)||[]){
    if(forbid.has(alt)||allChoice.has(alt)&&!allowedChoice.has(alt)||allowedChoice.has(a.id))continue;
    // Only observed direct lab choices are forked. This never adds the
    // alternate choice to an already incompatible world.
    // If a complete donor has the same choice, the opposite choice is not
    // established as necessary for this goal. Preserve the current campaign.
    if(ds.some(d=>d.activeTopics.has(a.id)))continue;
    const support=ds.filter(d=>d.activeTopics.has(alt)&&d.actions.some(x=>x.type==="research"&&x.id===alt));
    if(support.length&&data.researchRules[a.id].dependencies.every(k=>data.researchRules[alt].dependencies.includes(k))&&data.researchRules[alt].dependencies.every(k=>data.researchRules[a.id].dependencies.includes(k)))return {from:a.id,to:alt,at:i,support:support.length,sources:support.map(d=>d.rid)};
   }
  }
  return null;
 }
 function transactions(actions){
  const out=[];let pending=[];
  for(const a of actions){
   if(a.type==="externalInputs"){pending.push(a);continue;}
   if(a.type==="freeResearch"&&out.length&&!pending.length){out.at(-1).push(a);continue;}
   out.push([...pending,a]);pending=[];
  }
  if(pending.length)out.push(pending);
  return out;
 }
 function recordFragmentMetrics(f,rec){
  metrics.fragmentTrials+=f.metrics.trials;metrics.fragmentApplied+=f.metrics.applied;metrics.fragmentRejected+=f.metrics.rejected;metrics.fragmentResearch+=f.metrics.added;
  metrics.preflightRejected+=f.metrics.preflightRejected||0;rec.fragments=[...(rec.fragments||[]),...f.sources];
 }
 function forkResearch({j,rec,startActions,oldFork}){
  const {d,p,goals,variant}=j,b=d.b,keep=new Set(commit(b)),forbid=new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!keep.has(k))]);
  const fork=oldFork||j.fork,jobDeadline=Math.min(deadline(),performance.now()+13000);
  let full,w;
  if(oldFork){
   full=startActions.slice();w=prefix.load({id:rec.stage||key(full),actions:full});metrics.choiceForkResumed++;
  }else{
   // Retain only the actual chronological prefix before the incompatible
   // choice, then execute the observed alternate. Never edit world flags.
   full=startActions.slice(0,fork.at);w=prefix.load({id:key(full),actions:full});
   if(w.pendingFree||member(w)||w.researched.has(fork.from)||w.disabled.has(fork.to))throw Error("FORK_PREFIX_CONFLICT");
   const a={type:"research",id:fork.to};w=replay.apply(w,a);full.push(a);
   if(w.pendingFree||!active(w,fork.to)||!w.disabled.has(fork.from))throw Error("FORK_ALTERNATE_NOT_ESTABLISHED");
   metrics.choiceForks++;rec.previousStage=j.old?.stage||null;rec.forkPrefixLength=fork.at;rec.forkPrefixHash=key(full.slice(0,-1));
  }
  const valid=(a,z)=>!member(z)&&!z.pendingFree&&active(z,fork.to)&&!active(z,fork.from)&&![...z.researched].some(k=>forbid.has(k))&&[...keep].every(k=>!active(a,k)||active(z,k));
  if(!valid(w,w))throw Error("FORK_BRANCH_SCOPE");
  const accept=(a,z)=>valid(a.world,z.world)&&auditOriginCampaignContext(z.steps,data).kind==="compatible";
  const replayTx=tx=>{
   if(tx.some(a=>a.type==="campaignContext"||a.id===fork.from||a.research===fork.from||forbid.has(a.id)||forbid.has(a.research))){metrics.choiceForkConflicts++;return false;}
   if(tx.every(a=>a.type==="externalInputs"))return false;
   if(tx.some(a=>a.type==="advanceMonth"&&a.month<=w.month)){metrics.choiceForkPreflightSkipped++;return false;}
   const reason=readiness.check(w,tx);if(reason){metrics.choiceForkPreflightSkipped++;return false;}
   metrics.choiceForkReplayTrials++;
   try{
    const z=replay.replay(tx,w);
    if(!valid(w,z)||tx.some(a=>a.type==="eventResearch"||a.type==="missionResearch")&&auditOriginCampaignContext([...full,...tx],data).kind!=="compatible")throw Error("CHOICE_FORK_CONTEXT");
    w=z;full.push(...tx);metrics.choiceForkReplayAccepted++;return true;
   }catch{return false;}
  };
  if(!oldFork){
   const txs=transactions(startActions.slice(fork.at+1)),passDeadline=Math.min(jobDeadline-4500,performance.now()+6500);
   for(const tx of txs){if(performance.now()>=passDeadline)break;replayTx(tx);}
  }
  const planner=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b);
  const possibleTargets=terminalRule.targets.filter(t=>!t.researchGoals.some(k=>forbid.has(k))&&!t.inactiveResearch?.some(k=>active(w,k)));
  if(!possibleTargets.length)throw Error("CHOICE_FORK_TERMINAL_SCOPE");
  const target=possibleTargets.sort((a,b)=>a.researchGoals.filter(k=>!active(w,k)).length-b.researchGoals.filter(k=>!active(w,k)).length||Number(d.goals.includes(b.id))-Number(d.goals.includes(a.id))||a.id.localeCompare(b.id))[0];
  const required=[...new Set([...keep,...goals,...target.researchGoals,fork.to])];
  const goalReady=()=>required.every(k=>active(w,k))&&ready(target,w);
  function propose(ms){
   const start={world:w,steps:full},f=fragments.propose({world:w,goals:required,planner,replay,allowed:(a,z)=>![...z.researched].some(k=>forbid.has(k))&&active(z,fork.to)&&!active(z,fork.from)&&[...keep].every(k=>!active(a,k)||active(z,k)),accept:(suffix,z)=>accept(start,{world:z,steps:[...full,...suffix]}),deadline:Math.min(jobDeadline,performance.now()+ms),maxTrials:220,maxChunks:100,preferredSources:new Set(fork.sources||[])});
   recordFragmentMetrics(f,rec);w=f.world;full=[...full,...f.steps];
  }
  if(!goalReady())propose(3000);
  if(!goalReady()&&performance.now()<jobDeadline){
   const q=createStagedResearch({planner,active,accept,deadline:Math.min(jobDeadline,performance.now()+3600),maxCalls:20,maxDepth:Infinity,variant}).run({world:w,steps:full,trace:[],diagnostics:[]},required);
   metrics.plannerCalls+=q.stats.calls;rec.failures=q.failures.slice(-3);
   if(exactWorld(replay.replay(q.node.steps.slice(full.length),w))!==exactWorld(q.node.world))throw Error("CHOICE_FORK_STAGE_REPLAY");
   w=q.node.world;full=q.node.steps.slice();
  }
  if(!goalReady()&&performance.now()<jobDeadline)propose(1800);
  if(!valid(w,w)||auditOriginCampaignContext(full,data).kind!=="compatible")throw Error("CHOICE_FORK_FINAL_CONTEXT");
  materialPolicy.check({birthActions:full},null,[]);
  rec.forkChoice=fork;rec.forkTarget=target.id;
  rec.remaining=required.filter(k=>!active(w,k));rec.forkActive=[...w.researched].filter(k=>active(w,k)).length;
  rec.stage=saveStage(b.id,full,{kind:"closedRecruitmentExtension",id:d.id,origin:p.id,forkChoice:fork,remaining:rec.remaining},w);
  const complete=goalReady()&&branchOK(b,w);metrics.choiceForkReady+=Number(complete);metrics.choiceForkPartial+=Number(!complete);
  return {world:w,steps:full,complete,targets:terminalRule.targets.filter(t=>ready(t,w))};
 }
 const prefix=createSharedPrefixReplay(replay,{limit:6,checkpointLimit:96}),cache=new Map(),failedDonors=new Set();
 function donorWorld(d){
  if(cache.has(d.id)){metrics.reusedDonors++;return cache.get(d.id);}
  const w=prefix.load({id:d.id,actions:d.actions});
  if(member(w)||w.pendingFree||!branchOK(d.b,w)||!terminalRule.targets.some(t=>ready(t,w)))throw Error("DONOR_WORLD_NOT_TERMINAL");
  materialPolicy.check({birthActions:d.actions},null,[]);
  cache.set(d.id,w);if(cache.size>6)cache.delete(cache.keys().next().value);metrics.donorReplays++;return w;
 }
 function retain(id,i){const a=published.get(id)||new Set();a.add(i);published.set(id,a);enqueue(id,i);}
 function run(limit,maxAttempts=limit*3){
  const jobs=[];
  for(const d of donors.values())for(const {p,r,goals} of d.possible){
   if(pathScope.size&&!pathScope.has(d.b.choices.path))continue;
   if(covered.has(key([p.id,d.b.id,d.pathId]))){metrics.alreadyClosed++;continue;}
   const k=key([p.id,d.id]),old=previous.get(k);
   if(old?.status==="CONDITIONAL_CLOSED_CANDIDATE")continue;
   const stage=readStage(old?.stage);
   const topics=stage?new Set(stage.active):d.activeTopics;
   const missing=goals.filter(k=>!topics.has(k)),variant=(old?.variant??-1)+1;
   const directDeps=[...new Set(goals.flatMap(k=>data.researchRules[k]?.dependencies||[]))];
   const depMissing=directDeps.filter(k=>!topics.has(k)).length;
   const oldFork=old?.forkChoice&&stage?.active?.includes(old.forkChoice.to)?old.forkChoice:null;
   const fork=oldFork||hint(p,d.b,topics,stage?.actions||d.actions);
   jobs.push({d,p,r,goals,k,old,missing,variant,depMissing,hasStage:!!stage,oldFork,fork});
  }
  // Start a different branch from an exact alternate prefix only when all
  // existing explicit commitments survive and a successful donor supports
  // the replacement. This is a new chronology, not editing world flags.
  const pivotBest=new Map();
  for(const old of previous.values()){
   if(!old.forkChoice||!old.stage||old.status==="CONDITIONAL_CLOSED_CANDIDATE")continue;
   const stage=readStage(old.stage),source=branches.get(old.branch),cand=candidates.find(x=>x.p.id===old.origin);
   if(!stage||!source||!cand||stage.branch!==source.id||!stage.active.includes(old.forkChoice.to))continue;
   const {p,r,goals}=cand,topics=new Set(stage.active),activeCommit=[...allChoice].filter(k=>topics.has(k)),sourceKeep=commit(source),missingCommit=sourceKeep.filter(k=>!topics.has(k));
   if(!missingCommit.length)continue;
   for(const b of branches.values()){
    if(b.id===source.id||b.sourceRootConflict||!b.historyCount||pathScope.size&&!pathScope.has(b.choices.path))continue;
    const keep=commit(b),kset=new Set(keep);
    if(!activeCommit.every(k=>kset.has(k))||!sourceKeep.filter(k=>topics.has(k)).every(k=>kset.has(k))||keep.filter(k=>!sourceKeep.includes(k)).length!==1)continue;
    const changed=Object.keys(source.choices||{}).filter(k=>source.choices[k]!==b.choices[k]);
    if(changed.length!==1||!missingCommit.includes(source.choices[changed[0]])||key(b.captain)!==key(source.captain))continue;
    const replacement=b.choices[changed[0]],support=(readyDonors.get(p.id)||[]).filter(d=>d.activeTopics.has(old.forkChoice.to)&&d.activeTopics.has(replacement)&&d.b.choices[changed[0]]===replacement);
    if(!support.length)continue;
    const forbidden=new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!kset.has(k))]);
    if([...topics].some(k=>forbidden.has(k)))continue;
    const did=key([b.id,stage.actions]),k=key([p.id,did]),priorPivot=previous.get(k);
    if(priorPivot?.status==="CONDITIONAL_CLOSED_CANDIDATE")continue;
    const s=readStage(priorPivot?.stage)||stage;
    if(s!==stage&&s.branch!==b.id)continue;
    const d={id:did,b,rid:old.donor,pathId:did,actions:s.actions,activeTopics:new Set(s.active),goals:old.forkTarget?[old.forkTarget]:[],possible:[cand]};
    const fork={...old.forkChoice,sources:[...new Set([...(old.forkChoice.sources||[]),...support.map(x=>x.rid)])]};
    const missing=goals.filter(k=>!d.activeTopics.has(k)),depMissing=[...new Set(goals.flatMap(k=>data.researchRules[k]?.dependencies||[]))].filter(k=>!d.activeTopics.has(k)).length;
    const j={d,p,r,goals,k,old:{...old,...priorPivot,stage:s===stage?old.stage:priorPivot.stage},missing,variant:(priorPivot?.variant??-1)+1,depMissing,hasStage:true,oldFork:fork,fork,pivot:{source:source.id,sourceStage:old.stage,dimension:changed[0],from:source.choices[changed[0]],to:replacement},support:support.length};
    const group=p.id+"|"+b.id,prev=pivotBest.get(group),score=(goals.length-missing.length)*100000+(10-depMissing)*10000+s.active.length;
    if(!prev||score>prev.score)pivotBest.set(group,{j,score});
   }
  }
  const pivots=[...pivotBest.values()].map(x=>x.j);metrics.pivotJobs=pivots.length;jobs.push(...pivots);
  // A lane is a scheduling policy, not a search-space exclusion. Rank
  // distinct origin/branch pairs and underrepresented paths before repeatedly
  // manufacturing more histories on the same already-covered branch.
  const pathOf=j=>j.d.b.choices.path;
  for(const j of jobs){const k=pathOf(j);metrics.pathCandidates[k]=(metrics.pathCandidates[k]||0)+1;}
  metrics.jobs=jobs.length;
  while(metrics.closedCandidates<limit&&metrics.attempts<maxAttempts&&performance.now()<deadline()){
   // Missing research count is a scheduling hint. Prefer exact ready donors,
   // then less-sampled origin/branch/ending combinations. Never prune other
   // paths just because their heuristic cost is larger.
   jobs.sort((a,b)=>(diversePaths?((pathAttempts.get(pathOf(a))||0)-(pathAttempts.get(pathOf(b))||0)||(pathTurns.get(pathOf(a))||0)-(pathTurns.get(pathOf(b))||0)||(branchTurns.get(a.d.b.id)||0)-(branchTurns.get(b.d.b.id)||0)||(branchAttempts.get(a.d.b.id)||0)-(branchAttempts.get(b.d.b.id)||0)||(originBranchTurns.get(key([a.p.id,a.d.b.id]))||0)-(originBranchTurns.get(key([b.p.id,b.d.b.id]))||0)):0)||Number(!!b.pivot)-Number(!!a.pivot)||(focusResume?Number(!!b.fork)-Number(!!a.fork)||Number(b.hasStage)-Number(a.hasStage):0)||a.missing.length-b.missing.length||a.depMissing-b.depMissing||Number(b.hasStage)-Number(a.hasStage)||(branchTurns.get(a.d.b.id)||0)-(branchTurns.get(b.d.b.id)||0)||(originTurns.get(a.p.id)||0)-(originTurns.get(b.p.id)||0)||Math.min(...a.d.goals.map(k=>goalTurns.get(k)||0))-Math.min(...b.d.goals.map(k=>goalTurns.get(k)||0))||a.variant-b.variant||a.d.actions.length-b.d.actions.length||a.k.localeCompare(b.k));
   const j=jobs.find(x=>!used.has(x.k)&&!failedDonors.has(x.d.id)&&!covered.has(key([x.p.id,x.d.b.id,x.d.pathId]))&&(!focusResume||!x.oldFork||x.pivot));
   if(!j)break;
   const {d,p,r,goals,k,old,variant}=j;used.add(k);metrics.attempts++;originTurns.set(p.id,(originTurns.get(p.id)||0)+1);pathAttempts.set(pathOf(j),(pathAttempts.get(pathOf(j))||0)+1);branchAttempts.set(d.b.id,(branchAttempts.get(d.b.id)||0)+1);
   const aid=key([k,MODE,variant]),rec={origin:p.id,branch:d.b.id,prefix:d.id,mode:MODE,donor:d.rid,donorHash:d.id,variant,revision:REVISION,goals,missing:j.missing,...(j.pivot?{pivot:j.pivot}:{}), status:"LIMITED_UNRESOLVED"};attempts[aid]=rec;
   try{
    let w,full=d.actions.slice();try{w=j.pivot?prefix.load({id:d.id,actions:full}):donorWorld(d);}catch(e){failedDonors.add(d.id);throw e;}
    if(j.pivot)metrics.pivotAttempts++;
    let targets=terminalRule.targets.filter(t=>ready(t,w));
    const allowed=(z,actions)=>!z.pendingFree&&branchOK(d.b,z)&&targets.some(t=>ready(t,z))&&context(d.b.id,{allowedDifficulties:[0,1,2,3,4]},actions,z).length>0;
    if(j.fork){
     const stage=readStage(old?.stage);rec.stage=old?.stage||null;
     const q=forkResearch({j,rec,startActions:stage?.actions||full,oldFork:j.oldFork});
     w=q.world;full=q.steps.slice();targets=q.targets;
     if(!q.complete){rec.status="PARTIAL_RESEARCH";metrics.partial++;if(j.pivot)metrics.pivotPartial++;continue;}
     if(j.pivot){metrics.pivotReady++;metrics.pivotBranches.push(d.b.id);}
    }else if(readStage(old?.stage)){
     const s=readStage(old.stage),z=prefix.load({id:old.stage,actions:s.actions});
     if(s.branch===d.b.id&&!member(z)&&allowed(z,s.actions)){w=z;full=s.actions.slice();rec.stage=old.stage;metrics.resumed++;}
    }
    if(!goals.every(k=>active(w,k))){
     const fixed=full[0]?.type==="campaignContext"?full[0].difficulty:null;
     const ctx=auditOriginCampaignContext(full,data);
     if(ctx.kind!=="compatible"||!ctx.allowedDifficulties.length)throw Error("CLOSED_RECRUITMENT_CONTEXT");
     const lanes=ctx.allowedDifficulties.slice().sort((a,b)=>Number(a===0)-Number(b===0)||a-b),lane=fixed??lanes[variant%lanes.length];
     metrics.difficultyLanes[lane]=(metrics.difficultyLanes[lane]||0)+1;rec.planningDifficulty=lane;
     const planner=selectPlanner(fixed,d.b,lane);
     const jobDeadline=Math.min(deadline(),performance.now()+8500);
     const initial={world:w,steps:full,trace:[],diagnostics:[]};
     const forbidden=new Set(d.b.blockedResearch||[]),keep=new Set(commit(d.b));
     const propose=(start,ms)=>fragments.propose({world:start.world,goals,planner,replay,allowed:(_,z)=>commit(d.b).every(k=>active(z,k))&&![...z.researched].some(k=>forbidden.has(k)||allChoice.has(k)&&!keep.has(k)),accept:(suffix,z)=>allowed(z,[...start.steps,...suffix]),deadline:Math.min(jobDeadline,performance.now()+ms),maxTrials:100,maxChunks:40});
     const recordFragments=f=>recordFragmentMetrics(f,rec);
     const f1=propose(initial,2500);recordFragments(f1);
     let node={world:f1.world,steps:[...initial.steps,...f1.steps],trace:[],diagnostics:[]},q;
     if(f1.complete){metrics.fragmentComplete++;q={node,complete:true,remaining:[],completed:goals,stats:{calls:0},failures:[]};}
     else{
      q=createStagedResearch({planner,active,accept:(_,z)=>allowed(z.world,z.steps),deadline:jobDeadline,maxCalls:8,maxDepth:Infinity,variant}).run(node,goals);
      if(!q.complete&&performance.now()<jobDeadline){const f2=propose(q.node,1500);recordFragments(f2);q.node={...q.node,world:f2.world,steps:[...q.node.steps,...f2.steps]};q.remaining=goals.filter(k=>!active(q.node.world,k));q.complete=!q.remaining.length;if(q.complete)metrics.fragmentComplete++;}
     }
     metrics.plannerCalls+=q.stats.calls;rec.remaining=q.remaining;rec.failures=q.failures.slice(-3);
     const suffix=q.node.steps.slice(full.length),end=suffix.length?replay.replay(suffix,w):w;
     if(exactWorld(end)!==exactWorld(q.node.world)||!allowed(end,q.node.steps))throw Error("RECRUITMENT_EXTENSION_REPLAY");
     materialPolicy.check({birthActions:q.node.steps},null,[]);
     rec.added=[...end.researched].filter(k=>active(end,k)&&!active(w,k));metrics.addedResearch+=rec.added.length;
     if(suffix.length)rec.stage=saveStage(d.b.id,q.node.steps,{kind:"closedRecruitmentExtension",id:d.id,origin:p.id,completed:q.completed,remaining:q.remaining},end);
     if(!q.complete){rec.status=suffix.length?"PARTIAL_RESEARCH":"LIMITED_UNRESOLVED";metrics.partial+=Number(!!suffix.length);if(rec.stage&&!suffix.length)metrics.resumedWithoutProgress++;continue;}
     w=end;full=q.node.steps.slice();
    }
    let z=w;full=full.slice();
    const append=a=>{z=replay.apply(z,a);full.push(a);};
    const items={};for(const [k,n] of Object.entries(p.acquisitionRequiredItems||{})){const lack=Math.max(0,n-(z.items[k]||0));if(lack)items[k]=lack;}
    const functions=(p.requiresBaseFunc||[]).filter(k=>!z.baseFunctions.has(k)),funds=Math.max(0,(p.cost||0)-z.funds);
    if(Object.keys(items).length||functions.length||funds)append({type:"externalInputs",items,functions,funds,reason:"Conditional closed-career recruitment "+p.id,assumption:true});
    const birthAt=full.length,birthMonth=z.month;
    append({type:"recruit",soldier:"origin",profile:p.id,band:"min"});
    if(!allowed(z,full)||!member(z)?.state.exactStats)throw Error("BIRTH_CONTEXT");
    // Calculate the actual final actions BEFORE registering a graph. No
    // partially manufactured closure claim if transformation fails.
    let final={world:z,steps:[]};
    if(r&&!member(z).state.history.has(r.id)){final=replay.transform(final,r);if(!final)throw Error("ONE_SHOT_TRANSFORM_UNRESOLVED");}
    final=replay.grow(final);
    const finalActions=[...full,...final.steps],f=replay.finish(final.world),v=materialPolicy.check({birthActions:finalActions},null,[]);
    const state=member(final.world).state;
    const result=first.assess({body:state.soldierType,history:new Set(state.history.keys()),historyKnown:state.historyKnown!==false,active:new Set([...final.world.researched].filter(k=>active(final.world,k))),raw:f.raw,capRaw:f.capRaw,finite,consumed:v.consumed});
    if(!result.closed||!allowed(final.world,finalActions)||exactWorld(replay.replay(final.steps,z))!==exactWorld(final.world))throw Error("SUCCESSOR_STILL_OPEN");
    const n0=Object.keys(graphs).length,gid=register(p,d.b,{id:key([d.b.id,full.slice(0,birthAt)]),source:{kind:"closedRecruitmentExtension",id:d.rid,donorResearchHash:d.id}},{world:z,steps:full,birthMonth},birthAt,"RESEARCH_THEN_BIRTH",false);
    metrics.births+=Number(Object.keys(graphs).length>n0);
    const g=graphs[gid],ts=targets.filter(t=>ready(t,z));let rootReady=false;
    for(const t of ts){const k=key([gid,t.id]);if(terminal.anchors[k]?.status!=="CONDITIONAL_TARGET_RESEARCH_READY")terminal.run({id:gid,g,b:d.b,t,k,i:0,attempt:terminal.anchors[k]?.attempts||0});rootReady||=terminal.anchors[k]?.status==="CONDITIONAL_TARGET_RESEARCH_READY";}
    if(!rootReady)throw Error("MISSING_TERMINAL_ANCHOR");
    let to=0;
    if(final.steps.length){const e=insert(gid,g,final.world,0,"CLOSED_RECRUITMENT_FINAL",final.steps,true);to=e.to;metrics.transformed+=Number(e.status==="CONDITIONAL_REPLAY"&&!!r);}
    retain(gid,to);
    if(rec.stage&&!readStage(rec.stage))throw Error("STAGE_SNAPSHOT_LOST");
    const target=ts[0].id;rec.status="CONDITIONAL_CLOSED_CANDIDATE";rec.graph=gid;rec.node=to;rec.target=target;rec.stateHash=g.nodes[to].stateHash;rec.terminalGoals=ts.map(t=>t.id);
    metrics.closedCandidates++;metrics.outcomes.push({origin:p.id,branch:d.b.id,graph:gid,node:to,added:rec.added?.length||0,target});
    if(!branchTurns.has(d.b.id))metrics.newBranches.push(d.b.id);
    branchTurns.set(d.b.id,(branchTurns.get(d.b.id)||0)+1);goalTurns.set(target,(goalTurns.get(target)||0)+1);pathTurns.set(pathOf(j),(pathTurns.get(pathOf(j))||0)+1);metrics.pathCompleted[pathOf(j)]=(metrics.pathCompleted[pathOf(j)]||0)+1;originBranchTurns.set(key([p.id,d.b.id]),(originBranchTurns.get(key([p.id,d.b.id]))||0)+1);
    covered.add(key([p.id,d.b.id,d.pathId]));
   }catch(e){rec.reason=String(e.message||e).slice(0,180);metrics.failures[rec.reason]=(metrics.failures[rec.reason]||0)+1;}
  }
  metrics.replay=prefix.metrics;metrics.pathAttempts=Object.fromEntries(pathAttempts);metrics.pathAfter=Object.fromEntries(pathTurns);
 }
 return {run,metrics,publishedNodes:id=>[...(published.get(id)||[])]};
}
