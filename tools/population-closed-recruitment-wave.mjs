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
const MODE="TERMINAL_CLOSED_RECRUITMENT_V1";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const researchKinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch","advanceMonth","campaignContext","externalInputs"]);
const soldierKinds=new Set(["recruit","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"]);
export function createClosedRecruitmentWave({db,data,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,stagedPrefixes,selectPlanner,insert,enqueue,materialPolicy,deadline,focus=[]}){
 const sets=db.careerCompletion?.researchTraitSets,first=createFirstSuccessorIndex(data),finite=Object.fromEntries(materialPolicy.finite);
 const closed=db.careerCompletion?.finalCareerAdmission?.rows||[],covered=new Set(),branchTurns=new Map(),originTurns=new Map(),goalTurns=new Map();
 for(const row of closed){const p=sets?.pairs[row.id];if(!p)continue;covered.add(key([p.origin,p.branch,p.pathId]));branchTurns.set(p.branch,(branchTurns.get(p.branch)||0)+1);}
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
 const metrics={policy:MODE,eligibleOrigins:candidates.map(x=>x.p.id),donors:0,jobs:0,attempts:0,births:0,transformed:0,closedCandidates:0,newBranches:[],partial:0,addedResearch:0,plannerCalls:0,donorReplays:0,reusedDonors:0,alreadyClosed:0,failures:{},outcomes:[]};
 const previous=new Map(),published=new Map(),donors=new Map(),used=new Set();
 for(const a of Object.values(attempts))if(a.mode===MODE){const k=key([a.origin,a.donorHash]);const prev=previous.get(k);if(!prev||a.variant>prev.variant)previous.set(k,a);originTurns.set(a.origin,(originTurns.get(a.origin)||0)+1);if(a.status==="CONDITIONAL_CLOSED_CANDIDATE")goalTurns.set(a.target,(goalTurns.get(a.target)||0)+1);}
 const ready=(t,w)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
 const branchOK=(b,w)=>commit(b).every(k=>active(w,k))&&![...w.researched].some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!commit(b).includes(k));
 for(const pair of Object.values(sets?.pairs||{})){
  const path=sets.paths[pair.pathId],b=branches.get(pair.branch);if(!path||!b||b.sourceRootConflict)continue;
  const rid=pair.routes[0],raw=db.populationMissingOriginCareer?.routes?.[rid],g=raw&&graphs[raw.sourceGraph],n=g?.nodes[raw.sourceNode];
  if(!n||g.blocker)continue;
  const full=[...g.birthActions,...stepsFor(g,raw.sourceNode)];
  if(full.some(a=>!researchKinds.has(a.type)&&!soldierKinds.has(a.type)))continue;
  const actions=full.filter((a,i)=>researchKinds.has(a.type)&&!(a.type==="externalInputs"&&soldierKinds.has(full[i+1]?.type)));
  const id=key([b.id,actions]);if(donors.has(id))continue;
  const activeTopics=new Set(path.active),keep=new Set(commit(b)),blocked=new Set(b.blockedResearch||[]);
  const goals=terminalRule.targets.filter(t=>t.researchGoals.every(k=>activeTopics.has(k))&&!(t.inactiveResearch||[]).some(k=>activeTopics.has(k))).map(t=>t.id);
  if(!goals.length)continue;
  donors.set(id,{id,b,rid,pathId:pair.pathId,actions,activeTopics,goals,possible:candidates.filter(x=>x.goals.every(k=>!blocked.has(k)&&(!allChoice.has(k)||keep.has(k))))});
 }
 metrics.donors=donors.size;
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
   if(covered.has(key([p.id,d.b.id,d.pathId]))){metrics.alreadyClosed++;continue;}
   const k=key([p.id,d.id]),old=previous.get(k);
   if(old?.status==="CONDITIONAL_CLOSED_CANDIDATE")continue;
   const missing=goals.filter(k=>!d.activeTopics.has(k)),variant=(old?.variant??-1)+1;
   jobs.push({d,p,r,goals,k,old,missing,variant});
  }
  metrics.jobs=jobs.length;
  while(metrics.closedCandidates<limit&&metrics.attempts<maxAttempts&&performance.now()<deadline()){
   // Missing research count is a scheduling hint. Prefer exact ready donors,
   // then less-sampled origin/branch/ending combinations. Never prune other
   // paths just because their heuristic cost is larger.
   jobs.sort((a,b)=>a.missing.length-b.missing.length||Number(!!b.old?.stage)-Number(!!a.old?.stage)||(branchTurns.get(a.d.b.id)||0)-(branchTurns.get(b.d.b.id)||0)||(originTurns.get(a.p.id)||0)-(originTurns.get(b.p.id)||0)||Math.min(...a.d.goals.map(k=>goalTurns.get(k)||0))-Math.min(...b.d.goals.map(k=>goalTurns.get(k)||0))||a.variant-b.variant||a.d.actions.length-b.d.actions.length||a.k.localeCompare(b.k));
   const j=jobs.find(x=>!used.has(x.k)&&!failedDonors.has(x.d.id)&&!covered.has(key([x.p.id,x.d.b.id,x.d.pathId])));
   if(!j)break;
   const {d,p,r,goals,k,old,variant}=j;used.add(k);metrics.attempts++;originTurns.set(p.id,(originTurns.get(p.id)||0)+1);
   const aid=key([k,MODE,variant]),rec={origin:p.id,branch:d.b.id,prefix:d.id,mode:MODE,donor:d.rid,donorHash:d.id,variant,goals,missing:j.missing, status:"LIMITED_UNRESOLVED"};attempts[aid]=rec;
   try{
    let w,full=d.actions.slice();try{w=donorWorld(d);}catch(e){failedDonors.add(d.id);throw e;}
    const targets=terminalRule.targets.filter(t=>ready(t,w));
    const allowed=(z,actions)=>!z.pendingFree&&branchOK(d.b,z)&&targets.some(t=>ready(t,z))&&context(d.b.id,{allowedDifficulties:[0,1,2,3,4]},actions,z).length>0;
    if(old?.stage&&stagedPrefixes[old.stage]){
     const s=stagedPrefixes[old.stage],z=prefix.load({id:old.stage,actions:s.actions});
     if(s.branch===d.b.id&&!member(z)&&allowed(z,s.actions)){w=z;full=s.actions.slice();}
    }
    if(!goals.every(k=>active(w,k))){
     const planner=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,d.b);
     const q=createStagedResearch({planner,active,accept:(_,z)=>allowed(z.world,z.steps),deadline:Math.min(deadline(),performance.now()+6500),maxCalls:16,maxDepth:24,variant}).run({world:w,steps:full,trace:[],diagnostics:[]},goals);
     metrics.plannerCalls+=q.stats.calls;rec.remaining=q.remaining;rec.failures=q.failures.slice(-3);
     const suffix=q.node.steps.slice(full.length),end=suffix.length?replay.replay(suffix,w):w;
     if(exactWorld(end)!==exactWorld(q.node.world)||!allowed(end,q.node.steps))throw Error("RECRUITMENT_EXTENSION_REPLAY");
     materialPolicy.check({birthActions:q.node.steps},null,[]);
     rec.added=[...end.researched].filter(k=>active(end,k)&&!active(w,k));metrics.addedResearch+=rec.added.length;
     if(suffix.length){const sid=key([d.b.id,q.node.steps]);stagedPrefixes[sid]??={branch:d.b.id,actions:q.node.steps,source:{kind:"closedRecruitmentExtension",id:d.id,origin:p.id,completed:q.completed,remaining:q.remaining},active:[...end.researched].filter(k=>active(end,k)).sort(),month:end.month};rec.stage=sid;}
     if(!q.complete){rec.status=suffix.length?"PARTIAL_RESEARCH":"LIMITED_UNRESOLVED";metrics.partial+=Number(!!suffix.length);continue;}
     w=end;full=q.node.steps.slice();
    }
    let z=w;
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
    const target=ts[0].id;rec.status="CONDITIONAL_CLOSED_CANDIDATE";rec.graph=gid;rec.node=to;rec.target=target;rec.stateHash=g.nodes[to].stateHash;rec.terminalGoals=ts.map(t=>t.id);
    metrics.closedCandidates++;metrics.outcomes.push({origin:p.id,branch:d.b.id,graph:gid,node:to,added:rec.added?.length||0,target});
    if(!branchTurns.has(d.b.id))metrics.newBranches.push(d.b.id);
    branchTurns.set(d.b.id,(branchTurns.get(d.b.id)||0)+1);goalTurns.set(target,(goalTurns.get(target)||0)+1);
    covered.add(key([p.id,d.b.id,d.pathId]));
   }catch(e){rec.reason=String(e.message||e).slice(0,180);metrics.failures[rec.reason]=(metrics.failures[rec.reason]||0)+1;}
  }
  metrics.replay=prefix.metrics;
 }
 return {run,metrics,publishedNodes:id=>[...(published.get(id)||[])]};
}
