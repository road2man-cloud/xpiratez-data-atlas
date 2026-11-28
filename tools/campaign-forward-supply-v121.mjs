// V121 bounded source-gated action enumeration. Every candidate is replayed by the common gate.
import {purchaseVerdict} from '../public/soldiers/modern/campaign-start-reachability-v1.js';
import {facilityMaterials} from '../public/soldiers/modern/campaign-start-construction-v1.js';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
import {START_EVENT_RULES} from '../public/soldiers/modern/campaign-start-event-rules-v1.js';
const arr=x=>Array.isArray(x)?x:[];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
export function createSupplyActions(data){
 const rules=Object.entries(data.researchRules).filter(([id,r])=>id!=='STR_UNAVAILABLE'&&r.cost>0&&!arr(r.requires).length);
 const unlocks=new Map();
 for(const [id,r] of Object.entries(data.researchRules))for(const k of arr(r.unlocks)){if(!unlocks.has(k))unlocks.set(k,[]);unlocks.get(k).push(id);}
 return w=>{
  if(!w.researched.size)return [];
  const actions=[],samples=new Set(),functions=new Set();
  for(const [id,r] of rules){
   if(w.researched.has(id)||w.disabled.has(id))continue;
   if(!arr(r.dependencies).every(k=>w.researched.has(k))&&!arr(unlocks.get(id)).some(k=>w.researched.has(k)))continue;
   if(r.needItem&&!(w.items[r.neededItem||id]>0))samples.add(r.neededItem||id);
   for(const f of arr(r.requiresBaseFunc))if(!w.baseFunctions.has(f))functions.add(f);
  }
  for(const [id,r] of Object.entries(data.campaignAssets.facilities)){
   if(w.facilities.has(id)||arr(r.buildOverFacilities).length||!arr(r.provideBaseFunc).some(f=>functions.has(f)))continue;
   if(!arr(r.requires).every(k=>active(w,k))||!arr(r.requiresBaseFunc).every(k=>w.baseFunctions.has(k)))continue;
   let mats;try{mats=facilityMaterials(r);}catch{continue;}
   for(const [k,n] of Object.entries(mats))if((w.items[k]||0)<n)samples.add(k);
   if(Object.entries(mats).every(([k,n])=>(w.items[k]||0)>=n))actions.push({type:'acquireFacility',id});
  }
  for(const item of [...samples].sort()){
   try{purchaseVerdict(w,item,1,data);actions.push({type:'acquirePurchase',item,count:1});}catch{}
   for(const r of arr(data.itemSupply?.[item]?.manufacture)){
    if(!r.id||r.weight!==undefined||!arr(r.requires).every(k=>active(w,k))||!arr(r.requiresBaseFunc).every(k=>w.baseFunctions.has(k)))continue;
    if(!Object.entries(r.requiredItems||{}).every(([k,n])=>(w.items[k]||0)>=n))continue;
    actions.push({type:'manufacture',item,recipe:r.id,count:1});
   }
  }
  for(const [research,sources] of Object.entries(data.eventResearchSources||{})){
   if(w.researched.has(research)||w.disabled.has(research))continue;
   for(const s of arr(sources)){
    if(w.generatedEvents?.[s.event])continue;
    for(const script of arr(s.scripts)){
     if(!arr(script.researchPositive).every(k=>active(w,k)))continue;
     const fixed=START_EVENT_RULES[s.event];
     const spec=fixed?.scripts.find(x=>x.script===script.script)||script;
     const v=eventScriptVerdict({...spec,eventId:s.event},w,{mode:'current'});
     if(v.blocked.length||v.unknown.length)continue;
     actions.push({type:'eventResearch',event:s.event,script:script.script,research,assumeOutcome:true});
    }
   }
  }
  return actions;
 };
}
