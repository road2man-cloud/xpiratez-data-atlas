// Continue every reachable terminal-research state through actual local
// transformation replay. No finite depth is a completion criterion.
import {key} from "./population-research-career-core.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
import {createSupplyPlan} from "./atlas-terminal-supply-core.mjs";
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
export function createTerminalSupplyFollowthrough({terminal,terminalRule,graphs,byBody,data,index,replay,loadNode,stepsFor,context,insert,enqueue,prior={},deadline}){
 const plans=prior.plans||{},records=prior.records||{},front=prior.front||{},attempted=prior.attempted||{},targetMap=new Map(terminalRule.targets.map(t=>[t.id,t]));
 const stats={rootPlans:0,surgeryPlans:0,processed:0,newStates:0,aliases:0,transforms:0,growth:0,stockManufacture:0,noNewExternalInputs:0,errors:0};
 function recordPlan(k,w,target,kind,ref){
  if(plans[k])return plans[k];
  try{
   const planner=createSupplyPlan(index,data,w);
   const plan=kind==="terminal"?planner.planTerminal(target):planner.planSurgery(target);
   plans[k]={...ref,kind,plan};stats[kind==="terminal"?"rootPlans":"surgeryPlans"]++;
  }catch(e){plans[k]={...ref,kind,error:String(e.message)};stats.errors++;}
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
  for(const r of Object.values(terminal.records)){
   if(r.status!=="CONDITIONAL_TARGET_RESEARCH_READY"||!Number.isInteger(r.to)||!graphs[r.graph]?.nodes[r.to])continue;
   const k=key(["terminal",r.graph,r.to,r.target]);if(plans[k])continue;
   return {k,r};
  }
 }
 function runPlan(t){const {k,r}=t,g=graphs[r.graph],w=loadNode(r.graph,g,r.to);return recordPlan(k,w,targetMap.get(r.target),"terminal",{graph:r.graph,node:r.to,target:r.target,origin:g.origin,branch:g.branch});}
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
    if(r&&hasExternal){const pk=key(["surgery",id,i,target,r.id]);recordPlan(pk,base.world,r,"surgery",{graph:id,node:i,target,origin:g.origin,branch:g.branch,surgery:r.id});row.supplyPlan=pk;}
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
  return {scope:"SOURCE_RULE_PROCUREMENT_AND_CONDITIONAL_CAREER",sourceFingerprint:index.evidence.fingerprint,terminalPlans:terminalPlans.length,surgeryPlans:surgeryPlans.length,planErrors:Object.values(plans).filter(r=>r.error).length,procurementObligations:p.reduce((s,r)=>s+r.plan.obligations.length,0),manufactureOperations:p.reduce((s,r)=>s+r.plan.steps.filter(x=>x.type==="manufacture").length,0),purchaseOperations:p.reduce((s,r)=>s+r.plan.steps.filter(x=>x.type==="purchase").length,0),facilityOperations:p.reduce((s,r)=>s+r.plan.steps.filter(x=>x.type==="buildFacility").length,0),terminalStates:Object.keys(front).length,processed:Object.keys(attempted).length,pending:Object.keys(front).filter(k=>!attempted[k]).length,newReplayedStates:all.filter(r=>r.status==="CONDITIONAL_REPLAY").length,round:stats,completeCampaigns:0};
 }
 return {nextPlan,runPlan,next,run,plans,front,records,attempted,stats,summary,sourceEvidence:index.evidence};
}
