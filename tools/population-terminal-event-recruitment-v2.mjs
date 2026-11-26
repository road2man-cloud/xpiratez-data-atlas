// Event recruitment uses a retained event alternative and a concrete donor
// history. Insert before the finite start window closes, or extend the live
// terminal world with the event's research conditions. No topic is granted.
import {foundationWorld,originEventScript} from "../public/soldiers/modern/origin-witness.js";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
const MODE="TERMINAL_EVENT_RECRUITMENT_V1",CHORT="STR_SOLDIER_CHORT";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const researchKinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch","advanceMonth","campaignContext","externalInputs"]);
const soldierKinds=new Set(["recruit","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"]);
export function createTerminalEventRecruitment({db,data,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,selectPlanner,deadline,focus=[]}){
 const stats={donors:0,donorReplays:0,donorActions:0,attempts:0,births:0,ready:0,early:0,late:0,plannerCalls:0,addedResearch:0,newOrigins:[],failures:{},outcomes:[]};
 const eventLedger=db.originEventBirth,sets=db.careerCompletion?.researchTraitSets;
 const covered=new Set(Object.entries(db.careerCompletion?.originCoverage||{}).filter(([,v])=>v.witnesses>0).map(([id])=>id));
 const missing=[...profiles.values()].filter(p=>p.sourceType==="event"&&p.soldierType!==CHORT&&!covered.has(p.id)&&(!focus.length||focus.includes(p.id))&&!Object.values(graphs).some(g=>g.origin===p.id));
 const evidence=new Map();
 for(const v of Object.values(eventLedger?.variants||{})){
  if(!missing.some(p=>p.id===v.origin))continue;
  const k=JSON.stringify([v.origin,v.branch,v.script]),old=evidence.get(k);
  if(!old||v.extraBeforeBirth.length<old.extraBeforeBirth.length)evidence.set(k,v);
 }
 const originRows=new Map(data.originRows.map(r=>[r.id,r])),donors=new Map();
 for(const pair of Object.values(sets?.pairs||{})){
  if(pair.body===CHORT)continue;
  const b=branches.get(pair.branch),path=sets.paths[pair.pathId],rid=pair.routes[0],m=rid?.match(/^MISSCAR:([^:]+):(\d+)$/),g=m&&graphs[m[1]];
  if(!b||!path||!g?.nodes[Number(m[2])]||!sets.records[rid])continue;
  const full=[...g.birthActions,...stepsFor(g,Number(m[2]))];
  if(full.some(a=>!researchKinds.has(a.type)&&!soldierKinds.has(a.type)))continue;
  const actions=full.filter((a,i)=>researchKinds.has(a.type)&&!(a.type==="externalInputs"&&soldierKinds.has(full[i+1]?.type)));
  const id=key([b.id,actions]);if(!donors.has(id))donors.set(id,{id,b,actions,rid,origin:pair.origin,topics:new Set(path.active)});
 }
 const jobs=[];
 for(const p of missing)for(const alt of originRows.get(p.id)?.prerequisites?.event?.alternatives||[]){
  const script=originEventScript(alt,p.sourceId),goals=[...new Set([...p.requires,...script.researchPositive])];
  for(const d of donors.values()){
   const v=evidence.get(JSON.stringify([p.id,d.b.id,alt.script]));if(!v)continue;
   const keep=commit(d.b),blocked=new Set(d.b.blockedResearch||[]);
   if(goals.some(k=>blocked.has(k)||allChoice.has(k)&&!keep.includes(k)))continue;
   const early=alt.lastMonth===0;
   // Negative event conditions at a late slot cannot be silently undone.
   if(!early&&script.researchNegative.some(k=>d.topics.has(k)))continue;
   const id=key([p.id,alt.script,d.id,MODE]);if(attempts[id])continue;
   jobs.push({id,p,alt,script,goals,d,v,early,missing:goals.filter(k=>!d.topics.has(k)).length});
  }
 }
 stats.donors=donors.size;
 const ready=(t,w)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
 const branchOK=(b,w)=>commit(b).every(k=>active(w,k))&&![...w.researched].some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!commit(b).includes(k));
 const cache=new Map(),failed=new Set(),turns=new Map();
 for(const a of Object.values(attempts))if(a.mode===MODE)turns.set(a.origin,(turns.get(a.origin)||0)+1);
 function donorWorld(d){
  if(cache.has(d.id))return cache.get(d.id);
  let w=foundationWorld();for(const a of d.actions){w=replay.apply(w,a);stats.donorActions++;}
  if(w.pendingFree||member(w)||!branchOK(d.b,w)||!terminalRule.targets.some(t=>ready(t,w)))throw Error("DONOR_TERMINAL_OR_BRANCH");
  if(cache.size>=4)cache.delete(cache.keys().next().value);cache.set(d.id,w);stats.donorReplays++;return w;
 }
 function run(limit,maxAttempts=18){
  const used=new Set();
  while(stats.births<limit&&stats.attempts<maxAttempts&&performance.now()<deadline()){
   jobs.sort((a,b)=>(turns.get(a.p.id)||0)-(turns.get(b.p.id)||0)||a.missing-b.missing||a.d.actions.length-b.d.actions.length||a.p.id.localeCompare(b.p.id)||a.id.localeCompare(b.id));
   const j=jobs.find(x=>!covered.has(x.p.id)&&!used.has(x.id)&&!failed.has(x.d.id));if(!j)break;
   const {id,p,script,goals,d,v,early}=j;used.add(id);stats.attempts++;turns.set(p.id,(turns.get(p.id)||0)+1);
   const rec={origin:p.id,branch:d.b.id,prefix:d.id,mode:MODE,donor:d.rid,donorHash:d.id,eventVariant:v.id,script:script.script};attempts[id]=rec;
   try{
    let w;try{w=donorWorld(d);}catch(e){failed.add(d.id);throw e;}
    const targets=terminalRule.targets.filter(t=>ready(t,w)),allow=z=>branchOK(d.b,z)&&targets.some(t=>ready(t,z))&&!z.pendingFree;
    let full,birthAt,birthMonth,end,verdict;
    const recruit={type:"recruit",soldier:"origin",profile:p.id,band:"min",script:script.script,assumeOutcome:true};
    if(early){
     // The explicit initial difficulty, if present, is the only action that
     // must precede a month-zero country/location event.
     const slot=d.actions[0]?.type==="campaignContext"?1:0;
     full=d.actions.slice(0,slot);let before=replay.replay(full);
     verdict=eventScriptVerdict(script,before,{mode:"current"});
     if(verdict.kind==="blocked")throw Error("START_EVENT: "+verdict.blocked.join("; "));
     birthAt=full.length;birthMonth=before.month;
     end=replay.apply(before,recruit);full.push(recruit);
     for(const a of d.actions.slice(slot)){end=replay.apply(end,a);full.push(a);}
    }else{
     const planner=selectPlanner(d.actions[0]?.type==="campaignContext"?d.actions[0].difficulty:null,d.b);
     const q=createStagedResearch({planner,active,accept:(a,z)=>allow(z.world)&&!script.researchNegative.some(k=>active(z.world,k)),deadline:Math.min(deadline(),performance.now()+6000),maxCalls:8,maxDepth:14,variant:0}).run({world:w,steps:d.actions,trace:[],diagnostics:[]},goals);
     stats.plannerCalls+=q.stats.calls;if(!q.complete)throw Error("EVENT_RESEARCH_UNRESOLVED: "+q.remaining.join(","));
     full=q.node.steps.slice();end=replay.replay(full.slice(d.actions.length),w);if(exactWorld(end)!==exactWorld(q.node.world))throw Error("EVENT_SUFFIX_REPLAY");
     stats.addedResearch+=[...end.researched].filter(k=>active(end,k)&&!active(w,k)).length;
     const first=Math.max(0,script.firstMonth||0);
     if(end.month<first){const a={type:"advanceMonth",month:first,assumeContinuity:true};end=replay.apply(end,a);full.push(a);}
     // Existing required event items must actually be present. Do not grant
     // a finite or unique event trigger merely to make this origin reachable.
     verdict=eventScriptVerdict(script,end,{mode:"current"});
     if(verdict.kind==="blocked")throw Error("LATE_EVENT: "+verdict.blocked.join("; "));
     birthAt=full.length;birthMonth=end.month;end=replay.apply(end,recruit);full.push(recruit);
    }
    if(!allow(end)||!member(end)?.state.exactStats||member(end).state.soldierType!==p.soldierType||!context(d.b.id,{allowedDifficulties:[0,1,2,3,4]},full,end).length)throw Error("RECIPIENT_EVENT_TERMINAL_OR_CONTEXT");
    const replayed=replay.replay(full);if(exactWorld(replayed)!==exactWorld(end))throw Error("EVENT_FULL_REPLAY");
    const gid=register(p,d.b,{id:key([d.b.id,full.slice(0,birthAt)]),source:{kind:"terminalEventRecruitment",id:v.id,origin:p.id,donor:d.rid,donorResearchHash:d.id,script:script.script,pending:verdict.pending,unknown:verdict.unknown}},{world:end,steps:full,birthMonth},birthAt,early?"EARLY_BIRTH":"RESEARCH_THEN_BIRTH",true);
    for(const t of targets.filter(t=>ready(t,end))){const k=key([gid,t.id]);if(terminal.anchors[k]?.status!=="CONDITIONAL_TARGET_RESEARCH_READY")terminal.run({id:gid,g:graphs[gid],b:d.b,t,k,i:0,attempt:terminal.anchors[k]?.attempts||0});}
    const final=targets.filter(t=>terminal.anchors[key([gid,t.id])]?.status==="CONDITIONAL_TARGET_RESEARCH_READY");
    if(!final.length)throw Error("EVENT_TERMINAL_ANCHOR");
    Object.assign(rec,{status:"CONDITIONAL_REPLAY",graph:gid,birthAt,birthMonth,terminalGoals:final.map(t=>t.id),eventPending:verdict.pending,eventUnknown:verdict.unknown});
    covered.add(p.id);stats.births++;stats.ready++;stats.early+=Number(early);stats.late+=Number(!early);stats.newOrigins.push(p.id);stats.outcomes.push({origin:p.id,branch:d.b.id,script:script.script,birthMonth,graph:gid});
   }catch(e){const reason=String(e.message||e).slice(0,180);rec.status="LIMITED_UNRESOLVED";rec.reason=reason;stats.failures[reason]=(stats.failures[reason]||0)+1;}
  }
 }
 return {run,stats};
}
