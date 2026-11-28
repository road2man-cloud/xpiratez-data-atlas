// V147: compare identical research/supply branches with different training orders.
import assert from 'node:assert/strict';
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
export function continueWarriorCareer({entries,step,priorGraph,warrior,book,expedition,priestSupply,stats}){
 assert.equal(priorGraph.convergence.policy,'branch-local-primal-v146');
 const prev=priorGraph.convergence.lanes.find(x=>x.lane==='reject-power-priestess');
 const old=priorGraph.convergence.traces;
 const i=old.findIndex(t=>t.action.type==='conditionalPrimalVictory'&&t.action.name==='Shambler');assert(i>=0);
 let entry=entries.find(e=>e.n.id===old[i].from);assert(entry,'missing pre-Shambler state');
 const fork=entry.n.id,traces=[],rejected=[],lanes=[];
 let phase='same-battle-supply';
 function attempt(action){
  const {w,n}=entry,r=step(w,n,action);
  if(!r.ok){rejected.push({lane:phase,from:n.id,action,reason:r.reason});return false;}
  if(r.n.id===n.id)return true;
  traces.push({lane:phase,from:n.id,to:r.n.id,action,added:r.n.researched.filter(k=>!n.researched.includes(k))});
  entry={w:r.w,n:r.n};return true;
 }
 function resolve(preferred){
  for(let j=0;j<12&&entry.w.pendingFree;j++){
   const t=entry.w.pendingFree,choices=t.sequential?t.choices.slice(0,1):t.choices,id=choices.includes(preferred)?preferred:choices[0];
   if(!id||!attempt({type:'freeResearch',source:t.source,research:id,assumeOutcome:!t.sequential&&t.choices.length>1}))return false;
  }return !entry.w.pendingFree;
 }
 function research(id,preferred){return active(entry.w,id)||resolve(preferred)&&attempt({type:'research',id})&&resolve(preferred);}
 const has=(id,n=1)=>(entry.w.items[id]||0)>=n;
 const history=()=>entry.w.soldiers.find(s=>s.id==='origin').state.history;
 const train=id=>history().has(id)||attempt({type:'transform',soldier:'origin',transform:id});
 // Reuse the actual V146 tail, replacing only the original Shambler action.
 assert(attempt(warrior.recoverAction(old[i].action.month)),'same battle recovery failed');
 for(const t of old.slice(i+1)){
  if(t.action.type==='transform'&&t.action.transform==='STR_PARIAH_TRAINING')continue;
  assert(attempt(t.action),'V146 tail replay failed: '+JSON.stringify(t.action));
 }
 assert(!history().has('STR_PARIAH_TRAINING')&&active(entry.w,'STR_PARIAH_TRAINING'));
 // Recover, research and extract the corpse before consuming the sample.
 if(research('STR_SHAMBLER_CORPSE')&&has('STR_SHAMBLER_CORPSE'))attempt(warrior.extractAction);
 research('STR_BIG_BONE');
 research('STR_WARRIOR_CULTURE','STR_PROUD_WARRIOR');
 research('STR_PROUD_WARRIOR');
 // Real supply for both officer and personal-attention prerequisites.
 if(!active(entry.w,'STR_BOOK_OF_SERMONS')){
  if(!has('STR_BOOK_OF_SERMONS')){
   if(!has(expedition.box)){
    if(!has(expedition.survey))attempt({type:'acquirePurchase',item:expedition.survey,count:1});
    if(has(expedition.survey))attempt(expedition.action(expedition.debrief,0));
   }
   if(has(expedition.box))attempt(expedition.bundleFor(expedition.open,'STR_BOOK_OF_SERMONS'));
  }
  research('STR_BOOK_OF_SERMONS');
 }
 // 25 for Proud Warrior and 6 for Personal Attention. Each monthly result is conditional.
 for(let j=0;j<12&&!has('STR_GLAMOUR',32);j++)if(!attempt(book.action('STR_VOLLEYBALL_MATCH',entry.w.month+1)))break;
 for(const id of ['STR_GLAMOUR','STR_PORN','STR_PEASANT_MILITIA','STR_SARGEANT_TRAINING','STR_CHAPLAIN_TRAINING','STR_OFFICER_TRAINING'])research(id);
 if(!active(entry.w,'STR_GOVT_CORPSE')){
  if(!has('STR_GOVT_CORPSE'))attempt(priestSupply.action('STR_CAPTAIN_YESGREEN_NORED_AMONG_US',entry.w.month+1));
  research('STR_GOVT_CORPSE');
 }
 if(!active(entry.w,'STR_LINGERIE')){
  if(!has('STR_LINGERIE'))attempt(priestSupply.action('STR_KNOCK_KNOCK_ATTACKED_IN_BED',entry.w.month+1));
  research('STR_LINGERIE');
 }
 research('STR_VODKA');research('STR_SOCIALIZING','STR_SWIMSUIT');
 for(const id of ['STR_CONTACT_BUILDERS','STR_EXCAVATION','STR_PRIMITIVE_WEAPONS_2','STR_BASIC_INCENDIARIES','STR_FLINTLOCKS_PRODUCTION','STR_CLOCKWORK_GUN_PRODUCTION'])research(id);
 if(!active(entry.w,'STR_CAPTAINS_LOG_01')){
  attempt({type:'eventResearch',event:'STR_CAP_LOG_1_AWFUL',script:'STR_CAP_LOG_1_AWFUL',research:'STR_CAPTAINS_LOG_01',assumeOutcome:true});resolve();
 }
 research('STR_PERSONAL_ATTENTION');
 const common=entry,initialVector=stats(common.w).permanentStats;
 const orders=[
  ['ordinary-then-pariah',['STR_PROUD_WARRIOR','STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_PARIAH_TRAINING']],
  ['pariah-then-ordinary',['STR_PARIAH_TRAINING','STR_PROUD_WARRIOR','STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION']],
  ['officer-first',['STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_PROUD_WARRIOR','STR_PARIAH_TRAINING']]
 ];
 for(const [name,order] of orders){
  entry=common;phase=name;const begin=traces.length,results=[];
  for(const id of order){
   const before=stats(entry.w).permanentStats;
   const ok=train(id),after=stats(entry.w).permanentStats;
   results.push({id,ok,applied:history().has(id),delta:Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-before[k]]))});
  }
  const finalVector=stats(entry.w).permanentStats;
  lanes.push({lane:name,start:common.n.id,end:entry.n.id,initialVector,finalVector,initialSum:sum(initialVector),finalSum:sum(finalVector),accepted:traces.length-begin,order,results,history:[...history()],stock:Object.fromEntries(['STR_GLAMOUR','STR_PORN','STR_SKULL','STR_BIG_BONE','STR_SHAMBLER_CORPSE'].map(k=>[k,entry.w.items[k]||0])),gameCertified:false,registered:false});
 }
 const goals=['STR_SHAMBLER_CORPSE','STR_BIG_BONE','STR_WARRIOR_CULTURE','STR_PROUD_WARRIOR','STR_BOOK_OF_SERMONS','STR_CHAPLAIN_TRAINING','STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_PARIAH_TRAINING'];
 return {policy:'branch-local-warrior-order-v147',fork,common:common.n.id,commonResearch:{completed:goals.filter(k=>active(common.w,k)),missing:goals.filter(k=>!active(common.w,k))},commonStock:Object.fromEntries(['STR_GLAMOUR','STR_PORN','STR_SKULL','STR_BIG_BONE','STR_SHAMBLER_CORPSE'].map(k=>[k,common.w.items[k]||0])),corpseRecoveries:common.w.conditionalPrimalCorpseRecoveries||[],extractions:common.w.conditionalWarriorExtractions||[],preservedParent:{terminal:prev.end,vector:prev.finalVector},lanes,traces,rejected,accepted:traces.length,gameCertified:false,registered:false};
}
