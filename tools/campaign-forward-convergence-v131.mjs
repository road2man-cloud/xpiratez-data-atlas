// V131: converge independently observed research on one actually replayed world.
// No flag union, resource grant, or bypass of the common transactional gate.
const arr=x=>Array.isArray(x)?x:[];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const key=a=>JSON.stringify(a);
export function convergeResearch({entries,step,data,priorGraph,careerValue,planner,purchaseVerdict,goals,maxTransitions=100,maxRounds=18,beamWidth=5}){
 const reverse=new Map(),awards=new Map(),grants=new Map();
 const add=(map,id,value)=>{if(!map.has(id))map.set(id,[]);map.get(id).push(value);};
 for(const [id,r] of Object.entries(data.researchRules)){
  for(const k of arr(r.unlocks))add(reverse,k,id);
  for(const k of arr(r.getOneFree))add(awards,k,{source:id});
  for(const [gate,ids] of Object.entries(r.getOneFreeProtected||{}))for(const k of arr(ids))add(awards,k,{source:id,gate});
 }
 for(const [id,items] of Object.entries(data.campaignAssets.researchGrants||{}))for(const [item,n] of Object.entries(items))if(n>0)add(grants,item,id);
 const donors=new Map();
 for(const e of priorGraph.edges)if(['manufacture','acquirePurchase','acquireFacility','eventResearch'].includes(e.action.type))donors.set(key(e.action),e.action);
 const coverage=w=>goals.filter(id=>active(w,id));
 function targetsFor(w){
  const direct=new Set(goals.filter(id=>!active(w,id))),unlock=new Set(),sources=new Set(),items=new Set(),secondary=new Set();
  for(const id of direct){
   for(const k of arr(reverse.get(id)))if(!active(w,k))unlock.add(k);
   for(const k of arr(data.researchRules[id]?.dependencies))if(!w.researched.has(k))secondary.add(k);
  }
  for(const id of new Set([...direct,...unlock])){
   for(const a of arr(awards.get(id))){sources.add(a.source);if(a.gate&&!active(w,a.gate))secondary.add(a.gate);}
   const r=data.researchRules[id];if(r?.needItem)items.add(r.neededItem||id);
  }
  for(const id of sources){const r=data.researchRules[id];if(r?.needItem)items.add(r.neededItem||id);}
  const visited=new Set();
  function expandItem(id,depth){
   if(depth>3||visited.has(id))return;visited.add(id);
   if((w.items[id]||0)>0)return;
   for(const k of arr(grants.get(id)))if(!active(w,k))secondary.add(k);
   for(const r of arr(data.itemSupply?.[id]?.manufacture)){
    if(!r.id||r.weight!==undefined)continue;
    if(!arr(r.requires).every(k=>active(w,k))){for(const k of arr(r.requires))if(!active(w,k))secondary.add(k);continue;}
    for(const k of Object.keys(r.requiredItems||{})){items.add(k);expandItem(k,depth+1);}
   }
  }
  for(const id of [...items])expandItem(id,0);
  return {direct,unlock,sources,items,secondary};
 }
 function priority(a,t,w){
  const id=a.id||a.research||a.transform;
  if(a.type==='freeResearch'){
   if(t.direct.has(id))return 10000;
   if(t.unlock.has(id))return 9000;
   if(t.sources.has(id))return 8000;
   if(t.secondary.has(id))return 6000;
   return 10;
  }
  if(a.type==='research'||a.type==='repeatResearch'){
   if(t.direct.has(id))return 10000;
   if(t.unlock.has(id))return 9000;
   if(t.sources.has(id))return 8000;
   if(t.secondary.has(id))return 3000;
  }
  if((a.type==='manufacture'||a.type==='acquirePurchase')&&t.items.has(a.item))return (w.items[a.item]||0)===0?7000:0;
  if(a.type==='eventResearch'&&(t.direct.has(id)||t.secondary.has(id)||t.unlock.has(id)))return 5000;
  return 0;
 }
 function candidates(e){
  const {w,n}=e,t=targetsFor(w);
  if(w.pendingFree){const p=w.pendingFree;return (p.sequential?p.choices.slice(0,1):p.choices).map(research=>({type:'freeResearch',source:p.source,research,assumeOutcome:!p.sequential&&p.choices.length>1})).sort((a,b)=>priority(b,t,w)-priority(a,t,w)||key(a).localeCompare(key(b))).slice(0,4);}
  const acts=n.available.map(id=>w.researched.has(id)?{type:'repeatResearch',id,assumeAvailability:true}:{type:'research',id});
  for(const item of t.items){
   if((w.items[item]||0)>0)continue;
   try{purchaseVerdict(w,item,1,data);acts.push({type:'acquirePurchase',item,count:1});}catch{}
   for(const r of arr(data.itemSupply?.[item]?.manufacture)){
    if(!r.id||r.weight!==undefined||!arr(r.requires).every(k=>active(w,k))||!arr(r.requiresBaseFunc).every(k=>w.baseFunctions.has(k)))continue;
    if(Object.entries(r.requiredItems||{}).every(([k,v])=>(w.items[k]||0)>=v))acts.push({type:'manufacture',item,recipe:r.id,count:1});
   }
  }
  for(const a of donors.values()){
   if(a.type==='acquirePurchase'){try{purchaseVerdict(w,a.item,a.count,data);}catch{continue;}}
   if(a.type==='manufacture')continue; // recipes are re-derived from current inventory above
   acts.push(a);
  }
  const ranked=[...new Map(acts.map(a=>[key(a),a])).values()].map(a=>({a,p:priority(a,t,w)})).filter(x=>x.p>0);
  return ranked.sort((a,b)=>b.p-a.p||key(a.a).localeCompare(key(b.a))).slice(0,5).map(x=>x.a);
 }
 function score(e){
  const {w,n}=e,t=targetsFor(w);
  return 10000*coverage(w).length+1000*n.available.filter(id=>t.direct.has(id)).length+200*n.available.filter(id=>t.unlock.has(id)||t.sources.has(id)).length+100*(w.pendingFree?.choices||[]).filter(id=>t.direct.has(id)||t.unlock.has(id)).length+careerValue(w)-n.depth+100*(['STR_GUNS_N_AMMO','STR_DATA_DISK','STR_DATA_DISK_B'].reduce((s,id)=>s+Math.min(3,w.items[id]||0),0));
 }
 const valid=entries.filter(e=>careerValue(e.w)>0);
 const bestByGroup=new Map();
 for(const e of valid){
  const k=coverage(e.w).join('|')+'|'+(careerValue(e.w)>=1185?'best':'other')+'|'+['STR_GUNS_N_AMMO','STR_DATA_DISK','STR_DATA_DISK_B'].map(id=>Math.min(2,e.w.items[id]||0)).join(',')+'|'+(e.w.pendingFree?.source||'');
  if(!bestByGroup.has(k)||score(e)>score(bestByGroup.get(k)))bestByGroup.set(k,e);
 }
 const initial=[...bestByGroup.values()].sort((a,b)=>score(b)-score(a)).slice(0,beamWidth);
 const baseline=Math.max(0,...valid.map(e=>coverage(e.w).length));
 const expanded=new Set(),seen=new Map(initial.map(e=>[e.n.id,e])),rejected=[],traces=[];
 let beam=initial,attempts=0,accepted=0,rounds=0,stop='round-budget';
 for(;rounds<maxRounds&&beam.length;rounds++){
  const next=[];
  for(const e of beam){
   if(coverage(e.w).length===goals.length&&!e.w.pendingFree){stop='all-goals';break;}
   if(expanded.has(e.n.id))continue;expanded.add(e.n.id);
   for(const action of candidates(e)){
    if(attempts>=maxTransitions){stop='action-budget';break;}
    attempts++;const r=step(e.w,e.n,action);
    if(!r.ok){rejected.push({from:e.n.id,action,reason:r.reason});continue;}
    accepted++;
    if(!seen.has(r.n.id)){const entry={w:r.w,n:r.n};seen.set(r.n.id,entry);next.push(entry);traces.push({from:e.n.id,to:r.n.id,action,coverage:coverage(r.w)});}
   }
  }
  if(stop==='all-goals'||stop==='action-budget')break;
  beam=next.sort((a,b)=>score(b)-score(a)||a.n.id.localeCompare(b.n.id)).slice(0,beamWidth);
  if(!beam.length)stop='no-progress';
 }
 const best=[...seen.values()].sort((a,b)=>coverage(b.w).length-coverage(a.w).length||careerValue(b.w)-careerValue(a.w)||score(b)-score(a))[0];
 return {goals,baseline,maximum:best?coverage(best.w).length:0,bestState:best?.n.id||null,completed:best?coverage(best.w):[],bestCareerValue:best?careerValue(best.w):0,starts:initial.map(e=>e.n.id),rounds,attempts,accepted,stop,traces,rejected,gameCertified:false,registered:false};
}
