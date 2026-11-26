// Reuse concrete start-to-terminal research histories across origins.
// The donor's soldier actions are not transferable. Every recipient is
// recruited and replayed on its own world; no research set is granted.
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const researchTypes=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch","advanceMonth","campaignContext","externalInputs"]);
const soldierTypes=new Set(["recruit","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"]);
export function createTerminalRecruitmentTransfer({db,graphs,profiles,branches,replay,stepsFor,commit,allChoice,context,register,terminal,terminalRule,attempts,deadline,scope="origin",focusOrigins=[],focusBranches=[],loadNode,slotPriority="early",perBranch=2}){
 if(!["origin","pair"].includes(scope))throw Error("Invalid recruitment transfer scope");
 if(!["early","late"].includes(slotPriority)||!Number.isSafeInteger(perBranch)||perBranch<1)throw Error("Invalid transfer scheduling options");
 const sets=db.careerCompletion?.researchTraitSets,oldPairs=Object.values(sets?.pairs||{}),knownOrigins=new Set(oldPairs.map(p=>p.origin));
 const pairKey=(o,b)=>JSON.stringify([o,b]),identity=(o,b)=>scope==="pair"?pairKey(o,b):o;
 const covered=new Set(oldPairs.filter(p=>p.body!=="STR_SOLDIER_CHORT").map(p=>identity(p.origin,p.branch))),branchCounts=new Map(),originCounts=new Map();
 for(const p of oldPairs){if(p.body==="STR_SOLDIER_CHORT")continue;const k=pairKey(p.origin,p.branch);if(!branchCounts.has(p.branch))branchCounts.set(p.branch,new Set());branchCounts.get(p.branch).add(k);if(!originCounts.has(p.origin))originCounts.set(p.origin,new Set());originCounts.get(p.origin).add(k);}
 
 const mode=scope==="pair"?"TERMINAL_PAIR_TRANSFER_V1":"TERMINAL_TRANSFER_V1";
 const selectedOrigins=new Set(focusOrigins),selectedBranches=new Set(focusBranches);
 for(const o of selectedOrigins)if(!profiles.has(o))throw Error("Unknown transfer origin "+o);
 for(const b of selectedBranches)if(!branches.has(b))throw Error("Unknown transfer branch "+b);
 const isCovered=(o,b)=>covered.has(identity(o,b));
 const stats={scope,slotPriority,perBranch,donorTrials:0,donorReady:0,donorActions:0,recipientActions:0,attempts:0,births:0,liveDonors:0,liveBirths:0,lateBirths:0,earlyBirths:0,refreshes:0,newOrigins:[],newPairs:[],failures:{},byBranch:{}};
 const fail=e=>{const k=String(e.message||e).slice(0,180);stats.failures[k]=(stats.failures[k]||0)+1;};
 const candidates=new Map(),seenLive=new Set(),failedDonors=new Set(),cache=new Map();
 const allowedProfiles=[...profiles.values()].filter(p=>p.sourceType!=="event"&&p.soldierType!=="STR_SOLDIER_CHORT"&&(!selectedOrigins.size||selectedOrigins.has(p.id)));
 function markCovered(o,b){
  covered.add(identity(o,b));const k=pairKey(o,b);
  if(!originCounts.has(o))originCounts.set(o,new Set());originCounts.get(o).add(k);
  if(!branchCounts.has(b))branchCounts.set(b,new Set());branchCounts.get(b).add(k);
 }
 function addDonor(gid,i,topics,live=false){
  const g=graphs[gid],b=branches.get(g?.branch),n=g?.nodes[i];if(!b||!n||n.body==="STR_SOLDIER_CHORT"||g.blocker||selectedBranches.size&&!selectedBranches.has(b.id))return;
  const full=[...g.birthActions,...stepsFor(g,i)];
  if(full.some(a=>!researchTypes.has(a.type)&&!soldierTypes.has(a.type)))return;
  const actions=full.filter((a,j)=>researchTypes.has(a.type)&&!(a.type==="externalInputs"&&soldierTypes.has(full[j+1]?.type)));
  const id=key([b.id,actions]);if(candidates.has(id))return;
  const possible=allowedProfiles.filter(p=>!isCovered(p.id,b.id)&&p.requires.every(k=>topics.has(k)));
  if(!possible.length)return;
  candidates.set(id,{id,actions,p:{origin:g.origin},rid:"MISSCAR:"+gid+":"+i,possible,b,live});
  if(live)stats.liveDonors++;
 }
 for(const p of oldPairs){
  const path=sets.paths[p.pathId],rid=p.routes[0],m=rid?.match(/^MISSCAR:([^:]+):(\d+)$/);
  if(p.body==="STR_SOLDIER_CHORT"||!path||!m||!sets.records[rid])continue;
  seenLive.add(m[1]+":"+m[2]);addDonor(m[1],Number(m[2]),new Set(path.active));
 }
 // New terminal anchors in this same round are real replayed nodes.
 // Use their actual active research, not a union of donor topics.
 function refresh(){
  stats.refreshes++;
  const ready=Object.values(terminal.records).filter(r=>r.status==="CONDITIONAL_TARGET_RESEARCH_READY"&&Number.isInteger(r.to)&&graphs[r.graph]?.nodes[r.to]?.body!=="STR_SOLDIER_CHORT"&&graphs[r.graph]?.nodes[r.to]);
  for(const r of ready)markCovered(r.origin,r.branch);
  for(const r of ready){
   const k=r.graph+":"+r.to;if(seenLive.has(k)||selectedBranches.size&&!selectedBranches.has(r.branch))continue;
   // Stop on deadline; the unvisited ready anchors remain for next round.
   if(performance.now()>=deadline())break;
   seenLive.add(k);
   const archived=sets?.records?.['MISSCAR:'+k],n=graphs[r.graph].nodes[r.to],path=archived&&sets.paths[archived.pathId];
   if(path&&archived.stateHash===n.stateHash){addDonor(r.graph,r.to,new Set(path.active));continue;}
   try{const w=loadNode(r.graph,graphs[r.graph],r.to);if(!w)continue;
    // loadNode returns a world in the current producer.
    addDonor(r.graph,r.to,new Set([...w.researched].filter(x=>active(w,x))),true);
   }catch(e){fail(e);}
  }
 }
 const remaining=d=>d.possible.filter(p=>!isCovered(p.id,d.b.id)&&!attempts[key([p.id,d.id,mode])]);
 function donorRanked(){
  return [...candidates.values()].filter(d=>!failedDonors.has(d.id)).map(d=>({d,count:remaining(d).length})).filter(x=>x.count).sort((x,y)=>{const a=x.d,b=y.d;return (scope==="pair"?(stats.byBranch[a.b.id]||0)-(stats.byBranch[b.b.id]||0)||(branchCounts.get(a.b.id)?.size||0)-(branchCounts.get(b.b.id)?.size||0):0)||y.count-x.count||a.actions.length-b.actions.length||a.id.localeCompare(b.id);}).map(x=>x.d);
 }
 function acceptable(t,w){return t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));}
 function branchOK(b,w){const keep=commit(b);return keep.every(k=>active(w,k))&&![...w.researched].some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k));}
 function run(limit,donorLimit=5){
  if(stats.births>=limit||stats.donorTrials>=donorLimit||performance.now()>=deadline())return;
  refresh();
  const usedThisCall=new Set();
  while(stats.births<limit&&stats.donorTrials<donorLimit&&performance.now()<deadline()){
   const d=donorRanked().find(d=>!usedThisCall.has(d.id));if(!d)break;usedThisCall.add(d.id);
   const possible=remaining(d).sort((a,b)=>(originCounts.get(a.id)?.size||0)-(originCounts.get(b.id)?.size||0)||a.id.localeCompare(b.id));
   if(!possible.length)continue;
   let cached=cache.get(d.id),w,slots;
   if(cached){({w,slots}=cached);}else{
    stats.donorTrials++;
    w=foundationWorld();slots=new Map();
    const capture=i=>{if(w.pendingFree)return;for(const p of possible)if(!slots.has(p.id)&&p.requires.every(k=>active(w,k)))slots.set(p.id,{i,w});};
    try{
     capture(0);
     for(const [i,a] of d.actions.entries()){w=replay.apply(w,a);stats.donorActions++;capture(i+1);}
     if(w.pendingFree||member(w)||!branchOK(d.b,w)||!terminalRule.targets.some(t=>acceptable(t,w)))throw Error("DONOR_TARGET_OR_BRANCH");
     stats.donorReady++;
     if(cache.size>=4)cache.delete(cache.keys().next().value);cache.set(d.id,{w,slots});
    }catch(e){failedDonors.add(d.id);fail(e);continue;}
   }
   let made=0;
   for(const p of possible){
    if(stats.births>=limit||made>=perBranch||performance.now()>=deadline())break;
    if(isCovered(p.id,d.b.id)||!slots.has(p.id))continue;
    const aid=key([p.id,d.id,mode]);stats.attempts++;
    let reason="NO_VALID_RECRUITMENT";
    const late={i:d.actions.length,w},early=slots.get(p.id);
    const order=slotPriority==="late"?[late,early]:[early,late],distinct=order.filter((x,i)=>i===0||x.i!==order[0].i);
    for(const slot of distinct){
     if(!p.requires.every(k=>active(slot.w,k)))continue;
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
      markCovered(p.id,d.b.id);stats.births++;made++;stats.byBranch[d.b.id]=(stats.byBranch[d.b.id]||0)+1;stats.liveBirths+=Number(d.live);stats.lateBirths+=Number(slot.i===d.actions.length);stats.earlyBirths+=Number(slot.i<d.actions.length);
      if(!knownOrigins.has(p.id)){knownOrigins.add(p.id);stats.newOrigins.push(p.id);}
      stats.newPairs.push({origin:p.id,branch:d.b.id,graph:gid});
      reason=null;break;
     }catch(e){reason=String(e.message);fail(e);}
    }
    if(reason)attempts[aid]={origin:p.id,branch:d.b.id,prefix:d.id,mode,status:"LIMITED_UNRESOLVED",reason,donor:d.rid};
   }
  }
 }
 return {run,stats,get eligibleDonors(){return candidates.size;}};
}
