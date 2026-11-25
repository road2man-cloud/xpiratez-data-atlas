// Continue every reachable terminal-research state through actual local
// transformation replay. No finite depth is a completion criterion.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createSupplyPlan} from "./atlas-terminal-supply-core-v2.mjs";
import {createStagedResearch} from "./population-recruitment-staged-research.mjs";
const sum=v=>v.reduce((a,b)=>a+b,0),active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
function stockManufacture(base,rule,data,replay,index){
 // Use only the existing replay action when its projection agrees with
 // original fixed single-output manufacture. No externalInputs insertion.
 let calls=0;
 function acquire(n,id,need,stack=[]){
  if((n.world.items[id]||0)>=need)return n;
  if(++calls>60||stack.includes(id)||stack.length>12)return null;
  const candidates=(data.itemSupply[id]?.manufacture||[]).filter(r=>{
   const a=index.recipes.get(r.id);
   return a&&!a.randomExtras&&Object.keys(a.outputs).length===1&&a.outputs["ITEM:"+id]===r.quantity&&
    Object.keys(a.inputs).every(k=>k.startsWith("ITEM:"))&&
    key(Object.entries(a.inputs).map(([k,v])=>[index.raw(k),v]).sort())===key(Object.entries(r.requiredItems||{}).sort())&&
    a.cost===(r.cost||0)&&r.requires.every(k=>active(n.world,k))&&r.requiresBaseFunc.every(k=>n.world.baseFunctions.has(k));
  }).sort((a,b)=>(a.cost/a.quantity)-(b.cost/b.quantity)||a.id.localeCompare(b.id));
  for(const r of candidates.slice(0,8)){
   const count=Math.ceil((need-(n.world.items[id]||0))/r.quantity);let q=n;
   if(r.requiredItems?.[id])continue;
   for(const [k,v] of Object.entries(r.requiredItems||{})){q=acquire(q,k,v*count,[...stack,id]);if(!q)break;}
   if(!q||q.world.funds<(r.cost||0)*count)continue;
   try{const a={type:"manufacture",item:id,recipe:r.id,count};q=replay.append(q,a);if((q.world.items[id]||0)>=need)return q;}catch{}
  }
  return null;
 }
 let q=base;
 for(const [k,v] of Object.entries(rule.requiredItems||{})){q=acquire(q,k,v);if(!q)return null;}
 if((rule.requiresBaseFunc||[]).some(k=>!q.world.baseFunctions.has(k))||q.world.funds<(rule.cost||0))return null;
 try{return replay.append(q,{type:"transform",soldier:"origin",transform:rule.id});}catch{return null;}
}
export function createTerminalSupplyFollowthrough({terminal,terminalRule,graphs,byBody,data,index,replay,loadNode,stepsFor,context,insert,enqueue,branches,commit,allChoice,selectPlanner,prior={},deadline}){
 const plans=prior.plans||{},records=prior.records||{},front=prior.front||{},attempted=prior.attempted||{},targetMap=new Map(terminalRule.targets.map(t=>[t.id,t]));
 const resourceResearch=prior.resourceResearch||{};
 const stats={resourceResearchAttempts:0,resourceResearchAdvanced:0,resourceResearchGoals:0,rootPlans:0,surgeryPlans:0,processed:0,newStates:0,aliases:0,transforms:0,growth:0,stockManufacture:0,noNewExternalInputs:0,errors:0};
 function recordPlan(k,w,target,kind,ref){
  if(plans[k])return plans[k];
  try{
   const planner=createSupplyPlan(index,data,w);
   const plan=kind==="terminal"?planner.planTerminal(target):planner.planSurgery(target);
   plans[k]={...ref,kind,plannerVersion:2,plan};stats[kind==="terminal"?"rootPlans":"surgeryPlans"]++;
  }catch(e){plans[k]={...ref,kind,plannerVersion:2,error:String(e.message)};stats.errors++;}
  return plans[k];
 }
 function add(id,node,target){
  const k=key([id,node,target]);if(!front[k])front[k]={graph:id,node,target};
 }
 for(const [k,r] of Object.entries(terminal.records)){
  if(r.status!=="CONDITIONAL_TARGET_RESEARCH_READY"||!Number.isInteger(r.to)||!graphs[r.graph]?.nodes[r.to])continue;
  add(r.graph,r.to,r.target);
 }
 function nextPlan(){
  const candidates=[...Object.values(terminal.records).filter(r=>r.status==="CONDITIONAL_TARGET_RESEARCH_READY"),...Object.values(resourceResearch).filter(r=>Number.isInteger(r.to)&&r.suffixHash)];
  for(const r of candidates){
   if(!Number.isInteger(r.to)||!graphs[r.graph]?.nodes[r.to])continue;
   const k=key(["terminal-v2",r.graph,r.to,r.target]);if(plans[k])continue;
   return {k,r};
  }
 }
 function runPlan(t){const {k,r}=t,g=graphs[r.graph],w=loadNode(r.graph,g,r.to);return recordPlan(k,w,targetMap.get(r.target),"terminal",{graph:r.graph,node:r.to,target:r.target,origin:g.origin,branch:g.branch});}
 function nextResearch(){
  const proposals=[];
  for(const [planId,p] of Object.entries(plans)){
   if(p.kind!=="terminal"||p.plannerVersion!==2||!p.plan||!graphs[p.graph]?.nodes[p.node])continue;
   const g=graphs[p.graph],b=branches.get(g.branch),t=targetMap.get(p.target),direct=new Set(Object.keys(t.requiredItems||{}).map(index.asset));
   const k=key(["procurement-research",p.graph,p.node,p.target]);if(resourceResearch[k]||!b)continue;
   const denied=new Set([...(b.blockedResearch||[]),...[...allChoice].filter(k=>!commit(b).includes(k))]);
   const proposalsByGoal=new Map();
   function add(goals,weight){for(const k of goals||[])if(k!=="STR_UNAVAILABLE"&&!denied.has(k)&&data.researchRules[k])proposalsByGoal.set(k,Math.max(weight,proposalsByGoal.get(k)||0));}
   for(const o of p.plan.obligations){
    const weight=direct.has(o.asset)?100:20;
    for(const c of o.sourceAlternatives||[]){
     if(c.kind==="MANUFACTURE_LOCKED")add(c.missingResearch,weight+(c.recipe===index.raw(o.asset||"")?50:0));
     if(c.kind==="PURCHASE")add(c.missingResearch,weight+10);
    }
    if(o.function)for(const c of o.providers||[])add(c.missingResearch,50);
   }
   const goals=[...proposalsByGoal].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,3).map(x=>x[0]);
   if(goals.length)proposals.push({k,p,planId,g,b,t,goals,score:Math.max(...proposalsByGoal.values())});
  }
  proposals.sort((a,b)=>b.score-a.score||a.p.node-b.p.node||a.k.localeCompare(b.k));
  return proposals[0];
 }
 function runResearch(x){
  const {k,p,planId,g,b,t,goals}=x,id=p.graph,i=p.node;
  stats.resourceResearchAttempts++;
  const rec={graph:id,node:i,target:p.target,origin:g.origin,branch:g.branch,sourcePlan:planId,goals};
  try{
   const w=loadNode(id,g,i),steps=stepsFor(g,i),full=[...g.birthActions,...steps],needed=goals.filter(k=>!active(w,k)&&!w.disabled.has(k));
   if(!needed.length){resourceResearch[k]={...rec,status:"NO_ACTIVE_NEW_GOAL",remaining:goals.filter(k=>!active(w,k))};return;}
   const planner=selectPlanner(full[0]?.type==="campaignContext"?full[0].difficulty:null,b),keep=commit(b);
   const accept=(a,z)=>[...keep,...t.researchGoals].every(k=>active(z.world,k))&&!(t.inactiveResearch||[]).some(k=>active(z.world,k))&&
    ![...z.world.researched].some(k=>!a.world.researched.has(k)&&((b.blockedResearch||[]).includes(k)||allChoice.has(k)&&!keep.includes(k)));
   const staged=createStagedResearch({planner,active,accept,deadline:Math.min(deadline(),performance.now()+10000),maxCalls:10,maxDepth:16});
   const q=staged.run({world:w,steps:full,trace:[],diagnostics:[]},needed),suffix=q.node.steps.slice(full.length);
   if(!suffix.length){resourceResearch[k]={...rec,status:"LIMITED_UNRESOLVED",remaining:q.remaining,failures:q.failures.slice(-3)};return;}
   const end=replay.replay(suffix,w);if(exactWorld(end)!==exactWorld(q.node.world))throw Error("resource research suffix mismatch");
   if(!context(g.branch,{allowedDifficulties:g.allowedDifficulties},q.node.steps,end).length)throw Error("resource research context mismatch");
   const edge=insert(id,g,end,i,"TERMINAL_RESOURCE_RESEARCH:"+p.target,suffix,true),added=[...end.researched].filter(k=>active(end,k)&&!active(w,k));
   resourceResearch[k]={...rec,status:q.complete?"CONDITIONAL_RESOURCE_RESEARCH_READY":"CONDITIONAL_RESOURCE_RESEARCH_PARTIAL",to:edge.to,added,achieved:q.achieved,remaining:q.remaining,suffixHash:key(suffix),stateHash:edge.stateHash};
   add(id,edge.to,p.target);enqueue(id,edge.to);stats.resourceResearchAdvanced++;stats.resourceResearchGoals+=q.achieved.length;
  }catch(e){resourceResearch[k]={...rec,status:"LIMITED_UNRESOLVED",reason:String(e.message)};}
 }
 function next(){
  const list=Object.entries(front).filter(([k,x])=>!attempted[k]&&graphs[x.graph]?.nodes[x.node]&&!graphs[x.graph].blocker);
  list.sort(([,a],[,b])=>graphs[b.graph].nodes[b.node].traits.length-graphs[a.graph].nodes[a.node].traits.length||a.node-b.node||a.target.localeCompare(b.target));
  return list[0];
 }
 function run([k,x]){
  const {graph:id,node:i,target}=x,g=graphs[id],t=targetMap.get(target);
  const base={world:loadNode(id,g,i),steps:stepsFor(g,i)},n=g.nodes[i],out=[];
  if(!t.researchGoals.every(a=>active(base.world,a))){attempted[k]={status:"TERMINAL_GOAL_INACTIVE",out};return;}
  const candidates=(byBody.get(n.body)||[]).filter(r=>r.requires.every(a=>active(base.world,a))&&!r.forbiddenSoldierTypes?.includes(n.body)&&
   !(r.requiredPreviousTransformations||[]).some(a=>!member(base.world).state.history.has(a))&&!(r.forbiddenPreviousTransformations||[]).some(a=>member(base.world).state.history.has(a)));
  candidates.sort((a,b)=>Number(!!b.soldierBonusType&&!n.traits.includes(b.soldierBonusType))-Number(!!a.soldierBonusType&&!n.traits.includes(a.soldierBonusType))||a.id.localeCompare(b.id));
  function offer(action,q,r=null,mode="NORMAL"){
   if(!q||q.steps.length<=base.steps.length){out.push({action,status:"UNRESOLVED_OR_UNCHANGED",mode});return;}
   const suffix=q.steps.slice(base.steps.length);
   try{
    const w=replay.replay(suffix,base.world);if(exactWorld(w)!==exactWorld(q.world))throw Error("suffix mismatch");
    if(!context(g.branch,{allowedDifficulties:g.allowedDifficulties},[...g.birthActions,...q.steps],w).length)throw Error("context mismatch");
    const edge=insert(id,g,w,i,action,suffix,true),row={action,...edge,mode};
    const hasExternal=suffix.some(s=>s.type==="externalInputs");
    if(r&&hasExternal){const pk=key(["surgery-v2",id,i,target,r.id]);recordPlan(pk,base.world,r,"surgery",{graph:id,node:i,target,origin:g.origin,branch:g.branch,surgery:r.id});row.supplyPlan=pk;}
    if(edge.status==="CONDITIONAL_REPLAY")stats.newStates++;else stats.aliases++;
    stats[ r?"transforms":"growth"]++;
    if(r&&suffix.some(s=>s.type==="manufacture"))stats.stockManufacture++;
    if(r&&!hasExternal)stats.noNewExternalInputs++;
    if(t.researchGoals.every(a=>active(w,a)))add(id,edge.to,target);
    enqueue(id,edge.to);out.push(row);
   }catch(e){stats.errors++;out.push({action,status:"LIMITED_UNRESOLVED",reason:String(e.message),mode});}
  }
  // Budget interruption is not a closure; resume remaining actions next run.
  const prev=records[k]?.out||[],done=new Set(prev.map(r=>r.action));out.push(...prev);
  if(!done.has("CAP_GROWTH")&&performance.now()<deadline())try{offer("CAP_GROWTH",replay.grow(base));}catch(e){out.push({action:"CAP_GROWTH",status:"LIMITED_UNRESOLVED",reason:String(e.message)});}
  for(const r of candidates){
   if(done.has(r.id))continue;if(performance.now()>=deadline())break;
   try{const meet=replay.meet(base,r);const q=meet&&stockManufacture(meet,r,data,replay,index);offer(r.id,q||replay.transform(base,r),r,q?"STOCK_REPLAY":"CONDITIONAL_RESOURCE_REPLAY");}catch(e){out.push({action:r.id,status:"LIMITED_UNRESOLVED",reason:String(e.message)});}
  }
  records[k]={...x,out,eligibleActions:candidates.length};
  if(new Set(out.map(r=>r.action)).size===candidates.length+1){attempted[k]={status:"ACTIVE_ACTION_BATCH_EXAMINED_NOT_TERMINAL_CLOSURE"};stats.processed++;}
 }
 function summary(){
  const p=Object.values(plans).filter(r=>r.plan),terminalPlans=p.filter(r=>r.kind==="terminal"),surgeryPlans=p.filter(r=>r.kind==="surgery"),all=Object.values(records).flatMap(r=>r.out);
  return {scope:"SOURCE_RULE_PROCUREMENT_AND_CONDITIONAL_CAREER",sourceFingerprint:index.evidence.fingerprint,terminalPlans:terminalPlans.length,terminalPlansV2:terminalPlans.filter(r=>r.plannerVersion===2).length,resourceResearchAttempts:Object.keys(resourceResearch).length,resourceResearchAdvanced:Object.values(resourceResearch).filter(r=>r.suffixHash).length,resourceResearchReady:Object.values(resourceResearch).filter(r=>r.status==="CONDITIONAL_RESOURCE_RESEARCH_READY").length,surgeryPlans:surgeryPlans.length,planErrors:Object.values(plans).filter(r=>r.error).length,procurementObligations:p.reduce((s,r)=>s+r.plan.obligations.length,0),manufactureOperations:p.reduce((s,r)=>s+r.plan.steps.filter(x=>x.type==="manufacture").length,0),purchaseOperations:p.reduce((s,r)=>s+r.plan.steps.filter(x=>x.type==="purchase").length,0),facilityOperations:p.reduce((s,r)=>s+r.plan.steps.filter(x=>x.type==="buildFacility").length,0),terminalStates:Object.keys(front).length,processed:Object.keys(attempted).length,pending:Object.keys(front).filter(k=>!attempted[k]).length,newReplayedStates:all.filter(r=>r.status==="CONDITIONAL_REPLAY").length,round:stats,completeCampaigns:0};
 }
 return {nextPlan,runPlan,next,run,nextResearch,runResearch,resourceResearch,plans,front,records,attempted,stats,summary,sourceEvidence:index.evidence};
}
