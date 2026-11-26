// End-stage reset/recovery scheduler. Priority is not pruning. Preserve
// each concrete loss and reacquisition, including multiplicities and history.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),sum=v=>v.reduce((a,b)=>a+b,0);
const counts=w=>Object.fromEntries([...member(w).state.bonusCounts].sort());
const difference=(a,b)=>Object.fromEntries(Object.entries(a).map(([k,v])=>[k,v-(b[k]||0)]).filter(([,v])=>v>0));
const resetRule=r=>!!(r.reset||r.removeTransformations?.length);
export function createTerminalResetRecovery({terminal,terminalRule,graphs,branches,byBody,replay,loadNode,stepsFor,selectPlanner,context,insert,enqueue,commit,allChoice,deadline,prior={}}){
 const targets=new Map(terminalRule.targets.map(t=>[t.id,t])),records=prior.records||{},turns={...prior.turns},metrics={attempts:0,resetAttempts:0,recoveryAttempts:0,researchAdvanced:0,applied:0,aliases:0,lossTransitions:0,reacquisitionTransitions:0,addedResearch:0};
 const ready=(w,t)=>t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));
 const roots=new Map(),lineages=new Map();
 function refresh(){
  roots.clear();lineages.clear();
  for(const r of Object.values(terminal.records))if(r.status==="CONDITIONAL_TARGET_RESEARCH_READY"&&Number.isInteger(r.to)&&graphs[r.graph]?.nodes[r.to]){
   const m=roots.get(r.graph)||new Map(),s=m.get(r.to)||new Set();s.add(r.target);m.set(r.to,s);roots.set(r.graph,m);
  }
  for(const [id,m] of roots){
   const g=graphs[id],line=[];
   for(const [i,n] of g.nodes.entries()){
    const p=line[n.parent],ts=new Set([...(p?.targets||[]),...(m.get(i)||[])]);
    let reset=p?.reset??null,lost=p?.lost||[];
    const transforms=n.steps.filter(a=>a.type==="transform"&&a.soldier==="origin"),r=transforms.find(a=>resetRule(replay.rules.get(a.transform)||{}));
    if(r&&ts.size){reset=i;lost=[...new Set([...lost,...(g.nodes[n.parent]?.traits||[]).filter(t=>!n.traits.includes(t))])].sort();}
    line[i]={targets:ts,reset,lost};
   }
   lineages.set(id,line);
  }
 }
 function candidates(){
  refresh();const list=[];
  for(const [id,line] of lineages){
   const g=graphs[id],b=branches.get(g.branch),keep=commit(b);if(g.blocker)continue;
   for(const [i,l] of line.entries()){
    if(!l.targets.size)continue;const n=g.nodes[i],rules=byBody.get(n.body)||[];
    for(const r of rules){
     if(r.forbiddenSoldierTypes?.includes(n.body)||r.requires.some(k=>(b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k)))continue;
     const isReset=resetRule(r),recovery=l.reset!==null;
     if(!isReset&&!recovery)continue;
     // In a recovery lineage, preserve every possible trait/body change and
     // remaining stat-only transform. Do not restrict to original traits.
     const edge=n.edges?.find(e=>e.action===r.id);
     if(edge?.status==="HISTORY_GATE")continue;
     const bonus=r.soldierBonusType,regain=!!bonus&&l.lost.includes(bonus)&&!n.traits.includes(bonus),fresh=!!bonus&&!n.traits.includes(bonus);
     const unlocked=edge?.status!=="INACTIVE_RESEARCH",newBody=!!r.producedSoldierType&&r.producedSoldierType!==n.body;
     for(const target of l.targets){
      const k=key([id,i,target,r.id]);if(records[k])continue;
      const phase=isReset?"RESET":"RECOVERY",age=turns[id+"|"+target+"|"+phase]||0;
      // Favor re-acquisition, a history prerequisite for another action,
      // and body changes, but rotate origins and retain lower-priority work.
      const needed=rules.some(q=>q.requiredPreviousTransformations?.includes(r.id)&&!q.forbiddenSoldierTypes?.includes(n.body));
      const priority=(isReset?n.traits.length*120:300*Number(regain)+140*Number(fresh)+70*Number(newBody)+60*Number(needed)+n.traits.length*30)+30*Number(unlocked)+sum(n.permanentVector)*.02;
      list.push({id,g,b,i,n,l,r,target,t:targets.get(target),k,phase,age,priority});
     }
    }
   }
  }
  return list;
 }
 function next(){
  const list=candidates(),phase=metrics.attempts%3===0?"RESET":"RECOVERY",pool=list.filter(x=>x.phase===phase);
  const a=pool.length?pool:list;a.sort((x,y)=>x.age-y.age||y.priority-x.priority||x.i-y.i||x.k.localeCompare(y.k));return a[0];
 }
 function run(x){
  const {id,g,b,i,n,l,r,target,t,k,phase}=x;metrics.attempts++;metrics[phase==="RESET"?"resetAttempts":"recoveryAttempts"]++;turns[id+"|"+target+"|"+phase]=(turns[id+"|"+target+"|"+phase]||0)+1;
  const rec={graph:id,node:i,origin:g.origin,branch:g.branch,target,action:r.id,phase,resetAncestor:l.reset,goals:r.requires,outcomes:[]};
  records[k]=rec;
  try{
   const w=loadNode(id,g,i),s=member(w).state,steps=stepsFor(g,i),full=[...g.birthActions,...steps];
   if(!ready(w,t)){rec.status="TARGET_INACTIVE";return;}
   if(r.requiredPreviousTransformations?.some(k=>!s.history.has(k))||r.forbiddenPreviousTransformations?.some(k=>s.history.has(k))){rec.status="HISTORY_GATE";return;}
   let base={world:w,steps},parent=i;
   if(!r.requires.every(k=>active(w,k))){
    if(r.requires.some(k=>w.disabled.has(k))){rec.status="DISABLED_RESEARCH_UNRESOLVED";return;}
    const keep=commit(b),p=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b);
    const accept=(a,z)=>ready(z.world,t)&&keep.every(k=>active(z.world,k))&&![...z.world.researched].some(k=>!a.world.researched.has(k)&&((b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k)));
    const q=createStagedResearch({planner:p,active,accept,deadline:Math.min(deadline(),performance.now()+4500),maxCalls:8,maxDepth:16}).run({world:w,steps:full,trace:[],diagnostics:[]},r.requires);
    const suffix=q.node.steps.slice(full.length);rec.remaining=q.remaining;rec.failures=q.failures.slice(-2);
    if(!suffix.length){rec.status="LIMITED_RESEARCH_UNRESOLVED";return;}
    const end=replay.replay(suffix,w);if(exactWorld(end)!==exactWorld(q.node.world)||!ready(end,t)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},q.node.steps,end).length)throw Error("RESET_RESEARCH_REPLAY");
    const e=insert(id,g,end,i,"RESET_RECOVERY_RESEARCH:"+r.id,suffix,true);parent=e.to;enqueue(id,parent);rec.researchNode=parent;rec.researchSuffixHash=key(suffix);rec.added=[...end.researched].filter(k=>active(end,k)&&!active(w,k));metrics.researchAdvanced++;metrics.addedResearch+=rec.added.length;
    if(!q.complete){rec.status="PARTIAL_RESEARCH";return;}
    base={world:end,steps:[...steps,...suffix]};
   }
   const pre=counts(base.world);
   for(const mode of ["DIRECT","GROW_THEN_TRANSFORM"])try{
    const z=mode==="DIRECT"?base:replay.grow(base),v=replay.transform(z,r);
    if(!v||!ready(v.world,t)){rec.outcomes.push({mode,status:"UNRESOLVED_LOCAL_GATE"});continue;}
    const ss=v.steps.slice(base.steps.length),end=replay.replay(ss,base.world);
    if(exactWorld(end)!==exactWorld(v.world)||!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...v.steps],end).length)throw Error("RESET_TRANSFORM_REPLAY");
    const after=counts(end),lost=difference(pre,after),gained=difference(after,pre),reacquired=Object.fromEntries(Object.entries(gained).filter(([k])=>l.lost.includes(k)));
    const e=insert(id,g,end,parent,"RESET_RECOVERY_TRANSFORM:"+r.id,ss,true);enqueue(id,e.to);
    rec.outcomes.push({mode,...e,pre,after,lost,gained,reacquired,fromBody:member(base.world).state.soldierType,toBody:member(end).state.soldierType});
    if(e.status==="CONDITIONAL_REPLAY"){metrics.applied++;if(Object.keys(lost).length)metrics.lossTransitions++;if(Object.keys(reacquired).length)metrics.reacquisitionTransitions++;}else metrics.aliases++;
   }catch(e){rec.outcomes.push({mode,status:"UNRESOLVED",reason:String(e.message)});}
   rec.status=rec.outcomes.some(e=>Number.isInteger(e.to))?"CONDITIONAL_TRANSFORM_REPLAY":"UNRESOLVED_TRANSFORM";
  }catch(e){rec.status="LIMITED_UNRESOLVED";rec.reason=String(e.message);}
 }
 function summary(){
  const list=candidates(),rs=Object.values(records),out=rs.flatMap(r=>r.outcomes||[]),ok=out.filter(r=>Number.isInteger(r.to)),newEdges=out.filter(r=>r.status==="CONDITIONAL_REPLAY");
  const readyStates=new Set(rs.flatMap(r=>(r.outcomes||[]).filter(e=>Number.isInteger(e.to)).map(e=>r.graph+"|"+e.to)));
  const resetNodes=[...lineages.values()].reduce((s,line)=>s+line.filter((l,i)=>l.reset===i).length,0);
  return {scope:"ORDINARY_EFFORT_RESET_RECOVERY_NOT_CLOSURE",sourceFingerprint:terminalRule.fingerprint,resetNodes,attempts:rs.length,resetAttempts:rs.filter(r=>r.phase==="RESET").length,recoveryAttempts:rs.filter(r=>r.phase==="RECOVERY").length,researchAdvanced:rs.filter(r=>r.researchSuffixHash).length,successful:rs.filter(r=>r.status==="CONDITIONAL_TRANSFORM_REPLAY").length,distinctStates:readyStates.size,newTransitions:newEdges.length,lossTransitions:newEdges.filter(e=>Object.keys(e.lost||{}).length).length,reacquisitionTransitions:newEdges.filter(e=>Object.keys(e.reacquired||{}).length).length,reacquiredTraits:[...new Set(ok.flatMap(e=>Object.keys(e.reacquired||{})))].sort(),pending:list.length,completeCombinations:0,round:metrics};
 }
 function publishedNodes(id){return Object.values(records).filter(r=>r.graph===id).flatMap(r=>[r.node,r.researchNode,...(r.outcomes||[]).map(e=>e.to)]).filter(Number.isInteger);}
 return {next,run,summary,records,turns,metrics,publishedNodes};
}
