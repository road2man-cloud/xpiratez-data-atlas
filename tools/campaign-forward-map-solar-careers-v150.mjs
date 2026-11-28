// V150: consume new map/implicit supply proofs, keep legal research ordering.
import assert from 'node:assert/strict';
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
export function continueSolarCareer({entries,step,priorGraph,supply,data,stats}){
 assert.equal(priorGraph.convergence.policy,'branch-local-no-nepotism-v149');
 const p=priorGraph.convergence.solar;
 let entry=entries.find(e=>e.n.id===p.end);assert(entry,'missing V149 solar terminal');
 const start=entry.n.id,initialVector=stats(entry.w).permanentStats;assert.deepEqual(initialVector,p.finalVector);
 const traces=[],rejected=[],blocked=[],goals=[],proofs=[];
 let budget=60,phase='romanica';
 const history=()=>entry.w.soldiers.find(s=>s.id==='origin').state.history;
 function attempt(action){
  const {w,n}=entry,r=step(w,n,action);
  if(!r.ok){rejected.push({phase,from:n.id,action,reason:r.reason});return false;}
  if(r.n.id===n.id)return true;
  traces.push({phase,from:n.id,to:r.n.id,action,added:r.n.researched.filter(k=>!n.researched.includes(k))});
  if(action.type==='researchSupplyV150')proofs.push(action);
  entry={w:r.w,n:r.n};return true;
 }
 function resolve(preferred){
  for(let j=0;j<16&&entry.w.pendingFree;j++){
   const t=entry.w.pendingFree,choices=t.sequential?t.choices.slice(0,1):t.choices,id=choices.includes(preferred)?preferred:choices[0];
   if(!id||!attempt({type:'freeResearch',source:t.source,research:id,assumeOutcome:!t.sequential&&t.choices.length>1}))return false;
  }return !entry.w.pendingFree;
 }
 function material(item,n=1){
  if((entry.w.items[item]||0)>=n)return true;
  const a=supply.action(entry.w,item,n);
  if(!a){blocked.push({phase,item,minimum:n,reason:'no reachable source'});return false;}
  return attempt(a);
 }
 const rules=data.researchRules;
 function research(id,preferred,seen=new Set(),depth=0){
  if(active(entry.w,id))return true;
  if(depth>12||seen.has(id)||entry.w.disabled.has(id)||!rules[id]||budget<=0)return false;
  budget--;const r=rules[id],next=new Set(seen);next.add(id);
  if(!resolve(preferred))return false;
  const lab=()=>{
   if(!(r.cost>0)||r.requires?.length||entry.w.researched.has(id))return false;
   if(r.needItem&&!material(r.neededItem||id))return false;
   if(!entry.n.available.includes(id))return false;
   return attempt({type:'research',id})&&resolve(preferred)&&active(entry.w,id);
  };
  if(entry.n.available.includes(id)&&!entry.w.researched.has(id))return lab();
  // When it is an item-gated research, try the sample if all other known gates pass.
  if(r.cost>0&&!r.requires?.length&&r.needItem&&r.dependencies.every(k=>entry.w.researched.has(k))&&r.requiresBaseFunc.every(k=>entry.w.baseFunctions.has(k))&&lab())return true;
  // Visit all relevant prerequisites, not only the first missing one.
  for(const k of r.dependencies||[])if(!entry.w.researched.has(k))research(k,undefined,next,depth+1);
  if(active(entry.w,id)||lab())return true;
  const donors=Object.entries(rules).filter(([k,t])=>active(entry.w,k)&&t.cost>0&&!t.requires?.length&&((t.getOneFree||[]).includes(id)||Object.entries(t.getOneFreeProtected||{}).some(([g,ids])=>active(entry.w,g)&&ids.includes(id))));
  for(const [source,t] of donors){
   if(t.needItem&&!material(t.neededItem||source))continue;
   if(!entry.n.available.includes(source))continue;
   if(attempt({type:'repeatResearch',id:source,assumeAvailability:true})&&resolve(id)&&active(entry.w,id))return true;
  }
  blocked.push({phase,research:id,missingDependencies:r.dependencies.filter(k=>!entry.w.researched.has(k)),missingFunctions:r.requiresBaseFunc.filter(k=>!entry.w.baseFunctions.has(k)),reason:'no legal transition found'});
  return false;
 }
 function goal(id,limit=24){budget=limit;const before=traces.length,ok=research(id);goals.push({phase,id,ok:active(entry.w,id),actions:traces.length-before});return ok;}
 function train(id){
  if(history().has(id))return true;
  const t=data.transformations.find(x=>x.id===id);
  if(!t||!t.requires.every(k=>active(entry.w,k)))return false;
  const forbidden=t.forbiddenPreviousTransformations.filter(k=>history().has(k));
  if(forbidden.length){blocked.push({phase,transform:id,forbidden});return false;}
  if(!Object.entries(t.requiredItems||{}).every(([k,n])=>material(k,n)))return false;
  return attempt({type:'transform',soldier:'origin',transform:id});
 }
 assert(!history().has('STR_NEPOTISM'));
 // Reach the church atrium through the captive research gates, then recover
 // the two artifacts from its own raw map (not Italy start-event grants).
 for(const id of ['STR_CHURCH_SOLDIER','STR_CHURCH_PRIEST','STR_MISSION_CHURCH_CAMP','STR_GOLDEN_CROSS','STR_GOLDEN_CUP','STR_CONTACT_ROMANICA'])goal(id);
 phase='saya-branch';
 // Follow the actual bounty reward sequence. Implicit recipes require their
 // named zero-cost preconditions; no special research grants are introduced.
 for(const id of ['STR_BOUNTY_HUNTING_PRIZE_ALLIANCE_FAVORS','STR_BOUNTY_HUNTING_PRIZE_SAYA','STR_BOUNTY_HUNTING_PRIZE_CITY_PASS','STR_BOUNTY_HUNTING_PRIZE_HOLOSUIT','STR_PLOTTING','STR_AREAS_EUROPE','STR_AREAS_ASIA','STR_AREAS_SOUTH','STR_NINJA','STR_BOUNTY_HUNTING_PRIZE_DATING_SAYA'])goal(id,25);
 phase='solar';
 goal('STR_BUSHIDO_HANDBOOK',25);goal('STR_SUN_WARRIORS_TRAINING',20);
 if(active(entry.w,'STR_SUN_WARRIORS_TRAINING'))train('STR_SUN_WARRIORS_TRAINING');
 phase='compatible-advanced';
 // Useful adjacent progress, but no fake completed capstones.
 for(const id of ['STR_CRUSADER_ARMOR','STR_PSIONIC_LABORATORY','STR_DREAMLINK_TRAINING','STR_NEPHILIM_LEGACY','STR_HOLY_WARRIORS'])goal(id,25);
 for(const id of ['STR_DREAMLINK_TRAINING','STR_NEPHILIM_LEGACY','STR_HOLY_WARRIOR_TRAINING'])train(id);
 const finalVector=stats(entry.w).permanentStats;
 const uniqueGoals=[...new Set(goals.map(g=>g.id))];
 return {policy:'branch-local-map-solar-v150',start,end:entry.n.id,initialVector,finalVector,initialSum:sum(initialVector),finalSum:sum(finalVector),history:[...history()],supplyCatalog:supply.counts,goals,completed:uniqueGoals.filter(k=>active(entry.w,k)),missing:uniqueGoals.filter(k=>!active(entry.w,k)),proofs,blocked,traces,rejected,accepted:traces.length,gameCertified:false,registered:false};
}
