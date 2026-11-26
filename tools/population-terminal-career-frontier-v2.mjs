// Ordinary-effort end-stage continuation. Every accepted edge is concrete
// chronological replay; no procurement calendar and no fixed-depth closure.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
const sum=a=>a.reduce((s,v)=>s+v,0),active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createTerminalCareerFrontier({terminal,terminalRule,graphs,branches,byBody,data,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,expand,deadline,prior={},workPriority}){
 const targets=new Map(terminalRule.targets.map(t=>[t.id,t])),records=prior.records||{},research=prior.research||{},turns={...prior.turns},metrics={examined:0,expanded:0,ready:0,invalid:0,researchAttempts:0,researchAdvanced:0,researchReady:0,applied:0,aliases:0,addedResearch:0};
 const ready=(w,t)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
 const roots=new Map(),allRules=new Map();
 for(const r of data.transformations)if(r.allowsLiveSoldiers)for(const b of r.allowedSoldierTypes||[]){const a=allRules.get(b)||[];a.push(r);allRules.set(b,a);}
 function candidates(){
  roots.clear();
  for(const r of Object.values(terminal.records))if(r.status==="CONDITIONAL_TARGET_RESEARCH_READY"&&Number.isInteger(r.to)&&graphs[r.graph]?.nodes[r.to]){
   const a=roots.get(r.graph)||new Map(),ts=a.get(r.to)||new Set();ts.add(r.target);a.set(r.to,ts);roots.set(r.graph,a);
  }
  const out=[];
  for(const [id,r] of roots){
   const g=graphs[id],lineage=[];
   for(const [i,n] of g.nodes.entries()){
    const ts=new Set([...(lineage[n.parent]||[]),...(r.get(i)||[])]);
    lineage[i]=ts;
    for(const target of ts){
     const k=key([id,i,target]),old=records[k];if(old?.status==="TARGET_INACTIVE")continue;
     out.push({id,g,i,n,target,k,t:targets.get(target),old,age:turns[id+"|"+target]||0});
    }
   }
  }
  return out;
 }
 function score(x){return x.n.traits.length*100+sum(x.n.permanentVector)*.09+sum(x.n.permanentCapVector)*.04;}
 function next(){
  const a=candidates().filter(x=>!x.g.blocker&&(!x.old||!x.n.edges));
  return workPriority.choose(a,(x,y)=>x.age-y.age||Number(!!x.n.edges)-Number(!!y.n.edges)||score(y)-score(x)||x.i-y.i);
 }
 function assess(x,w){
  const {id,g,i,n,target,k,t}=x;const s=member(w).state;
  const common={graph:id,node:i,origin:g.origin,branch:g.branch,target,stateHash:n.stateHash};
  if(!ready(w,t)){records[k]={...common,status:"TARGET_INACTIVE"};metrics.invalid++;return false;}
  // Preserve exact multiplicities and all actual retained IDs.
  const missingItems=Object.entries(t.requiredItems||{}).filter(([k,v])=>(w.items[k]||0)<v);
  const indexed=new Set((byBody.get(n.body)||[]).map(r=>r.id));
  const unmodeled=(allRules.get(n.body)||[]).filter(r=>!indexed.has(r.id)&&!r.forbiddenSoldierTypes?.includes(n.body)&&!r.requires.includes("STR_UNAVAILABLE")).map(r=>r.id);
  records[k]={...common,status:"TERMINAL_RESEARCH_READY_NOT_CLOSED",traitCounts:Object.fromEntries([...s.bonusCounts].sort()),historyCounts:Object.fromEntries([...s.history].sort()),body:n.body,rank:n.rank,medals:n.medals,missingItems,unmodeled,activeResearchCount:[...w.researched].filter(k=>active(w,k)).length};
  metrics.ready++;return true;
 }
 function run(x){
  const {id,g,i,n,k,target}=x;turns[id+"|"+target]=(turns[id+"|"+target]||0)+1;
  metrics.examined++;
  try{const w=loadNode(id,g,i);if(!assess(x,w))return;
   if(!n.edges){expand(id,g,i);metrics.expanded++;}
   records[k].edgeCounts=(n.edges||[]).reduce((a,e)=>(a[e.status]=(a[e.status]||0)+1,a),{});
  }catch(e){records[k]={graph:id,node:i,origin:g.origin,branch:g.branch,target,status:"UNRESOLVED_REPLAY",reason:String(e.message)};}
 }
 function nextResearch(){
  const a=[];
  for(const x of candidates()){
   if(x.old?.status!=="TERMINAL_RESEARCH_READY_NOT_CLOSED"||!x.n.edges||x.g.blocker)continue;
   const b=branches.get(x.g.branch),keep=commit(b),history=x.old.historyCounts;
   for(const e of x.n.edges){
    if(e.status!=="INACTIVE_RESEARCH")continue;
    const r=replay.rules.get(e.action);if(!r||r.requiredPreviousTransformations?.some(k=>!history[k])||r.forbiddenPreviousTransformations?.some(k=>history[k]))continue;
    if(r.requires.some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k)))continue;
    const rk=key([x.id,x.i,x.target,r.id]);if(research[rk])continue;
    a.push({...x,r,rk,priority:score(x)+Number(!!r.soldierBonusType&&!x.n.traits.includes(r.soldierBonusType))*200+Number(r.producedSoldierType&&r.producedSoldierType!==x.n.body)*80});
   }
  }
  return workPriority.choose(a,(x,y)=>x.age-y.age||y.priority-x.priority||x.i-y.i);
 }
 function runResearch(x){
  const {id,g,i,n,t,r,rk,target}=x,b=branches.get(g.branch),keep=commit(b);turns[id+"|"+target]=(turns[id+"|"+target]||0)+1;metrics.researchAttempts++;
  const rec={graph:id,node:i,origin:g.origin,branch:g.branch,target,action:r.id,goals:r.requires};
  try{
   const w=loadNode(id,g,i),steps=stepsFor(g,i),full=[...g.birthActions,...steps],p=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b);
   if(r.requires.some(k=>w.disabled.has(k))){research[rk]={...rec,status:"DISABLED_RESEARCH_UNRESOLVED"};return;}
   const accept=(a,z)=>ready(z.world,t)&&keep.every(k=>active(z.world,k))&&
    ![...z.world.researched].some(k=>!a.world.researched.has(k)&&((b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k)));
   const q=createStagedResearch({planner:p,active,accept,deadline:Math.min(deadline(),performance.now()+5000),maxCalls:8,maxDepth:16}).run({world:w,steps:full,trace:[],diagnostics:[]},r.requires);
   const suffix=q.node.steps.slice(full.length);
   if(!suffix.length){research[rk]={...rec,status:"LIMITED_UNRESOLVED",remaining:q.remaining,failures:q.failures.slice(-2)};return;}
   const end=replay.replay(suffix,w);
   if(exactWorld(end)!==exactWorld(q.node.world)||!ready(end,t)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},q.node.steps,end).length)throw Error("END_STAGE_RESEARCH_REPLAY");
   const edge=insert(id,g,end,i,"END_STAGE_RESEARCH:"+r.id,suffix,true);enqueue(id,edge.to);
   const added=[...end.researched].filter(k=>active(end,k)&&!active(w,k));
   metrics.researchAdvanced++;metrics.addedResearch+=added.length;if(q.complete)metrics.researchReady++;
   const outcomes=[];
   if(q.complete){
    const base={world:end,steps:[...steps,...suffix]};
    for(const mode of ["DIRECT","GROW_THEN_TRANSFORM"])try{
     const z=mode==="DIRECT"?base:replay.grow(base),v=replay.transform(z,r);
     if(!v||!ready(v.world,t))continue;
     const ss=v.steps.slice(base.steps.length),checked=replay.replay(ss,end);
     if(exactWorld(checked)!==exactWorld(v.world)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...v.steps],checked).length)continue;
     const e=insert(id,g,checked,edge.to,"END_STAGE_TRANSFORM:"+r.id,ss,true);enqueue(id,e.to);outcomes.push({mode,...e});
     if(e.status==="CONDITIONAL_REPLAY")metrics.applied++;else metrics.aliases++;
    }catch(e){outcomes.push({mode,status:"UNRESOLVED",reason:String(e.message)});}
   }
   research[rk]={...rec,status:q.complete?"RESEARCH_READY":"PARTIAL_RESEARCH",to:edge.to,added,remaining:q.remaining,suffixHash:key(suffix),outcomes};
  }catch(e){research[rk]={...rec,status:"LIMITED_UNRESOLVED",reason:String(e.message)};}
 }
 function summary(){
  const all=candidates(),known=Object.values(records).filter(r=>r.status==="TERMINAL_RESEARCH_READY_NOT_CLOSED");
  return {scope:"ORDINARY_EFFORT_TERMINAL_RESEARCH_CONTINUATION_NOT_CLOSURE",sourceFingerprint:terminalRule.fingerprint,roots:[...roots.values()].reduce((s,m)=>s+[...m.values()].reduce((n,t)=>n+t.size,0),0),ready:known.length,distinctStates:new Set(known.map(r=>r.graph+"|"+r.node)).size,origins:new Set(known.map(r=>r.origin)).size,pending:all.filter(x=>!x.old||!x.n.edges).length,researchAttempts:Object.keys(research).length,researchAdvanced:Object.values(research).filter(r=>r.suffixHash).length,researchReady:Object.values(research).filter(r=>r.status==="RESEARCH_READY").length,withUnmodeled:known.filter(r=>r.unmodeled.length).length,completeCombinations:0,round:metrics};
 }
 return {next,run,nextResearch,runResearch,records,research,turns,summary,metrics,publishedNodes:id=>Object.values(records).filter(r=>r.graph===id&&r.status==="TERMINAL_RESEARCH_READY_NOT_CLOSED").map(r=>r.node)};
}
