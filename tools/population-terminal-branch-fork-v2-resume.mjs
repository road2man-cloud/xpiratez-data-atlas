// Fork a concrete research history before its first conflicting action.
// Reuse only successfully replayed transactions, never grant research sets.
// A bounded failed fork is not an impossibility proof.
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {key} from "./population-research-career-core.mjs";
import {member,exactWorld} from "./population-growth-replay-core.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
const MODE="TERMINAL_BRANCH_FORK_V1",REVISION="RESUME_EXACT_STAGE_V2",CHORT="STR_SOLDIER_CHORT";
const research=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch","advanceMonth","campaignContext","externalInputs"]);
const soldier=new Set(["recruit","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"]);
const primary=new Set(["research","repeatResearch","eventResearch","missionResearch"]);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
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
export function createTerminalBranchFork({db,data,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,stagedPrefixes,selectPlanner,deadline,focusBranches=[],focusOrigins=[]}){
 const stats={policy:REVISION,resumedDirect:0,resumedActionsAvoided:0,alreadyActiveTransactions:0,stageProgress:0,stageStalls:0,donors:0,jobs:0,attempts:0,completedBranches:0,births:0,partial:0,prefixActions:0,prefixCacheHits:0,suffixTrials:0,suffixAccepted:0,suffixActions:0,suffixRejected:0,plannerCalls:0,resumed:0,newBranches:[],outcomes:[],failures:{}};
 const fail=e=>{const k=String(e.message||e).slice(0,160);stats.failures[k]=(stats.failures[k]||0)+1;return k;};
 const sets=db.careerCompletion?.researchTraitSets,covered=new Set(Object.values(sets?.pairs||{}).map(p=>p.branch)),branchFocus=new Set(focusBranches),originFocus=new Set(focusOrigins);
 for(const id of branchFocus)if(!branches.has(id))throw Error("Unknown fork branch "+id);
 for(const id of originFocus)if(!profiles.has(id))throw Error("Unknown fork origin "+id);
 const targets=terminalRule.targets,ready=(t,w)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
 const donorMap=new Map(),byBranch=new Map();
 for(const pair of Object.values(sets?.pairs||{})){
  if(pair.body===CHORT)continue;
  const p=sets.paths[pair.pathId],r=sets.records[pair.routes[0]],rid=pair.routes[0],raw=db.populationMissingOriginCareer?.routes?.[rid],g=raw&&graphs[raw.sourceGraph],n=g?.nodes[raw.sourceNode],b=branches.get(pair.branch);
  if(!p||!r||!n||!b||r.stateHash!==n.stateHash)continue;
  const full=[...g.birthActions,...stepsFor(g,raw.sourceNode)];
  if(full.some(a=>!research.has(a.type)&&!soldier.has(a.type)))continue;
  const actions=full.filter((a,i)=>research.has(a.type)&&!(a.type==="externalInputs"&&soldier.has(full[i+1]?.type)));
  const id=key([b.id,actions]);if(donorMap.has(id))continue;
  const d={id,rid,b,origin:pair.origin,actions,tx:transactions(actions),topics:new Set(p.active),goals:r.goals};
  d.commit=new Set(commit(b));donorMap.set(id,d);
  const list=byBranch.get(b.id)||[];list.push(d);byBranch.set(b.id,list);
 }
 const donors=[];
 for(const list of byBranch.values()){
  list.sort((a,b)=>a.actions.length-b.actions.length||a.id.localeCompare(b.id));
  const used=new Set();
  for(const d of list){const sig=key([...d.topics].sort());if(used.has(sig))continue;used.add(sig);donors.push(d);if(used.size===3)break;}
 }
 stats.donors=donors.length;
 const prior=new Map(),stageByBranch=new Map();
 // Use the exact best stored stage for each target branch. Do not combine
 // different states or discard weaker witnesses; this only orders proposals.
 for(const [id,p] of Object.entries(stagedPrefixes)){
  if(p.source?.kind!=="terminalBranchFork"||key([p.branch,p.actions])!==id)continue;
  const b=branches.get(p.branch);if(!b)continue;
  const activeSet=new Set(p.active||[]),missing=commit(b).filter(k=>!activeSet.has(k)).length;
  const score=(commit(b).length-missing)*10000+activeSet.size;
  const old=stageByBranch.get(p.branch);
  if(!old||score>old.score)stageByBranch.set(p.branch,{id,p,score,missing});
 }
 for(const r of Object.values(attempts))if(r.mode===MODE){const k=key([r.branch,r.donorHash]);if(!prior.has(k)||(r.variant??0)>(prior.get(k).variant??0))prior.set(k,r);}
 const jobs=[];
 for(const b of branches.values()){
  if(covered.has(b.id)||branchFocus.size&&!branchFocus.has(b.id))continue;
  const keep=new Set(commit(b)),forbidden=new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!keep.has(k))]);
  if([...keep].some(k=>forbidden.has(k)))continue;
  const list=[];
  for(const d of donors){
   const old=prior.get(key([b.id,d.id]));
   if(old?.status==="CONDITIONAL_REPLAY")continue;
   // A new planner revision may solve formerly stalled stages. After that,
   // keep a finite per-revision retry allowance; other donors remain eligible.
   if(old?.revision===REVISION&&old.variant>=Math.max(4,(old.firstRevisionVariant??old.variant)+2))continue;
   const dist=[...keep].filter(k=>!d.commit.has(k)).length+[...d.commit].filter(k=>!keep.has(k)).length;
   if(dist>6)continue;
   let predicted=d.actions.findIndex(a=>forbidden.has(a.id)||forbidden.has(a.research));if(predicted<0)predicted=d.actions.length;
   const retained=old?.stage&&stagedPrefixes[old.stage]?{id:old.stage,p:stagedPrefixes[old.stage]}:stageByBranch.get(b.id);
   const ss=retained?.p,missing=ss?commit(b).filter(k=>!(ss.active||[]).includes(k)).length:99;
   const progressScore=ss?10000-missing*1200+Math.min(1500,ss.active?.length||0):0;
   list.push({b,d,keep,forbidden,old,retained,progressScore,dist,predicted,variant:(old?.variant??-1)+1});
  }
  list.sort((a,b)=>b.progressScore-a.progressScore||a.dist-b.dist||b.predicted-a.predicted||a.d.actions.length-b.d.actions.length);
  jobs.push(...list.slice(0,3));
 }
 jobs.sort((a,b)=>b.progressScore-a.progressScore||a.dist-b.dist||b.predicted-a.predicted||a.b.rank-b.b.rank||a.d.id.localeCompare(b.d.id));
 stats.jobs=jobs.length;
 // Cache successful source prefix worlds only, with a bounded number of
 // checkpoints. Exact histories are shared, not merged by research set.
 const cache=new Map();
 function applyTx(w,tx,keep,forbidden){
  let z=w;
  for(const a of tx){
   const v=replay.apply(z,a);
   if([...v.researched].some(k=>forbidden.has(k)&&!z.researched.has(k))||[...keep].some(k=>active(z,k)&&!active(v,k)))throw Error("FORK_BRANCH_CONFLICT");
   z=v;
  }
  if(z.pendingFree||member(z))throw Error("FORK_INCOMPLETE_TRANSACTION");
  return z;
 }
 function prefix(j){
  const {d,keep,forbidden}=j;
  let w=foundationWorld(),i=0,actions=[],history=cache.get(d.id);
  while(i<d.tx.length&&performance.now()<deadline()){
   const tx=d.tx[i],old=history?.[i];
   try{
    let z;
    if(old&&old.before===exactWorld(w)&&![...old.world.researched].some(k=>forbidden.has(k))&&[...keep].every(k=>!active(w,k)||active(old.world,k))){z=old.world;stats.prefixCacheHits+=tx.length;}
    else{z=applyTx(w,tx,keep,forbidden);stats.prefixActions+=tx.length;}
    if(!history){history=[];cache.set(d.id,history);if(cache.size>2)cache.delete(cache.keys().next().value);}
    // sparse checkpoints are enough; avoid retaining every full world.
    if(i%16===0)history[i]={before:exactWorld(w),world:z};
    w=z;actions.push(...tx);i++;
   }catch{break;}
  }
  return {world:w,actions,i};
 }
 function run(limit,maxAttempts=8){
  const used=new Set();
  for(const j of jobs){
   if(stats.births>=limit||stats.attempts>=maxAttempts||performance.now()>=deadline())break;
   const {b,d,keep,forbidden,old,variant,retained}=j;if(covered.has(b.id)||used.has(b.id))continue;used.add(b.id);
   stats.attempts++;
   const aid=key([b.id,d.id,MODE,variant]),rec={branch:b.id,origin:d.origin,donor:d.rid,donorHash:d.id,mode:MODE,variant,revision:REVISION,firstRevisionVariant:old?.revision===REVISION?old.firstRevisionVariant:variant,distance:j.dist};attempts[aid]=rec;
   try{
    const valid=(a,z)=>![...z.researched].some(k=>forbidden.has(k))&&[...keep].every(k=>!active(a,k)||active(z,k))&&!z.pendingFree&&!member(z);
    let first=null;
    // Replaying a recorded stage from the foundation is enough. Replaying
    // its earlier donor prefix as well is redundant. A failed restore falls
    // back to the original exact-prefix route.
    if(retained?.p&&retained.p.branch===b.id&&key([b.id,retained.p.actions])===retained.id){
     try{
      const s=retained.p,z=replay.replay(s.actions),actual=[...z.researched].filter(k=>active(z,k)).sort();
      if(!valid(foundationWorld(),z)||key(actual)!==key([...s.active].sort())||auditOriginCampaignContext(s.actions,data).kind!=="compatible")throw Error("FORK_STAGE_CONTEXT");
      // Recover only the truly common contiguous prefix, in whole transactions.
      let at=0,split=0;
      while(split<d.tx.length&&d.tx[split].every((a,k)=>at+k<s.actions.length&&key(a)===key(s.actions[at+k]))){at+=d.tx[split].length;split++;}
      first={world:z,actions:s.actions.slice(),i:split,resumed:true,common:at};
      stats.resumed++;stats.resumedDirect++;stats.resumedActionsAvoided+=at;
      rec.resumedStage=retained.id;rec.resumedActive=actual.length;
     }catch(e){rec.stageRestoreFailure=String(e.message);}
    }
    if(!first)first=prefix(j);
    let w=first.world,actions=first.actions,split=first.i;
    rec.commonPrefixLength=first.resumed?first.common:actions.length;rec.commonPrefixHash=key(actions.slice(0,rec.commonPrefixLength));rec.donorLength=d.actions.length;
    const initialActive=[...w.researched].filter(k=>active(w,k)).length;
    const endTime=Math.min(deadline(),performance.now()+11000);
    const planner=selectPlanner(actions[0]?.type==="campaignContext"?actions[0].difficulty:null,b);
    const stage=(goals,maxCalls)=>{
     if(goals.every(k=>active(w,k)))return;
     const q=createStagedResearch({planner,active,accept:(a,z)=>valid(a.world,z.world)&&auditOriginCampaignContext(z.steps,data).kind==="compatible",deadline:endTime,maxCalls,maxDepth:12,variant}).run({world:w,steps:actions,trace:[],diagnostics:[]},goals);
     stats.plannerCalls+=q.stats.calls;rec.remaining=q.remaining;rec.failures=q.failures.slice(-2);
     const suffix=q.node.steps.slice(actions.length),z=replay.replay(suffix,w);
     if(exactWorld(z)!==exactWorld(q.node.world)||!valid(w,z))throw Error("FORK_PLANNER_REPLAY");
     w=z;actions=q.node.steps.slice();
    };
    // Establish replacement commitments, then reuse surviving donor transactions.
    const replacement=[...keep].filter(k=>!d.commit.has(k));
    stage(replacement,3);
    const deferred=[];
    for(const tx of d.tx.slice(split)){
     if(performance.now()>=endTime)break;
     if(tx.some(a=>a.type==="campaignContext"||forbidden.has(a.id)||forbidden.has(a.research)))continue;
     if(tx.every(a=>a.type==="externalInputs"))continue;
     const main=tx.find(a=>primary.has(a.type));
     // A normal already-active lab research is not a fresh transaction.
     // Repeat, event and mission actions may have other effects; keep them.
     if(main?.type==="research"&&active(w,main.id)&&tx.filter(a=>a.type==="freeResearch").every(a=>active(w,a.research))){stats.alreadyActiveTransactions++;continue;}
     stats.suffixTrials++;
     try{
      const z=applyTx(w,tx,keep,forbidden);
      if(tx.some(a=>["eventResearch","missionResearch"].includes(a.type))&&auditOriginCampaignContext([...actions,...tx],data).kind!=="compatible")throw Error("FORK_CONTEXT");
      w=z;actions.push(...tx);stats.suffixAccepted++;stats.suffixActions+=tx.length;
     }catch{stats.suffixRejected++;deferred.push(tx);}
    }
    stage([...keep],4);
    const t=targets.find(t=>d.goals?.includes(t.id)&&!t.researchGoals.some(k=>forbidden.has(k)))||targets.find(t=>!t.researchGoals.some(k=>forbidden.has(k)));
    if(!t)throw Error("FORK_NO_TERMINAL_GOAL");
    if(!targets.some(t=>ready(t,w)))stage([...keep,...t.researchGoals],6);
    if(actions.length>0){
     if(!valid(first.world,w)||auditOriginCampaignContext(actions,data).kind!=="compatible")throw Error("FORK_FINAL_CONTEXT");
     const sid=key([b.id,actions]);stagedPrefixes[sid]??={branch:b.id,actions:actions.slice(),source:{kind:"terminalBranchFork",id:d.id,origin:d.origin,achieved:[...keep].filter(k=>active(w,k)),remaining:[...keep,...t.researchGoals].filter(k=>!active(w,k)),completed:[]},active:[...w.researched].filter(k=>active(w,k)).sort(),month:w.month};
     rec.stage=sid;const gain=stagedPrefixes[sid].active.length-initialActive;rec.activeGain=gain;if(gain>0)stats.stageProgress++;else stats.stageStalls++;
    }
    if(![...keep].every(k=>active(w,k))){rec.status="PARTIAL_RESEARCH";stats.partial++;continue;}
    const complete=targets.filter(t=>ready(t,w));
    // Register a concrete ordinary recipient even if the terminal research
    // is partial, so the regular scheduler can continue from this graph.
    const possible=[...profiles.values()].filter(p=>p.sourceType!=="event"&&p.soldierType!==CHORT&&(!originFocus.size||originFocus.has(p.id))&&p.requires.every(k=>active(w,k)));
    possible.sort((a,b)=>Number(b.id===d.origin)-Number(a.id===d.origin)||Object.keys(a.acquisitionRequiredItems||{}).length-Object.keys(b.acquisitionRequiredItems||{}).length||a.id.localeCompare(b.id));
    if(!possible.length){rec.status="PARTIAL_RESEARCH";stats.partial++;continue;}
    let registered=false;
    for(const p of possible.slice(0,4)){
     try{
      let z=w;const full=actions.slice(),items={};
      const append=a=>{z=replay.apply(z,a);full.push(a);};
      for(const [k,n] of Object.entries(p.acquisitionRequiredItems||{})){const lack=Math.max(0,n-(z.items[k]||0));if(lack)items[k]=lack;}
      const functions=(p.requiresBaseFunc||[]).filter(k=>!z.baseFunctions.has(k)),funds=Math.max(0,(p.cost||0)-z.funds);
      if(Object.keys(items).length||functions.length||funds)append({type:"externalInputs",items,functions,funds,reason:"Conditional recruitment inputs "+p.id,assumption:true});
      const birthAt=full.length,birthMonth=z.month;append({type:"recruit",soldier:"origin",profile:p.id,band:"min"});
      if(!member(z)?.state.exactStats||z.pendingFree||![...keep].every(k=>active(z,k))||[...z.researched].some(k=>forbidden.has(k))||!context(b.id,{allowedDifficulties:[0,1,2,3,4]},full,z).length)throw Error("FORK_RECRUIT_CONTEXT");
      if(exactWorld(replay.replay(full))!==exactWorld(z))throw Error("FORK_INDEPENDENT_REPLAY");
      const gid=register(p,b,{id:key([b.id,full.slice(0,birthAt)]),source:{kind:"terminalBranchFork",id:d.rid,donorBranch:d.b.id,commonPrefixLength:rec.commonPrefixLength,commonPrefixHash:rec.commonPrefixHash}},{world:z,steps:full,birthMonth},birthAt,"RESEARCH_THEN_BIRTH",true);
      if(!graphs[gid])throw Error("FORK_GRAPH");
      const goals=complete.filter(t=>ready(t,z));
      for(const t of goals){const k=key([gid,t.id]);if(terminal.anchors[k]?.status!=="CONDITIONAL_TARGET_RESEARCH_READY")terminal.run({id:gid,g:graphs[gid],b,t,k,i:0,attempt:terminal.anchors[k]?.attempts||0});}
      const done=goals.some(t=>terminal.anchors[key([gid,t.id])]?.status==="CONDITIONAL_TARGET_RESEARCH_READY");
      Object.assign(rec,{origin:p.id,graph:gid,status:done?"CONDITIONAL_REPLAY":"PARTIAL_RESEARCH",terminalGoals:goals.map(t=>t.id),birthAt});
      stats.births++;if(done){stats.completedBranches++;covered.add(b.id);stats.newBranches.push(b.id);}else stats.partial++;
      stats.outcomes.push({branch:b.id,origin:p.id,donorBranch:d.b.id,sharedPrefix:rec.commonPrefixLength,actions:full.length,complete:done});registered=true;break;
     }catch(e){rec.reason=fail(e);}
    }
    if(!registered){rec.status="PARTIAL_RESEARCH";stats.partial++;}
   }catch(e){rec.status="LIMITED_UNRESOLVED";rec.reason=fail(e);}
  }
 }
 return {run,stats};
}
