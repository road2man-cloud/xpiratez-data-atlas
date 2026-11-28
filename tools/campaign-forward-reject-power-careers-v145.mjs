// V145: recover the missing one-time bundles and break the pre-coronation blessing dependency.
import assert from 'node:assert/strict';
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const sum=v=>Object.values(v||{}).reduce((a,b)=>a+b,0);
export function continueRejectPower({entries,step,priorGraph,gate,occult,bounty,expedition,sourceFunctions,stats,data,parentActions}){
 assert.equal(priorGraph.convergence.policy,'branch-local-occult-prerequisites-v144');
 const byId=new Map(entries.map(e=>[e.n.id,e])),traces=[],rejected=[],lanes=[];
 const stockIds=['STR_GNOME','STR_HUMAN_NOBLEWOMAN','STR_SCHOOL_BOOKS_ITEM','STR_MUTANT_BLESSINGS','STR_SIVALINGA','STR_SKULL','STR_JUNK_PILE','STR_SC_WIRE','STR_GLAMOUR','STR_PORN'];
 function lane(name,goals,run){
  const p=priorGraph.convergence.lanes.find(x=>x.lane===name);assert(p);
  let entry=byId.get(p.end);assert(entry,'missing parent terminal');
  const start=entry.n.id,initialVector=stats(entry.w).permanentStats;assert.deepEqual(initialVector,p.finalVector);
  const begin=traces.length;
  function attempt(action){
   const {w,n}=entry,r=step(w,n,action);
   if(!r.ok){rejected.push({lane:name,from:n.id,action,reason:r.reason});return false;}
   if(r.n.id===n.id)return true;
   traces.push({lane:name,from:n.id,to:r.n.id,action,added:r.n.researched.filter(k=>!n.researched.includes(k))});
   entry={w:r.w,n:r.n};return true;
  }
  function resolve(preferred){
   for(let i=0;i<12&&entry.w.pendingFree;i++){
    const t=entry.w.pendingFree,choices=t.sequential?t.choices.slice(0,1):t.choices,id=choices.includes(preferred)?preferred:choices[0];
    if(!id||!attempt({type:'freeResearch',source:t.source,research:id,assumeOutcome:!t.sequential&&t.choices.length>1}))return false;
   }
   return !entry.w.pendingFree;
  }
  function research(id,preferred){if(active(entry.w,id))return true;return resolve(preferred)&&attempt({type:'research',id})&&resolve(preferred);}
  function awardFrom(id,preferred){
   if(active(entry.w,preferred))return true;
   return resolve(preferred)&&attempt(entry.w.researched.has(id)?{type:'repeatResearch',id,assumeAvailability:true}:{type:'research',id})&&resolve(preferred)&&active(entry.w,preferred);
  }
  const has=(id,n=1)=>(entry.w.items[id]||0)>=n;
  const event=(event,id,script=event)=>active(entry.w,id)||resolve()&&attempt({type:'eventResearch',event,script,research:id,assumeOutcome:true})&&resolve();
  function clock(month){while(entry.w.month<month){if(!attempt({type:'advanceMonth',month:entry.w.month+1,assumeContinuity:true}))return false;}return true;}
  function replay(a,next){
   if(a.type==='freeResearch')return resolve(a.research);
   if(!resolve())return false;
   if(a.type==='advanceMonth')return clock(a.month);
   if(a.type==='research'&&active(entry.w,a.id))return true;
   if(a.type==='eventResearch'&&active(entry.w,a.research))return true;
   if(a.type==='acquireFacility'&&entry.w.facilities.has(a.id))return true;
   if(a.type==='transform'&&entry.w.soldiers.find(s=>s.id==='origin')?.state.history.has(a.transform))return true;
   if(!attempt(a))return false;
   return resolve(next?.type==='freeResearch'?next.research:undefined);
  }
  const api={get w(){return entry.w;},get n(){return entry.n;},attempt,resolve,research,awardFrom,has,event,clock,replay};
  run(api);
  const finalVector=stats(entry.w).permanentStats,hero=entry.w.soldiers.find(s=>s.id==='origin');
  lanes.push({lane:name,start,end:entry.n.id,initialVector,finalVector,initialSum:sum(initialVector),finalSum:sum(finalVector),accepted:traces.length-begin,completed:goals.filter(k=>active(entry.w,k)),missing:goals.filter(k=>!active(entry.w,k)),stock:Object.fromEntries(stockIds.map(k=>[k,entry.w.items[k]||0])),fixedEvents:entry.w.conditionalOneTimeFixedItems||[],preCrownBlessings:entry.w.conditionalPreCrownBlessings||[],junkExtractions:entry.w.conditionalJunkExtractions||[],history:[...hero.state.history],gameCertified:false,registered:false});
 }
 lane('gold-occult',['STR_SIVALINGA','STR_PSI_LAB','STR_SIVALINGA_RESURRECTION'],l=>{
  if(!l.has('STR_SIVALINGA')&&!active(l.w,'STR_SIVALINGA'))l.attempt(gate.eventAction('STR_SAKURA_SIVALINGA_EVENT',l.w.month+1));
  l.research('STR_SIVALINGA');
  // Existing research samples and free awards, not borrowed research flags.
  l.awardFrom('STR_SOCIALIZING','STR_HUMAN_MASTER');
  l.awardFrom('STR_GNOME','STR_GNOME_TOME_9');
  l.research('STR_MONSTER_HUNT');
  if(active(l.w,'STR_PSI_LAB'))l.event('STR_SIVALINGA_RESURRECTION_EVENT','STR_SIVALINGA_RESURRECTION');
 });
 const goals=['STR_REJECT_THE_POWER','STR_HERO','STR_NEPOTISM','STR_SCHOOL_OF_HARD_KNOCKS','STR_BASIC_FIREARMS_TRAINING','STR_BREAD_AND_FISHES_TRAINING','STR_PSI_LAB','STR_SHADOWS','STR_CLOAKING_DEVICE','STR_SHADOWTECH','STR_GODS_E2','STR_LIBRARY','STR_CHRONICLES_001','STR_MONSTER_HUNT','STR_MUTANT_BLESSINGS','STR_OFFERING_TO_PURPLE_BLOOM','STR_SIVALINGA','STR_SIVALINGA_RESURRECTION','STR_WASTELAND_PRIESTESS_2','STR_WASTELAND_PRIESTESS_3','STR_WASTELAND_PRIESTESS_4','STR_DARK_STAR','STR_SKULL','STR_QUEEN_SAVAGE','STR_PARIAH_TRAINING'];
 lane('reject-power-priestess',goals,l=>{
  if(!l.w.generatedEvents.STR_SCHOOLBUS_EVENT)l.attempt(gate.eventAction('STR_SCHOOLBUS_EVENT',l.w.month+1));
  if(l.has('STR_HUMAN_NOBLEWOMAN'))l.awardFrom('STR_HUMAN_NOBLEWOMAN','STR_PSI_LAB');
  if(l.has('STR_GNOME'))l.awardFrom('STR_GNOME','STR_SHADOWS');
  // Reuse only individual candidate actions from the actual gold path.
  // The reject branch's own stock, flags, gates and clock determine success.
  const start=parentActions.findIndex(a=>a.type==='research'&&a.id==='STR_NEPOTISM');
  const stop=parentActions.findIndex(a=>a.type==='acquireFacility'&&a.id==='STR_MESS_HALL');
  assert(start>=0&&stop>start);
  for(let i=start;i<=stop;i++){
   const a=parentActions[i];
   if(a.id==='STR_CODEX_GOLD'||a.source==='STR_CODEX_GOLD'||a.event==='STR_SACRIFICES')continue;
   l.replay(a,parentActions[i+1]);
  }
  l.research('STR_BREAD_AND_FISHES_TRAINING');
  if(!active(l.w,'STR_OLD_BOOKS')&&l.has('STR_OLD_BOOKS'))l.research('STR_OLD_BOOKS','STR_HISTORY_001');
  l.research('STR_CLOAKING_DEVICE');
  l.awardFrom('STR_GNOME','STR_SHADOWTECH');
  if(!active(l.w,'STR_GODS_E2')){l.attempt(occult.action('STR_GREEN_PRAYERS',l.w.month+1));l.resolve();}
  for(const id of ['STR_CONTACT_TIGER_TRANSPORT','STR_EXPEDITIONS','STR_BIKES','STR_MONSTER_HUNT','STR_MUTANT_BLESSINGS','STR_MESS_HALL'])l.research(id);
  if(!l.w.facilities.has('STR_MESS_HALL'))l.attempt({type:'acquireFacility',id:'STR_MESS_HALL'});
  // Produce 69 blessings WITHOUT STR_CROWNING_UC. The source event pays nine per accepted month.
  if(!active(l.w,'STR_OFFERING_TO_PURPLE_BLOOM')){
   for(let i=0;i<9&&!l.has('STR_MUTANT_BLESSINGS',69);i++)if(!l.attempt(gate.blessingAction(l.w.month+1)))break;
   if(l.has('STR_MUTANT_BLESSINGS',69)&&active(l.w,'STR_MUTANT_BLESSINGS')&&l.w.baseFunctions.has('CULT'))l.attempt(bounty.exchangeAction('STR_OFFERING_TO_PURPLE_BLOOM'));
   l.research('STR_OFFERING_TO_PURPLE_BLOOM');
  }
  if(active(l.w,'STR_OFFERING_TO_PURPLE_BLOOM')&&!l.has('STR_SIVALINGA')&&!active(l.w,'STR_SIVALINGA'))l.attempt(gate.eventAction('STR_SAKURA_SIVALINGA_EVENT',l.w.month+1));
  // Produce martial arts reward through the existing exchange, no direct grant.
  if(!active(l.w,'STR_BOUNTY_HUNTING_PRIZE_MARTIAL_ARTS')){
   l.attempt(bounty.exchangeAction('STR_BOUNTY_HUNTING_PRIZE_MARTIAL_ARTS'));
   l.research('STR_BOUNTY_HUNTING_PRIZE_MARTIAL_ARTS');
  }
  for(const id of ['STR_SOLDIER_TYPE_BASIC','STR_GYM_ADVANCE','STR_SC_WIRE'])l.research(id);
  // Extract junk with exact fixed by-products and a selected source bundle.
  if(active(l.w,'STR_SCHOOLING_1')){
   for(let i=0;i<9&&!l.has('STR_SKULL',9)&&l.has('STR_JUNK_PILE');i++)if(!l.attempt(gate.junkAction('STR_SKULL')))break;
   if(!active(l.w,'STR_SIVALINGA')&&!l.has('STR_SIVALINGA')&&l.has('STR_JUNK_PILE'))l.attempt(gate.junkAction('STR_SIVALINGA'));
  }
  l.research('STR_SKULL');
  if(!active(l.w,'STR_SC_WIRE')&&!l.has('STR_SC_WIRE'))l.attempt({type:'acquirePurchase',item:'STR_SC_WIRE',count:1});
  l.research('STR_SC_WIRE');
  l.attempt(sourceFunctions.proof);
  if(!l.w.facilities.has('STR_PERSONAL_LABS')){
   const deficit=25-(l.w.items.STR_SC_WIRE||0);
   if(deficit>0)l.attempt({type:'acquirePurchase',item:'STR_SC_WIRE',count:deficit});
   if(l.research('STR_PERSONAL_LABS'))l.attempt({type:'acquireFacility',id:'STR_PERSONAL_LABS'});
  }
  if(!active(l.w,'STR_SCHOOL_BOOKS'))l.research('STR_SCHOOL_BOOKS_ITEM');
  if(l.research('STR_LIBRARY')&&!l.w.facilities.has('STR_LIBRARY'))l.attempt({type:'acquireFacility',id:'STR_LIBRARY'});
  l.research('STR_SCHOOLING_2');l.research('STR_CHRONICLES_001');l.research('STR_SIVALINGA');
  l.event('STR_SIVALINGA_RESURRECTION_EVENT','STR_SIVALINGA_RESURRECTION');
  l.event('STR_WASTELAND_PRIESTESS_2','STR_WASTELAND_PRIESTESS_2',active(l.w,'STR_CAPTAIN_DOUBLEGREEN')?'STR_BLESSINGS_2B':'STR_BLESSINGS_2');
  l.research('STR_WASTELAND_PRIESTESS_3','STR_WASTELAND_PRIESTESS_4');l.research('STR_DARK_STAR');
  // Food-dependent training is allowed only when the current branch has the ingredients.
  if(!l.w.soldiers.find(s=>s.id==='origin').state.history.has('STR_BREAD_AND_FISHES_TRAINING')){
   const deficit=5-(l.w.items.STR_MUTANT_FISH||0);if(deficit>0)l.attempt({type:'acquirePurchase',item:'STR_MUTANT_FISH',count:deficit});
   for(const a of parentActions.filter(a=>a.type==='manufacture'&&['STR_LEEK','STR_CABBAGE'].includes(a.item)))l.replay(a);
   l.attempt({type:'transform',soldier:'origin',transform:'STR_BREAD_AND_FISHES_TRAINING'});
  }
 });
 return {policy:'branch-local-pre-crown-v145',lanes,traces,rejected,accepted:traces.length,gameCertified:false,registered:false};
}
