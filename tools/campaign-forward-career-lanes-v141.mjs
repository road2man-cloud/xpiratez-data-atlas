// V141: branch-local continuation from proven career terminals. No state unions.
import assert from 'node:assert/strict';
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const sum=v=>Object.values(v||{}).reduce((a,b)=>a+b,0);
const key=a=>JSON.stringify(a);
export function continueCareers({entries,step,data,priorGraph,routes,planner,book,careerCandidates,stats,maxSteps=50}){
 const traces=[],rejected=[],lanes=[];
 const byId=new Map(entries.map(e=>[e.n.id,e]));
 const allGoals=['STR_SMITHING','STR_SS_OPERATIONS','STR_PEASANT_MILITIA','STR_SARGEANT_TRAINING','STR_REVOLUTIONARY_TRAINING','STR_CONTACT_SCAVENGERS','STR_PEASANT_PARTY','STR_OFFICER_TRAINING_PREQ','STR_GLAMOUR','STR_PORN','STR_BOOK_OF_SERMONS','STR_CHAPLAIN_TRAINING','STR_SCHOOL_BOOKS','STR_LIBRARY','STR_SCHOOLING_2','STR_OFFICER_TRAINING','STR_PERSONAL_ATTENTION','STR_HERO_GOLD_TRAINING'];
 const donor=routes.find(x=>x.lane==='officer').witness.actions.filter(a=>['research','repeatResearch','freeResearch','acquireFacility','acquirePurchase','manufacture'].includes(a.type));
 for(const row of routes){
  let entry=byId.get(row.witness.finalState);assert(entry,'missing parent terminal '+row.lane);
  const {w:initial,n:start}=entry;
  const initialVector=stats(initial).permanentStats;
  const used=new Set();let attempts=0,accepted=0;
  const attempt=a=>{
   const k=entry.n.id+'|'+key(a);if(used.has(k)||attempts>=maxSteps)return false;used.add(k);attempts++;
   const r=step(entry.w,entry.n,a);
   if(!r.ok){rejected.push({lane:row.lane,from:entry.n.id,action:a,reason:r.reason});return false;}
   if(r.n.id===entry.n.id)return false;
   traces.push({lane:row.lane,from:entry.n.id,to:r.n.id,action:a,added:r.n.researched.filter(id=>!entry.n.researched.includes(id))});
   entry={w:r.w,n:r.n};accepted++;return true;
  };
  // Only use candidate actions on this live replayed world. Do not import any donor inventory or research.
  const goalList=row.lane==='priest'?allGoals:allGoals.slice(16);
  for(let round=0;round<maxSteps&&attempts<maxSteps;round++){
   const {w,n}=entry;
   if(w.pendingFree){
    const p=w.pendingFree,choices=p.sequential?p.choices.slice(0,1):p.choices;
    const ordered=choices.slice().sort((a,b)=>Number(goalList.includes(b))-Number(goalList.includes(a))||a.localeCompare(b));
    if(!ordered.some(research=>attempt({type:'freeResearch',source:p.source,research,assumeOutcome:!p.sequential&&p.choices.length>1})))break;
    continue;
   }
   const possible=careerCandidates(w).filter(a=>['STR_OFFICER_TRAINING','STR_BREAD_AND_FISHES_TRAINING','STR_PERSONAL_ATTENTION','STR_HERO_GOLD_TRAINING'].includes(a.transform));
   if(possible.some(attempt))continue;
   const goal=goalList.find(id=>!active(w,id)&&n.available.includes(id));
   if(goal&&attempt({type:'research',id:goal}))continue;
   if((!active(w,'STR_GLAMOUR')||!active(w,'STR_PERSONAL_ATTENTION'))&&(w.items.STR_GLAMOUR||0)<6&&active(w,'STR_GYMNASTICS')&&w.facilities.has('STR_HANGAR')){
    if(attempt(book.action('STR_VOLLEYBALL_MATCH',w.month+1)))continue;
   }
   if(!w.baseFunctions.has('CULT')&&active(w,'STR_MESS_HALL')&&attempt({type:'acquireFacility',id:'STR_MESS_HALL'}))continue;
   // Existing donor actions are merely candidate suggestions; current world and raw gates decide.
   if(row.lane==='priest'){
    const relevant=new Set(['STR_SMITHING','STR_SS_OPERATIONS','STR_PEASANT_MILITIA','STR_SARGEANT_TRAINING','STR_REVOLUTIONARY_TRAINING','STR_CONTACT_SCAVENGERS','STR_PEASANT_PARTY','STR_OFFICER_TRAINING_PREQ','STR_GLAMOUR','STR_PORN','STR_MASH','STR_CONTACT_BUILDERS','STR_LIBRARY','STR_SC_WIRE','STR_PERSONAL_LABS','STR_SCHOOLING_2']);
    if(donor.filter(a=>a.type==='research'&&relevant.has(a.id)&&n.available.includes(a.id)&&!active(w,a.id)).some(attempt))continue;
   }
   // Try the nearest outstanding prerequisite of each goal, without making assumptions about missing items.
   let progress=false;
   for(const id of goalList.filter(id=>!active(w,id))){
    const plan=planner.analyze(w,n,id);
    const research=n.available.filter(k=>plan.research.has(k)&&!active(w,k)).map(id=>({type:'research',id}));
    const supply=planner.supply(w,plan);
    if([...research,...supply].some(attempt)){progress=true;break;}
    if(attempts>=maxSteps)break;
   }
   if(!progress)break;
  }
  const finalVector=stats(entry.w).permanentStats;
  lanes.push({lane:row.lane,start:start.id,end:entry.n.id,attempts,accepted,initialVector,finalVector,initialSum:sum(initialVector),finalSum:sum(finalVector),goals:goalList,completed:goalList.filter(id=>active(entry.w,id)),missing:goalList.filter(id=>!active(entry.w,id)),stock:Object.fromEntries(['STR_GLAMOUR','STR_BOOK_OF_SERMONS','STR_SCHOOL_BOOKS_ITEM','STR_CRACK'].map(id=>[id,entry.w.items[id]||0])),gameCertified:false,registered:false});
 }
 return {policy:'branch-local-source-gated-v141',lanes,traces,rejected,accepted:traces.length,gameCertified:false,registered:false};
}
