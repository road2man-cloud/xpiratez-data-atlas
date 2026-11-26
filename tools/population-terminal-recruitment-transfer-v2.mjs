// Reuse concrete start-to-terminal research histories across origins.
// The donor's soldier actions are not transferable. Every recipient is
// recruited and replayed on its own world; no research set is granted.
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const researchTypes=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch","advanceMonth","campaignContext","externalInputs"]);
const soldierTypes=new Set(["recruit","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"]);
export function createTerminalRecruitmentTransfer({db,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,deadline,scope="origin",focusOrigins=[],focusBranches=[]}){
 if(!["origin","pair"].includes(scope))throw Error("Invalid recruitment transfer scope");
 const sets=db.careerCompletion?.researchTraitSets,oldPairs=Object.values(sets?.pairs||{}),knownOrigins=new Set(oldPairs.map(p=>p.origin));
 const pairKey=(o,b)=>JSON.stringify([o,b]),identity=(o,b)=>scope==="pair"?pairKey(o,b):o;
 const covered=new Set(oldPairs.map(p=>identity(p.origin,p.branch))),branchCounts=new Map(),originCounts=new Map();
 for(const p of oldPairs){const k=pairKey(p.origin,p.branch);if(!branchCounts.has(p.branch))branchCounts.set(p.branch,new Set());branchCounts.get(p.branch).add(k);if(!originCounts.has(p.origin))originCounts.set(p.origin,new Set());originCounts.get(p.origin).add(k);}
 for(const r of Object.values(terminal.records))if(r.status==="CONDITIONAL_TARGET_RESEARCH_READY"&&graphs[r.graph]?.nodes[r.to]?.body!=="STR_SOLDIER_CHORT")covered.add(identity(r.origin,r.branch));
 const mode=scope==="pair"?"TERMINAL_PAIR_TRANSFER_V1":"TERMINAL_TRANSFER_V1";
 const selectedOrigins=new Set(focusOrigins),selectedBranches=new Set(focusBranches);
 for(const o of selectedOrigins)if(!profiles.has(o))throw Error("Unknown transfer origin "+o);
 for(const b of selectedBranches)if(!branches.has(b))throw Error("Unknown transfer branch "+b);
 const isCovered=(o,b)=>covered.has(identity(o,b));
 const stats={scope,donorTrials:0,donorReady:0,donorActions:0,recipientActions:0,attempts:0,births:0,newOrigins:[],newPairs:[],failures:{}};
 const fail=e=>{const k=String(e.message||e).slice(0,180);stats.failures[k]=(stats.failures[k]||0)+1;};
 const candidates=new Map();
 for(const p of Object.values(sets?.pairs||{})){
  const path=sets.paths[p.pathId],b=branches.get(p.branch);if(!path||!b||p.body==='STR_SOLDIER_CHORT'||selectedBranches.size&&!selectedBranches.has(b.id))continue;
  const topics=new Set(path.active);
  const possible=[...profiles.values()].filter(x=>!isCovered(x.id,b.id)&&x.sourceType!=="event"&&x.soldierType!=="STR_SOLDIER_CHORT"&&(!selectedOrigins.size||selectedOrigins.has(x.id))&&x.requires.every(k=>topics.has(k)));
  if(!possible.length)continue;
  const r=sets.records[p.routes[0]],raw=db.populationMissingOriginCareer?.routes?.[p.routes[0]];
  // The graph, not a projected list of research IDs, is the source.
  const rid=p.routes[0],match=rid.match(/^MISSCAR:([^:]+):(\d+)$/);
  if(!r||!match||!graphs[match[1]]?.nodes[Number(match[2])])continue;
  const g=graphs[match[1]],full=[...g.birthActions,...stepsFor(g,Number(match[2]))];
  if(full.some(a=>!researchTypes.has(a.type)&&!soldierTypes.has(a.type)))continue;
  const actions=full.filter((a,i)=>researchTypes.has(a.type)&&!(a.type==="externalInputs"&&soldierTypes.has(full[i+1]?.type)));
  const id=key([p.branch,actions]);
  if(!candidates.has(id))candidates.set(id,{id,actions,p,r,rid,possible,b});
 }
 const ranked=[...candidates.values()].sort((a,b)=>(scope==="pair"?(branchCounts.get(a.b.id)?.size||0)-(branchCounts.get(b.b.id)?.size||0):0)||b.possible.length-a.possible.length||a.actions.length-b.actions.length||a.id.localeCompare(b.id));
 function acceptable(t,w){return t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));}
 function branchOK(b,w){const keep=commit(b);return keep.every(k=>active(w,k))&&![...w.researched].some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k));}
 function run(limit,donorLimit=5){
  for(const d of ranked){
   if(stats.births>=limit||stats.donorTrials>=donorLimit||performance.now()>=deadline())break;
   const possible=d.possible.filter(p=>!isCovered(p.id,d.b.id)&&!attempts[key([p.id,d.id,mode])]).sort((a,b)=>(originCounts.get(a.id)?.size||0)-(originCounts.get(b.id)?.size||0)||a.id.localeCompare(b.id));
   if(!possible.length)continue;
   stats.donorTrials++;
   let w=foundationWorld();const slots=new Map();
   const capture=i=>{if(w.pendingFree)return;for(const p of possible)if(!slots.has(p.id)&&p.requires.every(k=>active(w,k)))slots.set(p.id,{i,w});};
   try{
    capture(0);
    for(const [i,a] of d.actions.entries()){w=replay.apply(w,a);stats.donorActions++;capture(i+1);}
    if(w.pendingFree||member(w)||!branchOK(d.b,w)||!terminalRule.targets.some(t=>acceptable(t,w)))throw Error("DONOR_TARGET_OR_BRANCH");
    stats.donorReady++;
   }catch(e){fail(e);continue;}
   // Earliest valid recruitment first, with a separately replayed later
   // alternative if consuming a recruitment item blocks subsequent research.
   for(const p of possible){
    if(stats.births>=limit||performance.now()>=deadline())break;
    if(isCovered(p.id,d.b.id)||!slots.has(p.id))continue;
    const aid=key([p.id,d.id,mode]);
    stats.attempts++;
    let reason="NO_VALID_RECRUITMENT";
    for(const slot of [slots.get(p.id),{i:d.actions.length,w}]){
     if(slot.i===d.actions.length&&!p.requires.every(k=>active(slot.w,k)))continue;
     try{
      let end=slot.w;const full=d.actions.slice(0,slot.i),items={};
      const append=a=>{end=replay.apply(end,a);stats.recipientActions++;full.push(a);};
      for(const [k,n] of Object.entries(p.acquisitionRequiredItems||{})){const lack=Math.max(0,n-(end.items[k]||0));if(lack)items[k]=lack;}
      const functions=(p.requiresBaseFunc||[]).filter(k=>!end.baseFunctions.has(k)),funds=Math.max(0,(p.cost||0)-end.funds);
      if(Object.keys(items).length||functions.length||funds)append({type:"externalInputs",items,functions,funds,reason:"Conditional recruitment inputs "+p.id,assumption:true});
      const birthAt=full.length,birthMonth=end.month;
      append({type:"recruit",soldier:"origin",profile:p.id,band:"min"});
      for(const a of d.actions.slice(slot.i))append(a);
      if(end.pendingFree||!member(end)?.state.exactStats||!branchOK(d.b,end))throw Error("RECIPIENT_BRANCH_OR_STATE");
      const goals=terminalRule.targets.filter(t=>acceptable(t,end));
      if(!goals.length||!context(d.b.id,{allowedDifficulties:[0,1,2,3,4]},full,end).length)throw Error("RECIPIENT_TERMINAL_OR_CONTEXT");
      const prefix={id:key([d.b.id,full.slice(0,birthAt)]),source:{kind:"terminalResearchReuse",id:d.rid,origin:d.p.origin,donorResearchHash:d.id}};
      const gid=register(p,d.b,prefix,{world:end,steps:full,birthMonth},birthAt,slot.i<d.actions.length?"EARLY_BIRTH":"RESEARCH_THEN_BIRTH",true);
      if(!graphs[gid]||graphs[gid].rootStateHash!==exactWorld(end))throw Error("RECIPIENT_GRAPH_MISMATCH");
      for(const t of goals){
       const k=key([gid,t.id]);if(terminal.anchors[k]?.status==="CONDITIONAL_TARGET_RESEARCH_READY")continue;
       terminal.run({id:gid,g:graphs[gid],b:d.b,t,k,i:0,attempt:terminal.anchors[k]?.attempts||0});
      }
      if(!goals.some(t=>terminal.anchors[key([gid,t.id])]?.status==="CONDITIONAL_TARGET_RESEARCH_READY"))throw Error("RECIPIENT_ANCHOR");
      attempts[aid]={origin:p.id,branch:d.b.id,prefix:d.id,mode,status:"CONDITIONAL_REPLAY",graph:gid,donor:d.rid,birthAt,terminalGoals:goals.map(t=>t.id)};
      covered.add(identity(p.id,d.b.id));stats.births++;
      if(!knownOrigins.has(p.id)){knownOrigins.add(p.id);stats.newOrigins.push(p.id);}
      stats.newPairs.push({origin:p.id,branch:d.b.id,graph:gid});
      const k=pairKey(p.id,d.b.id);if(!originCounts.has(p.id))originCounts.set(p.id,new Set());originCounts.get(p.id).add(k);if(!branchCounts.has(d.b.id))branchCounts.set(d.b.id,new Set());branchCounts.get(d.b.id).add(k);
      reason=null;break;
     }catch(e){reason=String(e.message);fail(e);}
    }
    if(reason)attempts[aid]={origin:p.id,branch:d.b.id,prefix:d.id,mode,status:"LIMITED_UNRESOLVED",reason,donor:d.rid};
   }
  }
 }
 return {run,stats,eligibleDonors:ranked.length};
}
