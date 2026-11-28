// V151: live capture and multi-topic event awards for advanced training.
import assert from 'node:assert/strict';
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
export function continueAdvancedCareer({entries,step,priorGraph,supply,data,stats}){
 assert.equal(priorGraph.convergence.policy,'branch-local-map-solar-v150');
 const p=priorGraph.convergence;
 let entry=entries.find(e=>e.n.id===p.end);assert(entry,'missing V150 advanced terminal');
 const start=entry.n.id,initialVector=stats(entry.w).permanentStats;assert.deepEqual(initialVector,p.finalVector);
 const traces=[],rejected=[],blocked=[],goals=[],proofs=[];
 let budget=60,phase='romanica';
 const history=()=>entry.w.soldiers.find(s=>s.id==='origin').state.history;
 function attempt(action){
  const {w,n}=entry,r=step(w,n,action);
  if(!r.ok){rejected.push({phase,from:n.id,action,reason:r.reason});return false;}
  if(r.n.id===n.id)return true;
  traces.push({phase,from:n.id,to:r.n.id,action,added:r.n.researched.filter(k=>!n.researched.includes(k))});
  if(['researchSupplyV150','researchCaptureV151','researchEventV151'].includes(action.type))proofs.push(action);
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
  const award=supply.award(entry.w,id);
  if(award&&attempt(award)&&resolve(preferred)&&active(entry.w,id))return true;
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
  const laterAward=supply.award(entry.w,id);
  if(laterAward&&attempt(laterAward)&&resolve(preferred)&&active(entry.w,id))return true;
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
 // Separate research awards from samples, and use actual unlocked mission paths for captures.
 phase='holy-warriors';
 for(const id of ['STR_SQUIRE','STR_OSIRON_LAD','STR_SECTOID_NAVIGATOR','STR_OSIRON','STR_HOLY_WARRIORS'])goal(id,20);
 if(active(entry.w,'STR_HOLY_WARRIORS'))train('STR_HOLY_WARRIOR_TRAINING');
 phase='captains-log-2';
 for(const id of ['STR_PIRATEZ_HIERARCHY','STR_CONTACT_SMUGGLERS','STR_SAT_NETWORK','STR_ONSEN'])goal(id,40);
 // The appropriate log depends on the campaign month; do not fabricate it.
 for(let i=0;i<26&&!active(entry.w,'STR_CAPTAINS_LOG_02');i++){
  const a=supply.award(entry.w,'STR_CAPTAINS_LOG_02');
  if(a){if(attempt(a))resolve();break;}
  const logReady=['STR_CAPTAINS_LOG_01','STR_PERSUASION','STR_SAT_NETWORK','STR_PIRATEZ_HIERARCHY','STR_CHRONICLES_001','STR_NO_CIVILIAN_TRAFFIC','STR_CONTACT_SMUGGLERS','STR_BIKINI_PRODUCTION','STR_MEIDO_OUTFIT','STR_ONSEN','STR_PLOTTING'].every(k=>active(entry.w,k))&&entry.w.globalFacilities.has('STR_LIBRARY');
  if(!logReady||entry.w.month>=24||!attempt({type:'advanceMonth',month:entry.w.month+1,assumeContinuity:true}))break;
 }
 goal('STR_CAPTAINS_LOG_02',8);goal('STR_PSIONIC_LABORATORY',15);
 phase='dreamlink';
 for(const id of ['STR_TEC_174','STR_WIZ_081','STR_ZOMBIE_GRUBAS_TERRORIST','STR_ZOMBIE_STERILE_TERRORIST','STR_ZOMBIE_GRUBAS_CORPSE','STR_ZOMBIE_STERILE_CORPSE','STR_ZOMBIE','STR_ZOMBIE_COMMUNICATION_DEVICE','STR_ZOMBIE_BRAIN','STR_TOMB_GUARDIAN','STR_NECROPIRATE','STR_ANG_003','STR_ZOMBIE_DREAMS','STR_TEC_175','STR_DREAMLINK_TRAINING'])goal(id,20);
 if(active(entry.w,'STR_DREAMLINK_TRAINING'))train('STR_DREAMLINK_TRAINING');
 const finalVector=stats(entry.w).permanentStats;
 const uniqueGoals=[...new Set(goals.map(g=>g.id))];
 return {policy:'branch-local-map-solar-v150',start,end:entry.n.id,initialVector,finalVector,initialSum:sum(initialVector),finalSum:sum(finalVector),history:[...history()],supplyCatalog:supply.counts,goals,completed:uniqueGoals.filter(k=>active(entry.w,k)),missing:uniqueGoals.filter(k=>!active(entry.w,k)),proofs,blocked,traces,rejected,accepted:traces.length,gameCertified:false,registered:false};
}
