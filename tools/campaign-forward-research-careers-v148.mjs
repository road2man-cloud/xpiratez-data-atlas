// V148: focus on legal research ordering and transformations; supply is reachability.
import assert from 'node:assert/strict';
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
export function continueResearchOnly({entries,step,priorGraph,supply,data,stats}){
 assert.equal(priorGraph.convergence.policy,'branch-local-warrior-order-v147');
 let entry=entries.find(e=>e.n.id===priorGraph.convergence.common);assert(entry);
 const fork=entry.n.id,traces=[],rejected=[],lanes=[],blocked=[],proofs=[];
 let phase='research-only-preparation',budget=100;
 function attempt(action){
  const {w,n}=entry,r=step(w,n,action);
  if(!r.ok){rejected.push({lane:phase,from:n.id,action,reason:r.reason});return false;}
  if(r.n.id===n.id)return true;
  traces.push({lane:phase,from:n.id,to:r.n.id,action,added:r.n.researched.filter(k=>!n.researched.includes(k))});
  if(action.type==='researchSupply')proofs.push(action);
  entry={w:r.w,n:r.n};return true;
 }
 function resolve(preferred){
  for(let j=0;j<16&&entry.w.pendingFree;j++){
   const t=entry.w.pendingFree,choices=t.sequential?t.choices.slice(0,1):t.choices,id=choices.includes(preferred)?preferred:choices[0];
   if(!id||!attempt({type:'freeResearch',source:t.source,research:id,assumeOutcome:!t.sequential&&t.choices.length>1}))return false;
  }return !entry.w.pendingFree;
 }
 function material(item,minimum=1){
  if((entry.w.items[item]||0)>=minimum)return true;
  const a=supply.action(entry.w,item,minimum);
  if(!a){blocked.push({lane:phase,item,minimum,reason:'no reachable indexed source'});return false;}
  return attempt(a);
 }
 const researchRules=data.researchRules;
 function research(id,preferred,seen=new Set(),depth=0){
  if(active(entry.w,id))return true;
  if(depth>12||seen.has(id)||entry.w.disabled.has(id)||!researchRules[id]||budget<=0)return false;
  budget--;const r=researchRules[id],next=new Set(seen);next.add(id);
  if(!resolve(preferred))return false;
  const lab=()=>{
   if(r.cost<=0||r.requires?.length||entry.w.researched.has(id))return false;
   if(r.needItem&&!material(r.neededItem||id))return false;
   if(!entry.n.available.includes(id))return false;
   return attempt({type:'research',id})&&resolve(preferred)&&active(entry.w,id);
  };
  // The legal menu is authoritative; never force AND prerequisites if unlocked by a free path.
  if(entry.n.available.includes(id))return lab();
  if(r.cost>0&&!r.requires?.length&&r.needItem&&r.dependencies.every(k=>entry.w.researched.has(k))&&r.requiresBaseFunc.every(k=>entry.w.baseFunctions.has(k))&&lab())return true;
  for(const k of r.dependencies||[])if(!entry.w.researched.has(k)&&!research(k,undefined,next,depth+1))break;
  if(active(entry.w,id))return true;
  if(lab())return true;
  // A completed research may have a repeatable free award. Check its actual source rules.
  const candidates=Object.entries(researchRules).filter(([k,t])=>active(entry.w,k)&&t.cost>0&&!t.requires?.length&&((t.getOneFree||[]).includes(id)||Object.entries(t.getOneFreeProtected||{}).some(([g,ids])=>active(entry.w,g)&&ids.includes(id))));
  for(const [source,t] of candidates){
   if(t.needItem&&!material(t.neededItem||source))continue;
   if(!entry.n.available.includes(source))continue;
   if(attempt({type:'repeatResearch',id:source,assumeAvailability:true})&&resolve(id)&&active(entry.w,id))return true;
  }
  blocked.push({lane:phase,research:id,missingDependencies:r.dependencies.filter(k=>!entry.w.researched.has(k)),missingFunctions:r.requiresBaseFunc.filter(k=>!entry.w.baseFunctions.has(k)),reason:'no legal research transition found'});
  return false;
 }
 const history=()=>entry.w.soldiers.find(s=>s.id==='origin').state.history;
 function train(id){
  if(history().has(id))return true;
  const t=data.transformations.find(t=>t.id===id);
  if(!t||!t.requires.every(k=>active(entry.w,k)))return false;
  for(const [k,n] of Object.entries(t.requiredItems||{}))if(!material(k,n))return false;
  return attempt({type:'transform',soldier:'origin',transform:id});
 }
 // The prior sample was destroyed by research. Abstract the now-reachable
 // extraction chain (or another legal source) instead of requiring a second battle.
 assert(active(entry.w,'STR_SHAMBLER_CORPSE'));
 research('STR_BIG_BONE');
 research('STR_WARRIOR_CULTURE','STR_PROUD_WARRIOR');
 research('STR_PROUD_WARRIOR');
 const core=entry;
 const targets=['STR_PERSON_OF_CULTURE_TRAINING','STR_SUN_WARRIORS_TRAINING','STR_HUNTRESS_TRAINING'];
 for(const id of targets){budget=28;research(id);}
 const common=entry;
 const orderings=[
  {name:'warrior-officer-first',start:common,order:['STR_PROUD_WARRIOR','STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_PERSON_OF_CULTURE_TRAINING','STR_SUN_WARRIORS_TRAINING','STR_PARIAH_TRAINING']},
  {name:'pariah-first',start:common,order:['STR_PARIAH_TRAINING','STR_PROUD_WARRIOR','STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_PERSON_OF_CULTURE_TRAINING','STR_SUN_WARRIORS_TRAINING']},
  {name:'officer-personal-first',start:common,order:['STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_PROUD_WARRIOR','STR_PERSON_OF_CULTURE_TRAINING','STR_SUN_WARRIORS_TRAINING','STR_PARIAH_TRAINING']},
  {name:'minimal-core',start:core,order:['STR_PROUD_WARRIOR','STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_PARIAH_TRAINING']}
 ];
 for(const {name,start,order} of orderings){
  entry=start;phase=name;const begin=traces.length,initialVector=stats(entry.w).permanentStats,results=[];
  for(const id of order){
   const before=stats(entry.w).permanentStats,ok=train(id),after=stats(entry.w).permanentStats;
   results.push({id,ok,applied:history().has(id),delta:Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-before[k]]))});
  }
  const finalVector=stats(entry.w).permanentStats;
  lanes.push({lane:name,start:start.n.id,end:entry.n.id,initialVector,finalVector,initialSum:sum(initialVector),finalSum:sum(finalVector),accepted:traces.length-begin,order,results,history:[...history()],gameCertified:false,registered:false});
 }
 const goals=['STR_BIG_BONE','STR_WARRIOR_CULTURE','STR_PROUD_WARRIOR',...targets];
 return {policy:'research-only-source-reachability-v148',fork,common:common.n.id,core:core.n.id,supplyCatalog:supply.counts,commonResearch:{completed:goals.filter(k=>active(common.w,k)),missing:goals.filter(k=>!active(common.w,k))},lanes,proofs,blocked,traces,rejected,accepted:traces.length,gameCertified:false,registered:false,assumptions:['research order and actual transformation eligibility retained','known item source access is sufficient; quantities, tactical success, economics and calendar not certified']};
}
