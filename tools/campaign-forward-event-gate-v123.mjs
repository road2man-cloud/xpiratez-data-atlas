// V123: validate event actions against the hashed raw rule and indexed script.
// Only fixed single research awards and fixed inventory/funds/score rewards are supported.
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
import {START_EVENT_RULES} from '../public/soldiers/modern/campaign-start-event-rules-v1.js';
import {applyCampaignStartStep} from '../public/soldiers/modern/campaign-start-gate-v1.js';
const arr=x=>Array.isArray(x)?x:[];
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const eventFields=new Set(['name','type','description','background','music','researchList','timer','timerRandom','points','funds','everyItemList','everyMultiItemList']);
const scriptFields=new Set(['type','name','eventWeights','oneTimeRandomEvents','oneTimeSequentialEvents','firstMonth','lastMonth','executionOdds','researchTriggers','itemTriggers','facilityTriggers','soldierTypeTriggers','xcomBaseInRegionTriggers','xcomBaseInCountryTriggers','pactTriggers','minDifficulty','maxDifficulty','minScore','maxScore','minFunds','maxFunds']);
const triggerMap={researchTriggers:'research',itemTriggers:'item',facilityTriggers:'facility',soldierTypeTriggers:'soldierType',xcomBaseInRegionTriggers:'region',xcomBaseInCountryTriggers:'country',pactTriggers:'pact'};
export function createEventGate(data,{events,eventScripts,files}){
 function inspect(w,a){
  const e=events[a.event],s=eventScripts[a.script];
  const ix=arr(data.eventResearchSources?.[a.research]).find(x=>x.event===a.event);
  const spec=arr(ix?.scripts).find(x=>x.script===a.script);
  if(!e||!s||!spec||a.assumeOutcome!==true||w.generatedEvents?.[a.event])throw Error('event-source-or-repeat-unresolved');
  if(Object.keys(e).some(k=>!eventFields.has(k))||Object.keys(s).some(k=>!scriptFields.has(k)))throw Error('unsupported-raw-event-field');
  if(!same(arr(e.researchList),[a.research]))throw Error('event-research-pool-unresolved');
  if(a.conditionalScoreThreshold)throw Error('event-score-history-not-integrated');
  if(!Number.isInteger(w.month))throw Error('event-month-unresolved');
  if(w.month<(s.firstMonth??0)||((s.lastMonth??-1)>=0&&w.month>s.lastMonth)||(s.executionOdds??100)<=0)throw Error('raw-event-month-or-odds');
  for(const [raw,field] of Object.entries(triggerMap)){
   const pairs=Object.entries(s[raw]||{});
   if(pairs.some(([,v])=>typeof v!=='boolean')||!same(pairs.filter(([,v])=>v).map(([k])=>k),arr(spec[field+'Positive']))||!same(pairs.filter(([,v])=>!v).map(([k])=>k),arr(spec[field+'Negative'])))throw Error('raw-event-trigger-mismatch:'+raw);
  }
  for(const k of ['minDifficulty','maxDifficulty','minScore','maxScore','minFunds','maxFunds'])if(s[k]!==undefined&&s[k]!==spec.otherConditions?.[k])throw Error('raw-event-condition-mismatch:'+k);
  if(s.eventWeights){
   const rows=Object.entries(s.eventWeights).map(([m,weights])=>({month:Number(m),weight:weights[a.event]||0,totalWeight:Object.values(weights).reduce((a,b)=>a+b,0)})).sort((a,b)=>a.month-b.month);
   const selected=rows.filter(x=>x.month<=w.month).at(-1);
   if(spec.mode!=='weighted'||!selected||selected.weight<=0||!same(rows.map(JSON.stringify),arr(spec.monthWeights).map(JSON.stringify)))throw Error('raw-event-weight-mismatch');
  }else if(s.oneTimeRandomEvents){
   if(spec.mode!=='oneTimeRandom'||!(s.oneTimeRandomEvents[a.event]>0)||s.oneTimeRandomEvents[a.event]!==spec.oneTimeWeight)throw Error('raw-event-random-mismatch');
  }else throw Error('raw-event-mode-unresolved');
  const triggerItems={...w.otherItems};for(const [k,n] of Object.entries(w.items))triggerItems[k]=(triggerItems[k]||0)+n;
  const v=eventScriptVerdict({...spec,eventId:a.event},{...w,triggerItems,triggerFacilities:w.globalFacilities},{mode:'current'});
  if(v.blocked.length||v.unknown.length)throw Error([...v.blocked,...v.unknown].join('; '));
  const rewards={};for(const k of arr(e.everyItemList))rewards[k]=(rewards[k]||0)+1;
  for(const [k,n] of Object.entries(e.everyMultiItemList||{}))rewards[k]=(rewards[k]||0)+n;
  for(const [k,n] of Object.entries(rewards))if(!data.campaignAssets.items[k]||!Number.isSafeInteger(n)||n<=0)throw Error('event-item-rule-unresolved:'+k);
  if(!Number.isSafeInteger(e.funds??0)||!Number.isSafeInteger(e.points??0))throw Error('event-economic-rule-unresolved');
  if(a.fixedEventBundle){
   const f=a.fixedEventBundle;
   if(f.sourceFileSha256!==files['Piratez_Events.rul']||Object.keys(rewards).length!==1||rewards[f.item]!==f.count)throw Error('legacy-event-bundle-mismatch');
  }
  const builtIn=START_EVENT_RULES[a.event];
  if(builtIn&&(!same(Object.entries(rewards).map(JSON.stringify),Object.entries(builtIn.items).map(JSON.stringify))||builtIn.funds!==(e.funds??0)||builtIn.points!==(e.points??0)))throw Error('builtin-event-bundle-mismatch');
  return {e,rewards,builtIn,notes:v.pending||[],positive:arr(spec.researchPositive).length};
 }
 function apply(w,a){
  if(a.type!=='eventResearch'){
   if(a.type.startsWith('conditional')&&!['conditionalCapGrowth','conditionalPromotion','conditionalMedal'].includes(a.type))return {ok:false,reason:'legacy-special-action-not-integrated:'+a.type};
   return applyCampaignStartStep(w,a,data);
  }
  try{
   const {e,rewards,builtIn,notes}=inspect(w,a);
   const res=applyCampaignStartStep(w,a,data);if(!res.ok)return res;
   if(!builtIn){
    for(const [k,n] of Object.entries(rewards))res.world.items[k]=(res.world.items[k]||0)+n;
    if(Number.isFinite(res.world.score))res.world.score+=e.points??0;
    if(!Number.isSafeInteger(res.world.funds+(e.funds??0))||res.world.funds+(e.funds??0)<0)throw Error('event-funds-unresolved');
    res.world.funds+=e.funds??0;
   }
   return {...res,assumed:true,notes:[...(res.notes||[]),...notes,'raw-fixed-event-bundle:'+a.event,'scheduler-and-native-receipt-unproven']};
  }catch(err){return {ok:false,reason:String(err.message||err)};}
 }
 return {inspect,apply};
}
