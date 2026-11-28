// V146: use five raw primal mission victory transitions, then apply compatible training.
import assert from 'node:assert/strict';
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
export function continuePrimalCareer({entries,step,priorGraph,primal,bounty,book,expedition,priestSupply,stats,parentActions}){
 assert.equal(priorGraph.convergence.policy,'branch-local-pre-crown-v145');
 const p=priorGraph.convergence.lanes.find(x=>x.lane==='reject-power-priestess');
 let entry=entries.find(e=>e.n.id===p.end);assert(entry);
 const start=entry.n.id,initialVector=stats(entry.w).permanentStats;assert.deepEqual(initialVector,p.finalVector);
 const traces=[],rejected=[];
 function attempt(action){
  const {w,n}=entry,r=step(w,n,action);
  if(!r.ok){rejected.push({from:n.id,action,reason:r.reason});return false;}
  if(r.n.id===n.id)return true;
  traces.push({from:n.id,to:r.n.id,action,added:r.n.researched.filter(k=>!n.researched.includes(k))});
  entry={w:r.w,n:r.n};return true;
 }
 function resolve(preferred){
  for(let i=0;i<12&&entry.w.pendingFree;i++){
   const t=entry.w.pendingFree,choices=t.sequential?t.choices.slice(0,1):t.choices,id=choices.includes(preferred)?preferred:choices[0];
   if(!id||!attempt({type:'freeResearch',source:t.source,research:id,assumeOutcome:!t.sequential&&t.choices.length>1}))return false;
  }
  return !entry.w.pendingFree;
 }
 function research(id,preferred){return active(entry.w,id)||resolve(preferred)&&attempt({type:'research',id})&&resolve(preferred);}
 const has=(id,n=1)=>(entry.w.items[id]||0)>=n;
 const history=()=>entry.w.soldiers.find(s=>s.id==='origin').state.history;
 function train(id){return history().has(id)||attempt({type:'transform',soldier:'origin',transform:id});}
 if(research('STR_MONSTER_HUNTS_PRIMAL')){
  if(!entry.w.conditionalPrimalTransport)attempt(primal.transportAction);
  if(entry.w.conditionalPrimalTransport){
   for(const name of primal.names){
    const a=primal.action(name,entry.w.month+1);
    if(active(entry.w,a.research))continue;
    if(!attempt(a)||!resolve())break;
   }
  }
 }
 // Coronation now has an actual mission reward as its ancestor.
 research('STR_CROWNING_UC');
 if(active(entry.w,'STR_CROWNING_UC')){
  if(!history().has('STR_BREAD_AND_FISHES_TRAINING')){
   for(let i=0;i<5&&(!has('STR_LEEK_SACK')||!has('STR_CABBAGE_SACK'));i++){
    if(!attempt(bounty.harvestAction(entry.w.month+1)))break;
   }
   for(const a of parentActions.filter(a=>a.type==='manufacture'&&['STR_LEEK','STR_CABBAGE'].includes(a.item)))if(!has(a.item,5))attempt(a);
   const missing=5-(entry.w.items.STR_MUTANT_FISH||0);
   if(missing>0)attempt({type:'acquirePurchase',item:'STR_MUTANT_FISH',count:missing});
   if(research('STR_BREAD_AND_FISHES_TRAINING'))train('STR_BREAD_AND_FISHES_TRAINING');
  }
  for(const id of ['STR_MUTANT_EGG','STR_CUISINE','STR_SOLDIER_TYPE_BASIC','STR_GYM_ADVANCE','STR_SMITHING','STR_SS_OPERATIONS','STR_PEASANT_MILITIA','STR_SARGEANT_TRAINING'])research(id);
 }
 // Cap-limited ordinary training goes first. The permanent Pariah trait is additive.
 if(active(entry.w,'STR_QUEEN_SAVAGE')&&research('STR_PARIAH_TRAINING'))train('STR_PARIAH_TRAINING');
 const finalVector=stats(entry.w).permanentStats,goals=['STR_MONSTER_HUNTS_PRIMAL','STR_MONSTER_HUNT_PRIMAL_WEREWOLF_DONE','STR_MONSTER_HUNT_PRIMAL_BULLFROG_DONE','STR_MONSTER_HUNT_PRIMAL_SHAMBLER_DONE','STR_MONSTER_HUNT_PRIMAL_COCKROACH_DONE','STR_QUEEN_SAVAGE','STR_CROWNING_UC','STR_PARIAH_TRAINING','STR_BREAD_AND_FISHES_TRAINING','STR_GYM_ADVANCE'];
 const preserved=priorGraph.convergence.lanes.find(x=>x.lane==='gold-occult');
 return {policy:'branch-local-primal-v146',lanes:[{lane:'reject-power-priestess',start,end:entry.n.id,initialVector,finalVector,initialSum:sum(initialVector),finalSum:sum(finalVector),accepted:traces.length,completed:goals.filter(id=>active(entry.w,id)),missing:goals.filter(id=>!active(entry.w,id)),stock:Object.fromEntries(['STR_SKULL','STR_MUTANT_FISH','STR_LEEK','STR_CABBAGE','STR_SIVALINGA'].map(id=>[id,entry.w.items[id]||0])),transport:entry.w.conditionalPrimalTransport||null,victories:entry.w.conditionalPrimalVictories||[],history:[...history()],gameCertified:false,registered:false},{lane:'gold-occult',start:preserved.end,end:preserved.end,initialVector:preserved.finalVector,finalVector:preserved.finalVector,initialSum:preserved.finalSum,finalSum:preserved.finalSum,accepted:0,preserved:true,gameCertified:false,registered:false}],traces,rejected,accepted:traces.length,gameCertified:false,registered:false};
}
