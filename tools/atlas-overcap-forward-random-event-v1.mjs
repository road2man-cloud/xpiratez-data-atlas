// V152: source-bound conditional random-item events. Deliberately restricted
// to raw events with exactly one randomItemList selection and no other effects.
// No fabricated capture, no repeated event occurrence, no unconditional RNG.
import assert from 'node:assert/strict';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const arr=x=>Array.isArray(x)?x:[];
const map={researchTriggers:'research',itemTriggers:'item',facilityTriggers:'facility',soldierTypeTriggers:'soldierType',xcomBaseInRegionTriggers:'region',xcomBaseInCountryTriggers:'country',pactTriggers:'pact'};
const conditionKeys=new Set(['firstMonth','lastMonth','executionOdds','minDifficulty','maxDifficulty']);
const rawKeys=new Set(['name','description','background','music','randomItemList','timer','timerRandom']);
const scriptKeys=new Set(['id','conditions','triggerMaps','eventWeights']);
export function createRandomItemEventAdapter(data,rawEvent,source){
 const id=rawEvent.id,r=rawEvent.raw;
 assert(r.name===id&&Object.keys(r).every(k=>rawKeys.has(k)),'Unsupported event side effect');
 const pool=r.randomItemList;
 assert(Array.isArray(pool)&&pool.length>1&&new Set(pool).size===pool.length&&pool.every(k=>typeof k==='string'));
 assert(Number.isSafeInteger(r.timer)&&r.timer>=0&&Number.isSafeInteger(r.timerRandom)&&r.timerRandom>=0);
 const scripts=[];
 for(const x of arr(rawEvent.scripts)){
  const c=x.conditions||{},t=x.triggerMaps||{};
  if(Object.keys(c).some(k=>!conditionKeys.has(k))||Object.keys(t).some(k=>!map[k]))continue;
  const weights=arr(x.eventWeights).map(b=>({month:Number(b.bucket),weight:arr(b.entries).find(e=>e.eventId===id)?.weight||0,totalWeight:b.totalWeight}));
  if(!weights.length||weights.some(b=>!Number.isSafeInteger(b.month)||!Number.isSafeInteger(b.weight)||!Number.isSafeInteger(b.totalWeight)||b.weight<0||b.totalWeight<b.weight)||!weights.some(b=>b.weight>0))continue;
  const s={script:x.id,mode:'weighted',eventId:id,monthWeights:weights,firstMonth:c.firstMonth??0,lastMonth:c.lastMonth??null,executionOdds:c.executionOdds??100,otherConditions:Object.fromEntries(Object.entries(c).filter(([k])=>!['firstMonth','lastMonth','executionOdds'].includes(k)))};
  for(const [k,name] of Object.entries(map)){assert(arr(t[k]).every(x=>typeof x.value==='boolean'));s[name+'Positive']=arr(t[k]).filter(x=>x.value).map(x=>x.id);s[name+'Negative']=arr(t[k]).filter(x=>!x.value).map(x=>x.id);}
  scripts.push(s);
 }
 assert(scripts.length,'No supported event script');
 function options(s,item){
  const w=s.world;
  if(!s.root||w.pendingFree||w.forwardDeliveries?.length||w.generatedEvents[id]||!pool.includes(item))return [];
  // Require the independent item index to identify the same event/pool.
  const grants=arr(data.itemSupply?.[item]?.eventGrants).filter(g=>g.event===id&&arr(g.grants).length===1&&g.grants[0].mode==='randomOneOf'&&g.grants[0].choices===pool.length);
  if(grants.length!==1)return [];
  const out=[];
  for(const script of scripts){
   if(!arr(grants[0].scriptIds).includes(script.script))continue;
   const v=eventScriptVerdict(script,{...w,triggerItems:w.otherItems==null?null:{...w.otherItems,...w.items},triggerFacilities:w.globalFacilities??null},{mode:'current'});
   if(v.kind==='blocked'||v.unknown.length||v.pending.some(x=>x.includes('카운터')))continue;
   const action={type:'sourceRandomEventItem',event:id,script:script.script,item,count:1,assumeOutcome:true};
   const evidence={kind:'RAW_RANDOM_ITEM_LIST_CONDITIONAL',source,event:id,poolSize:pool.length,item,script:script.script,executionOdds:script.executionOdds,weight:v.weight,totalWeight:v.totalWeight,pending:v.pending,timer:r.timer,timerRandom:r.timerRandom};
   out.push({action,evidence});
  }
  return out;
 }
 function apply(s,action){
  const o=options(s,action.item).find(x=>JSON.stringify(x.action)===JSON.stringify(action));assert(o,'Random event not currently eligible');
  const w=structuredClone(s.world);
  w.generatedEvents[id]=1;
  w.forwardDeliveries=[...arr(w.forwardDeliveries),{kind:'event',source:id,item:action.item,count:1}];
  return {...s,world:w,actions:[...s.actions,action],trace:[...s.trace,{action,evidence:o.evidence,stateHash:exactStateHash(w),balance:w.funds,conditional:true}]};
 }
 return {options,apply,pool,scripts,source};
}
