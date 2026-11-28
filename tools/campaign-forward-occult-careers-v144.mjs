// V144: advance the occult prerequisites and preserve a separate rejection lane.
// All changes go through the same replayable graph step; no union of branch flags.
import assert from 'node:assert/strict';
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const sum=v=>Object.values(v||{}).reduce((a,b)=>a+b,0);
export function continueOccultCareers({entries,step,priorGraph,occult,stats,data,parentActions}){
 assert.equal(priorGraph.convergence.policy,'branch-local-personal-attention-v143');
 const previous=priorGraph.convergence.lanes[0],byId=new Map(entries.map(e=>[e.n.id,e]));
 const traces=[],rejected=[],lanes=[];
 function lane(name,startId,run,goals){
  let entry=byId.get(startId);assert(entry,'missing prior terminal '+name);
  const start=entry.n.id,initialVector=entry.w.soldiers.some(s=>s.id==='origin')?stats(entry.w).permanentStats:null,begin=traces.length;
  const attempt=action=>{
   const {w,n}=entry,r=step(w,n,action);
   if(!r.ok){rejected.push({lane:name,from:n.id,action,reason:r.reason});return false;}
   if(r.n.id===n.id)return true;
   traces.push({lane:name,from:n.id,to:r.n.id,action,added:r.n.researched.filter(k=>!n.researched.includes(k))});entry={w:r.w,n:r.n};return true;
  };
  function resolve(preferred){
   for(let i=0;i<8&&entry.w.pendingFree;i++){
    const p=entry.w.pendingFree,choices=p.sequential?p.choices.slice(0,1):p.choices,id=choices.includes(preferred)?preferred:choices[0];
    if(!id||!attempt({type:'freeResearch',source:p.source,research:id,assumeOutcome:!p.sequential&&p.choices.length>1}))return false;
   }
   return !entry.w.pendingFree;
  }
  function research(id,preferred){if(active(entry.w,id))return true;return resolve(preferred)&&attempt({type:'research',id})&&resolve(preferred);}
  function awardFrom(source,id){
   if(active(entry.w,id))return true;
   if(!resolve(id))return false;
   const a=entry.w.researched.has(source)?{type:'repeatResearch',id:source,assumeAvailability:true}:{type:'research',id:source};
   return attempt(a)&&resolve(id)&&active(entry.w,id);
  }
  const award=(event,id)=>active(entry.w,id)||attempt(occult.action(event,entry.w.month+1))&&resolve(id);
  run({get w(){return entry.w;},get n(){return entry.n;},attempt,research,awardFrom,award,resolve});
  const hero=entry.w.soldiers.find(s=>s.id==='origin'),finalVector=hero?stats(entry.w).permanentStats:null;
  lanes.push({lane:name,start,end:entry.n.id,initialVector,finalVector,initialSum:initialVector?sum(initialVector):null,finalSum:finalVector?sum(finalVector):null,accepted:traces.length-begin,completed:goals.filter(id=>active(entry.w,id)),missing:goals.filter(id=>!active(entry.w,id)),stock:Object.fromEntries(['STR_SIVALINGA','STR_MUTANT_BLESSINGS','STR_GNOME','STR_GLAMOUR','STR_ESOTERICA'].map(id=>[id,entry.w.items[id]||0])),occultAwards:entry.w.conditionalOccultAwards||[],history:hero?[...hero.state.history]:[],gameCertified:false,registered:false});
 }
 const common=['STR_WASTELAND_PRIESTESS','STR_WASTELAND_SORCERESS','STR_GODS_E2','STR_SHADOWS','STR_CLOAKING_DEVICE','STR_SHADOWTECH','STR_SHADOW_CHASING','STR_BIKES','STR_CHRONICLES_001','STR_SIVALINGA','STR_COMMUNICATIONS','STR_MOST_COMMON_POWER','STR_WENCH_OUTFIT','STR_PERSUASION','STR_GLAMOUR_RECRUITMENT'];
 lane('gold-occult',previous.end,l=>{
  l.award('STR_BLESSINGS','STR_WASTELAND_PRIESTESS');
  l.award('STR_WASTELAND_SORCERESS','STR_WASTELAND_SORCERESS');
  l.award('STR_GREEN_PRAYERS','STR_GODS_E2');
  l.awardFrom('STR_GNOME','STR_SHADOWS');
  l.research('STR_CLOAKING_DEVICE');
  l.awardFrom('STR_GNOME','STR_SHADOWTECH');
  l.research('STR_SHADOW_CHASING');
  for(const id of ['STR_BIKES','STR_CHRONICLES_001','STR_SMALL_RADAR_SYSTEM','STR_COMMUNICATIONS','STR_HUMANS','STR_RIBBON','STR_OLD_EARTH_VOODOO','STR_CADILLAC','STR_MEDALLION','STR_SALVAGE'])l.research(id);
  l.awardFrom('STR_SOCIALIZING','CIVILIAN_YOUNG_UBER');
  for(const id of ['STR_MOST_COMMON_POWER','STR_WENCH_OUTFIT','STR_PERSUASION','STR_GLAMOUR_RECRUITMENT'])l.research(id);
  if(!active(l.w,'STR_SIVALINGA')){
   if(!(l.w.items.STR_SIVALINGA||0))l.attempt({type:'acquireEventItems',item:'STR_SIVALINGA',event:'STR_SAKURA_SIVALINGA_EVENT',script:'STR_SAKURA_SIVALINGA_EVENT',count:1,assumeOutcome:true});
   l.research('STR_SIVALINGA');
  }
 },common);
 // Reconstruct the exact prior ancestry immediately before the mutually exclusive choice.
 const edges=new Map(priorGraph.edges.map(e=>[e.from+'|'+JSON.stringify(e.action),e.to]));
 let fork=priorGraph.initial,found=false;
 for(const action of parentActions){
  if(action.type==='research'&&action.id==='STR_EMBRACE_THE_POWER'){found=true;break;}
  fork=edges.get(fork+'|'+JSON.stringify(action));assert(fork,'broken parent route');
 }
 assert(found,'no power fork in parent witness');
 lane('reject-power-priestess',fork,l=>{
  l.research('STR_REJECT_THE_POWER');
  l.award('STR_BLESSINGS','STR_WASTELAND_PRIESTESS');
  // Preserve the school-bus acquisition as a real one-time branch event, not a grant.
  l.attempt({type:'acquireEventItems',item:'STR_GNOME',event:'STR_SCHOOLBUS_EVENT',script:'STR_SCHOOLBUS_EVENT',count:7,assumeOutcome:true});
  // Existing independent hero entry remains available if personality and recruitment gates permit it.
  for(const action of parentActions.slice(parentActions.findIndex(a=>a.type==='research'&&a.id==='STR_RECRUIT_PEASANTS'),parentActions.findIndex(a=>a.type==='conditionalCapGrowth')+1)){
   if(action.type==='freeResearch'&&!l.w.pendingFree)continue;
   if(action.type==='research'&&active(l.w,action.id))continue;
   if(!l.attempt(action))break;
  }
  l.resolve();
 },['STR_REJECT_THE_POWER','STR_WASTELAND_PRIESTESS','STR_RECRUIT_PEASANTS','STR_CAPTAIN_PRIEST','STR_HERO']);
 return {policy:'branch-local-occult-prerequisites-v144',lanes,traces,rejected,accepted:traces.length,gameCertified:false,registered:false};
}
