// V121: bounded source-gated resource actions. No external item grants.
import {purchaseRequirements,purchaseVerdict} from '../public/soldiers/modern/campaign-start-reachability-v1.js';
import {facilityMaterials} from '../public/soldiers/modern/campaign-start-construction-v1.js';
import {START_EVENT_RULES} from '../public/soldiers/modern/campaign-start-event-rules-v1.js';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
const arr=x=>Array.isArray(x)?x:[];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const has=(w,items)=>Object.entries(items||{}).every(([id,n])=>Number.isSafeInteger(n)&&n>=0&&(w.items[id]||0)>=n);
const funcs=(w,a)=>arr(a).every(k=>w.baseFunctions.has(k));
export function createResourceActions(data,rawEvents){
 const lab=Object.entries(data.researchRules).filter(([id,r])=>id!=='STR_UNAVAILABLE'&&r.cost>0&&!arr(r.requires).length);
 const facility=Object.entries(data.campaignAssets.facilities);
 const events=[];
 const pureKeys=new Set(['name','type','description','background','music','researchList','timer','timerRandom']);
 for(const [research,sources] of Object.entries(data.eventResearchSources||{}))for(const s of arr(sources)){
  const raw=rawEvents[s.event],fixed=START_EVENT_RULES[s.event];
  if(!raw||!(fixed?.research===research||Object.keys(raw).every(k=>pureKeys.has(k))&&arr(raw.researchList).includes(research)))continue;
  for(const script of arr(s.scripts))events.push({event:s.event,research,script});
 }
 return w=>{
  if(!w.researched.size||w.pendingFree)return [];
  const unlocked=new Set([...w.researched].flatMap(k=>arr(data.researchRules[k]?.unlocks)));
  const items=new Set(),functions=new Set(),actions=[];
  for(const [id,r] of lab){
   if(w.researched.has(id)||w.disabled.has(id)||(!unlocked.has(id)&&!arr(r.dependencies).every(k=>w.researched.has(k))))continue;
   if(r.needItem&&!(w.items[r.neededItem||id]>0))items.add(r.neededItem||id);
   for(const f of arr(r.requiresBaseFunc))if(!w.baseFunctions.has(f))functions.add(f);
  }
  // Only direct research bottlenecks and their currently buildable providers;
  // recursive acquisition chains remain unresolved, not silently supplied.
  for(const [id,r] of facility){
   if(w.facilities.has(id)||!arr(r.provideBaseFunc).some(f=>functions.has(f))||arr(r.buildOverFacilities).length||
    !arr(r.requires).every(k=>active(w,k))||!funcs(w,r.requiresBaseFunc)||arr(r.forbiddenBaseFunc).some(k=>w.baseFunctions.has(k)))continue;
   try{const mats=facilityMaterials(r);if(has(w,mats))actions.push({type:'acquireFacility',id});else for(const [k,n] of Object.entries(mats))if((w.items[k]||0)<n)items.add(k);}catch{}
  }
  for(const item of [...items].sort()){
   if(purchaseRequirements(data,item))try{purchaseVerdict(w,item,1,data);actions.push({type:'acquirePurchase',item,count:1});}catch{}
   for(const recipe of arr(data.itemSupply?.[item]?.manufacture)){
    if(recipe.weight!==undefined||!arr(recipe.requires).every(k=>active(w,k))||!funcs(w,recipe.requiresBaseFunc)||!has(w,recipe.requiredItems))continue;
    actions.push({type:'manufacture',item,recipe:recipe.id,count:1});
   }
  }
  for(const e of events){
   if(w.researched.has(e.research)||w.disabled.has(e.research)||w.generatedEvents?.[e.event])continue;
   const s={...e.script,eventId:e.event};
   // No arbitrary month/score advancement. Use only currently eligible scripts.
   const verdict=eventScriptVerdict(s,w,{mode:'current'});
   if(verdict.blocked.length||verdict.unknown.length)continue;
   actions.push({type:'eventResearch',event:e.event,script:s.script,research:e.research,assumeOutcome:true});
  }
  return actions;
 };
}
