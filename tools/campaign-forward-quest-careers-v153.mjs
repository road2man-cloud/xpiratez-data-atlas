// V153 ordered quest continuation from V152 run2.
import assert from 'node:assert/strict';
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
export function continueQuestCareer({entries,step,priorGraph,supply,data,stats}){
 assert.equal(priorGraph.convergence.policy,'branch-local-medical-v152');
 const p=priorGraph.convergence;
 let entry=entries.find(e=>e.n.id===p.end);assert(entry);
 const start=entry.n.id,initialVector=stats(entry.w).permanentStats;assert.deepEqual(initialVector,p.finalVector);
 const traces=[],rejected=[],blocked=[],goals=[],proofs=[];let budget=40,phase='contact';
 function attempt(action){
  const {w,n}=entry,r=step(w,n,action);
  if(!r.ok){rejected.push({phase,from:n.id,action,reason:r.reason});return false;}
  if(r.n.id===n.id)return true;
  traces.push({phase,from:n.id,to:r.n.id,action,added:r.n.researched.filter(k=>!n.researched.includes(k))});
  if(action.type.includes('Supply')||action.type.includes('Quest')||action.type.includes('Capture'))proofs.push(action);
  entry={w:r.w,n:r.n};return true;
 }
 function resolve(preferred){
  for(let i=0;i<16&&entry.w.pendingFree;i++){
   const t=entry.w.pendingFree,c=t.sequential?t.choices.slice(0,1):t.choices,id=c.includes(preferred)?preferred:c[0];
   if(!id||!attempt({type:'freeResearch',source:t.source,research:id,assumeOutcome:!t.sequential&&t.choices.length>1}))return false;
  }
  return !entry.w.pendingFree;
 }
 function material(item,n=1){
  if((entry.w.items[item]||0)>=n)return true;
  const a=supply.action(entry.w,item,n);if(!a){blocked.push({phase,item,minimum:n,reason:'no reachable supply'});return false;}
  return attempt(a);
 }
 const rules=data.researchRules;
 function research(id,preferred,seen=new Set(),depth=0){
  if(active(entry.w,id))return true;
  if(depth>12||seen.has(id)||entry.w.disabled.has(id)||!rules[id]||budget--<=0)return false;
  const r=rules[id],next=new Set(seen);next.add(id);
  if(!resolve(preferred))return false;
  function direct(){
   const a=supply.victory(entry.w,id)||supply.award(entry.w,id);
   return !!a&&attempt(a)&&resolve(preferred)&&active(entry.w,id);
  }
  function lab(){
   if(!(r.cost>0)||r.requires?.length||entry.w.researched.has(id))return false;
   if(r.needItem&&!material(r.neededItem||id))return false;
   return entry.n.available.includes(id)&&attempt({type:'research',id})&&resolve(preferred)&&active(entry.w,id);
  }
  if(direct())return true;
  if(entry.n.available.includes(id)&&lab())return true;
  for(const k of r.dependencies||[])if(!entry.w.researched.has(k))research(k,undefined,next,depth+1);
  if(active(entry.w,id)||lab()||direct())return true;
  const donors=Object.entries(rules).filter(([k,t])=>active(entry.w,k)&&t.cost>0&&!t.requires?.length&&((t.getOneFree||[]).includes(id)||Object.entries(t.getOneFreeProtected||{}).some(([g,ids])=>active(entry.w,g)&&ids.includes(id))));
  for(const [source,t] of donors){
   if(t.needItem&&!material(t.neededItem||source))continue;
   if(!entry.n.available.includes(source))continue;
   if(attempt({type:'repeatResearch',id:source,assumeAvailability:true})&&resolve(id)&&active(entry.w,id))return true;
  }
  blocked.push({phase,research:id,missingDependencies:r.dependencies.filter(k=>!entry.w.researched.has(k)),missingFunctions:r.requiresBaseFunc.filter(k=>!entry.w.baseFunctions.has(k))});return false;
 }
 function goal(id){budget=35;const before=traces.length;research(id);goals.push({phase,id,ok:active(entry.w,id),actions:traces.length-before});}
 for(const id of ['STR_PINUP_128','STR_TEC_036','STR_WASTELAND_SORCERESS','STR_TEC_051','STR_MUTANT_COMPLAINT','STR_LFS_001','STR_CLOAKING_DEVICE_INVESTIGATION'])goal(id);
 phase='transport-rewards';
 for(const id of ['STR_BOUNTY_HUNTING_PRIZE_MINI_SHOTGUN','STR_BOUNTY_HUNTING_PRIZE_BANK_FAVORS','STR_CONTACT_DEALERS','STR_TEC_040','STR_TEC_001','STR_TEC_041','STR_TEC_080','STR_TEC_081','STR_TEC_002','STR_TEC_003','STR_TEC_100','STR_TEC_100X','STR_TEC_174'])goal(id);
 phase='ang-quest';
 for(const id of ['STR_ANG_001','STR_ANG_002','STR_LOC_TAVERN_CELLAR_DONE','STR_MAIDEN_VICTIM','STR_ANG_003_PREQ','STR_ANG_003','STR_ANG_004','STR_TOMB_GUARDIAN','STR_ZOMBIE_DREAMS'])goal(id);
 phase='red-mage';
 for(const id of ['STR_BOUNTY_HUNTING_C_PASS','STR_HUMAN_MASTER','STR_PINUP_001','STR_WIZ_001_PREQ','STR_WIZ_001','STR_WIZ_002','STR_LIBER_OCCULTIS','STR_ANUS','STR_HYPERWAVE_MYSTICISM','STR_BOUNTY_HUNTING_PRIZE_ALLIANCE_FAVORS','STR_BOUNTY_HUNTING_PRIZE_JACK_FAVOR','STR_BOUNTY_HUNTING_PRIZE_DINOSAUR','STR_BOUNTY_HUNTING_PRIZE_HAND_MORTAR','STR_BOUNTY_HUNTING_PRIZE_CITY_PASS','STR_BOUNTY_HUNTING_B_PASS','STR_WIZ_003','STR_BLACK_MASK','STR_WIZ_080','STR_WIZ_081','STR_TEC_175','STR_DREAMLINK_TRAINING'])goal(id);
 if(active(entry.w,'STR_DREAMLINK_TRAINING')){
  if(!entry.w.baseFunctions.has('PSION')&&active(entry.w,'STR_PSIONIC_LABORATORY')&&material('STR_ALIEN_ENTERTAINMENT',10))attempt({type:'acquireFacility',id:'STR_PSIONIC_LABORATORY'});
  const t=data.transformations.find(t=>t.id==='STR_DREAMLINK_TRAINING');
  if(t&&Object.entries(t.requiredItems||{}).every(([k,n])=>material(k,n)))attempt({type:'transform',soldier:'origin',transform:t.id});
 }
 const finalVector=stats(entry.w).permanentStats,history=[...entry.w.soldiers.find(s=>s.id==='origin').state.history],ids=[...new Set(goals.map(g=>g.id))];
 return {policy:'branch-local-quest-v153',start,end:entry.n.id,initialVector,finalVector,initialSum:sum(initialVector),finalSum:sum(finalVector),history,supplyCatalog:supply.counts,goals,completed:ids.filter(k=>active(entry.w,k)),missing:ids.filter(k=>!active(entry.w,k)),proofs,blocked,traces,rejected,accepted:traces.length,gameCertified:false,registered:false};
}
