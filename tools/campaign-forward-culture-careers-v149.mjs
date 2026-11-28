// V149: rebranch before a forbidden training, keeping the research flag intact.
// The older route and every prior edge remain available. No history editing.
import assert from 'node:assert/strict';
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
export function continueCultureCareer({entries,step,priorGraph,supply,data,stats}){
 assert.equal(priorGraph.convergence.policy,'research-only-source-reachability-v148');
 const previous=priorGraph.convergence,byId=new Map(priorGraph.nodes.map(n=>[n.id,n])),worlds=new Map(entries.map(e=>[e.n.id,e]));
 const ancestry=[];let node=byId.get(previous.common);assert(node);
 while(node.parent){
  assert(node.parentAction);ancestry.push({from:node.parent,to:node.id,action:node.parentAction});
  node=byId.get(node.parent);assert(node);
 }
 ancestry.reverse();
 const j=ancestry.findIndex(t=>t.action.type==='transform'&&t.action.soldier==='origin'&&t.action.transform==='STR_NEPOTISM');assert(j>=0);
 const omitted=ancestry[j],history=()=>entry.w.soldiers.find(s=>s.id==='origin').state.history;
 let entry=worlds.get(omitted.from);assert(entry);
 const fork=entry.n.id,traces=[],rejected=[],blocked=[],lanes=[];
 let phase='alternative-ancestry';
 const initialVector=stats(entry.w).permanentStats;
 assert(active(entry.w,'STR_NEPOTISM')&&!history().has('STR_NEPOTISM'));
 function attempt(action){
  const {w,n}=entry,r=step(w,n,action);
  if(!r.ok){rejected.push({lane:phase,from:n.id,action,reason:r.reason});return false;}
  if(r.n.id===n.id)return true;
  traces.push({lane:phase,from:n.id,to:r.n.id,action,added:r.n.researched.filter(k=>!n.researched.includes(k))});
  entry={w:r.w,n:r.n};return true;
 }
 function resolve(preferred){
  for(let j=0;j<16&&entry.w.pendingFree;j++){
   const p=entry.w.pendingFree,choices=p.sequential?p.choices.slice(0,1):p.choices,id=choices.includes(preferred)?preferred:choices[0];
   if(!id||!attempt({type:'freeResearch',source:p.source,research:id,assumeOutcome:!p.sequential&&p.choices.length>1}))return false;
  }return !entry.w.pendingFree;
 }
 function material(k,n=1){
  if((entry.w.items[k]||0)>=n)return true;
  const a=supply.action(entry.w,k,n);
  if(!a){blocked.push({lane:phase,item:k,minimum:n,reason:'no reachable source'});return false;}
  return attempt(a);
 }
 function train(id){
  if(history().has(id))return true;
  const t=data.transformations.find(t=>t.id===id);if(!t||!t.requires.every(k=>active(entry.w,k)))return false;
  const forbidden=t.forbiddenPreviousTransformations.filter(k=>history().has(k));
  if(forbidden.length){blocked.push({lane:phase,transform:id,forbidden});return false;}
  if(!Object.entries(t.requiredItems||{}).every(([k,n])=>material(k,n)))return false;
  return attempt({type:'transform',soldier:'origin',transform:id});
 }
 function research(id,preferred){
  if(active(entry.w,id))return true;
  const r=data.researchRules[id];if(!r||r.cost<=0||!resolve(preferred))return false;
  if(r.needItem&&!material(r.neededItem||id))return false;
  return entry.n.available.includes(id)&&attempt({type:'research',id})&&resolve(preferred)&&active(entry.w,id);
 }
 let replayed=0,failed=null;
 for(const t of ancestry.slice(j+1)){
  // Regenerate the proof from the new world; never trust a proof from the donor.
  let a=t.action;
  if(a.type==='researchSupply'){
   if((entry.w.items[a.item]||0)>=a.minimum){replayed++;continue;}
   const actual=supply.action(entry.w,a.item,a.minimum);
   if(!actual){failed={action:a,reason:'missing source in alternative world'};break;}
   a=actual;
  }
  if(!attempt(a)){failed={action:a,reason:rejected.at(-1)?.reason};break;}
  replayed++;
 }
 const common=entry;const target=byId.get(previous.common);
 const missingCommonResearch=target.researched.filter(k=>!common.w.researched.has(k));
 const extraCommonResearch=[...common.w.researched].filter(k=>!target.researched.includes(k));
 const orders=[
  ['culture-before-pariah',['STR_PROUD_WARRIOR','STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_PERSON_OF_CULTURE_TRAINING','STR_PARIAH_TRAINING']],
  ['culture-first',['STR_PERSON_OF_CULTURE_TRAINING','STR_PROUD_WARRIOR','STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_PARIAH_TRAINING']],
  ['culture-after-pariah',['STR_PARIAH_TRAINING','STR_PROUD_WARRIOR','STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_PERSON_OF_CULTURE_TRAINING']]
 ];
 if(!failed){
  assert(!history().has('STR_NEPOTISM'));
  for(const [name,order] of orders){
   entry=common;phase=name;const begin=traces.length,before=stats(entry.w).permanentStats,results=[];
   for(const id of order){
    const b=stats(entry.w).permanentStats,ok=train(id),a=stats(entry.w).permanentStats;
    results.push({id,ok,applied:history().has(id),delta:Object.fromEntries(Object.keys(a).map(k=>[k,a[k]-b[k]]))});
   }
   const finalVector=stats(entry.w).permanentStats;
   lanes.push({lane:name,start:common.n.id,end:entry.n.id,initialVector:before,finalVector,initialSum:sum(before),finalSum:sum(finalVector),accepted:traces.length-begin,order,results,history:[...history()],gameCertified:false,registered:false});
  }
 }
 // Advance solar prerequisites on a proven culture endpoint, without pretending
 // a start-country item is present in this unrelated campaign.
 const best=lanes.filter(l=>l.results.every(r=>r.applied)).sort((a,b)=>b.finalSum-a.finalSum)[0];
 let solar=null;
 if(best){
  const last=entry; // entry may not be the best lane; retain independent world.
  const startEntry=best.end===last.n.id?last:null;
  // Re-run the winning order from common through transition cache.
  entry=common;phase='solar-preparation';for(const id of best.order)assert(train(id));
  assert.equal(entry.n.id,best.end);
  const start=entry.n.id,begin=traces.length;
  // Open access to church and eastern research without asserting missing samples.
  for(const id of ['STR_SMALL_RADAR_SYSTEM','STR_COMMUNICATIONS','STR_GOLDEN_CROSS','STR_GOLDEN_CUP','STR_CONTACT_ROMANICA','STR_BUSHIDO_HANDBOOK','STR_SUN_WARRIORS_TRAINING'])research(id);
  const goals=['STR_COMMUNICATIONS','STR_GOLDEN_CROSS','STR_GOLDEN_CUP','STR_CONTACT_ROMANICA','STR_BUSHIDO_HANDBOOK','STR_SUN_WARRIORS_TRAINING'];
  if(active(entry.w,'STR_SUN_WARRIORS_TRAINING'))train('STR_SUN_WARRIORS_TRAINING');
  solar={start,end:entry.n.id,accepted:traces.length-begin,completed:goals.filter(k=>active(entry.w,k)),missing:goals.filter(k=>!active(entry.w,k)),finalVector:stats(entry.w).permanentStats,finalSum:sum(stats(entry.w).permanentStats),history:[...history()]};
 }
 return {policy:'branch-local-no-nepotism-v149',fork,omittedAction:omitted.action,replayed,expectedReplay:ancestry.length-j-1,replayFailure:failed,common:common.n.id,missingCommonResearch,extraCommonResearch,initialVector,lanes,solar,blocked,traces,rejected,accepted:traces.length,priorBest:Math.max(...previous.lanes.map(l=>l.finalSum)),gameCertified:false,registered:false};
}
