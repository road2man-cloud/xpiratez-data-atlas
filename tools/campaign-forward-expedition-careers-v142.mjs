// V142: preserve V141 terminals, then acquire alternative books on the priest branch.
import assert from 'node:assert/strict';
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const sum=v=>Object.values(v||{}).reduce((a,b)=>a+b,0);
export function continueExpeditionCareers({entries,step,routes,priorGraph,expedition,sourceFunctions,stats}){
 const prior=priorGraph.convergence;assert(prior.policy==='branch-local-source-gated-v141');
 const byId=new Map(entries.map(e=>[e.n.id,e])),traces=[],rejected=[],lanes=[];
 for(const row of routes){
  const p=prior.lanes.find(x=>x.lane===row.lane);assert(p&&p.start===row.witness.finalState);
  let entry=byId.get(p.end);assert(entry);const start=entry.n.id,initialVector=stats(entry.w).permanentStats;assert.deepEqual(initialVector,p.finalVector);
  const attempt=a=>{
   const {w,n}=entry,r=step(w,n,a);
   if(!r.ok){rejected.push({lane:row.lane,from:n.id,action:a,reason:r.reason});return false;}
   if(r.n.id===n.id)return true;
   traces.push({lane:row.lane,from:n.id,to:r.n.id,action:a,added:r.n.researched.filter(id=>!n.researched.includes(id))});
   entry={w:r.w,n:r.n};return true;
  };
  function resolve(preferred){
   for(let i=0;i<8&&entry.w.pendingFree;i++){
    const p=entry.w.pendingFree,choices=p.sequential?p.choices.slice(0,1):p.choices;
    const id=choices.includes(preferred)?preferred:choices[0];
    if(!id||!attempt({type:'freeResearch',source:p.source,research:id,assumeOutcome:!p.sequential&&p.choices.length>1}))return false;
   }
   return !entry.w.pendingFree;
  }
  function research(id,preferred){if(active(entry.w,id))return true;return resolve(preferred)&&attempt({type:'research',id})&&resolve(preferred);}
  const has=id=>(entry.w.items[id]||0)>0;
  const getBox=()=>has(expedition.box)||(has(expedition.survey)||attempt({type:'acquirePurchase',item:expedition.survey,count:1}))&&attempt(expedition.action(expedition.debrief,0));
  const getItem=id=>has(id)||getBox()&&attempt(expedition.bundleFor(expedition.open,id))&&has(id);
  if(row.lane==='priest'){
   if(getItem('STR_BOOK_OF_SERMONS'))research('STR_BOOK_OF_SERMONS');
   research('STR_CHAPLAIN_TRAINING');
   // The same captain is eligible for a separate Gnome event. No personality switch.
   if(!active(entry.w,'STR_SCHOOL_BOOKS')){
    const wire='STR_SC_WIRE',lab='STR_PERSONAL_LABS';
    if(!entry.w.facilities.has(lab)){
     const count=(active(entry.w,wire)?25:26)-(entry.w.items[wire]||0);
     if(count>0)attempt({type:'acquirePurchase',item:wire,count});
     if(research(wire)&&attempt(sourceFunctions.proof)&&research(lab))attempt({type:'acquireFacility',id:lab});
    }
    if(entry.w.baseFunctions.has('STUDY')){
     if(!has('STR_GNOME'))attempt(expedition.gnomeAction(entry.w.month+1));
     if(has('STR_GNOME'))research('STR_GNOME','STR_SCHOOL_BOOKS_ITEM');
     // If the protected research award completes only the item topic, use the
     // common lookup machinery, not manual flag insertion.
     if(has('STR_SCHOOL_BOOKS_ITEM')&&!active(entry.w,'STR_SCHOOL_BOOKS_ITEM'))research('STR_SCHOOL_BOOKS_ITEM');
    }
   }
   if(research('STR_LIBRARY')){
    if(!entry.w.facilities.has('STR_LIBRARY'))attempt({type:'acquireFacility',id:'STR_LIBRARY'});
    research('STR_SCHOOLING_2');
   }
   if(research('STR_OFFICER_TRAINING')){
    const m=entry.w.soldiers.find(s=>s.id==='origin');
    if(!m.state.history.has('STR_OFFICER_TRAINING'))attempt({type:'transform',soldier:'origin',transform:'STR_OFFICER_TRAINING'});
   }
  }
  const finalVector=stats(entry.w).permanentStats;
  const goals=['STR_BOOK_OF_SERMONS','STR_CHAPLAIN_TRAINING','STR_GNOME','STR_SCHOOL_BOOKS','STR_LIBRARY','STR_SCHOOLING_2','STR_OFFICER_TRAINING'];
  lanes.push({lane:row.lane,start,end:entry.n.id,initialVector,finalVector,initialSum:sum(initialVector),finalSum:sum(finalVector),accepted:traces.filter(x=>x.lane===row.lane).length,completed:goals.filter(id=>active(entry.w,id)),missing:goals.filter(id=>!active(entry.w,id)),stock:Object.fromEntries(['STR_GLAMOUR','STR_BOOK_OF_SERMONS','STR_SCHOOL_BOOKS_ITEM','STR_GNOME','STR_EXPEDITION_REPORTS'].map(id=>[id,entry.w.items[id]||0])),manufacture:entry.w.conditionalExpeditionManufactures||[],gnomeEvents:entry.w.conditionalGnomeEvents||[],gameCertified:false,registered:false});
 }
 return {policy:'branch-local-alternative-book-v142',lanes,traces,rejected,accepted:traces.length,gameCertified:false,registered:false};
}
