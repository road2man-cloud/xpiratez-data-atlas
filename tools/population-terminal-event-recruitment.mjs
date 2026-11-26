// Insert source-backed event births at concrete points of a retained
// chronological research witness. Replay every subsequent donor action on
// the recipient's world. Unknown geography/RNG are explicit assumptions,
// never an actual-game acquisition or victory certificate.
import {foundationWorld,originEventScript} from "../public/soldiers/modern/origin-witness.js";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
const MODE="TERMINAL_EVENT_RECRUITMENT_V1",CHORT="STR_SOLDIER_CHORT";
const researchTypes=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch","advanceMonth","campaignContext","externalInputs"]);
const soldierTypes=new Set(["recruit","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"]);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createTerminalEventRecruitment({db,data,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,selectPlanner,deadline,focus=[]}){
 const sets=db.careerCompletion?.researchTraitSets,covered=new Set(Object.entries(db.careerCompletion?.originCoverage||{}).filter(([,v])=>v.witnesses>0).map(([k])=>k));
 const stats={donors:0,donorReplays:0,donorActions:0,recipientActions:0,attempts:0,births:0,earlyBirths:0,lateBirths:0,plannerCalls:0,extraResearch:0,newOrigins:[],outcomes:[],failures:{}};
 const fail=e=>{const k=String(e.message||e).slice(0,200);stats.failures[k]=(stats.failures[k]||0)+1;return k;};
 const missing=[...profiles.values()].filter(p=>p.sourceType==="event"&&p.soldierType!==CHORT&&!covered.has(p.id)&&(!focus.length||focus.includes(p.id))&&!Object.values(graphs).some(g=>g.origin===p.id&&!g.blocker));
 const alts=new Map(missing.map(p=>[p.id,(data.originRows.find(r=>r.id===p.id&&r.kind==="SOURCE_SPAWN")?.prerequisites?.event?.alternatives||[]).map(a=>originEventScript(a,p.sourceId)).filter(a=>a.executionOdds!==0)]));
 const past=new Set(Object.values(attempts).filter(a=>a.mode===MODE).map(a=>key([a.origin,a.donorHash,a.script,a.slot])));
 const ready=(t,w)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
 const branchOK=(b,w)=>commit(b).every(k=>active(w,k))&&![...w.researched].some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!commit(b).includes(k));
 const goals=(p,a)=>[...new Set([...p.requires,...a.researchPositive])];
 const donors=new Map();
 for(const pair of Object.values(sets?.pairs||{})){
  if(pair.body===CHORT)continue;
  const p=sets.paths[pair.pathId],b=branches.get(pair.branch),rid=pair.routes[0],m=rid?.match(/^MISSCAR:([^:]+):(\d+)$/),g=m&&graphs[m[1]];
  if(!p||!b||!g?.nodes[Number(m[2])]||!sets.records[rid])continue;
  const full=[...g.birthActions,...stepsFor(g,Number(m[2]))];
  if(full.some(a=>!researchTypes.has(a.type)&&!soldierTypes.has(a.type)))continue;
  const actions=full.filter((a,i)=>researchTypes.has(a.type)&&!(a.type==="externalInputs"&&soldierTypes.has(full[i+1]?.type)));
  const id=key([b.id,actions]);if(donors.has(id))continue;
  const topics=new Set(p.active),blocked=new Set(b.blockedResearch||[]),keep=commit(b);
  const possible=missing.flatMap(p=>(alts.get(p.id)||[]).filter(a=>goals(p,a).every(k=>!blocked.has(k)&&(!allChoice.has(k)||keep.includes(k)))).map(a=>({p,a,missing:goals(p,a).filter(k=>!topics.has(k)).length})));
  if(!possible.length)continue;
  donors.set(id,{id,b,rid,actions,possible,topics});
 }
 // Prefer donors with many reachable event conditions. Distinct actual
 // action histories remain eligible in subsequent batches.
 const ranked=[...donors.values()].sort((a,b)=>b.possible.filter(x=>!x.missing).length-a.possible.filter(x=>!x.missing).length||a.possible.reduce((s,x)=>s+x.missing,0)-b.possible.reduce((s,x)=>s+x.missing,0)||a.actions.length-b.actions.length||a.id.localeCompare(b.id));
 stats.donors=ranked.length;
 function eligible(w,p,a){
  if(w.pendingFree||!goals(p,a).every(k=>active(w,k))||p.requiresBaseFunc.some(k=>!w.baseFunctions.has(k)))return false;
  if(w.month<(a.firstMonth??0)||a.lastMonth!=null&&a.lastMonth>=0&&w.month>a.lastMonth)return false;
  if(a.researchNegative.some(k=>active(w,k)))return false;
  // Do not conjure unique item or other physical trigger inputs.
  return eventScriptVerdict(a,w,{mode:"current"}).kind!=="blocked";
 }
 function run(limit,donorLimit=5,maxAttempts=30){
  for(const d of ranked){
   if(stats.births>=limit||stats.donorReplays>=donorLimit||stats.attempts>=maxAttempts||performance.now()>=deadline())break;
   const pending=d.possible.filter(x=>!covered.has(x.p.id));if(!pending.length)continue;
   let w=foundationWorld();const slots=new Map();
   const capture=i=>{
    // A campaign difficulty must precede every other action.
    if(i===0&&d.actions[0]?.type==="campaignContext")return;
    for(const {p,a} of pending){
     const k=key([p.id,a.script]);if(slots.has(k)||!eligible(w,p,a))continue;
     if(!past.has(key([p.id,d.id,a.script,i])))slots.set(k,{i,w});
    }
   };
   try{capture(0);for(const [i,a] of d.actions.entries()){w=replay.apply(w,a);stats.donorActions++;capture(i+1);}
    if(member(w)||w.pendingFree||!branchOK(d.b,w)||!terminalRule.targets.some(t=>ready(t,w)))throw Error("DONOR_TERMINAL_OR_BRANCH");
   }catch(e){fail(e);continue;}
   stats.donorReplays++;
   const donorEnd=w,terminalGoals=terminalRule.targets.filter(t=>ready(t,w));
   const jobs=pending.map(x=>({...x,slot:slots.get(key([x.p.id,x.a.script]))})).sort((a,b)=>Number(!!b.slot)-Number(!!a.slot)||(a.slot?.i??Infinity)-(b.slot?.i??Infinity)||a.missing-b.missing||a.p.id.localeCompare(b.p.id)||a.a.script.localeCompare(b.a.script));
   for(const {p,a,slot} of jobs){
    if(stats.births>=limit||stats.attempts>=maxAttempts||performance.now()>=deadline())break;
    if(covered.has(p.id))continue;
    // First try the earliest valid point. If none, attempt late missing
    // research only when the event's time window and negative gates permit it.
    const slotId=slot?.i??"EXTEND";
    if(past.has(key([p.id,d.id,a.script,slotId])))continue;
    if(!slot&&(a.lastMonth!=null&&a.lastMonth>=0&&donorEnd.month>a.lastMonth||a.researchNegative.some(k=>active(donorEnd,k))))continue;
    stats.attempts++;
    const aid=key([p.id,d.id,MODE,a.script,slotId]),rec={origin:p.id,branch:d.b.id,prefix:d.id,mode:MODE,donor:d.rid,donorHash:d.id,script:a.script,slot:slotId};
    attempts[aid]=rec;
    try{
     let z=slot?.w??donorEnd,actions=slot?d.actions.slice(0,slot.i):d.actions.slice();
     const append=x=>{z=replay.apply(z,x);actions.push(x);stats.recipientActions++;};
     if(!slot){
      const needed=goals(p,a).filter(k=>!active(z,k));
      if(needed.length){
       const planner=selectPlanner(actions[0]?.type==="campaignContext"?actions[0].difficulty:null,d.b);
       const q=createStagedResearch({planner,active,accept:(x,y)=>branchOK(d.b,y.world)&&terminalGoals.some(t=>ready(t,y.world))&&!a.researchNegative.some(k=>active(y.world,k)),deadline:Math.min(deadline(),performance.now()+4000),maxCalls:4,maxDepth:8,variant:0}).run({world:z,steps:actions,trace:[],diagnostics:[]},needed);
       stats.plannerCalls+=q.stats.calls;rec.remaining=q.remaining;
       if(!q.complete)throw Error("EVENT_RECRUITMENT_RESEARCH_UNRESOLVED");
       const suffix=q.node.steps.slice(actions.length),before=z;
       for(const x of suffix)append(x);
       if(exactWorld(z)!==exactWorld(q.node.world))throw Error("EVENT_EXTENSION_REPLAY");
       stats.extraResearch+=[...z.researched].filter(k=>active(z,k)&&!active(before,k)).length;
      }
      if(z.month<(a.firstMonth??0))append({type:"advanceMonth",month:a.firstMonth,assumeContinuity:true});
     }
     if(!eligible(z,p,a))throw Error("EVENT_TRIGGER_UNSATISFIED");
     const verdict=eventScriptVerdict(a,z,{mode:"current"});
     const birthAt=actions.length,birthMonth=z.month,assumptions={pending:verdict.pending,unknown:verdict.unknown,requiredCountries:a.countryPositive,requiredRegions:a.regionPositive};
     append({type:"recruit",soldier:"origin",profile:p.id,band:"min",script:a.script,assumeOutcome:true,eventAssumptions:assumptions});
     if(slot)for(const x of d.actions.slice(slot.i))append(x);
     const finalGoals=terminalGoals.filter(t=>ready(t,z));
     if(z.pendingFree||!member(z)?.state.exactStats||!branchOK(d.b,z)||!finalGoals.length||!context(d.b.id,{allowedDifficulties:[0,1,2,3,4]},actions,z).length)throw Error("RECIPIENT_TERMINAL_OR_CONTEXT");
     const gid=register(p,d.b,{id:key([d.b.id,actions.slice(0,birthAt)]),source:{kind:"terminalEventRecruitment",id:d.rid,donorResearchHash:d.id,script:a.script,assumptions}},{world:z,steps:actions,birthMonth},birthAt,slot&&slot.i<d.actions.length?"EARLY_BIRTH":"RESEARCH_THEN_BIRTH",true);
     for(const t of finalGoals){const k=key([gid,t.id]);if(terminal.anchors[k]?.status!=="CONDITIONAL_TARGET_RESEARCH_READY")terminal.run({id:gid,g:graphs[gid],b:d.b,t,k,i:0,attempt:terminal.anchors[k]?.attempts||0});}
     if(!finalGoals.some(t=>terminal.anchors[key([gid,t.id])]?.status==="CONDITIONAL_TARGET_RESEARCH_READY"))throw Error("RECIPIENT_ANCHOR");
     Object.assign(rec,{status:"CONDITIONAL_REPLAY",graph:gid,birthAt,birthMonth,assumptions,terminalGoals:finalGoals.map(t=>t.id)});
     covered.add(p.id);stats.births++;stats.earlyBirths+=Number(!!slot&&slot.i<d.actions.length);stats.lateBirths+=Number(!slot||slot.i===d.actions.length);stats.newOrigins.push(p.id);stats.outcomes.push({origin:p.id,script:a.script,month:birthMonth,assumptions,graph:gid});
    }catch(e){rec.status="LIMITED_UNRESOLVED";rec.reason=fail(e);}
   }
  }
 }
 return {run,stats};
}
