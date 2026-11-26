// Extend a concrete terminal research history with additional recruitment
// prerequisites. No topic set, unique reward, event, or recruit is granted.
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const researchTypes=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch","advanceMonth","campaignContext","externalInputs"]);
const soldierTypes=new Set(["recruit","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"]);
const MODE="TERMINAL_RECRUITMENT_EXTENSION_V1";
const CHORT="STR_SOLDIER_CHORT";
export function createTerminalRecruitmentExtension({db,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,stagedPrefixes,selectPlanner,deadline,focus=[]}){
 const sets=db.careerCompletion?.researchTraitSets,covered=new Set(Object.entries(db.careerCompletion?.originCoverage||{}).filter(([,v])=>v.witnesses>0).map(([k])=>k));
 const stats={donors:0,donorReplays:0,donorActions:0,attempts:0,births:0,partial:0,addedResearch:0,plannerCalls:0,resumed:0,newOrigins:[],failures:{},outcomes:[]};
 const fail=e=>{const k=String(e.message||e).slice(0,150);stats.failures[k]=(stats.failures[k]||0)+1;return k;};
 const missing=[...profiles.values()].filter(p=>p.sourceType!=="event"&&p.soldierType!==CHORT&&!covered.has(p.id)&&(!focus.length||focus.includes(p.id))&&!Object.values(graphs).some(g=>g.origin===p.id&&!g.blocker));
 const byBranch=new Map(),donors=new Map(),priorAttempts=new Map(),turns=new Map(),provenDonors=new Set(),rejectedDonors=new Set();
 for(const a of Object.values(attempts))if(a.mode===MODE){priorAttempts.set(key([a.origin,a.donorHash]),a);turns.set(a.origin,(turns.get(a.origin)||0)+1);if(a.status==="CONDITIONAL_REPLAY")provenDonors.add(a.donorHash);if(a.donorRejected===true)rejectedDonors.add(a.donorHash);}
 for(const d of provenDonors)rejectedDonors.delete(d);
 for(const p of Object.values(sets?.pairs||{})){
  if(p.body===CHORT)continue;
  const path=sets.paths[p.pathId],b=branches.get(p.branch);
  if(!path||!b||!Array.isArray(path.active))continue;
  const rid=p.routes[0],match=rid?.match(/^MISSCAR:([^:]+):(\d+)$/),g=match&&graphs[match[1]],n=g?.nodes[Number(match[2])];
  if(!n||!sets.records[rid])continue;
  const keep=commit(b),blocked=new Set(b.blockedResearch||[]);
  const possible=missing.filter(p=>p.requires.every(k=>!blocked.has(k)&&(!allChoice.has(k)||keep.includes(k))));
  if(!possible.length)continue;
  const full=[...g.birthActions,...stepsFor(g,Number(match[2]))];
  if(full.some(a=>!researchTypes.has(a.type)&&!soldierTypes.has(a.type)))continue;
  const actions=full.filter((a,i)=>researchTypes.has(a.type)&&!(a.type==="externalInputs"&&soldierTypes.has(full[i+1]?.type)));
  const id=key([b.id,actions]);if(donors.has(id)||rejectedDonors.has(id))continue;
  const d={id,b,p,rid,actions,topics:new Set(path.active),possible};
  donors.set(id,d);const list=byBranch.get(b.id)||[];list.push(d);byBranch.set(b.id,list);
 }
 // Select a few genuinely different donor research histories per branch.
 // The choice is a bounded scheduling heuristic, not a claim of equivalence.
 const compact=[];
 const maximumDonorsPerBranch=()=>missing.length===1?24:8;
 for(const list of byBranch.values()){
  list.sort((a,b)=>Number(provenDonors.has(b.id))-Number(provenDonors.has(a.id))||b.possible.reduce((s,p)=>s+p.requires.filter(k=>b.topics.has(k)).length,0)-a.possible.reduce((s,p)=>s+p.requires.filter(k=>a.topics.has(k)).length,0)||a.actions.length-b.actions.length||a.id.localeCompare(b.id));
  // Different chronological action histories with equal active topics may differ in inventory or one-time rewards.
  compact.push(...list.slice(0,Math.max(6,Math.min(maximumDonorsPerBranch(),list.length))));
 }
 stats.donors=compact.length;
 const ready=(t,w)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
 const branchOK=(b,w)=>commit(b).every(k=>active(w,k))&&![...w.researched].some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!commit(b).includes(k));
 const cache=new Map();
 function donorWorld(d){
  if(cache.has(d.id))return cache.get(d.id);
  let w=foundationWorld();for(const a of d.actions){w=replay.apply(w,a);stats.donorActions++;}
  if(w.pendingFree||member(w)||!branchOK(d.b,w)||!terminalRule.targets.some(t=>ready(t,w)))throw Error("DONOR_TERMINAL_OR_BRANCH");
  if(cache.size>=4)cache.delete(cache.keys().next().value);
  cache.set(d.id,w);stats.donorReplays++;return w;
 }
 function run(limit,maxAttempts=12){
  const jobs=[];
  for(const d of compact)for(const p of d.possible){
   const old=priorAttempts.get(key([p.id,d.id]));
   if(old?.status==="CONDITIONAL_REPLAY"||(old?.variant??-1)>=2&&!old.stage)continue;
   const absent=p.requires.filter(k=>!d.topics.has(k));
   jobs.push({d,p,old,missing:absent.length,variant:(old?.variant??-1)+1});
  }
  // Round-robin origins, prefer concrete partial progress and fewer missing topics.
  const used=new Set(),failedDonors=new Set();
  while(stats.births<limit&&stats.attempts<maxAttempts&&performance.now()<deadline()){
   jobs.sort((a,b)=>(turns.get(a.p.id)||0)-(turns.get(b.p.id)||0)||Number(!!b.old?.stage)-Number(!!a.old?.stage)||Number(provenDonors.has(b.d.id))-Number(provenDonors.has(a.d.id))||a.missing-b.missing||a.d.actions.length-b.d.actions.length||a.p.id.localeCompare(b.p.id));
   const j=jobs.find(x=>!covered.has(x.p.id)&&!used.has(key([x.p.id,x.d.id]))&&!failedDonors.has(x.d.id));if(!j)break;
   const {d,p,old,variant}=j;used.add(key([p.id,d.id]));stats.attempts++;turns.set(p.id,(turns.get(p.id)||0)+1);
   const aid=key([p.id,d.id,MODE,variant]),rec={origin:p.id,branch:d.b.id,prefix:d.id,mode:MODE,donor:d.rid,donorHash:d.id,variant};
   attempts[aid]=rec;
   try{
    let w,full;
    try{w=donorWorld(d);full=d.actions;}catch(e){failedDonors.add(d.id);rec.donorRejected=true;throw e;}
    const goals=terminalRule.targets.filter(t=>ready(t,w));
    if(old?.stage&&stagedPrefixes[old.stage]){
     const s=stagedPrefixes[old.stage];if(s.branch!==d.b.id)throw Error("STAGED_BRANCH");
     const v=replay.replay(s.actions);if(member(v)||!branchOK(d.b,v)||!goals.some(t=>ready(t,v)))throw Error("STAGED_TERMINAL");
     w=v;full=s.actions;stats.resumed++;
    }
    const planner=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,d.b);
    const allowed=z=>branchOK(d.b,z)&&goals.some(t=>ready(t,z))&&!z.pendingFree;
    const q=createStagedResearch({planner,active,accept:(a,z)=>allowed(z.world),deadline:Math.min(deadline(),performance.now()+6000),maxCalls:6,maxDepth:10,variant}).run({world:w,steps:full,trace:[],diagnostics:[]},p.requires);
    stats.plannerCalls+=q.stats.calls;
    const suffix=q.node.steps.slice(full.length),end=suffix.length?replay.replay(suffix,w):w;
    if(exactWorld(end)!==exactWorld(q.node.world)||!allowed(end))throw Error("RECRUITMENT_EXTENSION_REPLAY");
    const added=[...end.researched].filter(k=>active(end,k)&&!active(w,k));stats.addedResearch+=added.length;
    rec.added=added;rec.remaining=q.remaining;rec.failures=q.failures.slice(-3);
    if(suffix.length){
     const sid=key([d.b.id,q.node.steps]);stagedPrefixes[sid]??={branch:d.b.id,actions:q.node.steps,source:{kind:"terminalRecruitmentExtension",id:d.id,origin:p.id,achieved:q.achieved,remaining:q.remaining},active:[...end.researched].filter(k=>active(end,k)).sort(),month:end.month};rec.stage=sid;
    }else if(old?.stage)rec.stage=old.stage;
    if(!q.complete){rec.status=suffix.length?"PARTIAL_RESEARCH":"LIMITED_UNRESOLVED";stats.partial+=Number(suffix.length>0);continue;}
    let z=end;const actions=q.node.steps.slice(),items={};
    const append=a=>{z=replay.apply(z,a);actions.push(a);};
    for(const [k,n] of Object.entries(p.acquisitionRequiredItems||{})){const lack=Math.max(0,n-(z.items[k]||0));if(lack)items[k]=lack;}
    const functions=(p.requiresBaseFunc||[]).filter(k=>!z.baseFunctions.has(k)),funds=Math.max(0,(p.cost||0)-z.funds);
    if(Object.keys(items).length||functions.length||funds)append({type:"externalInputs",items,functions,funds,reason:"Conditional recruitment inputs "+p.id,assumption:true});
    const birthAt=actions.length,birthMonth=z.month;append({type:"recruit",soldier:"origin",profile:p.id,band:"min"});
    const finalGoals=goals.filter(t=>ready(t,z));
    if(!allowed(z)||!member(z)?.state.exactStats||!finalGoals.length||!context(d.b.id,{allowedDifficulties:[0,1,2,3,4]},actions,z).length)throw Error("RECIPIENT_TERMINAL_OR_CONTEXT");
    const gid=register(p,d.b,{id:key([d.b.id,actions.slice(0,birthAt)]),source:{kind:"terminalRecruitmentExtension",id:d.rid,origin:d.p.origin,donorResearchHash:d.id}},{world:z,steps:actions,birthMonth},birthAt,"RESEARCH_THEN_BIRTH",true);
    for(const t of finalGoals){const k=key([gid,t.id]);if(terminal.anchors[k]?.status!=="CONDITIONAL_TARGET_RESEARCH_READY")terminal.run({id:gid,g:graphs[gid],b:d.b,t,k,i:0,attempt:terminal.anchors[k]?.attempts||0});}
    if(!finalGoals.some(t=>terminal.anchors[key([gid,t.id])]?.status==="CONDITIONAL_TARGET_RESEARCH_READY"))throw Error("RECIPIENT_ANCHOR");
    Object.assign(rec,{status:"CONDITIONAL_REPLAY",graph:gid,birthAt,terminalGoals:finalGoals.map(t=>t.id)});covered.add(p.id);stats.births++;stats.newOrigins.push(p.id);stats.outcomes.push({origin:p.id,branch:d.b.id,added:added.length,graph:gid});
   }catch(e){rec.status="LIMITED_UNRESOLVED";rec.reason=fail(e);}
  }
 }
 return {run,stats};
}
